use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use url::Url;

const ALLOWED_HOSTS: &[&str] = &["api.crossref.org", "doi.org", "api.zotero.org"];

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
        ("authorization".to_string(), format!("Bearer {}", request.api_key)),
        ("content-type".to_string(), "application/json".to_string()),
    ]))?;
    let method = reqwest::Method::POST;
    let serialized_body = serde_json::to_string(&body)
        .map_err(|e| format!("Failed to serialize AI request body: {e}"))?;

    execute_http_request(base_url, method, headers, serialized_body, true).await
}

#[cfg(test)]
mod tests {
    use super::{validate_ai_base_url, validate_url};

    #[test]
    fn proxy_rejects_disallowed_hosts() {
        let error = validate_url("https://example.com").unwrap_err();
        assert!(error.contains("Host is not allowed"));
    }

    #[test]
    fn proxy_accepts_crossref_host() {
        let parsed = validate_url("https://api.crossref.org/works").unwrap();
        assert_eq!(parsed.host_str(), Some("api.crossref.org"));
    }

    #[test]
    fn ai_proxy_accepts_https_hosts() {
        let parsed = validate_ai_base_url("https://api.openai.com/v1").unwrap();
        assert_eq!(parsed.host_str(), Some("api.openai.com"));
    }

    #[test]
    fn ai_proxy_accepts_loopback_http() {
        let parsed = validate_ai_base_url("http://127.0.0.1:8080/v1").unwrap();
        assert_eq!(parsed.host_str(), Some("127.0.0.1"));
    }

    #[test]
    fn ai_proxy_rejects_remote_http() {
        let error = validate_ai_base_url("http://example.com/v1").unwrap_err();
        assert!(error.contains("Insecure HTTP"));
    }
}
