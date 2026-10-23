use crate::config::Config;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
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

fn get_deleted_ids(cli_dir: &Path) -> HashSet<String> {
    let tombstone_file = cli_dir.join("deleted_conversations.json");
    if tombstone_file.exists() {
        if let Ok(file) = File::open(&tombstone_file) {
            let reader = BufReader::new(file);
            if let Ok(set) = serde_json::from_reader::<_, HashSet<String>>(reader) {
                return set;
            }
        }
    }
    HashSet::new()
}

fn save_deleted_ids(cli_dir: &Path, ids: &HashSet<String>) {
    let tombstone_file = cli_dir.join("deleted_conversations.json");
    if let Ok(file) = File::create(&tombstone_file) {
        let _ = serde_json::to_writer(file, ids);
    }
}

fn clean_proto_summaries(cli_dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(cli_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with("jetbox_summaries_proto") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

pub fn list_conversations(config: &Config, user: Option<&str>) -> Vec<ConversationSummary> {
    config.ensure_user_dirs(user);
    let cli_dir = config.get_user_gemini_cli_dir(user);
    let deleted_ids = get_deleted_ids(&cli_dir);
    let db_path = cli_dir.join("conversation_summaries.db");

    if !db_path.exists() {
        return Vec::new();
    }

    let conn = match Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .or_else(|_| {
        Connection::open_with_flags(
            &db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
        )
    }) {
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
        LIMIT 200
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

    let mut resurrected_to_purge = Vec::new();

    let convs: Vec<ConversationSummary> = match conv_iter {
        Ok(iter) => iter
            .filter_map(Result::ok)
            .filter(|c| {
                if deleted_ids.contains(&c.conversation_id) {
                    resurrected_to_purge.push(c.conversation_id.clone());
                    return false;
                }
                true
            })
            .collect(),
        Err(e) => {
            warn!("Error querying conversation summaries: {}", e);
            Vec::new()
        }
    };

    // If agy restored any tombstoned conversation into sqlite DB, purge it from DB immediately!
    if !resurrected_to_purge.is_empty() {
        for id in &resurrected_to_purge {
            let _ = conn.execute(
                "DELETE FROM conversation_summaries WHERE conversation_id = ?1",
                [id],
            );
        }
    }

    convs
}

pub fn get_conversation_transcript(
    config: &Config,
    user: Option<&str>,
    conversation_id: &str,
) -> Result<Vec<serde_json::Value>, String> {
    if !conversation_id.chars().all(|c| c.is_alphanumeric() || c == '-') {
        return Err("Invalid conversation ID format".to_string());
    }

    config.ensure_user_dirs(user);
    let transcript_path = config
        .get_user_gemini_cli_dir(user)
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

pub fn delete_conversation(
    config: &Config,
    user: Option<&str>,
    conversation_id: &str,
) -> Result<(), String> {
    if !conversation_id.chars().all(|c| c.is_alphanumeric() || c == '-') {
        return Err("Invalid conversation ID format".to_string());
    }

    config.ensure_user_dirs(user);
    let cli_dir = config.get_user_gemini_cli_dir(user);

    // 1. Add to persistent tombstone set
    let mut deleted_ids = get_deleted_ids(&cli_dir);
    deleted_ids.insert(conversation_id.to_string());
    save_deleted_ids(&cli_dir, &deleted_ids);

    // 2. Delete from conversation_summaries.db
    let db_path = cli_dir.join("conversation_summaries.db");
    if db_path.exists() {
        if let Ok(conn) = Connection::open(&db_path) {
            if let Err(e) = conn.execute(
                "DELETE FROM conversation_summaries WHERE conversation_id = ?1",
                [&conversation_id],
            ) {
                warn!("Failed to delete conversation {} from DB: {}", conversation_id, e);
            }
        }
    }

    // 3. Delete conversations/<id>.db and journals/wal
    let convs_dir = cli_dir.join("conversations");
    for ext in &["db", "db-shm", "db-wal", "db-journal"] {
        let f = convs_dir.join(format!("{}.{}", conversation_id, ext));
        if f.exists() {
            let _ = std::fs::remove_file(&f);
        }
    }

    // 4. Delete brain/<id> folder
    let brain_dir = cli_dir.join("brain").join(conversation_id);
    if brain_dir.exists() {
        let _ = std::fs::remove_dir_all(&brain_dir);
    }

    // 5. Delete agy protobuf cache so old summaries are never resurrected by agy
    clean_proto_summaries(&cli_dir);

    Ok(())
}

pub fn clear_all_conversations(
    config: &Config,
    user: Option<&str>,
) -> Result<usize, String> {
    config.ensure_user_dirs(user);
    let cli_dir = config.get_user_gemini_cli_dir(user);

    let mut deleted_count = 0;

    // 1. Delete all rows from SQLite DB
    let db_path = cli_dir.join("conversation_summaries.db");
    if db_path.exists() {
        if let Ok(conn) = Connection::open(&db_path) {
            if let Ok(count) = conn.execute("DELETE FROM conversation_summaries", []) {
                deleted_count = count;
            }
            let _ = conn.execute("VACUUM", []);
        }
    }

    // 2. Delete all folders in brain/
    let brain_dir = cli_dir.join("brain");
    if brain_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&brain_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let _ = std::fs::remove_dir_all(&p);
                }
            }
        }
    }

    // 3. Delete all files in conversations/
    let convs_dir = cli_dir.join("conversations");
    if convs_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&convs_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let _ = std::fs::remove_file(&p);
                }
            }
        }
    }

    // 4. Remove all protobuf caches
    clean_proto_summaries(&cli_dir);

    // 5. Clear tombstone file
    let tombstone_file = cli_dir.join("deleted_conversations.json");
    if tombstone_file.exists() {
        let _ = std::fs::remove_file(&tombstone_file);
    }

    Ok(deleted_count)
}
