use crate::process_utils::background_command;
#[cfg(windows)]
use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{Cred, RemoteCallbacks, Repository};
use std::path::{Path, PathBuf};

pub fn normalize_repo_pathbuf(repo_path: &str) -> Result<PathBuf, String> {
    let trimmed = repo_path.trim();
    if trimmed.is_empty() {
        return Err("missing repository path".to_string());
    }

    let normalized = trimmed.trim_end_matches(['/', '\\']);
    let candidate = if normalized.is_empty() { "/" } else { normalized };
    let path = PathBuf::from(candidate);
    if path.is_absolute() {
        Ok(path)
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|e| e.to_string())
    }
}

pub fn normalize_repo_path(repo_path: &str) -> Result<String, String> {
    Ok(normalize_repo_pathbuf(repo_path)?
        .to_string_lossy()
        .to_string())
}

pub fn repo_relative_path(repo_root: &Path, file_path: &str) -> String {
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

pub fn run_git_text(repo_path: &str, args: &[String]) -> Result<String, String> {
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

pub fn run_git_commit_text(
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

pub fn is_missing_git_identity_error(message: &str) -> bool {
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

pub fn map_git_push_error(message: &str) -> String {
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

pub fn map_git_push_branch_error(message: &str) -> String {
    if is_git_auth_error(message) {
        "Authentication failed. Please reconnect your GitHub account.".to_string()
    } else if is_git_network_error(message) {
        "Could not connect to GitHub. Check your internet connection.".to_string()
    } else {
        format!("Push to branch failed: {message}")
    }
}

pub fn map_git_fetch_error(message: &str) -> String {
    if is_git_auth_error(message) {
        "Authentication failed. Please reconnect your GitHub account.".to_string()
    } else if is_git_network_error(message) {
        "Could not connect to GitHub. Check your internet connection.".to_string()
    } else {
        format!("Fetch failed: {message}")
    }
}

pub fn map_git_clone_error(message: &str) -> String {
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
pub fn run_git_authenticated(
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

pub fn run_git_init(repo_path: &str) -> Result<(), String> {
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

pub fn open_repo(repo_path: &str) -> Result<Repository, String> {
    let normalized = normalize_repo_path(repo_path)?;
    Repository::open(normalized).map_err(|e| e.message().to_string())
}

pub fn make_callbacks(token: &str) -> RemoteCallbacks<'_> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, username, _allowed| {
        Cred::userpass_plaintext(username.unwrap_or("x-access-token"), token)
    });
    callbacks
}
