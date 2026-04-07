use base64::{engine::general_purpose::STANDARD, Engine};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
#[cfg(windows)]
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Emitter;
use tokio::task;

use crate::app_dirs;
use crate::fs_io::read_text_file_with_limit;
use crate::fs_tree::{
    build_file_tree, build_visible_tree, build_workspace_tree_snapshot, collect_files_recursive,
    read_dir_shallow_entries, FileEntry, WorkspaceTreeSnapshot,
};
use crate::process_utils::background_command;
use crate::security;
use crate::security::WorkspaceScopeState;
pub const ALLOWED_HOSTS: &[&str] = &[
    "api.anthropic.com",
    "api.openai.com",
    "generativelanguage.googleapis.com",
    "api.deepseek.com",
    "api.moonshot.cn",
    "dashscope.aliyuncs.com",
    "api.minimaxi.com",
    "open.bigmodel.cn",
    "api.github.com",
    "api.crossref.org",
    "api.exa.ai",
    "api.openalex.org",
];

pub fn validate_url_host(raw_url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(raw_url).map_err(|e| format!("Invalid URL: {}", e))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;

    // Allow localhost / 127.0.0.1 in debug builds only
    #[cfg(debug_assertions)]
    {
        if host == "localhost" || host == "127.0.0.1" {
            return Ok(());
        }
    }

    if ALLOWED_HOSTS.contains(&host) {
        Ok(())
    } else {
        Err(format!("URL host not in allowlist: {}", host))
    }
}

pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}


async fn run_blocking<F, T>(operation: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    task::spawn_blocking(operation)
        .await
        .map_err(|e| format!("Background task failed: {}", e))?
}

#[tauri::command]
pub async fn read_dir_recursive(path: String) -> Result<Vec<FileEntry>, String> {
    eprintln!("[fs] read_dir_recursive start path={}", path);
    let started = std::time::Instant::now();
    let path_for_read = path.clone();
    let result = run_blocking(move || build_file_tree(Path::new(&path_for_read))).await;
    match &result {
        Ok(entries) => eprintln!(
            "[fs] read_dir_recursive ok path={} entries={} elapsed_ms={}",
            path,
            entries.len(),
            started.elapsed().as_millis()
        ),
        Err(error) => eprintln!(
            "[fs] read_dir_recursive err path={} elapsed_ms={} error={}",
            path,
            started.elapsed().as_millis(),
            error
        ),
    }
    result
}

#[tauri::command]
pub async fn read_dir_shallow(path: String) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    run_blocking(move || read_dir_shallow_entries(Path::new(&path_for_read))).await
}

#[tauri::command]
pub async fn list_files_recursive(path: String) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    run_blocking(move || {
        let mut files = Vec::new();
        collect_files_recursive(Path::new(&path_for_read), &mut files)?;
        files.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
        Ok(files)
    })
    .await
}

#[tauri::command]
pub async fn read_visible_tree(
    path: String,
    loaded_dirs: Option<Vec<String>>,
) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    let loaded_set: HashSet<String> = loaded_dirs.unwrap_or_default().into_iter().collect();
    run_blocking(move || build_visible_tree(Path::new(&path_for_read), &loaded_set)).await
}

#[tauri::command]
pub async fn read_workspace_tree_snapshot(
    path: String,
    loaded_dirs: Option<Vec<String>>,
) -> Result<WorkspaceTreeSnapshot, String> {
    let path_for_read = path.clone();
    let loaded_set: HashSet<String> = loaded_dirs.unwrap_or_default().into_iter().collect();
    run_blocking(move || build_workspace_tree_snapshot(Path::new(&path_for_read), &loaded_set))
        .await
}

#[tauri::command]
pub async fn read_file(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    eprintln!("[fs] read_file start path={}", path);
    let started = std::time::Instant::now();
    let path_for_read = path.clone();
    let result =
        run_blocking(move || read_text_file_with_limit(Path::new(&path_for_read), max_bytes)).await;
    match &result {
        Ok(content) => eprintln!(
            "[fs] read_file ok path={} bytes={} elapsed_ms={}",
            path,
            content.len(),
            started.elapsed().as_millis()
        ),
        Err(error) => eprintln!(
            "[fs] read_file err path={} elapsed_ms={} error={}",
            path,
            started.elapsed().as_millis(),
            error
        ),
    }
    result
}

#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    run_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        Ok(STANDARD.encode(&bytes))
    })
    .await
}

#[tauri::command]
pub async fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    eprintln!("[fs] read_file_binary start path={}", path);
    let started = std::time::Instant::now();
    let path_for_read = path.clone();
    let result = run_blocking(move || fs::read(&path_for_read).map_err(|e| e.to_string())).await;
    match &result {
        Ok(bytes) => eprintln!(
            "[fs] read_file_binary ok path={} bytes={} elapsed_ms={}",
            path,
            bytes.len(),
            started.elapsed().as_millis()
        ),
        Err(error) => eprintln!(
            "[fs] read_file_binary err path={} elapsed_ms={} error={}",
            path,
            started.elapsed().as_millis(),
            error
        ),
    }
    result
}

#[tauri::command]
pub async fn write_file(
    path: String,
    content: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || fs::write(&resolved, &content).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn write_file_base64(
    path: String,
    data: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || {
        let bytes = STANDARD
            .decode(&data)
            .map_err(|e| format!("Base64 decode error: {}", e))?;
        fs::write(&resolved, &bytes).map_err(|e| format!("Write error: {}", e))
    })
    .await
}

#[tauri::command]
pub async fn create_file(
    path: String,
    content: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || {
        if resolved.exists() {
            return Err("File already exists".to_string());
        }
        fs::write(&resolved, &content).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn create_dir(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || fs::create_dir_all(&resolved).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn rename_path(
    old_path: String,
    new_path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved_old =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&old_path))?;
    let resolved_new =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&new_path))?;
    run_blocking(move || fs::rename(&resolved_old, &resolved_new).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn delete_path(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || {
        if resolved.is_dir() {
            fs::remove_dir_all(&resolved).map_err(|e| e.to_string())
        } else {
            fs::remove_file(&resolved).map_err(|e| e.to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn copy_file(
    src: String,
    dest: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved_dest =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&dest))?;
    run_blocking(move || {
        fs::copy(&src, &resolved_dest).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn copy_dir(
    src: String,
    dest: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved_dest =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&dest))?;
    run_blocking(move || {
        let src = Path::new(&src);
        copy_dir_recursive(src, &resolved_dest).map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs_io::format_file_too_large_error;

    fn temp_file_path(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("altals-fs-{label}-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn read_text_file_with_limit_returns_error_code_when_file_is_too_large() {
        let path = temp_file_path("too-large");
        fs::write(&path, "1234567890").unwrap();

        let error = read_text_file_with_limit(&path, Some(4)).unwrap_err();
        assert_eq!(error, format_file_too_large_error(4, 10));

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn read_text_file_with_limit_reads_when_within_limit() {
        let path = temp_file_path("within-limit");
        fs::write(&path, "hello").unwrap();

        let content = read_text_file_with_limit(&path, Some(8)).unwrap();
        assert_eq!(content, "hello");

        fs::remove_file(path).unwrap();
    }
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn is_directory(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).is_dir())
}

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    let exists = Path::new(&path).exists();
    eprintln!("[fs] path_exists path={} exists={}", path, exists);
    Ok(exists)
}

#[tauri::command]
pub async fn watch_directory(
    app: tauri::AppHandle,
    state: tauri::State<'_, WatcherState>,
    paths: Vec<String>,
    recursive_paths: Option<Vec<String>>,
) -> Result<(), String> {
    eprintln!("[fs-watch] watch_directory start paths={:?}", paths);
    let app_clone = app.clone();
    let recursive_paths = recursive_paths.unwrap_or_default();
    let recursive_set: HashSet<String> = recursive_paths.into_iter().collect();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| match res {
            Ok(event) => {
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                let _ = app_clone.emit(
                    "fs-change",
                    serde_json::json!({
                        "kind": format!("{:?}", event.kind),
                        "paths": paths,
                    }),
                );
            }
            Err(e) => eprintln!("[fs-watch] error: {:?}", e),
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    let mut watched = false;
    let mut seen = HashSet::new();
    for path in paths {
        if path.trim().is_empty() || !seen.insert(path.clone()) {
            continue;
        }

        let path_ref = Path::new(&path);
        if !path_ref.exists() {
            continue;
        }

        let recursive_mode = if recursive_set.contains(&path) {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };

        watcher
            .watch(path_ref, recursive_mode)
            .map_err(|e| e.to_string())?;
        watched = true;
    }

    if !watched {
        eprintln!("[fs-watch] watch_directory err no-valid-directories");
        return Err("No valid directories to watch".to_string());
    }

    *state.watcher.lock().unwrap() = Some(watcher);
    eprintln!("[fs-watch] watch_directory ok");
    Ok(())
}

#[tauri::command]
pub async fn unwatch_directory(state: tauri::State<'_, WatcherState>) -> Result<(), String> {
    *state.watcher.lock().unwrap() = None;
    Ok(())
}

#[derive(Deserialize)]
pub struct ApiProxyRequest {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[tauri::command]
pub async fn proxy_api_call(request: ApiProxyRequest) -> Result<String, String> {
    validate_url_host(&request.url)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = match request.method.as_str() {
        "POST" => client.post(&request.url),
        "GET" => client.get(&request.url),
        "PUT" => client.put(&request.url),
        _ => return Err(format!("Unsupported method: {}", request.method)),
    };

    for (key, value) in &request.headers {
        req = req.header(key.as_str(), value.as_str());
    }

    if !request.body.is_empty() {
        req = req.body(request.body);
    }

    let response = req.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    if status >= 200 && status < 300 {
        Ok(body)
    } else {
        Err(format!("API error {}: {}", status, body))
    }
}

#[derive(Serialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub line: usize,
    pub text: String,
}

#[tauri::command]
pub async fn search_file_contents(
    dir: String,
    query: String,
    max_results: usize,
) -> Result<Vec<SearchResult>, String> {
    run_blocking(move || {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        search_dir_contents(Path::new(&dir), &query_lower, &mut results, max_results)?;
        Ok(results)
    })
    .await
}

#[tauri::command]
pub async fn run_shell_command(cwd: String, command: String) -> Result<String, String> {
    #[cfg(unix)]
    let output = background_command("bash")
        .args(&["-c", &command])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    #[cfg(windows)]
    let output = background_command("cmd")
        .args(&["/C", &command])
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    format_command_output(output)
}

#[tauri::command]
pub async fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("Path does not exist".to_string());
    }

    let metadata = fs::metadata(target).map_err(|e| e.to_string())?;
    let is_dir = metadata.is_dir();

    #[cfg(target_os = "macos")]
    {
        let mut command = background_command("open");
        if !is_dir {
            command.arg("-R");
        }
        command.arg(target);
        let status = command.status().map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in Finder: {status}"));
    }

    #[cfg(target_os = "windows")]
    {
        let normalized = target.to_string_lossy().replace('/', "\\");
        let mut command = background_command("explorer");
        if is_dir {
            command.arg(&normalized);
        } else {
            command.arg(format!("/select,{normalized}"));
        }
        let status = command.status().map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in Explorer: {status}"));
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let open_target = if is_dir {
            target.to_path_buf()
        } else {
            target
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| target.to_path_buf())
        };
        let status = background_command("xdg-open")
            .arg(&open_target)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in file manager: {status}"));
    }
}

#[tauri::command]
pub async fn run_workspace_command(
    cwd: String,
    command: String,
    state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<String, String> {
    let cwd = security::ensure_workspace_cwd(&state, &cwd)?;
    let (program, args) = parse_workspace_command(&command)?;

    let output = background_command(&program)
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    format_command_output(output)
}

fn parse_workspace_command(command: &str) -> Result<(String, Vec<String>), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Command cannot be empty".to_string());
    }
    if trimmed.contains('\n') || trimmed.contains('\r') || trimmed.contains('\0') {
        return Err("Multiline commands are not allowed".to_string());
    }

    let forbidden_fragments = ["&&", "||", ";", "|", ">", "<", "`", "$("];
    if forbidden_fragments
        .iter()
        .any(|fragment| trimmed.contains(fragment))
    {
        return Err(
            "Command chaining, pipes, redirects, and substitutions are not allowed".to_string(),
        );
    }

    let parts = shell_words::split(trimmed)
        .map_err(|e| format!("Failed to parse command arguments: {e}"))?;
    if parts.is_empty() {
        return Err("Command cannot be empty".to_string());
    }

    let program = parts[0].clone();
    let args = parts[1..].to_vec();
    let program_name = Path::new(&program)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&program)
        .to_ascii_lowercase();

    let forbidden_programs = [
        "bash",
        "sh",
        "zsh",
        "fish",
        "cmd",
        "cmd.exe",
        "powershell",
        "pwsh",
        "sudo",
        "su",
        "doas",
        "rm",
        "chmod",
        "chown",
        "dd",
        "diskutil",
        "mkfs",
        "shutdown",
        "reboot",
        "halt",
        "poweroff",
        "launchctl",
        "osascript",
    ];
    if forbidden_programs.contains(&program_name.as_str()) {
        return Err(format!(
            "Program is not allowed in workspace command mode: {program_name}"
        ));
    }

    let eval_flags = [
        "-c",
        "-C",
        "/C",
        "-command",
        "-encodedcommand",
        "--eval",
        "-e",
    ];
    if args.iter().any(|arg| eval_flags.contains(&arg.as_str())) {
        return Err(
            "Inline code-evaluation flags are not allowed in workspace command mode".to_string(),
        );
    }

    Ok((program, args))
}

fn format_command_output(output: std::process::Output) -> Result<String, String> {
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let mut result = stdout;
    if !stderr.is_empty() {
        result.push_str("\n--- stderr ---\n");
        result.push_str(&stderr);
    }

    // Truncate at 100KB
    if result.len() > 100_000 {
        result.truncate(100_000);
        result.push_str("\n... [truncated at 100KB]");
    }

    if output.status.success() {
        Ok(result)
    } else if result.trim().is_empty() {
        Err(format!("Command failed with status {}", output.status))
    } else {
        Err(result)
    }
}

fn is_executable_file(path: &Path) -> bool {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };

    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn resolve_command_path_impl(command: &str) -> Option<PathBuf> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return None;
    }

    let candidate = Path::new(trimmed);
    let has_path_separator = trimmed.contains(std::path::MAIN_SEPARATOR)
        || trimmed.contains('/')
        || trimmed.contains('\\');
    if candidate.is_absolute() || has_path_separator {
        return is_executable_file(candidate).then(|| candidate.to_path_buf());
    }

    let path_var = std::env::var_os("PATH")?;
    let path_entries = std::env::split_paths(&path_var);

    #[cfg(windows)]
    let extensions: Vec<OsString> = if Path::new(trimmed).extension().is_some() {
        vec![OsString::new()]
    } else {
        std::env::var_os("PATHEXT")
            .map(|value| {
                value
                    .to_string_lossy()
                    .split(';')
                    .filter_map(|entry| {
                        let ext = entry.trim();
                        (!ext.is_empty()).then(|| OsString::from(ext))
                    })
                    .collect::<Vec<_>>()
            })
            .filter(|items| !items.is_empty())
            .unwrap_or_else(|| {
                vec![
                    OsString::from(".COM"),
                    OsString::from(".EXE"),
                    OsString::from(".BAT"),
                    OsString::from(".CMD"),
                ]
            })
    };

    for dir in path_entries {
        #[cfg(windows)]
        {
            for extension in &extensions {
                let candidate_name = if extension.is_empty() {
                    OsString::from(trimmed)
                } else {
                    let mut value = OsString::from(trimmed);
                    value.push(extension);
                    value
                };
                let full_path = dir.join(candidate_name);
                if is_executable_file(&full_path) {
                    return Some(full_path);
                }
            }
        }

        #[cfg(not(windows))]
        {
            let full_path = dir.join(trimmed);
            if is_executable_file(&full_path) {
                return Some(full_path);
            }
        }
    }

    None
}

#[tauri::command]
pub async fn resolve_command_path(command: String) -> Result<String, String> {
    Ok(resolve_command_path_impl(&command)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgramOutputRequest {
    program: String,
    #[serde(default)]
    args: Vec<String>,
    cwd: Option<String>,
}

#[tauri::command]
pub async fn run_program_capture(request: ProgramOutputRequest) -> Result<String, String> {
    let mut command = background_command(&request.program);
    command.args(&request.args);

    if let Some(cwd) = request.cwd.as_ref().filter(|value| !value.trim().is_empty()) {
        command.current_dir(cwd);
    }

    let output = command.output().map_err(|e| e.to_string())?;
    format_command_output(output)
}

fn search_dir_contents(
    dir: &Path,
    query: &str,
    results: &mut Vec<SearchResult>,
    max_results: usize,
) -> Result<(), String> {
    if results.len() >= max_results {
        return Ok(());
    }

    let read_dir = match fs::read_dir(dir) {
        Ok(d) => d,
        Err(_) => return Ok(()),
    };

    for entry in read_dir {
        if results.len() >= max_results {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let file_type = metadata.file_type();
        let is_symlink = file_type.is_symlink();
        let is_dir = file_type.is_dir();

        // Skip hidden dirs, node_modules, target
        if name.starts_with('.') && is_dir {
            continue;
        }
        if name == "node_modules" || name == "target" {
            continue;
        }
        if is_symlink {
            continue;
        }

        if is_dir {
            search_dir_contents(&path, query, results, max_results)?;
        } else if is_searchable_text(&name) {
            if let Ok(content) = fs::read_to_string(&path) {
                for (i, line) in content.lines().enumerate() {
                    if line.to_lowercase().contains(query) {
                        results.push(SearchResult {
                            path: path.to_string_lossy().to_string(),
                            name: name.clone(),
                            line: i + 1,
                            text: line.trim().to_string(),
                        });
                        if results.len() >= max_results {
                            break;
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn fetch_url_content(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut current = security::validate_public_fetch_url(&url).await?;
    let mut redirects_remaining = 5usize;

    let html = loop {
        let response = client
            .get(current.clone())
            .header("User-Agent", "Altals/1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if response.status().is_redirection() {
            if redirects_remaining == 0 {
                return Err("Too many redirects while fetching URL".to_string());
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .ok_or_else(|| "Redirect response missing Location header".to_string())?
                .to_str()
                .map_err(|e| format!("Invalid redirect location: {e}"))?;
            let next = current
                .join(location)
                .or_else(|_| url::Url::parse(location))
                .map_err(|e| format!("Invalid redirect URL: {e}"))?;
            current = security::validate_public_fetch_url(next.as_str()).await?;
            redirects_remaining -= 1;
            continue;
        }

        let status = response.status().as_u16();
        if status < 200 || status >= 300 {
            return Err(format!("HTTP error {}", status));
        }

        break response.text().await.map_err(|e| e.to_string())?;
    };

    let text = strip_html(&html);

    // Truncate at 50KB
    if text.len() > 50_000 {
        let mut t = text;
        t.truncate(50_000);
        t.push_str("\n... [truncated at 50KB]");
        Ok(t)
    } else {
        Ok(text)
    }
}

fn strip_html(html: &str) -> String {
    use regex_lite::Regex;

    // Remove <script> and <style> blocks
    let re_script = Regex::new(r"(?is)<script[\s>].*?</script>").unwrap();
    let text = re_script.replace_all(html, "");
    let re_style = Regex::new(r"(?is)<style[\s>].*?</style>").unwrap();
    let text = re_style.replace_all(&text, "");
    let re_nav = Regex::new(r"(?is)<(nav|header|footer)[\s>].*?</\1>").unwrap();
    let text = re_nav.replace_all(&text, "");

    // Strip all remaining HTML tags
    let re_tags = Regex::new(r"<[^>]+>").unwrap();
    let text = re_tags.replace_all(&text, "");

    // Decode common HTML entities
    let text = text
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ");

    // Collapse whitespace: multiple newlines → double newline, multiple spaces → single
    let re_newlines = Regex::new(r"\n{3,}").unwrap();
    let text = re_newlines.replace_all(&text, "\n\n");
    let re_spaces = Regex::new(r"[ \t]{2,}").unwrap();
    let text = re_spaces.replace_all(&text, " ");

    text.trim().to_string()
}

#[tauri::command]
pub async fn get_global_config_dir() -> Result<String, String> {
    let dir = app_dirs::data_root_dir()?;
    let value = dir.to_string_lossy().to_string();
    eprintln!("[app-dirs] get_global_config_dir={}", value);
    Ok(value)
}

fn is_searchable_text(name: &str) -> bool {
    let name_lower = name.to_lowercase();
    let extensions = [
        ".md", ".txt", ".js", ".ts", ".jsx", ".tsx", ".py", ".r", ".rs", ".json", ".yaml", ".yml",
        ".toml", ".html", ".css", ".tex", ".bib", ".sh", ".sql", ".rmd", ".xml", ".vue", ".svelte",
        ".go", ".java", ".c", ".cpp", ".h", ".hpp", ".rb", ".php", ".swift", ".kt", ".lua", ".zig",
        ".env", ".csv", ".tsv", ".ini", ".cfg", ".conf",
    ];
    extensions.iter().any(|ext| name_lower.ends_with(ext))
}
