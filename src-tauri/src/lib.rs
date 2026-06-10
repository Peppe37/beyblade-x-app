use std::sync::Arc;
use tokio::sync::Mutex;

mod db;
mod server;
mod commands;

pub use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let server_mode = args.contains(&"--server".to_string());

    if server_mode {
        // Run ONLY the Axum server
        let db = Arc::new(Mutex::new(
            db::Database::new().expect("Failed to initialize database"),
        ));
        let ws_state = Arc::new(server::WsState::new());
        
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            println!("Starting backend-only server on 0.0.0.0:7878...");
            server::start_server(db, ws_state).await;
        });
        return;
    }

    // GUI Mode: Pure frontend app client
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_local_ip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
