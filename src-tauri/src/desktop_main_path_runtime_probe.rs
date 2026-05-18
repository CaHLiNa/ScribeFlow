use crate::document_workflow_action;
use crate::document_workspace_preview_state;
use crate::extension_registry::{self, ExtensionRegistryListParams};
use crate::fs_tree_runtime::{self, FsTreeDisplayPreferences, FsTreeLoadWorkspaceStateParams};
use crate::latex_project_graph::{self, LatexProjectGraphParams};
use crate::markdown_runtime;
use crate::python_runtime;
use crate::references_backend::{self, ReferenceLibraryLoadWorkspaceParams};
use crate::references_citation;
use crate::references_mutation::{self, ReferencesMutationAction, ReferencesMutationApplyParams};
use crate::references_query::{self, ReferencesQueryResolveParams};
use crate::security::{self, WorkspaceScopeState};
use crate::workspace_lifecycle::{self, WorkspaceLifecyclePrepareOpenParams};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_temp_dir() -> Result<PathBuf, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Failed to read current time: {error}"))?
        .as_millis();
    let root = std::env::temp_dir().join(format!("scribeflow-main-path-runtime-{now}"));
    fs::create_dir_all(&root)
        .map_err(|error| format!("Failed to create probe root {}: {error}", root.display()))?;
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

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn write_probe_workspace(workspace_root: &Path) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let markdown_path = workspace_root.join("paper.md");
    let latex_path = workspace_root.join("main.tex");
    let python_path = workspace_root.join("analysis.py");

    write_file(
        &markdown_path,
        "# Main Path Smoke\n\nThis note cites @probe2026 and links [[Appendix]].\n\n## Methods\n",
    )?;
    write_file(
        &latex_path,
        "\\documentclass{article}\n\\begin{document}\n\\section{Main Path}\nSee~\\cite{probe2026}.\n\\bibliography{references}\n\\end{document}\n",
    )?;
    write_file(
        &workspace_root.join("references.bib"),
        "@article{probe2026,title={Main Path Runtime Smoke},author={Lovelace, Ada},year={2026}}\n",
    )?;
    write_file(
        &python_path,
        "import json\nprint(json.dumps({'main_path': True, 'value': 42}, sort_keys=True))\n",
    )?;

    let extension_root = workspace_root
        .join(".scribeflow")
        .join("extensions")
        .join("main-path-runtime-probe");
    write_file(
        &extension_root.join("package.json"),
        &json!({
            "name": "main-path-runtime-probe",
            "displayName": "Main Path Runtime Probe",
            "version": "1.0.0",
            "description": "Runtime smoke probe extension",
            "engines": {
                "scribeflow": "^1.1.0"
            },
            "main": "./dist/extension.js",
            "extensionKind": ["workspace"],
            "activationEvents": ["onCommand:mainPathRuntimeProbe.inspect"],
            "contributes": {
                "commands": [{
                    "command": "mainPathRuntimeProbe.inspect",
                    "title": "Inspect Main Path Runtime"
                }],
                "capabilities": [{
                    "id": "document.summarize"
                }]
            },
            "permissions": {
                "readWorkspaceFiles": true,
                "readReferenceLibrary": true,
                "spawnProcess": false
            }
        })
        .to_string(),
    )?;
    write_file(
        &extension_root.join("dist").join("extension.js"),
        "export async function activate() {}\n",
    )?;

    Ok((markdown_path, latex_path, python_path))
}

fn assert_value(condition: bool, message: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.to_string())
    }
}

async fn run_probe(root: &Path) -> Result<Value, String> {
    let workspace_root = root.join("workspace");
    let global_config_dir = root.join("global");
    fs::create_dir_all(&workspace_root)
        .map_err(|error| format!("Failed to create workspace root: {error}"))?;
    fs::create_dir_all(&global_config_dir)
        .map_err(|error| format!("Failed to create global config root: {error}"))?;
    let (markdown_path, latex_path, python_path) = write_probe_workspace(&workspace_root)?;

    let scope = WorkspaceScopeState::default();
    let opened = workspace_lifecycle::workspace_lifecycle_prepare_open_with_scope(
        WorkspaceLifecyclePrepareOpenParams {
            global_config_dir: path_string(&global_config_dir),
            path: path_string(&workspace_root),
        },
        &scope,
    )
    .await?;
    assert_value(
        opened.path == path_string(&workspace_root),
        "Workspace open path drifted",
    )?;
    assert_value(
        !opened.workspace_id.is_empty() && Path::new(&opened.workspace_data_dir).is_dir(),
        "Workspace open did not create an isolated data directory",
    )?;

    let markdown_content = fs::read_to_string(&markdown_path)
        .map_err(|error| format!("Failed to read markdown probe file: {error}"))?;
    let allowed_markdown = security::ensure_allowed_workspace_path(&scope, &markdown_path)?;
    let canonical_markdown = fs::canonicalize(&markdown_path)
        .map_err(|error| format!("Failed to canonicalize markdown probe file: {error}"))?;
    assert_value(
        allowed_markdown == canonical_markdown,
        "Workspace security did not resolve the markdown path",
    )?;

    let file_tree =
        fs_tree_runtime::fs_tree_load_workspace_state_resolved(FsTreeLoadWorkspaceStateParams {
            workspace_path: path_string(&workspace_root),
            current_tree: Vec::new(),
            extra_dirs: Vec::new(),
            include_hidden: false,
            display_preferences: FsTreeDisplayPreferences::default(),
        })
        .await?;
    let flat_file_paths = file_tree
        .flat_files
        .iter()
        .map(|entry| entry.path.as_str())
        .collect::<Vec<_>>();
    assert_value(
        flat_file_paths.contains(&path_string(&markdown_path).as_str())
            && flat_file_paths.contains(&path_string(&latex_path).as_str())
            && flat_file_paths.contains(&path_string(&python_path).as_str()),
        "File tree snapshot missed a main-path document",
    )?;

    let headings = markdown_runtime::markdown_extract_headings(json!({
        "content": markdown_content
    }))
    .await?;
    assert_value(
        headings
            .iter()
            .any(|heading| heading.text == "Main Path Smoke"),
        "Markdown runtime did not extract the probe heading",
    )?;

    let markdown_action = document_workflow_action::document_workflow_action_resolve(json!({
        "filePath": path_string(&markdown_path),
        "intent": "primary-action",
        "uiState": {
            "kind": "markdown"
        },
        "previewState": {}
    }))
    .await?;
    assert_value(
        markdown_action.get("actionType").and_then(Value::as_str) == Some("show-workspace-preview"),
        "Markdown primary action did not request a workspace preview",
    )?;

    let markdown_preview =
        document_workspace_preview_state::document_workspace_preview_state_resolve(json!({
            "path": path_string(&markdown_path),
            "workflowKind": "markdown",
            "previewKind": "html"
        }))
        .await?;
    assert_value(
        markdown_preview.get("previewMode").and_then(Value::as_str) == Some("markdown"),
        "Markdown preview state did not resolve to markdown mode",
    )?;

    let mut latex_overrides = HashMap::new();
    latex_overrides.insert(
        path_string(&latex_path),
        fs::read_to_string(&latex_path)
            .map_err(|error| format!("Failed to read LaTeX probe file: {error}"))?,
    );
    let latex_graph = latex_project_graph::resolve_graph_value(&LatexProjectGraphParams {
        source_path: path_string(&latex_path),
        workspace_path: path_string(&workspace_root),
        flat_files: vec![
            path_string(&latex_path),
            path_string(&workspace_root.join("references.bib")),
        ],
        content_overrides: latex_overrides,
    })
    .ok_or_else(|| "LaTeX graph did not resolve".to_string())?;
    assert_value(
        latex_graph.get("rootPath").and_then(Value::as_str)
            == Some(path_string(&latex_path).as_str())
            && latex_graph
                .get("previewPath")
                .and_then(Value::as_str)
                .is_some_and(|path| path.ends_with("main.pdf")),
        "LaTeX graph did not resolve the expected root/preview path",
    )?;

    let latex_preview =
        document_workspace_preview_state::document_workspace_preview_state_resolve(json!({
            "path": path_string(&latex_path),
            "workflowKind": "latex",
            "previewKind": "pdf",
            "resolvedTargetPath": path_string(&workspace_root.join("main.pdf")),
            "artifactReady": true,
            "previewRequested": true
        }))
        .await?;
    assert_value(
        latex_preview.get("previewMode").and_then(Value::as_str) == Some("pdf-artifact"),
        "LaTeX preview state did not resolve to PDF artifact mode",
    )?;

    let python_preview =
        document_workspace_preview_state::document_workspace_preview_state_resolve(json!({
            "path": path_string(&python_path),
            "workflowKind": "python",
            "previewKind": "terminal",
            "previewRequested": true
        }))
        .await?;
    assert_value(
        python_preview.get("previewMode").and_then(Value::as_str) == Some("terminal-output"),
        "Python preview state did not resolve to terminal output mode",
    )?;

    let python_result = python_runtime::python_runtime_compile(json!({
        "filePath": path_string(&python_path),
        "interpreterPath": "auto"
    }))
    .await?;
    assert_value(
        python_result.success && python_result.stdout.contains("\"main_path\": true"),
        "Python runtime did not execute the probe file",
    )?;

    let empty_library = references_backend::references_library_load_workspace_typed(
        ReferenceLibraryLoadWorkspaceParams {
            global_config_dir: path_string(&global_config_dir),
        },
    )?;
    let added_reference =
        references_mutation::references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: empty_library,
            global_config_dir: path_string(&global_config_dir),
            selected_reference_id: String::new(),
            action: ReferencesMutationAction::AddReference {
                reference: json!({
                    "id": "ref-main-path",
                    "citationKey": "probe2026",
                    "title": "Main Path Runtime Smoke",
                    "authors": ["Ada Lovelace"],
                    "year": 2026,
                    "typeKey": "journal-article"
                }),
                mark_for_zotero_push: false,
            },
        })
        .await?;
    let selected_snapshot =
        references_mutation::references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: added_reference["snapshot"].clone(),
            global_config_dir: path_string(&global_config_dir),
            selected_reference_id: "ref-main-path".to_string(),
            action: ReferencesMutationAction::SetDocumentReferenceIds {
                tex_path: path_string(&latex_path),
                reference_ids: vec!["ref-main-path".to_string()],
            },
        })
        .await?;
    references_backend::references_library_write(json!({
        "globalConfigDir": path_string(&global_config_dir),
        "snapshot": selected_snapshot["snapshot"].clone()
    }))
    .await?;
    let loaded_library = references_backend::references_library_load_workspace_typed(
        ReferenceLibraryLoadWorkspaceParams {
            global_config_dir: path_string(&global_config_dir),
        },
    )?;
    assert_value(
        loaded_library["references"]
            .as_array()
            .is_some_and(|items| items.len() == 1)
            && loaded_library["documentReferenceSelections"][path_string(&latex_path).as_str()]
                .as_array()
                .is_some_and(|items| items.len() == 1),
        "Reference library did not persist the selected document reference",
    )?;

    let query = references_query::references_query_resolve_resolved(ReferencesQueryResolveParams {
        references: loaded_library["references"]
            .as_array()
            .cloned()
            .unwrap_or_default(),
        sort_key: "title".to_string(),
        file_contents: json!({
            path_string(&markdown_path): "# Main Path Smoke\n\nCites @probe2026."
        }),
        ..ReferencesQueryResolveParams::default()
    })
    .await?;
    assert_value(
        query["citationUsageIndex"]["probe2026"]
            .as_array()
            .is_some_and(|items| !items.is_empty()),
        "Reference query did not index markdown citation usage",
    )?;

    let rendered_citation = references_citation::references_citation_render(json!({
        "style": "apa",
        "mode": "reference",
        "reference": loaded_library["references"][0].clone()
    }))
    .await?;
    assert_value(
        rendered_citation.contains("Main Path Runtime Smoke"),
        "Citation renderer did not format the probe reference",
    )?;

    let extensions = extension_registry::list_extension_registry(&ExtensionRegistryListParams {
        global_config_dir: path_string(&global_config_dir),
        workspace_root: path_string(&workspace_root),
        locale: "en".to_string(),
    })?;
    assert_value(
        extensions.iter().any(|entry| {
            entry.id == "main-path-runtime-probe"
                && entry.scope == "workspace"
                && entry.status == "available"
        }),
        "Extension registry did not discover the workspace plugin",
    )?;

    security::clear_allowed_roots_internal(&scope)?;
    assert_value(
        security::ensure_allowed_workspace_path(&scope, &markdown_path).is_err(),
        "Workspace close did not clear allowed roots",
    )?;

    Ok(json!({
        "workspaceId": opened.workspace_id,
        "flatFileCount": file_tree.flat_files.len(),
        "markdownHeadings": headings.len(),
        "pythonStdout": python_result.stdout,
        "references": loaded_library["references"].as_array().map(Vec::len).unwrap_or_default(),
        "extensions": extensions.len()
    }))
}

pub async fn run_desktop_main_path_runtime_contract_probe() -> Result<Value, String> {
    let root = unique_temp_dir()?;
    let result = run_probe(&root).await;
    fs::remove_dir_all(&root).ok();
    result
}
