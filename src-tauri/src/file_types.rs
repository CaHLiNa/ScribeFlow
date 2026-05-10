use serde::Serialize;

use crate::path_utils::{basename_path, dirname_path, normalize_path};

const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tif", "tiff", "eps", "ps",
];
const MULTIMODAL_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];
const POSTSCRIPT_TEXT_EXTS: &[&str] = &["eps", "ps"];
const CSV_EXTS: &[&str] = &["csv", "tsv"];
const HTML_EXTS: &[&str] = &["html", "htm"];
const PDF_EXTS: &[&str] = &["pdf"];
const DOCX_EXTS: &[&str] = &["docx"];
const LATEX_EDITOR_EXTS: &[&str] = &["tex", "latex", "cls", "sty"];
const GENERAL_TEXT_EXTS: &[&str] = &[
    "bib", "c", "cpp", "css", "cjs", "go", "h", "java", "jl", "js", "json", "jsx", "kt", "lua",
    "m", "markdown", "md", "mjs", "php", "py", "qmd", "r", "rb", "rmd", "rs", "scss", "sh",
    "sql", "svelte", "toml", "ts", "tsx", "txt", "vue", "xml", "yaml", "yml", "zig", "zsh",
    "bash",
];

fn get_ext(path: &str) -> String {
    let name = basename_path(path);
    match name.rfind('.') {
        Some(i) if i > 0 => name[i + 1..].to_lowercase(),
        _ => String::new(),
    }
}

fn is_supported_text_ext(ext: &str) -> bool {
    GENERAL_TEXT_EXTS.contains(&ext) || LATEX_EDITOR_EXTS.contains(&ext) || is_latex_aux_text_ext(ext)
}

fn is_latex_aux_text_ext(ext: &str) -> bool {
    matches!(
        ext,
        "aux" | "acn" | "acr" | "alg" | "bcf" | "bbl" | "blg" | "fdb_latexmk" | "fls"
            | "glg" | "glo" | "gls" | "idx" | "ilg" | "ind" | "ist" | "lof" | "log"
            | "lot" | "nav" | "out" | "run.xml" | "snm" | "synctex" | "toc" | "vrb"
    )
}

fn is_new_tab(path: &str) -> bool {
    path.starts_with("newtab:")
}

fn is_draft_path(path: &str) -> bool {
    path.starts_with("draft:")
}

fn is_markdown_preview_path(path: &str) -> bool {
    path.starts_with("preview:")
}

fn preview_source_path_from(path: &str) -> String {
    if is_markdown_preview_path(path) {
        path.strip_prefix("preview:").unwrap_or("").to_string()
    } else {
        String::new()
    }
}

fn get_viewer_type_inner(path: &str) -> String {
    if is_new_tab(path) {
        return "newtab".to_string();
    }
    if is_markdown_preview_path(path) {
        return "markdown-preview".to_string();
    }
    let ext = get_ext(path);
    if POSTSCRIPT_TEXT_EXTS.contains(&ext.as_str()) {
        return "text".to_string();
    }
    if IMAGE_EXTS.contains(&ext.as_str()) {
        return "image".to_string();
    }
    if CSV_EXTS.contains(&ext.as_str()) {
        return "csv".to_string();
    }
    if HTML_EXTS.contains(&ext.as_str()) {
        return "html".to_string();
    }
    if is_supported_text_ext(&ext) {
        return "text".to_string();
    }
    if PDF_EXTS.contains(&ext.as_str()) {
        return "pdf".to_string();
    }
    "unsupported-binary".to_string()
}

fn get_mime_type_inner(path: &str) -> String {
    let ext = get_ext(path);
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tif" | "tiff" => "image/tiff",
        "eps" | "ps" => "application/postscript",
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn get_icon_name_inner(file_name: &str) -> String {
    let name = file_name.to_lowercase();

    // Full filename match
    let full_match = match name.as_str() {
        "_instructions.md" | "instructions.md" => Some("IconSparkles"),
        _ => None,
    };
    if let Some(icon) = full_match {
        return icon.to_string();
    }

    // Strip leading dot for dotfiles
    let stripped = if name.starts_with('.') { &name[1..] } else { &name };
    if let Some(icon) = ext_to_icon(stripped) {
        return icon.to_string();
    }

    // Extension match
    if let Some(dot) = name.rfind('.') {
        if dot > 0 {
            let ext = &name[dot + 1..];
            if let Some(icon) = ext_to_icon(ext) {
                return icon.to_string();
            }
        }
    }

    "IconFile".to_string()
}

fn ext_to_icon(ext: &str) -> Option<&'static str> {
    match ext {
        "md" | "txt" | "bib" | "rmd" | "qmd" => Some("IconFileText"),
        "json" => Some("IconBraces"),
        "js" | "mjs" | "cjs" | "jsx" => Some("IconBrandJavascript"),
        "ts" | "tsx" => Some("IconBrandTypescript"),
        "py" => Some("IconBrandPython"),
        "m" | "rs" | "go" | "java" | "c" | "cpp" | "h" | "rb" | "php" | "swift" | "kt"
        | "svelte" | "yaml" | "yml" | "toml" | "xml" | "jl" | "lua" | "zig" => {
            Some("IconFileCode")
        }
        "html" => Some("IconBrandHtml5"),
        "css" | "scss" => Some("IconBrandCss3"),
        "vue" => Some("IconBrandVue"),
        "sh" | "bash" | "zsh" => Some("IconTerminal2"),
        "sql" => Some("IconDatabase"),
        "svg" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "tif" | "tiff"
        | "eps" | "ps" => Some("IconPhoto"),
        "pdf" => Some("IconFileTypePdf"),
        "docx" => Some("IconFileTypeDocx"),
        "doc" => Some("IconFileTypeDoc"),
        "csv" | "tsv" => Some("IconTable"),
        "env" | "gitignore" | "lock" => Some("IconLock"),
        "ipynb" => Some("IconNotebook"),
        "tex" | "cls" | "sty" => Some("IconMath"),
        _ => None,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileTypeClassification {
    pub viewer_type: String,
    pub is_markdown: bool,
    pub is_latex: bool,
    pub is_latex_editor_file: bool,
    pub is_bib_file: bool,
    pub is_image: bool,
    pub is_html: bool,
    pub is_multimodal_image: bool,
    pub is_pdf: bool,
    pub is_binary: bool,
    pub is_new_tab: bool,
    pub is_draft_path: bool,
    pub is_preview_path: bool,
    pub is_runnable: bool,
    pub preview_source_path: String,
    pub mime_type: String,
    pub icon_name: String,
    pub language: Option<String>,
    pub extension: String,
}

fn classify_inner(path: &str) -> FileTypeClassification {
    let ext = get_ext(path);
    let is_new = is_new_tab(path);
    let is_draft = is_draft_path(path);
    let is_preview = is_markdown_preview_path(path);
    let is_md = ext == "md" || ext == "markdown" || ext == "qmd" || ext == "rmd";
    let is_ltx = ext == "tex" || ext == "latex";
    let is_ltx_editor = LATEX_EDITOR_EXTS.contains(&ext.as_str());
    let is_bib = ext == "bib";
    let is_img = IMAGE_EXTS.contains(&ext.as_str());
    let is_htm = HTML_EXTS.contains(&ext.as_str());
    let is_multimodal = MULTIMODAL_IMAGE_EXTS.contains(&ext.as_str());
    let is_p = PDF_EXTS.contains(&ext.as_str());
    let is_bin = if is_new || is_draft {
        false
    } else if POSTSCRIPT_TEXT_EXTS.contains(&ext.as_str()) {
        false
    } else {
        IMAGE_EXTS.contains(&ext.as_str())
            || PDF_EXTS.contains(&ext.as_str())
            || DOCX_EXTS.contains(&ext.as_str())
    };

    let basename = basename_path(path);
    let icon_name = get_icon_name_inner(&basename);

    FileTypeClassification {
        viewer_type: get_viewer_type_inner(path),
        is_markdown: is_md,
        is_latex: is_ltx,
        is_latex_editor_file: is_ltx_editor,
        is_bib_file: is_bib,
        is_image: is_img,
        is_html: is_htm,
        is_multimodal_image: is_multimodal,
        is_pdf: is_p,
        is_binary: is_bin,
        is_new_tab: is_new,
        is_draft_path: is_draft,
        is_preview_path: is_preview,
        is_runnable: false,
        preview_source_path: preview_source_path_from(path),
        mime_type: get_mime_type_inner(path),
        icon_name,
        language: None,
        extension: ext,
    }
}

// --- Tauri commands ---

#[tauri::command]
pub async fn file_types_classify(path: String) -> Result<FileTypeClassification, String> {
    Ok(classify_inner(&path))
}

#[tauri::command]
pub async fn file_types_get_viewer_type(path: String) -> Result<String, String> {
    Ok(get_viewer_type_inner(&path))
}

#[tauri::command]
pub async fn file_types_get_icon_name(file_name: String) -> Result<String, String> {
    Ok(get_icon_name_inner(&file_name))
}

#[tauri::command]
pub async fn file_types_get_mime_type(path: String) -> Result<String, String> {
    Ok(get_mime_type_inner(&path))
}

// Public helpers for other modules
#[allow(dead_code)]
pub fn is_markdown_file(path: &str) -> bool {
    let ext = get_ext(path);
    ext == "md" || ext == "markdown" || ext == "qmd" || ext == "rmd"
}

#[allow(dead_code)]
pub fn relative_path(from_file: &str, to_file: &str) -> String {
    let normalized_from = normalize_path(from_file);
    let normalized_to = normalize_path(to_file);

    let from_drive = if normalized_from.len() >= 2
        && normalized_from.as_bytes()[0].is_ascii_alphabetic()
        && normalized_from.as_bytes()[1] == b':'
    {
        normalized_from[..2].to_lowercase()
    } else {
        String::new()
    };
    let to_drive = if normalized_to.len() >= 2
        && normalized_to.as_bytes()[0].is_ascii_alphabetic()
        && normalized_to.as_bytes()[1] == b':'
    {
        normalized_to[..2].to_lowercase()
    } else {
        String::new()
    };

    if !from_drive.is_empty() && !to_drive.is_empty() && from_drive != to_drive {
        return normalized_to;
    }

    let from_dir = dirname_path(&normalized_from);
    let from_parts: Vec<&str> = from_dir.split('/').collect();
    let to_parts: Vec<&str> = normalized_to.split('/').collect();

    let mut common = 0;
    while common < from_parts.len()
        && common < to_parts.len()
        && from_parts[common] == to_parts[common]
    {
        common += 1;
    }

    let ups = from_parts.len() - common;
    let remainder = &to_parts[common..];

    if ups == 0 {
        remainder.join("/")
    } else {
        format!("{}{}", "../".repeat(ups), remainder.join("/"))
    }
}
