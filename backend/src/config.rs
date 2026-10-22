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
                // Try several common locations
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
}
