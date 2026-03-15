use crate::app_dirs;
use std::ffi::OsStr;
use std::fs;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tokio::net::lookup_host;
use url::Url;

pub struct WorkspaceScopeState {
    allowed_roots: Mutex<AllowedRoots>,
}

#[derive(Clone, Default)]
struct AllowedRoots {
    workspace_root: Option<PathBuf>,
    data_dir: Option<PathBuf>,
}

impl Default for WorkspaceScopeState {
    fn default() -> Self {
        let _ = app_dirs::data_root_dir();

        Self {
            allowed_roots: Mutex::new(AllowedRoots::default()),
        }
    }
}

impl WorkspaceScopeState {
    fn allowed_roots(&self) -> Result<AllowedRoots, String> {
        let guard = self
            .allowed_roots
            .lock()
            .map_err(|_| "Allowed roots state is unavailable".to_string())?;
        Ok(guard.clone())
    }

    fn allowed_workspace_root(&self) -> Result<PathBuf, String> {
        self.allowed_roots()?
            .workspace_root
            .ok_or_else(|| "No active workspace is registered".to_string())
    }

    fn allowed_root_for_scope(&self, scope: &str) -> Result<PathBuf, String> {
        let roots = self.allowed_roots()?;
        match scope {
            "workspace" => roots
                .workspace_root
                .ok_or_else(|| "No active workspace root is registered".to_string()),
            "data" => roots
                .data_dir
                .ok_or_else(|| "No active workspace data directory is registered".to_string()),
            other => Err(format!("Unsupported scope: {other}")),
        }
    }

    fn is_allowed_workspace_path(&self, path: &Path) -> Result<bool, String> {
        let root = self.allowed_workspace_root()?;
        Ok(is_within_root(path, &root))
    }
}

fn prepare_allowed_directory(path: &Path, create_if_missing: bool) -> Result<PathBuf, String> {
    if create_if_missing && !path.exists() {
        fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }

    let canonical = canonicalize_for_scope(path)?;
    if !canonical.is_dir() {
        return Err(format!(
            "Allowed root is not a directory: {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

#[tauri::command]
pub fn workspace_set_allowed_roots(
    workspace_root: String,
    data_dir: Option<String>,
    state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let canonical_workspace_root = prepare_allowed_directory(Path::new(&workspace_root), false)
        .map_err(|error| {
            if error.starts_with("Allowed root is not a directory:") {
                error.replacen("Allowed root", "Workspace root", 1)
            } else {
                error
            }
        })?;

    let canonical_data_dir = match data_dir {
        Some(path) if !path.trim().is_empty() => Some(
            prepare_allowed_directory(Path::new(&path), true).map_err(|error| {
                if error.starts_with("Allowed root is not a directory:") {
                    error.replacen("Allowed root", "Workspace data directory", 1)
                } else {
                    error
                }
            })?,
        ),
        _ => None,
    };

    let mut guard = state
        .allowed_roots
        .lock()
        .map_err(|_| "Allowed roots state is unavailable".to_string())?;
    *guard = AllowedRoots {
        workspace_root: Some(canonical_workspace_root),
        data_dir: canonical_data_dir,
    };
    Ok(())
}

#[tauri::command]
pub fn workspace_clear_allowed_roots(
    state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let mut guard = state
        .allowed_roots
        .lock()
        .map_err(|_| "Allowed roots state is unavailable".to_string())?;
    *guard = AllowedRoots::default();
    Ok(())
}

pub fn ensure_workspace_cwd(state: &WorkspaceScopeState, cwd: &str) -> Result<PathBuf, String> {
    let canonical = canonicalize_for_scope(Path::new(cwd))?;
    if state.is_allowed_workspace_path(&canonical)? {
        Ok(canonical)
    } else {
        Err(format!(
            "Path is outside the active workspace: {}",
            canonical.display()
        ))
    }
}

pub fn resolve_allowed_scoped_path(
    state: &WorkspaceScopeState,
    scope: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let root = state.allowed_root_for_scope(scope)?;
    let mut resolved = root.clone();

    for component in Path::new(relative_path).components() {
        match component {
            Component::Normal(segment) => resolved.push(segment),
            Component::CurDir => {}
            Component::RootDir | Component::ParentDir | Component::Prefix(_) => {
                return Err("Path traversal is not allowed".to_string())
            }
        }
    }

    let canonical = canonicalize_for_scope(&resolved)?;
    if !is_within_root(&canonical, &root) {
        return Err(format!(
            "Path is outside the allowed {scope} scope: {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

pub async fn validate_public_fetch_url(raw_url: &str) -> Result<Url, String> {
    let url = Url::parse(raw_url).map_err(|e| format!("Invalid URL: {e}"))?;

    match url.scheme() {
        "http" | "https" => {}
        scheme => return Err(format!("Unsupported URL scheme: {scheme}")),
    }

    if !url.username().is_empty() || url.password().is_some() {
        return Err("Embedded credentials are not allowed in fetched URLs".to_string());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?
        .trim()
        .to_lowercase();

    if host == "localhost" || host.ends_with(".local") {
        return Err(format!("Local hostnames are not allowed: {host}"));
    }

    let port = url.port_or_known_default().unwrap_or(80);

    if let Ok(ip) = host.parse::<IpAddr>() {
        if !is_public_ip(ip) {
            return Err(format!("Non-public IPs are not allowed: {host}"));
        }
        return Ok(url);
    }

    let mut saw_address = false;
    for addr in lookup_host((host.as_str(), port))
        .await
        .map_err(|e| format!("DNS lookup failed for {host}: {e}"))?
    {
        saw_address = true;
        if !is_public_ip(addr.ip()) {
            return Err(format!(
                "Host resolves to a non-public address: {}",
                addr.ip()
            ));
        }
    }

    if !saw_address {
        return Err(format!("Host did not resolve to any address: {host}"));
    }

    Ok(url)
}

pub fn normalize_absolute_path(path: &Path) -> PathBuf {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("/"))
            .join(path)
    };

    let mut normalized = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(Path::new(std::path::MAIN_SEPARATOR_STR)),
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = normalized.pop();
            }
            Component::Normal(part) => normalized.push(part),
        }
    }
    normalized
}

pub fn canonicalize_for_scope(path: &Path) -> Result<PathBuf, String> {
    let normalized = normalize_absolute_path(path);
    if normalized.exists() {
        return std::fs::canonicalize(&normalized)
            .map(|p| normalize_absolute_path(&p))
            .map_err(|e| format!("Failed to resolve path {}: {e}", normalized.display()));
    }

    let mut suffix: Vec<_> = Vec::new();
    let mut current = normalized.clone();

    while !current.exists() {
        let Some(name) = current.file_name().map(OsStr::to_os_string) else {
            return Err(format!(
                "Path has no existing ancestor: {}",
                normalized.display()
            ));
        };
        suffix.push(name);
        current = current
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| format!("Path has no existing ancestor: {}", normalized.display()))?;
    }

    let mut canonical = std::fs::canonicalize(&current)
        .map_err(|e| format!("Failed to resolve path {}: {e}", current.display()))?;
    for segment in suffix.iter().rev() {
        canonical.push(segment);
    }

    Ok(normalize_absolute_path(&canonical))
}

fn is_within_root(path: &Path, root: &Path) -> bool {
    path == root || path.starts_with(root)
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(addr) => is_public_ipv4(addr),
        IpAddr::V6(addr) => is_public_ipv6(addr),
    }
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_multicast()
        || ip.is_unspecified()
        || octets[0] == 0
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
        || (octets[0] == 198 && (octets[1] == 18 || octets[1] == 19)))
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    !(ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_unique_local()
        || ip.is_unicast_link_local()
        || (segments[0] == 0x2001 && segments[1] == 0x0db8))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("altals-security-{label}-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn resolves_workspace_and_data_scopes() {
        let workspace_root = temp_path("workspace");
        let data_root = temp_path("data");
        fs::create_dir_all(workspace_root.join("docs")).unwrap();
        fs::create_dir_all(data_root.join("references")).unwrap();
        fs::write(workspace_root.join("docs/file.pdf"), b"workspace").unwrap();
        fs::write(data_root.join("references/file.pdf"), b"data").unwrap();

        let state = WorkspaceScopeState::default();
        *state.allowed_roots.lock().unwrap() = AllowedRoots {
            workspace_root: Some(canonicalize_for_scope(&workspace_root).unwrap()),
            data_dir: Some(canonicalize_for_scope(&data_root).unwrap()),
        };

        let workspace_file =
            resolve_allowed_scoped_path(&state, "workspace", "docs/file.pdf").unwrap();
        let data_file = resolve_allowed_scoped_path(&state, "data", "references/file.pdf").unwrap();

        assert!(workspace_file.ends_with("docs/file.pdf"));
        assert!(data_file.ends_with("references/file.pdf"));

        fs::remove_dir_all(workspace_root).unwrap();
        fs::remove_dir_all(data_root).unwrap();
    }

    #[test]
    fn rejects_path_traversal() {
        let workspace_root = temp_path("workspace-traversal");
        fs::create_dir_all(&workspace_root).unwrap();

        let state = WorkspaceScopeState::default();
        *state.allowed_roots.lock().unwrap() = AllowedRoots {
            workspace_root: Some(canonicalize_for_scope(&workspace_root).unwrap()),
            data_dir: None,
        };

        let err = resolve_allowed_scoped_path(&state, "workspace", "../outside.pdf").unwrap_err();
        assert!(err.contains("Path traversal"));

        fs::remove_dir_all(workspace_root).unwrap();
    }

    #[test]
    fn rejects_unconfigured_scope() {
        let workspace_root = temp_path("workspace-only");
        fs::create_dir_all(&workspace_root).unwrap();

        let state = WorkspaceScopeState::default();
        *state.allowed_roots.lock().unwrap() = AllowedRoots {
            workspace_root: Some(canonicalize_for_scope(&workspace_root).unwrap()),
            data_dir: None,
        };

        let err = resolve_allowed_scoped_path(&state, "data", "references/file.pdf").unwrap_err();
        assert!(err.contains("data directory"));

        fs::remove_dir_all(workspace_root).unwrap();
    }

    #[test]
    fn creates_missing_data_root_before_registering_scope() {
        let workspace_root = temp_path("workspace-root");
        let data_root = temp_path("workspace-data-root");
        fs::create_dir_all(&workspace_root).unwrap();
        let prepared = prepare_allowed_directory(&data_root, true).unwrap();
        assert!(prepared.is_dir());
        assert_eq!(prepared, canonicalize_for_scope(&data_root).unwrap());

        fs::remove_dir_all(workspace_root).unwrap();
        fs::remove_dir_all(data_root).unwrap();
    }
}
