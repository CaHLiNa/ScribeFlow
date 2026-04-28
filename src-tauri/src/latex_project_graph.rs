use regex_lite::Regex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexProjectGraphParams {
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub flat_files: Vec<String>,
    #[serde(default)]
    pub content_overrides: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexAffectedRootsParams {
    #[serde(default)]
    pub changed_path: String,
    #[serde(default)]
    pub flat_files: Vec<String>,
    #[serde(default)]
    pub content_overrides: HashMap<String, String>,
}

#[derive(Debug, Clone)]
struct FileRecord {
    content: String,
    magic_root_path: String,
    is_root_like: bool,
    sections: Vec<Value>,
    appendices: Vec<Value>,
    floats: Vec<Value>,
    bibliography_outline_items: Vec<Value>,
    labels: Vec<Value>,
    citations: Vec<Value>,
    includes: Vec<Value>,
    bibliography_files: Vec<String>,
}

fn normalize_fs_path(path: &str) -> String {
    path.trim().replace('\\', "/")
}

fn dirname_path(path: &str) -> String {
    Path::new(path)
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

fn extname_path(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_lowercase()))
        .unwrap_or_default()
}

fn strip_extension(path: &str) -> String {
    let path = Path::new(path);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    path.parent()
        .map(|parent| normalize_fs_path(&parent.join(stem).to_string_lossy()))
        .unwrap_or_else(|| stem.to_string())
}

fn basename_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string()
}

fn resolve_relative_path(base_dir: &str, raw_path: &str) -> String {
    normalize_fs_path(&Path::new(base_dir).join(raw_path).to_string_lossy())
}

fn normalize_title(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn build_line_offsets(text: &str) -> Vec<usize> {
    let mut offsets = vec![0];
    for (index, ch) in text.char_indices() {
        if ch == '\n' {
            offsets.push(index + 1);
        }
    }
    offsets
}

fn offset_to_line(line_offsets: &[usize], offset: usize) -> usize {
    if line_offsets.is_empty() {
        return 1;
    }
    let mut low = 0usize;
    let mut high = line_offsets.len() - 1;
    while low <= high {
        let mid = (low + high) / 2;
        if line_offsets[mid] <= offset {
            low = mid + 1;
        } else if mid == 0 {
            break;
        } else {
            high = mid - 1;
        }
    }
    std::cmp::max(1, high + 1)
}

fn utf16_offset_for_byte_offset(text: &str, byte_offset: usize) -> usize {
    let mut safe_offset = byte_offset.min(text.len());
    while safe_offset > 0 && !text.is_char_boundary(safe_offset) {
        safe_offset -= 1;
    }

    text[..safe_offset].encode_utf16().count()
}

fn utf16_offset(content: &str, byte_offset: usize) -> usize {
    utf16_offset_for_byte_offset(content, byte_offset)
}

fn has_root_indicator(content: &str) -> bool {
    Regex::new(r"\\documentclass(?:\s*\[[^\]]*\])?\s*\{[^}]+\}")
        .ok()
        .map(|regex| regex.is_match(content))
        .unwrap_or(false)
        || Regex::new(r"\\begin\s*\{document\}")
            .ok()
            .map(|regex| regex.is_match(content))
            .unwrap_or(false)
}

fn sanitize_argument(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim_start_matches("./")
        .replace('\\', "/")
}

fn strip_tex_quotes(value: &str) -> String {
    sanitize_argument(value)
        .trim_matches('{')
        .trim_matches('}')
        .trim()
        .to_string()
}

fn has_known_extension(path: &str) -> bool {
    matches!(extname_path(path).as_str(), ".tex" | ".latex" | ".bib")
}

fn is_latex_source_path(path: &str) -> bool {
    matches!(extname_path(path).as_str(), ".tex" | ".latex")
}

fn is_bibliography_path(path: &str) -> bool {
    extname_path(path) == ".bib"
}

fn candidate_paths_for(base_dir: &str, raw_path: &str, extensions: &[&str]) -> Vec<String> {
    let cleaned = strip_tex_quotes(raw_path);
    if cleaned.is_empty() {
        return Vec::new();
    }
    let absolute = resolve_relative_path(base_dir, &cleaned);
    if has_known_extension(&absolute) || extensions.is_empty() {
        return vec![absolute];
    }
    let mut out = vec![absolute.clone()];
    out.extend(
        extensions
            .iter()
            .map(|extension| format!("{absolute}{extension}")),
    );
    out
}

fn resolve_existing_path(candidates: &[String], available_paths: &HashSet<String>) -> String {
    candidates
        .iter()
        .find(|candidate| available_paths.contains(*candidate))
        .cloned()
        .unwrap_or_else(|| candidates.first().cloned().unwrap_or_default())
}

fn parse_bibliography_targets(
    raw_value: &str,
    file_path: &str,
    available_paths: &HashSet<String>,
) -> Vec<String> {
    let base_dir = dirname_path(file_path);
    raw_value
        .split(',')
        .map(strip_tex_quotes)
        .filter(|value| !value.is_empty())
        .map(|part| {
            resolve_existing_path(
                &candidate_paths_for(&base_dir, &part, &[".bib"]),
                available_paths,
            )
        })
        .collect()
}

fn parse_magic_root(content: &str, file_path: &str, available_paths: &HashSet<String>) -> String {
    let regex = Regex::new(r"(?im)^[ \t]*%\s*!TEX\s+root\s*=\s*(.+)$").ok();
    let Some(regex) = regex else {
        return String::new();
    };
    let Some(captures) = regex.captures(content) else {
        return String::new();
    };
    let raw = captures
        .get(1)
        .map(|value| value.as_str())
        .unwrap_or_default();
    resolve_existing_path(
        &candidate_paths_for(&dirname_path(file_path), raw, &[".tex", ".latex"]),
        available_paths,
    )
}

fn parse_sections(content: &str, file_path: &str) -> Vec<Value> {
    let regex = Regex::new(
        r"\\(part|chapter|section|subsection|subsubsection|paragraph)\*?(?:\[[^\]]*\])?\{([^}]*)\}",
    )
    .ok();
    let Some(regex) = regex else {
        return Vec::new();
    };
    let line_offsets = build_line_offsets(content);
    regex
        .captures_iter(content)
        .filter_map(|captures| {
            let kind = captures.get(1)?.as_str();
            let title = normalize_title(captures.get(2)?.as_str());
            let full = captures.get(0)?;
            Some(json!({
                "filePath": file_path,
                "kind": kind,
                "text": title,
                "level": match kind {
                    "part" => 1,
                    "chapter" => 2,
                    "section" => 3,
                    "subsection" => 4,
                    "subsubsection" => 5,
                    "paragraph" => 6,
                    _ => 3
                },
                "offset": utf16_offset(content, full.start()),
                "line": offset_to_line(&line_offsets, full.start()),
            }))
        })
        .collect()
}

fn parse_labels(content: &str, file_path: &str) -> Vec<Value> {
    let regex = Regex::new(r"\\label(?:\[[^\]]*\])?\{([^}]+)\}").ok();
    let Some(regex) = regex else {
        return Vec::new();
    };
    let line_offsets = build_line_offsets(content);
    regex
        .captures_iter(content)
        .filter_map(|captures| {
            let key = strip_tex_quotes(captures.get(1)?.as_str());
            if key.is_empty() {
                return None;
            }
            let full = captures.get(0)?;
            Some(json!({
                "key": key,
                "filePath": file_path,
                "offset": utf16_offset(content, full.start()),
                "line": offset_to_line(&line_offsets, full.start()),
            }))
        })
        .collect()
}

fn parse_citations(content: &str, file_path: &str) -> Vec<Value> {
    let regex = Regex::new(
        r"\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{([^}]*)\}",
    )
    .ok();
    let Some(regex) = regex else {
        return Vec::new();
    };
    let line_offsets = build_line_offsets(content);
    let mut out = Vec::new();
    for captures in regex.captures_iter(content) {
        let Some(full) = captures.get(0) else {
            continue;
        };
        let keys = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default()
            .split(',')
            .map(strip_tex_quotes)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        for key in keys {
            out.push(json!({
                "key": key,
                "filePath": file_path,
                "offset": utf16_offset(content, full.start()),
                "line": offset_to_line(&line_offsets, full.start()),
            }));
        }
    }
    out
}

fn parse_includes(content: &str, file_path: &str, available_paths: &HashSet<String>) -> Vec<Value> {
    let include_re = Regex::new(
        r"\\(input|include|subfile|InputIfFileExists|loadglsentries|markdownInput)\{([^}]+)\}",
    )
    .ok();
    let import_re =
        Regex::new(r"\\(import|inputfrom|includefrom|subimport|subinputfrom|subincludefrom)\{([^}]+)\}\{([^}]+)\}")
            .ok();
    let mut includes = Vec::new();
    if let Some(include_re) = include_re {
        for captures in include_re.captures_iter(content) {
            let command = captures
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let raw = captures
                .get(2)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let target = resolve_existing_path(
                &candidate_paths_for(&dirname_path(file_path), raw, &[".tex", ".latex"]),
                available_paths,
            );
            if target.is_empty() {
                continue;
            }
            let offset = captures.get(0).map(|value| value.start()).unwrap_or(0);
            includes.push(json!({
                "command": command,
                "filePath": file_path,
                "targetPath": target,
                "offset": utf16_offset(content, offset),
                "raw": raw,
            }));
        }
    }
    if let Some(import_re) = import_re {
        for captures in import_re.captures_iter(content) {
            let command = captures
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let import_dir = resolve_relative_path(
                &dirname_path(file_path),
                captures
                    .get(2)
                    .map(|value| value.as_str())
                    .unwrap_or_default(),
            );
            let raw_target = captures
                .get(3)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let target = resolve_existing_path(
                &candidate_paths_for(&import_dir, raw_target, &[".tex", ".latex"]),
                available_paths,
            );
            if target.is_empty() {
                continue;
            }
            let offset = captures.get(0).map(|value| value.start()).unwrap_or(0);
            includes.push(json!({
                "command": command,
                "filePath": file_path,
                "targetPath": target,
                "offset": utf16_offset(content, offset),
                "raw": format!("{}::{}", captures.get(2).map(|value| value.as_str()).unwrap_or_default(), raw_target),
            }));
        }
    }
    includes.sort_by_key(|entry| entry.get("offset").and_then(Value::as_u64).unwrap_or(0));
    includes
}

fn parse_bibliography_files(
    content: &str,
    file_path: &str,
    available_paths: &HashSet<String>,
) -> Vec<String> {
    let add_re = Regex::new(r"\\addbibresource(?:\[[^\]]*\])?\{([^}]+)\}").ok();
    let bib_re = Regex::new(r"\\bibliography\{([^}]+)\}").ok();
    let mut files = Vec::new();
    if let Some(add_re) = add_re {
        for captures in add_re.captures_iter(content) {
            let raw = captures
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let target = resolve_existing_path(
                &candidate_paths_for(&dirname_path(file_path), raw, &[".bib"]),
                available_paths,
            );
            if !target.is_empty() {
                files.push(target);
            }
        }
    }
    if let Some(bib_re) = bib_re {
        for captures in bib_re.captures_iter(content) {
            let raw = captures
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default();
            files.extend(parse_bibliography_targets(raw, file_path, available_paths));
        }
    }
    unique_strings(files)
}

fn parse_bibliography_outline_items(content: &str, file_path: &str) -> Vec<Value> {
    let regex = Regex::new(r"\\begin\{thebibliography\}(?:\[[^\]]*\])?\{[^}]*\}").ok();
    let Some(regex) = regex else {
        return Vec::new();
    };
    let line_offsets = build_line_offsets(content);
    regex
        .find_iter(content)
        .map(|item| {
            json!({
                "filePath": file_path,
                "text": "Bibliography",
                "offset": utf16_offset(content, item.start()),
                "line": offset_to_line(&line_offsets, item.start()),
            })
        })
        .collect()
}

fn parse_appendices(content: &str, file_path: &str) -> Vec<Value> {
    let regex = Regex::new(r"\\appendix\b").ok();
    let Some(regex) = regex else {
        return Vec::new();
    };
    let line_offsets = build_line_offsets(content);
    regex
        .find_iter(content)
        .map(|item| {
            json!({
                "filePath": file_path,
                "offset": utf16_offset(content, item.start()),
                "line": offset_to_line(&line_offsets, item.start()),
                "text": "Appendix",
            })
        })
        .collect()
}

fn parse_floats(content: &str, file_path: &str) -> Vec<Value> {
    let float_re = Regex::new(r"(?s)\\begin\{(figure|table)\*?\}(.*?)\\end\{\1\*?\}").ok();
    let caption_re = Regex::new(r"\\caption(?:\[[^\]]*\])?\{([^}]*)\}").ok();
    let label_re = Regex::new(r"\\label(?:\[[^\]]*\])?\{([^}]+)\}").ok();
    let (Some(float_re), Some(caption_re), Some(label_re)) = (float_re, caption_re, label_re)
    else {
        return Vec::new();
    };
    let line_offsets = build_line_offsets(content);
    let mut floats = Vec::new();
    for captures in float_re.captures_iter(content) {
        let kind = captures
            .get(1)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let body = captures
            .get(2)
            .map(|value| value.as_str())
            .unwrap_or_default();
        let caption = caption_re
            .captures(body)
            .and_then(|caps| caps.get(1))
            .map(|value| normalize_title(value.as_str()))
            .unwrap_or_default();
        if caption.is_empty() {
            continue;
        }
        let label = label_re
            .captures(body)
            .and_then(|caps| caps.get(1))
            .map(|value| strip_tex_quotes(value.as_str()))
            .unwrap_or_default();
        let offset = captures.get(0).map(|value| value.start()).unwrap_or(0);
        floats.push(json!({
            "filePath": file_path,
            "kind": kind,
            "caption": caption,
            "label": label,
            "offset": utf16_offset(content, offset),
            "line": offset_to_line(&line_offsets, offset),
        }));
    }
    floats
}

fn read_text_file(file_path: &str, content_overrides: &HashMap<String, String>) -> String {
    let normalized = normalize_fs_path(file_path);
    if let Some(value) = content_overrides.get(&normalized) {
        return value.clone();
    }
    fs::read_to_string(&normalized).unwrap_or_default()
}

fn parse_file_record(
    file_path: &str,
    content_overrides: &HashMap<String, String>,
    available_paths: &HashSet<String>,
) -> FileRecord {
    let normalized = normalize_fs_path(file_path);
    let content = read_text_file(&normalized, content_overrides);
    FileRecord {
        magic_root_path: parse_magic_root(&content, &normalized, available_paths),
        is_root_like: has_root_indicator(&content),
        sections: parse_sections(&content, &normalized),
        appendices: parse_appendices(&content, &normalized),
        floats: parse_floats(&content, &normalized),
        bibliography_outline_items: parse_bibliography_outline_items(&content, &normalized),
        labels: parse_labels(&content, &normalized),
        citations: parse_citations(&content, &normalized),
        includes: parse_includes(&content, &normalized, available_paths),
        bibliography_files: parse_bibliography_files(&content, &normalized, available_paths),
        content,
    }
}

fn build_reverse_include_map(
    records: &HashMap<String, FileRecord>,
) -> HashMap<String, HashSet<String>> {
    let mut reverse = HashMap::new();
    for (file_path, record) in records {
        for include in &record.includes {
            let target = normalize_fs_path(
                include
                    .get("targetPath")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            );
            if target.is_empty() {
                continue;
            }
            reverse
                .entry(target)
                .or_insert_with(HashSet::new)
                .insert(file_path.clone());
        }
    }
    reverse
}

fn resolve_magic_root(source_path: &str, records: &HashMap<String, FileRecord>) -> String {
    let mut visited = HashSet::new();
    let mut current = normalize_fs_path(source_path);
    while !current.is_empty() && !visited.contains(&current) {
        visited.insert(current.clone());
        let next = records
            .get(&current)
            .map(|record| normalize_fs_path(&record.magic_root_path))
            .unwrap_or_default();
        if next.is_empty() || next == current {
            break;
        }
        current = next;
    }
    current
}

fn infer_root_path_from_includes(
    source_path: &str,
    records: &HashMap<String, FileRecord>,
) -> String {
    let normalized_source = normalize_fs_path(source_path);
    let reverse = build_reverse_include_map(records);
    let mut queue = VecDeque::from([(normalized_source.clone(), 0usize)]);
    let mut visited = HashSet::new();
    let mut candidates = Vec::new();

    while let Some((current_path, distance)) = queue.pop_front() {
        if visited.contains(&current_path) {
            continue;
        }
        visited.insert(current_path.clone());
        if records
            .get(&current_path)
            .map(|record| record.is_root_like)
            .unwrap_or(false)
        {
            candidates.push((current_path.clone(), distance));
        }
        if let Some(parents) = reverse.get(&current_path) {
            for parent in parents {
                queue.push_back((parent.clone(), distance + 1));
            }
        }
    }

    candidates.sort_by(|left, right| {
        if left.1 != right.1 {
            return right.1.cmp(&left.1);
        }
        let left_main = basename_path(&left.0).contains("main.") as i32;
        let right_main = basename_path(&right.0).contains("main.") as i32;
        right_main
            .cmp(&left_main)
            .then_with(|| left.0.cmp(&right.0))
    });
    candidates
        .first()
        .map(|value| value.0.clone())
        .unwrap_or(normalized_source)
}

fn collect_project_paths(
    root_path: &str,
    records: &HashMap<String, FileRecord>,
) -> HashSet<String> {
    let mut visited = HashSet::new();
    fn walk(path: &str, records: &HashMap<String, FileRecord>, visited: &mut HashSet<String>) {
        let normalized = normalize_fs_path(path);
        if normalized.is_empty() || visited.contains(&normalized) {
            return;
        }
        visited.insert(normalized.clone());
        if let Some(record) = records.get(&normalized) {
            for include in &record.includes {
                if let Some(target) = include.get("targetPath").and_then(Value::as_str) {
                    walk(target, records, visited);
                }
            }
        }
    }
    walk(root_path, records, &mut visited);
    visited
}

fn build_outline_items(
    root_path: &str,
    project_paths: &HashSet<String>,
    records: &HashMap<String, FileRecord>,
) -> Vec<Value> {
    let mut items = Vec::new();
    let heading_base_level = project_paths
        .iter()
        .flat_map(|path| {
            records
                .get(path)
                .map(|record| record.sections.clone())
                .unwrap_or_default()
        })
        .filter_map(|section| section.get("level").and_then(Value::as_u64))
        .min()
        .unwrap_or(1);
    let mut order = 0u64;
    let mut stack = HashSet::new();
    let mut visited = HashSet::new();

    fn walk(
        file_path: &str,
        project_paths: &HashSet<String>,
        records: &HashMap<String, FileRecord>,
        items: &mut Vec<Value>,
        stack: &mut HashSet<String>,
        visited: &mut HashSet<String>,
        heading_base_level: u64,
        order: &mut u64,
    ) {
        let normalized = normalize_fs_path(file_path);
        if normalized.is_empty() || stack.contains(&normalized) {
            return;
        }
        let Some(record) = records.get(&normalized) else {
            return;
        };
        stack.insert(normalized.clone());

        let mut nodes = Vec::new();
        nodes.extend(
            record
                .appendices
                .iter()
                .map(|value| ("appendix", value.clone())),
        );
        nodes.extend(
            record
                .sections
                .iter()
                .map(|value| ("section", value.clone())),
        );
        nodes.extend(record.floats.iter().map(|value| ("float", value.clone())));
        nodes.extend(
            record
                .bibliography_outline_items
                .iter()
                .map(|value| ("bibliography", value.clone())),
        );
        nodes.extend(
            record
                .includes
                .iter()
                .map(|value| ("include", value.clone())),
        );
        nodes.sort_by_key(|(_, value)| value.get("offset").and_then(Value::as_u64).unwrap_or(0));

        for (kind, node) in nodes {
            match kind {
                "appendix" => {
                    items.push(json!({
                        "kind": "appendix",
                        "text": node.get("text").and_then(Value::as_str).unwrap_or("Appendix"),
                        "level": 1,
                        "displayLevel": 1,
                        "offset": node.get("offset").and_then(Value::as_u64).unwrap_or(0),
                        "order": *order,
                        "filePath": normalized,
                        "line": node.get("line").and_then(Value::as_u64).unwrap_or(1),
                    }));
                    *order += 1;
                }
                "section" => {
                    let level = node.get("level").and_then(Value::as_u64).unwrap_or(3);
                    items.push(json!({
                        "kind": "heading",
                        "text": node.get("text").and_then(Value::as_str).unwrap_or_default(),
                        "level": level,
                        "displayLevel": std::cmp::max(1, level.saturating_sub(heading_base_level) + 1),
                        "offset": node.get("offset").and_then(Value::as_u64).unwrap_or(0),
                        "order": *order,
                        "filePath": normalized,
                        "line": node.get("line").and_then(Value::as_u64).unwrap_or(1),
                    }));
                    *order += 1;
                }
                "float" => {
                    items.push(json!({
                        "kind": node.get("kind").and_then(Value::as_str).unwrap_or("figure"),
                        "text": node.get("label").and_then(Value::as_str).filter(|value| !value.is_empty()).unwrap_or_else(|| node.get("caption").and_then(Value::as_str).unwrap_or_default()),
                        "level": 1,
                        "displayLevel": 1,
                        "offset": node.get("offset").and_then(Value::as_u64).unwrap_or(0),
                        "order": *order,
                        "filePath": normalized,
                        "line": node.get("line").and_then(Value::as_u64).unwrap_or(1),
                    }));
                    *order += 1;
                }
                "bibliography" => {
                    items.push(json!({
                        "kind": "bibliography",
                        "text": node.get("text").and_then(Value::as_str).unwrap_or("Bibliography"),
                        "level": 1,
                        "displayLevel": 1,
                        "offset": node.get("offset").and_then(Value::as_u64).unwrap_or(0),
                        "order": *order,
                        "filePath": normalized,
                        "line": node.get("line").and_then(Value::as_u64).unwrap_or(1),
                    }));
                    *order += 1;
                }
                "include" => {
                    let target = normalize_fs_path(
                        node.get("targetPath")
                            .and_then(Value::as_str)
                            .unwrap_or_default(),
                    );
                    if target.is_empty()
                        || !project_paths.contains(&target)
                        || visited.contains(&target)
                    {
                        continue;
                    }
                    visited.insert(target.clone());
                    walk(
                        &target,
                        project_paths,
                        records,
                        items,
                        stack,
                        visited,
                        heading_base_level,
                        order,
                    );
                }
                _ => {}
            }
        }

        stack.remove(&normalized);
    }

    visited.insert(normalize_fs_path(root_path));
    walk(
        root_path,
        project_paths,
        records,
        &mut items,
        &mut stack,
        &mut visited,
        heading_base_level,
        &mut order,
    );
    items
}

fn load_bib_keys(
    bibliography_files: &[String],
    content_overrides: &HashMap<String, String>,
) -> Vec<String> {
    let regex = Regex::new(r"@\w+\s*\{\s*([^,\s]+)\s*,").ok();
    let Some(regex) = regex else {
        return Vec::new();
    };
    let mut keys = Vec::new();
    for bib_path in bibliography_files {
        let content = read_text_file(bib_path, content_overrides);
        for captures in regex.captures_iter(&content) {
            let key = captures
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default()
                .trim();
            if !key.is_empty() {
                keys.push(key.to_string());
            }
        }
    }
    unique_strings(keys)
}

fn unique_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        if value.is_empty() || !seen.insert(value.clone()) {
            continue;
        }
        out.push(value);
    }
    out
}

fn unique_objects(values: Vec<Value>, key_builder: impl Fn(&Value) -> String) -> Vec<Value> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        let key = key_builder(&value);
        if key.is_empty() || !seen.insert(key) {
            continue;
        }
        out.push(value);
    }
    out
}

fn build_preview_path(root_path: &str) -> String {
    let stripped = strip_extension(root_path);
    if stripped.is_empty() {
        String::new()
    } else {
        format!("{stripped}.pdf")
    }
}

pub(crate) fn resolve_graph_value(params: &LatexProjectGraphParams) -> Option<Value> {
    let normalized_source = normalize_fs_path(&params.source_path);
    if normalized_source.is_empty() {
        return None;
    }

    let mut available_paths = params
        .flat_files
        .iter()
        .map(|path| normalize_fs_path(path))
        .filter(|path| matches!(extname_path(path).as_str(), ".tex" | ".latex" | ".bib"))
        .collect::<HashSet<_>>();
    available_paths.insert(normalized_source.clone());

    let latex_files = available_paths
        .iter()
        .filter(|path| is_latex_source_path(path))
        .cloned()
        .collect::<Vec<_>>();
    let mut records = HashMap::new();
    for file_path in latex_files {
        records.insert(
            file_path.clone(),
            parse_file_record(&file_path, &params.content_overrides, &available_paths),
        );
    }

    let magic_root_path = resolve_magic_root(&normalized_source, &records);
    let root_path = if !magic_root_path.is_empty() && magic_root_path != normalized_source {
        magic_root_path
    } else {
        infer_root_path_from_includes(&normalized_source, &records)
    };
    let project_paths = collect_project_paths(&root_path, &records);
    let bibliography_files = unique_strings(
        project_paths
            .iter()
            .flat_map(|path| {
                records
                    .get(path)
                    .map(|record| record.bibliography_files.clone())
                    .unwrap_or_default()
            })
            .chain(
                records
                    .get(&normalized_source)
                    .map(|record| record.bibliography_files.clone())
                    .unwrap_or_default(),
            )
            .collect(),
    );
    let bib_keys = load_bib_keys(&bibliography_files, &params.content_overrides);
    let labels = unique_objects(
        project_paths
            .iter()
            .flat_map(|path| {
                records
                    .get(path)
                    .map(|record| record.labels.clone())
                    .unwrap_or_default()
            })
            .collect(),
        |value| {
            format!(
                "{}:{}:{}",
                value
                    .get("filePath")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
                value.get("key").and_then(Value::as_str).unwrap_or_default(),
                value.get("offset").and_then(Value::as_u64).unwrap_or(0)
            )
        },
    );
    let citations = unique_objects(
        project_paths
            .iter()
            .flat_map(|path| {
                records
                    .get(path)
                    .map(|record| record.citations.clone())
                    .unwrap_or_default()
            })
            .collect(),
        |value| {
            format!(
                "{}:{}:{}",
                value
                    .get("filePath")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
                value.get("key").and_then(Value::as_str).unwrap_or_default(),
                value.get("offset").and_then(Value::as_u64).unwrap_or(0)
            )
        },
    );
    let outline_items = build_outline_items(&root_path, &project_paths, &records);

    let label_keys = labels
        .iter()
        .filter_map(|label| {
            label
                .get("key")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .collect::<HashSet<_>>();
    let citation_keys = bib_keys.iter().cloned().collect::<HashSet<_>>();
    let unresolved_citations = unique_objects(
        citations
            .iter()
            .filter(|citation| {
                let key = citation
                    .get("key")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                !key.is_empty() && !citation_keys.contains(key)
            })
            .cloned()
            .collect(),
        |value| {
            format!(
                "{}:{}:{}",
                value
                    .get("filePath")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
                value.get("key").and_then(Value::as_str).unwrap_or_default(),
                value.get("line").and_then(Value::as_u64).unwrap_or(0)
            )
        },
    );

    let ref_re = Regex::new(r"\\(?:ref|eqref|pageref|autoref|cref|Cref)\{([^}]+)\}").ok();
    let mut unresolved_refs = Vec::new();
    if let Some(ref_re) = ref_re {
        for path in &project_paths {
            let content = records
                .get(path)
                .map(|record| record.content.as_str())
                .unwrap_or_default();
            let line_offsets = build_line_offsets(content);
            for captures in ref_re.captures_iter(content) {
                let key = strip_tex_quotes(
                    captures
                        .get(1)
                        .map(|value| value.as_str())
                        .unwrap_or_default(),
                );
                if key.is_empty() || label_keys.contains(&key) {
                    continue;
                }
                let offset = captures.get(0).map(|value| value.start()).unwrap_or(0);
                unresolved_refs.push(json!({
                    "key": key,
                    "filePath": path,
                    "offset": utf16_offset(content, offset),
                    "line": offset_to_line(&line_offsets, offset),
                }));
            }
        }
    }

    Some(json!({
        "sourcePath": normalized_source,
        "rootPath": root_path.clone(),
        "previewPath": build_preview_path(&root_path),
        "projectPaths": project_paths.into_iter().collect::<Vec<_>>(),
        "bibliographyFiles": bibliography_files,
        "bibKeys": bib_keys,
        "labels": labels,
        "citations": citations,
        "outlineItems": outline_items,
        "unresolvedRefs": unique_objects(unresolved_refs, |value| {
            format!(
                "{}:{}:{}",
                value.get("filePath").and_then(Value::as_str).unwrap_or_default(),
                value.get("key").and_then(Value::as_str).unwrap_or_default(),
                value.get("line").and_then(Value::as_u64).unwrap_or(0)
            )
        }),
        "unresolvedCitations": unresolved_citations,
    }))
}

fn resolve_affected_root_targets_internal(params: &LatexAffectedRootsParams) -> Vec<Value> {
    let normalized_changed = normalize_fs_path(&params.changed_path);
    if normalized_changed.is_empty()
        || (!is_latex_source_path(&normalized_changed)
            && !is_bibliography_path(&normalized_changed))
    {
        return Vec::new();
    }

    let latex_files = params
        .flat_files
        .iter()
        .map(|path| normalize_fs_path(path))
        .filter(|path| is_latex_source_path(path))
        .collect::<Vec<_>>();

    let mut affected = HashMap::new();
    for file_path in latex_files {
        let graph = resolve_graph_value(&LatexProjectGraphParams {
            source_path: file_path.clone(),
            flat_files: params.flat_files.clone(),
            content_overrides: params.content_overrides.clone(),
        });
        let Some(graph) = graph else { continue };
        let touches_source = graph
            .get("projectPaths")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .any(|item| item.as_str() == Some(normalized_changed.as_str()))
            })
            .unwrap_or(false);
        let touches_bib = graph
            .get("bibliographyFiles")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .any(|item| item.as_str() == Some(normalized_changed.as_str()))
            })
            .unwrap_or(false);
        if !touches_source && !touches_bib {
            continue;
        }
        let root_path = graph
            .get("rootPath")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if root_path.is_empty() {
            continue;
        }
        affected.entry(root_path.clone()).or_insert_with(|| {
            json!({
                "sourcePath": root_path,
                "rootPath": graph.get("rootPath").cloned().unwrap_or(Value::String(String::new())),
                "previewPath": graph.get("previewPath").cloned().unwrap_or(Value::String(String::new())),
            })
        });
    }

    affected.into_values().collect()
}

#[tauri::command]
pub async fn latex_project_graph_resolve(params: LatexProjectGraphParams) -> Result<Value, String> {
    Ok(resolve_graph_value(&params).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn latex_compile_request_resolve(
    params: LatexProjectGraphParams,
) -> Result<Value, String> {
    let graph = resolve_graph_value(&params).unwrap_or(Value::Null);
    if graph.is_null() {
        return Ok(json!({
            "sourcePath": normalize_fs_path(&params.source_path),
            "rootPath": normalize_fs_path(&params.source_path),
            "previewPath": build_preview_path(&normalize_fs_path(&params.source_path)),
        }));
    }
    Ok(json!({
        "sourcePath": graph.get("sourcePath").cloned().unwrap_or(Value::String(normalize_fs_path(&params.source_path))),
        "rootPath": graph.get("rootPath").cloned().unwrap_or(Value::String(normalize_fs_path(&params.source_path))),
        "previewPath": graph.get("previewPath").cloned().unwrap_or(Value::String(build_preview_path(&normalize_fs_path(&params.source_path)))),
    }))
}

#[tauri::command]
pub async fn latex_affected_root_targets_resolve(
    params: LatexAffectedRootsParams,
) -> Result<Value, String> {
    Ok(Value::Array(resolve_affected_root_targets_internal(
        &params,
    )))
}

#[tauri::command]
pub async fn latex_compile_targets_resolve(
    params: LatexAffectedRootsParams,
) -> Result<Value, String> {
    let normalized_changed = normalize_fs_path(&params.changed_path);
    if normalized_changed.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }

    if is_latex_source_path(&normalized_changed) {
        let request = latex_compile_request_resolve(LatexProjectGraphParams {
            source_path: normalized_changed.clone(),
            flat_files: params.flat_files.clone(),
            content_overrides: params.content_overrides.clone(),
        })
        .await?;
        return Ok(Value::Array(vec![request]));
    }

    if is_bibliography_path(&normalized_changed) {
        return Ok(Value::Array(resolve_affected_root_targets_internal(
            &params,
        )));
    }

    Ok(Value::Array(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::{parse_sections, resolve_graph_value, LatexProjectGraphParams};
    use serde_json::Value;
    use std::collections::HashMap;

    #[test]
    fn section_offsets_use_utf16_units() {
        let content = "前言\n\\section{方法}\n";
        let sections = parse_sections(content, "/tmp/main.tex");

        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].get("offset").and_then(Value::as_u64), Some(3));
        assert_eq!(sections[0].get("line").and_then(Value::as_u64), Some(2));
    }

    #[test]
    fn outline_items_keep_utf16_offsets_for_non_ascii_latex() {
        let source_path = "/tmp/main.tex".to_string();
        let content = "前言\n\\section{方法}\n";
        let graph = resolve_graph_value(&LatexProjectGraphParams {
            source_path: source_path.clone(),
            flat_files: vec![source_path.clone()],
            content_overrides: HashMap::from([(source_path.clone(), content.to_string())]),
        })
        .unwrap();

        let outline_items = graph
            .get("outlineItems")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        assert_eq!(outline_items.len(), 1);
        assert_eq!(
            outline_items[0].get("offset").and_then(Value::as_u64),
            Some(3)
        );
        assert_eq!(
            outline_items[0].get("line").and_then(Value::as_u64),
            Some(2)
        );
    }
}
