pub mod commands;
pub mod ffmpeg;
pub mod models;
pub mod services;

use commands::*;
use ffmpeg::{cancel_proxy, new_proxy_slot, ProcessManager};
use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    let process_mgr = Arc::new(ProcessManager::new());
    let proxy = new_proxy_slot();

    let app = tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.center();
            }
            Ok(())
        })
        .manage(AppState { process_mgr, proxy })
        .invoke_handler(tauri::generate_handler![
            get_tools,
            get_encoders,
            probe_video,
            extract_preview,
            allow_playback,
            build_playback_proxy,
            cancel_playback_proxy,
            suggest_output_path,
            select_input_file,
            select_output_file,
            select_exe_file,
            start_encode,
            cancel_encode,
            get_diagnostics,
            get_settings,
            set_settings,
            exit_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            // Don't leave a proxy ffmpeg running after the window is closed.
            cancel_proxy(&handle.state::<AppState>().proxy);
        }
    });
}
