use std::sync::Arc;
use tokio::sync::Mutex;

mod db;
mod server;
mod commands;

pub use db::Database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize the database
    let db = Arc::new(Mutex::new(
        db::Database::new().expect("Failed to initialize database"),
    ));

    // Clone for the server
    let server_db = db.clone();

    // Shared tournament state for WebSocket broadcast
    let ws_state = Arc::new(server::WsState::new());
    let server_ws_state = ws_state.clone();

    // Start the axum server in a background tokio thread
    tauri::async_runtime::spawn(async move {
        server::start_server(server_db, server_ws_state).await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db)
        .manage(ws_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_bladers,
            commands::create_blader,
            commands::update_blader,
            commands::delete_blader,
            commands::get_tournaments,
            commands::create_tournament,
            commands::get_tournament,
            commands::update_tournament,
            commands::delete_tournament,
            commands::reset_tournament,
            commands::add_match_result,
            commands::get_local_ip,
            commands::generate_join_code,
            commands::record_versus_battle,
            commands::get_custom_beys,
            commands::create_custom_bey,
            commands::delete_custom_bey,
            commands::get_custom_arenas,
            commands::create_custom_arena,
            commands::delete_custom_arena,
            commands::get_activities,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
