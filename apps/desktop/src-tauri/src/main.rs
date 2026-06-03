#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::{LogicalSize, Manager, Size};

struct BackendState {
    child: Mutex<Option<Child>>,
    pip: Mutex<bool>,
    closing: Mutex<bool>,
    runtime_settings_snapshot: Mutex<Option<String>>,
}

#[tauri::command]
fn toggle_always_on_top(window: tauri::Window) -> Result<bool, String> {
    let current = window.is_always_on_top().map_err(|e| e.to_string())?;
    let next = !current;
    window.set_always_on_top(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn toggle_pip_mode(window: tauri::Window, state: tauri::State<BackendState>) -> Result<bool, String> {
    let mut pip = state.pip.lock().map_err(|_| "pip lock poisoned")?;
    *pip = !*pip;

    if *pip {
        window
            .set_size(Size::Logical(LogicalSize::new(520.0, 280.0)))
            .map_err(|e| e.to_string())?;
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        window.set_title("EchoPilot PiP").map_err(|e| e.to_string())?;
    } else {
        window
            .set_size(Size::Logical(LogicalSize::new(1280.0, 820.0)))
            .map_err(|e| e.to_string())?;
        window.set_title("EchoPilot").map_err(|e| e.to_string())?;
    }

    Ok(*pip)
}

#[tauri::command]
fn backend_health() -> String {
    "running".to_string()
}

#[tauri::command]
fn cache_runtime_settings_snapshot(snapshot: String, state: tauri::State<BackendState>) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&snapshot).map_err(|e| e.to_string())?;
    let mut guard = state
        .runtime_settings_snapshot
        .lock()
        .map_err(|_| "runtime settings snapshot lock poisoned")?;
    *guard = Some(snapshot);
    Ok(())
}

fn spawn_backend() -> Option<Child> {
    Command::new("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg("..\\..\\scripts\\run-core.ps1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

fn kill_backend(window: &tauri::Window) {
    let state = window.state::<BackendState>();
    let child_lock = state.child.lock();
    if let Ok(mut child) = child_lock {
        if let Some(mut process) = child.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    };
}

fn post_json_to_backend(path: &str, body: &str) -> Result<(), String> {
    let addr = ("127.0.0.1", 8765)
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .next()
        .ok_or_else(|| "failed to resolve backend address".to_string())?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(750)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_millis(750))).ok();
    stream.set_write_timeout(Some(Duration::from_millis(750))).ok();
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:8765\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body,
    );
    stream.write_all(request.as_bytes()).map_err(|e| e.to_string())?;
    let _ = stream.shutdown(Shutdown::Write);
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    if response.contains(" 200 ") || response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") {
        Ok(())
    } else {
        Err(format!("unexpected response: {}", response.lines().next().unwrap_or("no response")))
    }
}

fn persist_cached_runtime_settings(window: &tauri::Window) -> Result<(), String> {
    if let Some(snapshot) = read_runtime_settings_snapshot_from_webview(window) {
        let state = window.state::<BackendState>();
        let mut guard = state
            .runtime_settings_snapshot
            .lock()
            .map_err(|_| "runtime settings snapshot lock poisoned")?;
        *guard = Some(snapshot);
    }
    let state = window.state::<BackendState>();
    let snapshot = state
        .runtime_settings_snapshot
        .lock()
        .map_err(|_| "runtime settings snapshot lock poisoned")?
        .clone();
    let Some(snapshot) = snapshot else {
        return Ok(());
    };
    let mut last_error = None;
    for _ in 0..6 {
        match post_json_to_backend("/settings", &snapshot) {
            Ok(()) => return Ok(()),
            Err(err) => {
                last_error = Some(err);
                thread::sleep(Duration::from_millis(150));
            }
        }
    }
    Err(last_error.unwrap_or_else(|| "failed to persist runtime settings".to_string()))
}

fn read_runtime_settings_snapshot_from_webview(window: &tauri::Window) -> Option<String> {
    let webviews = window.webviews();
    let webview = webviews.first()?;
    let (tx, rx) = mpsc::channel::<Option<String>>();
    let _ = webview.eval_with_callback(
        "window.__echopilotRuntimeSettingsSnapshot ?? null",
        move |result| {
            let parsed = serde_json::from_str::<Option<String>>(&result).ok().flatten();
            let _ = tx.send(parsed);
        },
    );
    rx.recv_timeout(Duration::from_millis(700)).ok().flatten()
}

fn main() {
    tauri::Builder::default()
        .manage(BackendState {
            child: Mutex::new(spawn_backend()),
            pip: Mutex::new(false),
            closing: Mutex::new(false),
            runtime_settings_snapshot: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            toggle_always_on_top,
            toggle_pip_mode,
            backend_health,
            cache_runtime_settings_snapshot
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<BackendState>();
                let mut closing = match state.closing.lock() {
                    Ok(guard) => guard,
                    Err(_) => {
                        api.prevent_close();
                        return;
                    }
                };
                if *closing {
                    api.prevent_close();
                    return;
                }
                *closing = true;
                api.prevent_close();

                if let Some(webview) = window.webviews().first() {
                    let _ = webview.eval(
                        "if (window.__echopilotFlushRuntimeSettings) { window.__echopilotFlushRuntimeSettings(); }",
                    );
                }

                let window_for_thread = window.clone();
                let window_for_destroy = window.clone();
                thread::spawn(move || {
                    let _ = persist_cached_runtime_settings(&window_for_thread);
                    thread::sleep(Duration::from_millis(2000));
                    kill_backend(&window_for_thread);
                    let window_to_destroy = window_for_destroy.clone();
                    let _ = window_for_destroy.run_on_main_thread(move || {
                        let _ = window_to_destroy.destroy();
                    });
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
