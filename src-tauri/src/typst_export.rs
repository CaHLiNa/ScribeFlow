use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

use crate::app_dirs;
use crate::process_utils::{background_command, background_tokio_command};

const TYPST_COMPILE_STREAM_EVENT: &str = "typst-compile-stream";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportError {
    pub line: Option<u32>,
    pub message: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypstCompileResult {
    pub success: bool,
    pub pdf_path: Option<String>,
    pub errors: Vec<ExportError>,
    pub warnings: Vec<ExportError>,
    pub log: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypstCompilerStatus {
    pub installed: bool,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TypstCompileStreamPayload {
    typ_path: String,
    line: String,
    clear: bool,
    header: bool,
    open: bool,
    status: Option<String>,
}

fn altals_bin_dir() -> Option<PathBuf> {
    app_dirs::bin_dir().ok()
}

fn typst_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "typst.exe"
    } else {
        "typst"
    }
}

fn typst_download_target_triple() -> Result<&'static str, String> {
    if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-apple-darwin")
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-apple-darwin")
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-unknown-linux-musl")
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-unknown-linux-musl")
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "aarch64") {
        Ok("aarch64-pc-windows-msvc")
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        Ok("x86_64-pc-windows-msvc")
    } else {
        Err("Unsupported platform".to_string())
    }
}

const TYPST_VERSION: &str = "0.14.2";

fn typst_download_url() -> Result<(String, bool), String> {
    let triple = typst_download_target_triple()?;
    let is_zip = triple.ends_with("windows-msvc");
    let ext = if is_zip { "zip" } else { "tar.xz" };
    Ok((
        format!(
            "https://github.com/typst/typst/releases/download/v{}/typst-{}.{}",
            TYPST_VERSION, triple, ext
        ),
        is_zip,
    ))
}

fn typst_not_found_message() -> String {
    "Typst not found. Download it in Settings or install it manually.".to_string()
}

/// 6-tier binary discovery for Typst (mirrors find_tectonic in latex.rs)
fn find_typst(app: &tauri::AppHandle, custom_path: Option<&str>) -> Option<String> {
    if let Some(path) = custom_path.filter(|value| !value.trim().is_empty()) {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // 1. App-managed install (~/.altals/bin/typst)
    for bin_dir in app_dirs::candidate_bin_dirs() {
        let path = bin_dir.join(typst_binary_name());
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    // 2. Bundled sidecar (production)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let sidecar = exe_dir.join("typst");
            if sidecar.exists() {
                return Some(sidecar.to_string_lossy().to_string());
            }
            let triple = current_target_triple();
            let sidecar_triple = exe_dir.join(format!("typst-{triple}"));
            if sidecar_triple.exists() {
                return Some(sidecar_triple.to_string_lossy().to_string());
            }
        }
    }

    // 3. Resource dir (Tauri v2 bundled resources)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let sidecar = resource_dir.join("binaries").join("typst");
        if sidecar.exists() {
            return Some(sidecar.to_string_lossy().to_string());
        }
    }

    // 4. Dev mode: src-tauri/binaries/
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let triple = current_target_triple();
        let dev_path = Path::new(&manifest_dir)
            .join("binaries")
            .join(format!("typst-{triple}"));
        if dev_path.exists() {
            return Some(dev_path.to_string_lossy().to_string());
        }
    }

    // 5. Common system install locations
    let candidates = [
        "/opt/homebrew/bin/typst",
        "/usr/local/bin/typst",
        "/usr/bin/typst",
    ];
    for path in &candidates {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let cargo_path = format!("{home}/.cargo/bin/typst");
        if Path::new(&cargo_path).exists() {
            return Some(cargo_path);
        }
    }

    // 6. Shell lookup fallback
    #[cfg(unix)]
    {
        let output = background_command("/bin/bash")
            .args(&["-lc", "which typst"])
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
        let output = background_command("where").arg("typst").output().ok()?;
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

#[tauri::command]
pub async fn download_typst(app: tauri::AppHandle) -> Result<String, String> {
    let bin_dir = altals_bin_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    std::fs::create_dir_all(&bin_dir).map_err(|e| format!("Cannot create directory: {}", e))?;

    let (url, is_zip) = typst_download_url()?;
    eprintln!("[typst] Downloading from: {}", url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(&url)
        .header("User-Agent", "Altals/1.0")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let total_mb = total_bytes as f64 / 1_048_576.0;

    let archive_ext = if is_zip { "zip" } else { "tar.xz" };
    let archive_path = bin_dir.join(format!("typst-download.{}", archive_ext));
    let mut archive_file = std::fs::File::create(&archive_path)
        .map_err(|e| format!("Cannot create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut last_pct: u32 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        archive_file
            .write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        let pct = if total_bytes > 0 {
            ((downloaded as f64 / total_bytes as f64) * 100.0) as u32
        } else {
            0
        };

        if pct != last_pct {
            last_pct = pct;
            let _ = app.emit(
                "typst-download-progress",
                serde_json::json!({
                    "percent": pct,
                    "downloaded_mb": format!("{:.1}", downloaded as f64 / 1_048_576.0),
                    "total_mb": format!("{:.1}", total_mb),
                }),
            );
        }
    }

    drop(archive_file);
    eprintln!("[typst] Download complete: {} bytes", downloaded);

    let extract_dir = bin_dir.join(format!("typst-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("Cannot create extraction directory: {}", e))?;

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
                .map_err(|e| format!("Extract failed: {}", e))?;
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
            .map_err(|e| format!("Extract failed: {}", e))?;
        if !status.success() {
            return Err("Failed to extract tar archive".to_string());
        }
    }

    let _ = std::fs::remove_file(&archive_path);

    let release_dir_name = format!("typst-{}", typst_download_target_triple()?);
    let extracted_binary = extract_dir.join(release_dir_name).join(typst_binary_name());
    if !extracted_binary.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
        return Err(format!(
            "Binary not found after extraction at {}",
            extracted_binary.display()
        ));
    }

    let dest_path = bin_dir.join(typst_binary_name());
    if dest_path.exists() {
        let _ = std::fs::remove_file(&dest_path);
    }
    std::fs::copy(&extracted_binary, &dest_path)
        .map_err(|e| format!("Failed to install Typst: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    let _ = std::fs::remove_dir_all(&extract_dir);

    let result = dest_path.to_string_lossy().to_string();
    eprintln!("[typst] Installed to: {}", result);

    let _ = app.emit(
        "typst-download-progress",
        serde_json::json!({
            "percent": 100,
            "downloaded_mb": format!("{:.1}", total_mb),
            "total_mb": format!("{:.1}", total_mb),
        }),
    );

    Ok(result)
}

/// Find the bundled fonts directory (for --font-path)
fn find_font_dir(app: &tauri::AppHandle) -> Option<String> {
    // 1. Dev mode: public/fonts/ relative to CARGO_MANIFEST_DIR (src-tauri/)
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let dev_fonts = Path::new(&manifest_dir)
            .join("..")
            .join("public")
            .join("fonts");
        if dev_fonts.is_dir() {
            if let Ok(canonical) = dev_fonts.canonicalize() {
                return Some(canonical.to_string_lossy().to_string());
            }
        }
    }

    // 2. Production: resource dir (fonts placed by bundle.resources)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let fonts_dir = resource_dir.join("fonts");
        if fonts_dir.is_dir() {
            return Some(fonts_dir.to_string_lossy().to_string());
        }
        // Fallback: files directly in resource dir
        if resource_dir.join("Lora-VariableFont_wght.ttf").exists() {
            return Some(resource_dir.to_string_lossy().to_string());
        }
    }

    None
}

fn current_target_triple() -> String {
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else {
        "unknown"
    };
    let os = if cfg!(target_os = "macos") {
        "apple-darwin"
    } else if cfg!(target_os = "linux") {
        "unknown-linux-gnu"
    } else if cfg!(target_os = "windows") {
        "pc-windows-msvc"
    } else {
        "unknown"
    };
    format!("{arch}-{os}")
}

fn parse_typst_output(stderr: &str) -> (Vec<ExportError>, Vec<ExportError>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for line in stderr.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("error:") {
            let msg = trimmed.strip_prefix("error:").unwrap_or(trimmed).trim();
            let (line_num, message) = extract_line_info(msg);
            errors.push(ExportError {
                line: line_num,
                message: message.to_string(),
                severity: "error".to_string(),
            });
        } else if trimmed.starts_with("warning:") {
            let msg = trimmed.strip_prefix("warning:").unwrap_or(trimmed).trim();
            let (line_num, message) = extract_line_info(msg);
            warnings.push(ExportError {
                line: line_num,
                message: message.to_string(),
                severity: "warning".to_string(),
            });
        }
    }

    (errors, warnings)
}

fn build_typst_result(
    success: bool,
    stdout: String,
    stderr: String,
    pdf_path: &Path,
    duration_ms: u64,
) -> TypstCompileResult {
    let mut combined_log = String::new();
    if !stdout.trim().is_empty() {
        combined_log.push_str(stdout.trim_end());
    }
    if !stderr.trim().is_empty() {
        if !combined_log.is_empty() {
            combined_log.push('\n');
        }
        combined_log.push_str(stderr.trim_end());
    }
    let (errors, warnings) = parse_typst_output(&stderr);

    if success {
        TypstCompileResult {
            success: true,
            pdf_path: Some(pdf_path.to_string_lossy().to_string()),
            errors: vec![],
            warnings,
            log: combined_log,
            duration_ms,
        }
    } else {
        TypstCompileResult {
            success: false,
            pdf_path: None,
            errors: if errors.is_empty() {
                vec![ExportError {
                    line: None,
                    message: if combined_log.is_empty() {
                        "Typst compilation failed.".to_string()
                    } else {
                        combined_log.clone()
                    },
                    severity: "error".to_string(),
                }]
            } else {
                errors
            },
            warnings,
            log: combined_log,
            duration_ms,
        }
    }
}

async fn run_typst_compile(
    typst_bin: &str,
    source_path: &Path,
    pdf_path: &Path,
    app: &tauri::AppHandle,
) -> Result<TypstCompileResult, String> {
    let start = std::time::Instant::now();
    let typ_path = source_path.to_string_lossy().to_string();
    let file_label = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&typ_path)
        .to_string();
    let stdout_log = Arc::new(Mutex::new(String::new()));
    let stderr_log = Arc::new(Mutex::new(String::new()));

    let font_dir = find_font_dir(app);
    let mut command = background_tokio_command(typst_bin);
    command.arg("compile");
    if let Some(font_dir) = &font_dir {
        command.args(["--font-path", font_dir]);
    }
    command.arg(source_path);
    command.arg(pdf_path);
    command.current_dir(source_path.parent().unwrap_or(Path::new(".")));
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let command_preview = {
        let mut parts = vec![
            typst_bin.to_string(),
            "compile".to_string(),
        ];
        if let Some(font_dir) = &font_dir {
            parts.push("--font-path".to_string());
            parts.push(font_dir.clone());
        }
        parts.push(source_path.to_string_lossy().to_string());
        parts.push(pdf_path.to_string_lossy().to_string());
        parts.join(" ")
    };

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to run typst: {}", e))?;

    let intro = vec![
        format!("Starting Typst compile for {}", file_label),
        "Compiler backend: Typst CLI".to_string(),
        format!("Command: {}", command_preview),
    ]
    .join("\n");

    let _ = app.emit(
        TYPST_COMPILE_STREAM_EVENT,
        TypstCompileStreamPayload {
            typ_path: typ_path.clone(),
            line: intro,
            clear: true,
            header: true,
            open: false,
            status: Some("running".to_string()),
        },
    );

    let stdout_task = if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        let typ_path = typ_path.clone();
        let stdout_log = stdout_log.clone();
        Some(tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Ok(mut buffer) = stdout_log.lock() {
                    buffer.push_str(&line);
                    buffer.push('\n');
                }
                let _ = app.emit(
                    TYPST_COMPILE_STREAM_EVENT,
                    TypstCompileStreamPayload {
                        typ_path: typ_path.clone(),
                        line,
                        clear: false,
                        header: false,
                        open: false,
                        status: None,
                    },
                );
            }
        }))
    } else {
        None
    };

    let stderr_task = if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        let typ_path = typ_path.clone();
        let stderr_log = stderr_log.clone();
        Some(tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Ok(mut buffer) = stderr_log.lock() {
                    buffer.push_str(&line);
                    buffer.push('\n');
                }
                let _ = app.emit(
                    TYPST_COMPILE_STREAM_EVENT,
                    TypstCompileStreamPayload {
                        typ_path: typ_path.clone(),
                        line,
                        clear: false,
                        header: false,
                        open: false,
                        status: None,
                    },
                );
            }
        }))
    } else {
        None
    };

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for typst: {}", e))?;

    if let Some(task) = stdout_task {
        let _ = task.await;
    }
    if let Some(task) = stderr_task {
        let _ = task.await;
    }

    let stdout = stdout_log
        .lock()
        .map(|buffer| buffer.clone())
        .unwrap_or_default();
    let stderr = stderr_log
        .lock()
        .map(|buffer| buffer.clone())
        .unwrap_or_default();

    Ok(build_typst_result(
        status.success(),
        stdout,
        stderr,
        pdf_path,
        start.elapsed().as_millis() as u64,
    ))
}

fn extract_line_info(msg: &str) -> (Option<u32>, &str) {
    // Try to extract line number from patterns like "at line 42" or ":42:"
    if let Some(idx) = msg.find(":") {
        let after = &msg[idx + 1..];
        if let Some(end) = after.find(|c: char| !c.is_ascii_digit()) {
            if end > 0 {
                if let Ok(n) = after[..end].parse::<u32>() {
                    return (Some(n), msg);
                }
            }
        }
    }
    (None, msg)
}

#[tauri::command]
pub async fn check_typst_compiler(
    app: tauri::AppHandle,
    custom_typst_path: Option<String>,
) -> Result<TypstCompilerStatus, String> {
    let path = find_typst(&app, custom_typst_path.as_deref());
    Ok(TypstCompilerStatus {
        installed: path.is_some(),
        path,
    })
}

#[tauri::command]
pub async fn compile_typst_file(
    typ_path: String,
    app: tauri::AppHandle,
    custom_typst_path: Option<String>,
) -> Result<TypstCompileResult, String> {
    let typst_bin =
        find_typst(&app, custom_typst_path.as_deref()).ok_or_else(typst_not_found_message)?;
    let typ_pathbuf = PathBuf::from(&typ_path);
    if !typ_pathbuf.exists() {
        return Err(format!("Typst file not found: {}", typ_path));
    }
    let pdf_path = typ_pathbuf.with_extension("pdf");
    run_typst_compile(&typst_bin, &typ_pathbuf, &pdf_path, &app).await
}
