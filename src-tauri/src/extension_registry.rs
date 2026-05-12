use crate::app_dirs;
use crate::extension_manifest::{
    normalize_extension_id, parse_extension_manifest_str, validate_extension_manifest,
    ExtensionManifest, ExtensionPermissions, ExtensionRuntime,
    CANONICAL_EXTENSION_MANIFEST_FILENAME,
};
use crate::i18n_runtime::resolve_effective_locale;
use crate::workspace_preferences::{read_workspace_preferences, WorkspacePreferences};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRegistryListParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub locale: String,
}

fn registry_param_string(params: &Value, camel_key: &str, snake_key: &str) -> String {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn extension_registry_list_params_from_payload(params: Value) -> ExtensionRegistryListParams {
    ExtensionRegistryListParams {
        global_config_dir: registry_param_string(&params, "globalConfigDir", "global_config_dir"),
        workspace_root: registry_param_string(&params, "workspaceRoot", "workspace_root"),
        locale: registry_param_string(&params, "locale", "locale"),
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRegistryEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub capabilities: Vec<String>,
    pub runtime: ExtensionRuntime,
    pub permissions: ExtensionPermissions,
    pub scope: String,
    pub path: String,
    pub status: String,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
    pub manifest: Option<ExtensionManifest>,
    pub manifest_format: String,
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

pub fn global_extensions_root(global_config_dir: &str) -> Result<PathBuf, String> {
    let normalized = normalize_root(global_config_dir);
    if normalized.is_empty() {
        return app_dirs::extensions_dir();
    }
    let dir = Path::new(&normalized).join("extensions");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    }
    Ok(dir)
}

pub fn workspace_extensions_root(workspace_root: &str) -> Option<PathBuf> {
    let normalized = normalize_root(workspace_root);
    if normalized.is_empty() {
        return None;
    }
    Some(
        Path::new(&normalized)
            .join(".scribeflow")
            .join("extensions"),
    )
}

fn invalid_entry(
    scope: &str,
    manifest_path: &Path,
    id_hint: &str,
    error: String,
) -> ExtensionRegistryEntry {
    ExtensionRegistryEntry {
        id: normalize_extension_id(id_hint),
        name: id_hint.to_string(),
        version: String::new(),
        description: String::new(),
        capabilities: Vec::new(),
        runtime: ExtensionRuntime::default(),
        permissions: ExtensionPermissions::default(),
        scope: scope.to_string(),
        path: manifest_path.to_string_lossy().to_string(),
        status: "invalid".to_string(),
        warnings: Vec::new(),
        errors: vec![error],
        manifest: None,
        manifest_format: CANONICAL_EXTENSION_MANIFEST_FILENAME.to_string(),
    }
}

fn locale_for_registry(global_config_dir: &str, requested_locale: &str) -> String {
    let requested = requested_locale.trim();
    if !requested.is_empty() {
        return resolve_effective_locale(requested);
    }
    let preferred = read_workspace_preferences(global_config_dir)
        .ok()
        .flatten()
        .map(|preferences| preferences.preferred_locale)
        .unwrap_or_else(|| WorkspacePreferences::default().preferred_locale);
    resolve_effective_locale(&preferred)
}

fn read_nls_file(path: &Path) -> BTreeMap<String, String> {
    let Ok(content) = fs::read_to_string(path) else {
        return BTreeMap::new();
    };
    serde_json::from_str::<BTreeMap<String, String>>(&content).unwrap_or_default()
}

fn load_extension_nls_messages(extension_dir: &Path, locale: &str) -> BTreeMap<String, String> {
    let mut messages = read_nls_file(&extension_dir.join("package.nls.json"));
    let locale = locale.trim();
    if !locale.is_empty() {
        messages.extend(read_nls_file(
            &extension_dir.join(format!("package.nls.{locale}.json")),
        ));
    }
    messages
}

fn localize_string(value: &str, messages: &BTreeMap<String, String>) -> String {
    let trimmed = value.trim();
    if trimmed.len() > 2 && trimmed.starts_with('%') && trimmed.ends_with('%') {
        let key = &trimmed[1..trimmed.len() - 1];
        return messages
            .get(key)
            .cloned()
            .unwrap_or_else(|| value.to_string());
    }
    value.to_string()
}

fn localize_json_value(value: &mut Value, messages: &BTreeMap<String, String>) {
    match value {
        Value::String(text) => {
            *text = localize_string(text, messages);
        }
        Value::Array(items) => {
            for item in items {
                localize_json_value(item, messages);
            }
        }
        Value::Object(object) => {
            for value in object.values_mut() {
                localize_json_value(value, messages);
            }
        }
        _ => {}
    }
}

fn localize_manifest(
    manifest: &ExtensionManifest,
    messages: &BTreeMap<String, String>,
) -> ExtensionManifest {
    if messages.is_empty() {
        return manifest.clone();
    }
    let mut value = serde_json::to_value(manifest).unwrap_or(Value::Null);
    localize_json_value(&mut value, messages);
    serde_json::from_value::<ExtensionManifest>(value).unwrap_or_else(|_| manifest.clone())
}

fn status_for_manifest(_manifest: &ExtensionManifest, errors: &[String]) -> String {
    if !errors.is_empty() {
        if errors.iter().any(|error| {
            error.contains("Unsupported runtime")
                || error.contains("requires")
                || error.contains("permission")
        }) {
            return "blocked".to_string();
        }
        return "invalid".to_string();
    }
    "available".to_string()
}

fn load_entry(scope: &str, extension_dir: &Path, locale: &str) -> Option<ExtensionRegistryEntry> {
    let manifest_path = extension_dir.join(CANONICAL_EXTENSION_MANIFEST_FILENAME);
    if !manifest_path.exists() {
        return None;
    }

    let id_hint = extension_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("extension");

    let content = match fs::read_to_string(&manifest_path) {
        Ok(content) => content,
        Err(error) => {
            return Some(invalid_entry(
                scope,
                &manifest_path,
                id_hint,
                format!("Failed to read manifest: {error}"),
            ))
        }
    };

    let parsed = match parse_extension_manifest_str(&content, CANONICAL_EXTENSION_MANIFEST_FILENAME)
    {
        Ok(parsed) => parsed,
        Err(error) => return Some(invalid_entry(scope, &manifest_path, id_hint, error)),
    };

    let raw_manifest = parsed.manifest;
    let validation = validate_extension_manifest(&raw_manifest);
    let status = status_for_manifest(&raw_manifest, &validation.errors);
    let manifest_messages = load_extension_nls_messages(extension_dir, locale);
    let manifest = localize_manifest(&raw_manifest, &manifest_messages);
    let id = if raw_manifest.id.trim().is_empty() {
        normalize_extension_id(id_hint)
    } else {
        normalize_extension_id(&raw_manifest.id)
    };

    Some(ExtensionRegistryEntry {
        id,
        name: manifest.name.clone(),
        version: manifest.version.clone(),
        description: manifest.description.clone(),
        capabilities: manifest.capabilities.clone(),
        runtime: manifest.runtime.clone(),
        permissions: manifest.permissions.clone(),
        scope: scope.to_string(),
        path: manifest_path.to_string_lossy().to_string(),
        status,
        warnings: validation.warnings,
        errors: validation.errors,
        manifest: Some(manifest),
        manifest_format: parsed.manifest_format,
    })
}

fn scan_root(scope: &str, root: &Path, locale: &str) -> Vec<ExtensionRegistryEntry> {
    if !root.exists() {
        return Vec::new();
    }

    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };

    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .filter_map(|path| load_entry(scope, &path, locale))
        .collect()
}

pub fn list_extension_registry(
    params: &ExtensionRegistryListParams,
) -> Result<Vec<ExtensionRegistryEntry>, String> {
    let global_root = global_extensions_root(&params.global_config_dir)?;
    let locale = locale_for_registry(&params.global_config_dir, &params.locale);
    let mut by_id = BTreeMap::<String, ExtensionRegistryEntry>::new();

    for entry in scan_root("global", &global_root, &locale) {
        by_id.insert(entry.id.clone(), entry);
    }

    if let Some(workspace_root) = workspace_extensions_root(&params.workspace_root) {
        for mut entry in scan_root("workspace", &workspace_root, &locale) {
            if by_id.contains_key(&entry.id) {
                entry.warnings.push(
                    "Workspace extension overrides a global extension with the same id".to_string(),
                );
            }
            by_id.insert(entry.id.clone(), entry);
        }
    }

    Ok(by_id.into_values().collect())
}

pub fn find_extension_entry(
    global_config_dir: &str,
    workspace_root: &str,
    extension_id: &str,
) -> Result<ExtensionRegistryEntry, String> {
    let normalized = normalize_extension_id(extension_id);
    list_extension_registry(&ExtensionRegistryListParams {
        global_config_dir: global_config_dir.to_string(),
        workspace_root: workspace_root.to_string(),
        locale: String::new(),
    })?
    .into_iter()
    .find(|entry| entry.id == normalized)
    .ok_or_else(|| format!("Extension not found: {extension_id}"))
}

#[tauri::command]
pub async fn extension_registry_list(params: Value) -> Result<Vec<ExtensionRegistryEntry>, String> {
    let params = extension_registry_list_params_from_payload(params);
    list_extension_registry(&params)
}

#[cfg(test)]
mod tests {
    use super::{
        extension_registry_list_params_from_payload, list_extension_registry,
        ExtensionRegistryListParams,
    };
    use crate::extension_manifest::CANONICAL_EXTENSION_MANIFEST_FILENAME;
    use std::fs;

    fn write_canonical_manifest(dir: &std::path::Path, id: &str, main: &str) {
        fs::create_dir_all(dir).expect("create extension dir");
        fs::write(
            dir.join(CANONICAL_EXTENSION_MANIFEST_FILENAME),
            serde_json::json!({
                "name": id,
                "displayName": id,
                "version": "1.0.0",
                "description": "Example extension",
                "engines": {
                    "scribeflow": "^1.1.0"
                },
                "main": main,
                "extensionKind": ["workspace"],
                "activationEvents": ["onCommand:test.command"],
                "contributes": {
                    "commands": [{
                        "command": "test.command",
                        "title": "Test Command"
                    }],
                    "capabilities": [{
                        "id": "pdf.translate"
                    }]
                },
                "permissions": {
                    "readWorkspaceFiles": true,
                    "spawnProcess": false
                }
            })
            .to_string(),
        )
        .expect("write manifest");
    }

    #[test]
    fn registry_list_params_normalize_raw_payloads() {
        let params = extension_registry_list_params_from_payload(serde_json::json!({
            "globalConfigDir": " /tmp/global-config ",
            "workspaceRoot": " /tmp/workspace ",
            "locale": " zh-CN "
        }));
        assert_eq!(params.global_config_dir, "/tmp/global-config");
        assert_eq!(params.workspace_root, "/tmp/workspace");
        assert_eq!(params.locale, "zh-CN");

        let snake_params = extension_registry_list_params_from_payload(serde_json::json!({
            "global_config_dir": " /tmp/global-snake ",
            "workspace_root": " /tmp/workspace-snake ",
            "locale": 42
        }));
        assert_eq!(snake_params.global_config_dir, "/tmp/global-snake");
        assert_eq!(snake_params.workspace_root, "/tmp/workspace-snake");
        assert_eq!(snake_params.locale, "");

        let fallback_params = extension_registry_list_params_from_payload(serde_json::json!(false));
        assert_eq!(fallback_params.global_config_dir, "");
        assert_eq!(fallback_params.workspace_root, "");
        assert_eq!(fallback_params.locale, "");
    }

    #[test]
    fn registry_discovers_global_and_workspace_extensions() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-registry-{}",
            uuid::Uuid::new_v4()
        ));
        let global = root.join("global");
        let workspace = root.join("workspace");
        let global_extension = global.join("extensions").join("global-extension");
        let workspace_extension = workspace
            .join(".scribeflow")
            .join("extensions")
            .join("workspace-extension");
        write_canonical_manifest(&global_extension, "global-extension", "./dist/extension.js");
        write_canonical_manifest(
            &workspace_extension,
            "workspace-extension",
            "./dist/extension.js",
        );

        let entries = list_extension_registry(&ExtensionRegistryListParams {
            global_config_dir: global.to_string_lossy().to_string(),
            workspace_root: workspace.to_string_lossy().to_string(),
            locale: String::new(),
        })
        .expect("list registry");

        assert_eq!(entries.len(), 2);
        assert!(entries
            .iter()
            .any(|entry| entry.scope == "global" && entry.status == "available"));
        assert!(entries
            .iter()
            .any(|entry| entry.scope == "workspace" && entry.status == "available"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn workspace_extension_overrides_global_extension() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-registry-override-{}",
            uuid::Uuid::new_v4()
        ));
        let global = root.join("global");
        let workspace = root.join("workspace");
        let global_extension = global.join("extensions").join("example-extension");
        let workspace_extension = workspace
            .join(".scribeflow")
            .join("extensions")
            .join("example-extension");
        write_canonical_manifest(
            &global_extension,
            "example-extension",
            "./dist/extension.js",
        );
        write_canonical_manifest(
            &workspace_extension,
            "example-extension",
            "./dist/extension.js",
        );

        let entries = list_extension_registry(&ExtensionRegistryListParams {
            global_config_dir: global.to_string_lossy().to_string(),
            workspace_root: workspace.to_string_lossy().to_string(),
            locale: String::new(),
        })
        .expect("list registry");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].scope, "workspace");
        assert!(entries[0].warnings.contains(
            &"Workspace extension overrides a global extension with the same id".to_string()
        ));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn registry_discovers_canonical_extension_manifest() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-registry-canonical-{}",
            uuid::Uuid::new_v4()
        ));
        let global = root.join("global");
        let extension = global.join("extensions").join("canonical-extension");
        write_canonical_manifest(&extension, "canonical-extension", "./dist/extension.js");

        let entries = list_extension_registry(&ExtensionRegistryListParams {
            global_config_dir: global.to_string_lossy().to_string(),
            workspace_root: String::new(),
            locale: String::new(),
        })
        .expect("list registry");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].manifest_format, "package.json");
        assert_eq!(entries[0].status, "available");
        assert_eq!(entries[0].runtime.runtime_type, "extensionHost");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn registry_localizes_manifest_from_extension_nls_files() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-registry-nls-{}",
            uuid::Uuid::new_v4()
        ));
        let global = root.join("global");
        let extension = global.join("extensions").join("localized-extension");
        fs::create_dir_all(&extension).expect("create extension dir");
        fs::write(
            extension.join(CANONICAL_EXTENSION_MANIFEST_FILENAME),
            serde_json::json!({
                "name": "localized-extension",
                "displayName": "%extension.displayName%",
                "version": "1.0.0",
                "description": "%extension.description%",
                "engines": {
                    "scribeflow": "^1.1.0"
                },
                "main": "./dist/extension.js",
                "extensionKind": ["workspace"],
                "activationEvents": ["onCommand:localized.command"],
                "contributes": {
                    "commands": [{
                        "command": "localized.command",
                        "title": "%command.title%"
                    }],
                    "capabilities": [{
                        "id": "pdf.translate"
                    }],
                    "configuration": {
                        "properties": {
                            "localized.apiKey": {
                                "type": "string",
                                "title": "%setting.apiKey.title%",
                                "description": "%setting.apiKey.description%",
                                "secureStorage": true
                            }
                        }
                    }
                },
                "permissions": {
                    "readWorkspaceFiles": true
                }
            })
            .to_string(),
        )
        .expect("write manifest");
        fs::write(
            extension.join("package.nls.zh-CN.json"),
            serde_json::json!({
                "extension.displayName": "本地化扩展",
                "extension.description": "来自插件语言包的描述",
                "command.title": "运行本地化命令",
                "setting.apiKey.title": "插件密钥",
                "setting.apiKey.description": "插件自己的密钥说明"
            })
            .to_string(),
        )
        .expect("write nls");

        let entries = list_extension_registry(&ExtensionRegistryListParams {
            global_config_dir: global.to_string_lossy().to_string(),
            workspace_root: String::new(),
            locale: "zh-CN".to_string(),
        })
        .expect("list registry");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "本地化扩展");
        assert_eq!(entries[0].description, "来自插件语言包的描述");
        let manifest = entries[0].manifest.as_ref().expect("manifest");
        assert_eq!(manifest.contributes.commands[0].title, "运行本地化命令");
        assert_eq!(
            manifest
                .contributes
                .configuration
                .properties
                .get("localized.apiKey")
                .expect("setting")
                .title,
            "插件密钥"
        );
        assert_eq!(
            manifest
                .contributes
                .configuration
                .properties
                .get("localized.apiKey")
                .expect("setting")
                .description,
            "插件自己的密钥说明"
        );
        fs::remove_dir_all(root).ok();
    }
}
