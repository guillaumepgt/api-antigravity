use crate::agy::{self, ChatRequest};
use crate::config::Config;
use async_stream::stream;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{
        sse::{KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
};
use axum::response::sse::Event;
use futures_util::Stream;
use serde::Deserialize;
use serde_json::json;
use std::convert::Infallible;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tracing::info;

fn generate_id() -> String {
    use std::fs::File;
    use std::io::Read;
    let mut bytes = [0u8; 12];
    if let Ok(mut f) = File::open("/dev/urandom") {
        let _ = f.read_exact(&mut bytes);
    } else {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        return format!("{:x}", ts);
    }
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn map_model(input: Option<&str>) -> String {
    let m = input.unwrap_or("gemini-3.8-flash-high").to_lowercase();
    if m.contains("sonnet") || m.contains("claude") {
        "claude-sonnet-4-6".to_string()
    } else if m.contains("opus") {
        "claude-opus-4-6-thinking".to_string()
    } else if m.contains("gpt") || m.contains("oss") {
        "gpt-oss-120b-medium".to_string()
    } else {
        "gemini-3.8-flash-high".to_string()
    }
}

fn extract_text_from_json(val: &serde_json::Value) -> String {
    if let Some(s) = val.as_str() {
        return s.to_string();
    }
    if let Some(arr) = val.as_array() {
        let mut out = Vec::new();
        for item in arr {
            if let Some(t) = item.get("text").and_then(|t| t.as_str()) {
                out.push(t.to_string());
            } else if let Some(c) = item.get("content").and_then(|c| c.as_str()) {
                out.push(c.to_string());
            } else if let Some(c_arr) = item.get("content").and_then(|c| c.as_array()) {
                for sub in c_arr {
                    if let Some(t) = sub.get("text").and_then(|t| t.as_str()) {
                        out.push(t.to_string());
                    }
                }
            }
        }
        return out.join("\n");
    }
    if let Some(obj) = val.as_object() {
        if let Some(t) = obj.get("text").and_then(|t| t.as_str()) {
            return t.to_string();
        }
        if let Some(c) = obj.get("content").and_then(|c| c.as_str()) {
            return c.to_string();
        }
    }
    String::new()
}

// ========================================================
// 1. OpenAI Compatibility Types & Handlers
// ========================================================

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct OpenAIChatRequest {
    pub model: Option<String>,
    pub messages: Vec<OpenAIMessage>,
    #[serde(default)]
    pub stream: bool,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct OpenAIMessage {
    pub role: String,
    pub content: serde_json::Value,
}

fn extract_prompt_from_openai(messages: &[OpenAIMessage]) -> String {
    if messages.is_empty() {
        return String::new();
    }
    if messages.len() == 1 {
        return extract_text_from_json(&messages[0].content);
    }
    let mut parts = Vec::new();
    for msg in messages {
        let text = extract_text_from_json(&msg.content);
        if text.is_empty() {
            continue;
        }
        match msg.role.as_str() {
            "system" => parts.push(format!("Instructions:\n{}", text)),
            "user" => parts.push(format!("User:\n{}", text)),
            "assistant" => parts.push(format!("Assistant:\n{}", text)),
            _ => parts.push(format!("{}:\n{}", msg.role, text)),
        }
    }
    parts.join("\n\n")
}

pub async fn openai_chat_completions(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Json(payload): Json<OpenAIChatRequest>,
) -> Response {
    let user = crate::auth::extract_user_from_headers(&headers, None);
    let prompt = extract_prompt_from_openai(&payload.messages);
    let chosen_model = map_model(payload.model.as_deref());

    info!(
        "OpenAI chat completion request for user '{}': model={}, stream={}, prompt_len={}",
        user, chosen_model, payload.stream, prompt.len()
    );

    let chat_req = ChatRequest {
        prompt,
        conversation_id: None,
        model: Some(chosen_model.clone()),
        mode: None,
        effort: None,
        dangerously_skip_permissions: true,
        stream: payload.stream,
    };

    if payload.stream {
        let stream = spawn_openai_stream((*config).clone(), Some(user), chat_req, chosen_model);
        Sse::new(stream)
            .keep_alive(KeepAlive::default())
            .into_response()
    } else {
        match agy::execute_chat_sync(&config, Some(&user), &chat_req).await {
            Ok(result) => {
                let text = result
                    .get("response")
                    .and_then(|r| r.as_str())
                    .or_else(|| result.get("content").and_then(|c| c.as_str()))
                    .unwrap_or("")
                    .to_string();

                let prompt_tokens = result
                    .get("usage")
                    .and_then(|u| u.get("prompt_tokens"))
                    .and_then(|t| t.as_u64())
                    .unwrap_or(10);
                let completion_tokens = result
                    .get("usage")
                    .and_then(|u| u.get("completion_tokens"))
                    .and_then(|t| t.as_u64())
                    .unwrap_or(20);

                let id = format!("chatcmpl-{}", generate_id());
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                (
                    StatusCode::OK,
                    Json(json!({
                        "id": id,
                        "object": "chat.completion",
                        "created": now,
                        "model": chosen_model,
                        "choices": [
                            {
                                "index": 0,
                                "message": {
                                    "role": "assistant",
                                    "content": text
                                },
                                "finish_reason": "stop"
                            }
                        ],
                        "usage": {
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": prompt_tokens + completion_tokens
                        }
                    })),
                )
                    .into_response()
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": {
                        "message": e,
                        "type": "server_error"
                    }
                })),
            )
                .into_response(),
        }
    }
}

fn spawn_openai_stream(
    config: Config,
    user: Option<String>,
    req: ChatRequest,
    model: String,
) -> impl Stream<Item = Result<Event, Infallible>> {
    stream! {
        let user_ref = user.as_deref();
        config.ensure_user_dirs(user_ref);
        let id = format!("chatcmpl-{}", generate_id());
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut cmd = Command::new(&config.agy_bin);
        cmd.current_dir(config.get_user_workspace_dir(user_ref));
        cmd.env("HOME", config.get_user_home(user_ref));
        cmd.env("GEMINI_CLI_DIR", config.get_user_gemini_cli_dir(user_ref));
        cmd.env("GEMINI_FORCE_FILE_STORAGE", "true");
        cmd.arg("-p").arg(&req.prompt);
        cmd.arg("--output-format").arg("stream-json");
        if let Some(ref m) = req.model {
            cmd.arg("--model").arg(m);
        }
        cmd.arg("--dangerously-skip-permissions");
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let err_chunk = json!({
                    "error": { "message": format!("Failed to spawn agy: {}", e) }
                });
                yield Ok(Event::default().data(err_chunk.to_string()));
                return;
            }
        };

        let mut sent_any_delta = false;
        let mut final_response: Option<String> = None;

        if let Some(stdout) = child.stdout.take() {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let delta_opt = v.get("step_update")
                        .and_then(|su| su.get("text_delta"))
                        .and_then(|d| d.as_str())
                        .or_else(|| v.get("text_delta").and_then(|d| d.as_str()));

                    if let Some(delta) = delta_opt {
                        if !delta.is_empty() {
                            sent_any_delta = true;
                            let chunk = json!({
                                "id": &id,
                                "object": "chat.completion.chunk",
                                "created": now,
                                "model": &model,
                                "choices": [
                                    {
                                        "index": 0,
                                        "delta": { "content": delta },
                                        "finish_reason": null
                                    }
                                ]
                            });
                            yield Ok(Event::default().data(chunk.to_string()));
                        }
                    }

                    if let Some(res) = v.get("result") {
                        if let Some(resp) = res.get("response").and_then(|r| r.as_str()) {
                            final_response = Some(resp.to_string());
                        }
                    }
                }
            }
        }
        let _ = child.wait().await;

        if !sent_any_delta {
            if let Some(resp) = final_response {
                let chunk = json!({
                    "id": &id,
                    "object": "chat.completion.chunk",
                    "created": now,
                    "model": &model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": { "content": resp },
                            "finish_reason": null
                        }
                    ]
                });
                yield Ok(Event::default().data(chunk.to_string()));
            }
        }

        let final_chunk = json!({
            "id": &id,
            "object": "chat.completion.chunk",
            "created": now,
            "model": &model,
            "choices": [
                {
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }
            ]
        });
        yield Ok(Event::default().data(final_chunk.to_string()));
        yield Ok(Event::default().data("[DONE]"));
    }
}

// ========================================================
// 2. Anthropic (Claude Code) Compatibility Types & Handlers
// ========================================================

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct AnthropicRequest {
    pub model: Option<String>,
    pub messages: Vec<AnthropicMessage>,
    pub system: Option<serde_json::Value>,
    #[serde(default)]
    pub stream: bool,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct AnthropicMessage {
    pub role: String,
    pub content: serde_json::Value,
}

fn extract_prompt_from_anthropic(req: &AnthropicRequest) -> String {
    let mut parts = Vec::new();

    if let Some(ref sys) = req.system {
        let text = extract_text_from_json(sys);
        if !text.is_empty() {
            parts.push(format!("Instructions:\n{}", text));
        }
    }

    for msg in &req.messages {
        let text = extract_text_from_json(&msg.content);
        if text.is_empty() {
            continue;
        }
        match msg.role.as_str() {
            "user" => parts.push(format!("User:\n{}", text)),
            "assistant" => parts.push(format!("Assistant:\n{}", text)),
            _ => parts.push(format!("{}:\n{}", msg.role, text)),
        }
    }

    parts.join("\n\n")
}

pub async fn anthropic_messages(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Json(payload): Json<AnthropicRequest>,
) -> Response {
    let user = crate::auth::extract_user_from_headers(&headers, None);
    let prompt = extract_prompt_from_anthropic(&payload);
    let chosen_model = map_model(payload.model.as_deref());

    info!(
        "Anthropic messages request for user '{}': model={}, stream={}, prompt_len={}",
        user, chosen_model, payload.stream, prompt.len()
    );

    let chat_req = ChatRequest {
        prompt,
        conversation_id: None,
        model: Some(chosen_model.clone()),
        mode: None,
        effort: None,
        dangerously_skip_permissions: true,
        stream: payload.stream,
    };

    if payload.stream {
        let stream = spawn_anthropic_stream((*config).clone(), Some(user), chat_req, chosen_model);
        Sse::new(stream)
            .keep_alive(KeepAlive::default())
            .into_response()
    } else {
        match agy::execute_chat_sync(&config, Some(&user), &chat_req).await {
            Ok(result) => {
                let text = result
                    .get("response")
                    .and_then(|r| r.as_str())
                    .or_else(|| result.get("content").and_then(|c| c.as_str()))
                    .unwrap_or("")
                    .to_string();

                let prompt_tokens = result
                    .get("usage")
                    .and_then(|u| u.get("prompt_tokens"))
                    .and_then(|t| t.as_u64())
                    .unwrap_or(10);
                let completion_tokens = result
                    .get("usage")
                    .and_then(|u| u.get("completion_tokens"))
                    .and_then(|t| t.as_u64())
                    .unwrap_or(20);

                let id = format!("msg_{}", generate_id());

                (
                    StatusCode::OK,
                    Json(json!({
                        "id": id,
                        "type": "message",
                        "role": "assistant",
                        "model": chosen_model,
                        "content": [
                            {
                                "type": "text",
                                "text": text
                            }
                        ],
                        "stop_reason": "end_turn",
                        "stop_sequence": null,
                        "usage": {
                            "input_tokens": prompt_tokens,
                            "output_tokens": completion_tokens
                        }
                    })),
                )
                    .into_response()
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "type": "error",
                    "error": {
                        "type": "api_error",
                        "message": e
                    }
                })),
            )
                .into_response(),
        }
    }
}

fn spawn_anthropic_stream(
    config: Config,
    user: Option<String>,
    req: ChatRequest,
    model: String,
) -> impl Stream<Item = Result<Event, Infallible>> {
    stream! {
        let user_ref = user.as_deref();
        config.ensure_user_dirs(user_ref);
        let id = format!("msg_{}", generate_id());

        // 1. message_start
        yield Ok(Event::default().event("message_start").data(json!({
            "type": "message_start",
            "message": {
                "id": &id,
                "type": "message",
                "role": "assistant",
                "model": &model,
                "content": [],
                "stop_reason": null,
                "stop_sequence": null,
                "usage": { "input_tokens": 10, "output_tokens": 0 }
            }
        }).to_string()));

        // 2. content_block_start
        yield Ok(Event::default().event("content_block_start").data(json!({
            "type": "content_block_start",
            "index": 0,
            "content_block": { "type": "text", "text": "" }
        }).to_string()));

        // 3. Spawn process
        let mut cmd = Command::new(&config.agy_bin);
        cmd.current_dir(config.get_user_workspace_dir(user_ref));
        cmd.env("HOME", config.get_user_home(user_ref));
        cmd.env("GEMINI_CLI_DIR", config.get_user_gemini_cli_dir(user_ref));
        cmd.env("GEMINI_FORCE_FILE_STORAGE", "true");
        cmd.arg("-p").arg(&req.prompt);
        cmd.arg("--output-format").arg("stream-json");
        if let Some(ref m) = req.model {
            cmd.arg("--model").arg(m);
        }
        cmd.arg("--dangerously-skip-permissions");
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                yield Ok(Event::default().event("error").data(json!({
                    "type": "error",
                    "error": { "type": "api_error", "message": format!("Failed to spawn agy: {}", e) }
                }).to_string()));
                return;
            }
        };

        let mut sent_any_delta = false;
        let mut final_response: Option<String> = None;
        let mut output_tokens: u64 = 0;

        if let Some(stdout) = child.stdout.take() {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let delta_opt = v.get("step_update")
                        .and_then(|su| su.get("text_delta"))
                        .and_then(|d| d.as_str())
                        .or_else(|| v.get("text_delta").and_then(|d| d.as_str()));

                    if let Some(delta) = delta_opt {
                        if !delta.is_empty() {
                            sent_any_delta = true;
                            yield Ok(Event::default().event("content_block_delta").data(json!({
                                "type": "content_block_delta",
                                "index": 0,
                                "delta": { "type": "text_delta", "text": delta }
                            }).to_string()));
                        }
                    }

                    if let Some(res) = v.get("result") {
                        if let Some(resp) = res.get("response").and_then(|r| r.as_str()) {
                            final_response = Some(resp.to_string());
                        }
                        if let Some(tokens) = res.get("usage").and_then(|u| u.get("output_tokens")).and_then(|t| t.as_u64()) {
                            output_tokens = tokens;
                        }
                    }
                }
            }
        }
        let _ = child.wait().await;

        if !sent_any_delta {
            if let Some(resp) = final_response {
                yield Ok(Event::default().event("content_block_delta").data(json!({
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": { "type": "text_delta", "text": resp }
                }).to_string()));
            }
        }

        // 4. content_block_stop
        yield Ok(Event::default().event("content_block_stop").data(json!({
            "type": "content_block_stop",
            "index": 0
        }).to_string()));

        // 5. message_delta
        let final_tokens = if output_tokens > 0 { output_tokens } else { 20 };
        yield Ok(Event::default().event("message_delta").data(json!({
            "type": "message_delta",
            "delta": { "stop_reason": "end_turn", "stop_sequence": null },
            "usage": { "output_tokens": final_tokens }
        }).to_string()));

        // 6. message_stop
        yield Ok(Event::default().event("message_stop").data(json!({
            "type": "message_stop"
        }).to_string()));
    }
}

// ========================================================
// 3. Models Endpoint (OpenAI format)
// ========================================================

pub async fn list_models_openai(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let user = crate::auth::extract_user_from_headers(&headers, None);
    let models = agy::list_models(&config, Some(&user)).await;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let data: Vec<serde_json::Value> = models
        .into_iter()
        .map(|m| {
            json!({
                "id": m.id,
                "object": "model",
                "created": now,
                "owned_by": "antigravity"
            })
        })
        .collect();

    Json(json!({
        "object": "list",
        "data": data
    }))
}
