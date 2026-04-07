use crate::git_support::{
    make_callbacks, map_git_clone_error, map_git_fetch_error, map_git_push_branch_error,
    map_git_push_error, open_repo,
};
#[cfg(windows)]
use crate::git_support::run_git_authenticated;
use git2::{FetchOptions, PushOptions};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct AheadBehind {
    pub ahead: usize,
    pub behind: usize,
}

#[tauri::command]
pub async fn git_remote_add(repo_path: String, name: String, url: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    repo.remote(&name, &url)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn git_remote_get_url(repo_path: String) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;
    let result = match repo.find_remote("origin") {
        Ok(remote) => remote.url().unwrap_or("").to_string(),
        Err(_) => String::new(),
    };
    Ok(result)
}

#[tauri::command]
pub async fn git_remote_remove(repo_path: String, name: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    repo.remote_delete(&name)
        .map_err(|e| e.message().to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn git_push(
    repo_path: String,
    remote: String,
    branch: String,
    token: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let args = vec![
            String::from("push"),
            remote,
            format!("refs/heads/{branch}:refs/heads/{branch}"),
        ];
        run_git_authenticated(Some(&repo_path), &token, &args)
            .map(|_| ())
            .map_err(|e| map_git_push_error(&e))?;
        return Ok(());
    }

    let repo = open_repo(&repo_path)?;
    let mut remote_obj = repo
        .find_remote(&remote)
        .map_err(|e| e.message().to_string())?;

    let callbacks = make_callbacks(&token);
    let mut opts = PushOptions::new();
    opts.remote_callbacks(callbacks);

    let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);
    remote_obj
        .push(&[&refspec], Some(&mut opts))
        .map_err(|e| map_git_push_error(e.message()))?;

    Ok(())
}

#[tauri::command]
pub async fn git_push_branch(
    repo_path: String,
    remote: String,
    local_branch: String,
    remote_branch: String,
    token: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let args = vec![
            String::from("push"),
            remote,
            format!("refs/heads/{local_branch}:refs/heads/{remote_branch}"),
        ];
        run_git_authenticated(Some(&repo_path), &token, &args)
            .map(|_| ())
            .map_err(|e| map_git_push_branch_error(&e))?;
        return Ok(());
    }

    let repo = open_repo(&repo_path)?;
    let mut remote_obj = repo
        .find_remote(&remote)
        .map_err(|e| e.message().to_string())?;

    let callbacks = make_callbacks(&token);
    let mut opts = PushOptions::new();
    opts.remote_callbacks(callbacks);

    let refspec = format!("refs/heads/{}:refs/heads/{}", local_branch, remote_branch);
    remote_obj
        .push(&[&refspec], Some(&mut opts))
        .map_err(|e| map_git_push_branch_error(e.message()))?;

    Ok(())
}

#[tauri::command]
pub async fn git_fetch(repo_path: String, remote: String, token: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let args = vec![String::from("fetch"), String::from("--prune"), remote];
        run_git_authenticated(Some(&repo_path), &token, &args)
            .map(|_| ())
            .map_err(|e| map_git_fetch_error(&e))?;
        return Ok(());
    }

    let repo = open_repo(&repo_path)?;
    let mut remote_obj = repo
        .find_remote(&remote)
        .map_err(|e| e.message().to_string())?;

    let callbacks = make_callbacks(&token);
    let mut opts = FetchOptions::new();
    opts.remote_callbacks(callbacks);

    remote_obj
        .fetch(&[] as &[&str], Some(&mut opts), None)
        .map_err(|e| map_git_fetch_error(e.message()))?;

    Ok(())
}

#[tauri::command]
pub async fn git_ahead_behind(repo_path: String) -> Result<AheadBehind, String> {
    let repo = open_repo(&repo_path)?;

    let head = repo.head().map_err(|e| e.message().to_string())?;
    let local_oid = head
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?
        .id();

    let branch_name = head.shorthand().unwrap_or("main");
    let upstream_ref = format!("refs/remotes/origin/{}", branch_name);
    let upstream = repo
        .find_reference(&upstream_ref)
        .map_err(|_| format!("No upstream tracking branch found for '{}'", branch_name))?;
    let remote_oid = upstream
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?
        .id();

    let (ahead, behind) = repo
        .graph_ahead_behind(local_oid, remote_oid)
        .map_err(|e| e.message().to_string())?;

    Ok(AheadBehind { ahead, behind })
}

#[tauri::command]
pub async fn git_pull_ff(
    repo_path: String,
    remote: String,
    branch: String,
    token: String,
) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;

    #[cfg(not(windows))]
    {
        let mut remote_obj = repo
            .find_remote(&remote)
            .map_err(|e| e.message().to_string())?;
        let callbacks = make_callbacks(&token);
        let mut opts = FetchOptions::new();
        opts.remote_callbacks(callbacks);
        remote_obj
            .fetch(&[] as &[&str], Some(&mut opts), None)
            .map_err(|e| map_git_fetch_error(e.message()))?;
    }

    #[cfg(windows)]
    {
        let args = vec![
            String::from("fetch"),
            String::from("--prune"),
            remote.clone(),
        ];
        run_git_authenticated(Some(&repo_path), &token, &args)
            .map_err(|e| map_git_fetch_error(&e))?;
    }

    let fetch_head_ref = format!("refs/remotes/{}/{}", remote, branch);
    let fetch_commit = repo
        .find_reference(&fetch_head_ref)
        .map_err(|e| format!("Could not find remote branch: {}", e.message()))?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    let head = repo.head().map_err(|e| e.message().to_string())?;
    let head_commit = head.peel_to_commit().map_err(|e| e.message().to_string())?;

    let (_, behind) = repo
        .graph_ahead_behind(head_commit.id(), fetch_commit.id())
        .map_err(|e| e.message().to_string())?;

    if behind == 0 {
        return Ok(());
    }

    let analysis = repo
        .merge_analysis(&[&repo
            .find_annotated_commit(fetch_commit.id())
            .map_err(|e| e.message().to_string())?])
        .map_err(|e| e.message().to_string())?;

    if !analysis.0.is_fast_forward() && !analysis.0.is_up_to_date() {
        return Err("CONFLICT: Cannot fast-forward. Local and remote have diverged.".to_string());
    }

    if analysis.0.is_up_to_date() {
        return Ok(());
    }

    let local_ref_name = format!("refs/heads/{}", branch);
    let mut local_ref = repo
        .find_reference(&local_ref_name)
        .map_err(|e| e.message().to_string())?;
    local_ref
        .set_target(fetch_commit.id(), "fast-forward pull")
        .map_err(|e| e.message().to_string())?;

    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
        .map_err(|e| e.message().to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn git_merge_remote(
    repo_path: String,
    remote: String,
    branch: String,
) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;

    let fetch_ref = format!("refs/remotes/{}/{}", remote, branch);
    let remote_ref = repo
        .find_reference(&fetch_ref)
        .map_err(|e| format!("Could not find remote branch: {}", e.message()))?;
    let remote_commit = remote_ref
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    let annotated = repo
        .find_annotated_commit(remote_commit.id())
        .map_err(|e| e.message().to_string())?;

    let mut merge_opts = git2::MergeOptions::new();
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.safe();

    repo.merge(
        &[&annotated],
        Some(&mut merge_opts),
        Some(&mut checkout_opts),
    )
    .map_err(|e| format!("CONFLICT: {}", e.message()))?;

    let index = repo.index().map_err(|e| e.message().to_string())?;
    if index.has_conflicts() {
        if let Ok(head) = repo.head() {
            if let Ok(commit) = head.peel_to_commit() {
                let _ = repo.reset(commit.as_object(), git2::ResetType::Hard, None);
            }
        }
        let _ = repo.cleanup_state();
        return Err(
            "CONFLICT: Files have conflicting changes that need manual resolution.".to_string(),
        );
    }

    let sig = repo
        .signature()
        .unwrap_or_else(|_| git2::Signature::now("Altals", "altals@local").unwrap());

    let mut index = repo.index().map_err(|e| e.message().to_string())?;
    let tree_oid = index.write_tree().map_err(|e| e.message().to_string())?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| e.message().to_string())?;

    let head_commit = repo
        .head()
        .map_err(|e| e.message().to_string())?
        .peel_to_commit()
        .map_err(|e| e.message().to_string())?;

    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &format!("Merge remote changes from {}/{}", remote, branch),
        &tree,
        &[&head_commit, &remote_commit],
    )
    .map_err(|e| e.message().to_string())?;

    let _ = repo.cleanup_state();

    Ok(())
}

#[tauri::command]
pub async fn git_clone_authenticated(
    url: String,
    target_path: String,
    token: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let args = vec![String::from("clone"), url, target_path];
        run_git_authenticated(None, &token, &args)
            .map(|_| ())
            .map_err(|e| map_git_clone_error(&e))?;
        return Ok(());
    }

    let callbacks = make_callbacks(&token);
    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);

    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_opts);

    builder
        .clone(&url, Path::new(&target_path))
        .map_err(|e| map_git_clone_error(e.message()))?;
    Ok(())
}
