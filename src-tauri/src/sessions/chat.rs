use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter};

use serde::Serialize;

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    _child: Box<dyn portable_pty::Child + Send>,
}

static PTY_SESSIONS: LazyLock<Mutex<HashMap<String, PtySession>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Serialize, Clone)]
struct PtyOutputPayload {
    #[serde(rename = "sessionId")]
    session_id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct PtyExitPayload {
    #[serde(rename = "sessionId")]
    session_id: String,
}

#[tauri::command]
pub fn start_pty_session(
    app: AppHandle,
    session_id: String,
    cwd: Option<String>,
    is_alive: bool,
) -> Result<(), String> {
    {
        let map = PTY_SESSIONS.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&session_id) {
            return Ok(());
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("failed to open pty: {}", e))?;

    let flag = if is_alive { "--continue" } else { "--resume" };

    let mut cmd = if cfg!(windows) {
        let mut c = CommandBuilder::new("cmd");
        c.args(["/c", "claude.cmd", flag, &session_id]);
        c
    } else {
        let mut c = CommandBuilder::new("claude");
        c.args([flag, &session_id]);
        c
    };

    if let Some(ref dir) = cwd {
        cmd.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("failed to spawn claude: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("failed to clone reader: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("failed to take writer: {}", e))?;

    let sid = session_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = app.emit(
                        "pty:output",
                        PtyOutputPayload {
                            session_id: sid.clone(),
                            data: text,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app.emit("pty:exit", PtyExitPayload { session_id: sid.clone() });
        if let Ok(mut map) = PTY_SESSIONS.lock() {
            map.remove(&sid);
        }
    });

    let mut map = PTY_SESSIONS.lock().map_err(|e| e.to_string())?;
    map.insert(
        session_id,
        PtySession {
            writer,
            master: pair.master,
            _child: child,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn write_pty_session(session_id: String, data: String) -> Result<(), String> {
    let mut map = PTY_SESSIONS.lock().map_err(|e| e.to_string())?;
    let session = map
        .get_mut(&session_id)
        .ok_or_else(|| format!("no pty session for {}", session_id))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write failed: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("flush failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn resize_pty_session(session_id: String, rows: u16, cols: u16) -> Result<(), String> {
    let map = PTY_SESSIONS.lock().map_err(|e| e.to_string())?;
    let session = map
        .get(&session_id)
        .ok_or_else(|| format!("no pty session for {}", session_id))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn stop_pty_session(session_id: String) -> Result<(), String> {
    let mut map = PTY_SESSIONS.lock().map_err(|e| e.to_string())?;
    map.remove(&session_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_errors_when_no_session() {
        let result = write_pty_session("nonexistent".into(), "hello".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no pty session"));
    }

    #[test]
    fn stop_session_is_idempotent() {
        assert!(stop_pty_session("missing".into()).is_ok());
        assert!(stop_pty_session("missing".into()).is_ok());
    }

    #[test]
    fn resize_errors_when_no_session() {
        let result = resize_pty_session("nonexistent".into(), 24, 80);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no pty session"));
    }

    #[test]
    fn pty_output_payload_serializes_camel_case() {
        let payload = PtyOutputPayload {
            session_id: "s1".into(),
            data: "hello".into(),
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["sessionId"], "s1");
        assert_eq!(json["data"], "hello");
        assert!(json.get("session_id").is_none());
    }

    #[test]
    fn pty_exit_payload_serializes_camel_case() {
        let payload = PtyExitPayload {
            session_id: "s2".into(),
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["sessionId"], "s2");
        assert!(json.get("session_id").is_none());
    }
}
