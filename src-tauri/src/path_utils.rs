use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct PathComponents {
    pub normalized: String,
    pub basename: String,
    pub dirname: String,
    pub extension: String,
    pub stem: String,
}

pub fn normalize_path(value: &str) -> String {
    let trimmed = value.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return String::new();
    }
    trimmed
}

pub fn basename_path(file_path: &str) -> String {
    let normalized = normalize_path(file_path);
    if normalized.is_empty() {
        return String::new();
    }
    if normalized == "/" {
        return "/".to_string();
    }

    let without_trailing = normalized.trim_end_matches('/');

    // Windows drive root like "C:" or "C:/"
    if without_trailing.len() == 2
        && without_trailing.as_bytes()[1] == b':'
        && without_trailing.as_bytes()[0].is_ascii_alphabetic()
    {
        return format!("{}/", without_trailing);
    }

    let parts: Vec<&str> = without_trailing
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    parts.last().unwrap_or(&without_trailing).to_string()
}

pub fn dirname_path(file_path: &str) -> String {
    let normalized = normalize_path(file_path);
    if normalized.is_empty() {
        return ".".to_string();
    }
    if normalized == "/" {
        return "/".to_string();
    }

    // Windows drive root
    let re_drive_root = normalized.len() <= 3
        && normalized
            .as_bytes()
            .first()
            .map_or(false, |b| b.is_ascii_alphabetic());
    if re_drive_root && normalized.as_bytes().get(1) == Some(&b':') {
        let rest = &normalized[2..];
        if rest.is_empty() || rest == "/" {
            return format!("{}/", &normalized[..2]);
        }
    }

    let without_trailing = normalized.trim_end_matches('/');
    let index = without_trailing.rfind('/');
    match index {
        None => ".".to_string(),
        Some(0) => "/".to_string(),
        Some(i) => {
            let head = &without_trailing[..i];
            // Windows drive letter without slash
            if head.len() == 2
                && head.as_bytes()[1] == b':'
                && head.as_bytes()[0].is_ascii_alphabetic()
            {
                format!("{}/", head)
            } else {
                head.to_string()
            }
        }
    }
}

pub fn resolve_relative(base_dir: &str, target: &str) -> String {
    let normalized_target = normalize_path(target);
    if normalized_target.is_empty() {
        return String::new();
    }

    // Absolute path check
    if normalized_target.starts_with('/')
        || (normalized_target.len() >= 3
            && normalized_target.as_bytes()[0].is_ascii_alphabetic()
            && normalized_target.as_bytes()[1] == b':'
            && normalized_target.as_bytes()[2] == b'/')
    {
        return normalized_target;
    }

    let seed = if base_dir.is_empty() {
        ".".to_string()
    } else {
        normalize_path(base_dir)
    };

    let mut base_parts: Vec<&str> = seed.split('/').filter(|s| !s.is_empty()).collect();
    let target_parts: Vec<&str> = normalized_target.split('/').collect();
    let absolute = seed.starts_with('/')
        || (seed.len() >= 3
            && seed.as_bytes()[0].is_ascii_alphabetic()
            && seed.as_bytes()[1] == b':'
            && seed.as_bytes()[2] == b'/');

    let drive_prefix = if seed.len() >= 3
        && seed.as_bytes()[0].is_ascii_alphabetic()
        && seed.as_bytes()[1] == b':'
        && seed.as_bytes()[2] == b'/'
    {
        &seed[..2]
    } else {
        ""
    };

    for segment in &target_parts {
        if segment.is_empty() || *segment == "." {
            continue;
        }
        if *segment == ".." {
            base_parts.pop();
            continue;
        }
        base_parts.push(segment);
    }

    if !drive_prefix.is_empty() {
        let rest: Vec<&str> = if !base_parts.is_empty() && base_parts[0].ends_with(':') {
            base_parts[1..].to_vec()
        } else {
            base_parts
        };
        normalize_path(&format!("{}/{}", drive_prefix, rest.join("/")))
    } else if absolute {
        normalize_path(&format!("/{}", base_parts.join("/")))
    } else {
        normalize_path(&base_parts.join("/"))
    }
}

pub fn strip_extension(file_path: &str) -> String {
    let name = basename_path(file_path);
    match name.rfind('.') {
        Some(i) if i > 0 => name[..i].to_string(),
        _ => name,
    }
}

pub fn join_path(segments: &[&str]) -> String {
    let joined = segments
        .iter()
        .filter(|s| !s.is_empty())
        .copied()
        .collect::<Vec<&str>>()
        .join("/");
    normalize_path(&joined)
}

pub fn relative_between(from_file: &str, to_file: &str) -> String {
    let normalized_from = normalize_path(from_file);
    let normalized_to = normalize_path(to_file);

    // Cross-drive check (Windows)
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

// --- Tauri commands ---

fn payload_field<'a>(params: &'a Value, key: &str) -> Option<&'a Value> {
    params.as_object().and_then(|object| object.get(key))
}

fn string_payload_field(params: &Value, key: &str) -> String {
    payload_field(params, key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn string_array_payload_field(params: &Value, key: &str) -> Vec<String> {
    payload_field(params, key)
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn normalize_params_from_payload(params: Value) -> String {
    string_payload_field(&params, "value")
}

fn file_path_params_from_payload(params: Value) -> String {
    string_payload_field(&params, "filePath")
}

fn resolve_relative_params_from_payload(params: Value) -> (String, String) {
    (
        string_payload_field(&params, "baseDir"),
        string_payload_field(&params, "target"),
    )
}

fn join_params_from_payload(params: Value) -> Vec<String> {
    string_array_payload_field(&params, "segments")
}

fn relative_between_params_from_payload(params: Value) -> (String, String) {
    (
        string_payload_field(&params, "fromFile"),
        string_payload_field(&params, "toFile"),
    )
}

#[tauri::command]
pub async fn path_utils_normalize(params: Value) -> Result<String, String> {
    let value = normalize_params_from_payload(params);
    Ok(normalize_path(&value))
}

#[tauri::command]
pub async fn path_utils_dirname(params: Value) -> Result<String, String> {
    let file_path = file_path_params_from_payload(params);
    Ok(dirname_path(&file_path))
}

#[tauri::command]
pub async fn path_utils_basename(params: Value) -> Result<String, String> {
    let file_path = file_path_params_from_payload(params);
    Ok(basename_path(&file_path))
}

#[tauri::command]
pub async fn path_utils_strip_extension(params: Value) -> Result<String, String> {
    let file_path = file_path_params_from_payload(params);
    Ok(strip_extension(&file_path))
}

#[tauri::command]
pub async fn path_utils_join(params: Value) -> Result<String, String> {
    let segments = join_params_from_payload(params);
    let refs: Vec<&str> = segments.iter().map(|s| s.as_str()).collect();
    Ok(join_path(&refs))
}

#[tauri::command]
pub async fn path_utils_resolve_relative(params: Value) -> Result<String, String> {
    let (base_dir, target) = resolve_relative_params_from_payload(params);
    Ok(resolve_relative(&base_dir, &target))
}

#[tauri::command]
pub async fn path_utils_relative_between(params: Value) -> Result<String, String> {
    let (from_file, to_file) = relative_between_params_from_payload(params);
    Ok(relative_between(&from_file, &to_file))
}

#[cfg(test)]
mod tests {
    use super::{
        file_path_params_from_payload, join_params_from_payload, normalize_params_from_payload,
        relative_between_params_from_payload, resolve_relative_params_from_payload,
    };
    use serde_json::json;

    #[test]
    fn path_utils_params_normalize_raw_payloads() {
        assert_eq!(
            normalize_params_from_payload(json!({
                "value": "  /tmp/workspace\\note.md  "
            })),
            "  /tmp/workspace\\note.md  "
        );

        assert_eq!(
            file_path_params_from_payload(json!({
                "filePath": " /tmp/workspace/note.md "
            })),
            " /tmp/workspace/note.md "
        );
        assert_eq!(
            file_path_params_from_payload(json!({
                "filePath": 42
            })),
            ""
        );

        let (base_dir, target) = resolve_relative_params_from_payload(json!({
            "baseDir": false,
            "target": " ../paper.tex "
        }));
        assert_eq!(base_dir, "");
        assert_eq!(target, " ../paper.tex ");

        assert_eq!(
            join_params_from_payload(json!({
                "segments": [
                    " /tmp ",
                    42,
                    " workspace ",
                    false,
                    "note.md"
                ]
            })),
            vec![" /tmp ", " workspace ", "note.md"]
        );

        let (from_file, to_file) = relative_between_params_from_payload(json!({
            "fromFile": " /tmp/workspace/main.tex ",
            "toFile": null
        }));
        assert_eq!(from_file, " /tmp/workspace/main.tex ");
        assert_eq!(to_file, "");

        let (missing_from, missing_to) = relative_between_params_from_payload(json!(false));
        assert_eq!(missing_from, "");
        assert_eq!(missing_to, "");
    }
}
