use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use url::Url;

const ALLOWED_HOSTS: &[&str] = &["api.crossref.org", "doi.org", "api.zotero.org"];
const AI_PROVIDER_STREAM_EVENT: &str = "ai-provider-stream";

type StreamTaskMap = Mutex<HashMap<String, JoinHandle<()>>>;

static AI_STREAM_TASKS: OnceLock<StreamTaskMap> = OnceLock::new();

fn ai_stream_tasks() -> &'static StreamTaskMap {
    AI_STREAM_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Deserialize)]
pub struct ApiProxyRequest {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct ApiProxyResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AiChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct AiChatCompletionRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<AiChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub response_format_json: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct AiProviderStreamRequest {
    pub stream_id: String,
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiProviderStreamPayload {
    pub stream_id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
}

fn allowed_hosts() -> HashSet<&'static str> {
    ALLOWED_HOSTS.iter().copied().collect()
}

fn validate_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|e| format!("Invalid proxy URL: {e}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Proxy URL is missing host".to_string())?;
    if !allowed_hosts().contains(host) {
        return Err(format!("Host is not allowed: {host}"));
    }
    Ok(parsed)
}

fn allow_insecure_ai_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1"
}

fn validate_ai_base_url(base_url: &str) -> Result<Url, String> {
    let parsed = Url::parse(base_url).map_err(|e| format!("Invalid AI base URL: {e}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "AI base URL is missing host".to_string())?;

    match parsed.scheme() {
        "https" => Ok(parsed),
        "http" if allow_insecure_ai_host(host) => Ok(parsed),
        "http" => Err(format!(
            "Insecure HTTP is only allowed for localhost or loopback hosts, got: {host}"
        )),
        other => Err(format!("Unsupported AI URL scheme: {other}")),
    }
}

fn validate_ai_request_url(url: &str) -> Result<Url, String> {
    validate_ai_base_url(url)
}

fn build_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for (key, value) in headers {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|e| format!("Invalid header name {key}: {e}"))?;
        let value = HeaderValue::from_str(value)
            .map_err(|e| format!("Invalid header value for {key}: {e}"))?;
        map.insert(name, value);
    }
    Ok(map)
}

async fn execute_proxy_request(
    request: ApiProxyRequest,
    include_headers: bool,
) -> Result<ApiProxyResponse, String> {
    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;
    let url = validate_url(&request.url)?;
    let headers = build_headers(&request.headers)?;
    execute_http_request(url, method, headers, request.body, include_headers).await
}

async fn execute_http_request(
    url: Url,
    method: reqwest::Method,
    headers: HeaderMap,
    body: String,
    include_headers: bool,
) -> Result<ApiProxyResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(if include_headers { 60 } else { 30 }))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let mut request_builder = client.request(method, url).headers(headers);
    if !body.is_empty() {
        request_builder = request_builder.body(body);
    }

    let response = request_builder
        .send()
        .await
        .map_err(|e| format!("Proxy request failed: {e}"))?;
    let status = response.status().as_u16();
    let response_headers = if include_headers {
        response
            .headers()
            .iter()
            .map(|(name, value)| {
                (
                    name.as_str().to_ascii_lowercase(),
                    value.to_str().unwrap_or_default().to_string(),
                )
            })
            .collect()
    } else {
        HashMap::new()
    };
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read proxy response body: {e}"))?;

    Ok(ApiProxyResponse {
        status,
        body,
        headers: response_headers,
    })
}

fn emit_ai_stream_payload<R: Runtime>(app: &AppHandle<R>, payload: AiProviderStreamPayload) {
    let _ = app.emit(AI_PROVIDER_STREAM_EVENT, payload);
}

#[tauri::command]
pub async fn proxy_api_call(request: ApiProxyRequest) -> Result<String, String> {
    let response = execute_proxy_request(request, false).await?;
    if !(200..300).contains(&response.status) {
        return Err(format!("Proxy request returned HTTP {}", response.status));
    }
    Ok(response.body)
}

#[tauri::command]
pub async fn proxy_api_call_full(request: ApiProxyRequest) -> Result<ApiProxyResponse, String> {
    execute_proxy_request(request, true).await
}

#[tauri::command]
pub async fn proxy_ai_chat_completion(
    request: AiChatCompletionRequest,
) -> Result<ApiProxyResponse, String> {
    let mut base_url = validate_ai_base_url(&request.base_url)?;
    let current_path = base_url.path().trim_end_matches('/').to_string();
    let next_path = if current_path.is_empty() {
        "/chat/completions".to_string()
    } else {
        format!("{current_path}/chat/completions")
    };
    base_url.set_path(&next_path);

    let body = if request.response_format_json.unwrap_or(false) {
        json!({
            "model": request.model,
            "messages": request.messages,
            "temperature": request.temperature.unwrap_or(0.2),
            "max_tokens": request.max_tokens.unwrap_or(1400),
            "response_format": { "type": "json_object" },
        })
    } else {
        json!({
            "model": request.model,
            "messages": request.messages,
            "temperature": request.temperature.unwrap_or(0.2),
            "max_tokens": request.max_tokens.unwrap_or(1400),
        })
    };

    let headers = build_headers(&HashMap::from([
        (
            "authorization".to_string(),
            format!("Bearer {}", request.api_key),
        ),
        ("content-type".to_string(), "application/json".to_string()),
    ]))?;
    let method = reqwest::Method::POST;
    let serialized_body = serde_json::to_string(&body)
        .map_err(|e| format!("Failed to serialize AI request body: {e}"))?;

    execute_http_request(base_url, method, headers, serialized_body, true).await
}

#[tauri::command]
pub async fn start_ai_provider_stream<R: Runtime>(
    app: AppHandle<R>,
    request: AiProviderStreamRequest,
) -> Result<(), String> {
    let stream_id = request.stream_id.trim().to_string();
    if stream_id.is_empty() {
        return Err("AI stream id is required".to_string());
    }

    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|e| format!("Invalid AI stream HTTP method: {e}"))?;
    let url = validate_ai_request_url(&request.url)?;
    let headers = build_headers(&request.headers)?;
    let body = request.body.clone();

    let mut tasks = ai_stream_tasks().lock().await;
    if let Some(existing) = tasks.remove(&stream_id) {
        existing.abort();
    }

    let app_for_task = app.clone();
    let stream_id_for_task = stream_id.clone();

    let handle = tokio::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                emit_ai_stream_payload(
                    &app_for_task,
                    AiProviderStreamPayload {
                        stream_id: stream_id_for_task.clone(),
                        kind: "error".to_string(),
                        chunk: None,
                        error: Some(format!("Failed to build AI stream client: {error}")),
                        status: None,
                        headers: None,
                    },
                );
                return;
            }
        };

        let mut request_builder = client.request(method, url).headers(headers);
        if !body.is_empty() {
            request_builder = request_builder.body(body);
        }

        let response = match request_builder.send().await {
            Ok(response) => response,
            Err(error) => {
                emit_ai_stream_payload(
                    &app_for_task,
                    AiProviderStreamPayload {
                        stream_id: stream_id_for_task.clone(),
                        kind: "error".to_string(),
                        chunk: None,
                        error: Some(format!("AI stream request failed: {error}")),
                        status: None,
                        headers: None,
                    },
                );
                let _ = ai_stream_tasks().lock().await.remove(&stream_id_for_task);
                return;
            }
        };

        let status = response.status().as_u16();
        let response_headers = response
            .headers()
            .iter()
            .map(|(name, value)| {
                (
                    name.as_str().to_ascii_lowercase(),
                    value.to_str().unwrap_or_default().to_string(),
                )
            })
            .collect::<HashMap<_, _>>();

        emit_ai_stream_payload(
            &app_for_task,
            AiProviderStreamPayload {
                stream_id: stream_id_for_task.clone(),
                kind: "start".to_string(),
                chunk: None,
                error: None,
                status: Some(status),
                headers: Some(response_headers),
            },
        );

        if !(200..300).contains(&status) {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown AI stream error".to_string());
            emit_ai_stream_payload(
                &app_for_task,
                AiProviderStreamPayload {
                    stream_id: stream_id_for_task.clone(),
                    kind: "error".to_string(),
                    chunk: None,
                    error: Some(error_text),
                    status: Some(status),
                    headers: None,
                },
            );
            let _ = ai_stream_tasks().lock().await.remove(&stream_id_for_task);
            return;
        }

        let mut response_stream = response.bytes_stream();
        while let Some(chunk_result) = response_stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    let chunk = String::from_utf8_lossy(&bytes).to_string();
                    if chunk.is_empty() {
                        continue;
                    }
                    emit_ai_stream_payload(
                        &app_for_task,
                        AiProviderStreamPayload {
                            stream_id: stream_id_for_task.clone(),
                            kind: "chunk".to_string(),
                            chunk: Some(chunk),
                            error: None,
                            status: None,
                            headers: None,
                        },
                    );
                }
                Err(error) => {
                    emit_ai_stream_payload(
                        &app_for_task,
                        AiProviderStreamPayload {
                            stream_id: stream_id_for_task.clone(),
                            kind: "error".to_string(),
                            chunk: None,
                            error: Some(format!("Failed while reading AI stream: {error}")),
                            status: Some(status),
                            headers: None,
                        },
                    );
                    let _ = ai_stream_tasks().lock().await.remove(&stream_id_for_task);
                    return;
                }
            }
        }

        emit_ai_stream_payload(
            &app_for_task,
            AiProviderStreamPayload {
                stream_id: stream_id_for_task.clone(),
                kind: "done".to_string(),
                chunk: None,
                error: None,
                status: Some(status),
                headers: None,
            },
        );
        let _ = ai_stream_tasks().lock().await.remove(&stream_id_for_task);
    });

    tasks.insert(stream_id, handle);
    Ok(())
}

#[tauri::command]
pub async fn abort_ai_provider_stream(stream_id: String) -> Result<(), String> {
    let normalized_stream_id = stream_id.trim().to_string();
    if normalized_stream_id.is_empty() {
        return Ok(());
    }

    if let Some(handle) = ai_stream_tasks().lock().await.remove(&normalized_stream_id) {
        handle.abort();
    }

    Ok(())
}
