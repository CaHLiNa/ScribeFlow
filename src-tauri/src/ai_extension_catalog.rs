use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader as StdBufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

use crate::app_dirs::data_root_dir;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiExtensionCatalogParams {
    #[serde(default)]
    pub workspace_path: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiExtensionMcpProbeParams {
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub server_id: String,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExtensionMcpToolEntry {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiExtensionMcpProbeResponse {
    pub ok: bool,
    pub server_id: String,
    pub server_name: String,
    pub transport: String,
    pub protocol_version: String,
    pub server_label: String,
    pub tool_count: usize,
    pub tools: Vec<AiExtensionMcpToolEntry>,
    pub error: String,
}

#[derive(Debug, Clone)]
pub struct ResolvedMcpToolDefinition {
    pub runtime_name: String,
    pub display_name: String,
    pub description: String,
    pub parameters: Value,
    pub server_name: String,
    pub tool_name: String,
}

#[derive(Debug, Clone)]
struct AiMcpServerConfig {
    pub entry: AiMcpServerEntry,
    pub env: BTreeMap<String, String>,
    pub cwd: String,
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn slugify_token(value: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for ch in value.trim().chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            last_dash = false;
        } else if !last_dash {
            output.push('-');
            last_dash = true;
        }
    }
    output.trim_matches('-').to_string()
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

fn parse_env_map(config: &serde_json::Map<String, Value>) -> BTreeMap<String, String> {
    config
        .get("env")
        .and_then(Value::as_object)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|(key, value)| {
                    value
                        .as_str()
                        .map(|entry| (key.trim().to_string(), entry.trim().to_string()))
                })
                .filter(|(key, value)| !key.is_empty() && !value.is_empty())
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default()
}

fn parse_server_entries(source_path: &Path, scope: &str, payload: &Value) -> Vec<AiMcpServerConfig> {
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

            Some(AiMcpServerConfig {
                entry: AiMcpServerEntry {
                    id: format!("mcp:{}:{}", scope, name.trim()),
                    name: name.trim().to_string(),
                    transport: transport_from_server(server),
                    enabled,
                    command,
                    args,
                    url,
                    source_path: normalize_path(source_path),
                    source_scope: scope.to_string(),
                },
                env: parse_env_map(config),
                cwd: config
                    .get("cwd")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .unwrap_or_default()
                    .to_string(),
            })
        })
        .collect()
}

fn discover_mcp_server_configs(workspace_path: &str) -> (Vec<AiExtensionSource>, Vec<AiMcpServerConfig>) {
    let mut source_index = BTreeMap::<String, AiExtensionSource>::new();
    let mut server_index = BTreeMap::<String, AiMcpServerConfig>::new();

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
            let key = format!("{}::{}", server.entry.name, server.entry.source_scope);
            server_index.entry(key).or_insert(server);
        }
    }

    let mut sources = source_index.into_values().collect::<Vec<_>>();
    sources.sort_by(|left, right| left.path.cmp(&right.path));

    let mut servers = server_index.into_values().collect::<Vec<_>>();
    servers.sort_by(|left, right| {
        left.entry
            .name
            .cmp(&right.entry.name)
            .then_with(|| left.entry.source_scope.cmp(&right.entry.source_scope))
    });

    (sources, servers)
}

fn resolve_mcp_server_config(
    workspace_path: &str,
    server_id: &str,
) -> Result<AiMcpServerConfig, String> {
    let normalized_server_id = server_id.trim();
    if normalized_server_id.is_empty() {
        return Err("A server id is required.".to_string());
    }

    let (_, servers) = discover_mcp_server_configs(workspace_path);
    servers
        .into_iter()
        .find(|server| server.entry.id == normalized_server_id)
        .ok_or_else(|| "Requested MCP server was not found.".to_string())
}

fn build_runtime_tool_name(entry: &AiMcpServerEntry, tool_name: &str) -> String {
    let scope = slugify_token(&entry.source_scope);
    let server = slugify_token(&entry.name);
    let tool = slugify_token(tool_name);
    format!("mcp__{}__{}__{}", scope, server, tool)
}

pub fn load_extension_catalog(workspace_path: &str) -> Result<AiExtensionCatalogResponse, String> {
    let (sources, servers) = discover_mcp_server_configs(workspace_path);
    Ok(AiExtensionCatalogResponse {
        sources,
        mcp_servers: servers.into_iter().map(|server| server.entry).collect(),
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

fn write_json_rpc_message_sync(
    stdin: &mut std::process::ChildStdin,
    payload: &Value,
) -> Result<(), String> {
    let serialized =
        serde_json::to_string(payload).map_err(|error| format!("Failed to encode MCP message: {error}"))?;
    stdin
        .write_all(serialized.as_bytes())
        .map_err(|error| format!("Failed to write to MCP server stdin: {error}"))?;
    stdin
        .write_all(b"\n")
        .map_err(|error| format!("Failed to finalize MCP message: {error}"))?;
    stdin
        .flush()
        .map_err(|error| format!("Failed to flush MCP message: {error}"))?;
    Ok(())
}

fn read_json_rpc_response_sync(
    reader: &mut StdBufReader<std::process::ChildStdout>,
    response_id: i64,
) -> Result<Value, String> {
    let mut line = String::new();
    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|error| format!("Failed to read MCP server stdout: {error}"))?;
        if bytes == 0 {
            return Err("MCP server closed stdout before responding.".to_string());
        }
        let normalized = line.trim();
        if normalized.is_empty() {
            continue;
        }
        let parsed = match serde_json::from_str::<Value>(normalized) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if parsed.get("id").and_then(Value::as_i64) == Some(response_id) {
            return Ok(parsed);
        }
    }
}

fn probe_stdio_mcp_server_sync(
    workspace_path: &str,
    config: &AiMcpServerConfig,
) -> Result<(String, String, Vec<ResolvedMcpToolDefinition>), String> {
    if !config.entry.enabled {
        return Err("MCP server is disabled.".to_string());
    }
    if config.entry.command.trim().is_empty() {
        return Err("MCP server command is missing.".to_string());
    }

    let mut command = std::process::Command::new(&config.entry.command);
    command.args(&config.entry.args);
    command.stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::null());
    if !config.cwd.trim().is_empty() {
        command.current_dir(config.cwd.trim());
    } else if !workspace_path.trim().is_empty() {
        command.current_dir(workspace_path.trim());
    }
    for (key, value) in &config.env {
        command.env(key, value);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start MCP server: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "MCP server stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "MCP server stdout is unavailable.".to_string())?;
    let mut reader = StdBufReader::new(stdout);

    write_json_rpc_message_sync(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "roots": {
                        "listChanged": false
                    }
                },
                "clientInfo": {
                    "name": "Altals",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }
        }),
    )?;
    let initialize_response = read_json_rpc_response_sync(&mut reader, 1)?;

    write_json_rpc_message_sync(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }),
    )?;

    write_json_rpc_message_sync(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }),
    )?;
    let tools_response = read_json_rpc_response_sync(&mut reader, 2)?;

    let _ = child.kill();
    let _ = child.wait();

    let initialize_result = initialize_response.get("result").unwrap_or(&Value::Null);
    let protocol_version = initialize_result
        .get("protocolVersion")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let server_label = initialize_result
        .get("serverInfo")
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string();

    let tools = tools_response
        .get("result")
        .and_then(|value| value.get("tools"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|tool| {
            let tool_name = tool
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default()
                .to_string();
            if tool_name.is_empty() {
                return None;
            }
            let description = tool
                .get("description")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default()
                .to_string();
            let parameters = tool
                .get("inputSchema")
                .cloned()
                .unwrap_or_else(|| json!({"type": "object", "properties": {}, "required": []}));
            Some(ResolvedMcpToolDefinition {
                runtime_name: build_runtime_tool_name(&config.entry, &tool_name),
                display_name: format!("{} / {}", config.entry.name, tool_name),
                description,
                parameters,
                server_name: config.entry.name.clone(),
                tool_name,
            })
        })
        .collect::<Vec<_>>();

    Ok((protocol_version, server_label, tools))
}

pub fn resolve_mcp_runtime_tools(workspace_path: &str) -> Vec<ResolvedMcpToolDefinition> {
    let (_, servers) = discover_mcp_server_configs(workspace_path);
    let mut tools = Vec::new();
    for server in servers {
        if server.entry.transport != "stdio" || !server.entry.enabled {
            continue;
        }
        if let Ok((_, _, discovered_tools)) = probe_stdio_mcp_server_sync(workspace_path, &server) {
            tools.extend(discovered_tools);
        }
    }
    tools
}

pub fn execute_mcp_runtime_tool_call(
    workspace_path: &str,
    runtime_tool_name: &str,
    arguments: &Value,
) -> Result<Value, String> {
    let (_, servers) = discover_mcp_server_configs(workspace_path);
    for server in servers {
        if server.entry.transport != "stdio" || !server.entry.enabled {
            continue;
        }
        let Ok((_, _, tools)) = probe_stdio_mcp_server_sync(workspace_path, &server) else {
            continue;
        };
        let Some(tool) = tools
            .into_iter()
            .find(|entry| entry.runtime_name == runtime_tool_name.trim())
        else {
            continue;
        };

        let mut command = std::process::Command::new(&server.entry.command);
        command.args(&server.entry.args);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::null());
        if !server.cwd.trim().is_empty() {
            command.current_dir(server.cwd.trim());
        } else if !workspace_path.trim().is_empty() {
            command.current_dir(workspace_path.trim());
        }
        for (key, value) in &server.env {
            command.env(key, value);
        }

        let mut child = command
            .spawn()
            .map_err(|error| format!("Failed to start MCP server: {error}"))?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "MCP server stdin is unavailable.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "MCP server stdout is unavailable.".to_string())?;
        let mut reader = StdBufReader::new(stdout);

        write_json_rpc_message_sync(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {
                        "roots": {
                            "listChanged": false
                        }
                    },
                    "clientInfo": {
                        "name": "Altals",
                        "version": env!("CARGO_PKG_VERSION")
                    }
                }
            }),
        )?;
        let _ = read_json_rpc_response_sync(&mut reader, 1)?;
        write_json_rpc_message_sync(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }),
        )?;
        write_json_rpc_message_sync(
            &mut stdin,
            &json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": tool.tool_name,
                    "arguments": arguments.clone()
                }
            }),
        )?;
        let tool_response = read_json_rpc_response_sync(&mut reader, 2)?;
        let _ = child.kill();
        let _ = child.wait();

        return Ok(tool_response
            .get("result")
            .cloned()
            .unwrap_or_else(|| json!({"ok": true})));
    }

    Err("Requested MCP runtime tool is unavailable.".to_string())
}

async fn write_json_rpc_message(
    stdin: &mut tokio::process::ChildStdin,
    payload: &Value,
) -> Result<(), String> {
    let serialized =
        serde_json::to_string(payload).map_err(|error| format!("Failed to encode MCP message: {error}"))?;
    stdin
        .write_all(serialized.as_bytes())
        .await
        .map_err(|error| format!("Failed to write to MCP server stdin: {error}"))?;
    stdin
        .write_all(b"\n")
        .await
        .map_err(|error| format!("Failed to finalize MCP message: {error}"))?;
    stdin
        .flush()
        .await
        .map_err(|error| format!("Failed to flush MCP message: {error}"))?;
    Ok(())
}

async fn read_json_rpc_response(
    lines: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    response_id: i64,
) -> Result<Value, String> {
    let deadline = Duration::from_secs(6);
    timeout(deadline, async {
        loop {
            let Some(line) = lines
                .next_line()
                .await
                .map_err(|error| format!("Failed to read MCP server stdout: {error}"))?
            else {
                return Err("MCP server closed stdout before responding.".to_string());
            };
            let normalized = line.trim();
            if normalized.is_empty() {
                continue;
            }
            let parsed = match serde_json::from_str::<Value>(normalized) {
                Ok(value) => value,
                Err(_) => continue,
            };
            if parsed.get("id").and_then(Value::as_i64) == Some(response_id) {
                return Ok(parsed);
            }
        }
    })
    .await
    .map_err(|_| "Timed out while waiting for MCP server response.".to_string())?
}

async fn probe_stdio_mcp_server(
    workspace_path: &str,
    config: &AiMcpServerConfig,
) -> Result<AiExtensionMcpProbeResponse, String> {
    if !config.entry.enabled {
        return Err("MCP server is disabled.".to_string());
    }
    if config.entry.command.trim().is_empty() {
        return Err("MCP server command is missing.".to_string());
    }

    let mut command = Command::new(&config.entry.command);
    command.args(&config.entry.args);
    command.stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::null());
    if !config.cwd.trim().is_empty() {
        command.current_dir(config.cwd.trim());
    } else if !workspace_path.trim().is_empty() {
        command.current_dir(workspace_path.trim());
    }
    for (key, value) in &config.env {
        command.env(key, value);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start MCP server: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "MCP server stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "MCP server stdout is unavailable.".to_string())?;
    let mut lines = BufReader::new(stdout).lines();

    write_json_rpc_message(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "roots": {
                        "listChanged": false
                    }
                },
                "clientInfo": {
                    "name": "Altals",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }
        }),
    )
    .await?;
    let initialize_response = read_json_rpc_response(&mut lines, 1).await?;

    write_json_rpc_message(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }),
    )
    .await?;

    write_json_rpc_message(
        &mut stdin,
        &json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }),
    )
    .await?;
    let tools_response = read_json_rpc_response(&mut lines, 2).await?;

    let _ = child.kill().await;

    let initialize_result = initialize_response.get("result").unwrap_or(&Value::Null);
    let tools = tools_response
        .get("result")
        .and_then(|value| value.get("tools"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|tool| AiExtensionMcpToolEntry {
            name: tool
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default()
                .to_string(),
            description: tool
                .get("description")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default()
                .to_string(),
        })
        .collect::<Vec<_>>();

    Ok(AiExtensionMcpProbeResponse {
        ok: true,
        server_id: config.entry.id.clone(),
        server_name: config.entry.name.clone(),
        transport: config.entry.transport.clone(),
        protocol_version: initialize_result
            .get("protocolVersion")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string(),
        server_label: initialize_result
            .get("serverInfo")
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_string(),
        tool_count: tools.len(),
        tools,
        error: String::new(),
    })
}

#[tauri::command]
pub async fn ai_extension_catalog_load(
    params: AiExtensionCatalogParams,
) -> Result<AiExtensionCatalogResponse, String> {
    load_extension_catalog(&params.workspace_path)
}

#[tauri::command]
pub async fn ai_extension_mcp_probe(
    params: AiExtensionMcpProbeParams,
) -> Result<AiExtensionMcpProbeResponse, String> {
    let config = resolve_mcp_server_config(&params.workspace_path, &params.server_id)?;
    if config.entry.transport != "stdio" {
        return Ok(AiExtensionMcpProbeResponse {
            ok: false,
            server_id: config.entry.id.clone(),
            server_name: config.entry.name.clone(),
            transport: config.entry.transport.clone(),
            protocol_version: String::new(),
            server_label: String::new(),
            tool_count: 0,
            tools: Vec::new(),
            error: "Only stdio MCP probing is supported in the current Phase 4 slice."
                .to_string(),
        });
    }

    match probe_stdio_mcp_server(&params.workspace_path, &config).await {
        Ok(response) => Ok(response),
        Err(error) => Ok(AiExtensionMcpProbeResponse {
            ok: false,
            server_id: config.entry.id.clone(),
            server_name: config.entry.name.clone(),
            transport: config.entry.transport.clone(),
            protocol_version: String::new(),
            server_label: String::new(),
            tool_count: 0,
            tools: Vec::new(),
            error,
        }),
    }
}
