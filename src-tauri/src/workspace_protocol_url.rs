use crate::path_utils::normalize_path;
use serde_json::Value;

#[derive(Debug, PartialEq, Eq)]
struct WorkspaceProtocolUrlParams {
    file_path: String,
    workspace_path: String,
    workspace_data_dir: String,
    global_config_dir: String,
    version: String,
}

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
pub async fn workspace_protocol_url_resolve(params: Value) -> Result<String, String> {
    Ok(resolve_workspace_protocol_url(
        workspace_protocol_url_params_from_payload(params),
    ))
}

fn payload_field<'a>(params: &'a Value, key: &str) -> Option<&'a Value> {
    params.as_object().and_then(|object| object.get(key))
}

fn string_field(value: Option<&Value>, key: &str) -> String {
    value
        .and_then(|object| object.as_object())
        .and_then(|object| object.get(key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn workspace_protocol_url_params_from_payload(params: Value) -> WorkspaceProtocolUrlParams {
    let workspace = payload_field(&params, "workspace");
    let options = payload_field(&params, "options");
    WorkspaceProtocolUrlParams {
        file_path: payload_field(&params, "filePath")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        workspace_path: string_field(workspace, "path"),
        workspace_data_dir: string_field(workspace, "workspaceDataDir"),
        global_config_dir: string_field(workspace, "globalConfigDir"),
        version: string_field(options, "version"),
    }
}

fn resolve_workspace_protocol_url(params: WorkspaceProtocolUrlParams) -> String {
    let normalized_file = normalize_protocol_path(&params.file_path);
    let workspace_root = normalize_protocol_path(&params.workspace_path);
    let data_root = normalize_protocol_path(&params.workspace_data_dir);
    let global_root = normalize_protocol_path(&params.global_config_dir);

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
        return String::new();
    };

    if relative_path.is_empty() {
        return String::new();
    }

    let base_url = format!(
        "scribeflow-workspace://localhost/{}/{}",
        scope,
        encode_relative_path(&relative_path)
    );

    if params.version.is_empty() {
        base_url
    } else {
        format!("{}?v={}", base_url, urlencoding::encode(&params.version))
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
        && value
            .as_bytes()
            .first()
            .map_or(false, |b| b.is_ascii_alphabetic())
        && value.as_bytes().get(1) == Some(&b':')
    {
        let rest = &value[2..];
        if rest.is_empty() || rest == "/" {
            return format!("{}/", &value[..2]);
        }
    }
    value.trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::{resolve_workspace_protocol_url, workspace_protocol_url_params_from_payload};
    use serde_json::json;

    #[test]
    fn workspace_protocol_url_params_normalize_raw_payloads() {
        let params = workspace_protocol_url_params_from_payload(json!({
            "filePath": " /tmp/workspace/notes/a b.md ",
            "workspace": {
                "path": " /tmp/workspace/ ",
                "workspaceDataDir": false,
                "globalConfigDir": " /tmp/global "
            },
            "options": {
                "version": " revision 1 "
            }
        }));
        assert_eq!(params.file_path, " /tmp/workspace/notes/a b.md ");
        assert_eq!(params.workspace_path, " /tmp/workspace/ ");
        assert_eq!(params.workspace_data_dir, "");
        assert_eq!(params.global_config_dir, " /tmp/global ");
        assert_eq!(params.version, " revision 1 ");

        assert_eq!(
            resolve_workspace_protocol_url(params),
            "scribeflow-workspace://localhost/workspace/notes/a%20b.md?v=%20revision%201%20"
        );

        let data_params = workspace_protocol_url_params_from_payload(json!({
            "filePath": "/tmp/data/assets/result.pdf",
            "workspace": {
                "path": "/tmp/workspace",
                "workspaceDataDir": "/tmp/data",
                "globalConfigDir": "/tmp/global"
            },
            "options": {}
        }));
        assert_eq!(
            resolve_workspace_protocol_url(data_params),
            "scribeflow-workspace://localhost/data/assets/result.pdf"
        );

        let global_params = workspace_protocol_url_params_from_payload(json!({
            "filePath": "/tmp/global/tools/example/package.json",
            "workspace": {
                "path": "/tmp/workspace",
                "workspaceDataDir": "/tmp/data",
                "globalConfigDir": "/tmp/global"
            },
            "options": {
                "version": 42
            }
        }));
        assert_eq!(global_params.version, "");
        assert_eq!(
            resolve_workspace_protocol_url(global_params),
            "scribeflow-workspace://localhost/global/tools/example/package.json"
        );

        let invalid_params = workspace_protocol_url_params_from_payload(json!({
            "filePath": 42,
            "workspace": false,
            "options": null
        }));
        assert_eq!(invalid_params.file_path, "");
        assert_eq!(invalid_params.workspace_path, "");
        assert_eq!(resolve_workspace_protocol_url(invalid_params), "");
    }
}
