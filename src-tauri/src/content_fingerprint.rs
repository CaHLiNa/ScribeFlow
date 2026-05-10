use sha2::{Digest, Sha256};

pub fn fnv1a(value: &str) -> String {
    let mut hash: u32 = 2166136261;
    for byte in value.bytes() {
        hash ^= byte as u32;
        hash = hash.wrapping_mul(16777619);
    }
    format!("{}:{:x}", value.len(), hash)
}

pub fn sha256_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let result = hasher.finalize();
    result.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
pub async fn content_fingerprint_fnv1a(value: String) -> Result<String, String> {
    Ok(fnv1a(&value))
}

#[tauri::command]
pub async fn content_fingerprint_sha256(value: String) -> Result<String, String> {
    Ok(sha256_hex(&value))
}
