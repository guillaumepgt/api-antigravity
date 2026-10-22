use crate::agy::{self, ChatRequest};
use crate::auth;
use crate::config::Config;
use crate::conversations::{self};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{
        sse::{KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::TcpListener;
use std::sync::Arc;
use tokio::process::Command;
use tracing::{error, info, warn};

pub async fn health_check(State(config): State<Arc<Config>>) -> impl IntoResponse {
    let is_auth = agy::check_auth_status(&config).await;

    Json(json!({
        "status": "healthy",
        "service": "antigravity-api",
        "version": env!("CARGO_PKG_VERSION"),
        "authenticated": is_auth,
        "auth_enabled": config.api_key.is_some(),
        "workspace_dir": config.workspace_dir.to_string_lossy(),
        "agy_bin": config.agy_bin.to_string_lossy(),
    }))
}

pub async fn auth_status(State(config): State<Arc<Config>>) -> impl IntoResponse {
    let is_auth = agy::check_auth_status(&config).await;

    Json(json!({
        "authenticated": is_auth,
        "message": if is_auth {
            "Logged into Antigravity with your Google account."
        } else {
            "Not authenticated. Please connect your Google account via the terminal."
        },
        "terminal_url": "/terminal/"
    }))
}

pub async fn get_user_key(State(config): State<Arc<Config>>) -> impl IntoResponse {
    let is_auth = agy::check_auth_status(&config).await;
    let key = auth::get_or_create_user_api_key(&config);

    Json(json!({
        "api_key": key,
        "authenticated": is_auth,
        "prefix": "Bearer",
        "header": format!("Authorization: Bearer {}", key),
        "curl_example": format!(
            "curl -X POST http://localhost:8080/api/chat \\\n  -H 'Authorization: Bearer {}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{{\"prompt\": \"Bonjour Antigravity !\", \"stream\": false}}'",
            key
        ),
        "curl_stream_example": format!(
            "curl -N -X POST http://localhost:8080/api/chat \\\n  -H 'Authorization: Bearer {}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{{\"prompt\": \"Explique-moi ce code.\", \"stream\": true}}'",
            key
        ),
        "python_example": format!(
r#"import requests

url = "http://localhost:8080/api/chat"
headers = {{
    "Authorization": "Bearer {}",
    "Content-Type": "application/json"
}}
data = {{
    "prompt": "Bonjour Antigravity !",
    "stream": False
}}

response = requests.post(url, headers=headers, json=data)
print(response.json()["response"])"#,
            key
        )
    }))
}

pub async fn regenerate_user_key(State(config): State<Arc<Config>>) -> impl IntoResponse {
    let new_key = auth::regenerate_user_api_key(&config);
    info!("Clé API utilisateur régénérée");
    Json(json!({
        "status": "success",
        "api_key": new_key,
        "message": "Nouvelle clé API générée avec succès."
    }))
}

pub async fn get_models(State(config): State<Arc<Config>>) -> impl IntoResponse {
    let models = agy::list_models(&config).await;
    Json(json!({
        "models": models
    }))
}

pub async fn list_conversations(State(config): State<Arc<Config>>) -> impl IntoResponse {
    let convs = conversations::list_conversations(&config);
    Json(json!({
        "conversations": convs
    }))
}

pub async fn get_conversation_transcript(
    State(config): State<Arc<Config>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match conversations::get_conversation_transcript(&config, &id) {
        Ok(steps) => (StatusCode::OK, Json(json!({ "steps": steps }))).into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(json!({
                "error": "Not Found",
                "message": e
            })),
        )
            .into_response(),
    }
}

pub async fn handle_chat(
    State(config): State<Arc<Config>>,
    Json(payload): Json<ChatRequest>,
) -> Response {
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
        let stream = agy::spawn_chat_stream((*config).clone(), payload);
        Sse::new(stream)
            .keep_alive(KeepAlive::default())
            .into_response()
    } else {
        match agy::execute_chat_sync(&config, &payload).await {
            Ok(result) => (StatusCode::OK, Json(result)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Execution Failed",
                    "message": e
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

    // Stop and remove existing container with the same name if any
    let _ = Command::new("docker")
        .args(["rm", "-f", &container_name])
        .output()
        .await;

    // Launch new container
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
                    "terminal_url": format!("http://localhost:{}/terminal/", target_port),
                    "instructions": "Ouvrez cette URL pour vous connecter à votre propre compte Google personnel !"
                })),
            )
                .into_response()
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            error!("Failed to run docker container: {}", stderr);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Docker run failed",
                    "details": stderr.to_string(),
                    "command_hint": format!("docker run -d --name {} -p {}:8080 -v {}:/root/.gemini api-antigravity-backend:latest", container_name, target_port, volume_gemini)
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
