use crate::git_support::{
    is_missing_git_identity_error, map_git_clone_error, normalize_repo_path, open_repo,
    run_git_commit_text, run_git_init, run_git_text,
};
use git2::Repository;

#[tauri::command]
pub async fn git_init(repo_path: String) -> Result<(), String> {
    let normalized = normalize_repo_path(&repo_path)?;
    Repository::init(&normalized)
        .map(|_| ())
        .or_else(|_| run_git_init(&normalized))
}

#[tauri::command]
pub async fn git_clone(url: String, target_path: String) -> Result<(), String> {
    Repository::clone(&url, &target_path).map_err(|e| map_git_clone_error(e.message()))?;
    Ok(())
}

#[tauri::command]
pub async fn git_add_all(repo_path: String) -> Result<(), String> {
    run_git_text(&repo_path, &[String::from("add"), String::from("-A")]).map(|_| ())
}

#[tauri::command]
pub async fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    if let Err(error) = run_git_commit_text(&repo_path, &message, None) {
        if !is_missing_git_identity_error(&error) {
            return Err(error);
        }

        run_git_commit_text(&repo_path, &message, Some(("Altals", "altals@local")))?;
    }

    let head = run_git_text(
        &repo_path,
        &[String::from("rev-parse"), String::from("HEAD")],
    )?;
    Ok(head.trim().to_string())
}

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<String, String> {
    run_git_text(
        &repo_path,
        &[
            String::from("status"),
            String::from("--porcelain=v1"),
            String::from("-uall"),
        ],
    )
}

#[tauri::command]
pub async fn git_branch(repo_path: String) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;
    let result = match repo.head() {
        Ok(head) => head.shorthand().unwrap_or("HEAD").to_string(),
        Err(_) => String::new(),
    };
    Ok(result)
}

#[tauri::command]
pub async fn git_set_user(repo_path: String, name: String, email: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    let mut config = repo.config().map_err(|e| e.message().to_string())?;
    config
        .set_str("user.name", &name)
        .map_err(|e| e.message().to_string())?;
    config
        .set_str("user.email", &email)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}
