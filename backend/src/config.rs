use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub api_key: Option<String>,
    pub gemini_cli_dir: PathBuf,
    pub workspace_dir: PathBuf,
    pub agy_bin: PathBuf,
}

pub fn sanitize_user(input: Option<&str>) -> String {
    let raw = match input {
        Some(s) => s.trim(),
        None => "",
    };
    if raw.is_empty() {
        return "default".to_string();
    }
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if cleaned.is_empty() {
        "default".to_string()
    } else {
        cleaned.to_lowercase()
    }
}

impl Config {
    pub fn from_env() -> Self {
        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8080);

        let api_key = std::env::var("API_KEY")
            .ok()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty());

        let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());

        let gemini_cli_dir = std::env::var("GEMINI_CLI_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                PathBuf::from(&home_dir).join(".gemini").join("antigravity-cli")
            });

        let workspace_dir = std::env::var("WORKSPACE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                if std::path::Path::new("/workspace").exists() {
                    PathBuf::from("/workspace")
                } else {
                    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                }
            });

        let agy_bin = std::env::var("AGY_BIN")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                let candidates = [
                    PathBuf::from(&home_dir).join(".local/bin/agy"),
                    PathBuf::from("/usr/local/bin/agy"),
                    PathBuf::from("/tmp/agy_bin/agy"),
                    PathBuf::from("agy"),
                ];

                for candidate in &candidates {
                    if candidate.exists() {
                        return candidate.clone();
                    }
                }

                PathBuf::from("agy")
            });

        Self {
            host,
            port,
            api_key,
            gemini_cli_dir,
            workspace_dir,
            agy_bin,
        }
    }

    pub fn get_user_home(&self, user: Option<&str>) -> PathBuf {
        let safe_user = sanitize_user(user);
        if safe_user == "default" || safe_user == "root" {
            return PathBuf::from("/root");
        }

        // If user matches the primary account in /root, map directly to /root
        let root_cli = PathBuf::from("/root/.gemini/antigravity-cli");
        if let Some(primary_email) = crate::auth::extract_email_from_gemini_cli_dir(&root_cli) {
            let primary_user_id = crate::auth::email_to_user_id(&primary_email);
            if safe_user == primary_user_id || safe_user == primary_email.to_lowercase() {
                return PathBuf::from("/root");
            }
        }

        PathBuf::from("/workspace/users").join(&safe_user)
    }

    pub fn get_user_gemini_dir(&self, user: Option<&str>) -> PathBuf {
        self.get_user_home(user).join(".gemini")
    }

    pub fn get_user_gemini_cli_dir(&self, user: Option<&str>) -> PathBuf {
        self.get_user_gemini_dir(user).join("antigravity-cli")
    }

    pub fn get_user_workspace_dir(&self, user: Option<&str>) -> PathBuf {
        let safe_user = sanitize_user(user);
        if safe_user == "default" || safe_user == "root" {
            return self.workspace_dir.clone();
        }

        let root_cli = PathBuf::from("/root/.gemini/antigravity-cli");
        if let Some(primary_email) = crate::auth::extract_email_from_gemini_cli_dir(&root_cli) {
            let primary_user_id = crate::auth::email_to_user_id(&primary_email);
            if safe_user == primary_user_id || safe_user == primary_email.to_lowercase() {
                return self.workspace_dir.clone();
            }
        }

        let p = PathBuf::from("/workspace/users").join(&safe_user).join("workspace");
        let _ = std::fs::create_dir_all(&p);
        p
    }

    pub fn ensure_user_dirs(&self, user: Option<&str>) {
        let safe_user = sanitize_user(user);
        if safe_user != "default" && safe_user != "root" {
            let root_cli = PathBuf::from("/root/.gemini/antigravity-cli");
            if let Some(primary_email) = crate::auth::extract_email_from_gemini_cli_dir(&root_cli) {
                let primary_user_id = crate::auth::email_to_user_id(&primary_email);
                if safe_user == primary_user_id || safe_user == primary_email.to_lowercase() {
                    return;
                }
            }
            let gemini_cli = self.get_user_gemini_cli_dir(Some(&safe_user));
            let _ = std::fs::create_dir_all(&gemini_cli);
            let ws = self.get_user_workspace_dir(Some(&safe_user));
            let _ = std::fs::create_dir_all(&ws);
        }
    }
}
