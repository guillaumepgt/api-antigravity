use crate::config::Config;
use async_stream::stream;
use axum::response::sse::Event;
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::process::Stdio;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatRequest {
    pub prompt: String,
    pub conversation_id: Option<String>,
    pub model: Option<String>,
    pub mode: Option<String>,
    pub effort: Option<String>,
    #[serde(default)]
    pub dangerously_skip_permissions: bool,
    #[serde(default = "default_true")]
    pub stream: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

pub async fn list_models(config: &Config) -> Vec<ModelInfo> {
    let mut cmd = Command::new(&config.agy_bin);
    cmd.arg("models");
    cmd.env("GEMINI_FORCE_FILE_STORAGE", "true");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    match cmd.output().await {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut models = Vec::new();

            for line in stdout.lines() {
                let trimmed = line.trim();
                // Skip loading spinner lines or empty lines
                if trimmed.is_empty() || trimmed.contains("Fetching available models") {
                    continue;
                }

                // Format: <id> <whitespace> <name>
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    let id = parts[0].to_string();
                    let name = parts[1..].join(" ");
                    models.push(ModelInfo { id, name });
                } else if parts.len() == 1 {
                    models.push(ModelInfo {
                        id: parts[0].to_string(),
                        name: parts[0].to_string(),
                    });
                }
            }

            if !models.is_empty() {
                return models;
            }
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!("Failed to fetch models via agy CLI: {}", stderr);
        }
        Err(e) => {
            warn!("Failed to execute agy binary: {}", e);
        }
    }

    // Default fallback models
    vec![
        ModelInfo {
            id: "gemini-3.8-flash-high".to_string(),
            name: "Gemini 3.8 Flash (High)".to_string(),
        },
        ModelInfo {
            id: "gemini-3.8-flash-medium".to_string(),
            name: "Gemini 3.8 Flash (Medium)".to_string(),
        },
        ModelInfo {
            id: "gemini-3.8-flash-low".to_string(),
            name: "Gemini 3.8 Flash (Low)".to_string(),
        },
        ModelInfo {
            id: "claude-sonnet-4-6".to_string(),
            name: "Claude Sonnet 4.6 (Thinking)".to_string(),
        },
        ModelInfo {
            id: "claude-opus-4-6-thinking".to_string(),
            name: "Claude Opus 4.6 (Thinking)".to_string(),
        },
        ModelInfo {
            id: "gpt-oss-120b-medium".to_string(),
            name: "GPT-OSS 120B (Medium)".to_string(),
        },
    ]
}

pub async fn execute_chat_sync(
    config: &Config,
    req: &ChatRequest,
) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new(&config.agy_bin);
    cmd.current_dir(&config.workspace_dir);
    cmd.env("GEMINI_FORCE_FILE_STORAGE", "true");
    cmd.arg("-p").arg(&req.prompt);
    cmd.arg("--output-format").arg("json");

    if let Some(ref cid) = req.conversation_id {
        if !cid.trim().is_empty() {
            cmd.arg("--conversation").arg(cid.trim());
        }
    }

    if let Some(ref model) = req.model {
        if !model.trim().is_empty() {
            cmd.arg("--model").arg(model.trim());
        }
    }

    if let Some(ref mode) = req.mode {
        if !mode.trim().is_empty() {
            cmd.arg("--mode").arg(mode.trim());
        }
    }

    if let Some(ref effort) = req.effort {
        if !effort.trim().is_empty() {
            cmd.arg("--effort").arg(effort.trim());
        }
    }

    if req.dangerously_skip_permissions {
        cmd.arg("--dangerously-skip-permissions");
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to spawn agy command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("agy exited with error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse agy JSON output: {} (raw: {})", e, stdout))
}

pub fn spawn_chat_stream(
    config: Config,
    req: ChatRequest,
) -> impl Stream<Item = Result<Event, Infallible>> {
    stream! {
        info!("Spawning streaming agy turn for prompt (len={})", req.prompt.len());

        let mut cmd = Command::new(&config.agy_bin);
        cmd.current_dir(&config.workspace_dir);
        cmd.env("GEMINI_FORCE_FILE_STORAGE", "true");
        cmd.arg("-p").arg(&req.prompt);
        cmd.arg("--output-format").arg("stream-json");

        if let Some(ref cid) = req.conversation_id {
            if !cid.trim().is_empty() {
                cmd.arg("--conversation").arg(cid.trim());
            }
        }

        if let Some(ref model) = req.model {
            if !model.trim().is_empty() {
                cmd.arg("--model").arg(model.trim());
            }
        }

        if let Some(ref mode) = req.mode {
            if !mode.trim().is_empty() {
                cmd.arg("--mode").arg(mode.trim());
            }
        }

        if let Some(ref effort) = req.effort {
            if !effort.trim().is_empty() {
                cmd.arg("--effort").arg(effort.trim());
            }
        }

        if req.dangerously_skip_permissions {
            cmd.arg("--dangerously-skip-permissions");
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(e) => {
                let err_msg = format!("Failed to spawn agy process: {}", e);
                error!("{}", err_msg);
                yield Ok(Event::default().event("error").data(serde_json::json!({
                    "error": err_msg
                }).to_string()));
                return;
            }
        };

        let stdout = child.stdout.take();
        if let Some(stdout) = stdout {
            let mut reader = tokio::io::BufReader::new(stdout).lines();

            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                // If it parses as JSON, inspect event type
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let event_type = v.get("event").and_then(|e| e.as_str()).unwrap_or("message");
                    yield Ok(Event::default().event(event_type).data(trimmed.to_string()));
                } else {
                    yield Ok(Event::default().event("raw").data(trimmed.to_string()));
                }
            }
        }

        // Wait for process termination
        let stderr = child.stderr.take();
        match child.wait().await {
            Ok(status) => {
                if !status.success() {
                    let mut stderr_msg = String::new();
                    if let Some(mut err_reader) = stderr {
                        let mut buf = Vec::new();
                        let _ = tokio::io::AsyncReadExt::read_to_end(&mut err_reader, &mut buf).await;
                        stderr_msg = String::from_utf8_lossy(&buf).trim().to_string();
                    }

                    let err_display = if stderr_msg.is_empty() {
                        format!("Process exited with status {:?}", status.code())
                    } else {
                        stderr_msg
                    };

                    warn!("agy child process error: {}", err_display);

                    yield Ok(Event::default().event("error").data(serde_json::json!({
                        "error": err_display,
                        "auth_required": err_display.contains("sign in") || err_display.contains("authentication required")
                    }).to_string()));

                    yield Ok(Event::default().event("exit").data(serde_json::json!({
                        "exit_code": status.code().unwrap_or(-1)
                    }).to_string()));
                } else {
                    yield Ok(Event::default().event("done").data("{\"status\": \"complete\"}"));
                }
            }
            Err(e) => {
                error!("Error waiting for agy child process: {}", e);
                yield Ok(Event::default().event("error").data(serde_json::json!({
                    "error": e.to_string()
                }).to_string()));
            }
        }
    }
}

pub async fn check_auth_status(config: &Config) -> bool {
    let mut cmd = Command::new(&config.agy_bin);
    cmd.arg("models");
    cmd.env("GEMINI_FORCE_FILE_STORAGE", "true");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    match cmd.output().await {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

