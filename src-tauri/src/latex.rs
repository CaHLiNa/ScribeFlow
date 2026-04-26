use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use tauri::Emitter;

use crate::latex_compile::{
    apply_tex_locale_std, apply_tex_locale_tokio, apply_user_perl_local_lib_env_tokio,
    compile_latex_with_preference, latexindent_is_healthy, latexindent_null_path,
    read_or_use_source_content, run_command_with_stdin,
};
use crate::latex_diagnostics::{
    adjust_chktex_columns_for_source, default_chktex_args, discover_chktexrc, parse_chktex_output,
    read_chktex_tab_size,
};
use crate::latex_tools::{
    binary_status, find_chktex, find_latexindent, find_synctex, scribeflow_bin_dir,
    tectonic_binary_name, LatexCompilerStatus, LatexToolStatus,
};
use crate::process_utils::background_command;

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
    pub file: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub message: String,
    pub severity: String,
    pub raw: Option<String>,
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

#[tauri::command]
pub async fn compile_latex(
    app: tauri::AppHandle,
    state: tauri::State<'_, LatexState>,
    tex_path: String,
    compiler_preference: Option<String>,
    engine_preference: Option<String>,
    build_recipe: Option<String>,
    build_extra_args: Option<String>,
    custom_system_tex_path: Option<String>,
    custom_tectonic_path: Option<String>,
) -> Result<CompileResult, String> {
    {
        let mut compiling = state.compiling.lock().unwrap();
        if *compiling.get(&tex_path).unwrap_or(&false) {
            return Err("Compilation already in progress for this file.".to_string());
        }
        compiling.insert(tex_path.clone(), true);
    }

    let result = compile_latex_with_preference(
        &app,
        &tex_path,
        compiler_preference,
        engine_preference,
        build_recipe,
        build_extra_args,
        custom_system_tex_path,
        custom_tectonic_path,
    )
    .await;

    {
        let mut compiling = state.compiling.lock().unwrap();
        compiling.remove(&tex_path);
    }

    result
}

#[tauri::command]
pub async fn check_latex_compilers(
    _app: tauri::AppHandle,
    custom_system_tex_path: Option<String>,
    custom_tectonic_path: Option<String>,
) -> Result<LatexCompilerStatus, String> {
    Ok(LatexCompilerStatus {
        tectonic: binary_status(crate::latex_tools::find_tectonic(
            custom_tectonic_path.as_deref(),
        )),
        system_tex: binary_status(crate::latex_tools::find_system_tex(
            custom_system_tex_path.as_deref(),
        )),
    })
}

#[tauri::command]
pub async fn check_latex_tools(
    custom_system_tex_path: Option<String>,
) -> Result<LatexToolStatus, String> {
    let chktex = find_chktex(custom_system_tex_path.as_deref());
    eprintln!("[latex] check_latex_tools chktex={:?}", chktex);
    let latexindent = match find_latexindent(custom_system_tex_path.as_deref()) {
        Some(path) if latexindent_is_healthy(&path).await => Some(path),
        _ => None,
    };
    eprintln!("[latex] check_latex_tools latexindent={:?}", latexindent);

    Ok(LatexToolStatus {
        chktex: binary_status(chktex),
        latexindent: binary_status(latexindent),
    })
}

#[tauri::command]
pub async fn run_chktex(
    tex_path: String,
    content: Option<String>,
    custom_system_tex_path: Option<String>,
    workspace_path: Option<String>,
) -> Result<Vec<LatexError>, String> {
    let chktex = match find_chktex(custom_system_tex_path.as_deref()) {
        Some(path) => path,
        None => return Ok(Vec::new()),
    };

    let tex = Path::new(&tex_path);
    let dir = tex.parent().ok_or("Invalid tex path")?;
    let tex_arg = tex
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| tex_path.clone());
    let source_content = read_or_use_source_content(&tex_path, content).await?;

    let chktexrc = discover_chktexrc(&tex_path, workspace_path.as_deref());

    let mut command = crate::process_utils::background_tokio_command(&chktex);
    command.current_dir(dir);
    apply_tex_locale_tokio(&mut command);
    command.args(default_chktex_args());
    if let Some(rc_path) = chktexrc.as_ref() {
        command.arg("-l");
        command.arg(rc_path.as_os_str());
    }
    command.args([
        "-I0",
        "-p",
        &tex_arg,
        "-f%f\x1f%l\x1f%c\x1f%k\x1f%n\x1f%m\n",
    ]);

    let (status, stdout, stderr) = run_command_with_stdin(command, source_content.clone()).await?;
    let mut diagnostics = parse_chktex_output(&stdout);
    let tab_size = read_chktex_tab_size(chktexrc.as_deref()).unwrap_or(8);
    adjust_chktex_columns_for_source(&mut diagnostics, &tex_path, &source_content, tab_size);

    if !diagnostics.is_empty() || status.success() {
        return Ok(diagnostics);
    }

    let message = stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .or_else(|| stdout.lines().rev().find(|line| !line.trim().is_empty()))
        .unwrap_or("ChkTeX failed without diagnostics.")
        .trim()
        .to_string();
    Err(message)
}

#[tauri::command]
pub async fn format_latex_document(
    tex_path: String,
    content: String,
    custom_system_tex_path: Option<String>,
) -> Result<String, String> {
    let latexindent = find_latexindent(custom_system_tex_path.as_deref()).ok_or_else(|| {
        "latexindent not found. Install it with your TeX distribution.".to_string()
    })?;

    let tex = Path::new(&tex_path);
    let dir = tex.parent().ok_or("Invalid tex path")?;

    let mut command = crate::process_utils::background_tokio_command(&latexindent);
    command.current_dir(dir);
    apply_tex_locale_tokio(&mut command);
    apply_user_perl_local_lib_env_tokio(&mut command);
    command.arg(format!("-g={}", latexindent_null_path()));
    command.arg("-");

    let (status, stdout, stderr) = run_command_with_stdin(command, content).await?;
    if status.success() {
        return Ok(stdout);
    }

    let message = stderr
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .or_else(|| stdout.lines().rev().find(|line| !line.trim().is_empty()))
        .unwrap_or("latexindent failed.")
        .trim()
        .to_string();
    Err(message)
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
    let bin_dir =
        scribeflow_bin_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    std::fs::create_dir_all(&bin_dir).map_err(|e| format!("Cannot create directory: {}", e))?;

    let (url, is_zip) = tectonic_download_url()?;
    eprintln!("[tectonic] Downloading from: {}", url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(&url)
        .header("User-Agent", "ScribeFlow/1.0")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let total_mb = total_bytes as f64 / 1_048_576.0;

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

    let binary_name = tectonic_binary_name();
    let dest_path = bin_dir.join(binary_name);

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

    let _ = std::fs::remove_file(&archive_path);

    if !dest_path.exists() {
        return Err(format!(
            "Binary not found after extraction at {}",
            dest_path.display()
        ));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dest_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    let result = dest_path.to_string_lossy().to_string();
    eprintln!("[tectonic] Installed to: {}", result);

    let _ = app.emit(
        "tectonic-download-progress",
        serde_json::json!({ "percent": 100, "downloaded_mb": format!("{:.1}", total_mb), "total_mb": format!("{:.1}", total_mb) }),
    );

    Ok(result)
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

    if let Some(pdf_path) = derive_pdf_path_from_synctex_path(&synctex_path) {
        if let Some(binary) = find_synctex(None) {
            if let Ok(result) = run_synctex_edit_cli(&binary, &pdf_path, page, x, y) {
                return Ok(result);
            }
        }
    }

    let data = parse_synctex_gz(&synctex_path)?;
    backward_sync(&data, page, x, y)
}

#[tauri::command]
pub async fn synctex_forward(
    synctex_path: String,
    file_path: String,
    line: u32,
    column: u32,
) -> Result<serde_json::Value, String> {
    let synctex = Path::new(&synctex_path);
    if !synctex.exists() {
        return Err("SyncTeX file not found. Recompile with SyncTeX enabled.".to_string());
    }

    let normalized_file_path = file_path.trim();
    if normalized_file_path.is_empty() {
        return Err("Source file path is required for forward SyncTeX.".to_string());
    }

    let pdf_path = derive_pdf_path_from_synctex_path(&synctex_path)
        .ok_or_else(|| "Could not derive PDF path from SyncTeX file.".to_string())?;

    let binary = find_synctex(None).ok_or_else(|| {
        "SyncTeX binary is unavailable. Forward SyncTeX will fall back to the frontend parser."
            .to_string()
    })?;

    run_synctex_view_cli(
        &binary,
        normalized_file_path,
        &pdf_path,
        line.max(1),
        column.max(1),
    )
}

#[tauri::command]
pub async fn read_latex_synctex(path: String) -> Result<String, String> {
    let normalized = Path::new(&path);
    if !normalized.exists() {
        return Err("SyncTeX file not found.".to_string());
    }

    if path.ends_with(".gz") {
        use std::io::Read;

        let file =
            std::fs::File::open(normalized).map_err(|e| format!("Cannot open synctex: {}", e))?;
        let mut decoder = flate2::read::GzDecoder::new(file);
        let mut content = String::new();
        decoder
            .read_to_string(&mut content)
            .map_err(|e| format!("Cannot decompress synctex: {}", e))?;
        return Ok(content);
    }

    std::fs::read_to_string(normalized).map_err(|e| format!("Cannot read synctex: {}", e))
}

const SYNCTEX_SCALED_POINT_TO_BIG_POINT: f64 = 72.0 / 72.27 / 65536.0;

#[derive(Debug)]
#[allow(dead_code)]
struct SyncNode {
    kind: char,
    file: String,
    line: u32,
    page: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn synctex_scaled_to_big_point(value: f64) -> f64 {
    value * SYNCTEX_SCALED_POINT_TO_BIG_POINT
}

fn derive_pdf_path_from_synctex_path(synctex_path: &str) -> Option<String> {
    if let Some(path) = synctex_path.strip_suffix(".synctex.gz") {
        return Some(format!("{path}.pdf"));
    }
    if let Some(path) = synctex_path.strip_suffix(".synctex") {
        return Some(format!("{path}.pdf"));
    }
    None
}

fn parse_synctex_edit_output(output: &str) -> Result<serde_json::Value, String> {
    let mut input = None;
    let mut line = None;

    for raw_line in output.lines() {
        let trimmed = raw_line.trim();
        if let Some(value) = trimmed.strip_prefix("Input:") {
            input = Some(value.trim().to_string());
        } else if let Some(value) = trimmed.strip_prefix("Line:") {
            line = value.trim().parse::<u32>().ok();
        }

        if let (Some(file), Some(line)) = (&input, line) {
            return Ok(serde_json::json!({
                "file": file,
                "line": line,
            }));
        }
    }

    Err("SyncTeX edit output did not contain a complete result.".to_string())
}

fn push_synctex_view_record(
    records: &mut Vec<serde_json::Map<String, serde_json::Value>>,
    current: &mut serde_json::Map<String, serde_json::Value>,
) {
    let has_page = current
        .get("page")
        .and_then(|value| value.as_u64())
        .map(|page| page > 0)
        .unwrap_or(false);
    let has_point = current.get("x").and_then(|value| value.as_f64()).is_some()
        && current.get("y").and_then(|value| value.as_f64()).is_some();
    let has_rect = current.get("h").and_then(|value| value.as_f64()).is_some()
        && current.get("v").and_then(|value| value.as_f64()).is_some()
        && current.get("W").and_then(|value| value.as_f64()).is_some()
        && current.get("H").and_then(|value| value.as_f64()).is_some();

    if has_page && (has_point || has_rect) {
        let mut record = current.clone();
        record.insert("indicator".to_string(), serde_json::Value::Bool(true));
        records.push(record);
    }

    current.clear();
}

fn parse_synctex_view_output(output: &str) -> Result<serde_json::Value, String> {
    let mut records = Vec::new();
    let mut current = serde_json::Map::new();
    let mut started = false;
    let mut saw_output_marker = false;

    for raw_line in output.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.contains("SyncTeX result begin") {
            started = true;
            continue;
        }
        if trimmed.contains("SyncTeX result end") {
            break;
        }
        if !started {
            continue;
        }

        let Some((raw_key, raw_value)) = trimmed.split_once(':') else {
            continue;
        };
        let key = raw_key.trim();
        let value = raw_value.trim();

        if key.eq_ignore_ascii_case("Output") {
            push_synctex_view_record(&mut records, &mut current);
            saw_output_marker = true;
            continue;
        }

        if key.eq_ignore_ascii_case("Page") {
            if let Ok(page) = value.parse::<u32>() {
                current.insert(
                    "page".to_string(),
                    serde_json::Value::Number(serde_json::Number::from(page)),
                );
            }
            continue;
        }

        if matches!(key, "x" | "y" | "h" | "v" | "W" | "H") {
            if let Some(number) = serde_json::Number::from_f64(value.parse::<f64>().unwrap_or(f64::NAN)) {
                current.insert(key.to_string(), serde_json::Value::Number(number));
            }
        }
    }

    push_synctex_view_record(&mut records, &mut current);

    if records.is_empty() {
        return Err("SyncTeX view output did not contain a usable PDF location.".to_string());
    }

    if !saw_output_marker && records.len() == 1 {
        return Ok(serde_json::Value::Object(records.remove(0)));
    }

    Ok(serde_json::Value::Array(
        records
            .into_iter()
            .map(serde_json::Value::Object)
            .collect(),
    ))
}

fn run_synctex_edit_cli(
    synctex_binary: &str,
    pdf_path: &str,
    page: u32,
    x: f64,
    y: f64,
) -> Result<serde_json::Value, String> {
    let location = format!("{}:{:.6}:{:.6}:{}", page.max(1), x, y, pdf_path);
    let mut command = background_command(synctex_binary);
    apply_tex_locale_std(&mut command);
    let output = command
        .args(["edit", "-o", &location])
        .output()
        .map_err(|e| format!("Failed to run synctex edit: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    parse_synctex_edit_output(&String::from_utf8_lossy(&output.stdout))
}

fn run_synctex_view_cli(
    synctex_binary: &str,
    file_path: &str,
    pdf_path: &str,
    line: u32,
    column: u32,
) -> Result<serde_json::Value, String> {
    let source_location = format!("{}:{}:{}", line.max(1), column.max(1), file_path);
    let mut command = background_command(synctex_binary);
    apply_tex_locale_std(&mut command);
    let output = command
        .args(["view", "-i", &source_location, "-o", pdf_path])
        .output()
        .map_err(|e| format!("Failed to run synctex view: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    parse_synctex_view_output(&String::from_utf8_lossy(&output.stdout))
}

fn parse_synctex_content(content: &str) -> Vec<SyncNode> {
    let mut nodes = Vec::new();
    let mut inputs: HashMap<u32, String> = HashMap::new();
    let mut current_page: u32 = 0;
    let mut x_offset: f64 = 0.0;
    let mut y_offset: f64 = 0.0;

    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("Input:") {
            if let Some(colon) = rest.find(':') {
                if let Ok(id) = rest[..colon].parse::<u32>() {
                    inputs.insert(id, rest[colon + 1..].to_string());
                }
            }
            continue;
        }

        if let Some(value) = line.strip_prefix("X Offset:") {
            x_offset = value.trim().parse::<f64>().unwrap_or(0.0);
            continue;
        }

        if let Some(value) = line.strip_prefix("Y Offset:") {
            y_offset = value.trim().parse::<f64>().unwrap_or(0.0);
            continue;
        }

        if let Some(page_marker) = line.strip_prefix('{') {
            if let Ok(page) = page_marker.trim().parse::<u32>() {
                current_page = page;
            }
            continue;
        }

        let kind = match line.chars().next() {
            Some('h' | 'v' | 'x') if line.len() > 1 => line.chars().next().unwrap(),
            _ => continue,
        };

        let Some((head, tail)) = line[1..].split_once(':') else {
            continue;
        };
        let Some((input_id_raw, line_raw)) = head.split_once(',') else {
            continue;
        };
        let Ok(input_id) = input_id_raw.parse::<u32>() else {
            continue;
        };
        let Ok(source_line) = line_raw.parse::<u32>() else {
            continue;
        };
        let Some(file) = inputs.get(&input_id) else {
            continue;
        };

        let (x, y, width, height) = if kind == 'x' {
            let Some((x_raw, y_raw)) = tail.split_once(',') else {
                continue;
            };
            let Ok(x_value) = x_raw.parse::<f64>() else {
                continue;
            };
            let Ok(y_value) = y_raw.parse::<f64>() else {
                continue;
            };
            (
                synctex_scaled_to_big_point(x_offset + x_value),
                synctex_scaled_to_big_point(y_offset + y_value),
                0.0,
                0.0,
            )
        } else {
            let Some((position_part, size_part)) = tail.split_once(':') else {
                continue;
            };
            let mut position_values = position_part.split(',');
            let Some(x_raw) = position_values.next() else {
                continue;
            };
            let Some(y_raw) = position_values.next() else {
                continue;
            };
            let Ok(x_value) = x_raw.parse::<f64>() else {
                continue;
            };
            let Ok(y_value) = y_raw.parse::<f64>() else {
                continue;
            };

            let mut size_values = size_part.split(',');
            let width_value = size_values
                .next()
                .and_then(|value| value.parse::<f64>().ok())
                .unwrap_or(0.0);
            let height_value = size_values
                .next()
                .and_then(|value| value.parse::<f64>().ok())
                .unwrap_or(0.0);

            (
                synctex_scaled_to_big_point(x_offset + x_value),
                synctex_scaled_to_big_point(y_offset + y_value),
                synctex_scaled_to_big_point(width_value),
                synctex_scaled_to_big_point(height_value),
            )
        };

        nodes.push(SyncNode {
            kind,
            file: file.clone(),
            line: source_line,
            page: current_page,
            x,
            y,
            width,
            height,
        });
    }

    nodes
}

fn parse_synctex_gz(path: &str) -> Result<Vec<SyncNode>, String> {
    use std::io::Read;

    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open synctex: {}", e))?;
    let mut decoder = flate2::read::GzDecoder::new(file);
    let mut content = String::new();
    decoder
        .read_to_string(&mut content)
        .map_err(|e| format!("Cannot decompress synctex: {}", e))?;

    Ok(parse_synctex_content(&content))
}

fn backward_sync(
    nodes: &[SyncNode],
    page: u32,
    x: f64,
    y: f64,
) -> Result<serde_json::Value, String> {
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

#[cfg(test)]
mod tests {
    use super::parse_synctex_view_output;

    #[test]
    fn parse_synctex_view_output_supports_rectangle_records() {
        let output = r#"
SyncTeX result begin
Output:foo
Page:3
x:72.0
y:144.0
h:70.0
v:150.0
W:80.0
H:12.0
Output:bar
Page:4
x:90.0
y:200.0
h:88.0
v:206.0
W:64.0
H:10.0
SyncTeX result end
"#;

        let parsed = parse_synctex_view_output(output).expect("should parse rectangle records");
        let records = parsed.as_array().expect("expected array result");
        assert_eq!(records.len(), 2);
        assert_eq!(records[0]["page"].as_u64(), Some(3));
        assert_eq!(records[1]["page"].as_u64(), Some(4));
        assert_eq!(records[0]["indicator"].as_bool(), Some(true));
    }

    #[test]
    fn parse_synctex_view_output_supports_single_point_record() {
        let output = r#"
SyncTeX result begin
Page:2
x:18.5
y:24.25
SyncTeX result end
"#;

        let parsed = parse_synctex_view_output(output).expect("should parse point record");
        assert!(parsed.is_object());
        assert_eq!(parsed["page"].as_u64(), Some(2));
        assert_eq!(parsed["indicator"].as_bool(), Some(true));
    }
}
