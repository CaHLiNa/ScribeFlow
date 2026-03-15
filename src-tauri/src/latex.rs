use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::app_dirs;
use crate::process_utils::{background_command, background_tokio_command};

const LATEX_COMPILE_STREAM_EVENT: &str = "latex-compile-stream";

pub struct LatexState {
    pub compiling: Mutex<HashMap<String, bool>>,
}

impl Default for LatexState {
    fn default() -> Self {
        Self {
            compiling: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatexError {
    pub line: Option<u32>,
    pub message: String,
    pub severity: String, // "error" or "warning"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileResult {
    pub success: bool,
    pub pdf_path: Option<String>,
    pub synctex_path: Option<String>,
    pub errors: Vec<LatexError>,
    pub warnings: Vec<LatexError>,
    pub log: String,
    pub duration_ms: u64,
    pub compiler_backend: Option<String>,
    pub command_preview: Option<String>,
    pub requested_program: Option<String>,
    pub requested_program_applied: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexCompileStreamPayload {
    tex_path: String,
    line: String,
    clear: bool,
    header: bool,
    open: bool,
}

#[derive(Debug, Clone)]
struct LatexCompileMeta {
    compiler_backend: String,
    command_preview: String,
    requested_program: Option<String>,
    requested_program_applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryStatus {
    pub installed: bool,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexCompilerStatus {
    pub tectonic: BinaryStatus,
    pub system_tex: BinaryStatus,
}

fn altals_bin_dir() -> Option<PathBuf> {
    app_dirs::bin_dir().ok()
}

fn tectonic_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "tectonic.exe"
    } else {
        "tectonic"
    }
}

fn find_tectonic(_app: &tauri::AppHandle, custom_path: Option<&str>) -> Option<String> {
    if let Some(path) = custom_path.filter(|value| !value.trim().is_empty()) {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // 1. App-managed install (~/.altals/bin/tectonic)
    for bin_dir in app_dirs::candidate_bin_dirs() {
        let path = bin_dir.join(tectonic_binary_name());
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    // 2. Common system install locations
    #[cfg(unix)]
    {
        let candidates = [
            "/opt/homebrew/bin/tectonic",
            "/usr/local/bin/tectonic",
            "/usr/bin/tectonic",
        ];
        for path in &candidates {
            if Path::new(path).exists() {
                return Some(path.to_string());
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            let cargo_path = format!("{home}/.cargo/bin/tectonic");
            if Path::new(&cargo_path).exists() {
                return Some(cargo_path);
            }
        }
    }

    // 3. Shell lookup fallback
    #[cfg(unix)]
    {
        let output = background_command("/bin/bash")
            .args(&["-lc", "which tectonic"])
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
        let output = background_command("where").arg("tectonic").output().ok()?;
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

fn find_system_tex(custom_path: Option<&str>) -> Option<String> {
    if let Some(path) = custom_path.filter(|value| !value.trim().is_empty()) {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    #[cfg(unix)]
    {
        let candidates = [
            "/Library/TeX/texbin/latexmk",
            "/opt/homebrew/bin/latexmk",
            "/usr/local/bin/latexmk",
            "/usr/bin/latexmk",
        ];
        for path in &candidates {
            if Path::new(path).exists() {
                return Some(path.to_string());
            }
        }

        let output = background_command("/bin/bash")
            .args(["-lc", "which latexmk"])
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
        let output = background_command("where").arg("latexmk").output().ok()?;
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

fn parse_latex_output(output: &str) -> (Vec<LatexError>, Vec<LatexError>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();

        // Tectonic error format: "error: ..." or specific TeX errors
        if trimmed.starts_with("error:") {
            let msg = trimmed.strip_prefix("error:").unwrap_or(trimmed).trim();
            let (line_num, message) = extract_line_number(msg);
            errors.push(LatexError {
                line: line_num,
                message: message.to_string(),
                severity: "error".to_string(),
            });
        } else if trimmed.starts_with("warning:") {
            let msg = trimmed.strip_prefix("warning:").unwrap_or(trimmed).trim();
            let (line_num, message) = extract_line_number(msg);
            warnings.push(LatexError {
                line: line_num,
                message: message.to_string(),
                severity: "warning".to_string(),
            });
        }
        // TeX error format: "! Undefined control sequence." or "! Missing $ inserted."
        else if trimmed.starts_with('!') {
            let msg = trimmed.strip_prefix('!').unwrap_or(trimmed).trim();
            errors.push(LatexError {
                line: None,
                message: msg.to_string(),
                severity: "error".to_string(),
            });
        }
        // Line number format: "l.42 ..."
        else if trimmed.starts_with("l.") {
            if let Some(num_str) = trimmed.strip_prefix("l.") {
                let parts: Vec<&str> = num_str.splitn(2, ' ').collect();
                if let Ok(line_num) = parts[0].parse::<u32>() {
                    // Attach line number to the last error without one
                    if let Some(last) = errors.last_mut() {
                        if last.line.is_none() {
                            last.line = Some(line_num);
                        }
                    }
                }
            }
        }
        // latexmk/file-line-error format: ./main.tex:42: Undefined control sequence.
        else if let Some((line_num, message)) = extract_file_line_error(trimmed) {
            errors.push(LatexError {
                line: Some(line_num),
                message: message.to_string(),
                severity: "error".to_string(),
            });
        } else if trimmed.contains("LaTeX Warning:")
            || (trimmed.starts_with("Package ") && trimmed.contains(" Warning:"))
            || (trimmed.starts_with("Class ") && trimmed.contains(" Warning:"))
            || trimmed.starts_with("Overfull ")
            || trimmed.starts_with("Underfull ")
            || trimmed.contains("undefined references")
            || trimmed.contains("Label(s) may have changed")
        {
            warnings.push(LatexError {
                line: None,
                message: trimmed.to_string(),
                severity: "warning".to_string(),
            });
        }
    }

    (errors, warnings)
}

fn extract_file_line_error(line: &str) -> Option<(u32, &str)> {
    let parts: Vec<&str> = line.splitn(3, ':').collect();
    if parts.len() < 3 {
        return None;
    }
    let line_num = parts[1].trim().parse::<u32>().ok()?;
    Some((line_num, parts[2].trim()))
}

fn extract_line_number(msg: &str) -> (Option<u32>, &str) {
    // Try to extract "on line 42" or "line 42" patterns
    if let Some(idx) = msg.find("line ") {
        let after = &msg[idx + 5..];
        let num_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = num_str.parse::<u32>() {
            return (Some(n), msg);
        }
    }
    (None, msg)
}

fn read_requested_program(tex_path: &str) -> Option<String> {
    let content = std::fs::read_to_string(tex_path).ok()?;
    for line in content.lines().take(20) {
        let trimmed = line.trim();
        if !trimmed.starts_with('%') {
            continue;
        }
        let lowered = trimmed.to_ascii_lowercase();
        if !lowered.contains("!tex program") {
            continue;
        }
        let value = trimmed.split('=').nth(1)?.trim().to_ascii_lowercase();
        if value.is_empty() {
            return None;
        }
        return Some(value);
    }
    None
}

fn build_compile_result_from_logs(
    tex: &Path,
    status_success: bool,
    stdout: String,
    stderr: String,
    start: std::time::Instant,
    meta: LatexCompileMeta,
) -> CompileResult {
    let dir = tex.parent().unwrap_or_else(|| Path::new("."));
    let full_log = format!("{}\n{}", stdout, stderr);
    let (mut errors, warnings) = parse_latex_output(&full_log);

    let stem = tex.file_stem().unwrap_or_default().to_string_lossy();
    let pdf_path = dir.join(format!("{}.pdf", stem));
    let synctex_path = dir.join(format!("{}.synctex.gz", stem));
    let success = status_success && pdf_path.exists();

    if !success && errors.is_empty() {
        let message = full_log
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("Compilation failed.")
            .trim()
            .to_string();
        errors.push(LatexError {
            line: None,
            message,
            severity: "error".to_string(),
        });
    }

    CompileResult {
        success,
        pdf_path: if pdf_path.exists() {
            Some(pdf_path.to_string_lossy().to_string())
        } else {
            None
        },
        synctex_path: if synctex_path.exists() {
            Some(synctex_path.to_string_lossy().to_string())
        } else {
            None
        },
        errors,
        warnings,
        log: full_log,
        duration_ms: start.elapsed().as_millis() as u64,
        compiler_backend: Some(meta.compiler_backend),
        command_preview: Some(meta.command_preview),
        requested_program: meta.requested_program,
        requested_program_applied: meta.requested_program_applied,
    }
}

async fn compile_with_tectonic(
    app: &tauri::AppHandle,
    tectonic_path: &str,
    tex_path: &str,
    start: std::time::Instant,
    requested_program: Option<String>,
) -> Result<CompileResult, String> {
    let tex = Path::new(tex_path);
    let dir = tex.parent().ok_or("Invalid tex path")?;
    eprintln!("[latex] Using tectonic at: {}", tectonic_path);
    eprintln!("[latex] Compiling: {} in dir: {}", tex_path, dir.display());

    let mut command = background_tokio_command(tectonic_path);
    command.args(["-X", "compile", "--synctex", "--keep-logs", tex_path]);
    command.current_dir(dir);

    let meta = LatexCompileMeta {
        compiler_backend: "tectonic".to_string(),
        command_preview: format!(
            "{} -X compile --synctex --keep-logs {}",
            tectonic_path, tex_path
        ),
        requested_program,
        requested_program_applied: false,
    };

    run_latex_command_with_streaming(app, command, tex_path, start, meta).await
}

async fn run_latex_command_with_streaming(
    app: &tauri::AppHandle,
    mut command: tokio::process::Command,
    tex_path: &str,
    start: std::time::Instant,
    meta: LatexCompileMeta,
) -> Result<CompileResult, String> {
    let tex = Path::new(tex_path);
    let stdout_log = Arc::new(Mutex::new(String::new()));
    let stderr_log = Arc::new(Mutex::new(String::new()));

    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to start LaTeX compiler: {}", e))?;

    let mut intro = vec![
        format!("Compiler backend: {}", meta.compiler_backend),
        format!("Command: {}", meta.command_preview),
    ];
    if let Some(program) = &meta.requested_program {
        intro.push(format!(
            "Magic comment: % !TEX program = {} ({})",
            program,
            if meta.requested_program_applied {
                "applied"
            } else {
                "detected but not applied"
            }
        ));
    }
    let _ = app.emit(
        LATEX_COMPILE_STREAM_EVENT,
        LatexCompileStreamPayload {
            tex_path: tex_path.to_string(),
            line: intro.join("\n"),
            clear: false,
            header: true,
            open: false,
        },
    );

    let stdout_task = if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        let tex_path = tex_path.to_string();
        let stdout_log = stdout_log.clone();
        Some(tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Ok(mut buffer) = stdout_log.lock() {
                    buffer.push_str(&line);
                    buffer.push('\n');
                }
                let _ = app.emit(
                    LATEX_COMPILE_STREAM_EVENT,
                    LatexCompileStreamPayload {
                        tex_path: tex_path.clone(),
                        line,
                        clear: false,
                        header: false,
                        open: false,
                    },
                );
            }
        }))
    } else {
        None
    };

    let stderr_task = if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        let tex_path = tex_path.to_string();
        let stderr_log = stderr_log.clone();
        Some(tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Ok(mut buffer) = stderr_log.lock() {
                    buffer.push_str(&line);
                    buffer.push('\n');
                }
                let _ = app.emit(
                    LATEX_COMPILE_STREAM_EVENT,
                    LatexCompileStreamPayload {
                        tex_path: tex_path.clone(),
                        line,
                        clear: false,
                        header: false,
                        open: false,
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
        .map_err(|e| format!("Failed waiting for LaTeX compiler: {}", e))?;

    if let Some(task) = stdout_task {
        let _ = task.await;
    }
    if let Some(task) = stderr_task {
        let _ = task.await;
    }

    let stdout = stdout_log.lock().map(|s| s.clone()).unwrap_or_default();
    let stderr = stderr_log.lock().map(|s| s.clone()).unwrap_or_default();
    Ok(build_compile_result_from_logs(
        tex,
        status.success(),
        stdout,
        stderr,
        start,
        meta,
    ))
}

async fn compile_with_system_tex(
    app: &tauri::AppHandle,
    system_tex_path: &str,
    tex_path: &str,
    start: std::time::Instant,
    requested_program: Option<String>,
    engine_preference: Option<String>,
) -> Result<CompileResult, String> {
    let tex = Path::new(tex_path);
    let dir = tex.parent().ok_or("Invalid tex path")?;
    eprintln!("[latex] Using system TeX at: {}", system_tex_path);
    eprintln!("[latex] Compiling: {} in dir: {}", tex_path, dir.display());

    let preferred_engine = requested_program
        .clone()
        .or_else(|| engine_preference.filter(|value| !value.trim().is_empty() && value != "auto"));

    let (engine_flag, requested_program_applied, compiler_backend) =
        match preferred_engine.as_deref() {
            Some("xelatex") => ("-xelatex", true, "system-latexmk-xelatex"),
            Some("lualatex") => ("-lualatex", true, "system-latexmk-lualatex"),
            Some("pdflatex") => ("-pdf", true, "system-latexmk-pdflatex"),
            _ => ("-pdf", false, "system-latexmk"),
        };

    let mut command = background_tokio_command(system_tex_path);
    command.args([
            engine_flag,
            "-interaction=nonstopmode",
            "-synctex=1",
            "-file-line-error",
            "-halt-on-error",
            tex_path,
        ]);
    command.current_dir(dir);

    let meta = LatexCompileMeta {
        compiler_backend: compiler_backend.to_string(),
        command_preview: format!(
            "{} {} -interaction=nonstopmode -synctex=1 -file-line-error -halt-on-error {}",
            system_tex_path, engine_flag, tex_path
        ),
        requested_program,
        requested_program_applied,
    };

    run_latex_command_with_streaming(app, command, tex_path, start, meta).await
}

#[tauri::command]
pub async fn compile_latex(
    app: tauri::AppHandle,
    state: tauri::State<'_, LatexState>,
    tex_path: String,
    compiler_preference: Option<String>,
    engine_preference: Option<String>,
    custom_system_tex_path: Option<String>,
    custom_tectonic_path: Option<String>,
) -> Result<CompileResult, String> {
    // Check if already compiling this file
    {
        let mut compiling = state.compiling.lock().unwrap();
        if *compiling.get(&tex_path).unwrap_or(&false) {
            return Err("Compilation already in progress for this file.".to_string());
        }
        compiling.insert(tex_path.clone(), true);
    }

    let start = std::time::Instant::now();
    let requested_program = read_requested_program(&tex_path);
    let engine_preference = engine_preference.unwrap_or_else(|| "auto".to_string());

    let preference = compiler_preference.unwrap_or_else(|| "auto".to_string());
    let system_tex = find_system_tex(custom_system_tex_path.as_deref());
    let tectonic = find_tectonic(&app, custom_tectonic_path.as_deref());

    let result = match preference.as_str() {
        "system" | "system-tex" => {
            let system_tex = system_tex.ok_or_else(|| {
                "System TeX compiler not found. Install MacTeX or TeX Live and try again."
                    .to_string()
            })?;
            compile_with_system_tex(&app, &system_tex, &tex_path, start, requested_program.clone(), Some(engine_preference.clone())).await
        }
        "tectonic" => {
            let tectonic = tectonic.ok_or_else(|| {
                "Tectonic not found. Install it or choose System TeX in Settings.".to_string()
            })?;
            compile_with_tectonic(&app, &tectonic, &tex_path, start, requested_program.clone()).await
        }
        _ => {
            if let Some(system_tex) = system_tex {
                compile_with_system_tex(&app, &system_tex, &tex_path, start, requested_program.clone(), Some(engine_preference.clone())).await
            } else if let Some(tectonic) = tectonic {
                compile_with_tectonic(&app, &tectonic, &tex_path, start, requested_program.clone()).await
            } else {
                Err("No LaTeX compiler found. Install MacTeX/TeX Live, or install Tectonic in Settings.".to_string())
            }
        }
    };

    // Clear compiling flag
    {
        let mut compiling = state.compiling.lock().unwrap();
        compiling.remove(&tex_path);
    }

    result
}

#[tauri::command]
pub async fn check_latex_compilers(
    app: tauri::AppHandle,
    custom_system_tex_path: Option<String>,
    custom_tectonic_path: Option<String>,
) -> Result<LatexCompilerStatus, String> {
    Ok(LatexCompilerStatus {
        tectonic: BinaryStatus {
            installed: find_tectonic(&app, custom_tectonic_path.as_deref()).is_some(),
            path: find_tectonic(&app, custom_tectonic_path.as_deref()),
        },
        system_tex: BinaryStatus {
            installed: find_system_tex(custom_system_tex_path.as_deref()).is_some(),
            path: find_system_tex(custom_system_tex_path.as_deref()),
        },
    })
}

const TECTONIC_VERSION: &str = "0.15.0";

fn tectonic_download_url() -> Result<(String, bool), String> {
    let base = format!(
        "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40{}/tectonic-{}",
        TECTONIC_VERSION, TECTONIC_VERSION
    );

    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64"
    } else {
        return Err("Unsupported architecture".to_string());
    };

    if cfg!(target_os = "macos") {
        Ok((format!("{}-{}-apple-darwin.tar.gz", base, arch), false))
    } else if cfg!(target_os = "linux") {
        // Use musl build for static linking (no glibc dependency)
        Ok((
            format!("{}-{}-unknown-linux-musl.tar.gz", base, arch),
            false,
        ))
    } else if cfg!(target_os = "windows") {
        Ok((format!("{}-{}-pc-windows-msvc.zip", base, arch), true))
    } else {
        Err("Unsupported platform".to_string())
    }
}

#[tauri::command]
pub async fn download_tectonic(app: tauri::AppHandle) -> Result<String, String> {
    let bin_dir = altals_bin_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    std::fs::create_dir_all(&bin_dir).map_err(|e| format!("Cannot create directory: {}", e))?;

    let (url, is_zip) = tectonic_download_url()?;
    eprintln!("[tectonic] Downloading from: {}", url);

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

    // Stream download to temp file
    let archive_ext = if is_zip { "zip" } else { "tar.gz" };
    let archive_path = bin_dir.join(format!("tectonic-download.{}", archive_ext));
    let mut file = std::fs::File::create(&archive_path)
        .map_err(|e| format!("Cannot create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut last_pct: u32 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;

        let pct = if total_bytes > 0 {
            ((downloaded as f64 / total_bytes as f64) * 100.0) as u32
        } else {
            0
        };

        // Emit progress every 1%
        if pct != last_pct {
            last_pct = pct;
            let _ = app.emit(
                "tectonic-download-progress",
                serde_json::json!({
                    "percent": pct,
                    "downloaded_mb": format!("{:.1}", downloaded as f64 / 1_048_576.0),
                    "total_mb": format!("{:.1}", total_mb),
                }),
            );
        }
    }

    drop(file);
    eprintln!("[tectonic] Download complete: {} bytes", downloaded);

    // Extract binary
    let binary_name = tectonic_binary_name();
    let dest_path = bin_dir.join(binary_name);

    if is_zip {
        // Windows: use PowerShell to extract
        #[cfg(windows)]
        {
            let status = background_command("powershell")
                .args(&[
                    "-NoProfile",
                    "-Command",
                    &format!(
                        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                        archive_path.display(),
                        bin_dir.display(),
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
        // Unix: use tar to extract
        let status = background_command("tar")
            .args(&[
                "xzf",
                &archive_path.to_string_lossy(),
                "-C",
                &bin_dir.to_string_lossy(),
            ])
            .status()
            .map_err(|e| format!("Extract failed: {}", e))?;
        if !status.success() {
            return Err("Failed to extract tar.gz archive".to_string());
        }
    }

    // Clean up archive
    let _ = std::fs::remove_file(&archive_path);

    // Verify binary exists
    if !dest_path.exists() {
        return Err(format!(
            "Binary not found after extraction at {}",
            dest_path.display()
        ));
    }

    // Set executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    let result = dest_path.to_string_lossy().to_string();
    eprintln!("[tectonic] Installed to: {}", result);

    // Emit 100% done
    let _ = app.emit(
        "tectonic-download-progress",
        serde_json::json!({ "percent": 100, "downloaded_mb": format!("{:.1}", total_mb), "total_mb": format!("{:.1}", total_mb) }),
    );

    Ok(result)
}

#[tauri::command]
pub async fn synctex_forward(
    synctex_path: String,
    tex_path: String,
    line: u32,
) -> Result<serde_json::Value, String> {
    let synctex = Path::new(&synctex_path);
    if !synctex.exists() {
        return Err("SyncTeX file not found. Recompile with SyncTeX enabled.".to_string());
    }

    let data = parse_synctex_gz(&synctex_path)?;
    forward_sync(&data, &tex_path, line)
}

#[tauri::command]
pub async fn synctex_backward(
    synctex_path: String,
    page: u32,
    x: f64,
    y: f64,
) -> Result<serde_json::Value, String> {
    let synctex = Path::new(&synctex_path);
    if !synctex.exists() {
        return Err("SyncTeX file not found. Recompile with SyncTeX enabled.".to_string());
    }

    let data = parse_synctex_gz(&synctex_path)?;
    backward_sync(&data, page, x, y)
}

// --- SyncTeX parser ---

#[derive(Debug)]
#[allow(dead_code)]
struct SyncNode {
    file: String,
    line: u32,
    page: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn parse_synctex_gz(path: &str) -> Result<Vec<SyncNode>, String> {
    use std::io::Read;

    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open synctex: {}", e))?;
    let mut decoder = flate2::read::GzDecoder::new(file);
    let mut content = String::new();
    decoder
        .read_to_string(&mut content)
        .map_err(|e| format!("Cannot decompress synctex: {}", e))?;

    let mut nodes = Vec::new();
    let mut inputs: HashMap<u32, String> = HashMap::new();
    let mut current_page: u32 = 0;

    for line in content.lines() {
        if line.starts_with("Input:") {
            // Input:1:/path/to/file.tex
            let rest = &line[6..];
            if let Some(colon) = rest.find(':') {
                if let Ok(id) = rest[..colon].parse::<u32>() {
                    inputs.insert(id, rest[colon + 1..].to_string());
                }
            }
        } else if line.starts_with('{') {
            // {page_num
            if let Ok(p) = line[1..].trim().parse::<u32>() {
                current_page = p;
            }
        } else if line.starts_with('h') || line.starts_with('v') || line.starts_with('x') {
            // h/v/x records: type input_id:line:col:x:y:W:H:D
            let parts: Vec<&str> = line[1..].split(':').collect();
            if parts.len() >= 7 {
                let input_id = parts[0].parse::<u32>().unwrap_or(0);
                let ln = parts[1].parse::<u32>().unwrap_or(0);
                let x = parts[3].parse::<f64>().unwrap_or(0.0);
                let y = parts[4].parse::<f64>().unwrap_or(0.0);
                let w = parts[5].parse::<f64>().unwrap_or(0.0);
                let h = parts[6].parse::<f64>().unwrap_or(0.0);

                if let Some(file) = inputs.get(&input_id) {
                    nodes.push(SyncNode {
                        file: file.clone(),
                        line: ln,
                        page: current_page,
                        x,
                        y,
                        width: w,
                        height: h,
                    });
                }
            }
        }
    }

    Ok(nodes)
}

fn forward_sync(
    nodes: &[SyncNode],
    tex_path: &str,
    line: u32,
) -> Result<serde_json::Value, String> {
    // Find the node closest to the given line in the given file
    let tex_canonical =
        std::fs::canonicalize(tex_path).unwrap_or_else(|_| Path::new(tex_path).to_path_buf());

    let mut best: Option<&SyncNode> = None;
    let mut best_dist: u32 = u32::MAX;

    for node in nodes {
        let node_path = std::fs::canonicalize(&node.file)
            .unwrap_or_else(|_| Path::new(&node.file).to_path_buf());

        if node_path == tex_canonical {
            let dist = if node.line >= line {
                node.line - line
            } else {
                line - node.line
            };
            if dist < best_dist {
                best_dist = dist;
                best = Some(node);
            }
        }
    }

    match best {
        Some(node) => Ok(serde_json::json!({
            "page": node.page,
            "x": node.x,
            "y": node.y,
        })),
        None => Err("No SyncTeX match found for this line.".to_string()),
    }
}

fn backward_sync(
    nodes: &[SyncNode],
    page: u32,
    x: f64,
    y: f64,
) -> Result<serde_json::Value, String> {
    // Find the node on the given page closest to (x, y)
    let mut best: Option<&SyncNode> = None;
    let mut best_dist: f64 = f64::MAX;

    for node in nodes {
        if node.page == page {
            let dx = node.x - x;
            let dy = node.y - y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist < best_dist {
                best_dist = dist;
                best = Some(node);
            }
        }
    }

    match best {
        Some(node) => Ok(serde_json::json!({
            "file": node.file,
            "line": node.line,
        })),
        None => Err("No SyncTeX match found at this position.".to_string()),
    }
}
