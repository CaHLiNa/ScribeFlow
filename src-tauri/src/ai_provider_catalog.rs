use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;
use url::form_urlencoded::byte_serialize;

use crate::ai_config::{
    normalize_ai_provider_id, normalize_base_url, normalize_model, normalize_provider_config,
    provider_definition, provider_uses_automatic_model, resolve_ai_provider_model,
    ProviderDefinition, PROVIDER_DEFINITIONS,
};

fn provider_definition_payload(definition: ProviderDefinition) -> Value {
    json!({
        "id": definition.id,
        "label": definition.label,
        "defaultBaseUrl": definition.default_base_url,
        "defaultModel": definition.default_model,
        "modelPlaceholder": definition.model_placeholder,
        "baseUrlHint": definition.base_url_hint,
        "usesAutomaticModel": provider_uses_automatic_model(definition.id),
    })
}

fn normalize_openai_base_url(base_url: &str) -> String {
    let mut normalized = normalize_base_url(base_url);
    let suffix = "/chat/completions";
    if normalized.to_lowercase().ends_with(suffix) {
        normalized.truncate(normalized.len() - suffix.len());
    }
    normalized
}

fn normalize_anthropic_base_url(base_url: &str) -> String {
    let mut normalized = normalize_base_url(base_url);
    let suffix = "/messages";
    if normalized.to_lowercase().ends_with(suffix) {
        normalized.truncate(normalized.len() - suffix.len());
    }
    if !normalized.to_lowercase().ends_with("/v1") {
        normalized = format!("{normalized}/v1");
    }
    normalized
}

fn normalize_google_base_url(base_url: &str) -> String {
    let mut normalized = normalize_base_url(base_url);
    let lower = normalized.to_lowercase();
    if lower.ends_with("/v1beta/openai") {
        normalized.truncate(normalized.len() - "/v1beta/openai".len());
        return normalized;
    }
    if lower.ends_with("/v1beta") {
        normalized.truncate(normalized.len() - "/v1beta".len());
    }
    normalized
}

fn provider_requires_api_key(provider_id: &str, provider_config: &Value) -> bool {
    let normalized_provider_id = normalize_ai_provider_id(provider_id);
    if normalized_provider_id != "anthropic" {
        return true;
    }

    provider_config["sdk"]["runtimeMode"]
        .as_str()
        .unwrap_or("sdk")
        != "sdk"
}

fn resolve_provider_state_value(
    provider_id: &str,
    provider_config: &Value,
    api_key: &str,
) -> Value {
    let normalized_provider_id = normalize_ai_provider_id(provider_id);
    let definition = provider_definition(&normalized_provider_id);
    let normalized_config =
        normalize_provider_config(&normalized_provider_id, Some(provider_config));
    let model = resolve_ai_provider_model(&normalized_provider_id, Some(&normalized_config));
    let requires_api_key = provider_requires_api_key(&normalized_provider_id, &normalized_config);
    let ready = !normalize_base_url(normalized_config["baseUrl"].as_str().unwrap_or("")).is_empty()
        && !normalize_model(&model).is_empty()
        && (!requires_api_key || !api_key.trim().is_empty());

    json!({
        "providerId": definition.id,
        "label": definition.label,
        "ready": ready,
        "requiresApiKey": requires_api_key,
        "usesAutomaticModel": provider_uses_automatic_model(definition.id),
        "baseUrl": normalized_config["baseUrl"].as_str().unwrap_or(""),
        "model": model,
        "approvalMode": normalized_config["sdk"]["approvalMode"].as_str().unwrap_or("per-tool"),
        "definition": provider_definition_payload(definition),
        "config": normalized_config,
    })
}

async fn request_json(
    url: String,
    method: reqwest::Method,
    headers: Vec<(&str, String)>,
    body: Option<Value>,
) -> Result<Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Failed to build AI provider client: {error}"))?;
    let mut request = client.request(method, url);

    for (name, value) in headers {
        request = request.header(name, value);
    }

    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("AI provider request failed: {error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Failed to read AI provider response: {error}"))?;
    let parsed = serde_json::from_str::<Value>(&text).ok();

    if !status.is_success() {
        let detail = parsed
            .as_ref()
            .and_then(|value| value["error"]["message"].as_str())
            .or_else(|| parsed.as_ref().and_then(|value| value["message"].as_str()))
            .unwrap_or(text.trim());
        return Err(if detail.is_empty() {
            format!("AI request failed with HTTP {}", status.as_u16())
        } else {
            detail.to_string()
        });
    }

    parsed.ok_or_else(|| "AI provider response is not valid JSON.".to_string())
}

fn sort_options(options: &mut [Value]) {
    options.sort_by(|left, right| {
        let left_label = left["label"]
            .as_str()
            .or_else(|| left["value"].as_str())
            .unwrap_or("");
        let right_label = right["label"]
            .as_str()
            .or_else(|| right["value"].as_str())
            .unwrap_or("");
        left_label.cmp(right_label)
    });
}

fn normalize_openai_model_options(payload: &Value) -> Vec<Value> {
    let mut options = payload["data"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            let value = entry["id"].as_str().unwrap_or("").trim();
            if value.is_empty() {
                return None;
            }
            Some(json!({
                "value": value,
                "label": value,
            }))
        })
        .collect::<Vec<_>>();
    sort_options(&mut options);
    options
}

fn normalize_anthropic_model_options(payload: &Value) -> Vec<Value> {
    let mut options = payload["data"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            let value = entry["id"].as_str().unwrap_or("").trim();
            if value.is_empty() {
                return None;
            }
            Some(json!({
                "value": value,
                "label": entry["display_name"].as_str().unwrap_or(value).trim(),
            }))
        })
        .collect::<Vec<_>>();
    sort_options(&mut options);
    options
}

fn normalize_google_model_options(payload: &Value) -> Vec<Value> {
    let mut options = payload["models"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            let methods = entry["supportedGenerationMethods"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let supports_generation = methods.iter().any(|method| {
                matches!(
                    method.as_str().unwrap_or(""),
                    "generateContent" | "streamGenerateContent"
                )
            });
            if !supports_generation {
                return None;
            }

            let raw_name = entry["name"].as_str().unwrap_or("").trim();
            let value = raw_name.strip_prefix("models/").unwrap_or(raw_name).trim();
            if value.is_empty() {
                return None;
            }

            Some(json!({
                "value": value,
                "label": entry["displayName"].as_str().unwrap_or(value).trim(),
            }))
        })
        .collect::<Vec<_>>();
    sort_options(&mut options);
    options
}

async fn list_provider_models(
    provider_id: &str,
    provider_config: &Value,
    api_key: &str,
) -> Result<Vec<Value>, String> {
    let normalized_provider_id = normalize_ai_provider_id(provider_id);
    let normalized_config =
        normalize_provider_config(&normalized_provider_id, Some(provider_config));
    let base_url = normalized_config["baseUrl"].as_str().unwrap_or("").trim();

    if base_url.is_empty() {
        return Err("AI base URL is missing.".to_string());
    }

    match normalized_provider_id.as_str() {
        "anthropic" => {
            if api_key.trim().is_empty() {
                return Err("AI API key is missing.".to_string());
            }
            let payload = request_json(
                format!("{}/models", normalize_anthropic_base_url(base_url)),
                reqwest::Method::GET,
                vec![
                    ("x-api-key", api_key.trim().to_string()),
                    ("anthropic-version", "2023-06-01".to_string()),
                ],
                None,
            )
            .await?;
            Ok(normalize_anthropic_model_options(&payload))
        }
        "google" => {
            if api_key.trim().is_empty() {
                return Err("AI API key is missing.".to_string());
            }
            let payload = request_json(
                format!(
                    "{}/v1beta/models?key={}",
                    normalize_google_base_url(base_url),
                    byte_serialize(api_key.trim().as_bytes()).collect::<String>()
                ),
                reqwest::Method::GET,
                vec![],
                None,
            )
            .await?;
            Ok(normalize_google_model_options(&payload))
        }
        _ => {
            let mut headers = vec![];
            if !api_key.trim().is_empty() {
                headers.push(("authorization", format!("Bearer {}", api_key.trim())));
            }
            let payload = request_json(
                format!("{}/models", normalize_openai_base_url(base_url)),
                reqwest::Method::GET,
                headers,
                None,
            )
            .await?;
            Ok(normalize_openai_model_options(&payload))
        }
    }
}

#[tauri::command]
pub async fn ai_provider_catalog_list() -> Result<Value, String> {
    Ok(json!({
        "providers": PROVIDER_DEFINITIONS
            .iter()
            .copied()
            .map(provider_definition_payload)
            .collect::<Vec<_>>(),
    }))
}

#[tauri::command]
pub async fn ai_provider_state_resolve(
    provider_id: String,
    provider_config: Value,
    api_key: String,
) -> Result<Value, String> {
    Ok(resolve_provider_state_value(
        &provider_id,
        &provider_config,
        &api_key,
    ))
}

#[tauri::command]
pub async fn ai_provider_models_list(
    provider_id: String,
    provider_config: Value,
    api_key: String,
) -> Result<Value, String> {
    let options = list_provider_models(&provider_id, &provider_config, &api_key).await?;
    Ok(json!({ "options": options }))
}

#[tauri::command]
pub async fn ai_provider_connection_test(
    provider_id: String,
    provider_config: Value,
    api_key: String,
) -> Result<Value, String> {
    let state = resolve_provider_state_value(&provider_id, &provider_config, &api_key);
    if !state["ready"].as_bool().unwrap_or(false) {
        return Err(if state["requiresApiKey"].as_bool().unwrap_or(true) {
            "Agent runtime is not ready. Configure the provider, model, and API key before sending."
                .to_string()
        } else {
            "Agent runtime is not ready. Configure the provider and model before sending."
                .to_string()
        });
    }

    let _ = list_provider_models(&provider_id, &provider_config, &api_key).await?;
    Ok(json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_state_marks_anthropic_sdk_mode_ready_without_key() {
        let state = resolve_provider_state_value(
            "anthropic",
            &json!({
                "baseUrl": "https://api.anthropic.com/v1",
                "model": "claude-sonnet-4-5",
                "sdk": {
                    "runtimeMode": "sdk",
                }
            }),
            "",
        );

        assert_eq!(state["providerId"].as_str(), Some("anthropic"));
        assert_eq!(state["ready"].as_bool(), Some(true));
        assert_eq!(state["requiresApiKey"].as_bool(), Some(false));
    }

    #[test]
    fn provider_state_keeps_custom_provider_manual_model_behavior() {
        let state = resolve_provider_state_value(
            "custom",
            &json!({
                "baseUrl": "http://127.0.0.1:11434/v1",
                "model": "my-local-model"
            }),
            "token",
        );

        assert_eq!(state["providerId"].as_str(), Some("custom"));
        assert_eq!(state["usesAutomaticModel"].as_bool(), Some(false));
        assert_eq!(state["model"].as_str(), Some("my-local-model"));
    }
}
