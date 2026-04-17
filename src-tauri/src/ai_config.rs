use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;

use crate::app_dirs;

const AI_CONFIG_VERSION: i64 = 5;
const DEFAULT_TEMPERATURE: f64 = 0.2;
const CONFIGURABLE_AI_TOOL_IDS: &[&str] = &["delete-workspace-path"];

#[derive(Debug, Clone, Copy)]
pub(crate) struct ProviderDefinition {
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    pub(crate) default_base_url: &'static str,
    pub(crate) default_model: &'static str,
    pub(crate) model_placeholder: &'static str,
    pub(crate) base_url_hint: &'static str,
}

pub(crate) const PROVIDER_DEFINITIONS: &[ProviderDefinition] = &[
    ProviderDefinition {
        id: "anthropic",
        label: "Anthropic",
        default_base_url: "https://api.anthropic.com/v1",
        default_model: "claude-sonnet-4-5",
        model_placeholder: "claude-sonnet-4-5",
        base_url_hint: "https://api.anthropic.com/v1",
    },
    ProviderDefinition {
        id: "openai",
        label: "OpenAI",
        default_base_url: "https://api.openai.com/v1",
        default_model: "gpt-5",
        model_placeholder: "gpt-5",
        base_url_hint: "https://api.openai.com/v1",
    },
    ProviderDefinition {
        id: "google",
        label: "Google Gemini",
        default_base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        default_model: "gemini-2.5-flash",
        model_placeholder: "gemini-2.5-flash",
        base_url_hint: "https://generativelanguage.googleapis.com/v1beta/openai",
    },
    ProviderDefinition {
        id: "deepseek",
        label: "DeepSeek",
        default_base_url: "https://api.deepseek.com/v1",
        default_model: "deepseek-chat",
        model_placeholder: "deepseek-chat",
        base_url_hint: "https://api.deepseek.com/v1",
    },
    ProviderDefinition {
        id: "glm",
        label: "GLM",
        default_base_url: "https://open.bigmodel.cn/api/paas/v4",
        default_model: "glm-4.5",
        model_placeholder: "glm-4.5",
        base_url_hint: "https://open.bigmodel.cn/api/paas/v4",
    },
    ProviderDefinition {
        id: "kimi",
        label: "Kimi",
        default_base_url: "https://api.moonshot.cn/v1",
        default_model: "kimi-k2-0711-preview",
        model_placeholder: "kimi-k2-0711-preview",
        base_url_hint: "https://api.moonshot.cn/v1",
    },
    ProviderDefinition {
        id: "minimax",
        label: "MiniMax",
        default_base_url: "https://api.minimax.io/v1",
        default_model: "MiniMax-M1",
        model_placeholder: "MiniMax-M1",
        base_url_hint: "https://api.minimax.io/v1",
    },
    ProviderDefinition {
        id: "custom",
        label: "Third-party / Custom",
        default_base_url: "",
        default_model: "",
        model_placeholder: "your-model-id",
        base_url_hint: "http://127.0.0.1:8080/v1 or https://your-endpoint/v1",
    },
];

fn ai_config_path() -> Result<PathBuf, String> {
    Ok(app_dirs::data_root_dir()?.join("ai.json"))
}

pub(crate) fn normalize_ai_provider_id(value: &str) -> String {
    let normalized = value.trim().to_lowercase();
    if normalized.is_empty() {
        return "openai".to_string();
    }
    if normalized == "openai-compatible" {
        return "openai".to_string();
    }
    if PROVIDER_DEFINITIONS
        .iter()
        .any(|definition| definition.id == normalized)
    {
        return normalized;
    }
    "custom".to_string()
}

pub(crate) fn provider_definition(provider_id: &str) -> ProviderDefinition {
    let normalized = normalize_ai_provider_id(provider_id);
    PROVIDER_DEFINITIONS
        .iter()
        .copied()
        .find(|definition| definition.id == normalized)
        .unwrap_or(PROVIDER_DEFINITIONS[PROVIDER_DEFINITIONS.len() - 1])
}

pub(crate) fn normalize_base_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

pub(crate) fn normalize_model(value: &str) -> String {
    value.trim().to_string()
}

pub(crate) fn normalize_temperature(value: Option<f64>) -> f64 {
    let parsed = value.unwrap_or(DEFAULT_TEMPERATURE);
    if !parsed.is_finite() {
        return DEFAULT_TEMPERATURE;
    }
    parsed.clamp(0.0, 1.5)
}

fn normalize_enabled_tool_ids(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|entries| {
            let mut normalized = Vec::new();
            for entry in entries {
                let tool_id = entry.as_str().unwrap_or_default().trim();
                if tool_id.is_empty()
                    || !CONFIGURABLE_AI_TOOL_IDS
                        .iter()
                        .any(|allowed| allowed == &tool_id)
                {
                    continue;
                }
                if !normalized.iter().any(|existing| existing == tool_id) {
                    normalized.push(tool_id.to_string());
                }
            }
            normalized
        })
        .unwrap_or_default()
}

fn normalize_string_map(value: &Value) -> Value {
    let mut next = Map::new();
    if let Some(entries) = value.as_object() {
        for (key, value) in entries {
            let normalized_key = normalize_ai_provider_id(key);
            let normalized_value = value.as_str().unwrap_or_default().trim();
            if !normalized_key.is_empty() && !normalized_value.is_empty() {
                next.insert(normalized_key, Value::String(normalized_value.to_string()));
            }
        }
    }
    Value::Object(next)
}

fn default_anthropic_tool_policies() -> Map<String, Value> {
    [
        ("Read", "allow"),
        ("Glob", "allow"),
        ("Grep", "allow"),
        ("LS", "allow"),
        ("WebFetch", "ask"),
        ("TodoWrite", "ask"),
        ("Edit", "ask"),
        ("MultiEdit", "ask"),
        ("Write", "ask"),
        ("Bash", "deny"),
    ]
    .into_iter()
    .map(|(key, value)| (key.to_string(), Value::String(value.to_string())))
    .collect()
}

fn normalize_policy_value(value: Option<&str>) -> &'static str {
    match value.unwrap_or("ask").trim() {
        "allow" => "allow",
        "deny" => "deny",
        _ => "ask",
    }
}

pub(crate) fn normalize_anthropic_sdk_config(value: Option<&Value>) -> Value {
    let value = value.unwrap_or(&Value::Null);
    let runtime_mode = match value
        .get("runtimeMode")
        .and_then(Value::as_str)
        .unwrap_or("sdk")
        .trim()
    {
        "http" => "http",
        _ => "sdk",
    };
    let approval_mode = match value
        .get("approvalMode")
        .and_then(Value::as_str)
        .unwrap_or("per-tool")
        .trim()
    {
        "plan" => "plan",
        _ => "per-tool",
    };
    let auto_allow_all = value
        .get("autoAllowAll")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let mut tool_policies = default_anthropic_tool_policies();
    if let Some(entries) = value.get("toolPolicies").and_then(Value::as_object) {
        for (tool_name, policy) in entries {
            if tool_policies.contains_key(tool_name) {
                tool_policies.insert(
                    tool_name.to_string(),
                    Value::String(normalize_policy_value(policy.as_str()).to_string()),
                );
            }
        }
    }

    json!({
        "runtimeMode": runtime_mode,
        "approvalMode": approval_mode,
        "autoAllowAll": auto_allow_all,
        "toolPolicies": Value::Object(tool_policies),
    })
}

pub(crate) fn provider_uses_automatic_model(provider_id: &str) -> bool {
    provider_definition(provider_id).id != "custom"
}

pub(crate) fn resolve_ai_provider_model(provider_id: &str, provider_config: Option<&Value>) -> String {
    let normalized_provider_id = normalize_ai_provider_id(provider_id);
    let definition = provider_definition(&normalized_provider_id);
    let config = provider_config.unwrap_or(&Value::Null);
    if provider_uses_automatic_model(&normalized_provider_id) {
        return normalize_model(
            config
                .get("model")
                .and_then(Value::as_str)
                .unwrap_or(definition.default_model),
        );
    }
    normalize_model(config.get("model").and_then(Value::as_str).unwrap_or(""))
}

pub(crate) fn build_default_provider_config(provider_id: &str) -> Value {
    let definition = provider_definition(provider_id);
    let mut config = json!({
        "providerId": definition.id,
        "baseUrl": definition.default_base_url,
        "model": resolve_ai_provider_model(definition.id, None),
        "temperature": DEFAULT_TEMPERATURE,
    });
    if definition.id == "anthropic" {
        config["sdk"] = normalize_anthropic_sdk_config(None);
    }
    config
}

pub(crate) fn normalize_provider_config(provider_id: &str, config: Option<&Value>) -> Value {
    let definition = provider_definition(provider_id);
    let defaults = build_default_provider_config(definition.id);
    let config = config.unwrap_or(&Value::Null);
    let mut next = json!({
        "providerId": definition.id,
        "baseUrl": normalize_base_url(
            config.get("baseUrl").and_then(Value::as_str).unwrap_or(
                defaults.get("baseUrl").and_then(Value::as_str).unwrap_or("")
            )
        ),
        "model": if provider_uses_automatic_model(definition.id) {
            defaults.get("model").and_then(Value::as_str).unwrap_or("").to_string()
        } else {
            normalize_model(
                config.get("model").and_then(Value::as_str).unwrap_or(
                    defaults.get("model").and_then(Value::as_str).unwrap_or("")
                )
            )
        },
        "temperature": normalize_temperature(
            config.get("temperature").and_then(Value::as_f64)
                .or_else(|| defaults.get("temperature").and_then(Value::as_f64))
        ),
    });
    if definition.id == "anthropic" {
        next["sdk"] = normalize_anthropic_sdk_config(
            config.get("sdk").or_else(|| config.get("anthropicSdk")),
        );
    }
    next
}

fn create_default_ai_config() -> Value {
    let providers = PROVIDER_DEFINITIONS
        .iter()
        .map(|definition| {
            (
                definition.id.to_string(),
                build_default_provider_config(definition.id),
            )
        })
        .collect::<Map<String, Value>>();

    json!({
        "version": AI_CONFIG_VERSION,
        "currentProviderId": "openai",
        "enabledTools": [],
        "providers": Value::Object(providers),
    })
}

fn normalize_ai_config(raw_config: Option<&Value>) -> Value {
    let raw_config = raw_config.unwrap_or(&Value::Null);
    let defaults = create_default_ai_config();
    let legacy_current_provider_id = normalize_ai_provider_id(
        raw_config
            .get("currentProviderId")
            .or_else(|| raw_config.get("currentProvider"))
            .or_else(|| raw_config.get("providerId"))
            .or_else(|| raw_config.get("provider"))
            .and_then(Value::as_str)
            .unwrap_or("openai"),
    );
    let legacy_provider_config = if raw_config.get("providers").is_none()
        && (raw_config.get("baseUrl").is_some()
            || raw_config.get("model").is_some()
            || raw_config.get("temperature").is_some()
            || raw_config.get("provider").is_some())
    {
        Some(normalize_provider_config("openai", Some(raw_config)))
    } else {
        None
    };

    let providers = PROVIDER_DEFINITIONS
        .iter()
        .map(|definition| {
            let next_config = raw_config
                .get("providers")
                .and_then(|providers| providers.get(definition.id))
                .or_else(|| {
                    if definition.id == "openai" {
                        legacy_provider_config.as_ref()
                    } else {
                        None
                    }
                });
            (
                definition.id.to_string(),
                normalize_provider_config(definition.id, next_config),
            )
        })
        .collect::<Map<String, Value>>();

    let mut credential_storage =
        normalize_string_map(raw_config.get("_credentialStorage").unwrap_or(&Value::Null));
    if let Some(value) = raw_config.get("_credentialStorage").and_then(Value::as_str) {
        credential_storage["openai"] = Value::String(value.trim().to_string());
    }

    let mut api_key_fallbacks =
        normalize_string_map(raw_config.get("_apiKeyFallbacks").unwrap_or(&Value::Null));
    if let Some(value) = raw_config.get("_apiKeyFallback").and_then(Value::as_str) {
        api_key_fallbacks["openai"] = Value::String(value.trim().to_string());
    }

    json!({
        "version": AI_CONFIG_VERSION,
        "currentProviderId": if legacy_current_provider_id.is_empty() {
            defaults.get("currentProviderId").cloned().unwrap_or(Value::String("openai".to_string()))
        } else {
            Value::String(legacy_current_provider_id)
        },
        "enabledTools": normalize_enabled_tool_ids(raw_config.get("enabledTools").unwrap_or(&Value::Null)),
        "providers": Value::Object(providers),
        "_credentialStorage": credential_storage,
        "_apiKeyFallbacks": api_key_fallbacks,
    })
}

fn sanitize_public_ai_config(config: &Value) -> Value {
    let normalized = normalize_ai_config(Some(config));
    json!({
        "version": AI_CONFIG_VERSION,
        "currentProviderId": normalize_ai_provider_id(
            normalized.get("currentProviderId").and_then(Value::as_str).unwrap_or("openai")
        ),
        "enabledTools": normalize_enabled_tool_ids(normalized.get("enabledTools").unwrap_or(&Value::Null)),
        "providers": normalized.get("providers").cloned().unwrap_or_else(|| create_default_ai_config()["providers"].clone()),
    })
}

fn read_ai_config_raw() -> Result<Option<Value>, String> {
    let path = ai_config_path()?;
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to read AI config: {error}")),
    };
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|error| format!("Failed to parse AI config: {error}"))
}

fn write_ai_config_raw(config: Option<&Value>) -> Result<(), String> {
    let path = ai_config_path()?;
    if config.is_none() {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Failed to delete AI config: {error}"))?;
        }
        return Ok(());
    }
    let content = serde_json::to_string_pretty(config.unwrap())
        .map_err(|error| format!("Failed to serialize AI config: {error}"))?;
    fs::write(&path, content).map_err(|error| format!("Failed to write AI config: {error}"))
}

#[tauri::command]
pub async fn ai_config_load() -> Result<Value, String> {
    let normalized = normalize_ai_config(read_ai_config_raw()?.as_ref());
    Ok(sanitize_public_ai_config(&normalized))
}

#[tauri::command]
pub async fn ai_config_load_internal() -> Result<Value, String> {
    Ok(normalize_ai_config(read_ai_config_raw()?.as_ref()))
}

#[tauri::command]
pub async fn ai_config_save(config: Value) -> Result<Value, String> {
    let raw_config = normalize_ai_config(read_ai_config_raw()?.as_ref());
    let sanitized = sanitize_public_ai_config(&config);
    let next = json!({
        "version": AI_CONFIG_VERSION,
        "currentProviderId": sanitized.get("currentProviderId").cloned().unwrap_or(Value::String("openai".to_string())),
        "enabledTools": sanitized.get("enabledTools").cloned().unwrap_or(Value::Array(vec![])),
        "providers": sanitized.get("providers").cloned().unwrap_or_else(|| create_default_ai_config()["providers"].clone()),
        "_apiKeyFallbacks": raw_config.get("_apiKeyFallbacks").cloned().unwrap_or_else(|| json!({})),
        "_credentialStorage": raw_config.get("_credentialStorage").cloned().unwrap_or_else(|| json!({})),
    });
    write_ai_config_raw(Some(&next))?;
    Ok(sanitize_public_ai_config(&next))
}

#[tauri::command]
pub async fn ai_config_save_internal(config: Value) -> Result<Value, String> {
    let normalized = normalize_ai_config(Some(&config));
    write_ai_config_raw(Some(&normalized))?;
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_ai_config_migrates_legacy_single_provider_shape() {
        let config = normalize_ai_config(Some(&json!({
            "provider": "openai-compatible",
            "baseUrl": "https://api.openai.com/v1/",
            "model": "gpt-4.1-mini",
            "temperature": 0.4,
            "_apiKeyFallback": "sk-legacy",
            "_credentialStorage": "mirrored-file-fallback"
        })));

        assert_eq!(config["currentProviderId"].as_str(), Some("openai"));
        assert_eq!(
            config["providers"]["openai"]["baseUrl"].as_str(),
            Some("https://api.openai.com/v1")
        );
        assert_eq!(
            config["providers"]["openai"]["model"].as_str(),
            Some("gpt-5")
        );
        assert_eq!(
            config["_apiKeyFallbacks"]["openai"].as_str(),
            Some("sk-legacy")
        );
        assert_eq!(
            config["_credentialStorage"]["openai"].as_str(),
            Some("mirrored-file-fallback")
        );
    }

    #[test]
    fn normalize_ai_config_only_preserves_configurable_risky_tools() {
        let config = normalize_ai_config(Some(&json!({
            "enabledTools": ["read-workspace-file", "delete-workspace-path"]
        })));
        let enabled = config["enabledTools"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        assert_eq!(enabled.len(), 1);
        assert_eq!(enabled[0].as_str(), Some("delete-workspace-path"));
    }
}
