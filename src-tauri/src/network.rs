use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
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

fn build_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for (key, value) in headers {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|e| format!("Invalid header name {key}: {e}"))?;
        let value =
            HeaderValue::from_str(value).map_err(|e| format!("Invalid header value for {key}: {e}"))?;
        map.insert(name, value);
    }
    Ok(map)
}

async fn execute_proxy_request(
    request: ApiProxyRequest,
    include_headers: bool,
) -> Result<ApiProxyResponse, String> {
    let url = validate_url(&request.url)?;
    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|e| format!("Invalid HTTP method: {e}"))?;
    let headers = build_headers(&request.headers)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(if include_headers { 60 } else { 30 }))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let mut request_builder = client.request(method, url).headers(headers);
    if !request.body.is_empty() {
        request_builder = request_builder.body(request.body);
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

#[cfg(test)]
mod tests {
    use super::validate_url;

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
}
