use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
use crate::security;
use crate::security::WorkspaceScopeState;

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

#[derive(Debug, Clone, PartialEq)]
struct SynctexBackwardParams {
    synctex_path: String,
    page: Option<u32>,
    x: Option<f64>,
    y: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
struct SynctexForwardParams {
    synctex_path: String,
    file_path: String,
    line: Option<u32>,
    column: u32,
}

#[derive(Debug, Clone, PartialEq)]
struct LatexToolCheckParams {
    custom_system_tex_path: Option<String>,
    custom_tectonic_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
struct LatexFormatDocumentParams {
    tex_path: String,
    content: String,
    custom_system_tex_path: Option<String>,
}

fn payload_field<'a>(params: &'a Value, key: &str) -> Option<&'a Value> {
    params.as_object().and_then(|object| object.get(key))
}

fn raw_string_payload_field(params: &Value, key: &str) -> String {
    payload_field(params, key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn string_payload_field(params: &Value, key: &str) -> String {
    raw_string_payload_field(params, key).trim().to_string()
}

fn optional_string_payload_field(params: &Value, key: &str) -> Option<String> {
    let value = string_payload_field(params, key);
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn finite_number_payload_field(params: &Value, key: &str) -> Option<f64> {
    let value = payload_field(params, key)?;
    let number = value
        .as_f64()
        .or_else(|| value.as_str().and_then(|text| text.trim().parse().ok()))?;
    number.is_finite().then_some(number)
}

fn positive_u32_payload_field(params: &Value, key: &str) -> Option<u32> {
    let number = finite_number_payload_field(params, key)?;
    if number.fract() != 0.0 || number < 1.0 || number > u32::MAX as f64 {
        return None;
    }
    Some(number as u32)
}

fn synctex_backward_params_from_payload(params: Value) -> SynctexBackwardParams {
    SynctexBackwardParams {
        synctex_path: string_payload_field(&params, "synctexPath"),
        page: positive_u32_payload_field(&params, "page"),
        x: finite_number_payload_field(&params, "x"),
        y: finite_number_payload_field(&params, "y"),
    }
}

fn synctex_forward_params_from_payload(params: Value) -> SynctexForwardParams {
    SynctexForwardParams {
        synctex_path: string_payload_field(&params, "synctexPath"),
        file_path: string_payload_field(&params, "filePath"),
        line: positive_u32_payload_field(&params, "line"),
        column: positive_u32_payload_field(&params, "column").unwrap_or(1),
    }
}

fn latex_tool_check_params_from_payload(params: Value) -> LatexToolCheckParams {
    LatexToolCheckParams {
        custom_system_tex_path: optional_string_payload_field(&params, "customSystemTexPath"),
        custom_tectonic_path: optional_string_payload_field(&params, "customTectonicPath"),
    }
}

fn latex_format_document_params_from_payload(params: Value) -> LatexFormatDocumentParams {
    LatexFormatDocumentParams {
        tex_path: string_payload_field(&params, "texPath"),
        content: raw_string_payload_field(&params, "content"),
        custom_system_tex_path: optional_string_payload_field(&params, "customSystemTexPath"),
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
    params: Value,
) -> Result<LatexCompilerStatus, String> {
    let params = latex_tool_check_params_from_payload(params);
    Ok(LatexCompilerStatus {
        tectonic: binary_status(crate::latex_tools::find_tectonic(
            params.custom_tectonic_path.as_deref(),
        )),
        system_tex: binary_status(crate::latex_tools::find_system_tex(
            params.custom_system_tex_path.as_deref(),
        )),
    })
}

#[tauri::command]
pub async fn check_latex_tools(params: Value) -> Result<LatexToolStatus, String> {
    let params = latex_tool_check_params_from_payload(params);
    let chktex = find_chktex(params.custom_system_tex_path.as_deref());
    eprintln!("[latex] check_latex_tools chktex={:?}", chktex);
    let latexindent = match find_latexindent(params.custom_system_tex_path.as_deref()) {
        Some(path) if latexindent_is_healthy(&path).await => Some(path),
        _ => None,
    };
    eprintln!("[latex] check_latex_tools latexindent={:?}", latexindent);

    Ok(LatexToolStatus {
        chktex: binary_status(chktex),
        latexindent: binary_status(latexindent),
    })
}

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
    params: Value,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<String, String> {
    let params = latex_format_document_params_from_payload(params);
    let latexindent =
        find_latexindent(params.custom_system_tex_path.as_deref()).ok_or_else(|| {
            "latexindent not found. Install it with your TeX distribution.".to_string()
        })?;

    let resolved =
        security::ensure_allowed_workspace_path(scope_state.inner(), Path::new(&params.tex_path))?;
    let tex = resolved.as_path();
    let dir = tex.parent().ok_or("Invalid tex path")?;

    let mut command = crate::process_utils::background_tokio_command(&latexindent);
    command.current_dir(dir);
    apply_tex_locale_tokio(&mut command);
    apply_user_perl_local_lib_env_tokio(&mut command);
    command.arg(format!("-g={}", latexindent_null_path()));
    command.arg("-");

    let (status, stdout, stderr) = run_command_with_stdin(command, params.content).await?;
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
pub async fn workspace_synctex_backward(
    params: Value,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<Option<serde_json::Value>, String> {
    let params = synctex_backward_params_from_payload(params);
    let Some(page) = params.page else {
        return Ok(None);
    };
    let (Some(x), Some(y)) = (params.x, params.y) else {
        return Ok(None);
    };
    if params.synctex_path.is_empty() {
        return Ok(None);
    }

    let synctex = security::ensure_allowed_workspace_path(
        scope_state.inner(),
        Path::new(&params.synctex_path),
    )?;
    if !synctex.exists() {
        return Err("SyncTeX file not found. Recompile with SyncTeX enabled.".to_string());
    }

    let resolved_synctex_path = synctex.to_string_lossy().to_string();
    if let Some(pdf_path) = derive_pdf_path_from_synctex_path(&resolved_synctex_path) {
        if let Some(binary) = find_synctex(None) {
            if let Ok(result) = run_synctex_edit_cli(&binary, &pdf_path, page, x, y) {
                return Ok(Some(normalize_synctex_backward_result(result)));
            }
        }
    }

    let data = parse_synctex_file(&resolved_synctex_path)?;
    backward_sync(&data, page, x, y).map(|result| Some(normalize_synctex_backward_result(result)))
}

#[tauri::command]
pub async fn workspace_synctex_forward(
    params: Value,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<Option<serde_json::Value>, String> {
    let params = synctex_forward_params_from_payload(params);
    let Some(line) = params.line else {
        return Ok(None);
    };
    if params.synctex_path.is_empty() || params.file_path.is_empty() {
        return Ok(None);
    }

    let synctex = security::ensure_allowed_workspace_path(
        scope_state.inner(),
        Path::new(&params.synctex_path),
    )?;
    if !synctex.exists() {
        return Err("SyncTeX file not found. Recompile with SyncTeX enabled.".to_string());
    }

    let normalized_file_path =
        security::ensure_allowed_workspace_path(scope_state.inner(), Path::new(&params.file_path))?;
    let resolved_synctex_path = synctex.to_string_lossy().to_string();
    let resolved_file_path = normalized_file_path.to_string_lossy().to_string();

    if let Some(pdf_path) = derive_pdf_path_from_synctex_path(&resolved_synctex_path) {
        if let Some(binary) = find_synctex(None) {
            if let Ok(result) =
                run_synctex_view_cli(&binary, &resolved_file_path, &pdf_path, line, params.column)
            {
                return Ok(normalize_synctex_forward_result(result));
            }
        }
    }

    let data = parse_synctex_file(&resolved_synctex_path)?;
    forward_sync(&data, &resolved_file_path, line).map(normalize_synctex_forward_result)
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
                "strictLine": true,
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
        record.insert("strictLine".to_string(), serde_json::Value::Bool(true));
        records.push(record);
    }

    current.clear();
}

fn value_strict_line(value: &serde_json::Value) -> bool {
    value
        .get("strictLine")
        .or_else(|| value.get("strict_line"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

fn finite_value_number(value: Option<&serde_json::Value>) -> Option<f64> {
    let number = value.and_then(serde_json::Value::as_f64)?;
    number.is_finite().then_some(number)
}

fn normalize_synctex_backward_result(result: serde_json::Value) -> serde_json::Value {
    let mut result = match result {
        serde_json::Value::Object(object) => object,
        _ => return serde_json::Value::Null,
    };
    let strict_line = result
        .get("strictLine")
        .or_else(|| result.get("strict_line"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    result.remove("strict_line");
    result.insert(
        "strictLine".to_string(),
        serde_json::Value::Bool(strict_line),
    );
    serde_json::Value::Object(result)
}

fn normalize_synctex_forward_record(record: serde_json::Value) -> Option<serde_json::Value> {
    let object = record.as_object()?;
    let page = object.get("page").and_then(serde_json::Value::as_u64)?;
    if page == 0 || page > u32::MAX as u64 {
        return None;
    }

    let x = finite_value_number(object.get("x"));
    let y = finite_value_number(object.get("y"));
    let h = finite_value_number(object.get("h"));
    let v = finite_value_number(object.get("v"));
    let width = finite_value_number(object.get("W"));
    let height = finite_value_number(object.get("H"));

    let has_point = x.is_some() && y.is_some();
    let has_rect = h.is_some() && v.is_some() && width.is_some() && height.is_some();
    if !has_point && !has_rect {
        return None;
    }

    let mut normalized = serde_json::Map::new();
    normalized.insert(
        "page".to_string(),
        serde_json::Value::Number(serde_json::Number::from(page)),
    );
    normalized.insert(
        "indicator".to_string(),
        serde_json::Value::Bool(
            object
                .get("indicator")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(true),
        ),
    );

    if let (Some(x), Some(y)) = (x, y) {
        normalized.insert("x".to_string(), serde_json::json!(x));
        normalized.insert("y".to_string(), serde_json::json!(y));
    }

    if let (Some(h), Some(v), Some(width), Some(height)) = (h, v, width, height) {
        normalized.insert("h".to_string(), serde_json::json!(h));
        normalized.insert("v".to_string(), serde_json::json!(v));
        normalized.insert("W".to_string(), serde_json::json!(width));
        normalized.insert("H".to_string(), serde_json::json!(height));

        if !normalized.contains_key("x") || !normalized.contains_key("y") {
            normalized.insert("x".to_string(), serde_json::json!(h));
            normalized.insert("y".to_string(), serde_json::json!(v));
        }
    }

    Some(serde_json::Value::Object(normalized))
}

fn normalized_synctex_forward_mode(record: &serde_json::Value) -> &'static str {
    let has_rect = finite_value_number(record.get("h")).is_some()
        && finite_value_number(record.get("v")).is_some()
        && finite_value_number(record.get("W")).is_some()
        && finite_value_number(record.get("H")).is_some();
    if has_rect {
        "rects"
    } else {
        "point"
    }
}

fn normalize_synctex_forward_result(result: serde_json::Value) -> Option<serde_json::Value> {
    let strict_line = match &result {
        serde_json::Value::Array(records) => records.iter().any(value_strict_line),
        value => value_strict_line(value),
    };

    let records: Vec<serde_json::Value> = match result {
        serde_json::Value::Array(records) => records
            .into_iter()
            .filter_map(normalize_synctex_forward_record)
            .collect(),
        value => normalize_synctex_forward_record(value)
            .into_iter()
            .collect(),
    };

    let Some(record) = records.first().cloned() else {
        return None;
    };

    Some(serde_json::json!({
        "mode": if records.len() > 1 { "rects" } else { normalized_synctex_forward_mode(&record) },
        "records": records,
        "record": record,
        "strictLine": strict_line,
    }))
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
            if let Some(number) =
                serde_json::Number::from_f64(value.parse::<f64>().unwrap_or(f64::NAN))
            {
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
        records.into_iter().map(serde_json::Value::Object).collect(),
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

fn read_synctex_content(path: &str) -> Result<String, String> {
    use std::io::Read;

    if !path.to_ascii_lowercase().ends_with(".gz") {
        return std::fs::read_to_string(path).map_err(|e| format!("Cannot read synctex: {}", e));
    }

    let file = std::fs::File::open(path).map_err(|e| format!("Cannot open synctex: {}", e))?;
    let mut decoder = flate2::read::GzDecoder::new(file);
    let mut content = String::new();
    decoder
        .read_to_string(&mut content)
        .map_err(|e| format!("Cannot decompress synctex: {}", e))?;
    Ok(content)
}

fn parse_synctex_file(path: &str) -> Result<Vec<SyncNode>, String> {
    let content = read_synctex_content(path)?;
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
            "strictLine": false,
        })),
        None => Err("No SyncTeX match found at this position.".to_string()),
    }
}

fn normalize_synctex_path_for_match(value: &str) -> String {
    value.replace('\\', "/").to_lowercase()
}

fn score_synctex_input_path(input_path: &str, file_path: &str) -> i32 {
    let normalized_input_path = normalize_synctex_path_for_match(input_path);
    let normalized_file_path = normalize_synctex_path_for_match(file_path);
    if normalized_input_path.is_empty() || normalized_file_path.is_empty() {
        return -1;
    }
    if normalized_input_path == normalized_file_path {
        return 10_000;
    }

    let input_segments: Vec<&str> = normalized_input_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    let file_segments: Vec<&str> = normalized_file_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    if input_segments.is_empty() || file_segments.is_empty() {
        return -1;
    }
    if input_segments.last() != file_segments.last() {
        return -1;
    }

    let mut trailing_matches = 0;
    while trailing_matches < input_segments.len()
        && trailing_matches < file_segments.len()
        && input_segments[input_segments.len() - 1 - trailing_matches]
            == file_segments[file_segments.len() - 1 - trailing_matches]
    {
        trailing_matches += 1;
    }

    100 + trailing_matches as i32 * 25
}

fn build_synctex_rect_record(nodes: &[&SyncNode]) -> Option<serde_json::Value> {
    let first = nodes.first()?;
    let mut left = f64::INFINITY;
    let mut right = f64::NEG_INFINITY;
    let mut top = f64::INFINITY;
    let mut bottom = f64::NEG_INFINITY;

    for node in nodes {
        left = left.min(node.x);
        right = right.max(node.x + node.width.max(0.0));
        top = top.min(node.y - node.height.max(0.0));
        bottom = bottom.max(node.y);
    }

    if !left.is_finite() || !right.is_finite() || !top.is_finite() || !bottom.is_finite() {
        return None;
    }

    let width = (right - left).max(0.0);
    let height = (bottom - top).max(0.0);
    Some(serde_json::json!({
        "page": first.page,
        "x": left,
        "y": bottom,
        "h": left,
        "v": bottom,
        "W": width,
        "H": height,
        "indicator": true,
        "strictLine": false,
    }))
}

fn forward_sync(
    nodes: &[SyncNode],
    file_path: &str,
    requested_line: u32,
) -> Result<serde_json::Value, String> {
    let best_file = nodes
        .iter()
        .map(|node| node.file.as_str())
        .max_by_key(|candidate| score_synctex_input_path(candidate, file_path))
        .filter(|candidate| score_synctex_input_path(candidate, file_path) >= 125)
        .ok_or_else(|| "No SyncTeX input file matched this source path.".to_string())?;

    let mut line_candidates: Vec<u32> = nodes
        .iter()
        .filter(|node| node.file == best_file)
        .map(|node| node.line)
        .collect();
    line_candidates.sort_unstable();
    line_candidates.dedup();
    let Some(resolved_line) = line_candidates
        .iter()
        .copied()
        .find(|line| *line >= requested_line)
        .or_else(|| line_candidates.last().copied())
    else {
        return Err("No SyncTeX line match found for this source file.".to_string());
    };

    let mut page_nodes: HashMap<u32, Vec<&SyncNode>> = HashMap::new();
    for node in nodes
        .iter()
        .filter(|node| node.file == best_file && node.line == resolved_line)
    {
        page_nodes.entry(node.page).or_default().push(node);
    }

    let mut pages: Vec<u32> = page_nodes.keys().copied().collect();
    pages.sort_unstable();
    let records: Vec<serde_json::Value> = pages
        .iter()
        .filter_map(|page| page_nodes.get(page))
        .filter_map(|nodes| build_synctex_rect_record(nodes))
        .collect();

    if records.is_empty() {
        return Err("No SyncTeX PDF location found for this source line.".to_string());
    }
    if records.len() == 1 {
        return Ok(records[0].clone());
    }
    Ok(serde_json::Value::Array(records))
}

#[cfg(test)]
mod tests {
    use super::{
        forward_sync, latex_format_document_params_from_payload,
        latex_tool_check_params_from_payload, normalize_synctex_backward_result,
        normalize_synctex_forward_result, parse_synctex_content, parse_synctex_view_output,
        synctex_backward_params_from_payload, synctex_forward_params_from_payload,
    };
    use serde_json::json;

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
        assert_eq!(records[0]["strictLine"].as_bool(), Some(true));
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
        assert_eq!(parsed["strictLine"].as_bool(), Some(true));
    }

    #[test]
    fn forward_sync_fallback_matches_trailing_source_path() {
        let content = r#"SyncTeX Version:1
Input:1:chapter/main.tex
{2
x1,9:65536,131072
h1,12:131072,196608:65536,32768,0
}2
"#;
        let nodes = parse_synctex_content(content);
        let parsed = forward_sync(&nodes, "/workspace/project/chapter/main.tex", 10)
            .expect("should resolve nearest following line");
        assert_eq!(parsed["page"].as_u64(), Some(2));
        assert_eq!(parsed["indicator"].as_bool(), Some(true));
        assert_eq!(parsed["strictLine"].as_bool(), Some(false));
        assert!(parsed["x"].as_f64().is_some());
        assert!(parsed["W"].as_f64().is_some());
    }

    #[test]
    fn forward_sync_fallback_rejects_unmatched_source_path() {
        let content = r#"SyncTeX Version:1
Input:1:chapter/main.tex
{1
x1,4:65536,65536
}1
"#;
        let nodes = parse_synctex_content(content);
        assert!(forward_sync(&nodes, "/workspace/project/other.tex", 4).is_err());
    }

    #[test]
    fn synctex_params_normalize_raw_payloads() {
        let backward = synctex_backward_params_from_payload(json!({
            "synctexPath": " /tmp/main.synctex.gz ",
            "page": "2",
            "x": "72.5",
            "y": 144
        }));
        assert_eq!(backward.synctex_path, "/tmp/main.synctex.gz");
        assert_eq!(backward.page, Some(2));
        assert_eq!(backward.x, Some(72.5));
        assert_eq!(backward.y, Some(144.0));

        let invalid_backward = synctex_backward_params_from_payload(json!({
            "synctexPath": false,
            "page": 0,
            "x": "NaN",
            "y": null
        }));
        assert_eq!(invalid_backward.synctex_path, "");
        assert_eq!(invalid_backward.page, None);
        assert_eq!(invalid_backward.x, None);
        assert_eq!(invalid_backward.y, None);

        let forward = synctex_forward_params_from_payload(json!({
            "synctexPath": " /tmp/main.synctex.gz ",
            "filePath": " /tmp/chapter/main.tex ",
            "line": "9",
            "column": 0
        }));
        assert_eq!(forward.synctex_path, "/tmp/main.synctex.gz");
        assert_eq!(forward.file_path, "/tmp/chapter/main.tex");
        assert_eq!(forward.line, Some(9));
        assert_eq!(forward.column, 1);
    }

    #[test]
    fn latex_tool_and_format_params_normalize_raw_payloads() {
        let tools = latex_tool_check_params_from_payload(json!({
            "customSystemTexPath": " /Library/TeX/texbin ",
            "customTectonicPath": false
        }));
        assert_eq!(
            tools.custom_system_tex_path.as_deref(),
            Some("/Library/TeX/texbin")
        );
        assert_eq!(tools.custom_tectonic_path, None);

        let missing_tools = latex_tool_check_params_from_payload(json!(null));
        assert_eq!(missing_tools.custom_system_tex_path, None);
        assert_eq!(missing_tools.custom_tectonic_path, None);

        let format = latex_format_document_params_from_payload(json!({
            "texPath": " /workspace/main.tex ",
            "content": "  \\begin{document}\\end{document}  ",
            "customSystemTexPath": " /Library/TeX/texbin "
        }));
        assert_eq!(format.tex_path, "/workspace/main.tex");
        assert_eq!(format.content, "  \\begin{document}\\end{document}  ");
        assert_eq!(
            format.custom_system_tex_path.as_deref(),
            Some("/Library/TeX/texbin")
        );

        let invalid_format = latex_format_document_params_from_payload(json!({
            "texPath": 42,
            "content": false,
            "customSystemTexPath": ""
        }));
        assert_eq!(invalid_format.tex_path, "");
        assert_eq!(invalid_format.content, "");
        assert_eq!(invalid_format.custom_system_tex_path, None);
    }

    #[test]
    fn synctex_results_normalize_to_frontend_contract_in_rust() {
        let backward = normalize_synctex_backward_result(json!({
            "file": "chapter/main.tex",
            "line": 12,
            "strict_line": true
        }));
        assert_eq!(backward["strictLine"].as_bool(), Some(true));
        assert!(backward.get("strict_line").is_none());

        let point = normalize_synctex_forward_result(json!({
            "page": 2,
            "x": 18.5,
            "y": 24.25,
            "strict_line": true
        }))
        .expect("point result should normalize");
        assert_eq!(point["mode"].as_str(), Some("point"));
        assert_eq!(point["strictLine"].as_bool(), Some(true));
        assert_eq!(point["record"]["indicator"].as_bool(), Some(true));
        assert_eq!(point["records"].as_array().map(Vec::len), Some(1));

        let rects = normalize_synctex_forward_result(json!([
            {
                "page": 3,
                "h": 70.0,
                "v": 150.0,
                "W": 80.0,
                "H": 12.0,
                "indicator": false,
                "strictLine": false
            },
            {
                "page": 0,
                "x": 10,
                "y": 10
            },
            {
                "page": 4,
                "x": 90.0,
                "y": 200.0,
                "h": 88.0,
                "v": 206.0,
                "W": 64.0,
                "H": 10.0,
                "strict_line": true
            }
        ]))
        .expect("rect result should normalize");

        assert_eq!(rects["mode"].as_str(), Some("rects"));
        assert_eq!(rects["strictLine"].as_bool(), Some(true));
        let records = rects["records"].as_array().expect("records array");
        assert_eq!(records.len(), 2);
        assert_eq!(records[0]["indicator"].as_bool(), Some(false));
        assert_eq!(records[0]["x"].as_f64(), Some(70.0));
        assert_eq!(records[0]["y"].as_f64(), Some(150.0));
        assert_eq!(
            normalize_synctex_forward_result(json!({"page": 1, "x": "bad"})),
            None
        );
    }
}
