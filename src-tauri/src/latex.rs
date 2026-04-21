use futures_util::StreamExt;
use regex_lite::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::latex_tools::{
    binary_status, find_chktex, find_latexindent, find_synctex, find_system_tex, find_tectonic,
    scribeflow_bin_dir, tectonic_binary_name, LatexCompilerStatus, LatexToolStatus,
};
use crate::process_utils::{background_command, background_tokio_command};

const LATEX_COMPILE_STREAM_EVENT: &str = "latex-compile-stream";

fn apply_user_perl_local_lib_env_tokio(command: &mut tokio::process::Command) {
    let Some(home_dir) = dirs::home_dir() else {
        return;
    };

    let perl_root = home_dir.join("perl5");
    let perl_lib = perl_root.join("lib").join("perl5");
    let perl_bin = perl_root.join("bin");

    if perl_lib.exists() {
        command.env("PERL5LIB", perl_lib.as_os_str());
        command.env("PERL_LOCAL_LIB_ROOT", perl_root.as_os_str());
        command.env(
            "PERL_MB_OPT",
            format!("--install_base {}", perl_root.to_string_lossy()),
        );
        command.env(
            "PERL_MM_OPT",
            format!("INSTALL_BASE={}", perl_root.to_string_lossy()),
        );
    }

    if perl_bin.exists() {
        let current_path = std::env::var_os("PATH").unwrap_or_default();
        let mut path_entries = std::env::split_paths(&current_path).collect::<Vec<_>>();
        if !path_entries.iter().any(|entry| entry == &perl_bin) {
            path_entries.insert(0, perl_bin);
        }
        if let Ok(joined) = std::env::join_paths(path_entries) {
            command.env("PATH", joined);
        }
    }
}

async fn latexindent_is_healthy(path: &str) -> bool {
    let mut command = background_tokio_command(path);
    apply_user_perl_local_lib_env_tokio(&mut command);
    command.arg("--version");
    let result = command.output().await;
    let healthy = result
        .as_ref()
        .map(|output| output.status.success())
        .unwrap_or(false);
    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            eprintln!(
                "[latex] latexindent health path={} healthy={} status={:?} stdout={:?} stderr={:?}",
                path,
                healthy,
                output.status.code(),
                stdout,
                stderr
            );
        }
        Err(error) => {
            eprintln!(
                "[latex] latexindent health path={} healthy=false spawn_error={}",
                path, error
            );
        }
    }
    healthy
}

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
    pub severity: String, // "error" or "warning"
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexCompileStreamPayload {
    tex_path: String,
    line: String,
    clear: bool,
    header: bool,
    open: bool,
    status: Option<String>,
}

#[derive(Debug, Clone)]
struct LatexCompileMeta {
    compiler_backend: String,
    command_preview: String,
    requested_program: Option<String>,
    requested_program_applied: bool,
}

fn parse_latex_output(output: &str) -> (Vec<LatexError>, Vec<LatexError>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let undefined_ref_re =
        Regex::new(r#"^LaTeX Warning: (Reference|Citation) `([^']+)' .* input line (\d+)\.$"#).ok();
    let package_warning_re =
        Regex::new(r#"^(Package|Class) .+ Warning: .+ on input line (\d+)\.?$"#).ok();
    let generic_line_re = Regex::new(r"\bline (\d+)\b").ok();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Tectonic error format: "error: ..." or specific TeX errors
        if trimmed.starts_with("error:") {
            let msg = trimmed.strip_prefix("error:").unwrap_or(trimmed).trim();
            let (line_num, message) = extract_line_number(msg);
            errors.push(make_latex_issue(
                None,
                line_num,
                None,
                message,
                "error",
                Some(trimmed.to_string()),
            ));
        } else if trimmed.starts_with("warning:") {
            let msg = trimmed.strip_prefix("warning:").unwrap_or(trimmed).trim();
            let (line_num, message) = extract_line_number(msg);
            warnings.push(make_latex_issue(
                None,
                line_num,
                None,
                message,
                "warning",
                Some(trimmed.to_string()),
            ));
        }
        // TeX error format: "! Undefined control sequence." or "! Missing $ inserted."
        else if trimmed.starts_with('!') {
            let msg = trimmed.strip_prefix('!').unwrap_or(trimmed).trim();
            errors.push(make_latex_issue(
                None,
                None,
                None,
                msg,
                "error",
                Some(trimmed.to_string()),
            ));
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
                        if last.raw.is_none() {
                            last.raw = Some(trimmed.to_string());
                        }
                    }
                }
            }
        }
        // file-line-column-error format: ./main.tex:42:13: Undefined control sequence.
        else if let Some((file, line_num, column, message)) = extract_file_line_col_error(trimmed)
        {
            errors.push(make_latex_issue(
                Some(file),
                Some(line_num),
                Some(column),
                message,
                "error",
                Some(trimmed.to_string()),
            ));
        }
        // latexmk/file-line-error format: ./main.tex:42: Undefined control sequence.
        else if let Some((file, line_num, message)) = extract_file_line_error(trimmed) {
            errors.push(make_latex_issue(
                Some(file),
                Some(line_num),
                None,
                message,
                "error",
                Some(trimmed.to_string()),
            ));
        } else if trimmed.contains("LaTeX Warning:")
            || (trimmed.starts_with("Package ") && trimmed.contains(" Warning:"))
            || (trimmed.starts_with("Class ") && trimmed.contains(" Warning:"))
            || trimmed.starts_with("Overfull ")
            || trimmed.starts_with("Underfull ")
            || trimmed.contains("undefined references")
            || trimmed.contains("Label(s) may have changed")
        {
            let mut line_num = extract_line_number_from_warning(trimmed, generic_line_re.as_ref());
            if line_num.is_none() {
                if let Some(re) = undefined_ref_re.as_ref() {
                    line_num = re
                        .captures(trimmed)
                        .and_then(|captures| captures.get(3))
                        .and_then(|value| value.as_str().parse::<u32>().ok());
                }
            }
            if line_num.is_none() {
                if let Some(re) = package_warning_re.as_ref() {
                    line_num = re
                        .captures(trimmed)
                        .and_then(|captures| captures.get(2))
                        .and_then(|value| value.as_str().parse::<u32>().ok());
                }
            }
            warnings.push(make_latex_issue(
                None,
                line_num,
                None,
                trimmed,
                "warning",
                Some(trimmed.to_string()),
            ));
        }
    }

    (errors, warnings)
}

fn make_latex_issue(
    file: Option<String>,
    line: Option<u32>,
    column: Option<u32>,
    message: impl Into<String>,
    severity: &str,
    raw: Option<String>,
) -> LatexError {
    LatexError {
        file,
        line,
        column,
        message: message.into(),
        severity: severity.to_string(),
        raw,
    }
}

fn extract_file_line_col_error(line: &str) -> Option<(String, u32, u32, &str)> {
    let parts: Vec<&str> = line.splitn(4, ':').collect();
    if parts.len() < 4 {
        return None;
    }
    let file = parts[0].trim();
    let line_num = parts[1].trim().parse::<u32>().ok()?;
    let column = parts[2].trim().parse::<u32>().ok()?;
    Some((file.to_string(), line_num, column, parts[3].trim()))
}

fn extract_file_line_error(line: &str) -> Option<(String, u32, &str)> {
    let parts: Vec<&str> = line.splitn(3, ':').collect();
    if parts.len() < 3 {
        return None;
    }
    let file = parts[0].trim();
    let line_num = parts[1].trim().parse::<u32>().ok()?;
    Some((file.to_string(), line_num, parts[2].trim()))
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

fn extract_line_number_from_warning(msg: &str, generic_line_re: Option<&Regex>) -> Option<u32> {
    if let Some((line, _)) = extract_overfull_underfull_range(msg) {
        return Some(line);
    }
    if let Some(re) = generic_line_re {
        if let Some(captures) = re.captures(msg) {
            return captures
                .get(1)
                .and_then(|value| value.as_str().parse::<u32>().ok());
        }
    }
    None
}

fn extract_overfull_underfull_range(msg: &str) -> Option<(u32, u32)> {
    if let Some(index) = msg.find("lines ") {
        let after = &msg[index + 6..];
        let parts: Vec<&str> = after.split("--").collect();
        if parts.len() >= 2 {
            let start = parts[0].trim().parse::<u32>().ok()?;
            let end_digits: String = parts[1]
                .chars()
                .take_while(|ch| ch.is_ascii_digit())
                .collect();
            let end = end_digits.parse::<u32>().ok()?;
            return Some((start, end));
        }
    }
    if let Some(index) = msg.find("line ") {
        let after = &msg[index + 5..];
        let digits: String = after.chars().take_while(|ch| ch.is_ascii_digit()).collect();
        if let Ok(line_num) = digits.parse::<u32>() {
            return Some((line_num, line_num));
        }
    }
    None
}

fn parse_chktex_output(output: &str) -> Vec<LatexError> {
    let mut diagnostics = Vec::new();

    for raw_line in output.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split('\u{1f}').collect();
        if parts.len() < 6 {
            continue;
        }

        let file = parts[0].trim();
        let line = parts[1].trim().parse::<u32>().ok();
        let column = parts[2].trim().parse::<u32>().ok();
        let kind = parts[3].trim();
        let code = parts[4].trim();
        let message = parts[5].trim();

        let severity = if kind.eq_ignore_ascii_case("error") {
            "error"
        } else {
            "warning"
        };

        let formatted_message = if code.is_empty() {
            format!("ChkTeX: {}", message)
        } else {
            format!("ChkTeX {}: {}", code, message)
        };

        diagnostics.push(make_latex_issue(
            if file.is_empty() {
                None
            } else {
                Some(file.to_string())
            },
            line,
            column,
            formatted_message,
            severity,
            Some(trimmed.to_string()),
        ));
    }

    diagnostics
}

fn default_chktex_args() -> Vec<&'static str> {
    vec!["-wall", "-n22", "-n30", "-e16", "-q"]
}

fn discover_chktexrc(tex_path: &str, workspace_path: Option<&str>) -> Option<PathBuf> {
    let tex_dir = Path::new(tex_path).parent()?;
    let workspace_root = workspace_path
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);

    let mut current = Some(tex_dir.to_path_buf());
    while let Some(dir) = current {
        let candidate = dir.join(".chktexrc");
        if candidate.exists() {
            return Some(candidate);
        }

        if workspace_root.as_ref().is_some_and(|root| dir == *root) {
            break;
        }
        current = dir.parent().map(Path::to_path_buf);
    }

    global_chktexrc()
}

fn global_chktexrc() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        for value in [
            std::env::var("CHKTEXRC")
                .ok()
                .map(|dir| PathBuf::from(dir).join("chktexrc")),
            std::env::var("CHKTEX_HOME")
                .ok()
                .map(|dir| PathBuf::from(dir).join("chktexrc")),
            std::env::var("EMTEXDIR")
                .ok()
                .map(|dir| PathBuf::from(dir).join("data").join("chktexrc")),
        ]
        .into_iter()
        .flatten()
        {
            if value.exists() {
                return Some(value);
            }
        }
    }

    #[cfg(not(windows))]
    {
        for value in [
            std::env::var("HOME")
                .ok()
                .map(|dir| PathBuf::from(dir).join(".chktexrc")),
            std::env::var("LOGDIR")
                .ok()
                .map(|dir| PathBuf::from(dir).join(".chktexrc")),
            std::env::var("CHKTEXRC")
                .ok()
                .map(|dir| PathBuf::from(dir).join(".chktexrc")),
        ]
        .into_iter()
        .flatten()
        {
            if value.exists() {
                return Some(value);
            }
        }
    }

    None
}

fn read_chktex_tab_size(rc_path: Option<&Path>) -> Option<usize> {
    let path = rc_path?;
    let contents = std::fs::read_to_string(path).ok()?;
    let tab_size_re = Regex::new(r"(?m)^\s*TabSize\s*=\s*(\d+)\s*$").ok()?;
    let captures = tab_size_re.captures(&contents)?;
    captures.get(1)?.as_str().parse::<usize>().ok()
}

fn convert_chktex_column(column: u32, line: &str, tab_size: usize) -> u32 {
    if column <= 1 {
        return column;
    }

    let target = column.saturating_sub(1) as usize;
    let mut consumed = 0usize;
    let mut visual_column = 0usize;

    for ch in line.chars() {
        if consumed >= target {
            break;
        }
        let width = if ch == '\t' { tab_size } else { ch.len_utf8() };
        consumed += width;
        visual_column += 1;
    }

    (visual_column + 1) as u32
}

fn adjust_chktex_columns_for_source(
    diagnostics: &mut [LatexError],
    tex_path: &str,
    source_content: &str,
    tab_size: usize,
) {
    let source_lines: Vec<&str> = source_content.lines().collect();
    let tex_path = Path::new(tex_path);

    for diagnostic in diagnostics.iter_mut() {
        let Some(line) = diagnostic.line else {
            continue;
        };
        let Some(column) = diagnostic.column else {
            continue;
        };
        let line_index = line.saturating_sub(1) as usize;
        let Some(line_text) = source_lines.get(line_index) else {
            continue;
        };

        let matches_source = diagnostic.file.as_deref().is_none_or(|file| {
            let diagnostic_path = Path::new(file);
            diagnostic_path == tex_path || diagnostic_path.file_name() == tex_path.file_name()
        });
        if !matches_source {
            continue;
        }

        diagnostic.column = Some(convert_chktex_column(column, line_text, tab_size));
    }
}

async fn read_or_use_source_content(
    tex_path: &str,
    content: Option<String>,
) -> Result<String, String> {
    if let Some(content) = content {
        return Ok(content);
    }
    tokio::fs::read_to_string(tex_path)
        .await
        .map_err(|e| format!("Failed to read LaTeX source: {}", e))
}

fn latexindent_null_path() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
}

async fn run_command_with_stdin(
    mut command: tokio::process::Command,
    stdin_content: String,
) -> Result<(std::process::ExitStatus, String, String), String> {
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to start command: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(stdin_content.as_bytes())
            .await
            .map_err(|e| format!("Failed to write command stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed waiting for command: {}", e))?;

    Ok((
        output.status,
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

fn normalize_build_recipe(recipe: Option<&str>) -> &'static str {
    match recipe
        .map(|value| value.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("shell-escape") => "shell-escape",
        Some("clean-build") => "clean-build",
        Some("shell-escape-clean") => "shell-escape-clean",
        _ => "default",
    }
}

fn build_latexmk_recipe_args(recipe: Option<&str>) -> Vec<&'static str> {
    match normalize_build_recipe(recipe) {
        "shell-escape" => vec!["-shell-escape"],
        "clean-build" => vec!["-gg"],
        "shell-escape-clean" => vec!["-shell-escape", "-gg"],
        _ => Vec::new(),
    }
}

fn parse_build_extra_args(extra_args: Option<&str>) -> Result<Vec<String>, String> {
    let trimmed = extra_args.unwrap_or("").trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    shell_words::split(trimmed)
        .map_err(|error| format!("Invalid LaTeX build extra args: {}", error))
}

fn preview_command_arg(arg: &str) -> String {
    if !arg.is_empty()
        && arg
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || "/._-=:,+".contains(ch))
    {
        return arg.to_string();
    }

    format!("'{}'", arg.replace('\'', r"'\''"))
}

fn build_command_preview(program: &str, args: &[String]) -> String {
    std::iter::once(preview_command_arg(program))
        .chain(args.iter().map(|arg| preview_command_arg(arg)))
        .collect::<Vec<_>>()
        .join(" ")
}

fn tex_command_locale() -> &'static str {
    if cfg!(target_os = "macos") {
        "en_US.UTF-8"
    } else {
        "C.UTF-8"
    }
}

fn apply_tex_locale_tokio(command: &mut tokio::process::Command) {
    let locale = tex_command_locale();
    command.env("LANG", locale);
    command.env("LC_CTYPE", locale);
}

fn apply_tex_locale_std(command: &mut std::process::Command) {
    let locale = tex_command_locale();
    command.env("LANG", locale);
    command.env("LC_CTYPE", locale);
}

fn tex_command_argument(tex: &Path, fallback: &str) -> String {
    tex.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
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
            file: None,
            line: None,
            column: None,
            message,
            severity: "error".to_string(),
            raw: Some(full_log.clone()),
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
    build_extra_args: Option<String>,
) -> Result<CompileResult, String> {
    let tex = Path::new(tex_path);
    let dir = tex.parent().ok_or("Invalid tex path")?;
    let tex_arg = tex_command_argument(tex, tex_path);
    eprintln!("[latex] Using tectonic at: {}", tectonic_path);
    eprintln!("[latex] Compiling: {} in dir: {}", tex_path, dir.display());

    let mut args = vec![
        "-X".to_string(),
        "compile".to_string(),
        "--synctex".to_string(),
        "--keep-logs".to_string(),
    ];
    args.extend(parse_build_extra_args(build_extra_args.as_deref())?);
    args.push(tex_arg);

    let mut command = background_tokio_command(tectonic_path);
    command.args(args.iter().map(|arg| arg.as_str()));
    command.current_dir(dir);
    apply_tex_locale_tokio(&mut command);

    let meta = LatexCompileMeta {
        compiler_backend: "tectonic".to_string(),
        command_preview: build_command_preview(tectonic_path, &args),
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
    let file_label = tex
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(tex_path)
        .to_string();
    let stdout_log = Arc::new(Mutex::new(String::new()));
    let stderr_log = Arc::new(Mutex::new(String::new()));

    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to start LaTeX compiler: {}", e))?;

    let mut intro = vec![
        format!("Starting LaTeX compile for {}", file_label),
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
            clear: true,
            header: true,
            open: false,
            status: Some("running".to_string()),
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
    build_recipe: Option<String>,
    build_extra_args: Option<String>,
) -> Result<CompileResult, String> {
    let tex = Path::new(tex_path);
    let dir = tex.parent().ok_or("Invalid tex path")?;
    let tex_arg = tex_command_argument(tex, tex_path);
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

    let mut args = vec![
        engine_flag.to_string(),
        "-interaction=nonstopmode".to_string(),
        "-synctex=1".to_string(),
        "-file-line-error".to_string(),
        "-halt-on-error".to_string(),
    ];
    args.extend(
        build_latexmk_recipe_args(build_recipe.as_deref())
            .into_iter()
            .map(String::from),
    );
    args.extend(parse_build_extra_args(build_extra_args.as_deref())?);
    args.push(tex_arg);

    let mut command = background_tokio_command(system_tex_path);
    command.args(args.iter().map(|arg| arg.as_str()));
    command.current_dir(dir);
    apply_tex_locale_tokio(&mut command);

    let meta = LatexCompileMeta {
        compiler_backend: compiler_backend.to_string(),
        command_preview: build_command_preview(system_tex_path, &args),
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
    build_recipe: Option<String>,
    build_extra_args: Option<String>,
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
    let tectonic = find_tectonic(custom_tectonic_path.as_deref());

    let result = match preference.as_str() {
        "system" | "system-tex" => {
            let system_tex = system_tex.ok_or_else(|| {
                "System TeX compiler not found. Install MacTeX or TeX Live and try again."
                    .to_string()
            })?;
            compile_with_system_tex(
                &app,
                &system_tex,
                &tex_path,
                start,
                requested_program.clone(),
                Some(engine_preference.clone()),
                build_recipe.clone(),
                build_extra_args.clone(),
            )
            .await
        }
        "tectonic" => {
            let tectonic = tectonic.ok_or_else(|| {
                "Tectonic not found. Install it or choose System TeX in Settings.".to_string()
            })?;
            compile_with_tectonic(
                &app,
                &tectonic,
                &tex_path,
                start,
                requested_program.clone(),
                build_extra_args.clone(),
            )
            .await
        }
        _ => {
            if let Some(system_tex) = system_tex {
                compile_with_system_tex(
                    &app,
                    &system_tex,
                    &tex_path,
                    start,
                    requested_program.clone(),
                    Some(engine_preference.clone()),
                    build_recipe.clone(),
                    build_extra_args.clone(),
                )
                .await
            } else if let Some(tectonic) = tectonic {
                compile_with_tectonic(
                    &app,
                    &tectonic,
                    &tex_path,
                    start,
                    requested_program.clone(),
                    build_extra_args.clone(),
                )
                .await
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
    _app: tauri::AppHandle,
    custom_system_tex_path: Option<String>,
    custom_tectonic_path: Option<String>,
) -> Result<LatexCompilerStatus, String> {
    let tectonic = find_tectonic(custom_tectonic_path.as_deref());
    let system_tex = find_system_tex(custom_system_tex_path.as_deref());

    Ok(LatexCompilerStatus {
        tectonic: binary_status(tectonic),
        system_tex: binary_status(system_tex),
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
    let tex_arg = tex_command_argument(tex, &tex_path);
    let source_content = read_or_use_source_content(&tex_path, content).await?;

    let chktexrc = discover_chktexrc(&tex_path, workspace_path.as_deref());

    let mut command = background_tokio_command(&chktex);
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

    let mut command = background_tokio_command(&latexindent);
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
    column: Option<u32>,
) -> Result<serde_json::Value, String> {
    let synctex = Path::new(&synctex_path);
    if !synctex.exists() {
        return Err("SyncTeX file not found. Recompile with SyncTeX enabled.".to_string());
    }

    if let Some(pdf_path) = derive_pdf_path_from_synctex_path(&synctex_path) {
        if let Some(binary) = find_synctex(None) {
            if let Ok(result) =
                run_synctex_view_cli(&binary, &pdf_path, &tex_path, line, column.unwrap_or(0))
            {
                return Ok(result);
            }
        }
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

// --- SyncTeX parser ---

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

fn parse_synctex_view_output(output: &str) -> Result<serde_json::Value, String> {
    let mut page = None;
    let mut x = None;
    let mut y = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("Page:") {
            page = value.trim().parse::<u32>().ok();
        } else if let Some(value) = trimmed.strip_prefix("x:") {
            x = value.trim().parse::<f64>().ok();
        } else if let Some(value) = trimmed.strip_prefix("y:") {
            y = value.trim().parse::<f64>().ok();
        }

        if let (Some(page), Some(x), Some(y)) = (page, x, y) {
            return Ok(serde_json::json!({
                "page": page,
                "x": x,
                "y": y,
            }));
        }
    }

    Err("SyncTeX view output did not contain a complete result.".to_string())
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

fn run_synctex_view_cli(
    synctex_binary: &str,
    pdf_path: &str,
    tex_path: &str,
    line: u32,
    column: u32,
) -> Result<serde_json::Value, String> {
    let input = build_synctex_view_input(tex_path, line, column);
    let mut command = background_command(synctex_binary);
    apply_tex_locale_std(&mut command);
    let output = command
        .args(["view", "-i", &input, "-o", pdf_path])
        .output()
        .map_err(|e| format!("Failed to run synctex view: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    parse_synctex_view_output(&String::from_utf8_lossy(&output.stdout))
}

fn build_synctex_view_input(tex_path: &str, line: u32, column: u32) -> String {
    // The CLI format is line:column:input, with optional page hint inserted
    // before the input path. Passing 0 here would be parsed as part of the
    // file name and make column-based forward sync ineffective.
    format!("{}:{}:{}", line.max(1), column, tex_path)
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
            let should_replace = if dist < best_dist {
                true
            } else if dist == best_dist {
                match best {
                    Some(best_node) if node.kind == 'x' && best_node.kind != 'x' => true,
                    Some(best_node) if node.kind == best_node.kind && node.x < best_node.x => true,
                    None => true,
                    _ => false,
                }
            } else {
                false
            };
            if should_replace {
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
