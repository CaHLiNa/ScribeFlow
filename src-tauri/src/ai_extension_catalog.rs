use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::app_dirs::data_root_dir;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiExtensionCatalogParams {
    #[serde(default)]
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExtensionSource {
    pub path: String,
    pub scope: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMcpServerEntry {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub enabled: bool,
    pub command: String,
    pub args: Vec<String>,
    pub url: String,
    pub source_path: String,
    pub source_scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExtensionCatalogResponse {
    pub sources: Vec<AiExtensionSource>,
    pub mcp_servers: Vec<AiMcpServerEntry>,
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn workspace_candidate_sources(workspace_path: &str) -> Vec<(PathBuf, &'static str)> {
    let normalized = workspace_path.trim();
    if normalized.is_empty() {
        return Vec::new();
    }
    let root = PathBuf::from(normalized);
    vec![
        (root.join(".mcp.json"), "workspace"),
        (root.join(".altals/mcp.json"), "workspace"),
        (root.join(".codex/mcp.json"), "workspace"),
        (root.join(".claude/mcp.json"), "workspace"),
        (root.join(".agents/mcp.json"), "workspace"),
    ]
}

fn user_candidate_sources() -> Vec<(PathBuf, &'static str)> {
    let mut sources = Vec::new();
    if let Ok(root) = data_root_dir() {
        sources.push((root.join("mcp.json"), "user"));
    }
    if let Some(home) = dirs::home_dir() {
        sources.push((home.join(".codex/mcp.json"), "user"));
        sources.push((home.join(".claude/mcp.json"), "user"));
        sources.push((home.join(".agents/mcp.json"), "user"));
    }
    sources
}

fn transport_from_server(server: &Value) -> String {
    let explicit = server
        .get("transport")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(value) = explicit {
        return value.to_string();
    }

    if server.get("command").and_then(Value::as_str).is_some() {
        return "stdio".to_string();
    }

    let url = server
        .get("url")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_lowercase();
    if url.starts_with("http://") || url.starts_with("https://") {
        return "http".to_string();
    }
    if url.starts_with("ws://") || url.starts_with("wss://") {
        return "websocket".to_string();
    }

    "unknown".to_string()
}

fn parse_server_entries(source_path: &Path, scope: &str, payload: &Value) -> Vec<AiMcpServerEntry> {
    let servers = payload
        .get("mcpServers")
        .or_else(|| payload.get("servers"))
        .and_then(Value::as_object);
    let Some(servers) = servers else {
        return Vec::new();
    };

    servers
        .iter()
        .filter_map(|(name, server)| {
            let config = server.as_object()?;
            let command = config
                .get("command")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default()
                .to_string();
            let args = config
                .get("args")
                .and_then(Value::as_array)
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(Value::as_str)
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let url = config
                .get("url")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default()
                .to_string();
            let enabled = !config
                .get("disabled")
                .and_then(Value::as_bool)
                .unwrap_or(false);

            Some(AiMcpServerEntry {
                id: format!("mcp:{}:{}", scope, name.trim()),
                name: name.trim().to_string(),
                transport: transport_from_server(server),
                enabled,
                command,
                args,
                url,
                source_path: normalize_path(source_path),
                source_scope: scope.to_string(),
            })
        })
        .collect()
}

pub fn load_extension_catalog(
    workspace_path: &str,
) -> Result<AiExtensionCatalogResponse, String> {
    let mut source_index = BTreeMap::<String, AiExtensionSource>::new();
    let mut server_index = BTreeMap::<String, AiMcpServerEntry>::new();

    let mut candidates = workspace_candidate_sources(workspace_path);
    candidates.extend(user_candidate_sources());

    for (path, scope) in candidates {
        if !path.exists() || !path.is_file() {
            continue;
        }
        let normalized_path = normalize_path(&path);
        source_index.insert(
            normalized_path.clone(),
            AiExtensionSource {
                path: normalized_path.clone(),
                scope: scope.to_string(),
                kind: "mcp-config".to_string(),
            },
        );

        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(payload) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };

        for server in parse_server_entries(&path, scope, &payload) {
            let key = format!("{}::{}", server.name, server.source_scope);
            server_index.entry(key).or_insert(server);
        }
    }

    Ok(AiExtensionCatalogResponse {
        sources: source_index.into_values().collect(),
        mcp_servers: server_index.into_values().collect(),
    })
}

pub fn load_extension_catalog_value(workspace_path: &str) -> Value {
    match load_extension_catalog(workspace_path) {
        Ok(response) => json!({
            "available": true,
            "sources": response.sources,
            "mcpServers": response.mcp_servers,
        }),
        Err(error) => json!({
            "available": false,
            "sources": [],
            "mcpServers": [],
            "error": error,
        }),
    }
}

#[tauri::command]
pub async fn ai_extension_catalog_load(
    params: AiExtensionCatalogParams,
) -> Result<AiExtensionCatalogResponse, String> {
    load_extension_catalog(&params.workspace_path)
}
