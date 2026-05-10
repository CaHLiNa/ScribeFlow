use serde::Serialize;

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

    let parts: Vec<&str> = without_trailing.split('/').filter(|s| !s.is_empty()).collect();
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
    let re_drive_root =
        normalized.len() <= 3 && normalized.as_bytes().first().map_or(false, |b| b.is_ascii_alphabetic());
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
    while common < from_parts.len() && common < to_parts.len() && from_parts[common] == to_parts[common] {
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

#[tauri::command]
pub async fn path_utils_normalize(value: String) -> Result<String, String> {
    Ok(normalize_path(&value))
}

#[tauri::command]
pub async fn path_utils_dirname(file_path: String) -> Result<String, String> {
    Ok(dirname_path(&file_path))
}

#[tauri::command]
pub async fn path_utils_basename(file_path: String) -> Result<String, String> {
    Ok(basename_path(&file_path))
}

#[tauri::command]
pub async fn path_utils_strip_extension(file_path: String) -> Result<String, String> {
    Ok(strip_extension(&file_path))
}

#[tauri::command]
pub async fn path_utils_join(segments: Vec<String>) -> Result<String, String> {
    let refs: Vec<&str> = segments.iter().map(|s| s.as_str()).collect();
    Ok(join_path(&refs))
}

#[tauri::command]
pub async fn path_utils_resolve_relative(base_dir: String, target: String) -> Result<String, String> {
    Ok(resolve_relative(&base_dir, &target))
}

#[tauri::command]
pub async fn path_utils_relative_between(from_file: String, to_file: String) -> Result<String, String> {
    Ok(relative_between(&from_file, &to_file))
}
