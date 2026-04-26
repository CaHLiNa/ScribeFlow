use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::latex::{CompileResult, LatexError};
use crate::latex_diagnostics::parse_latex_output;
use crate::latex_tools::{find_tectonic, find_system_tex};
use crate::process_utils::background_tokio_command;

const LATEX_COMPILE_STREAM_EVENT: &str = "latex-compile-stream";

#[derive(Debug, Clone)]
struct LatexCompileMeta {
    compiler_backend: String,
    command_preview: String,
    requested_program: Option<String>,
    requested_program_applied: bool,
}

pub(crate) fn apply_user_perl_local_lib_env_tokio(command: &mut tokio::process::Command) {
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

pub(crate) async fn latexindent_is_healthy(path: &str) -> bool {
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

pub(crate) async fn read_or_use_source_content(
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

pub(crate) fn latexindent_null_path() -> &'static str {
    if cfg!(windows) {
        "NUL"
    } else {
        "/dev/null"
    }
}

pub(crate) async fn run_command_with_stdin(
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

pub(crate) fn apply_tex_locale_tokio(command: &mut tokio::process::Command) {
    let locale = tex_command_locale();
    command.env("LANG", locale);
    command.env("LC_CTYPE", locale);
}

pub(crate) fn apply_tex_locale_std(command: &mut std::process::Command) {
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

pub(crate) fn read_requested_program(tex_path: &str) -> Option<String> {
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
        serde_json::json!({
            "texPath": tex_path.to_string(),
            "line": intro.join("\n"),
            "clear": true,
            "header": true,
            "open": false,
            "status": "running",
        }),
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
                    serde_json::json!({
                        "texPath": tex_path.clone(),
                        "line": line,
                        "clear": false,
                        "header": false,
                        "open": false,
                        "status": serde_json::Value::Null,
                    }),
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
                    serde_json::json!({
                        "texPath": tex_path.clone(),
                        "line": line,
                        "clear": false,
                        "header": false,
                        "open": false,
                        "status": serde_json::Value::Null,
                    }),
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

pub(crate) async fn compile_with_tectonic(
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

pub(crate) async fn compile_with_system_tex(
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

pub(crate) async fn compile_latex_with_preference(
    app: &tauri::AppHandle,
    tex_path: &str,
    compiler_preference: Option<String>,
    engine_preference: Option<String>,
    build_recipe: Option<String>,
    build_extra_args: Option<String>,
    custom_system_tex_path: Option<String>,
    custom_tectonic_path: Option<String>,
) -> Result<CompileResult, String> {
    let start = std::time::Instant::now();
    let requested_program = read_requested_program(tex_path);
    let engine_preference = engine_preference.unwrap_or_else(|| "auto".to_string());

    let preference = compiler_preference.unwrap_or_else(|| "auto".to_string());
    let system_tex = find_system_tex(custom_system_tex_path.as_deref());
    let tectonic = find_tectonic(custom_tectonic_path.as_deref());

    match preference.as_str() {
        "system" | "system-tex" => {
            let system_tex = system_tex.ok_or_else(|| {
                "System TeX compiler not found. Install MacTeX or TeX Live and try again."
                    .to_string()
            })?;
            compile_with_system_tex(
                app,
                &system_tex,
                tex_path,
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
                app,
                &tectonic,
                tex_path,
                start,
                requested_program.clone(),
                build_extra_args.clone(),
            )
            .await
        }
        _ => {
            if let Some(system_tex) = system_tex {
                compile_with_system_tex(
                    app,
                    &system_tex,
                    tex_path,
                    start,
                    requested_program.clone(),
                    Some(engine_preference.clone()),
                    build_recipe.clone(),
                    build_extra_args.clone(),
                )
                .await
            } else if let Some(tectonic) = tectonic {
                compile_with_tectonic(
                    app,
                    &tectonic,
                    tex_path,
                    start,
                    requested_program.clone(),
                    build_extra_args.clone(),
                )
                .await
            } else {
                Err("No LaTeX compiler found. Install MacTeX/TeX Live, or install Tectonic in Settings.".to_string())
            }
        }
    }
}
