use crate::agy::{self, ChatRequest};
use crate::auth;
use crate::config::Config;
use crate::conversations::{self};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{
        sse::{KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::process::Command;
use tracing::{error, info, warn};

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct UserQuery {
    pub user: Option<String>,
}

pub async fn health_check(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    let is_auth = agy::check_auth_status(&config, Some(&user)).await;

    Json(json!({
        "status": "healthy",
        "service": "antigravity-api",
        "version": env!("CARGO_PKG_VERSION"),
        "user": user,
        "authenticated": is_auth,
        "auth_enabled": config.api_key.is_some(),
        "workspace_dir": config.get_user_workspace_dir(Some(&user)).to_string_lossy(),
        "agy_bin": config.agy_bin.to_string_lossy(),
    }))
}

pub async fn auth_status(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    let is_auth = agy::check_auth_status(&config, Some(&user)).await;

    Json(json!({
        "user": user,
        "authenticated": is_auth,
        "message": if is_auth {
            "Connecté à Antigravity avec votre compte Google personnel."
        } else {
            "Non authentifié. Veuillez connecter votre compte Google personnel via le terminal."
        },
        "terminal_url": format!("/terminal/?arg={}", user)
    }))
}

#[derive(Debug, Deserialize)]
pub struct CheckLoginQuery {
    pub login_id: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyTicketQuery {
    pub ticket: String,
}

pub async fn start_login() -> impl IntoResponse {
    let login_id = format!("login_{}", auth::generate_secure_hex(8));
    let tmp_gemini = PathBuf::from("/workspace/tmp_logins").join(&login_id).join(".gemini").join("antigravity-cli");
    let _ = std::fs::create_dir_all(&tmp_gemini);

    let ticket = auth::create_terminal_ticket(auth::TerminalTarget::Login {
        login_id: login_id.clone(),
    });

    Json(json!({
        "login_id": login_id,
        "ticket": ticket,
        "terminal_url": format!("/terminal/?arg={}", ticket)
    }))
}

pub async fn check_login(
    State(config): State<Arc<Config>>,
    Query(query): Query<CheckLoginQuery>,
) -> impl IntoResponse {
    let safe_login = crate::config::sanitize_user(Some(&query.login_id));
    let login_cli_dir = PathBuf::from("/workspace/tmp_logins").join(&safe_login).join(".gemini").join("antigravity-cli");

    if let Some(email) = auth::extract_email_from_gemini_cli_dir(&login_cli_dir) {
        let mut user_id = auth::email_to_user_id(&email);
        let root_cli = PathBuf::from("/root/.gemini/antigravity-cli");
        if let Some(primary_email) = auth::extract_email_from_gemini_cli_dir(&root_cli) {
            if primary_email.eq_ignore_ascii_case(&email) {
                user_id = "default".to_string();
            }
        }
        let _dest_user_home = config.get_user_home(Some(&user_id));
        let dest_gemini_cli = config.get_user_gemini_cli_dir(Some(&user_id));
        let _ = std::fs::create_dir_all(&dest_gemini_cli);

        // Copy all files from temporary login directory to the user's permanent directory
        if let Ok(entries) = std::fs::read_dir(&login_cli_dir) {
            for entry in entries.flatten() {
                let src = entry.path();
                let dst = dest_gemini_cli.join(entry.file_name());
                let _ = std::fs::copy(&src, &dst);
            }
        }

        // Clean up temp directory
        let temp_dir = PathBuf::from("/workspace/tmp_logins").join(&safe_login);
        let _ = std::fs::remove_dir_all(&temp_dir);

        // Create persistent session
        let session = auth::create_session(&user_id, &email);

        info!("Google OAuth login completed for user '{}' (email: '{}')", user_id, email);

        Json(json!({
            "authenticated": true,
            "token": session.token,
            "email": session.email,
            "user_id": session.user_id
        }))
    } else {
        Json(json!({
            "authenticated": false,
            "message": "En attente de connexion Google dans le terminal..."
        }))
    }
}

pub async fn auth_me(
    State(_config): State<Arc<Config>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(token) = auth::extract_token_from_headers(&headers) {
        if let Some(session) = auth::get_session(&token) {
            return Json(json!({
                "authenticated": true,
                "email": session.email,
                "user_id": session.user_id,
                "token": session.token
            }));
        }
    }

    Json(json!({
        "authenticated": false
    }))
}

pub async fn auth_logout(
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(token) = auth::extract_token_from_headers(&headers) {
        auth::delete_session(&token);
    }

    let mut resp_headers = HeaderMap::new();
    if let Ok(c1) = "antigravity_session=; Path=/; Max-Age=0; SameSite=Lax".parse() {
        resp_headers.insert(header::SET_COOKIE, c1);
    }
    if let Ok(c2) = "antigravity_token=; Path=/; Max-Age=0; SameSite=Lax".parse() {
        resp_headers.append(header::SET_COOKIE, c2);
    }

    (
        resp_headers,
        Json(json!({
            "status": "logged_out",
            "message": "Déconnexion réussie."
        })),
    )
}

pub async fn create_user_terminal_token(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let token = auth::extract_token_from_headers(&headers)
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({ "error": "Non authentifié" }))))?;

    let session = auth::get_session_or_key(&config, &token)
        .ok_or((StatusCode::UNAUTHORIZED, Json(json!({ "error": "Session invalide" }))))?;

    let home = config.get_user_home(Some(&session.user_id));
    let gemini_cli = config.get_user_gemini_cli_dir(Some(&session.user_id));
    let ws = config.get_user_workspace_dir(Some(&session.user_id));

    let ticket = auth::create_terminal_ticket(auth::TerminalTarget::User {
        user_id: session.user_id,
        email: session.email,
        home: home.to_string_lossy().to_string(),
        gemini_cli: gemini_cli.to_string_lossy().to_string(),
        workspace: ws.to_string_lossy().to_string(),
    });

    Ok(Json(json!({
        "ticket": ticket,
        "terminal_url": format!("/terminal/?arg={}", ticket)
    })))
}

pub async fn verify_terminal_ticket(
    Query(query): Query<VerifyTicketQuery>,
) -> impl IntoResponse {
    if let Some(target) = auth::consume_terminal_ticket(&query.ticket) {
        match target {
            auth::TerminalTarget::Login { login_id } => {
                Json(json!({
                    "valid": true,
                    "type": "login",
                    "home": format!("/workspace/tmp_logins/{}", login_id),
                    "gemini_cli_dir": format!("/workspace/tmp_logins/{}/.gemini/antigravity-cli", login_id),
                    "workspace_dir": format!("/workspace/tmp_logins/{}/workspace", login_id)
                }))
            }
            auth::TerminalTarget::User { user_id, email, home, gemini_cli, workspace } => {
                Json(json!({
                    "valid": true,
                    "type": "user",
                    "user_id": user_id,
                    "email": email,
                    "home": home,
                    "gemini_cli_dir": gemini_cli,
                    "workspace_dir": workspace
                }))
            }
        }
    } else {
        Json(json!({
            "valid": false,
            "error": "Ticket de terminal invalide ou expiré."
        }))
    }
}

pub async fn get_user_key(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    let is_auth = agy::check_auth_status(&config, Some(&user)).await;
    let key = auth::get_or_create_user_api_key(&config, Some(&user));

    Json(json!({
        "user": user,
        "api_key": key,
        "authenticated": is_auth,
        "prefix": "Bearer",
        "header": format!("Authorization: Bearer {}", key),
        "curl_example": format!(
            "curl -X POST http://localhost:8080/api/chat \\\n  -H 'Authorization: Bearer {}' \\\n  -H 'X-User-Id: {}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{{\"prompt\": \"Bonjour Antigravity !\", \"stream\": false}}'",
            key, user
        ),
        "curl_stream_example": format!(
            "curl -N -X POST http://localhost:8080/api/chat \\\n  -H 'Authorization: Bearer {}' \\\n  -H 'X-User-Id: {}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{{\"prompt\": \"Explique-moi ce code.\", \"stream\": true}}'",
            key, user
        )
    }))
}

pub async fn regenerate_user_key(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    let new_key = auth::regenerate_user_api_key(&config, Some(&user));
    info!("Clé API régénérée pour l'utilisateur '{}'", user);
    Json(json!({
        "status": "success",
        "user": user,
        "api_key": new_key,
        "message": "Nouvelle clé API générée avec succès."
    }))
}

pub async fn get_models(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    let models = agy::list_models(&config, Some(&user)).await;
    Json(json!({
        "user": user,
        "models": models
    }))
}

pub async fn list_conversations(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    let convs = conversations::list_conversations(&config, Some(&user));
    Json(json!({
        "user": user,
        "conversations": convs
    }))
}

pub async fn get_conversation_transcript(
    State(config): State<Arc<Config>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    match conversations::get_conversation_transcript(&config, Some(&user), &id) {
        Ok(steps) => (StatusCode::OK, Json(json!({ "user": user, "steps": steps }))).into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(json!({
                "error": "Not Found",
                "message": e,
                "user": user
            })),
        )
            .into_response(),
    }
}

pub async fn delete_conversation(
    State(config): State<Arc<Config>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    match conversations::delete_conversation(&config, Some(&user), &id) {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "deleted",
                "conversation_id": id,
                "user": user
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": "Failed to delete conversation",
                "message": e,
                "user": user
            })),
        )
            .into_response(),
    }
}

pub async fn clear_conversations(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> impl IntoResponse {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    match conversations::clear_all_conversations(&config, Some(&user)) {
        Ok(count) => (
            StatusCode::OK,
            Json(json!({
                "status": "cleared",
                "deleted_count": count,
                "user": user
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": "Failed to clear conversations",
                "message": e,
                "user": user
            })),
        )
            .into_response(),
    }
}

pub async fn handle_chat(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
    Json(payload): Json<ChatRequest>,
) -> Response {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    if payload.prompt.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Bad Request",
                "message": "Prompt cannot be empty"
            })),
        )
            .into_response();
    }

    if payload.stream {
        let stream = agy::spawn_chat_stream((*config).clone(), Some(user), payload);
        Sse::new(stream)
            .keep_alive(KeepAlive::default())
            .into_response()
    } else {
        match agy::execute_chat_sync(&config, Some(&user), &payload).await {
            Ok(result) => (StatusCode::OK, Json(result)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Execution Failed",
                    "message": e,
                    "user": user
                })),
            )
                .into_response(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SpawnQuery {
    pub user: Option<String>,
    pub port: Option<u16>,
}

fn find_available_port(start: u16, end: u16) -> Option<u16> {
    for port in start..=end {
        if TcpListener::bind(("0.0.0.0", port)).is_ok() {
            return Some(port);
        }
    }
    None
}

pub async fn spawn_instance_handler(
    State(_config): State<Arc<Config>>,
    Query(query): Query<SpawnQuery>,
) -> Response {
    let raw_user = query.user.unwrap_or_else(|| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format!("user_{}", ts % 100000)
    });

    let safe_user: String = raw_user
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();

    let safe_user = if safe_user.is_empty() {
        "user_default".to_string()
    } else {
        safe_user
    };

    let target_port = query.port.or_else(|| find_available_port(3001, 3999)).unwrap_or(3001);
    let container_name = format!("antigravity-{}", safe_user);
    let volume_gemini = format!("gemini_data_{}", safe_user);
    let volume_workspace = format!("workspace_{}", safe_user);

    info!(
        "Spawning Docker container '{}' for user '{}' on port {}",
        container_name, safe_user, target_port
    );

    let _ = Command::new("docker")
        .args(["rm", "-f", &container_name])
        .output()
        .await;

    let mut cmd = Command::new("docker");
    cmd.args([
        "run",
        "-d",
        "--name",
        &container_name,
        "-p",
        &format!("{}:8080", target_port),
        "-v",
        &format!("{}:/root/.gemini", volume_gemini),
        "-v",
        &format!("{}:/workspace", volume_workspace),
        "-e",
        "GEMINI_FORCE_FILE_STORAGE=true",
        "-e",
        "TZ=UTC",
        "--restart",
        "unless-stopped",
        "api-antigravity-backend:latest",
    ]);

    match cmd.output().await {
        Ok(out) if out.status.success() => {
            let container_id = String::from_utf8_lossy(&out.stdout).trim().to_string();
            info!("Container spawned successfully: {}", container_id);

            (
                StatusCode::OK,
                Json(json!({
                    "status": "ready",
                    "container_id": container_id,
                    "container_name": container_name,
                    "user": safe_user,
                    "port": target_port,
                    "url": format!("http://localhost:{}", target_port),
                    "instructions": format!(
                        "Votre Antigravity privé est prêt ! Ouvrez http://localhost:{} et connectez votre compte Google.",
                        target_port
                    )
                })),
            )
                .into_response()
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            error!("Docker run failed: {}", stderr);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Failed to launch container",
                    "details": stderr
                })),
            )
                .into_response()
        }
        Err(e) => {
            warn!("Docker command execution error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Docker command not available",
                    "details": e.to_string(),
                    "instructions": "Assurez-vous que /var/run/docker.sock est monté dans le conteneur."
                })),
            )
                .into_response()
        }
    }
}

pub async fn launch_script() -> impl IntoResponse {
    let script = r#"#!/usr/bin/env bash
set -euo pipefail

USER_NAME="${1:-user-$(date +%s)}"
PORT="${2:-3001}"

echo "========================================================="
echo "  🚀 Lancement de votre Antigravity personnel (Docker)   "
echo "========================================================="
echo ""
echo "👤 Utilisateur: ${USER_NAME}"
echo "🔌 Port d'accès: ${PORT}"
echo ""

if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Erreur: Docker n'est pas installé sur cette machine."
    exit 1
fi

VOLUME_NAME="gemini_data_${USER_NAME}"
CONTAINER_NAME="antigravity-${USER_NAME}"

echo "📦 Démarrage du conteneur..."
docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

docker run -d \
  --name "${CONTAINER_NAME}" \
  -p "${PORT}:8080" \
  -v "${VOLUME_NAME}:/root/.gemini" \
  -v "${CONTAINER_NAME}_workspace:/workspace" \
  --restart unless-stopped \
  api-antigravity-backend:latest

echo ""
echo "✅ Antigravity est prêt !"
echo ""
echo "👉 Ouvrez votre navigateur sur: http://localhost:${PORT}"
echo "👉 Connectez-vous avec votre compte Google personnel (gratuit, aucune clé API requise)."
echo "========================================================="
"#;

    ([(axum::http::header::CONTENT_TYPE, "text/x-shellscript; charset=utf-8")], script)
}

#[derive(Debug, Deserialize, Default)]
pub struct McpTogglePayload {
    pub disabled: Option<bool>,
}

pub async fn list_mcp_servers(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
) -> Response {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    let servers = crate::mcp::list_servers(&config, Some(&user));
    Json(json!({ "servers": servers })).into_response()
}

pub async fn list_mcp_presets() -> Response {
    let presets = crate::mcp::get_builtin_presets();
    Json(json!({ "presets": presets })).into_response()
}

pub async fn add_mcp_server(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Query(query): Query<UserQuery>,
    Json(payload): Json<crate::mcp::McpServerConfig>,
) -> Response {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    match crate::mcp::upsert_server(&config, Some(&user), payload.clone()) {
        Ok(_) => Json(json!({ "status": "ok", "server": payload })).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Bad Request", "message": e })),
        )
            .into_response(),
    }
}

pub async fn delete_mcp_server(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<UserQuery>,
) -> Response {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    match crate::mcp::remove_server(&config, Some(&user), &name) {
        Ok(_) => Json(json!({ "status": "ok", "removed": name })).into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Not Found", "message": e })),
        )
            .into_response(),
    }
}

pub async fn toggle_mcp_server(
    State(config): State<Arc<Config>>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<UserQuery>,
    payload: Option<Json<McpTogglePayload>>,
) -> Response {
    let user = auth::extract_user_from_headers(&headers, query.user.as_deref());
    let target_state = payload.and_then(|p| p.disabled);
    match crate::mcp::toggle_server(&config, Some(&user), &name, target_state) {
        Ok(disabled) => Json(json!({ "status": "ok", "name": name, "disabled": disabled })).into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Not Found", "message": e })),
        )
            .into_response(),
    }
}

