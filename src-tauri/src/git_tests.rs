#[cfg(test)]
mod tests {
    use crate::git_support::{map_git_clone_error, map_git_fetch_error, map_git_push_error};

    #[test]
    fn maps_windows_receive_response_timeout_to_network_error() {
        let message = "failed to receive response: 操作超时";
        assert_eq!(
            map_git_fetch_error(message),
            "Could not connect to GitHub. Check your internet connection."
        );
    }

    #[test]
    fn maps_push_rejected_to_conflict_error() {
        let message =
            "Updates were rejected because the remote contains work that you do not have locally.";
        assert_eq!(
            map_git_push_error(message),
            "CONFLICT: Remote has changes that conflict with your local commits."
        );
    }

    #[test]
    fn maps_clone_404_to_not_found_error() {
        let message = "unexpected http status code: 404";
        assert_eq!(
            map_git_clone_error(message),
            "Repository not found. Check the URL and try again."
        );
    }
}
