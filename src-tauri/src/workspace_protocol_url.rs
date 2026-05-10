use crate::path_utils::normalize_path;

fn is_within_root(path: &str, root: &str) -> bool {
    if path.is_empty() || root.is_empty() {
        return false;
    }
    if path == root {
        return true;
    }
    let separator = if root.ends_with('/') { "" } else { "/" };
    path.starts_with(&format!("{}{}", root, separator))
}

fn encode_relative_path(relative_path: &str) -> String {
    relative_path
        .split('/')
        .filter(|s| !s.is_empty())
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

#[tauri::command]
pub async fn workspace_protocol_url_resolve(
    file_path: String,
    workspace_path: String,
    workspace_data_dir: String,
    global_config_dir: String,
    version: String,
) -> Result<String, String> {
    let normalized_file = normalize_protocol_path(&file_path);
    let workspace_root = normalize_protocol_path(&workspace_path);
    let data_root = normalize_protocol_path(&workspace_data_dir);
    let global_root = normalize_protocol_path(&global_config_dir);

    let (scope, relative_path) = if is_within_root(&normalized_file, &workspace_root) {
        let rel = normalized_file[workspace_root.len()..]
            .trim_start_matches('/')
            .to_string();
        ("workspace", rel)
    } else if is_within_root(&normalized_file, &data_root) {
        let rel = normalized_file[data_root.len()..]
            .trim_start_matches('/')
            .to_string();
        ("data", rel)
    } else if is_within_root(&normalized_file, &global_root) {
        let rel = normalized_file[global_root.len()..]
            .trim_start_matches('/')
            .to_string();
        ("global", rel)
    } else {
        return Ok(String::new());
    };

    if relative_path.is_empty() {
        return Ok(String::new());
    }

    let base_url = format!(
        "scribeflow-workspace://localhost/{}/{}",
        scope,
        encode_relative_path(&relative_path)
    );

    if version.is_empty() {
        Ok(base_url)
    } else {
        Ok(format!("{}?v={}", base_url, urlencoding::encode(&version)))
    }
}

fn normalize_protocol_path(path: &str) -> String {
    let value = normalize_path(path);
    if value.is_empty() {
        return String::new();
    }
    if value == "/" {
        return "/".to_string();
    }
    // Windows drive root
    if value.len() <= 3
        && value.as_bytes().first().map_or(false, |b| b.is_ascii_alphabetic())
        && value.as_bytes().get(1) == Some(&b':')
    {
        let rest = &value[2..];
        if rest.is_empty() || rest == "/" {
            return format!("{}/", &value[..2]);
        }
    }
    value.trim_end_matches('/').to_string()
}
