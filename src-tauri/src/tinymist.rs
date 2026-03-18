use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::app_dirs;
use crate::process_utils::background_command;

const TINYMIST_RELEASE_BASE: &str =
    "https://github.com/Myriad-Dreamin/tinymist/releases/latest/download";

const TINYMIST_SYSTEM_COMMAND: &str = "tinymist-lsp";
const TINYMIST_MANAGED_COMMAND: &str = "tinymist-lsp-managed";
const TINYMIST_MANAGED_WINDOWS_COMMAND: &str = "tinymist-lsp-managed-win";
const TINYMIST_LEGACY_COMMAND: &str = "tinymist-lsp-legacy";
const TINYMIST_LEGACY_WINDOWS_COMMAND: &str = "tinymist-lsp-legacy-win";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TinymistBinaryStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub launch_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypstPreviewJumpPoint {
    pub page: u32,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone)]
struct ResolvedTinymistBinary {
    path: String,
    launch_command: &'static str,
}

fn altals_bin_dir() -> Option<PathBuf> {
    app_dirs::bin_dir().ok()
}

fn tinymist_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "tinymist.exe"
    } else {
        "tinymist"
    }
}

fn tinymist_target_triple() -> Result<&'static str, String> {
    if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-apple-darwin")
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-apple-darwin")
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-unknown-linux-gnu")
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-unknown-linux-gnu")
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-pc-windows-msvc")
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-pc-windows-msvc")
    } else {
        Err("Unsupported platform".to_string())
    }
}

fn tinymist_download_url() -> Result<(String, bool), String> {
    let triple = tinymist_target_triple()?;
    let is_zip = triple.ends_with("windows-msvc");
    let ext = if is_zip { "zip" } else { "tar.gz" };
    Ok((
        format!("{TINYMIST_RELEASE_BASE}/tinymist-{triple}.{ext}"),
        is_zip,
    ))
}

fn current_managed_command_name() -> &'static str {
    if cfg!(target_os = "windows") {
        TINYMIST_MANAGED_WINDOWS_COMMAND
    } else {
        TINYMIST_MANAGED_COMMAND
    }
}

fn current_legacy_command_name() -> &'static str {
    if cfg!(target_os = "windows") {
        TINYMIST_LEGACY_WINDOWS_COMMAND
    } else {
        TINYMIST_LEGACY_COMMAND
    }
}

fn managed_tinymist_candidates() -> Vec<(PathBuf, &'static str)> {
    let mut candidates = Vec::new();

    if let Ok(root) = app_dirs::data_root_dir() {
        candidates.push((
            root.join("bin").join(tinymist_binary_name()),
            current_managed_command_name(),
        ));
    }

    if let Some(legacy_root) = app_dirs::legacy_data_root_dir() {
        candidates.push((
            legacy_root.join("bin").join(tinymist_binary_name()),
            current_legacy_command_name(),
        ));
    }

    candidates
}

fn shell_lookup_tinymist() -> Option<String> {
    #[cfg(unix)]
    {
        let output = background_command("/bin/bash")
            .args(&["-lc", "which tinymist"])
            .output()
            .ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    #[cfg(windows)]
    {
        let output = background_command("where").arg("tinymist").output().ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()?
                .trim()
                .to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    None
}

fn find_tinymist() -> Option<ResolvedTinymistBinary> {
    for (path, launch_command) in managed_tinymist_candidates() {
        if path.exists() {
            return Some(ResolvedTinymistBinary {
                path: path.to_string_lossy().to_string(),
                launch_command,
            });
        }
    }

    let system_candidates = [
        "/opt/homebrew/bin/tinymist",
        "/usr/local/bin/tinymist",
        "/usr/bin/tinymist",
    ];
    for path in &system_candidates {
        if Path::new(path).exists() {
            return Some(ResolvedTinymistBinary {
                path: path.to_string(),
                launch_command: TINYMIST_SYSTEM_COMMAND,
            });
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let cargo_path = format!("{home}/.cargo/bin/tinymist");
        if Path::new(&cargo_path).exists() {
            return Some(ResolvedTinymistBinary {
                path: cargo_path,
                launch_command: TINYMIST_SYSTEM_COMMAND,
            });
        }
    }

    shell_lookup_tinymist().map(|path| ResolvedTinymistBinary {
        path,
        launch_command: TINYMIST_SYSTEM_COMMAND,
    })
}

#[tauri::command]
pub async fn check_tinymist_binary() -> Result<TinymistBinaryStatus, String> {
    let resolved = find_tinymist();
    Ok(TinymistBinaryStatus {
        installed: resolved.is_some(),
        path: resolved.as_ref().map(|value| value.path.clone()),
        launch_command: resolved.map(|value| value.launch_command.to_string()),
    })
}

#[tauri::command]
pub async fn download_tinymist(app: tauri::AppHandle) -> Result<String, String> {
    let bin_dir = altals_bin_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    std::fs::create_dir_all(&bin_dir).map_err(|e| format!("Cannot create directory: {e}"))?;

    let (url, is_zip) = tinymist_download_url()?;
    eprintln!("[tinymist] Downloading from: {url}");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let response = client
        .get(&url)
        .header("User-Agent", "Altals/1.0")
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let total_mb = total_bytes as f64 / 1_048_576.0;

    let archive_ext = if is_zip { "zip" } else { "tar.gz" };
    let archive_path = bin_dir.join(format!("tinymist-download.{archive_ext}"));
    let mut archive_file = std::fs::File::create(&archive_path)
        .map_err(|e| format!("Cannot create temp file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut last_pct: u32 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {e}"))?;
        archive_file
            .write_all(&chunk)
            .map_err(|e| format!("Write error: {e}"))?;
        downloaded += chunk.len() as u64;

        let pct = if total_bytes > 0 {
            ((downloaded as f64 / total_bytes as f64) * 100.0) as u32
        } else {
            0
        };

        if pct != last_pct {
            last_pct = pct;
            let _ = app.emit(
                "tinymist-download-progress",
                serde_json::json!({
                    "percent": pct,
                    "downloaded_mb": format!("{:.1}", downloaded as f64 / 1_048_576.0),
                    "total_mb": format!("{:.1}", total_mb),
                }),
            );
        }
    }

    drop(archive_file);
    eprintln!("[tinymist] Download complete: {downloaded} bytes");

    let extract_dir = bin_dir.join(format!("tinymist-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("Cannot create extraction directory: {e}"))?;

    if is_zip {
        #[cfg(windows)]
        {
            let status = background_command("powershell")
                .args(&[
                    "-NoProfile",
                    "-Command",
                    &format!(
                        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                        archive_path.display(),
                        extract_dir.display(),
                    ),
                ])
                .status()
                .map_err(|e| format!("Extract failed: {e}"))?;
            if !status.success() {
                return Err("Failed to extract zip archive".to_string());
            }
        }
        #[cfg(not(windows))]
        {
            return Err("Zip extraction not supported on this platform".to_string());
        }
    } else {
        let status = background_command("tar")
            .args(&[
                "xf",
                &archive_path.to_string_lossy(),
                "-C",
                &extract_dir.to_string_lossy(),
            ])
            .status()
            .map_err(|e| format!("Extract failed: {e}"))?;
        if !status.success() {
            return Err("Failed to extract tar archive".to_string());
        }
    }

    let _ = std::fs::remove_file(&archive_path);

    let release_dir_name = format!("tinymist-{}", tinymist_target_triple()?);
    let extracted_binary = extract_dir
        .join(release_dir_name)
        .join(tinymist_binary_name());
    if !extracted_binary.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
        return Err(format!(
            "Binary not found after extraction at {}",
            extracted_binary.display()
        ));
    }

    let dest_path = bin_dir.join(tinymist_binary_name());
    if dest_path.exists() {
        let _ = std::fs::remove_file(&dest_path);
    }
    std::fs::copy(&extracted_binary, &dest_path)
        .map_err(|e| format!("Failed to install Tinymist: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {e}"))?;
    }

    let _ = std::fs::remove_dir_all(&extract_dir);

    let result = dest_path.to_string_lossy().to_string();
    eprintln!("[tinymist] Installed to: {result}");

    let _ = app.emit(
        "tinymist-download-progress",
        serde_json::json!({
            "percent": 100,
            "downloaded_mb": format!("{:.1}", total_mb),
            "total_mb": format!("{:.1}", total_mb),
        }),
    );

    Ok(result)
}

async fn connect_preview_data_plane(
    port: u16,
) -> Result<
    tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    String,
> {
    let endpoint = format!("ws://127.0.0.1:{port}/");
    let (mut socket, _) = connect_async(&endpoint)
        .await
        .map_err(|e| format!("Cannot connect to Tinymist preview websocket: {e}"))?;

    socket
        .send(Message::Text("current".to_string().into()))
        .await
        .map_err(|e| format!("Cannot initialize Tinymist preview websocket: {e}"))?;

    Ok(socket)
}

fn split_preview_message(data: &[u8]) -> Option<(String, String)> {
    let comma_index = data.iter().position(|value| *value == b',')?;
    let kind = std::str::from_utf8(&data[..comma_index]).ok()?.to_string();
    let payload = String::from_utf8(data[comma_index + 1..].to_vec()).ok()?;
    Some((kind, payload))
}

fn parse_jump_positions(payload: &str) -> Vec<TypstPreviewJumpPoint> {
    payload
        .split(',')
        .filter_map(|entry| {
            let mut parts = entry.split_whitespace();
            let page = parts.next()?.parse::<u32>().ok()?;
            let x = parts.next()?.parse::<f32>().ok()?;
            let y = parts.next()?.parse::<f32>().ok()?;
            Some(TypstPreviewJumpPoint { page, x, y })
        })
        .collect()
}

#[tauri::command]
pub async fn typst_preview_wait_for_jump(
    port: u16,
    timeout_ms: Option<u64>,
) -> Result<Vec<TypstPreviewJumpPoint>, String> {
    let wait_duration = Duration::from_millis(timeout_ms.unwrap_or(2500));
    let mut socket = connect_preview_data_plane(port).await?;

    let wait_result = timeout(wait_duration, async {
        while let Some(message) = socket.next().await {
            match message {
                Ok(Message::Binary(data)) => {
                    let Some((kind, payload)) = split_preview_message(&data) else {
                        continue;
                    };
                    if kind == "jump" || kind == "viewport" {
                        let positions = parse_jump_positions(&payload);
                        if !positions.is_empty() {
                            return Ok(positions);
                        }
                    }
                }
                Ok(Message::Text(text)) => {
                    if text.trim() == "current not available" {
                        return Err("Tinymist preview is not ready yet".to_string());
                    }
                }
                Ok(Message::Close(_)) => {
                    return Err("Tinymist preview websocket closed unexpectedly".to_string());
                }
                Ok(_) => {}
                Err(error) => {
                    return Err(format!("Tinymist preview websocket error: {error}"));
                }
            }
        }

        Err("Tinymist preview websocket ended unexpectedly".to_string())
    })
    .await
    .map_err(|_| "Timed out waiting for Tinymist preview jump".to_string())?;

    let _ = socket.close(None).await;
    wait_result
}

#[tauri::command]
pub async fn typst_preview_send_src_point(
    port: u16,
    page: u32,
    x: f32,
    y: f32,
) -> Result<(), String> {
    let mut socket = connect_preview_data_plane(port).await?;
    let payload = serde_json::json!({
        "page_no": page,
        "x": x,
        "y": y,
    });

    socket
        .send(Message::Text(format!("src-point {payload}").into()))
        .await
        .map_err(|e| format!("Cannot send Typst preview source point: {e}"))?;

    let _ = socket.close(None).await;
    Ok(())
}
