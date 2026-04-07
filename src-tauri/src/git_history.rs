use crate::git_support::{normalize_repo_pathbuf, open_repo, repo_relative_path, run_git_text};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{DiffOptions, Oid, Repository};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct LogEntry {
    pub hash: String,
    pub date: String,
    pub message: String,
}

#[derive(Serialize, Clone)]
pub struct DiffFilePatch {
    pub file: String,
    pub diff: String,
}

#[derive(Serialize, Clone)]
pub struct DiffSummary {
    pub stat: String,
    pub diffs: Vec<DiffFilePatch>,
}

#[tauri::command]
pub async fn git_log(
    repo_path: String,
    file_path: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<LogEntry>, String> {
    let limit = limit.unwrap_or(50);
    let normalized_repo = normalize_repo_pathbuf(&repo_path)?;
    let mut args = vec![
        String::from("rev-parse"),
        String::from("--verify"),
        String::from("HEAD"),
    ];
    if run_git_text(&repo_path, &args).is_err() {
        return Ok(Vec::new());
    }

    args = vec![
        String::from("log"),
        format!("-n{limit}"),
        String::from("--date=iso-strict"),
        String::from("--pretty=format:%H%x1f%aI%x1f%s%x1e"),
    ];

    if let Some(file_path) = file_path.as_ref() {
        let rel_path = repo_relative_path(&normalized_repo, file_path);
        if rel_path.is_empty() {
            return Ok(Vec::new());
        }
        args.push(String::from("--"));
        args.push(rel_path);
    }

    let raw = run_git_text(&repo_path, &args)?;
    let mut entries = Vec::new();
    for record in raw.split('\u{1e}') {
        let trimmed = record.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split('\u{1f}');
        let Some(hash) = parts.next() else { continue };
        let Some(date) = parts.next() else { continue };
        let message = parts.next().unwrap_or_default();
        entries.push(LogEntry {
            hash: hash.to_string(),
            date: date.to_string(),
            message: message.to_string(),
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn git_show_file(
    repo_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<String, String> {
    let normalized_repo = normalize_repo_pathbuf(&repo_path)?;
    let rel_path = repo_relative_path(&normalized_repo, &file_path);
    if rel_path.is_empty() {
        return Err("missing file path".to_string());
    }

    run_git_text(
        &repo_path,
        &[String::from("show"), format!("{commit_hash}:{rel_path}")],
    )
}

#[tauri::command]
pub async fn git_show_file_base64(
    repo_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;

    let rel_path = if file_path.starts_with(&repo_path) {
        file_path[repo_path.len()..]
            .trim_start_matches('/')
            .to_string()
    } else {
        file_path.clone()
    };

    let oid = Oid::from_str(&commit_hash).map_err(|e| e.message().to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.message().to_string())?;
    let tree = commit.tree().map_err(|e| e.message().to_string())?;
    let entry = tree
        .get_path(Path::new(&rel_path))
        .map_err(|e| e.message().to_string())?;
    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| e.message().to_string())?;

    Ok(STANDARD.encode(blob.content()))
}

#[tauri::command]
pub async fn git_diff_summary(
    repo_path: String,
    max_files: Option<usize>,
    max_lines: Option<usize>,
) -> Result<DiffSummary, String> {
    let repo = open_repo(&repo_path)?;
    let max_files = max_files.unwrap_or(5);
    let max_lines = max_lines.unwrap_or(20);

    let diff = get_working_diff(&repo)
        .or_else(|_| get_head_parent_diff(&repo))
        .unwrap_or(None);

    let diff = match diff {
        Some(d) => d,
        None => {
            return Ok(DiffSummary {
                stat: String::new(),
                diffs: Vec::new(),
            })
        }
    };

    let stat = match diff.stats() {
        Ok(stats) => stats
            .to_buf(git2::DiffStatsFormat::FULL, 80)
            .ok()
            .and_then(|b| b.as_str().map(|s| s.to_string()))
            .unwrap_or_default(),
        Err(_) => String::new(),
    };

    let mut diffs = Vec::new();
    let num_deltas = diff.deltas().len();

    for i in 0..num_deltas {
        if diffs.len() >= max_files {
            break;
        }

        let delta = diff.get_delta(i).unwrap();
        let file_path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        if let Ok(patch) = git2::Patch::from_diff(&diff, i) {
            if let Some(patch) = patch {
                let mut lines_collected = Vec::new();
                let num_hunks = patch.num_hunks();

                'outer: for h in 0..num_hunks {
                    if let Ok((hunk, _)) = patch.hunk(h) {
                        let header = std::str::from_utf8(hunk.header()).unwrap_or("");
                        lines_collected.push(header.trim_end().to_string());

                        let num_lines = patch.num_lines_in_hunk(h).unwrap_or(0);
                        for l in 0..num_lines {
                            if lines_collected.len() >= max_lines {
                                lines_collected.push("[...truncated]".to_string());
                                break 'outer;
                            }
                            if let Ok(line) = patch.line_in_hunk(h, l) {
                                let origin = line.origin();
                                let content = std::str::from_utf8(line.content()).unwrap_or("");
                                let formatted = if origin == '+' || origin == '-' || origin == ' ' {
                                    format!("{}{}", origin, content.trim_end())
                                } else {
                                    content.trim_end().to_string()
                                };
                                lines_collected.push(formatted);
                            }
                        }
                    }
                }

                if !lines_collected.is_empty() {
                    diffs.push(DiffFilePatch {
                        file: file_path,
                        diff: lines_collected.join("\n"),
                    });
                }
            }
        }
    }

    Ok(DiffSummary { stat, diffs })
}

fn get_working_diff(repo: &Repository) -> Result<Option<git2::Diff<'_>>, git2::Error> {
    let head_tree = match repo.head() {
        Ok(head) => Some(head.peel_to_commit()?.tree()?),
        Err(_) => None,
    };

    let mut opts = DiffOptions::new();
    opts.context_lines(2);
    let diff = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))?;

    if diff.deltas().len() == 0 {
        return Ok(None);
    }

    Ok(Some(diff))
}

fn get_head_parent_diff(repo: &Repository) -> Result<Option<git2::Diff<'_>>, git2::Error> {
    let head = repo.head()?.peel_to_commit()?;
    let parent = head.parent(0)?;

    let head_tree = head.tree()?;
    let parent_tree = parent.tree()?;

    let mut opts = DiffOptions::new();
    opts.context_lines(2);
    let diff = repo.diff_tree_to_tree(Some(&parent_tree), Some(&head_tree), Some(&mut opts))?;

    if diff.deltas().len() == 0 {
        return Ok(None);
    }

    Ok(Some(diff))
}
