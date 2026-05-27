//! Persistent interactive chat with the Claude CLI.
//!
//! Spawns `claude` as a child process per session and keeps stdin open so
//! the user can stream multiple turns. stdout lines are forwarded to the
//! frontend via the `chat:output` Tauri event; EOF emits `chat:done`.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{LazyLock, Mutex};
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

struct ChatProcess {
    child: Child,
    stdin: std::process::ChildStdin,
}

static CHAT_PROCESSES: LazyLock<Mutex<HashMap<String, ChatProcess>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn claude_cli_name() -> &'static str {
    if cfg!(windows) { "claude.cmd" } else { "claude" }
}

#[derive(Serialize, Clone)]
struct ChatOutputPayload {
    #[serde(rename = "sessionId")]
    session_id: String,
    text: String,
}

#[derive(Serialize, Clone)]
struct ChatDonePayload {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "exitCode")]
    exit_code: Option<i32>,
    stderr: String,
}

#[tauri::command]
pub fn start_chat_session(
    session_id: String,
    cwd: Option<String>,
    is_alive: bool,
    app: AppHandle,
) -> Result<(), String> {
    {
        let map = CHAT_PROCESSES.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&session_id) {
            return Ok(());
        }
    }

    let flag = if is_alive { "--continue" } else { "--resume" };
    let mut cmd = Command::new(claude_cli_name());
    cmd.arg(flag)
        .arg(&session_id)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(ref dir) = cwd {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn claude: {}", e))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "no stdin on child".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "no stdout on child".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "no stderr on child".to_string())?;

    // Drain stderr in a background thread into a shared buffer so it can
    // be included in the chat:done payload when the child exits.
    let stderr_buf: std::sync::Arc<Mutex<String>> =
        std::sync::Arc::new(Mutex::new(String::new()));
    let stderr_buf_thread = stderr_buf.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            if let Ok(mut buf) = stderr_buf_thread.lock() {
                buf.push_str(&line);
                buf.push('\n');
            }
        }
    });

    let sid_for_thread = session_id.clone();
    let app_for_thread = app.clone();
    let stderr_buf_done = stderr_buf.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let _ = app_for_thread.emit(
                        "chat:output",
                        ChatOutputPayload {
                            session_id: sid_for_thread.clone(),
                            text,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        // stdout EOF — wait for child to exit so we can report exit code.
        let exit_code = if let Ok(mut map) = CHAT_PROCESSES.lock() {
            map.remove(&sid_for_thread)
                .and_then(|mut p| p.child.wait().ok())
                .and_then(|s| s.code())
        } else {
            None
        };
        let stderr_text = stderr_buf_done
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default();
        let _ = app_for_thread.emit(
            "chat:done",
            ChatDonePayload {
                session_id: sid_for_thread.clone(),
                exit_code,
                stderr: stderr_text,
            },
        );
    });

    let mut map = CHAT_PROCESSES.lock().map_err(|e| e.to_string())?;
    map.insert(session_id, ChatProcess { child, stdin });
    Ok(())
}

#[tauri::command]
pub fn send_chat_message(session_id: String, message: String) -> Result<(), String> {
    let mut map = CHAT_PROCESSES.lock().map_err(|e| e.to_string())?;
    let proc = map
        .get_mut(&session_id)
        .ok_or_else(|| format!("no chat session for {}", session_id))?;
    proc.stdin
        .write_all(message.as_bytes())
        .map_err(|e| format!("write failed: {}", e))?;
    proc.stdin
        .write_all(b"\n")
        .map_err(|e| format!("write newline failed: {}", e))?;
    proc.stdin
        .flush()
        .map_err(|e| format!("flush failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn stop_chat_session(session_id: String) -> Result<(), String> {
    let mut map = CHAT_PROCESSES.lock().map_err(|e| e.to_string())?;
    if let Some(mut proc) = map.remove(&session_id) {
        let _ = proc.child.kill();
    }
    Ok(())
}
