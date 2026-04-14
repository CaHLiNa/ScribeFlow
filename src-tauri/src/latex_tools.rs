use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::app_dirs;
use crate::process_utils::background_command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryStatus {
    pub installed: bool,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexCompilerStatus {
    pub tectonic: BinaryStatus,
    pub system_tex: BinaryStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexToolStatus {
    pub chktex: BinaryStatus,
    pub latexindent: BinaryStatus,
}

pub fn altals_bin_dir() -> Option<PathBuf> {
    app_dirs::bin_dir().ok()
}

fn lookup_binary_on_path(binary_name: &str) -> Option<String> {
    #[cfg(unix)]
    {
        let output = background_command("/bin/bash")
            .args(["-lc", &format!("which {binary_name}")])
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
        let output = background_command("where").arg(binary_name).output().ok()?;
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

fn find_binary_in_sibling_dir(base_binary_path: &str, names: &[&str]) -> Option<String> {
    let parent = Path::new(base_binary_path).parent()?;
    for name in names {
        let sibling = parent.join(name);
        if sibling.exists() {
            return Some(sibling.to_string_lossy().to_string());
        }
    }
    None
}

fn find_binary_in_candidates(candidates: &[&str]) -> Option<String> {
    for path in candidates {
        if Path::new(path).exists() {
            return Some((*path).to_string());
        }
    }
    None
}

pub fn tectonic_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "tectonic.exe"
    } else {
        "tectonic"
    }
}

pub fn find_tectonic(custom_path: Option<&str>) -> Option<String> {
    if let Some(path) = custom_path.filter(|value| !value.trim().is_empty()) {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    for bin_dir in app_dirs::candidate_bin_dirs() {
        let path = bin_dir.join(tectonic_binary_name());
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    #[cfg(unix)]
    {
        if let Some(path) = find_binary_in_candidates(&[
            "/opt/homebrew/bin/tectonic",
            "/usr/local/bin/tectonic",
            "/usr/bin/tectonic",
        ]) {
            return Some(path);
        }

        if let Ok(home) = std::env::var("HOME") {
            let cargo_path = format!("{home}/.cargo/bin/tectonic");
            if Path::new(&cargo_path).exists() {
                return Some(cargo_path);
            }
        }
    }

    lookup_binary_on_path("tectonic")
}

pub fn find_system_tex(custom_path: Option<&str>) -> Option<String> {
    if let Some(path) = custom_path.filter(|value| !value.trim().is_empty()) {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    #[cfg(unix)]
    {
        if let Some(path) = find_binary_in_candidates(&[
            "/Library/TeX/texbin/latexmk",
            "/opt/homebrew/bin/latexmk",
            "/usr/local/bin/latexmk",
            "/usr/bin/latexmk",
        ]) {
            return Some(path);
        }
    }

    lookup_binary_on_path("latexmk")
}

pub fn find_chktex(custom_system_tex_path: Option<&str>) -> Option<String> {
    if let Some(system_tex_path) = custom_system_tex_path.filter(|value| !value.trim().is_empty()) {
        if let Some(path) = find_binary_in_sibling_dir(system_tex_path, &["chktex", "chktex.exe"]) {
            return Some(path);
        }
    }

    #[cfg(unix)]
    {
        if let Some(path) = find_binary_in_candidates(&[
            "/Library/TeX/texbin/chktex",
            "/opt/homebrew/bin/chktex",
            "/usr/local/bin/chktex",
            "/usr/bin/chktex",
        ]) {
            return Some(path);
        }
    }

    lookup_binary_on_path("chktex")
}

pub fn find_latexindent(custom_system_tex_path: Option<&str>) -> Option<String> {
    if let Some(system_tex_path) = custom_system_tex_path.filter(|value| !value.trim().is_empty()) {
        if let Some(path) = find_binary_in_sibling_dir(
            system_tex_path,
            &[
                "latexindent",
                "latexindent.pl",
                "latexindent.exe",
                "latexindent.cmd",
            ],
        ) {
            return Some(path);
        }
    }

    #[cfg(unix)]
    {
        if let Some(path) = find_binary_in_candidates(&[
            "/Library/TeX/texbin/latexindent",
            "/Library/TeX/texbin/latexindent.pl",
            "/opt/homebrew/bin/latexindent",
            "/opt/homebrew/bin/latexindent.pl",
            "/usr/local/bin/latexindent",
            "/usr/local/bin/latexindent.pl",
            "/usr/bin/latexindent",
            "/usr/bin/latexindent.pl",
        ]) {
            return Some(path);
        }
    }

    #[cfg(unix)]
    {
        let output = background_command("/bin/bash")
            .args(["-lc", "which latexindent || which latexindent.pl"])
            .output()
            .ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
        None
    }

    #[cfg(windows)]
    {
        let output = background_command("where")
            .args([
                "latexindent",
                "latexindent.pl",
                "latexindent.exe",
                "latexindent.cmd",
            ])
            .output()
            .ok()?;
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
        None
    }
}

fn synctex_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "synctex.exe"
    } else {
        "synctex"
    }
}

pub fn find_synctex(custom_system_tex_path: Option<&str>) -> Option<String> {
    if let Some(system_tex_path) = custom_system_tex_path.filter(|value| !value.trim().is_empty()) {
        if let Some(path) = find_binary_in_sibling_dir(system_tex_path, &[synctex_binary_name()]) {
            return Some(path);
        }
    }

    #[cfg(unix)]
    {
        if let Some(path) = find_binary_in_candidates(&[
            "/Library/TeX/texbin/synctex",
            "/opt/homebrew/bin/synctex",
            "/usr/local/bin/synctex",
            "/usr/bin/synctex",
        ]) {
            return Some(path);
        }
    }

    lookup_binary_on_path("synctex")
}

pub fn binary_status(path: Option<String>) -> BinaryStatus {
    BinaryStatus {
        installed: path.is_some(),
        path,
    }
}
