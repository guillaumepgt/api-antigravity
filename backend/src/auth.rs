use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
};
use serde_json::json;
use std::sync::Arc;
use crate::config::Config;

pub fn generate_secure_api_key() -> String {
    use std::fs::File;
    use std::io::Read;
    let mut bytes = [0u8; 24];
    if let Ok(mut f) = File::open("/dev/urandom") {
        let _ = f.read_exact(&mut bytes);
    } else {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        return format!("agy_sk_{:x}", ts);
    }
    let hex_str: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
    format!("agy_sk_{}", hex_str)
}

pub fn get_key_file_path(config: &Config) -> std::path::PathBuf {
    if let Some(parent) = config.gemini_cli_dir.parent() {
        parent.join("api_key.txt")
    } else {
        std::path::PathBuf::from("/root/.gemini/api_key.txt")
    }
}

pub fn get_or_create_user_api_key(config: &Config) -> String {
    let key_path = get_key_file_path(config);
    if let Ok(existing) = std::fs::read_to_string(&key_path) {
        let trimmed = existing.trim().to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    let new_key = generate_secure_api_key();
    if let Some(parent) = key_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&key_path, &new_key);
    new_key
}

pub fn regenerate_user_api_key(config: &Config) -> String {
    let key_path = get_key_file_path(config);
    let new_key = generate_secure_api_key();
    if let Some(parent) = key_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&key_path, &new_key);
    new_key
}

pub fn is_valid_token(config: &Config, token: &str) -> bool {
    let token = token.trim();
    if token.is_empty() {
        return false;
    }
    // Check config.api_key
    if let Some(ref expected) = config.api_key {
        if !expected.is_empty() && token == expected {
            return true;
        }
    }
    // Check user's persistent api_key.txt
    let key_path = get_key_file_path(config);
    if let Ok(user_key) = std::fs::read_to_string(&key_path) {
        let trimmed = user_key.trim();
        if !trimmed.is_empty() && token == trimmed {
            return true;
        }
    }
    false
}

pub async fn auth_middleware(
    config: axum::extract::State<Arc<Config>>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let path = req.uri().path();

    // Public endpoints that don't need authentication:
    if path == "/health"
        || path == "/"
        || path.starts_with("/terminal")
        || path.starts_with("/assets")
        || path == "/spawn"
        || path == "/launch.sh"
        || path == "/api/auth/status"
        || path == "/api/user/key"
    {
        return next.run(req).await;
    }

    // Determine if any auth key is active
    let has_global_key = config.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false);
    let key_path = get_key_file_path(&config);
    let has_user_key = key_path.exists();

    // If no key configured anywhere, allow
    if !has_global_key && !has_user_key {
        return next.run(req).await;
    }

    // Check Authorization header or X-API-Key header
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    let x_api_key_header = req
        .headers()
        .get("x-api-key")
        .and_then(|h| h.to_str().ok());

    let token = if let Some(h) = auth_header {
        if let Some(stripped) = h.strip_prefix("Bearer ") {
            stripped.trim()
        } else {
            h.trim()
        }
    } else if let Some(h) = x_api_key_header {
        h.trim()
    } else {
        ""
    };

    if is_valid_token(&config, token) {
        next.run(req).await
    } else {
        let error_body = Json(json!({
            "error": "Unauthorized",
            "message": "Clé API invalide ou manquante. Renseignez l'en-tête 'Authorization: Bearer <clé>' ou 'x-api-key: <clé>'."
        }));
        (StatusCode::UNAUTHORIZED, error_body).into_response()
    }
}
