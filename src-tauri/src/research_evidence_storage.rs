use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

use crate::app_dirs;
use crate::research_evidence_protocol::ResearchEvidenceRecord;

const RESEARCH_EVIDENCE_DIR: &str = "research-evidence";

fn evidence_dir() -> Result<PathBuf, String> {
    let dir = app_dirs::data_root_dir()?.join(RESEARCH_EVIDENCE_DIR);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create research evidence dir: {error}"))?;
    }
    Ok(dir)
}

fn evidence_path_for_workspace(workspace_path: &str) -> Result<PathBuf, String> {
    let normalized = workspace_path.trim();
    if normalized.is_empty() {
        return Err("Workspace path is required for research evidence.".to_string());
    }
    let encoded = URL_SAFE_NO_PAD.encode(normalized.as_bytes());
    Ok(evidence_dir()?.join(format!("{encoded}.json")))
}

fn read_evidence_from_path(path: &Path) -> Result<Vec<ResearchEvidenceRecord>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read research evidence: {error}"))?;
    serde_json::from_str::<Vec<ResearchEvidenceRecord>>(&content)
        .map_err(|error| format!("Failed to parse research evidence: {error}"))
}

fn write_evidence_to_path(path: &Path, evidence: &[ResearchEvidenceRecord]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Research evidence path has no parent directory.".to_string())?;
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create research evidence parent dir: {error}"))?;
    }
    let temp_path = path.with_extension("json.tmp");
    let serialized = serde_json::to_string_pretty(evidence)
        .map_err(|error| format!("Failed to serialize research evidence: {error}"))?;
    fs::write(&temp_path, serialized)
        .map_err(|error| format!("Failed to write research evidence: {error}"))?;
    fs::rename(&temp_path, path)
        .map_err(|error| format!("Failed to finalize research evidence: {error}"))?;
    Ok(())
}

pub(crate) fn load_workspace_evidence(
    workspace_path: &str,
) -> Result<Vec<ResearchEvidenceRecord>, String> {
    let path = evidence_path_for_workspace(workspace_path)?;
    read_evidence_from_path(&path)
}

pub(crate) fn persist_workspace_evidence(
    workspace_path: &str,
    evidence: &[ResearchEvidenceRecord],
) -> Result<(), String> {
    let path = evidence_path_for_workspace(workspace_path)?;
    write_evidence_to_path(&path, evidence)
}
