use axum::{
    body::Body,
    extract::Request,
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, RwLock};
use crate::config::Config;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserSession {
    pub token: String,
    pub user_id: String,
    pub email: String,
    pub created_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TerminalTarget {
    Login { login_id: String },
    User {
        user_id: String,
        email: String,
        home: String,
        gemini_cli: String,
        workspace: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TerminalTicket {
    pub ticket: String,
    pub target: TerminalTarget,
    pub expires_at: u64,
}

static SESSIONS: LazyLock<RwLock<HashMap<String, UserSession>>> = LazyLock::new(|| {
    let mut map = HashMap::new();
    let path = Path::new("/workspace/sessions.json");
    if let Ok(data) = std::fs::read_to_string(path) {
        if let Ok(loaded) = serde_json::from_str::<HashMap<String, UserSession>>(&data) {
            map = loaded;
        }
    }
    RwLock::new(map)
});

static TICKETS: LazyLock<RwLock<HashMap<String, TerminalTicket>>> = LazyLock::new(|| {
    RwLock::new(HashMap::new())
});

fn save_sessions(sessions: &HashMap<String, UserSession>) {
    let path = Path::new("/workspace/sessions.json");
    if let Ok(json) = serde_json::to_string_pretty(sessions) {
        let _ = std::fs::write(path, json);
    }
}

pub fn generate_secure_hex(num_bytes: usize) -> String {
    use std::fs::File;
    use std::io::Read;
    let mut bytes = vec![0u8; num_bytes];
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

pub fn generate_secure_api_key() -> String {
    format!("agy_sk_{}", generate_secure_hex(24))
}

pub fn extract_email_from_gemini_cli_dir(dir: &Path) -> Option<String> {
    let token_file = dir.join("antigravity-oauth-token");
    if let Ok(content) = std::fs::read_to_string(&token_file) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(email) = val.get("id_token_email").and_then(|e| e.as_str()) {
                let trimmed = email.trim().to_lowercase();
                if !trimmed.is_empty() {
                    return Some(trimmed);
                }
            }
        }
    }
    None
}

pub fn email_to_user_id(email: &str) -> String {
    let safe: String = email
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let res = safe.trim_matches('_').to_string();
    if res.is_empty() {
        "user".to_string()
    } else {
        res
    }
}

pub fn create_session(user_id: &str, email: &str) -> UserSession {
    let token = format!("ses_{}", generate_secure_hex(24));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let session = UserSession {
        token: token.clone(),
        user_id: user_id.to_string(),
        email: email.to_string(),
        created_at: now,
    };

    let mut lock = SESSIONS.write().unwrap();
    lock.insert(token, session.clone());
    save_sessions(&lock);
    session
}

pub fn get_session(token: &str) -> Option<UserSession> {
    let lock = SESSIONS.read().unwrap();
    lock.get(token).cloned()
}

pub fn delete_session(token: &str) {
    let mut lock = SESSIONS.write().unwrap();
    if lock.remove(token).is_some() {
        save_sessions(&lock);
    }
}

pub fn create_terminal_ticket(target: TerminalTarget) -> String {
    let ticket = format!("tkt_{}", generate_secure_hex(16));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let t = TerminalTicket {
        ticket: ticket.clone(),
        target,
        expires_at: now + 300,
    };

    let mut lock = TICKETS.write().unwrap();
    lock.insert(ticket.clone(), t);
    ticket
}

pub fn consume_terminal_ticket(ticket: &str) -> Option<TerminalTarget> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut lock = TICKETS.write().unwrap();
    if let Some(t) = lock.remove(ticket) {
        if t.expires_at >= now {
            return Some(t.target);
        }
    }
    None
}

pub fn extract_token_from_headers(headers: &HeaderMap) -> Option<String> {
    if let Some(auth_header) = headers.get(header::AUTHORIZATION).and_then(|h| h.to_str().ok()) {
        let h = auth_header.trim();
        if h.starts_with("Bearer ") {
            let t = h[7..].trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        } else if !h.is_empty() {
            return Some(h.to_string());
        }
    }

    if let Some(x_key) = headers.get("x-api-key").and_then(|h| h.to_str().ok()) {
        let t = x_key.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }

    if let Some(x_sess) = headers.get("x-session-token").and_then(|h| h.to_str().ok()) {
        let t = x_sess.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }

    if let Some(cookie_hdr) = headers.get(header::COOKIE).and_then(|v| v.to_str().ok()) {
        for pair in cookie_hdr.split(';') {
            let mut parts = pair.trim().splitn(2, '=');
            if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
                if (k == "antigravity_session" || k == "antigravity_token") && !v.trim().is_empty() {
                    return Some(v.trim().to_string());
                }
            }
        }
    }

    None
}

pub fn get_session_or_key(config: &Config, token: &str) -> Option<UserSession> {
    let token = token.trim();
    if token.is_empty() {
        return None;
    }

    // 1. Check verified sessions
    if let Some(mut s) = get_session(token) {
        let root_cli = PathBuf::from("/root/.gemini/antigravity-cli");
        if let Some(primary_email) = extract_email_from_gemini_cli_dir(&root_cli) {
            if primary_email.eq_ignore_ascii_case(&s.email) {
                s.user_id = "default".to_string();
            }
        }
        return Some(s);
    }

    // 2. Check global API_KEY env var
    if let Some(ref expected) = config.api_key {
        if !expected.is_empty() && token == expected {
            let email = extract_email_from_gemini_cli_dir(&PathBuf::from("/root/.gemini/antigravity-cli"))
                .unwrap_or_else(|| "admin@antigravity.local".to_string());
            return Some(UserSession {
                token: token.to_string(),
                user_id: "default".to_string(),
                email,
                created_at: 0,
            });
        }
    }

    // 3. Check persistent api_key.txt for default root user
    let default_key_path = PathBuf::from("/root/.gemini/api_key.txt");
    if let Ok(key) = std::fs::read_to_string(&default_key_path) {
        if key.trim() == token {
            let email = extract_email_from_gemini_cli_dir(&PathBuf::from("/root/.gemini/antigravity-cli"))
                .unwrap_or_else(|| "default@antigravity.local".to_string());
            return Some(UserSession {
                token: token.to_string(),
                user_id: "default".to_string(),
                email,
                created_at: 0,
            });
        }
    }

    // 4. Check user directories in /workspace/users
    let users_dir = PathBuf::from("/workspace/users");
    if let Ok(entries) = std::fs::read_dir(users_dir) {
        for entry in entries.flatten() {
            let user_dir = entry.path();
            let key_file = user_dir.join(".gemini").join("api_key.txt");
            if let Ok(key) = std::fs::read_to_string(&key_file) {
                if key.trim() == token {
                    let user_id = entry.file_name().to_string_lossy().to_string();
                    let email = extract_email_from_gemini_cli_dir(&user_dir.join(".gemini").join("antigravity-cli"))
                        .unwrap_or_else(|| format!("{}@antigravity.local", user_id));
                    return Some(UserSession {
                        token: token.to_string(),
                        user_id,
                        email,
                        created_at: 0,
                    });
                }
            }
        }
    }

    None
}

pub fn extract_user_from_headers(headers: &HeaderMap, _query_user: Option<&str>) -> String {
    if let Some(token) = extract_token_from_headers(headers) {
        let config = Config::from_env();
        if let Some(session) = get_session_or_key(&config, &token) {
            return session.user_id;
        }
    }
    "default".to_string()
}

pub fn get_key_file_path(config: &Config, user: Option<&str>) -> PathBuf {
    config.get_user_home(user).join(".gemini").join("api_key.txt")
}

pub fn get_or_create_user_api_key(config: &Config, user: Option<&str>) -> String {
    let key_path = get_key_file_path(config, user);
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

pub fn regenerate_user_api_key(config: &Config, user: Option<&str>) -> String {
    let key_path = get_key_file_path(config, user);
    let new_key = generate_secure_api_key();
    if let Some(parent) = key_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&key_path, &new_key);
    new_key
}

pub fn is_valid_token(config: &Config, _user: Option<&str>, token: &str) -> bool {
    get_session_or_key(config, token).is_some()
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
        || path == "/api/auth/start-login"
        || path == "/api/auth/check-login"
        || path == "/api/auth/me"
        || path == "/api/internal/verify-terminal-ticket"
    {
        return next.run(req).await;
    }

    let token = extract_token_from_headers(req.headers());

    if let Some(ref t) = token {
        if is_valid_token(&config, None, t) {
            return next.run(req).await;
        }
    }

    (
        StatusCode::UNAUTHORIZED,
        Json(json!({
            "error": "Unauthorized",
            "message": "Session non authentifiée. Veuillez vous connecter avec votre compte Google."
        })),
    )
        .into_response()
}
