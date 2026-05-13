use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use url::Url;

use crate::process_utils::background_command;

const DOWNLOAD_DIRNAME: &str = "ScribeFlow";
const RELEASES_URL: &str = "https://github.com/CaHLiNa/ScribeFlow/releases";
const RELEASE_HOST: &str = "github.com";
const RELEASE_PATH_PREFIX: &str = "/CaHLiNa/ScribeFlow/releases/download/";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateDownloadResult {
    pub path: String,
    pub file_name: String,
    pub folder_path: String,
    pub bytes: u64,
}

fn trim_value_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string()
}

fn normalize_version_segment(value: Option<&str>) -> i64 {
    value
        .unwrap_or_default()
        .trim()
        .parse::<i64>()
        .unwrap_or(0)
}

fn normalize_comparable_version(version: &str) -> String {
    version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split('-')
        .next()
        .unwrap_or_default()
        .to_string()
}

fn compare_versions(current_version: &str, next_version: &str) -> i8 {
    let current = normalize_comparable_version(current_version);
    let next = normalize_comparable_version(next_version);
    let current_segments = current.split('.').collect::<Vec<_>>();
    let next_segments = next.split('.').collect::<Vec<_>>();
    let length = current_segments.len().max(next_segments.len());

    for index in 0..length {
        let left = normalize_version_segment(current_segments.get(index).copied());
        let right = normalize_version_segment(next_segments.get(index).copied());
        if left == right {
            continue;
        }
        return if left < right { -1 } else { 1 };
    }
    0
}

fn current_installer_profile() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        return "windows";
    }

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return "macos-arm";
    }

    #[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
    {
        return "macos-intel";
    }

    #[allow(unreachable_code)]
    "unknown"
}

fn installer_extension_supported(name: &str) -> bool {
    name.ends_with(".dmg") || name.ends_with(".exe") || name.ends_with(".msi")
}

fn asset_score(asset_name: &str, profile: &str) -> i64 {
    let name = asset_name.trim().to_ascii_lowercase();
    if name.is_empty() || name.ends_with(".blockmap") || name.ends_with(".sig") {
        return -1;
    }

    if profile == "windows" {
        if !name.ends_with(".exe") && !name.ends_with(".msi") {
            return -1;
        }
        let mut score = 0;
        if name.contains("windows") || name.contains("win32") || name.contains("win") {
            score += 4;
        }
        if name.contains("x64") || name.contains("x86_64") || name.contains("amd64") {
            score += 3;
        }
        if name.contains("setup") {
            score += 1;
        }
        return score;
    }

    if profile == "macos-arm" {
        if !name.ends_with(".dmg") {
            return -1;
        }
        let mut score = 0;
        if name.contains("darwin") || name.contains("macos") || name.contains("mac") {
            score += 4;
        }
        if name.contains("aarch64") || name.contains("arm64") || name.contains("apple") {
            score += 3;
        }
        if !name.contains("x86_64") && !name.contains("x64") && !name.contains("intel") {
            score += 1;
        }
        return score;
    }

    if profile == "macos-intel" {
        if !name.ends_with(".dmg") {
            return -1;
        }
        let mut score = 0;
        if name.contains("darwin") || name.contains("macos") || name.contains("mac") {
            score += 4;
        }
        if name.contains("x86_64") || name.contains("x64") || name.contains("intel") {
            score += 3;
        }
        if !name.contains("aarch64") && !name.contains("arm64") && !name.contains("apple") {
            score += 1;
        }
        return score;
    }

    if installer_extension_supported(&name) {
        0
    } else {
        -1
    }
}

fn select_installer_asset(assets: Option<&Value>) -> Option<Value> {
    let profile = current_installer_profile();
    assets
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|asset| {
            let name = trim_value_string(asset.get("name"));
            let download_url = trim_value_string(asset.get("browser_download_url"));
            let size = asset.get("size").and_then(Value::as_u64).unwrap_or(0);
            let score = asset_score(&name, profile);
            if score < 0 || name.is_empty() || download_url.is_empty() {
                return None;
            }
            if validate_release_asset_url(&download_url).is_err() {
                return None;
            }
            Some((score, size, name, download_url))
        })
        .max_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)))
        .map(|(score, size, name, download_url)| {
            json!({
                "name": name,
                "downloadUrl": download_url,
                "size": size,
                "score": score,
            })
        })
}

fn resolve_release_payload(payload: &Value, current_version: &str) -> Result<Value, String> {
    let latest_version = {
        let tag_name = trim_value_string(payload.get("tag_name"));
        if tag_name.is_empty() {
            trim_value_string(payload.get("name"))
        } else {
            tag_name
        }
    };
    if latest_version.is_empty() {
        return Err("Latest release version is unavailable.".to_string());
    }

    Ok(json!({
        "latestVersion": latest_version,
        "releaseUrl": trim_value_string(payload.get("html_url")).if_empty_then(RELEASES_URL),
        "publishedAt": trim_value_string(payload.get("published_at")),
        "installerAsset": select_installer_asset(payload.get("assets")).unwrap_or(Value::Null),
        "hasUpdate": !current_version.trim().is_empty()
            && compare_versions(current_version, &latest_version) < 0,
    }))
}

trait StringDefaultExt {
    fn if_empty_then(self, fallback: &str) -> String;
}

impl StringDefaultExt for String {
    fn if_empty_then(self, fallback: &str) -> String {
        if self.is_empty() {
            fallback.to_string()
        } else {
            self
        }
    }
}

fn app_update_download_dir() -> Result<PathBuf, String> {
    let downloads_dir =
        dirs::download_dir().ok_or_else(|| "Cannot find the Downloads directory.".to_string())?;
    Ok(downloads_dir.join(DOWNLOAD_DIRNAME))
}

fn sanitize_release_asset_name(file_name: &str) -> Result<String, String> {
    let sanitized = file_name
        .trim()
        .chars()
        .filter_map(|value| match value {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => Some('-'),
            value if value.is_control() => None,
            value => Some(value),
        })
        .collect::<String>();

    let sanitized = sanitized.trim_matches(['.', ' ']).to_string();
    if sanitized.is_empty() {
        return Err("Release asset file name is empty.".to_string());
    }

    let extension = Path::new(&sanitized)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if !matches!(extension.as_str(), "dmg" | "exe" | "msi") {
        return Err("Release asset must be a DMG, EXE, or MSI installer.".to_string());
    }

    Ok(sanitized)
}

fn validate_release_asset_url(download_url: &str) -> Result<Url, String> {
    let url = Url::parse(download_url).map_err(|_| "Release asset URL is invalid.".to_string())?;
    if url.scheme() != "https"
        || url.host_str() != Some(RELEASE_HOST)
        || !url.path().starts_with(RELEASE_PATH_PREFIX)
    {
        return Err("Release asset URL is not a ScribeFlow GitHub release asset.".to_string());
    }
    Ok(url)
}

fn reveal_path_in_file_manager(target: &Path) -> Result<(), String> {
    if !target.exists() {
        return Err("Path does not exist.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = background_command("open");
        if target.is_file() {
            command.arg("-R");
        }
        command.arg(target);
        let status = command.status().map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in Finder: {status}"));
    }

    #[cfg(target_os = "windows")]
    {
        let normalized = target.to_string_lossy().replace('/', "\\");
        let mut command = background_command("explorer");
        if target.is_file() {
            command.arg("/select,");
            command.arg(&normalized);
        } else {
            command.arg(&normalized);
        }
        let status = command.status().map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in Explorer: {status}"));
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let open_target = if target.is_file() {
            target
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| target.to_path_buf())
        } else {
            target.to_path_buf()
        };
        let status = background_command("xdg-open")
            .arg(open_target)
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in file manager: {status}"));
    }
}

#[tauri::command]
pub async fn app_update_release_resolve(
    current_version: String,
    payload: Value,
) -> Result<Value, String> {
    resolve_release_payload(&payload, &current_version)
}

#[tauri::command]
pub async fn app_update_download_asset(
    app: tauri::AppHandle,
    download_url: String,
    file_name: String,
) -> Result<AppUpdateDownloadResult, String> {
    let url = validate_release_asset_url(&download_url)?;
    let file_name = sanitize_release_asset_name(&file_name)?;
    let download_dir = app_update_download_dir()?;
    fs::create_dir_all(&download_dir)
        .map_err(|error| format!("Cannot create download directory: {error}"))?;

    let destination_path = download_dir.join(&file_name);
    let temporary_path = download_dir.join(format!("{file_name}.download"));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .get(url)
        .header("User-Agent", "ScribeFlow updater")
        .send()
        .await
        .map_err(|error| format!("Download failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut last_percent: u32 = 0;
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(&temporary_path)
        .map_err(|error| format!("Cannot create download file: {error}"))?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Download error: {error}"))?;
        file.write_all(&chunk)
            .map_err(|error| format!("Write error: {error}"))?;
        downloaded += chunk.len() as u64;

        let percent = if total_bytes > 0 {
            ((downloaded as f64 / total_bytes as f64) * 100.0).round() as u32
        } else {
            0
        };
        if percent != last_percent {
            last_percent = percent;
            let _ = app.emit(
                "app-update-download-progress",
                serde_json::json!({
                    "percent": percent,
                    "downloadedBytes": downloaded,
                    "totalBytes": total_bytes,
                    "fileName": file_name,
                }),
            );
        }
    }

    file.flush()
        .map_err(|error| format!("Flush download file failed: {error}"))?;
    drop(file);

    if destination_path.exists() {
        fs::remove_file(&destination_path)
            .map_err(|error| format!("Cannot replace existing installer: {error}"))?;
    }
    fs::rename(&temporary_path, &destination_path)
        .map_err(|error| format!("Cannot finalize download: {error}"))?;

    Ok(AppUpdateDownloadResult {
        path: destination_path.to_string_lossy().to_string(),
        file_name,
        folder_path: download_dir.to_string_lossy().to_string(),
        bytes: downloaded,
    })
}

#[tauri::command]
pub async fn app_update_reveal_download(path: String) -> Result<(), String> {
    let download_dir = app_update_download_dir()?;
    let target = PathBuf::from(path);
    let canonical_download_dir = download_dir
        .canonicalize()
        .map_err(|error| format!("Cannot resolve download directory: {error}"))?;
    let canonical_target = target
        .canonicalize()
        .map_err(|error| format!("Cannot resolve downloaded file: {error}"))?;
    if !canonical_target.starts_with(&canonical_download_dir) {
        return Err("Only ScribeFlow update downloads can be revealed.".to_string());
    }
    reveal_path_in_file_manager(&canonical_target)
}

#[cfg(test)]
mod tests {
    use super::{
        compare_versions, resolve_release_payload, sanitize_release_asset_name,
        validate_release_asset_url,
    };
    use serde_json::json;

    #[test]
    fn validates_scribeflow_release_asset_urls() {
        assert!(validate_release_asset_url(
            "https://github.com/CaHLiNa/ScribeFlow/releases/download/v1.0.16/ScribeFlow-1.0.16-darwin-aarch64.dmg"
        )
        .is_ok());
        assert!(validate_release_asset_url("https://example.com/file.dmg").is_err());
    }

    #[test]
    fn sanitizes_installer_asset_names() {
        assert_eq!(
            sanitize_release_asset_name("ScribeFlow:1.0.16?.dmg").expect("valid name"),
            "ScribeFlow-1.0.16-.dmg"
        );
        assert!(sanitize_release_asset_name("../payload.sh").is_err());
    }

    #[test]
    fn compares_release_versions_without_js_rules() {
        assert_eq!(compare_versions("1.0.17", "v1.0.18"), -1);
        assert_eq!(compare_versions("v1.0.18", "1.0.18-beta.1"), 0);
        assert_eq!(compare_versions("1.2.0", "1.1.9"), 1);
    }

    #[test]
    fn resolves_release_payload_and_filters_installer_assets() {
        let resolved = resolve_release_payload(
            &json!({
                "tag_name": "v1.0.19",
                "html_url": "https://github.com/CaHLiNa/ScribeFlow/releases/tag/v1.0.19",
                "published_at": "2026-05-13T00:00:00Z",
                "assets": [
                    {
                        "name": "ScribeFlow-1.0.19.sig",
                        "browser_download_url": "https://github.com/CaHLiNa/ScribeFlow/releases/download/v1.0.19/ScribeFlow-1.0.19.sig",
                        "size": 999999
                    },
                    {
                        "name": "ScribeFlow-1.0.19.dmg",
                        "browser_download_url": "https://example.com/ScribeFlow-1.0.19.dmg",
                        "size": 999999
                    },
                    {
                        "name": "ScribeFlow-1.0.19.dmg",
                        "browser_download_url": "https://github.com/CaHLiNa/ScribeFlow/releases/download/v1.0.19/ScribeFlow-1.0.19.dmg",
                        "size": 100
                    }
                ]
            }),
            "1.0.18",
        )
        .expect("resolve release payload");

        assert_eq!(resolved["latestVersion"], "v1.0.19");
        assert_eq!(resolved["hasUpdate"].as_bool(), Some(true));
        assert_eq!(resolved["publishedAt"], "2026-05-13T00:00:00Z");
        assert_eq!(
            resolved["installerAsset"]["downloadUrl"],
            "https://github.com/CaHLiNa/ScribeFlow/releases/download/v1.0.19/ScribeFlow-1.0.19.dmg"
        );
    }

    #[test]
    fn release_payload_requires_version() {
        assert!(resolve_release_payload(&json!({ "assets": [] }), "1.0.0").is_err());
    }
}
