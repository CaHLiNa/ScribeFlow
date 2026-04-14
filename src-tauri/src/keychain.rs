const SERVICE_NAME: &str = "Altals";
const ALLOWED_KEYCHAIN_KEYS: &[&str] = &["zotero-api-key"];

fn ensure_allowed_key(key: &str) -> Result<(), String> {
    if ALLOWED_KEYCHAIN_KEYS.contains(&key) {
        Ok(())
    } else {
        Err(format!("Keychain key is not allowed: {key}"))
    }
}

#[tauri::command]
pub fn keychain_set(key: String, value: String) -> Result<(), String> {
    ensure_allowed_key(&key)?;
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_get(key: String) -> Result<Option<String>, String> {
    ensure_allowed_key(&key)?;
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn keychain_delete(key: String) -> Result<(), String> {
    ensure_allowed_key(&key)?;
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::ensure_allowed_key;

    #[test]
    fn keychain_rejects_unknown_keys() {
        let error = ensure_allowed_key("unknown-key").unwrap_err();
        assert!(error.contains("not allowed"));
    }

    #[test]
    fn keychain_accepts_zotero_key() {
        assert!(ensure_allowed_key("zotero-api-key").is_ok());
    }
}
