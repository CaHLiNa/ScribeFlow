use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub const EXTENSION_SCHEMA_VERSION: u32 = 1;
pub const CANONICAL_EXTENSION_MANIFEST_FILENAME: &str = "package.json";

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
pub struct ExtensionManifest {
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub runtime: ExtensionRuntime,
    #[serde(default)]
    pub permissions: ExtensionPermissions,
    #[serde(default)]
    pub contributes: ExtensionContributions,
    #[serde(default)]
    pub activation_events: Vec<String>,
    #[serde(default)]
    pub extension_kind: Vec<String>,
    #[serde(default)]
    pub main: String,
    #[serde(default)]
    pub engines: BTreeMap<String, String>,
    #[serde(default)]
    pub manifest_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRuntime {
    #[serde(rename = "type", default)]
    pub runtime_type: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub endpoint: String,
}

impl Default for ExtensionRuntime {
    fn default() -> Self {
        Self {
            runtime_type: "extensionHost".to_string(),
            command: String::new(),
            endpoint: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionPermissions {
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

impl Default for ExtensionPermissions {
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionContributions {
    #[serde(default)]
    pub commands: Vec<ExtensionCommandContribution>,
    #[serde(default)]
    pub keybindings: Vec<ExtensionKeybindingContribution>,
    #[serde(default)]
    pub views_containers: ExtensionViewsContainersContribution,
    #[serde(default)]
    pub views: BTreeMap<String, Vec<ExtensionViewContribution>>,
    #[serde(default)]
    pub configuration: ExtensionConfigurationContribution,
    #[serde(default)]
    pub menus: BTreeMap<String, Vec<ExtensionMenuContribution>>,
    #[serde(default)]
    pub capabilities: Vec<ExtensionCapabilityContribution>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionCommandContribution {
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub category: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionKeybindingContribution {
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub mac: String,
    #[serde(default)]
    pub win: String,
    #[serde(default)]
    pub linux: String,
    #[serde(default)]
    pub when: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionViewsContainersContribution {
    #[serde(default)]
    pub activitybar: Vec<ExtensionViewContainerContribution>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionViewContainerContribution {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub icon: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionViewContribution {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub when: String,
    #[serde(default)]
    pub contextual_title: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionConfigurationContribution {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub properties: BTreeMap<String, ExtensionConfigurationProperty>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionConfigurationProperty {
    #[serde(rename = "type", default)]
    pub property_type: String,
    #[serde(default)]
    pub default: Value,
    #[serde(default)]
    pub description: String,
    #[serde(rename = "enum", default)]
    pub enum_values: Vec<Value>,
    #[serde(default)]
    pub enum_item_labels: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionMenuContribution {
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub when: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionCapabilityContribution {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub inputs: BTreeMap<String, ExtensionInputDefinition>,
    #[serde(default)]
    pub outputs: BTreeMap<String, ExtensionOutputDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInputDefinition {
    #[serde(rename = "type", default)]
    pub input_type: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionOutputDefinition {
    #[serde(rename = "type", default)]
    pub output_type: String,
    #[serde(default)]
    pub media_type: String,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionValidationResult {
    pub ok: bool,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

impl ExtensionValidationResult {
    pub fn from_messages(warnings: Vec<String>, errors: Vec<String>) -> Self {
        Self {
            ok: errors.is_empty(),
            warnings,
            errors,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CanonicalExtensionManifest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    engines: BTreeMap<String, String>,
    #[serde(default)]
    main: String,
    #[serde(default)]
    extension_kind: Vec<String>,
    #[serde(default)]
    activation_events: Vec<String>,
    #[serde(default)]
    contributes: ExtensionContributions,
    #[serde(default)]
    permissions: ExtensionPermissions,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionManifestLoadResult {
    pub manifest: ExtensionManifest,
    pub manifest_format: String,
}

pub fn normalize_extension_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn is_valid_extension_id(value: &str) -> bool {
    let normalized = normalize_extension_id(value);
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

fn capability_produces_artifacts(capability: &str) -> bool {
    matches!(
        capability,
        "pdf.translate" | "pdf.ocr" | "document.transform"
    )
}

fn dedupe_capability_ids(capabilities: &[ExtensionCapabilityContribution]) -> Vec<String> {
    let mut seen = BTreeMap::new();
    for capability in capabilities {
        let id = capability.id.trim();
        if id.is_empty() {
            continue;
        }
        seen.entry(id.to_string()).or_insert(());
    }
    seen.into_keys().collect()
}

pub fn parse_extension_manifest_str(
    content: &str,
    filename: &str,
) -> Result<ExtensionManifestLoadResult, String> {
    if !filename.eq_ignore_ascii_case(CANONICAL_EXTENSION_MANIFEST_FILENAME) {
        return Err("Only package.json extension manifests are supported".to_string());
    }

    let raw = serde_json::from_str::<CanonicalExtensionManifest>(content)
        .map_err(|error| format!("Failed to parse manifest: {error}"))?;
    let id = normalize_extension_id(&raw.name);
    let display_name = raw.display_name.trim().to_string();
    let name = if display_name.is_empty() {
        raw.name.trim().to_string()
    } else {
        display_name.clone()
    };

    let manifest = ExtensionManifest {
        schema_version: EXTENSION_SCHEMA_VERSION,
        id,
        name,
        display_name,
        version: raw.version,
        description: raw.description,
        capabilities: dedupe_capability_ids(&raw.contributes.capabilities),
        runtime: ExtensionRuntime::default(),
        permissions: raw.permissions,
        contributes: raw.contributes,
        activation_events: raw.activation_events,
        extension_kind: raw.extension_kind,
        main: raw.main,
        engines: raw.engines,
        manifest_format: "package.json".to_string(),
    };

    Ok(ExtensionManifestLoadResult {
        manifest,
        manifest_format: "package.json".to_string(),
    })
}

pub fn validate_extension_manifest(manifest: &ExtensionManifest) -> ExtensionValidationResult {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();

    if manifest.schema_version != EXTENSION_SCHEMA_VERSION {
        errors.push(format!(
            "Unsupported schemaVersion: {}",
            manifest.schema_version
        ));
    }

    let id = normalize_extension_id(&manifest.id);
    if id.is_empty() {
        errors.push("Extension id is required".to_string());
    } else if !is_valid_extension_id(&id) {
        errors.push("Extension id must match ^[a-z0-9][a-z0-9._-]{1,63}$".to_string());
    }

    if manifest.name.trim().is_empty() {
        errors.push("Extension name is required".to_string());
    }

    if manifest.version.trim().is_empty() {
        errors.push("Extension version is required".to_string());
    }

    if manifest.main.trim().is_empty() {
        errors.push("package.json extensions require main".to_string());
    }

    if manifest.capabilities.is_empty() {
        errors.push("At least one capability is required".to_string());
    }

    for capability in &manifest.capabilities {
        if !is_known_capability(capability) {
            errors.push(format!("Unknown capability: {capability}"));
        }
    }

    if manifest.activation_events.is_empty() {
        warnings.push("Extension declares no activationEvents".to_string());
    }

    for command in &manifest.contributes.commands {
        if command.command.trim().is_empty() {
            errors.push("Contributed command id is required".to_string());
        }
        if command.title.trim().is_empty() {
            errors.push(format!(
                "Contributed command title is required: {}",
                command.command
            ));
        }
    }

    for keybinding in &manifest.contributes.keybindings {
        let command = keybinding.command.trim();
        if command.is_empty() {
            errors.push("Contributed keybinding command is required".to_string());
        } else if !manifest
            .contributes
            .commands
            .iter()
            .any(|contributed| contributed.command.trim() == command)
        {
            errors.push(format!(
                "Contributed keybinding command is not declared by this extension: {command}"
            ));
        }
        if keybinding.key.trim().is_empty()
            && keybinding.mac.trim().is_empty()
            && keybinding.win.trim().is_empty()
            && keybinding.linux.trim().is_empty()
        {
            errors.push(format!("Contributed keybinding requires a key: {command}"));
        }
    }

    for (surface, menu_entries) in &manifest.contributes.menus {
        if surface.trim().is_empty() {
            errors.push("Contributed menu surface is required".to_string());
        }
        for menu_entry in menu_entries {
            let command = menu_entry.command.trim();
            if command.is_empty() {
                errors.push(format!(
                    "Contributed menu command is required for surface: {surface}"
                ));
            } else if !manifest
                .contributes
                .commands
                .iter()
                .any(|contributed| contributed.command.trim() == command)
            {
                errors.push(format!(
                    "Contributed menu command is not declared by this extension: {command}"
                ));
            }
        }
    }

    for container in &manifest.contributes.views_containers.activitybar {
        if container.id.trim().is_empty() {
            errors.push("Contributed view container id is required".to_string());
        }
        if container.title.trim().is_empty() {
            errors.push(format!(
                "Contributed view container title is required: {}",
                container.id
            ));
        }
    }

    for (container_id, views) in &manifest.contributes.views {
        let normalized_container_id = container_id.trim();
        if normalized_container_id.is_empty() {
            errors.push("Contributed views container id is required".to_string());
            continue;
        }
        if !manifest
            .contributes
            .views_containers
            .activitybar
            .iter()
            .any(|container| container.id.trim() == normalized_container_id)
        {
            errors.push(format!(
                "Contributed views container is not declared by this extension: {normalized_container_id}"
            ));
        }

        for view in views {
            if view.id.trim().is_empty() {
                errors.push(format!(
                    "Contributed view id is required for container: {normalized_container_id}"
                ));
            }
            if view.name.trim().is_empty() {
                errors.push(format!("Contributed view name is required: {}", view.id));
            }
        }
    }

    for capability in &manifest.contributes.capabilities {
        if capability.id.trim().is_empty() {
            errors.push("Contributed capability id is required".to_string());
        } else if !manifest
            .capabilities
            .iter()
            .any(|registered| registered == &capability.id)
        {
            errors.push(format!(
                "Contributed capability is not declared by this extension: {}",
                capability.id
            ));
        }
    }

    if manifest.runtime.runtime_type != "extensionHost" {
        errors.push("Canonical extension manifests must use extensionHost runtime".to_string());
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

    for capability in &manifest.contributes.capabilities {
        for (key, input) in &capability.inputs {
            if key.trim().is_empty() {
                errors.push("Input keys must not be empty".to_string());
            }
            for extension in &input.extensions {
                if extension.trim().is_empty() {
                    errors.push(format!("Input {key} contains an empty extension"));
                }
            }
        }
    }

    if manifest.permissions.network == "optional" {
        warnings.push("Extension declares optional network access".to_string());
    }

    ExtensionValidationResult::from_messages(warnings, errors)
}

#[tauri::command]
pub async fn extension_registry_validate_manifest(
    manifest: ExtensionManifest,
) -> Result<ExtensionValidationResult, String> {
    Ok(validate_extension_manifest(&manifest))
}

#[cfg(test)]
mod tests {
    use super::{
        parse_extension_manifest_str, validate_extension_manifest, ExtensionManifest,
        CANONICAL_EXTENSION_MANIFEST_FILENAME,
    };

    fn valid_manifest() -> ExtensionManifest {
        parse_extension_manifest_str(
            &serde_json::json!({
                "name": "example-pdf-extension",
                "displayName": "Example PDF Extension",
                "version": "0.1.0",
                "description": "Example extension",
                "engines": {
                    "scribeflow": "^1.1.0"
                },
                "main": "./dist/extension.js",
                "extensionKind": ["workspace"],
                "activationEvents": ["onCapability:pdf.translate"],
                "contributes": {
                    "commands": [{
                        "command": "scribeflow.pdf.translate",
                        "title": "Translate",
                        "category": "PDF"
                    }],
                    "viewsContainers": {
                        "activitybar": [{
                            "id": "examplePdfExtension.tools",
                            "title": "PDF Tools"
                        }]
                    },
                    "views": {
                        "examplePdfExtension.tools": [{
                            "id": "examplePdfExtension.translateView",
                            "name": "Translate PDF",
                            "when": "resource.kind == pdf"
                        }]
                    },
                    "keybindings": [{
                        "command": "scribeflow.pdf.translate",
                        "key": "mod+alt+t",
                        "when": "resource.kind == pdf"
                    }],
                    "menus": {
                        "pdf.preview.actions": [{
                            "command": "scribeflow.pdf.translate",
                            "when": "resource.kind == pdf"
                        }]
                    },
                    "capabilities": [{
                        "id": "pdf.translate"
                    }]
                },
                "permissions": {
                    "readWorkspaceFiles": true,
                    "writeArtifacts": true,
                    "spawnProcess": false,
                    "network": "none"
                }
            })
            .to_string(),
            CANONICAL_EXTENSION_MANIFEST_FILENAME,
        )
        .expect("valid manifest parse")
        .manifest
    }

    #[test]
    fn accepts_canonical_extension_manifest() {
        let manifest = valid_manifest();
        let result = validate_extension_manifest(&manifest);
        assert!(result.ok, "{:?}", result.errors);
        assert_eq!(manifest.runtime.runtime_type, "extensionHost");
        assert_eq!(manifest.capabilities, vec!["pdf.translate".to_string()]);
        assert_eq!(manifest.contributes.keybindings[0].key, "mod+alt+t");
        assert_eq!(
            manifest.contributes.views_containers.activitybar[0].id,
            "examplePdfExtension.tools"
        );
        assert_eq!(
            manifest.contributes.views["examplePdfExtension.tools"][0].id,
            "examplePdfExtension.translateView"
        );
    }

    #[test]
    fn rejects_non_package_manifest_filename() {
        let result = parse_extension_manifest_str("{}", "plugin.json");
        assert!(result.is_err());
    }

    #[test]
    fn canonical_manifest_requires_main() {
        let manifest = parse_extension_manifest_str(
            &serde_json::json!({
                "name": "example-pdf-extension",
                "version": "0.1.0",
                "contributes": {
                    "capabilities": [{
                        "id": "pdf.translate"
                    }]
                }
            })
            .to_string(),
            CANONICAL_EXTENSION_MANIFEST_FILENAME,
        )
        .expect("canonical parse")
        .manifest;

        let result = validate_extension_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("require main")));
    }

    #[test]
    fn rejects_invalid_extension_id() {
        let mut manifest = valid_manifest();
        manifest.id = "../bad".to_string();
        let result = validate_extension_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("Extension id must match")));
    }

    #[test]
    fn rejects_unknown_capability() {
        let mut manifest = valid_manifest();
        manifest.capabilities = vec!["unknown.capability".to_string()];
        let result = validate_extension_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("Unknown capability")));
    }

    #[test]
    fn rejects_missing_contributed_capability_binding() {
        let mut manifest = valid_manifest();
        manifest.contributes.capabilities[0].id = "document.summarize".to_string();
        let result = validate_extension_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("Contributed capability is not declared")));
    }

    #[test]
    fn rejects_keybinding_for_unknown_command() {
        let mut manifest = valid_manifest();
        manifest.contributes.keybindings[0].command = "missing.command".to_string();
        let result = validate_extension_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("keybinding command is not declared")));
    }

    #[test]
    fn rejects_menu_for_unknown_command() {
        let mut manifest = valid_manifest();
        manifest
            .contributes
            .menus
            .get_mut("pdf.preview.actions")
            .expect("menu")
            .get_mut(0)
            .expect("menu entry")
            .command = "missing.command".to_string();
        let result = validate_extension_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("menu command is not declared")));
    }

    #[test]
    fn rejects_views_for_unknown_container() {
        let mut manifest = valid_manifest();
        let views = manifest
            .contributes
            .views
            .remove("examplePdfExtension.tools")
            .expect("views");
        manifest
            .contributes
            .views
            .insert("missing.container".to_string(), views);
        let result = validate_extension_manifest(&manifest);
        assert!(!result.ok);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("views container is not declared")));
    }
}
