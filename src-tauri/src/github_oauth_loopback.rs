use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use url::Url;
use uuid::Uuid;

const LOOPBACK_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const SESSION_NOT_FOUND_ERROR: &str = "GitHub loopback callback expired. Please try connecting again.";

#[derive(Default)]
pub struct GitHubOAuthLoopbackState {
    sessions: Arc<Mutex<HashMap<String, GitHubOAuthLoopbackSession>>>,
}

struct GitHubOAuthLoopbackSession {
    expires_at: Instant,
    result: Option<GitHubOAuthLoopbackResult>,
}

#[derive(Clone)]
struct GitHubOAuthLoopbackResult {
    token: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubOAuthLoopbackStart {
    session_id: String,
    return_to: String,
}

#[derive(Serialize)]
pub struct GitHubOAuthLoopbackPoll {
    pending: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
pub fn github_oauth_start_loopback(
    state: tauri::State<'_, GitHubOAuthLoopbackState>,
) -> Result<GitHubOAuthLoopbackStart, String> {
    cleanup_expired_sessions(&state.sessions);

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Failed to bind GitHub loopback listener: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Failed to configure GitHub loopback listener: {error}"))?;

    let session_id = Uuid::new_v4().to_string();
    let addr = listener
        .local_addr()
        .map_err(|error| format!("Failed to inspect GitHub loopback listener: {error}"))?;
    let return_to = format!(
        "http://127.0.0.1:{}/auth/github/callback?session_id={}",
        addr.port(),
        session_id
    );
    let expires_at = Instant::now() + LOOPBACK_TIMEOUT;

    {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "GitHub loopback state is unavailable".to_string())?;
        sessions.insert(
            session_id.clone(),
            GitHubOAuthLoopbackSession {
                expires_at,
                result: None,
            },
        );
    }

    let sessions = state.sessions.clone();
    let thread_session_id = session_id.clone();
    thread::spawn(move || run_loopback_listener(listener, sessions, thread_session_id, expires_at));

    Ok(GitHubOAuthLoopbackStart {
        session_id,
        return_to,
    })
}

#[tauri::command]
pub fn github_oauth_poll_loopback(
    session_id: String,
    state: tauri::State<'_, GitHubOAuthLoopbackState>,
) -> Result<GitHubOAuthLoopbackPoll, String> {
    cleanup_expired_sessions(&state.sessions);

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "GitHub loopback state is unavailable".to_string())?;

    let Some(session) = sessions.get_mut(&session_id) else {
        return Ok(GitHubOAuthLoopbackPoll {
            pending: false,
            token: None,
            error: Some(SESSION_NOT_FOUND_ERROR.to_string()),
        });
    };

    if let Some(result) = session.result.take() {
        sessions.remove(&session_id);
        return Ok(GitHubOAuthLoopbackPoll {
            pending: false,
            token: result.token,
            error: result.error,
        });
    }

    Ok(GitHubOAuthLoopbackPoll {
        pending: true,
        token: None,
        error: None,
    })
}

fn cleanup_expired_sessions(
    sessions: &Arc<Mutex<HashMap<String, GitHubOAuthLoopbackSession>>>,
) {
    let Ok(mut sessions) = sessions.lock() else {
        return;
    };

    let now = Instant::now();
    sessions.retain(|_, session| session.expires_at > now || session.result.is_some());
}

fn run_loopback_listener(
    listener: TcpListener,
    sessions: Arc<Mutex<HashMap<String, GitHubOAuthLoopbackSession>>>,
    session_id: String,
    expires_at: Instant,
) {
    loop {
        if Instant::now() >= expires_at {
            store_loopback_result(
                &sessions,
                &session_id,
                GitHubOAuthLoopbackResult {
                    token: None,
                    error: Some("GitHub loopback timed out".into()),
                },
            );
            return;
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                if let Some(result) = read_loopback_request(&mut stream, &session_id) {
                    write_loopback_response(&mut stream, result.error.is_none());
                    store_loopback_result(&sessions, &session_id, result);
                    return;
                }

                write_not_found_response(&mut stream);
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => {
                store_loopback_result(
                    &sessions,
                    &session_id,
                    GitHubOAuthLoopbackResult {
                        token: None,
                        error: Some(format!("GitHub loopback listener failed: {error}")),
                    },
                );
                return;
            }
        }
    }
}

fn read_loopback_request(
    stream: &mut TcpStream,
    expected_session_id: &str,
) -> Option<GitHubOAuthLoopbackResult> {
    let mut buffer = [0u8; 8192];
    let bytes_read = stream.read(&mut buffer).ok()?;
    if bytes_read == 0 {
        return None;
    }

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_line = request.lines().next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    if method != "GET" {
        return None;
    }

    let url = Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    if url.path() != "/auth/github/callback" {
        return None;
    }

    let session_id = url.query_pairs().find_map(|(key, value)| {
        if key == "session_id" {
            Some(value.to_string())
        } else {
            None
        }
    })?;

    if session_id != expected_session_id {
        return Some(GitHubOAuthLoopbackResult {
            token: None,
            error: Some("GitHub loopback session mismatch".into()),
        });
    }

    let token = url.query_pairs().find_map(|(key, value)| {
        if key == "token" {
            Some(value.to_string())
        } else {
            None
        }
    });
    let error = url.query_pairs().find_map(|(key, value)| {
        if key == "error" {
            Some(value.to_string())
        } else {
            None
        }
    });

    if token.is_none() && error.is_none() {
        return Some(GitHubOAuthLoopbackResult {
            token: None,
            error: Some("GitHub loopback callback did not include a token".into()),
        });
    }

    Some(GitHubOAuthLoopbackResult { token, error })
}

fn store_loopback_result(
    sessions: &Arc<Mutex<HashMap<String, GitHubOAuthLoopbackSession>>>,
    session_id: &str,
    result: GitHubOAuthLoopbackResult,
) {
    let Ok(mut sessions) = sessions.lock() else {
        return;
    };

    if let Some(session) = sessions.get_mut(session_id) {
        session.result = Some(result);
        session.expires_at = Instant::now() + Duration::from_secs(30);
    }
}

fn write_loopback_response(stream: &mut TcpStream, success: bool) {
    let title = if success {
        "GitHub Connected"
    } else {
        "GitHub Sign-in Failed"
    };
    let message = if success {
        "Altals received the callback. You can return to the desktop app."
    } else {
        "Altals could not finish the callback. Return to the desktop app and try again."
    };
    let body = format!(
        "<!DOCTYPE html><html><head><title>{title}</title></head><body style=\"font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1b26;color:#c0caf5;\"><div style=\"text-align:center;max-width:420px;padding:24px;\"><h2 style=\"margin:0 0 12px;\">{title}</h2><p style=\"margin:0;line-height:1.5;\">{message}</p></div><script>setTimeout(() => window.close(), 2500)</script></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn write_not_found_response(stream: &mut TcpStream) {
    let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}
