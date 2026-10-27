use crate::config::Config;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub server_type: String, // "stdio" or "http"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(rename = "serverUrl", skip_serializing_if = "Option::is_none")]
    pub server_url: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RawMcpServerEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(rename = "serverUrl", skip_serializing_if = "Option::is_none")]
    pub server_url: Option<String>,
    #[serde(rename = "url", skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct McpConfigFile {
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: HashMap<String, RawMcpServerEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpPreset {
    pub id: String,
    pub name: String,
    pub title: String,
    pub description: String,
    pub icon: String,
    pub category: String, // "browser", "system", "web", "developer"
    pub server_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(rename = "serverUrl", skip_serializing_if = "Option::is_none")]
    pub server_url: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub headers: HashMap<String, String>,
}

pub fn get_mcp_config_path(config: &Config, user: Option<&str>) -> PathBuf {
    config.get_user_gemini_dir(user).join("config").join("mcp_config.json")
}

pub fn read_mcp_config_file(config: &Config, user: Option<&str>) -> McpConfigFile {
    let path = get_mcp_config_path(config, user);
    if !path.exists() {
        return McpConfigFile::default();
    }

    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<McpConfigFile>(&content) {
            Ok(parsed) => parsed,
            Err(e) => {
                warn!("Failed to parse {}: {}", path.display(), e);
                McpConfigFile::default()
            }
        },
        Err(e) => {
            warn!("Failed to read {}: {}", path.display(), e);
            McpConfigFile::default()
        }
    }
}

pub fn write_mcp_config_file(
    config: &Config,
    user: Option<&str>,
    data: &McpConfigFile,
) -> Result<(), String> {
    let path = get_mcp_config_path(config, user);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let json_bytes = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize mcp_config: {}", e))?;

    std::fs::write(&path, json_bytes)
        .map_err(|e| format!("Failed to write to {}: {}", path.display(), e))?;

    info!("Updated MCP config at {}", path.display());
    Ok(())
}

pub fn list_servers(config: &Config, user: Option<&str>) -> Vec<McpServerConfig> {
    let file = read_mcp_config_file(config, user);
    let mut servers = Vec::new();

    for (name, entry) in file.mcp_servers {
        let url_target = entry.server_url.or(entry.url);
        let server_type = if url_target.is_some() {
            "http".to_string()
        } else {
            "stdio".to_string()
        };

        servers.push(McpServerConfig {
            name,
            server_type,
            command: entry.command,
            args: entry.args,
            server_url: url_target,
            env: entry.env,
            headers: entry.headers,
            disabled: entry.disabled,
        });
    }

    servers.sort_by(|a, b| a.name.cmp(&b.name));
    servers
}

pub fn upsert_server(
    config: &Config,
    user: Option<&str>,
    server: McpServerConfig,
) -> Result<(), String> {
    let clean_name = server.name.trim();
    if clean_name.is_empty() {
        return Err("Server name cannot be empty".to_string());
    }

    let mut file = read_mcp_config_file(config, user);

    let entry = if server.server_type == "http" {
        let clean_url = server.server_url.unwrap_or_default().trim().to_string();
        if clean_url.is_empty() {
            return Err("HTTP/SSE server requires a valid serverUrl".to_string());
        }
        RawMcpServerEntry {
            command: None,
            args: vec![],
            server_url: Some(clean_url),
            url: None,
            env: HashMap::new(),
            headers: server.headers,
            disabled: server.disabled,
        }
    } else {
        let clean_cmd = server.command.unwrap_or_default().trim().to_string();
        if clean_cmd.is_empty() {
            return Err("Stdio server requires a command".to_string());
        }
        RawMcpServerEntry {
            command: Some(clean_cmd),
            args: server.args,
            server_url: None,
            url: None,
            env: server.env,
            headers: HashMap::new(),
            disabled: server.disabled,
        }
    };

    file.mcp_servers.insert(clean_name.to_string(), entry);
    write_mcp_config_file(config, user, &file)
}

pub fn remove_server(config: &Config, user: Option<&str>, name: &str) -> Result<(), String> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err("Server name cannot be empty".to_string());
    }

    let mut file = read_mcp_config_file(config, user);
    if file.mcp_servers.remove(clean_name).is_some() {
        write_mcp_config_file(config, user, &file)
    } else {
        Err(format!("Server '{}' not found", clean_name))
    }
}

pub fn toggle_server(
    config: &Config,
    user: Option<&str>,
    name: &str,
    target_state: Option<bool>,
) -> Result<bool, String> {
    let clean_name = name.trim();
    let mut file = read_mcp_config_file(config, user);

    if let Some(entry) = file.mcp_servers.get_mut(clean_name) {
        let new_state = match target_state {
            Some(st) => st,
            None => !entry.disabled,
        };
        entry.disabled = new_state;
        write_mcp_config_file(config, user, &file)?;
        Ok(new_state)
    } else {
        Err(format!("Server '{}' not found", clean_name))
    }
}

pub fn get_builtin_presets() -> Vec<McpPreset> {
    let mut puppeteer_env = HashMap::new();
    puppeteer_env.insert(
        "PUPPETEER_EXECUTABLE_PATH".to_string(),
        "/usr/bin/chromium".to_string(),
    );

    let mut github_env = HashMap::new();
    github_env.insert(
        "GITHUB_PERSONAL_ACCESS_TOKEN".to_string(),
        "ghp_votre_token_ici".to_string(),
    );

    vec![
        McpPreset {
            id: "browser-puppeteer".to_string(),
            name: "browser-puppeteer".to_string(),
            title: "Navigateur Web (Puppeteer)".to_string(),
            description: "Permet à l'agent d'automatiser Chromium : naviguer sur des sites, cliquer, remplir des formulaires, faire des captures d'écran et extraire le DOM.".to_string(),
            icon: "Globe".to_string(),
            category: "browser".to_string(),
            server_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server-puppeteer".to_string()],
            server_url: None,
            env: puppeteer_env,
            headers: HashMap::new(),
        },
        McpPreset {
            id: "browser-playwright".to_string(),
            name: "browser-playwright".to_string(),
            title: "Navigateur Web (Playwright)".to_string(),
            description: "Contrôle de navigateur automatisé moderne basé sur Playwright pour le scraping et l'interaction web.".to_string(),
            icon: "Compass".to_string(),
            category: "browser".to_string(),
            server_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: vec!["-y".to_string(), "@executeautomation/playwright-mcp-server".to_string()],
            server_url: None,
            env: HashMap::new(),
            headers: HashMap::new(),
        },
        McpPreset {
            id: "browser-camoufox".to_string(),
            name: "browser-camoufox".to_string(),
            title: "Navigateur Furtif (Camoufox / Intent)".to_string(),
            description: "Connexion directe au proxy et à la passerelle anti-détection Camoufox (Firefox stealth avec empreintes uniques et proxies).".to_string(),
            icon: "ShieldAlert".to_string(),
            category: "browser".to_string(),
            server_type: "http".to_string(),
            command: None,
            args: vec![],
            server_url: Some("http://172.17.0.1:8000/sse".to_string()),
            env: HashMap::new(),
            headers: HashMap::new(),
        },
        McpPreset {
            id: "filesystem".to_string(),
            name: "filesystem".to_string(),
            title: "Système de fichiers étendu".to_string(),
            description: "Donne à l'agent un accès standardisé et sécurisé aux fichiers et dossiers du projet /workspace.".to_string(),
            icon: "FolderGit2".to_string(),
            category: "system".to_string(),
            server_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server-filesystem".to_string(), "/workspace".to_string()],
            server_url: None,
            env: HashMap::new(),
            headers: HashMap::new(),
        },
        McpPreset {
            id: "fetch-web".to_string(),
            name: "fetch-web".to_string(),
            title: "Fetch Web & Markdown".to_string(),
            description: "Permet à l'agent de récupérer le contenu de n'importe quelle URL et de le convertir en Markdown propre pour analyse.".to_string(),
            icon: "DownloadCloud".to_string(),
            category: "web".to_string(),
            server_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server-fetch".to_string()],
            server_url: None,
            env: HashMap::new(),
            headers: HashMap::new(),
        },
        McpPreset {
            id: "github".to_string(),
            name: "github".to_string(),
            title: "GitHub Integration".to_string(),
            description: "Interaction complète avec GitHub : consulter et créer des Issues, pull requests, lire les dépôts et gérer les commits.".to_string(),
            icon: "GitBranch".to_string(),
            category: "developer".to_string(),
            server_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server-github".to_string()],
            server_url: None,
            env: github_env,
            headers: HashMap::new(),
        },
        McpPreset {
            id: "memory".to_string(),
            name: "memory".to_string(),
            title: "Mémoire Persistante (Knowledge Graph)".to_string(),
            description: "Base de graphe de connaissances MCP pour stocker des faits, entités et relations clés mémorisés d'une session à l'autre.".to_string(),
            icon: "Brain".to_string(),
            category: "developer".to_string(),
            server_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server-memory".to_string()],
            server_url: None,
            env: HashMap::new(),
            headers: HashMap::new(),
        },
    ]
}
