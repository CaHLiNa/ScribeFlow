use crate::process_utils::background_command;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{
    Cred, DiffOptions, FetchOptions, Oid, PushOptions, RemoteCallbacks, Repository, Signature,
};
use serde::Serialize;
use std::path::{Path, PathBuf};

fn normalize_repo_pathbuf(repo_path: &str) -> Result<PathBuf, String> {
    let trimmed = repo_path.trim();
    if trimmed.is_empty() {
        return Err("missing repository path".to_string());
    }

    let normalized = trimmed.trim_end_matches(['/', '\\']);
    let candidate = if normalized.is_empty() {
        "/"
    } else {
        normalized
    };
    let path = PathBuf::from(candidate);
    if path.is_absolute() {
        Ok(path)
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|e| e.to_string())
    }
}

fn normalize_repo_path(repo_path: &str) -> Result<String, String> {
    Ok(normalize_repo_pathbuf(repo_path)?
        .to_string_lossy()
        .to_string())
}

fn repo_relative_path(repo_root: &Path, file_path: &str) -> String {
    let trimmed = file_path.trim().trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        return String::new();
    }

    let candidate = Path::new(trimmed);
    if candidate.is_absolute() {
        if let Ok(stripped) = candidate.strip_prefix(repo_root) {
            return stripped.to_string_lossy().replace('\\', "/");
        }
    }

    let normalized = trimmed.replace('\\', "/");
    if let Some(root_name) = repo_root.file_name().and_then(|value| value.to_str()) {
        let prefix = format!("{root_name}/");
        if let Some(stripped) = normalized.strip_prefix(&prefix) {
            return stripped.to_string();
        }
    }

    normalized
}

fn run_git_text(repo_path: &str, args: &[String]) -> Result<String, String> {
    let normalized = normalize_repo_path(repo_path)?;
    let output = background_command("git")
        .arg("-C")
        .arg(&normalized)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

fn run_git_commit_text(
    repo_path: &str,
    message: &str,
    fallback_identity: Option<(&str, &str)>,
) -> Result<String, String> {
    let normalized = normalize_repo_path(repo_path)?;
    let mut command = background_command("git");
    command
        .arg("-C")
        .arg(&normalized)
        .arg("commit")
        .arg("-m")
        .arg(message);

    if let Some((name, email)) = fallback_identity {
        command
            .env("GIT_AUTHOR_NAME", name)
            .env("GIT_AUTHOR_EMAIL", email)
            .env("GIT_COMMITTER_NAME", name)
            .env("GIT_COMMITTER_EMAIL", email);
    }

    let output = command.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

fn is_missing_git_identity_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("author identity unknown")
        || lower.contains("unable to auto-detect email address")
        || lower.contains("please tell me who you are")
}

fn is_git_conflict_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("non-fast-forward")
        || lower.contains("cannot fast-forward")
        || lower.contains("cannot push")
        || lower.contains("not present locally")
        || lower.contains("[rejected]")
        || lower.contains("fetch first")
        || lower.contains("updates were rejected")
}

fn is_git_auth_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("authentication")
        || lower.contains("401")
        || lower.contains("403")
        || lower.contains("invalid username or token")
        || lower.contains("access denied")
        || lower.contains("could not read username")
}

fn is_git_network_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("resolve")
        || lower.contains("dns")
        || lower.contains("network")
        || lower.contains("could not connect")
        || lower.contains("failed to connect")
        || lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("failed to receive response")
}

fn map_git_push_error(message: &str) -> String {
    if is_git_conflict_error(message) {
        "CONFLICT: Remote has changes that conflict with your local commits.".to_string()
    } else if is_git_auth_error(message) {
        "Authentication failed. Please reconnect your GitHub account.".to_string()
    } else if is_git_network_error(message) {
        "Could not connect to GitHub. Check your internet connection.".to_string()
    } else {
        format!("Push failed: {message}")
    }
}

fn map_git_push_branch_error(message: &str) -> String {
    if is_git_auth_error(message) {
        "Authentication failed. Please reconnect your GitHub account.".to_string()
    } else if is_git_network_error(message) {
        "Could not connect to GitHub. Check your internet connection.".to_string()
    } else {
        format!("Push to branch failed: {message}")
    }
}

fn map_git_fetch_error(message: &str) -> String {
    if is_git_auth_error(message) {
        "Authentication failed. Please reconnect your GitHub account.".to_string()
    } else if is_git_network_error(message) {
        "Could not connect to GitHub. Check your internet connection.".to_string()
    } else {
        format!("Fetch failed: {message}")
    }
}

fn map_git_clone_error(message: &str) -> String {
    let lower = message.to_lowercase();
    if lower.contains("unexpected http status code: 404")
        || lower.contains("repository not found")
        || lower.contains("404")
    {
        "Repository not found. Check the URL and try again.".to_string()
    } else if is_git_auth_error(message) {
        "Authentication failed. Please reconnect your GitHub account.".to_string()
    } else if lower.contains("already exists and is not an empty directory")
        || lower.contains("already exists")
    {
        "A folder with that name already exists.".to_string()
    } else if is_git_network_error(message) {
        "Could not connect. Check your internet connection and the URL.".to_string()
    } else {
        format!("Clone failed: {message}")
    }
}

#[cfg(windows)]
fn build_github_auth_header(token: &str) -> String {
    let payload = format!("x-access-token:{token}");
    format!("AUTHORIZATION: basic {}", STANDARD.encode(payload))
}

#[cfg(windows)]
fn run_git_authenticated(
    repo_path: Option<&str>,
    token: &str,
    args: &[String],
) -> Result<String, String> {
    let mut command = background_command("git");

    if let Some(repo_path) = repo_path {
        let normalized = normalize_repo_path(repo_path)?;
        command.arg("-C").arg(normalized);
    }

    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .arg("-c")
        .arg("credential.helper=")
        .arg("-c")
        .arg("core.askPass=")
        .arg("-c")
        .arg("credential.interactive=never")
        .arg("-c")
        .arg(format!(
            "http.https://github.com/.extraheader={}",
            build_github_auth_header(token)
        ))
        .args(args);

    let output = command.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Git is required on Windows for GitHub sync. Install Git and retry.".to_string()
        } else {
            e.to_string()
        }
    })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

fn run_git_init(repo_path: &str) -> Result<(), String> {
    let normalized = normalize_repo_path(repo_path)?;
    let output = background_command("git")
        .arg("init")
        .arg(&normalized)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

fn open_repo(repo_path: &str) -> Result<Repository, String> {
    let normalized = normalize_repo_path(repo_path)?;
    Repository::open(normalized).map_err(|e| e.message().to_string())
}

#[tauri::command]
pub async fn git_init(repo_path: String) -> Result<(), String> {
    let normalized = normalize_repo_path(&repo_path)?;
    Repository::init(&normalized)
        .map(|_| ())
        .or_else(|_| run_git_init(&normalized))
}

#[tauri::command]
pub async fn git_clone(url: String, target_path: String) -> Result<(), String> {
    Repository::clone(&url, &target_path).map_err(|e| map_git_clone_error(e.message()))?;
    Ok(())
}

#[tauri::command]
pub async fn git_add_all(repo_path: String) -> Result<(), String> {
    run_git_text(&repo_path, &[String::from("add"), String::from("-A")]).map(|_| ())
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    if let Err(error) = run_git_commit_text(&repo_path, &message, None) {
        if !is_missing_git_identity_error(&error) {
            return Err(error);
        }

        run_git_commit_text(&repo_path, &message, Some(("Altals", "altals@local")))?;
    }

    let head = run_git_text(
        &repo_path,
        &[String::from("rev-parse"), String::from("HEAD")],
    )?;
    Ok(head.trim().to_string())
}

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<String, String> {
    run_git_text(
        &repo_path,
        &[
            String::from("status"),
            String::from("--porcelain=v1"),
            String::from("-uall"),
        ],
    )
}

#[tauri::command]
pub async fn git_branch(repo_path: String) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;
    let result = match repo.head() {
        Ok(head) => head.shorthand().unwrap_or("HEAD").to_string(),
        Err(_) => String::new(),
    };
    Ok(result)
}

#[derive(Serialize, Clone)]
pub struct LogEntry {
    pub hash: String,
    pub date: String,
    pub message: String,
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
pub async fn git_diff_summary(
    repo_path: String,
    max_files: Option<usize>,
    max_lines: Option<usize>,
) -> Result<DiffSummary, String> {
    let repo = open_repo(&repo_path)?;
    let max_files = max_files.unwrap_or(5);
    let max_lines = max_lines.unwrap_or(20);

    // Try working-dir diff first, then HEAD~1
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

    // Build stat string
    let stat = match diff.stats() {
        Ok(stats) => stats
            .to_buf(git2::DiffStatsFormat::FULL, 80)
            .ok()
            .and_then(|b| b.as_str().map(|s| s.to_string()))
            .unwrap_or_default(),
        Err(_) => String::new(),
    };

    // Build per-file diffs
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

        // Get patch for this specific file
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

    // Check if there are any deltas
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

// ── Remote management ──

#[tauri::command]
pub async fn git_remote_add(repo_path: String, name: String, url: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    repo.remote(&name, &url)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn git_remote_get_url(repo_path: String) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;
    let result = match repo.find_remote("origin") {
        Ok(remote) => remote.url().unwrap_or("").to_string(),
        Err(_) => String::new(),
    };
    Ok(result)
}

#[tauri::command]
pub async fn git_remote_remove(repo_path: String, name: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    repo.remote_delete(&name)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

// ── Push / Fetch / Pull ──

fn make_callbacks(token: &str) -> RemoteCallbacks<'_> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, username, _allowed| {
        Cred::userpass_plaintext(username.unwrap_or("x-access-token"), token)
    });
    callbacks
}

#[tauri::command]
pub async fn git_push(
    repo_path: String,
    remote: String,
    branch: String,
    token: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let args = vec![
            String::from("push"),
            remote,
            format!("refs/heads/{branch}:refs/heads/{branch}"),
        ];
        run_git_authenticated(Some(&repo_path), &token, &args)
            .map(|_| ())
            .map_err(|e| map_git_push_error(&e))?;
        return Ok(());
    }

    let repo = open_repo(&repo_path)?;
    let mut remote_obj = repo
        .find_remote(&remote)
        .map_err(|e| e.message().to_string())?;

    let callbacks = make_callbacks(&token);
    let mut opts = PushOptions::new();
    opts.remote_callbacks(callbacks);

    let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);
    remote_obj
        .push(&[&refspec], Some(&mut opts))
        .map_err(|e| map_git_push_error(e.message()))?;

    Ok(())
}

#[tauri::command]
pub async fn git_push_branch(
    repo_path: String,
    remote: String,
    local_branch: String,
    remote_branch: String,
    token: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let args = vec![
            String::from("push"),
            remote,
            format!("refs/heads/{local_branch}:refs/heads/{remote_branch}"),
        ];
        run_git_authenticated(Some(&repo_path), &token, &args)
            .map(|_| ())
            .map_err(|e| map_git_push_branch_error(&e))?;
        return Ok(());
    }

    let repo = open_repo(&repo_path)?;
    let mut remote_obj = repo
        .find_remote(&remote)
        .map_err(|e| e.message().to_string())?;

    let callbacks = make_callbacks(&token);
    let mut opts = PushOptions::new();
    opts.remote_callbacks(callbacks);

    let refspec = format!("refs/heads/{}:refs/heads/{}", local_branch, remote_branch);
    remote_obj
        .push(&[&refspec], Some(&mut opts))
        .map_err(|e| map_git_push_branch_error(e.message()))?;

    Ok(())
}

#[tauri::command]
pub async fn git_fetch(repo_path: String, remote: String, token: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let args = vec![String::from("fetch"), String::from("--prune"), remote];
        run_git_authenticated(Some(&repo_path), &token, &args)
            .map(|_| ())
            .map_err(|e| map_git_fetch_error(&e))?;
        return Ok(());
    }

    let repo = open_repo(&repo_path)?;
    let mut remote_obj = repo
        .find_remote(&remote)
        .map_err(|e| e.message().to_string())?;

    let callbacks = make_callbacks(&token);
    let mut opts = FetchOptions::new();
    opts.remote_callbacks(callbacks);

    remote_obj
        .fetch(&[] as &[&str], Some(&mut opts), None)
        .map_err(|e| map_git_fetch_error(e.message()))?;

    Ok(())
}

#[derive(Serialize, Clone)]
pub struct AheadBehind {
    pub ahead: usize,
    pub behind: usize,
}

#[tauri::command]
pub async fn git_ahead_behind(repo_path: String) -> Result<AheadBehind, String> {
    let repo = open_repo(&repo_path)?;

    let head = repo.head().map_err(|e| e.message().to_string())?;
    let local_oid = head
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?
        .id();

    // Find upstream tracking branch
    let branch_name = head.shorthand().unwrap_or("main");
    let upstream_ref = format!("refs/remotes/origin/{}", branch_name);
    let upstream = repo
        .find_reference(&upstream_ref)
        .map_err(|_| format!("No upstream tracking branch found for '{}'", branch_name))?;
    let remote_oid = upstream
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?
        .id();

    let (ahead, behind) = repo
        .graph_ahead_behind(local_oid, remote_oid)
        .map_err(|e| e.message().to_string())?;

    Ok(AheadBehind { ahead, behind })
}

#[tauri::command]
pub async fn git_pull_ff(
    repo_path: String,
    remote: String,
    branch: String,
    token: String,
) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;

    // Step 1: Fetch
    #[cfg(not(windows))]
    {
        let mut remote_obj = repo
            .find_remote(&remote)
            .map_err(|e| e.message().to_string())?;
        let callbacks = make_callbacks(&token);
        let mut opts = FetchOptions::new();
        opts.remote_callbacks(callbacks);
        remote_obj
            .fetch(&[] as &[&str], Some(&mut opts), None)
            .map_err(|e| map_git_fetch_error(e.message()))?;
    }

    #[cfg(windows)]
    {
        let args = vec![
            String::from("fetch"),
            String::from("--prune"),
            remote.clone(),
        ];
        run_git_authenticated(Some(&repo_path), &token, &args)
            .map_err(|e| map_git_fetch_error(&e))?;
    }

    // Step 2: Fast-forward merge
    let fetch_head_ref = format!("refs/remotes/{}/{}", remote, branch);
    let fetch_commit = repo
        .find_reference(&fetch_head_ref)
        .map_err(|e| format!("Could not find remote branch: {}", e.message()))?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    let head = repo.head().map_err(|e| e.message().to_string())?;
    let head_commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;

    // Check if fast-forward is possible
    let (_, behind) = repo
        .graph_ahead_behind(head_commit.id(), fetch_commit.id())
        .map_err(|e| e.message().to_string())?;

    if behind == 0 {
        return Ok(()); // Already up to date
    }

    // Check that local is not ahead (would require merge)
    let analysis = repo
        .merge_analysis(&[&repo
            .find_annotated_commit(fetch_commit.id())
            .map_err(|e| e.message().to_string())?])
        .map_err(|e| e.message().to_string())?;

    if !analysis.0.is_fast_forward() && !analysis.0.is_up_to_date() {
        return Err("CONFLICT: Cannot fast-forward. Local and remote have diverged.".to_string());
    }

    if analysis.0.is_up_to_date() {
        return Ok(());
    }

    // Perform fast-forward
    let local_ref_name = format!("refs/heads/{}", branch);
    let mut local_ref = repo
        .find_reference(&local_ref_name)
        .map_err(|e| e.message().to_string())?;
    local_ref
        .set_target(fetch_commit.id(), "fast-forward pull")
        .map_err(|e| e.message().to_string())?;

    // Update working directory
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .map_err(|e| e.message().to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn git_merge_remote(
    repo_path: String,
    remote: String,
    branch: String,
) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;

    let fetch_ref = format!("refs/remotes/{}/{}", remote, branch);
    let remote_ref = repo
        .find_reference(&fetch_ref)
        .map_err(|e| format!("Could not find remote branch: {}", e.message()))?;
    let remote_commit = remote_ref
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    let annotated = repo
        .find_annotated_commit(remote_commit.id())
        .map_err(|e| e.message().to_string())?;

    // Perform merge (updates index + workdir)
    let mut merge_opts = git2::MergeOptions::new();
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.safe();

    repo.merge(
        &[&annotated],
        Some(&mut merge_opts),
        Some(&mut checkout_opts),
    )
    .map_err(|e| format!("CONFLICT: {}", e.message()))?;

    // Check for conflicts in the index
    let index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        // Abort: reset to HEAD so repo isn't left in merging state
        if let Ok(head) = repo.head() {
            if let Ok(commit) = head.peel_to_commit() {
                let _ = repo.reset(commit.as_object(), git2::ResetType::Hard, None);
            }
        }
        let _ = repo.cleanup_state();
        return Err(
            "CONFLICT: Files have conflicting changes that need manual resolution.".to_string(),
        );
    }

    // Create merge commit
    let sig = repo
        .signature()
        .unwrap_or_else(|_| Signature::now("Altals", "altals@local").unwrap());

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;

    let head_commit = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &format!("Merge remote changes from {}/{}", remote, branch),
        &tree,
        &[&head_commit, &remote_commit],
    )
    .map_err(|e| e.message().to_string())?;

    // Clean up merge state files
    let _ = repo.cleanup_state();

    Ok(())
}

#[tauri::command]
pub async fn git_set_user(repo_path: String, name: String, email: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    let mut config = repo.config().map_err(|e| e.message().to_string())?;
    config
        .set_str("user.name", &name)
        .map_err(|e| e.message().to_string())?;
    config
        .set_str("user.email", &email)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn git_clone_authenticated(
    url: String,
    target_path: String,
    token: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let args = vec![String::from("clone"), url, target_path];
        run_git_authenticated(None, &token, &args)
            .map(|_| ())
            .map_err(|e| map_git_clone_error(&e))?;
        return Ok(());
    }

    let callbacks = make_callbacks(&token);
    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);

    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_opts);

    builder
        .clone(&url, Path::new(&target_path))
        .map_err(|e| map_git_clone_error(e.message()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{map_git_clone_error, map_git_fetch_error, map_git_push_error};

    #[test]
    fn maps_windows_receive_response_timeout_to_network_error() {
        let message = "failed to receive response: 操作超时";
        assert_eq!(
            map_git_fetch_error(message),
            "Could not connect to GitHub. Check your internet connection."
        );
    }

    #[test]
    fn maps_push_rejected_to_conflict_error() {
        let message =
            "Updates were rejected because the remote contains work that you do not have locally.";
        assert_eq!(
            map_git_push_error(message),
            "CONFLICT: Remote has changes that conflict with your local commits."
        );
    }

    #[test]
    fn maps_clone_404_to_not_found_error() {
        let message = "unexpected http status code: 404";
        assert_eq!(
            map_git_clone_error(message),
            "Repository not found. Check the URL and try again."
        );
    }
}
