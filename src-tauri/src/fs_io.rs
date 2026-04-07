use std::fs;
use std::path::Path;

pub const FILE_TOO_LARGE_ERROR_CODE: &str = "FILE_TOO_LARGE";

pub fn format_file_too_large_error(max_bytes: u64, actual_bytes: u64) -> String {
    format!("{FILE_TOO_LARGE_ERROR_CODE}:{max_bytes}:{actual_bytes}")
}

pub fn read_text_file_with_limit(path: &Path, max_bytes: Option<u64>) -> Result<String, String> {
    if let Some(limit) = max_bytes {
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        if metadata.len() > limit {
            return Err(format_file_too_large_error(limit, metadata.len()));
        }
    }

    fs::read_to_string(path).map_err(|e| e.to_string())
}
