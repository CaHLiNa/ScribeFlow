use std::path::PathBuf;

pub const APP_DIR_NAME: &str = ".scribeflow";
const DATA_ROOT_ENV_VAR: &str = "SCRIBEFLOW_DATA_ROOT";

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or("Cannot find home directory".to_string())
}

pub fn data_root_dir() -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var(DATA_ROOT_ENV_VAR) {
        if value.trim().is_empty() {
            return Err(format!("{DATA_ROOT_ENV_VAR} cannot be empty"));
        }

        let override_dir = PathBuf::from(value);
        if !override_dir.exists() {
            std::fs::create_dir_all(&override_dir).map_err(|e| e.to_string())?;
        }
        return Ok(override_dir);
    }

    let home = home_dir()?;
    let scribeflow_dir = home.join(APP_DIR_NAME);

    if !scribeflow_dir.exists() {
        std::fs::create_dir_all(&scribeflow_dir).map_err(|e| e.to_string())?;
    }

    Ok(scribeflow_dir)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn data_root_dir_uses_env_override_when_present() {
        let _guard = env_lock();
        let root =
            std::env::temp_dir().join(format!("scribeflow-data-root-{}", uuid::Uuid::new_v4()));

        std::env::set_var(DATA_ROOT_ENV_VAR, &root);
        let resolved = data_root_dir().expect("data root");
        std::env::remove_var(DATA_ROOT_ENV_VAR);

        assert_eq!(resolved, root);
        assert!(resolved.exists());
    }

    #[test]
    fn data_root_dir_rejects_empty_env_override() {
        let _guard = env_lock();
        std::env::set_var(DATA_ROOT_ENV_VAR, "");
        let error = data_root_dir().expect_err("empty override should fail");
        std::env::remove_var(DATA_ROOT_ENV_VAR);

        assert!(error.contains(DATA_ROOT_ENV_VAR));
    }
}
