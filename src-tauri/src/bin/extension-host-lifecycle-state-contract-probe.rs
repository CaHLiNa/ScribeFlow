use scribeflow_lib::{
    extension_host_activate_by_id_for_probe, extension_host_deactivate_for_probe,
    extension_host_invoke_probe_request, extension_settings_load_runtime_state_snapshot_for_probe,
    extension_settings_load_with_state_for_probe, extension_settings_save_for_probe,
    ExtensionHostRequest, ExtensionHostResponse, ExtensionHostState, ExtensionSettings,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_temp_dir() -> Result<PathBuf, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to read current time: {error}"))?
        .as_millis();
    let root =
        std::env::temp_dir().join(format!("scribeflow-extension-host-lifecycle-state-{now}"));
    fs::create_dir_all(&root).map_err(|error| {
        format!(
            "Failed to create probe temp root {}: {error}",
            root.display()
        )
    })?;
    Ok(root)
}

fn write_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create parent directory {}: {error}",
                parent.display()
            )
        })?;
    }
    fs::write(path, content)
        .map_err(|error| format!("Failed to write file {}: {error}", path.display()))
}

fn build_probe_extension(workspace_root: &Path) -> Result<PathBuf, String> {
    let extension_root = workspace_root
        .join(".scribeflow")
        .join("extensions")
        .join("example-lifecycle-state-contract-extension");
    let manifest_path = extension_root.join("package.json");
    let entry_path = extension_root.join("dist").join("extension.js");
    let manifest = json!({
        "name": "example-lifecycle-state-contract-extension",
        "displayName": "Example Lifecycle State Contract Extension",
        "version": "0.1.0",
        "type": "module",
        "main": "./dist/extension.js",
        "activationEvents": [
            "onCommand:exampleLifecycleStateContractExtension.capture",
            "onCommand:exampleLifecycleStateContractExtension.bump",
            "onCommand:exampleLifecycleStateContractExtension.crash"
        ],
        "contributes": {
            "commands": [
                {
                    "command": "exampleLifecycleStateContractExtension.capture",
                    "title": "Capture Lifecycle State"
                },
                {
                    "command": "exampleLifecycleStateContractExtension.bump",
                    "title": "Bump Lifecycle State"
                },
                {
                    "command": "exampleLifecycleStateContractExtension.crash",
                    "title": "Crash Lifecycle State Host"
                }
            ]
        },
        "permissions": {
            "readWorkspaceFiles": true
        }
    });
    let source = r#"
let activationCount = 0
let deactivationCount = 0

function snapshotState(context) {
  return {
    activationCount,
    deactivationCount,
    globalCount: Number(context.globalState.get('globalCount') || 0),
    workspaceCount: Number(context.workspaceState.get('workspaceCount') || 0),
    targetLang: context.settings.get('exampleLifecycleStateContractExtension.targetLang', '__missing__'),
    theme: context.settings.get('exampleLifecycleStateContractExtension.theme', '__missing__'),
  }
}

export async function activate(context) {
  activationCount += 1

  context.commands.registerCommand('exampleLifecycleStateContractExtension.capture', async () => ({
    message: 'lifecycle state captured',
    progressLabel: 'Lifecycle state captured',
    taskState: 'succeeded',
    outputs: [
      {
        id: 'lifecycle-state-snapshot',
        type: 'inlineText',
        mediaType: 'application/json',
        title: 'Lifecycle State Snapshot',
        text: JSON.stringify(snapshotState(context)),
      },
    ],
  }))

  context.commands.registerCommand('exampleLifecycleStateContractExtension.bump', async () => {
    const nextGlobal = Number(context.globalState.get('globalCount') || 0) + 1
    const nextWorkspace = Number(context.workspaceState.get('workspaceCount') || 0) + 1
    context.globalState.update('globalCount', nextGlobal)
    context.workspaceState.update('workspaceCount', nextWorkspace)
    return {
      message: 'lifecycle state bumped',
      progressLabel: 'Lifecycle state bumped',
      taskState: 'succeeded',
      outputs: [
        {
          id: 'lifecycle-state-snapshot',
          type: 'inlineText',
          mediaType: 'application/json',
          title: 'Lifecycle State Snapshot',
          text: JSON.stringify(snapshotState(context)),
        },
      ],
    }
  })

  context.commands.registerCommand('exampleLifecycleStateContractExtension.crash', async () => {
    process.exit(1)
  })
}

export async function deactivate() {
  deactivationCount += 1
}
"#;

    write_file(
        &manifest_path,
        &serde_json::to_string_pretty(&manifest).map_err(|error| {
            format!("Failed to serialize lifecycle state probe manifest: {error}")
        })?,
    )?;
    write_file(&entry_path, source)?;
    Ok(manifest_path)
}

fn base_envelope(workspace_root: &str, command_id: &str) -> Value {
    json!({
        "taskId": format!("task-{command_id}"),
        "extensionId": "example-lifecycle-state-contract-extension",
        "workspaceRoot": workspace_root,
        "commandId": command_id,
        "itemId": "",
        "itemHandle": "",
        "referenceId": "",
        "capability": "",
        "targetKind": "workspace",
        "targetPath": workspace_root,
        "settingsJson": "{}"
    })
}

fn execute_command(
    state: &ExtensionHostState,
    workspace_root: &str,
    manifest_path: &str,
    command_id: &str,
) -> Result<ExtensionHostResponse, String> {
    extension_host_invoke_probe_request(
        state,
        ExtensionHostRequest::ExecuteCommand {
            activation_event: format!("onCommand:{command_id}"),
            extension_path: Path::new(manifest_path)
                .parent()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
            manifest_path: manifest_path.to_string(),
            main_entry: "./dist/extension.js".to_string(),
            command_id: command_id.to_string(),
            envelope: serde_json::from_value(base_envelope(workspace_root, command_id))
                .map_err(|error| format!("Failed to build execution envelope: {error}"))?,
        },
    )
}

fn output_text(response: &ExtensionHostResponse, output_id: &str) -> Result<String, String> {
    match response {
        ExtensionHostResponse::ExecuteCommand(result) => result
            .outputs
            .iter()
            .find(|entry| entry.id == output_id)
            .map(|entry| entry.text.clone())
            .ok_or_else(|| format!("Missing output {output_id}")),
        _ => Err("Unexpected non-command response when reading output".to_string()),
    }
}

fn parse_snapshot(response: &ExtensionHostResponse, label: &str) -> Result<Value, String> {
    let text = output_text(response, "lifecycle-state-snapshot")?;
    serde_json::from_str::<Value>(&text)
        .map_err(|error| format!("Failed to parse {label} lifecycle snapshot JSON: {error}"))
}

fn build_settings(target_lang: &str, theme: Option<&str>) -> ExtensionSettings {
    let mut extension_config = BTreeMap::new();
    let mut config = serde_json::Map::new();
    config.insert(
        "exampleLifecycleStateContractExtension.targetLang".to_string(),
        Value::String(target_lang.to_string()),
    );
    if let Some(theme) = theme {
        config.insert(
            "exampleLifecycleStateContractExtension.theme".to_string(),
            Value::String(theme.to_string()),
        );
    }
    extension_config.insert(
        "example-lifecycle-state-contract-extension".to_string(),
        Value::Object(config),
    );
    ExtensionSettings {
        enabled_extension_ids: vec!["example-lifecycle-state-contract-extension".to_string()],
        extension_config,
    }
}

fn expect_snapshot(actual: Value, expected: Value, label: &str) -> Result<(), String> {
    if actual == expected {
        return Ok(());
    }
    Err(format!(
        "{label} lifecycle snapshot drifted\nexpected: {}\nactual: {}",
        serde_json::to_string_pretty(&expected).unwrap_or_else(|_| expected.to_string()),
        serde_json::to_string_pretty(&actual).unwrap_or_else(|_| actual.to_string()),
    ))
}

fn main() -> Result<(), String> {
    let probe_root = unique_temp_dir()?;
    let workspace_root = probe_root.join("workspace-a");
    let workspace_root_b = probe_root.join("workspace-b");
    let global_config_dir = probe_root.join("global-config");
    fs::create_dir_all(&workspace_root)
        .map_err(|error| format!("Failed to create workspace A: {error}"))?;
    fs::create_dir_all(&workspace_root_b)
        .map_err(|error| format!("Failed to create workspace B: {error}"))?;
    fs::create_dir_all(&global_config_dir)
        .map_err(|error| format!("Failed to create global config dir: {error}"))?;

    let manifest_path = build_probe_extension(&workspace_root)?;
    let manifest_path_b = build_probe_extension(&workspace_root_b)?;
    let workspace_root_text = workspace_root.to_string_lossy().to_string();
    let workspace_root_b_text = workspace_root_b.to_string_lossy().to_string();
    let global_config_dir_text = global_config_dir.to_string_lossy().to_string();

    let initial_settings = build_settings("zh-CN", None);
    let updated_settings = build_settings("en", Some("solarized-light"));
    extension_settings_save_for_probe(
        &global_config_dir_text,
        &workspace_root_text,
        initial_settings,
    )?;

    let state = ExtensionHostState::default();
    let activated = extension_host_activate_by_id_for_probe(
        &state,
        &global_config_dir_text,
        &workspace_root_text,
        "example-lifecycle-state-contract-extension",
        "onCommand:exampleLifecycleStateContractExtension.bump",
    )?;
    if !activated.activated {
        return Err(format!(
            "Lifecycle state extension did not activate for workspace A: {}",
            activated.reason
        ));
    }

    let first_bump = execute_command(
        &state,
        &workspace_root_text,
        &manifest_path.to_string_lossy(),
        "exampleLifecycleStateContractExtension.bump",
    )?;
    let first_snapshot = parse_snapshot(&first_bump, "initial")?;
    expect_snapshot(
        first_snapshot.clone(),
        json!({
            "activationCount": 1,
            "deactivationCount": 0,
            "globalCount": 1,
            "workspaceCount": 1,
            "targetLang": "zh-CN",
            "theme": "__missing__",
        }),
        "initial",
    )?;

    extension_settings_save_for_probe(
        &global_config_dir_text,
        &workspace_root_text,
        updated_settings.clone(),
    )?;
    let saved_settings = extension_settings_load_with_state_for_probe(
        &global_config_dir_text,
        &workspace_root_text,
        true,
    )?;
    let saved_config = saved_settings
        .settings
        .extension_config
        .get("example-lifecycle-state-contract-extension")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if saved_config
        .get("exampleLifecycleStateContractExtension.targetLang")
        .and_then(Value::as_str)
        != Some("en")
        || saved_config
            .get("exampleLifecycleStateContractExtension.theme")
            .and_then(Value::as_str)
            != Some("solarized-light")
    {
        return Err(format!(
            "Persisted extension settings drifted after save: {}",
            Value::Object(saved_config)
        ));
    }

    let settings_update = extension_host_invoke_probe_request(
        &state,
        ExtensionHostRequest::UpdateSettings {
            extension_id: "example-lifecycle-state-contract-extension".to_string(),
            workspace_root: workspace_root_text.clone(),
            settings: serde_json::to_value(
                updated_settings
                    .extension_config
                    .get("example-lifecycle-state-contract-extension")
                    .cloned()
                    .unwrap_or(Value::Object(Default::default())),
            )
            .map_err(|error| format!("Failed to serialize updated runtime settings: {error}"))?,
        },
    )?;
    match settings_update {
        ExtensionHostResponse::AcknowledgeSettingsUpdate(result) if result.accepted => {}
        ExtensionHostResponse::AcknowledgeSettingsUpdate(result) => {
            return Err(format!(
                "Runtime settings update was not accepted: {:?}",
                result.changed_keys
            ));
        }
        _ => return Err("Unexpected response kind for runtime settings update".to_string()),
    }

    let deactivated = extension_host_deactivate_for_probe(
        &state,
        "example-lifecycle-state-contract-extension",
        &workspace_root_text,
    )?;
    if !deactivated.accepted {
        return Err("Lifecycle state extension was not deactivated".to_string());
    }

    let reactivated = extension_host_activate_by_id_for_probe(
        &state,
        &global_config_dir_text,
        &workspace_root_text,
        "example-lifecycle-state-contract-extension",
        "onCommand:exampleLifecycleStateContractExtension.capture",
    )?;
    if !reactivated.activated {
        return Err(format!(
            "Lifecycle state extension did not reactivate for workspace A: {}",
            reactivated.reason
        ));
    }
    let after_reactivate = execute_command(
        &state,
        &workspace_root_text,
        &manifest_path.to_string_lossy(),
        "exampleLifecycleStateContractExtension.capture",
    )?;
    let reactivated_snapshot = parse_snapshot(&after_reactivate, "reactivated")?;
    expect_snapshot(
        reactivated_snapshot.clone(),
        json!({
            "activationCount": 2,
            "deactivationCount": 1,
            "globalCount": 1,
            "workspaceCount": 1,
            "targetLang": "en",
            "theme": "solarized-light",
        }),
        "reactivated",
    )?;

    let crashed = execute_command(
        &state,
        &workspace_root_text,
        &manifest_path.to_string_lossy(),
        "exampleLifecycleStateContractExtension.crash",
    );
    let crash_error = crashed
        .err()
        .unwrap_or_else(|| "Crash command unexpectedly succeeded".to_string());
    if !crash_error.contains("Failed to read extension host response:")
        && !crash_error.contains("Extension host closed its response stream")
    {
        return Err(format!(
            "Crash command did not surface expected host interruption: {crash_error}"
        ));
    }

    let recovered_activate = extension_host_activate_by_id_for_probe(
        &state,
        &global_config_dir_text,
        &workspace_root_text,
        "example-lifecycle-state-contract-extension",
        "onCommand:exampleLifecycleStateContractExtension.capture",
    )?;
    if !recovered_activate.activated {
        return Err(format!(
            "Lifecycle state extension did not reactivate after crash for workspace A: {}",
            recovered_activate.reason
        ));
    }
    let after_recovery = execute_command(
        &state,
        &workspace_root_text,
        &manifest_path.to_string_lossy(),
        "exampleLifecycleStateContractExtension.capture",
    )?;
    let recovered_snapshot = parse_snapshot(&after_recovery, "recovered")?;
    expect_snapshot(
        recovered_snapshot.clone(),
        json!({
            "activationCount": 1,
            "deactivationCount": 0,
            "globalCount": 1,
            "workspaceCount": 1,
            "targetLang": "en",
            "theme": "solarized-light",
        }),
        "recovered",
    )?;

    let runtime_state_a = extension_settings_load_runtime_state_snapshot_for_probe(
        &global_config_dir_text,
        &workspace_root_text,
        "example-lifecycle-state-contract-extension",
    )?;
    if runtime_state_a.global_state != json!({ "globalCount": 1 })
        || runtime_state_a.workspace_state != json!({ "workspaceCount": 1 })
    {
        return Err(format!(
            "Persisted runtime state for workspace A drifted: global={} workspace={}",
            runtime_state_a.global_state, runtime_state_a.workspace_state
        ));
    }

    let saved_settings_b = extension_settings_load_with_state_for_probe(
        &global_config_dir_text,
        &workspace_root_b_text,
        true,
    )?;
    let saved_config_b = saved_settings_b
        .settings
        .extension_config
        .get("example-lifecycle-state-contract-extension")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if saved_config_b
        .get("exampleLifecycleStateContractExtension.targetLang")
        .and_then(Value::as_str)
        != Some("en")
        || saved_config_b
            .get("exampleLifecycleStateContractExtension.theme")
            .and_then(Value::as_str)
            != Some("solarized-light")
    {
        return Err(format!(
            "Persisted extension settings drifted when loading workspace B: {}",
            Value::Object(saved_config_b)
        ));
    }

    let state_b = ExtensionHostState::default();
    let activated_b = extension_host_activate_by_id_for_probe(
        &state_b,
        &global_config_dir_text,
        &workspace_root_b_text,
        "example-lifecycle-state-contract-extension",
        "onCommand:exampleLifecycleStateContractExtension.capture",
    )?;
    if !activated_b.activated {
        return Err(format!(
            "Lifecycle state extension did not activate for workspace B: {}",
            activated_b.reason
        ));
    }
    let workspace_b = execute_command(
        &state_b,
        &workspace_root_b_text,
        &manifest_path_b.to_string_lossy(),
        "exampleLifecycleStateContractExtension.capture",
    )?;
    let workspace_b_snapshot = parse_snapshot(&workspace_b, "workspace B")?;
    expect_snapshot(
        workspace_b_snapshot.clone(),
        json!({
            "activationCount": 1,
            "deactivationCount": 0,
            "globalCount": 1,
            "workspaceCount": 0,
            "targetLang": "en",
            "theme": "solarized-light",
        }),
        "workspace B",
    )?;

    let runtime_state_b = extension_settings_load_runtime_state_snapshot_for_probe(
        &global_config_dir_text,
        &workspace_root_b_text,
        "example-lifecycle-state-contract-extension",
    )?;
    if runtime_state_b.global_state != json!({ "globalCount": 1 })
        || runtime_state_b.workspace_state != json!({})
    {
        return Err(format!(
            "Persisted runtime state for workspace B drifted: global={} workspace={}",
            runtime_state_b.global_state, runtime_state_b.workspace_state
        ));
    }

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "ok": true,
            "summary": {
                "firstSnapshot": first_snapshot,
                "reactivatedSnapshot": reactivated_snapshot,
                "recoveredSnapshot": recovered_snapshot,
                "workspaceBSnapshot": workspace_b_snapshot,
                "crashError": crash_error,
            }
        }))
        .map_err(|error| format!("Failed to serialize lifecycle state contract result: {error}"))?
    );

    Ok(())
}
