use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub const PLUGIN_SCHEMA_VERSION: u32 = 1;

pub const KNOWN_CAPABILITIES: &[&str] = &[
    "pdf.translate",
    "pdf.ocr",
    "pdf.extractText",
    "reference.enrich",
    "reference.import",
    "document.summarize",
    "document.transform",
    "workspace.index",
    "llm.chat",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub runtime: PluginRuntime,
    #[serde(default)]
    pub permissions: PluginPermissions,
    #[serde(default)]
    pub settings_schema: BTreeMap<String, PluginSettingDefinition>,
    #[serde(default)]
    pub inputs: BTreeMap<String, PluginInputDefinition>,
    #[serde(default)]
    pub outputs: BTreeMap<String, PluginOutputDefinition>,
    #[serde(default)]
    pub ui: PluginUiContributions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntime {
    #[serde(rename = "type", default)]
    pub runtime_type: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub endpoint: String,
}

impl Default for PluginRuntime {
    fn default() -> Self {
        Self {
            runtime_type: String::new(),
            command: String::new(),
            endpoint: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginPermissions {
    #[serde(default)]
    pub read_workspace_files: bool,
    #[serde(default)]
    pub read_reference_library: bool,
    #[serde(default)]
    pub write_artifacts: bool,
    #[serde(default)]
    pub write_reference_metadata: bool,
    #[serde(default)]
    pub spawn_process: bool,
    #[serde(default = "default_network_permission")]
    pub network: String,
}

impl Default for PluginPermissions {
    fn default() -> Self {
        Self {
            read_workspace_files: false,
            read_reference_library: false,
            write_artifacts: false,
            write_reference_metadata: false,
            spawn_process: false,
            network: default_network_permission(),
        }
    }
}

fn default_network_permission() -> String {
    "none".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettingDefinition {
    #[serde(rename = "type", default)]
    pub setting_type: String,
    #[serde(default)]
    pub default: Value,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub options: Vec<PluginSettingOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettingOption {
    #[serde(default)]
    pub value: Value,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginUiContributions {
    #[serde(default)]
    pub actions: Vec<PluginUiAction>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginUiAction {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub surface: String,
    #[serde(default)]
    pub capability: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginInputDefinition {
    #[serde(rename = "type", default)]
    pub input_type: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginOutputDefinition {
    #[serde(rename = "type", default)]
    pub output_type: String,
    #[serde(default)]
    pub media_type: String,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginValidationResult {
    pub ok: bool,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

impl PluginValidationResult {
    pub fn from_messages(warnings: Vec<String>, errors: Vec<String>) -> Self {
        Self {
            ok: errors.is_empty(),
            warnings,
            errors,
        }
    }
}

pub fn normalize_plugin_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn is_valid_plugin_id(value: &str) -> bool {
    let normalized = normalize_plugin_id(value);
    let len = normalized.len();
    if !(2..=64).contains(&len) {
        return false;
    }

    let mut chars = normalized.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() && !first.is_ascii_digit() {
        return false;
    }
    normalized
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '.' | '_' | '-'))
}

pub fn is_known_capability(value: &str) -> bool {
    KNOWN_CAPABILITIES.contains(&value.trim())
}

pub fn is_safe_cli_command_name(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed != value {
        return false;
    }
    if trimmed.contains("&&")
        || trimmed.contains('|')
        || trimmed.contains(';')
        || trimmed.contains('\n')
        || trimmed.contains('\r')
        || trimmed.chars().any(char::is_whitespace)
    {
        return false;
    }
    if std::path::Path::new(trimmed).is_absolute() {
        return false;
    }

    trimmed.split(['/', '\\']).all(|component| {
        !component.is_empty()
            && component != "."
            && component != ".."
            && component.chars().all(|ch| {
                ch.is_ascii_lowercase()
                    || ch.is_ascii_uppercase()
                    || ch.is_ascii_digit()
                    || matches!(ch, '.' | '_' | '-')
            })
    })
}

fn capability_produces_artifacts(capability: &str) -> bool {
    matches!(
        capability,
        "pdf.translate" | "pdf.ocr" | "document.transform"
    )
}

pub fn validate_plugin_manifest(manifest: &PluginManifest) -> PluginValidationResult {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();

    if manifest.schema_version != PLUGIN_SCHEMA_VERSION {
        errors.push(format!(
            "Unsupported schemaVersion: {}",
            manifest.schema_version
        ));
    }

    let id = normalize_plugin_id(&manifest.id);
    if id.is_empty() {
        errors.push("Plugin id is required".to_string());
    } else if !is_valid_plugin_id(&id) {
        errors.push("Plugin id must match ^[a-z0-9][a-z0-9._-]{1,63}$".to_string());
    }

    if manifest.name.trim().is_empty() {
        errors.push("Plugin name is required".to_string());
    }

    if manifest.version.trim().is_empty() {
        errors.push("Plugin version is required".to_string());
    }

    if manifest.capabilities.is_empty() {
        errors.push("At least one capability is required".to_string());
    }

    for capability in &manifest.capabilities {
        if !is_known_capability(capability) {
            errors.push(format!("Unknown capability: {capability}"));
        }
    }

    for action in &manifest.ui.actions {
        if action.id.trim().is_empty() {
            errors.push("UI action id is required".to_string());
        }
        if action.surface.trim().is_empty() {
            errors.push("UI action surface is required".to_string());
        }
        if !manifest
            .capabilities
            .iter()
            .any(|capability| capability == &action.capability)
        {
            errors.push(format!(
                "UI action capability is not provided by this plugin: {}",
                action.capability
            ));
        }
    }

    match manifest.runtime.runtime_type.trim() {
        "cli" => {
            if !is_safe_cli_command_name(&manifest.runtime.command) {
                errors.push("cli.command must be a safe executable name".to_string());
            }
            if !manifest.permissions.spawn_process {
                errors.push("CLI runtime requires spawnProcess permission".to_string());
            }
        }
        "http" | "mcp" | "builtin" => {
            errors.push(format!(
                "Unsupported runtime for v1: {}",
                manifest.runtime.runtime_type
            ));
        }
        "" => errors.push("runtime.type is required".to_string()),
        other => errors.push(format!("Unknown runtime type: {other}")),
    }

    match manifest.permissions.network.as_str() {
        "none" | "optional" | "required" => {}
        other => errors.push(format!("Unsupported network permission: {other}")),
    }

    if manifest
        .capabilities
        .iter()
        .any(|capability| capability_produces_artifacts(capability))
        && !manifest.permissions.write_artifacts
    {
        errors
            .push("Artifact-producing capabilities require writeArtifacts permission".to_string());
    }

    for (key, input) in &manifest.inputs {
        if key.trim().is_empty() {
            errors.push("Input keys must not be empty".to_string());
        }
        for extension in &input.extensions {
            if extension.trim().is_empty() {
                errors.push(format!("Input {key} contains an empty extension"));
            }
        }
    }

    for (key, setting) in &manifest.settings_schema {
        if key.trim().is_empty() {
            errors.push("Setting keys must not be empty".to_string());
        }
        if !matches!(
            setting.setting_type.as_str(),
            "string" | "boolean" | "number" | "integer"
        ) {
            warnings.push(format!(
                "Unknown optional settings field type for {key}: {}",
                setting.setting_type
            ));
        }
    }

    if manifest.permissions.network == "optional" {
        warnings.push("Plugin declares optional network access".to_string());
    }

    PluginValidationResult::from_messages(warnings, errors)
}

#[tauri::command]
pub async fn plugin_registry_validate_manifest(
    manifest: PluginManifest,
) -> Result<PluginValidationResult, String> {
    Ok(validate_plugin_manifest(&manifest))
}

#[cfg(test)]
mod tests {
    use super::{validate_plugin_manifest, PluginManifest};

    fn valid_manifest() -> PluginManifest {
        serde_json::from_value(serde_json::json!({
            "schemaVersion": 1,
            "id": "pdfmathtranslate",
            "name": "PDFMathTranslate",
            "version": "1.0.0",
            "description": "Translate PDFs",
            "capabilities": ["pdf.translate"],
            "runtime": {
                "type": "cli",
                "command": "bin/scribeflow-pdf-translator"
            },
            "permissions": {
                "readWorkspaceFiles": true,
                "readReferenceLibrary": true,
                "writeArtifacts": true,
                "writeReferenceMetadata": false,
                "spawnProcess": true,
                "network": "optional"
            },
            "inputs": {
                "pdfPath": {
                    "type": "file",
                    "required": true,
                    "extensions": ["pdf"]
                }
            },
            "outputs": {
                "bilingualPdf": {
                    "type": "artifact",
                    "mediaType": "application/pdf",
                    "required": false
                }
            },
            "ui": {
                "actions": [{
                    "id": "translate-pdf",
                    "surface": "pdf.preview.actions",
                    "capability": "pdf.translate",
                    "label": "Translate",
                    "icon": "bolt"
                }]
            }
        }))
        .expect("valid manifest json")
    }

    #[test]
    fn accepts_valid_pdf_translate_manifest() {
        let result = validate_plugin_manifest(&valid_manifest());
        assert!(result.ok, "{:?}", result.errors);
        assert!(result
            .warnings
            .contains(&"Plugin declares optional network access".to_string()));
    }

    #[test]
    fn rejects_invalid_plugin_id() {
        let mut manifest = valid_manifest();
        manifest.id = "../bad".to_string();
        let result = validate_plugin_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("Plugin id must match")));
    }

    #[test]
    fn rejects_reserved_runtime_for_v1() {
        let mut manifest = valid_manifest();
        manifest.runtime.runtime_type = "http".to_string();
        let result = validate_plugin_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("Unsupported runtime")));
    }

    #[test]
    fn rejects_cli_without_spawn_permission() {
        let mut manifest = valid_manifest();
        manifest.permissions.spawn_process = false;
        let result = validate_plugin_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .contains(&"CLI runtime requires spawnProcess permission".to_string()));
    }

    #[test]
    fn rejects_unsafe_cli_command_name() {
        let mut manifest = valid_manifest();
        manifest.runtime.command = "pdf2zh && rm".to_string();
        let result = validate_plugin_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .contains(&"cli.command must be a safe executable name".to_string()));
    }

    #[test]
    fn accepts_relative_plugin_runner_path() {
        let mut manifest = valid_manifest();
        manifest.runtime.command = "bin/scribeflow-pdf-translator".to_string();
        let result = validate_plugin_manifest(&manifest);
        assert!(result.ok, "{:?}", result.errors);
    }

    #[test]
    fn rejects_parent_dir_plugin_runner_path() {
        let mut manifest = valid_manifest();
        manifest.runtime.command = "../runner".to_string();
        let result = validate_plugin_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .contains(&"cli.command must be a safe executable name".to_string()));
    }

    #[test]
    fn rejects_ui_action_for_missing_capability() {
        let mut manifest = valid_manifest();
        manifest.ui.actions[0].capability = "document.summarize".to_string();
        let result = validate_plugin_manifest(&manifest);
        assert!(!result.ok);
        assert!(result.errors.iter().any(|error| {
            error.contains("UI action capability is not provided by this plugin")
        }));
    }
}
