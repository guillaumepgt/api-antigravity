use crate::config::Config;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader};
use tracing::warn;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub conversation_id: String,
    pub title: String,
    pub preview: String,
    pub step_count: i64,
    pub last_modified_time: String,
    pub status: String,
}

pub fn list_conversations(config: &Config) -> Vec<ConversationSummary> {
    let db_path = config.gemini_cli_dir.join("conversation_summaries.db");

    if !db_path.exists() {
        return Vec::new();
    }

    let conn = match Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    ) {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to open conversation summaries db at {:?}: {}", db_path, e);
            return Vec::new();
        }
    };

    let query = "
        SELECT conversation_id, title, preview, step_count, last_modified_time, status 
        FROM conversation_summaries 
        ORDER BY last_modified_time DESC 
        LIMIT 100
    ";

    let mut stmt = match conn.prepare(query) {
        Ok(s) => s,
        Err(e) => {
            warn!("Failed to prepare query on conversation summaries: {}", e);
            return Vec::new();
        }
    };

    let conv_iter = stmt.query_map([], |row| {
        Ok(ConversationSummary {
            conversation_id: row.get(0)?,
            title: row.get(1)?,
            preview: row.get(2)?,
            step_count: row.get(3)?,
            last_modified_time: row.get(4)?,
            status: row.get(5)?,
        })
    });

    match conv_iter {
        Ok(iter) => iter.filter_map(Result::ok).collect(),
        Err(e) => {
            warn!("Error querying conversation summaries: {}", e);
            Vec::new()
        }
    }
}

pub fn get_conversation_transcript(
    config: &Config,
    conversation_id: &str,
) -> Result<Vec<serde_json::Value>, String> {
    // Validate uuid-like conversation ID to prevent directory traversal
    if !conversation_id.chars().all(|c| c.is_alphanumeric() || c == '-') {
        return Err("Invalid conversation ID format".to_string());
    }

    let transcript_path = config
        .gemini_cli_dir
        .join("brain")
        .join(conversation_id)
        .join(".system_generated/logs/transcript.jsonl");

    if !transcript_path.exists() {
        return Err("Conversation transcript not found".to_string());
    }

    let file = File::open(&transcript_path)
        .map_err(|e| format!("Failed to open transcript file: {}", e))?;
    let reader = BufReader::new(file);

    let mut steps = Vec::new();
    for line in reader.lines() {
        if let Ok(l) = line {
            let trimmed = l.trim();
            if !trimmed.is_empty() {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    steps.push(json_val);
                }
            }
        }
    }

    Ok(steps)
}
