use std::path::PathBuf;

pub const APP_DIR_NAME: &str = ".altals";

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or("Cannot find home directory".to_string())
}

pub fn data_root_dir() -> Result<PathBuf, String> {
    let home = home_dir()?;
    let altals_dir = home.join(APP_DIR_NAME);

    if !altals_dir.exists() {
        std::fs::create_dir_all(&altals_dir).map_err(|e| e.to_string())?;
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

    dirs
}
