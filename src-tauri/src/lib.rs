pub mod commands;
pub mod ffmpeg;
pub mod models;
pub mod services;

use commands::*;
use ffmpeg::ProcessManager;
use std::sync::Arc;

pub fn run() {
    let process_mgr = Arc::new(ProcessManager::new());

    tauri::Builder::default()
        .manage(AppState { process_mgr })
        .invoke_handler(tauri::generate_handler![
            get_tools,
            get_encoders,
            probe_video,
            extract_preview,
            suggest_output_path,
            select_input_file,
            select_output_file,
            select_exe_file,
            start_encode,
            cancel_encode,
            get_diagnostics,
            get_settings,
            set_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
