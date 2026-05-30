#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, Size, LogicalSize};

struct BackendState {
    child: Mutex<Option<Child>>,
    pip: Mutex<bool>,
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
        window.set_size(Size::Logical(LogicalSize::new(520.0, 280.0))).map_err(|e| e.to_string())?;
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        window.set_title("Realtime System Transcriber PiP").map_err(|e| e.to_string())?;
    } else {
        window.set_size(Size::Logical(LogicalSize::new(1280.0, 820.0))).map_err(|e| e.to_string())?;
        window.set_title("Realtime System Transcriber").map_err(|e| e.to_string())?;
    }

    Ok(*pip)
}

#[tauri::command]
fn backend_health() -> String {
    "running".to_string()
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

fn main() {
    tauri::Builder::default()
        .manage(BackendState {
            child: Mutex::new(spawn_backend()),
            pip: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![toggle_always_on_top, toggle_pip_mode, backend_health])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<BackendState>();
                match state.child.lock() {
                    Ok(mut child) => {
                        if let Some(c) = child.as_mut() {
                            let _ = c.kill();
                        }
                    }
                    Err(_) => {}
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
