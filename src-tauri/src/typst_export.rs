use futures_util::StreamExt;
use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};
use url::Url;
use uuid::Uuid;

use crate::app_dirs;
use crate::process_utils::background_command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportError {
    pub line: Option<u32>,
    pub message: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
    pub pdf_path: Option<String>,
    pub errors: Vec<ExportError>,
    pub warnings: Vec<ExportError>,
    pub duration_ms: u64,
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

/// PDF export settings passed from frontend
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PdfSettings {
    pub template: Option<String>, // "clean", "academic", "report", "letter", "compact"
    pub font: Option<String>,     // font family name
    pub font_size: Option<f32>,   // in pt
    pub page_size: Option<String>, // "a4", "us-letter", "a5"
    pub margins: Option<String>,  // "normal", "narrow", "wide"
    pub spacing: Option<String>,  // "compact", "normal", "relaxed"
    pub bib_style: Option<String>, // "apa", "chicago", "ieee", "harvard", "vancouver"
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

/// Convert markdown to Typst markup using pulldown-cmark.
fn markdown_to_typst(markdown: &str, image_overrides: &HashMap<String, String>) -> String {
    // Pre-process: convert Pandoc citations BEFORE parsing, because pulldown-cmark
    // consumes the [] brackets and the citation pattern is lost.
    let preprocessed = preprocess_citations(markdown);

    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_FOOTNOTES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_MATH);

    let parser = Parser::new_ext(&preprocessed, opts);
    let mut output = String::new();
    let mut list_stack: Vec<Option<u64>> = Vec::new(); // None = unordered, Some(n) = ordered
    #[allow(unused_assignments)]
    let mut table_cols: usize = 0;
    let mut _table_header = false;
    let mut _table_cell_count: usize = 0;
    let mut in_code_block = false;
    let mut code_lang = String::new();
    let mut code_buf = String::new();

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Heading { level, .. } => {
                    let marker = match level {
                        HeadingLevel::H1 => "= ",
                        HeadingLevel::H2 => "== ",
                        HeadingLevel::H3 => "=== ",
                        HeadingLevel::H4 => "==== ",
                        HeadingLevel::H5 => "===== ",
                        HeadingLevel::H6 => "====== ",
                    };
                    output.push_str(marker);
                }
                Tag::Paragraph => {
                    // Start new paragraph (blank line before, unless at start)
                    if !output.is_empty() && !output.ends_with('\n') {
                        output.push('\n');
                    }
                }
                Tag::BlockQuote(_) => {
                    output.push_str("#quote[\n");
                }
                Tag::CodeBlock(kind) => {
                    in_code_block = true;
                    code_buf.clear();
                    code_lang = match kind {
                        CodeBlockKind::Fenced(lang) => {
                            let s = lang.to_string();
                            // Handle Rmd/Quarto chunk syntax: ```{r, options} → r
                            if s.starts_with('{') {
                                s.trim_start_matches('{')
                                    .trim_end_matches('}')
                                    .split(',')
                                    .next()
                                    .unwrap_or("")
                                    .trim()
                                    .to_string()
                            } else {
                                s
                            }
                        }
                        CodeBlockKind::Indented => String::new(),
                    };
                }
                Tag::List(start) => {
                    list_stack.push(start);
                }
                Tag::Item => {
                    let indent = "  ".repeat(list_stack.len().saturating_sub(1));
                    match list_stack.last() {
                        Some(Some(n)) => {
                            output.push_str(&format!("{}{}. ", indent, n));
                            // Increment counter
                            if let Some(Some(ref mut n)) = list_stack.last_mut() {
                                *n += 1;
                            }
                        }
                        _ => {
                            output.push_str(&format!("{}- ", indent));
                        }
                    }
                }
                Tag::Emphasis => {
                    output.push_str("#emph[");
                }
                Tag::Strong => {
                    output.push_str("#strong[");
                }
                Tag::Strikethrough => {
                    output.push_str("#strike[");
                }
                Tag::Link {
                    dest_url, title: _, ..
                } => {
                    // We'll collect link text, then close with URL
                    output.push_str(&format!("#link(\"{}\")[", escape_typst_string(&dest_url)));
                }
                Tag::Image {
                    dest_url, title: _, ..
                } => {
                    let resolved_url = image_overrides
                        .get(dest_url.as_ref())
                        .map(String::as_str)
                        .unwrap_or(dest_url.as_ref());
                    output.push_str(&format!(
                        "#image(\"{}\")",
                        escape_typst_string(resolved_url)
                    ));
                }
                Tag::Table(alignments) => {
                    table_cols = alignments.len();
                    let cols = alignments
                        .iter()
                        .map(|a| match a {
                            pulldown_cmark::Alignment::Left => "left",
                            pulldown_cmark::Alignment::Center => "center",
                            pulldown_cmark::Alignment::Right => "right",
                            pulldown_cmark::Alignment::None => "auto",
                        })
                        .collect::<Vec<_>>()
                        .join(", ");
                    output.push_str(&format!(
                        "#table(\n  columns: ({}),\n",
                        "1fr, ".repeat(table_cols).trim_end_matches(", ")
                    ));
                    output.push_str(&format!("  align: ({}),\n", cols));
                }
                Tag::TableHead => {
                    _table_header = true;
                    _table_cell_count = 0;
                }
                Tag::TableRow => {
                    _table_cell_count = 0;
                }
                Tag::TableCell => {
                    output.push_str("  [");
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Heading(_) => {
                    output.push('\n');
                }
                TagEnd::Paragraph => {
                    output.push_str("\n\n");
                }
                TagEnd::BlockQuote(_) => {
                    output.push_str("]\n\n");
                }
                TagEnd::CodeBlock => {
                    in_code_block = false;
                    output.push_str(&render_typst_raw_block(&code_lang, code_buf.trim_end()));
                    output.push_str("\n\n");
                }
                TagEnd::List(_) => {
                    list_stack.pop();
                    if list_stack.is_empty() {
                        output.push('\n');
                    }
                }
                TagEnd::Item => {
                    if !output.ends_with('\n') {
                        output.push('\n');
                    }
                }
                TagEnd::Emphasis => {
                    output.push(']');
                }
                TagEnd::Strong => {
                    output.push(']');
                }
                TagEnd::Strikethrough => {
                    output.push(']');
                }
                TagEnd::Link => {
                    output.push(']');
                }
                TagEnd::Image => {}
                TagEnd::Table => {
                    output.push_str(")\n\n");
                }
                TagEnd::TableHead => {
                    _table_header = false;
                }
                TagEnd::TableRow => {}
                TagEnd::TableCell => {
                    _table_cell_count += 1;
                    output.push_str("],\n");
                }
                _ => {}
            },
            Event::Text(text) => {
                if in_code_block {
                    code_buf.push_str(&text);
                } else {
                    output.push_str(&escape_typst_markup(&text));
                }
            }
            Event::Code(code) => {
                output.push_str(&render_typst_raw_inline(&code));
            }
            Event::InlineMath(math) => {
                output.push('$');
                output.push_str(&math);
                output.push('$');
            }
            Event::DisplayMath(math) => {
                output.push_str("$ ");
                output.push_str(&math);
                output.push_str(" $\n");
            }
            Event::Html(html) => {
                // Block comment safely contains multi-line HTML
                output.push_str(&format!("/* HTML: {} */\n", html.trim()));
            }
            Event::SoftBreak => {
                output.push('\n');
            }
            Event::HardBreak => {
                output.push_str(" \\\n");
            }
            Event::Rule => {
                output.push_str("#line(length: 100%)\n\n");
            }
            Event::FootnoteReference(name) => {
                output.push_str(&format!("#footnote[{}]", name));
            }
            Event::TaskListMarker(checked) => {
                if checked {
                    output.push_str("[x] ");
                } else {
                    output.push_str("[ ] ");
                }
            }
            _ => {}
        }
    }

    // Restore citation placeholders: \x01 → @ (see preprocess_citations)
    output.replace('\x01', "@")
}

/// Pre-process raw markdown to convert Pandoc citations to Typst citations
/// BEFORE pulldown-cmark parses it (the parser eats the brackets).
/// `[@key]` → `@key`, `[@k1; @k2]` → `@k1 @k2`
/// Skips fenced code blocks and inline code.
fn preprocess_citations(markdown: &str) -> String {
    let mut result = String::with_capacity(markdown.len());
    let mut in_code_fence = false;

    for line in markdown.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code_fence = !in_code_fence;
            result.push_str(line);
            result.push('\n');
            continue;
        }
        if in_code_fence {
            result.push_str(line);
            result.push('\n');
            continue;
        }

        let chars: Vec<char> = line.chars().collect();
        let mut i = 0;
        while i < chars.len() {
            // Skip inline code
            if chars[i] == '`' {
                result.push('`');
                i += 1;
                while i < chars.len() && chars[i] != '`' {
                    result.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() {
                    result.push('`');
                    i += 1;
                }
                continue;
            }

            if i + 1 < chars.len() && chars[i] == '[' && chars[i + 1] == '@' {
                let start = i;
                i += 1; // skip [
                let mut buf = String::new();
                while i < chars.len() && chars[i] != ']' {
                    buf.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() && chars[i] == ']' {
                    i += 1; // skip ]
                    let mut keys = Vec::new();
                    for part in buf.split(';') {
                        let part = part.trim();
                        if let Some(key) = part.strip_prefix('@') {
                            let key = key.split_whitespace().next().unwrap_or(key);
                            if !key.is_empty() {
                                keys.push(key.to_string());
                            }
                        }
                    }
                    if !keys.is_empty() {
                        for (j, key) in keys.iter().enumerate() {
                            if j > 0 {
                                result.push(' ');
                            }
                            // Use \x01 placeholder instead of @ so that
                            // escape_typst_markup can safely escape all other @
                            // signs without breaking intentional citations.
                            // Restored to @ at the end of markdown_to_typst().
                            result.push('\x01');
                            result.push_str(key);
                        }
                    } else {
                        for c in &chars[start..i] {
                            result.push(*c);
                        }
                    }
                } else {
                    for c in &chars[start..chars.len()] {
                        result.push(*c);
                    }
                    break;
                }
            } else {
                result.push(chars[i]);
                i += 1;
            }
        }
        result.push('\n');
    }

    // Preserve original trailing newline state
    if result.ends_with('\n') && !markdown.ends_with('\n') {
        result.pop();
    }

    result
}

fn escape_typst_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Escape all characters that have special meaning in Typst markup mode.
/// Applied to plain text content from pulldown-cmark — NOT code blocks, NOT string literals.
/// The \x01 placeholder (used for intentional citations) is left untouched.
fn escape_typst_markup(text: &str) -> String {
    let mut result = String::with_capacity(text.len() + text.len() / 8);
    for ch in text.chars() {
        match ch {
            '\\' => result.push_str("\\\\"),
            '#' => result.push_str("\\#"),
            '$' => result.push_str("\\$"),
            '@' => result.push_str("\\@"),
            '~' => result.push_str("\\~"),
            '*' => result.push_str("\\*"),
            '_' => result.push_str("\\_"),
            '`' => result.push_str("\\`"),
            '[' => result.push_str("\\["),
            ']' => result.push_str("\\]"),
            '{' => result.push_str("\\{"),
            '}' => result.push_str("\\}"),
            '<' => result.push_str("\\<"),
            '>' => result.push_str("\\>"),
            _ => result.push(ch),
        }
    }
    result
}

fn escape_typst_raw_string(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len() + s.len() / 8);

    for ch in s.chars() {
        match ch {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            _ => escaped.push(ch),
        }
    }

    escaped
}

fn render_typst_raw_inline(code: &str) -> String {
    format!("#raw(\"{}\")", escape_typst_raw_string(code))
}

fn render_typst_raw_block(lang: &str, code: &str) -> String {
    if lang.is_empty() {
        format!("#raw(\"{}\", block: true)", escape_typst_raw_string(code))
    } else {
        format!(
            "#raw(\"{}\", block: true, lang: \"{}\")",
            escape_typst_raw_string(code),
            escape_typst_string(lang)
        )
    }
}

fn is_remote_http_url(value: &str) -> bool {
    matches!(
        Url::parse(value).ok().map(|url| url.scheme().to_string()),
        Some(scheme) if scheme == "http" || scheme == "https"
    )
}

fn infer_image_extension(url: &str, content_type: Option<&str>) -> &'static str {
    if let Ok(parsed) = Url::parse(url) {
        if let Some(ext) = Path::new(parsed.path())
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
        {
            match ext.as_str() {
                "png" => return "png",
                "jpg" | "jpeg" => return "jpg",
                "svg" => return "svg",
                "gif" => return "gif",
                "webp" => return "webp",
                "bmp" => return "bmp",
                "ico" => return "ico",
                "avif" => return "avif",
                _ => {}
            }
        }
    }

    match content_type
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
    {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/svg+xml" => "svg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        "image/avif" => "avif",
        _ => "img",
    }
}

fn collect_remote_image_urls(markdown: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut urls = Vec::new();

    for event in Parser::new_ext(markdown, Options::empty()) {
        if let Event::Start(Tag::Image { dest_url, .. }) = event {
            let url = dest_url.to_string();
            if is_remote_http_url(&url) && seen.insert(url.clone()) {
                urls.push(url);
            }
        }
    }

    urls
}

async fn materialize_remote_images(
    markdown: &str,
) -> Result<(HashMap<String, String>, Option<PathBuf>), String> {
    let remote_urls = collect_remote_image_urls(markdown);
    if remote_urls.is_empty() {
        return Ok((HashMap::new(), None));
    }

    let asset_dir = std::env::temp_dir().join(format!("altals-typst-assets-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&asset_dir)
        .map_err(|e| format!("Failed to create temporary image directory: {}", e))?;

    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Failed to create image download client: {}", e))?;

    let mut overrides = HashMap::new();

    for (index, remote_url) in remote_urls.iter().enumerate() {
        let response = match client.get(remote_url).send().await {
            Ok(response) => response,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&asset_dir);
                return Err(format!(
                    "Failed to download remote image {}: {}",
                    remote_url, error
                ));
            }
        };

        if !response.status().is_success() {
            let _ = std::fs::remove_dir_all(&asset_dir);
            return Err(format!(
                "Failed to download remote image {}: HTTP {}",
                remote_url,
                response.status()
            ));
        }

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);

        let bytes = match response.bytes().await {
            Ok(bytes) => bytes,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&asset_dir);
                return Err(format!(
                    "Failed to read remote image {}: {}",
                    remote_url, error
                ));
            }
        };

        let extension = infer_image_extension(remote_url, content_type.as_deref());
        let image_path = asset_dir.join(format!("image-{}.{}", index + 1, extension));
        if let Err(error) = std::fs::write(&image_path, &bytes) {
            let _ = std::fs::remove_dir_all(&asset_dir);
            return Err(format!(
                "Failed to store remote image {}: {}",
                remote_url, error
            ));
        }

        overrides.insert(remote_url.clone(), image_path.to_string_lossy().to_string());
    }

    Ok((overrides, Some(asset_dir)))
}

/// Wrap converted content in a Typst template.
fn wrap_in_template(content: &str, bib_path: Option<&str>, settings: &PdfSettings) -> String {
    let template = settings.template.as_deref().unwrap_or("clean");
    let font = escape_typst_string(settings.font.as_deref().unwrap_or("STIX Two Text"));
    let font_size = settings.font_size.unwrap_or(11.0);
    let page_size = settings.page_size.as_deref().unwrap_or("a4");
    let margins = settings.margins.as_deref().unwrap_or("normal");
    let spacing = settings.spacing.as_deref().unwrap_or("normal");

    let page_setting = match page_size {
        "us-letter" => "\"us-letter\"",
        "a5" => "\"a5\"",
        _ => "\"a4\"",
    };
    let margin_setting = match margins {
        "narrow" => "(x: 1.5cm, y: 1.5cm)",
        "wide" => "(x: 3.5cm, y: 3.5cm)",
        _ => "(x: 2.5cm, y: 2.5cm)", // normal
    };

    let mut doc = String::new();

    match template {
        "academic" => {
            doc.push_str(&format!(
                r#"#set page(paper: {page_setting}, margin: {margin_setting})
#set text(font: "{font}", size: {font_size}pt)
#set par(justify: true, leading: 0.55em, first-line-indent: 1em)
#set heading(numbering: "1.1  ")
#show heading.where(level: 1): it => {{ v(1em); text(size: 1.3em, weight: "bold", it); v(0.5em) }}
#show heading.where(level: 2): it => {{ v(0.8em); text(size: 1.1em, weight: "bold", it); v(0.4em) }}

"#
            ));
        }
        "report" => {
            doc.push_str(&format!(
r#"#set page(paper: {page_setting}, margin: {margin_setting}, numbering: "1")
#set text(font: "{font}", size: {font_size}pt)
#set par(justify: true, leading: 0.65em)
#set heading(numbering: "1.1  ")
#show heading.where(level: 1): it => {{ pagebreak(weak: true); v(2em); text(size: 1.5em, weight: "bold", it); v(1em) }}

"#));
        }
        "letter" => {
            doc.push_str(&format!(
                r#"#set page(paper: {page_setting}, margin: (x: 2.5cm, top: 2.5cm, bottom: 2cm))
#set text(font: "{font}", size: {font_size}pt)
#set par(justify: false, leading: 0.65em)
#set heading(numbering: none)

"#
            ));
        }
        "compact" => {
            doc.push_str(&format!(
                r#"#set page(paper: {page_setting}, margin: (x: 1.5cm, y: 1.5cm), columns: 2)
#set text(font: "{font}", size: 9pt)
#set par(justify: true, leading: 0.5em)
#set heading(numbering: none)
#show heading.where(level: 1): it => {{ text(size: 1.2em, weight: "bold", it); v(0.3em) }}

"#
            ));
        }
        _ => {
            // "clean" — the default
            doc.push_str(&format!(
                r#"#set page(paper: {page_setting}, margin: {margin_setting})
#set text(font: "{font}", size: {font_size}pt)
#set par(justify: true, leading: 0.65em)
#set heading(numbering: none)

"#
            ));
        }
    }

    // Paragraph spacing — par(spacing) controls gap between paragraphs
    let spacing_val = match spacing {
        "compact" => "0.8em",
        "relaxed" => "2.4em",
        _ => "1.8em", // normal
    };
    doc.push_str(&format!("#set par(spacing: {})\n\n", spacing_val));

    if bib_path.is_some() {
        let style = match settings.bib_style.as_deref().unwrap_or("apa") {
            "chicago" => "chicago-author-date",
            "ieee" => "ieee",
            "harvard" => "elsevier-harvard",
            "vancouver" => "vancouver",
            other => other, // "apa" or custom CSL path
        };
        doc.push_str(&format!(
            "#set bibliography(style: \"{}\")\n\n",
            escape_typst_string(style)
        ));
    }

    doc.push_str(content);

    if let Some(bib) = bib_path {
        doc.push_str(&format!("\n\n#bibliography(\"{}\")\n", bib));
    }

    doc
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
    output: std::process::Output,
    pdf_path: &Path,
    duration_ms: u64,
) -> TypstCompileResult {
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
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

    if output.status.success() {
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

fn run_typst_compile(
    typst_bin: &str,
    source_path: &Path,
    pdf_path: &Path,
    app: &tauri::AppHandle,
) -> Result<TypstCompileResult, String> {
    let start = std::time::Instant::now();
    let mut cmd = background_command(typst_bin);
    cmd.arg("compile");
    if let Some(font_dir) = find_font_dir(app) {
        cmd.args(["--font-path", &font_dir]);
    }
    cmd.arg(source_path);
    cmd.arg(pdf_path);
    cmd.current_dir(source_path.parent().unwrap_or(Path::new(".")));
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run typst: {}", e))?;

    Ok(build_typst_result(
        output,
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
pub async fn export_md_to_pdf(
    md_path: String,
    bib_path: Option<String>,
    settings: Option<PdfSettings>,
    app: tauri::AppHandle,
    custom_typst_path: Option<String>,
) -> Result<ExportResult, String> {
    let settings = settings.unwrap_or_default();
    let typst_bin = find_typst(&app, custom_typst_path.as_deref()).ok_or_else(typst_not_found_message)?;

    // Read markdown file
    let md_content = std::fs::read_to_string(&md_path)
        .map_err(|e| format!("Failed to read {}: {}", md_path, e))?;

    // Download remote markdown images so Typst receives local file paths.
    let (image_overrides, temp_asset_dir) = materialize_remote_images(&md_content).await?;

    // Convert to Typst
    let typst_content = markdown_to_typst(&md_content, &image_overrides);

    // Only include bibliography if the document actually cites references
    // and the bib file has real entries
    let doc_has_citations = md_content.contains("[@");
    let effective_bib: Option<String> = if !doc_has_citations {
        None
    } else {
        bib_path.as_deref().and_then(|bp| {
            if let Ok(content) = std::fs::read_to_string(bp) {
                // Skip if the file is empty or only has comments
                let has_entries = content.lines().any(|l| l.trim_start().starts_with('@'));
                if has_entries {
                    // Use just the filename — Typst resolves relative to cwd (the .md dir)
                    let filename = Path::new(bp).file_name()?.to_string_lossy().to_string();
                    return Some(filename);
                }
            }
            None
        })
    };
    let full_doc = wrap_in_template(&typst_content, effective_bib.as_deref(), &settings);

    // Write temporary .typ file next to .md
    let md_pathbuf = std::path::PathBuf::from(&md_path);
    let typ_path = md_pathbuf.with_extension("typ");
    let pdf_path = md_pathbuf.with_extension("pdf");

    std::fs::write(&typ_path, &full_doc).map_err(|e| format!("Failed to write .typ: {}", e))?;

    // If bib_path provided, copy it next to .typ for Typst to find
    // (Typst resolves bibliography paths relative to the .typ file)

    let compile_result = run_typst_compile(&typst_bin, &typ_path, &pdf_path, &app)?;

    // Clean up temporary files
    let _ = std::fs::remove_file(&typ_path);
    if let Some(asset_dir) = temp_asset_dir {
        let _ = std::fs::remove_dir_all(asset_dir);
    }

    if compile_result.success {
        Ok(ExportResult {
            success: true,
            pdf_path: compile_result.pdf_path,
            errors: vec![],
            warnings: compile_result.warnings,
            duration_ms: compile_result.duration_ms,
        })
    } else {
        Ok(ExportResult {
            success: false,
            pdf_path: None,
            errors: compile_result.errors,
            warnings: compile_result.warnings,
            duration_ms: compile_result.duration_ms,
        })
    }
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
    let typst_bin = find_typst(&app, custom_typst_path.as_deref()).ok_or_else(typst_not_found_message)?;
    let typ_pathbuf = PathBuf::from(&typ_path);
    if !typ_pathbuf.exists() {
        return Err(format!("Typst file not found: {}", typ_path));
    }
    let pdf_path = typ_pathbuf.with_extension("pdf");
    run_typst_compile(&typst_bin, &typ_pathbuf, &pdf_path, &app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::ffi::OsStr;
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::thread;
    use uuid::Uuid;

    fn typst_from_markdown(markdown: &str) -> String {
        wrap_in_template(
            &markdown_to_typst(markdown, &HashMap::new()),
            None,
            &PdfSettings::default(),
        )
    }

    fn compile_typst(markdown: &str) -> Result<(), String> {
        let temp_dir = std::env::temp_dir();
        let stem = format!("altals-typst-export-{}", Uuid::new_v4());
        let typ_path: PathBuf = temp_dir.join(format!("{stem}.typ"));
        let pdf_path: PathBuf = temp_dir.join(format!("{stem}.pdf"));
        let doc = typst_from_markdown(markdown);

        std::fs::write(&typ_path, doc).map_err(|e| e.to_string())?;
        let output = std::process::Command::new("typst")
            .arg("compile")
            .arg(&typ_path)
            .arg(&pdf_path)
            .output()
            .map_err(|e| e.to_string())?;

        let _ = std::fs::remove_file(&typ_path);
        let _ = std::fs::remove_file(&pdf_path);

        if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    #[test]
    fn exports_common_markdown_snippets_to_valid_typst() {
        let cases = [
            "# Heading\n\nPlain paragraph with **bold** and _emphasis_.\n",
            "- first\n- second\n- third\n",
            "- [x] done\n- [ ] todo\n",
            "| A | B |\n| - | - |\n| 1 | 2 |\n",
            "| Field | Value |\n| - | - |\n| Example | **layout/** |\n",
            "| File | Role |\n| - | - |\n| `src/editor/codeChunks.js` | Parses ```` ```{r} ```` fences into chunk objects `{ language, headerLine }`. |\n",
            "> quoted text\n>\n> second line\n",
            "Inline math $a+b$ and code `let x = 1`.\n",
            "Inline code with literal backticks: `````{r}``.\n",
            "Typst special chars: `\\`, `#`, `$`, `@`, `~`, `*`, `_`, `` ` ``, `[`, `]`, `{`, `}`, `<`, `>`.\n",
            "$$\na^2 + b^2 = c^2\n$$\n",
            "~~struck~~ text with a [link](https://example.com).\n",
        ];

        for markdown in cases {
            let result = compile_typst(markdown);
            assert!(
                result.is_ok(),
                "failed to compile markdown:\n{}\n---\n{}",
                markdown,
                result.err().unwrap_or_default()
            );
        }
    }

    #[tokio::test]
    async fn downloads_remote_images_before_typst_export() {
        const PNG_BYTES: &[u8] = &[
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
            8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207,
            192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66,
            96, 130,
        ];

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test http server");
        let addr = listener.local_addr().expect("get local addr");

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let mut buf = [0_u8; 1024];
            let _ = stream.read(&mut buf);
            let headers = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                PNG_BYTES.len()
            );
            stream
                .write_all(headers.as_bytes())
                .and_then(|_| stream.write_all(PNG_BYTES))
                .expect("write image response");
        });

        let markdown = format!("![logo](http://{}/pixel.png)\n", addr);
        let (image_overrides, temp_asset_dir) = materialize_remote_images(&markdown)
            .await
            .expect("materialize remote image");

        server.join().expect("join test http server");

        assert_eq!(image_overrides.len(), 1);
        let path = image_overrides
            .values()
            .next()
            .expect("image override path exists");
        assert!(path.ends_with(".png"));
        assert!(Path::new(path).exists());

        if let Some(asset_dir) = temp_asset_dir {
            let _ = std::fs::remove_dir_all(asset_dir);
        }
    }

    fn collect_markdown_files(dir: &std::path::Path, out: &mut Vec<PathBuf>) {
        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let name = name.to_string_lossy();

            if path.is_dir() {
                if matches!(
                    name.as_ref(),
                    ".git" | "node_modules" | "dist" | "target" | ".vite"
                ) {
                    continue;
                }
                collect_markdown_files(&path, out);
                continue;
            }

            let ext = path.extension().and_then(OsStr::to_str).unwrap_or_default();
            if matches!(ext, "md" | "qmd" | "rmd") {
                out.push(path);
            }
        }
    }

    #[test]
    #[ignore = "diagnostic coverage for real workspace markdown files"]
    fn exports_workspace_markdown_files_to_valid_typst() {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let mut files = Vec::new();
        collect_markdown_files(&repo_root, &mut files);

        let mut failures = Vec::new();
        for path in files {
            let markdown = match fs::read_to_string(&path) {
                Ok(content) => content,
                Err(error) => {
                    failures.push(format!("{}: read failed: {}", path.display(), error));
                    continue;
                }
            };

            if let Err(error) = compile_typst(&markdown) {
                failures.push(format!("{}:\n{}", path.display(), error));
            }
        }

        assert!(
            failures.is_empty(),
            "workspace markdown export failures:\n{}",
            failures.join("\n\n---\n\n")
        );
    }
}
