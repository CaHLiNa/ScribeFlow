use serde_json::Value;
use url::Url;

const DEFAULT_BASE_URL: &str = "http://localhost/";

#[derive(Debug, PartialEq, Eq)]
struct ExternalHttpUrlParams {
    url: String,
    base: String,
}

fn string_payload_field(params: &Value, key: &str) -> String {
    params
        .as_object()
        .and_then(|object| object.get(key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn external_http_url_params_from_payload(params: Value) -> ExternalHttpUrlParams {
    ExternalHttpUrlParams {
        url: string_payload_field(&params, "url"),
        base: string_payload_field(&params, "base"),
    }
}

fn resolve_external_http_url(params: ExternalHttpUrlParams) -> String {
    let source = params.url.trim();
    if source.is_empty() {
        return String::new();
    }

    let base = Url::parse(params.base.trim())
        .ok()
        .or_else(|| Url::parse(DEFAULT_BASE_URL).ok());
    let Some(base) = base else {
        return String::new();
    };

    let Ok(resolved) = base.join(source) else {
        return String::new();
    };

    match resolved.scheme() {
        "http" | "https" => resolved.to_string(),
        _ => String::new(),
    }
}

#[tauri::command]
pub async fn external_http_url_resolve(params: Value) -> Result<String, String> {
    Ok(resolve_external_http_url(
        external_http_url_params_from_payload(params),
    ))
}

#[cfg(test)]
mod tests {
    use super::{external_http_url_params_from_payload, resolve_external_http_url};
    use serde_json::json;

    #[test]
    fn external_http_url_params_normalize_raw_payloads() {
        let params = external_http_url_params_from_payload(json!({
            "url": 42,
            "base": false,
        }));

        assert_eq!(
            params,
            super::ExternalHttpUrlParams {
                url: String::new(),
                base: String::new(),
            }
        );
    }

    #[test]
    fn resolves_external_http_urls_without_js_url_rules() {
        assert_eq!(
            resolve_external_http_url(super::ExternalHttpUrlParams {
                url: "/paper".to_string(),
                base: "https://example.com/root/index.html".to_string(),
            }),
            "https://example.com/paper"
        );
        assert_eq!(
            resolve_external_http_url(super::ExternalHttpUrlParams {
                url: "doi/10.1234/test".to_string(),
                base: "https://example.com/root/index.html".to_string(),
            }),
            "https://example.com/root/doi/10.1234/test"
        );
    }

    #[test]
    fn rejects_non_http_external_urls() {
        for url in ["javascript:alert(1)", "file:///tmp/a.pdf", "mailto:test@example.com"] {
            assert_eq!(
                resolve_external_http_url(super::ExternalHttpUrlParams {
                    url: url.to_string(),
                    base: "https://example.com/".to_string(),
                }),
                ""
            );
        }
    }
}
