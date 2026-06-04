#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{LogicalSize, Manager, Size};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WINDOW_DISPLAY_AFFINITY,
};

struct BackendState {
    child: Mutex<Option<Child>>,
    pip: Mutex<bool>,
    closing: Mutex<bool>,
}

#[tauri::command]
fn toggle_always_on_top(window: tauri::Window) -> Result<bool, String> {
    let current = window.is_always_on_top().map_err(|e| e.to_string())?;
    let next = !current;
    set_always_on_top(window, next)
}

#[tauri::command]
fn set_always_on_top(window: tauri::Window, enabled: bool) -> Result<bool, String> {
    window.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    Ok(enabled)
}

#[cfg(windows)]
fn apply_capture_exclusion(window: &tauri::Window, enabled: bool) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let affinity = if enabled {
        WDA_EXCLUDEFROMCAPTURE
    } else {
        WINDOW_DISPLAY_AFFINITY(0)
    };
    unsafe { SetWindowDisplayAffinity(hwnd, affinity) }.map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn apply_capture_exclusion(_: &tauri::Window, _: bool) -> Result<(), String> {
    Err("Screen capture exclusion is only supported on Windows".to_string())
}

#[tauri::command]
fn set_capture_exclusion(window: tauri::Window, enabled: bool) -> Result<bool, String> {
    apply_capture_exclusion(&window, enabled)?;
    Ok(enabled)
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

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn backend_available() -> bool {
    let Some(addr) = ("127.0.0.1", 8765).to_socket_addrs().ok().and_then(|mut x| x.next()) else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(350)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let request = "GET /health HTTP/1.1\r\nHost: 127.0.0.1:8765\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let _ = stream.shutdown(Shutdown::Write);
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn spawn_backend() -> Option<Child> {
    if backend_available() {
        return None;
    }
    let root = project_root();
    let script = root.join("scripts").join("run-core.ps1");
    Command::new("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(script)
        .current_dir(root)
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

fn main() {
    tauri::Builder::default()
        .manage(BackendState {
            child: Mutex::new(spawn_backend()),
            pip: Mutex::new(false),
            closing: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            toggle_always_on_top,
            set_always_on_top,
            set_capture_exclusion,
            toggle_pip_mode,
            backend_health
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
