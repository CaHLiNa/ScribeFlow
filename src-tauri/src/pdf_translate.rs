use crate::process_utils::background_tokio_command;
use chrono::Utc;
use regex_lite::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

const TRANSLATE_PROGRESS_EVENT: &str = "pdf-translation-progress";
const ENV_PROGRESS_EVENT: &str = "pdf-translation-env-progress";
const ENV_LOG_EVENT: &str = "pdf-translation-env-log";
const DEFAULT_QPS: u32 = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", content = "data")]
pub enum EnvStatus {
    NotInitialized,
    PythonMissing,
    Ready,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationTask {
    id: String,
    input_path: String,
    status: String,
    progress: f32,
    message: String,
    mono_output: Option<String>,
    dual_output: Option<String>,
    started_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationRequest {
    input_path: String,
    output_dir: String,
    lang_in: String,
    lang_out: String,
    engine: String,
    api_key: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    qps: Option<u32>,
    pool_max_workers: Option<u32>,
    auto_map_pool_max_workers: Option<bool>,
    primary_font_family: Option<String>,
    use_alternating_pages_dual: Option<bool>,
    ocr_workaround: Option<bool>,
    auto_enable_ocr_workaround: Option<bool>,
    no_watermark_mode: Option<bool>,
    save_auto_extracted_glossary: Option<bool>,
    no_auto_extract_glossary: Option<bool>,
    enhance_compatibility: Option<bool>,
    translate_table_text: Option<bool>,
    only_include_translated_page: Option<bool>,
    mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationProgressPayload {
    task_id: String,
    task: TranslationTask,
    raw_event: Option<Value>,
    raw_line: Option<String>,
}

#[derive(Clone, Default)]
pub struct PdfTranslateState {
    tasks: Arc<Mutex<HashMap<String, TranslationTask>>>,
    child_pids: Arc<Mutex<HashMap<String, u32>>>,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn global_config_dir() -> Result<PathBuf, String> {
    let dir = crate::app_dirs::data_root_dir()?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Cannot create global config dir: {e}"))?;
    }
    Ok(dir)
}

fn translate_root_dir() -> Result<PathBuf, String> {
    let dir = global_config_dir()?.join("pdf-translate");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Cannot create translator dir: {e}"))?;
    }
    Ok(dir)
}

fn venv_dir() -> Result<PathBuf, String> {
    Ok(translate_root_dir()?.join("venv"))
}

fn venv_python_path() -> Result<PathBuf, String> {
    let venv = venv_dir()?;
    Ok(if cfg!(target_os = "windows") {
        venv.join("Scripts").join("python.exe")
    } else {
        venv.join("bin").join("python")
    })
}

fn runtime_env_dirs() -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let root = translate_root_dir()?.join("runtime-home");
    let cache = root.join(".cache");
    let tiktoken = cache.join("tiktoken");
    fs::create_dir_all(&tiktoken).map_err(|e| format!("Cannot prepare runtime dirs: {e}"))?;
    Ok((root, cache, tiktoken))
}

fn emit_env_progress(app: &AppHandle, message: &str, progress: u8) {
    let _ = app.emit(
        ENV_PROGRESS_EVENT,
        serde_json::json!({
            "message": message,
            "progress": progress,
        }),
    );
}

fn emit_env_log(app: &AppHandle, line: &str) {
    let _ = app.emit(ENV_LOG_EVENT, line.to_string());
}

fn apply_runtime_env(cmd: &mut tokio::process::Command) -> Result<(), String> {
    let (runtime_home, xdg_cache_home, tiktoken_cache_dir) = runtime_env_dirs()?;
    let original_home =
        std::env::var("HOME").unwrap_or_else(|_| runtime_home.to_string_lossy().to_string());
    cmd.env("HOME", &runtime_home)
        .env("XDG_CACHE_HOME", &xdg_cache_home)
        .env("TIKTOKEN_CACHE_DIR", &tiktoken_cache_dir)
        .env("USERPROFILE", &runtime_home)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("PDFMT_ORIGINAL_HOME", original_home);
    Ok(())
}

fn resource_script_candidates(resource_dir: &Path) -> [PathBuf; 3] {
    [
        resource_dir.join("scripts").join("translate_stream.py"),
        resource_dir
            .join("_up_")
            .join("scripts")
            .join("translate_stream.py"),
        resource_dir.join("translate_stream.py"),
    ]
}

fn resolve_script_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        for candidate in resource_script_candidates(&resource_dir) {
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    let cwd = std::env::current_dir().ok()?;
    let candidates = [
        cwd.join("scripts/translate_stream.py"),
        cwd.join("../scripts/translate_stream.py"),
        cwd.join("../../scripts/translate_stream.py"),
    ];

    candidates.into_iter().find(|path| path.exists())
}

async fn check_python_version(python: &Path) -> bool {
    let output = background_tokio_command(python)
        .arg("--version")
        .output()
        .await;

    let Ok(out) = output else {
        return false;
    };

    let merged = format!(
        "{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let re = Regex::new(r"Python 3\.(1[0-9]|[2-9][0-9])").unwrap();
    re.is_match(&merged)
}

async fn resolve_base_python(base_python_path: Option<String>) -> Option<PathBuf> {
    let provided = base_python_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(value) = provided {
        let path = PathBuf::from(value);
        if check_python_version(&path).await {
            return Some(path);
        }
    }

    let fallbacks = if cfg!(target_os = "windows") {
        ["python", "python3"]
    } else {
        ["python3", "python"]
    };

    for candidate in fallbacks {
        let path = PathBuf::from(candidate);
        if check_python_version(&path).await {
            return Some(path);
        }
    }

    None
}

async fn can_import_modules(python: &Path) -> bool {
    let mut cmd = background_tokio_command(python);
    let script = r#"
import importlib
import sys

required = ("pdf2zh_next", "babeldoc", "idna")
for name in required:
    importlib.import_module(name)
print("ok")
"#;

    if apply_runtime_env(&mut cmd).is_err() {
        return false;
    }

    let status = cmd.arg("-c").arg(script).status().await;
    matches!(status, Ok(status) if status.success())
}

async fn ready_translator_python() -> Option<PathBuf> {
    let python = venv_python_path().ok()?;
    if !python.exists() {
        return None;
    }
    if can_import_modules(&python).await {
        return Some(python);
    }
    None
}

fn update_task<F>(state: &PdfTranslateState, task_id: &str, mutator: F) -> Option<TranslationTask>
where
    F: FnOnce(&mut TranslationTask),
{
    let mut guard = state.tasks.lock().ok()?;
    let task = guard.get_mut(task_id)?;
    mutator(task);
    task.updated_at = now_iso();
    Some(task.clone())
}

fn emit_task(
    app: &AppHandle,
    task_id: &str,
    task: TranslationTask,
    event: Option<Value>,
    line: Option<String>,
) {
    let payload = TranslationProgressPayload {
        task_id: task_id.to_string(),
        task,
        raw_event: event,
        raw_line: line,
    };
    let _ = app.emit(TRANSLATE_PROGRESS_EVENT, payload);
}

fn fallback_output_paths(
    input_path: &str,
    output_dir: &str,
    lang_out: &str,
) -> (Option<String>, Option<String>) {
    let stem = Path::new(input_path)
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("translated")
        .to_string();

    let mono_guess = Path::new(output_dir).join(format!("{stem}.{lang_out}.mono.pdf"));
    let dual_guess = Path::new(output_dir).join(format!("{stem}.{lang_out}.dual.pdf"));

    let mono = mono_guess
        .exists()
        .then(|| mono_guess.to_string_lossy().to_string());
    let dual = dual_guess
        .exists()
        .then(|| dual_guess.to_string_lossy().to_string());

    (mono, dual)
}

fn keep_output_inside_dir(path: Option<String>, output_dir: &str) -> Option<String> {
    let source = PathBuf::from(path?);
    if !source.exists() {
        return None;
    }

    let out_dir = Path::new(output_dir);
    if fs::create_dir_all(out_dir).is_err() {
        return Some(source.to_string_lossy().to_string());
    }

    if source.parent().map(|p| p == out_dir).unwrap_or(false) {
        return Some(source.to_string_lossy().to_string());
    }

    let filename = source.file_name()?.to_string_lossy().to_string();
    let target = out_dir.join(filename);

    if target != source && fs::copy(&source, &target).is_err() {
        return Some(source.to_string_lossy().to_string());
    }

    Some(target.to_string_lossy().to_string())
}

fn resolve_task_outputs(task: &mut TranslationTask, request: &TranslationRequest) {
    if task.mono_output.is_none() && task.dual_output.is_none() {
        let (mono, dual) =
            fallback_output_paths(&request.input_path, &request.output_dir, &request.lang_out);
        task.mono_output = mono;
        task.dual_output = dual;
    }

    task.mono_output = keep_output_inside_dir(task.mono_output.clone(), &request.output_dir);
    task.dual_output = keep_output_inside_dir(task.dual_output.clone(), &request.output_dir);
}

fn has_translation_outputs(task: &TranslationTask) -> bool {
    task.mono_output.is_some() || task.dual_output.is_some()
}

fn to_progress(event: &Value) -> Option<f32> {
    if let Some(overall) = event.get("overall_progress").and_then(|v| v.as_f64()) {
        return Some(overall.clamp(0.0, 100.0) as f32);
    }

    event
        .get("stage_progress")
        .and_then(|v| v.as_f64())
        .map(|stage| 5.0 + (stage.clamp(0.0, 100.0) as f32) * 0.9)
}

fn to_message(event: &Value) -> String {
    event
        .get("stage")
        .and_then(|v| v.as_str())
        .or_else(|| event.get("error").and_then(|v| v.as_str()))
        .unwrap_or("Processing")
        .to_string()
}

async fn install_dependencies(app: &AppHandle, python: &Path) -> Result<(), String> {
    let attempts = vec![
        (
            "PyPI",
            vec![
                "-m".to_string(),
                "pip".to_string(),
                "install".to_string(),
                "-U".to_string(),
                "pdf2zh-next".to_string(),
                "babeldoc".to_string(),
                "idna".to_string(),
            ],
        ),
        (
            "Tsinghua mirror",
            vec![
                "-m".to_string(),
                "pip".to_string(),
                "install".to_string(),
                "-U".to_string(),
                "pdf2zh-next".to_string(),
                "babeldoc".to_string(),
                "idna".to_string(),
                "-i".to_string(),
                "https://pypi.tuna.tsinghua.edu.cn/simple".to_string(),
                "--trusted-host".to_string(),
                "pypi.tuna.tsinghua.edu.cn".to_string(),
            ],
        ),
    ];

    let mut errors = Vec::new();
    for (label, args) in attempts {
        emit_env_log(
            app,
            &format!("Installing translator dependencies via {label}..."),
        );

        let mut cmd = background_tokio_command(python);
        apply_runtime_env(&mut cmd)?;
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start pip install: {e}"))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        if let Some(stdout) = stdout {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    emit_env_log(&app, &line);
                }
            });
        }

        if let Some(stderr) = stderr {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    emit_env_log(&app, &line);
                }
            });
        }

        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed waiting for pip install: {e}"))?;
        if status.success() {
            return Ok(());
        }
        errors.push(format!("{label}: {status}"));
    }

    Err(format!(
        "Failed to install translator dependencies ({}).",
        errors.join(" | ")
    ))
}

async fn setup_runtime(app: &AppHandle, base_python_path: Option<String>) -> Result<(), String> {
    let Some(base_python) = resolve_base_python(base_python_path).await else {
        return Err(
            "Python 3.10+ was not found. Choose a Python interpreter in Settings > System first."
                .to_string(),
        );
    };

    let venv = venv_dir()?;
    if ready_translator_python().await.is_some() {
        emit_env_progress(app, "Translation runtime is ready.", 100);
        return Ok(());
    }

    if venv.exists() {
        fs::remove_dir_all(&venv).map_err(|e| format!("Cannot reset translator venv: {e}"))?;
    }

    let parent = venv
        .parent()
        .ok_or("Translator venv parent directory is missing")?;
    fs::create_dir_all(parent).map_err(|e| format!("Cannot prepare translator venv dir: {e}"))?;

    emit_env_progress(app, "Creating translator virtual environment...", 20);
    let mut venv_cmd = background_tokio_command(&base_python);
    venv_cmd.arg("-m").arg("venv").arg(&venv);
    if cfg!(target_os = "windows") {
        venv_cmd.arg("--copies");
    }
    let status = venv_cmd
        .status()
        .await
        .map_err(|e| format!("Failed to create translator venv: {e}"))?;
    if !status.success() {
        return Err(format!("Creating translator venv failed: {status}"));
    }

    emit_env_progress(app, "Installing translation dependencies...", 70);
    let venv_python = venv_python_path()?;
    install_dependencies(app, &venv_python).await?;

    if ready_translator_python().await.is_none() {
        return Err(
            "Translator environment was created, but required modules are still missing."
                .to_string(),
        );
    }

    emit_env_progress(app, "Translation runtime is ready.", 100);
    Ok(())
}

async fn warmup_runtime(app: &AppHandle) -> Result<(), String> {
    let Some(python) = ready_translator_python().await else {
        return Err(
            "Translation runtime is not ready. Open Settings > PDF Translation and prepare the environment first."
                .to_string(),
        );
    };

    emit_env_progress(app, "Warming up translation runtime...", 5);
    emit_env_log(app, "Running babeldoc warmup...");

    let mut cmd = background_tokio_command(&python);
    apply_runtime_env(&mut cmd)?;
    cmd.arg("-m")
        .arg("babeldoc.main")
        .arg("--warmup")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start translator warmup: {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                emit_env_log(&app, &line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                emit_env_log(&app, &line);
            }
        });
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed while waiting for translator warmup: {e}"))?;

    if !status.success() {
        return Err(format!("Translator warmup failed: {status}"));
    }

    emit_env_progress(app, "Translation runtime is warmed up.", 100);
    Ok(())
}

async fn run_translation_task(
    app: AppHandle,
    state: PdfTranslateState,
    task_id: String,
    request: TranslationRequest,
) {
    let Some(task) = update_task(&state, &task_id, |task| {
        task.status = "running".to_string();
        task.message = "Starting translation process".to_string();
        task.progress = 1.0;
    }) else {
        return;
    };
    emit_task(&app, &task_id, task, None, None);

    let Some(script_path) = resolve_script_path(&app) else {
        if let Some(task) = update_task(&state, &task_id, |task| {
            task.status = "failed".to_string();
            task.message = "translate_stream.py was not found in app resources or the development scripts directory.".to_string();
        }) {
            emit_task(&app, &task_id, task, None, None);
        }
        return;
    };

    let _ = fs::create_dir_all(&request.output_dir);

    let python = match ready_translator_python().await {
        Some(path) => path,
        None => {
            if let Some(task) = update_task(&state, &task_id, |task| {
                task.status = "failed".to_string();
                task.message = "Translation runtime is not ready. Open Settings > PDF Translation and prepare the environment first.".to_string();
            }) {
                emit_task(&app, &task_id, task, None, None);
            }
            return;
        }
    };

    let mut cmd = background_tokio_command(&python);
    if let Err(error) = apply_runtime_env(&mut cmd) {
        if let Some(task) = update_task(&state, &task_id, |task| {
            task.status = "failed".to_string();
            task.message = format!("Failed to prepare runtime environment: {error}");
        }) {
            emit_task(&app, &task_id, task, None, None);
        }
        return;
    }

    cmd.arg(&script_path)
        .arg("--input")
        .arg(&request.input_path)
        .arg("--output")
        .arg(&request.output_dir)
        .arg("--lang-in")
        .arg(&request.lang_in)
        .arg("--lang-out")
        .arg(&request.lang_out)
        .arg("--engine")
        .arg(&request.engine)
        .arg("--mode")
        .arg(&request.mode)
        .arg("--qps")
        .arg(request.qps.unwrap_or(DEFAULT_QPS).max(1).to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(pool_max_workers) = request.pool_max_workers.filter(|value| *value > 0) {
        cmd.arg("--pool-max-workers")
            .arg(pool_max_workers.to_string());
    }
    if let Some(auto_map_pool_max_workers) = request.auto_map_pool_max_workers {
        cmd.arg("--auto-map-pool-max-workers")
            .arg(auto_map_pool_max_workers.to_string());
    }

    if let Some(api_key) = request.api_key.as_ref().filter(|v| !v.trim().is_empty()) {
        cmd.arg("--api-key").arg(api_key.trim());
    }
    if let Some(model) = request.model.as_ref().filter(|v| !v.trim().is_empty()) {
        cmd.arg("--model").arg(model.trim());
    }
    if let Some(base_url) = request.base_url.as_ref().filter(|v| !v.trim().is_empty()) {
        cmd.arg("--base-url").arg(base_url.trim());
    }
    if let Some(primary_font_family) = request
        .primary_font_family
        .as_ref()
        .filter(|v| !v.trim().is_empty())
    {
        cmd.arg("--primary-font-family")
            .arg(primary_font_family.trim());
    }
    if let Some(use_alternating_pages_dual) = request.use_alternating_pages_dual {
        cmd.arg("--use-alternating-pages-dual")
            .arg(use_alternating_pages_dual.to_string());
    }
    if let Some(ocr_workaround) = request.ocr_workaround {
        cmd.arg("--ocr-workaround").arg(ocr_workaround.to_string());
    }
    if let Some(auto_enable_ocr_workaround) = request.auto_enable_ocr_workaround {
        cmd.arg("--auto-enable-ocr-workaround")
            .arg(auto_enable_ocr_workaround.to_string());
    }
    if let Some(no_watermark_mode) = request.no_watermark_mode {
        cmd.arg("--no-watermark-mode")
            .arg(no_watermark_mode.to_string());
    }
    if let Some(save_auto_extracted_glossary) = request.save_auto_extracted_glossary {
        cmd.arg("--save-auto-extracted-glossary")
            .arg(save_auto_extracted_glossary.to_string());
    }
    if let Some(no_auto_extract_glossary) = request.no_auto_extract_glossary {
        cmd.arg("--no-auto-extract-glossary")
            .arg(no_auto_extract_glossary.to_string());
    }
    if let Some(enhance_compatibility) = request.enhance_compatibility {
        cmd.arg("--enhance-compatibility")
            .arg(enhance_compatibility.to_string());
    }
    if let Some(translate_table_text) = request.translate_table_text {
        cmd.arg("--translate-table-text")
            .arg(translate_table_text.to_string());
    }
    if let Some(only_include_translated_page) = request.only_include_translated_page {
        cmd.arg("--only-include-translated-page")
            .arg(only_include_translated_page.to_string());
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => {
            if let Some(task) = update_task(&state, &task_id, |task| {
                task.status = "failed".to_string();
                task.message = format!("Failed to start translation: {err}");
            }) {
                emit_task(&app, &task_id, task, None, None);
            }
            return;
        }
    };

    if let Some(pid) = child.id() {
        if let Ok(mut guard) = state.child_pids.lock() {
            guard.insert(task_id.clone(), pid);
        }
    }

    let stderr_task_id = task_id.clone();
    let stderr_state = state.clone();
    let stderr_app = app.clone();
    if let Some(stderr) = child.stderr.take() {
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(task) = update_task(&stderr_state, &stderr_task_id, |task| {
                    if task.status == "running" {
                        task.message = line.clone();
                    }
                }) {
                    emit_task(&stderr_app, &stderr_task_id, task, None, Some(line));
                }
            }
        });
    }

    let mut completed = false;
    if let Some(stdout) = child.stdout.take() {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                let event_type = event
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                if let Some(task) = update_task(&state, &task_id, |task| match event_type {
                    "progress_start" | "progress_update" | "progress_end" => {
                        if let Some(progress) = to_progress(&event) {
                            task.progress = task.progress.max(progress);
                        }
                        task.message = to_message(&event);
                        task.status = "running".to_string();
                    }
                    "error" => {
                        task.status = "failed".to_string();
                        task.progress = task.progress.max(1.0);
                        task.message = to_message(&event);
                    }
                    "finish" => {
                        task.status = "completed".to_string();
                        task.progress = 100.0;
                        task.message = "Translation completed".to_string();

                        if let Some(result) = event.get("translate_result") {
                            task.mono_output = result
                                .get("mono_pdf_path")
                                .and_then(|v| v.as_str())
                                .map(|v| v.to_string())
                                .or_else(|| {
                                    result
                                        .get("no_watermark_mono_pdf_path")
                                        .and_then(|v| v.as_str())
                                        .map(|v| v.to_string())
                                });

                            task.dual_output = result
                                .get("dual_pdf_path")
                                .and_then(|v| v.as_str())
                                .map(|v| v.to_string())
                                .or_else(|| {
                                    result
                                        .get("no_watermark_dual_pdf_path")
                                        .and_then(|v| v.as_str())
                                        .map(|v| v.to_string())
                                });
                        }

                        resolve_task_outputs(task, &request);
                    }
                    _ => {}
                }) {
                    if event_type == "finish" {
                        completed = true;
                    }
                    emit_task(&app, &task_id, task, Some(event), Some(line));
                }
            } else if let Some(task) = update_task(&state, &task_id, |task| {
                if task.status == "running" {
                    task.message = line.clone();
                }
            }) {
                emit_task(&app, &task_id, task, None, Some(line));
            }
        }
    }

    let wait_result = child.wait().await;
    if let Ok(mut guard) = state.child_pids.lock() {
        guard.remove(&task_id);
    }

    if completed {
        return;
    }

    match wait_result {
        Ok(status) if status.success() => {
            if let Some(task) = update_task(&state, &task_id, |task| {
                if task.status == "running" {
                    resolve_task_outputs(task, &request);
                    if has_translation_outputs(task) {
                        task.status = "completed".to_string();
                        task.progress = 100.0;
                        task.message = "Translation completed".to_string();
                    } else {
                        task.status = "failed".to_string();
                        task.progress = task.progress.max(1.0);
                        task.message =
                            "Translation process finished, but no output PDF was detected."
                                .to_string();
                    }
                }
            }) {
                emit_task(&app, &task_id, task, None, None);
            }
        }
        Ok(status) => {
            if let Some(task) = update_task(&state, &task_id, |task| {
                if task.status == "running" {
                    task.status = "failed".to_string();
                    task.message = format!("Translation process exited with status {status}");
                }
            }) {
                emit_task(&app, &task_id, task, None, None);
            }
        }
        Err(err) => {
            if let Some(task) = update_task(&state, &task_id, |task| {
                if task.status == "running" {
                    task.status = "failed".to_string();
                    task.message = format!("Failed while waiting for translation process: {err}");
                }
            }) {
                emit_task(&app, &task_id, task, None, None);
            }
        }
    }
}

#[tauri::command]
pub fn pdf_translate_list_tasks(
    state: State<'_, PdfTranslateState>,
) -> Result<Vec<TranslationTask>, String> {
    let guard = state
        .tasks
        .lock()
        .map_err(|_| "Translation task state is locked".to_string())?;

    let mut tasks: Vec<TranslationTask> = guard.values().cloned().collect();
    tasks.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(tasks)
}

#[tauri::command]
pub async fn pdf_translate_check_env_status(
    base_python_path: Option<String>,
) -> Result<EnvStatus, String> {
    if ready_translator_python().await.is_some() {
        return Ok(EnvStatus::Ready);
    }

    if resolve_base_python(base_python_path).await.is_none() {
        return Ok(EnvStatus::PythonMissing);
    }

    Ok(EnvStatus::NotInitialized)
}

#[tauri::command]
pub async fn pdf_translate_setup_env(
    app: AppHandle,
    base_python_path: Option<String>,
) -> Result<EnvStatus, String> {
    emit_env_progress(&app, "Checking Python environment...", 5);
    match setup_runtime(&app, base_python_path).await {
        Ok(()) => Ok(EnvStatus::Ready),
        Err(error) => {
            emit_env_log(&app, &error);
            Ok(EnvStatus::Error(error))
        }
    }
}

#[tauri::command]
pub async fn pdf_translate_warmup_env(app: AppHandle) -> Result<EnvStatus, String> {
    match warmup_runtime(&app).await {
        Ok(()) => Ok(EnvStatus::Ready),
        Err(error) => {
            emit_env_log(&app, &error);
            Ok(EnvStatus::Error(error))
        }
    }
}

#[tauri::command]
pub fn pdf_translate_start(
    app: AppHandle,
    state: State<'_, PdfTranslateState>,
    request: TranslationRequest,
) -> Result<TranslationTask, String> {
    let task_id = Uuid::new_v4().to_string();
    let now = now_iso();

    let task = TranslationTask {
        id: task_id.clone(),
        input_path: request.input_path.clone(),
        status: "queued".to_string(),
        progress: 0.0,
        message: "Task created".to_string(),
        mono_output: None,
        dual_output: None,
        started_at: now.clone(),
        updated_at: now,
    };

    {
        let mut guard = state
            .tasks
            .lock()
            .map_err(|_| "Translation task state is locked".to_string())?;
        guard.insert(task_id.clone(), task.clone());
    }

    let local_state = state.inner().clone();
    let local_app = app.clone();
    tauri::async_runtime::spawn(async move {
        run_translation_task(local_app, local_state, task_id, request).await;
    });

    Ok(task)
}

#[tauri::command]
pub async fn pdf_translate_cancel(
    app: AppHandle,
    state: State<'_, PdfTranslateState>,
    task_id: String,
) -> Result<bool, String> {
    let pid = {
        let mut guard = state
            .child_pids
            .lock()
            .map_err(|_| "Translation process state is locked".to_string())?;
        guard.remove(&task_id)
    };

    let Some(pid) = pid else {
        return Ok(false);
    };

    #[cfg(target_os = "windows")]
    let status = background_tokio_command("taskkill")
        .arg("/PID")
        .arg(pid.to_string())
        .arg("/F")
        .arg("/T")
        .status()
        .await
        .map_err(|e| format!("Failed to cancel translation task: {e}"))?;

    #[cfg(not(target_os = "windows"))]
    let status = background_tokio_command("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .status()
        .await
        .map_err(|e| format!("Failed to cancel translation task: {e}"))?;

    if let Some(task) = update_task(state.inner(), &task_id, |task| {
        task.status = "canceled".to_string();
        task.message = "Canceled by user".to_string();
    }) {
        emit_task(&app, &task_id, task, None, None);
    }

    Ok(status.success())
}
