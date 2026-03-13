use std::path::PathBuf;

pub const APP_DIR_NAME: &str = ".altals";
pub const LEGACY_APP_DIR_NAME: &str = ".shoulders";

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or("Cannot find home directory".to_string())
}

pub fn legacy_data_root_dir() -> Option<PathBuf> {
    home_dir()
        .ok()
        .map(|home| home.join(LEGACY_APP_DIR_NAME))
        .filter(|path| path.exists())
}

pub fn data_root_dir() -> Result<PathBuf, String> {
    let home = home_dir()?;
    let altals_dir = home.join(APP_DIR_NAME);
    let legacy_dir = home.join(LEGACY_APP_DIR_NAME);

    if !altals_dir.exists() {
        if legacy_dir.exists() {
            if let Err(error) = std::fs::rename(&legacy_dir, &altals_dir) {
                eprintln!(
                    "[altals] Failed to migrate legacy data dir {} -> {}: {}",
                    legacy_dir.to_string_lossy(),
                    altals_dir.to_string_lossy(),
                    error
                );
                std::fs::create_dir_all(&altals_dir).map_err(|e| e.to_string())?;
            }
        } else {
            std::fs::create_dir_all(&altals_dir).map_err(|e| e.to_string())?;
        }
    }

    Ok(altals_dir)
}

pub fn bin_dir() -> Result<PathBuf, String> {
    let dir = data_root_dir()?.join("bin");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

pub fn candidate_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Ok(root) = data_root_dir() {
        dirs.push(root.join("bin"));
    }

    if let Some(legacy_root) = legacy_data_root_dir() {
        let legacy_bin = legacy_root.join("bin");
        if !dirs.contains(&legacy_bin) {
            dirs.push(legacy_bin);
        }
    }

    dirs
}
