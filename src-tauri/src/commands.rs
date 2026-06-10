use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;
use serde_json::json;
use serde::Deserialize;

use crate::db::Database;
use crate::server::WsState;

type DbState<'a> = State<'a, Arc<Mutex<Database>>>;
type WsStateHandle<'a> = State<'a, Arc<WsState>>;

// ─── Bladers ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_bladers(db: DbState<'_>) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.get_bladers()
        .map(|b| json!(b))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_blader(
    db: DbState<'_>,
    name: String,
    avatar_color: String,
    avatar_image: Option<String>,
    password: Option<String>,
) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.create_blader(&name, &avatar_color, avatar_image.as_deref(), password.as_deref())
        .map(|b| json!(b))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_blader(
    db: DbState<'_>,
    id: String,
    name: String,
    avatar_color: String,
    avatar_image: Option<String>,
    beys: Vec<String>,
    password: Option<String>,
) -> Result<(), String> {
    let db = db.lock().await;
    db.update_blader(&id, &name, &avatar_color, avatar_image.as_deref(), &beys, password.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_blader(db: DbState<'_>, id: String) -> Result<(), String> {
    let db = db.lock().await;
    db.delete_blader(&id).map_err(|e| e.to_string())
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_tournaments(db: DbState<'_>) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.get_tournaments()
        .map(|t| json!(t))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tournament(db: DbState<'_>, id: String) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    let tournament = db.get_tournament(&id).map_err(|e| e.to_string())?;
    let bladers = db.get_bladers().map_err(|e| e.to_string())?;
    let matches = db.get_matches_for_tournament(&id).map_err(|e| e.to_string())?;

    if let Some(t) = tournament {
        let t_bladers: Vec<serde_json::Value> = t.blader_ids.iter()
            .filter_map(|bid| bladers.iter().find(|b| &b.id == bid))
            .map(|b| json!(b))
            .collect();
        Ok(json!({
            "tournament": t,
            "bladers": t_bladers,
            "matches": matches
        }))
    } else {
        Err("Tournament not found".to_string())
    }
}

#[derive(serde::Deserialize)]
pub struct CreateTournamentArgs {
    pub name: String,
    pub format: String,
    pub arena: String,
    pub point_threshold: i32,
    pub blader_ids: Vec<String>,
}

#[tauri::command]
pub async fn create_tournament(
    db: DbState<'_>,
    args: CreateTournamentArgs,
) -> Result<serde_json::Value, String> {
    let join_code = generate_code();
    let db = db.lock().await;
    db.create_tournament(
        &args.name, &args.format, &args.arena,
        args.point_threshold, &join_code, &args.blader_ids
    )
    .map(|t| json!(t))
    .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct UpdateTournamentArgs {
    pub id: String,
    pub name: String,
    pub arena: String,
    pub point_threshold: i32,
    pub format: String,
}

#[tauri::command]
pub async fn update_tournament(
    db: DbState<'_>,
    args: UpdateTournamentArgs,
) -> Result<(), String> {
    let db = db.lock().await;
    db.update_tournament(&args.id, &args.name, &args.arena, args.point_threshold, &args.format)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_tournament(db: DbState<'_>, id: String) -> Result<(), String> {
    let db = db.lock().await;
    db.delete_tournament(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reset_tournament(db: DbState<'_>, id: String) -> Result<(), String> {
    let db = db.lock().await;
    db.reset_tournament(&id).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct MatchResultArgs {
    pub match_id: String,
    pub winner_id: String,
    pub blader1_points: i32,
    pub blader2_points: i32,
    pub finish_type: String,
    pub bey1: Option<String>,
    pub bey2: Option<String>,
    pub rounds: Vec<crate::db::BattleRound>,
}

#[tauri::command]
pub async fn add_match_result(
    db: DbState<'_>,
    ws: WsStateHandle<'_>,
    args: MatchResultArgs,
) -> Result<(), String> {
    {
        let db = db.lock().await;
        db.add_match_result(
            &args.match_id, &args.winner_id,
            args.blader1_points, args.blader2_points,
            &args.finish_type, args.bey1.as_deref(), args.bey2.as_deref(),
            args.rounds
        ).map_err(|e| e.to_string())?;
    }
    // Broadcast update to all connected mobile clients
    ws.broadcast(&json!({
        "type": "match_update",
        "match_id": args.match_id,
        "winner_id": args.winner_id,
        "finish_type": args.finish_type
    }).to_string());
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct VersusResultArgs {
    pub blader1_id: String,
    pub blader2_id: String,
    pub winner_id: String,
    pub winner_points: i32,
    pub rounds: Vec<crate::db::BattleRound>,
}

#[tauri::command]
pub async fn record_versus_battle(
    db: DbState<'_>,
    args: VersusResultArgs,
) -> Result<(), String> {
    let db = db.lock().await;
    db.record_versus_battle(&args.blader1_id, &args.blader2_id, &args.winner_id, args.rounds)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_battle_history(
    db: DbState<'_>,
    blader_id: String,
) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.get_battle_history_for_blader(&blader_id)
        .map(|h| json!(h))
        .map_err(|e| e.to_string())
}

// ─── Custom Beys ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_custom_beys(db: DbState<'_>) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.get_custom_beys()
        .map(|b| json!(b))
        .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct CreateCustomBeyArgs {
    pub blader_id: Option<String>,
    pub name: String,
    pub blade: String,
    pub ratchet: String,
    pub bit: String,
    pub type_class: String,
    pub color: Option<String>,
    pub stats: String,
}

#[tauri::command]
pub async fn create_custom_bey(
    db: DbState<'_>,
    args: CreateCustomBeyArgs,
) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.create_custom_bey(
        args.blader_id.as_deref(),
        &args.name,
        &args.blade,
        &args.ratchet,
        &args.bit,
        &args.type_class,
        args.color.as_deref(),
        &args.stats,
    )
    .map(|b| json!(b))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_custom_bey(db: DbState<'_>, id: String) -> Result<(), String> {
    let db = db.lock().await;
    db.delete_custom_bey(&id).map_err(|e| e.to_string())
}

// ─── Utilities ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_local_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_join_code() -> String {
    generate_code()
}

fn generate_code() -> String {
    use rand::Rng;
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let part1: String = (0..3).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect();
    let part2: String = (0..3).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect();
    format!("{}-{}", part1, part2)
}

#[tauri::command]
pub async fn get_custom_arenas(db: DbState<'_>) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.get_custom_arenas()
        .map(|a| json!(a))
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct CreateCustomArenaArgs {
    pub name: String,
    pub description: String,
    #[serde(rename = "maxPlayers")]
    pub max_players: i32,
    #[serde(rename = "hasXtremeLine")]
    pub has_xtreme_line: bool,
    pub tags: Vec<String>,
    pub color: String,
}

#[tauri::command]
pub async fn create_custom_arena(
    db: DbState<'_>,
    args: CreateCustomArenaArgs,
) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.create_custom_arena(
        &args.name,
        &args.description,
        args.max_players,
        args.has_xtreme_line,
        &args.tags,
        &args.color,
    )
    .map(|a| json!(a))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_custom_arena(db: DbState<'_>, id: String) -> Result<(), String> {
    let db = db.lock().await;
    db.delete_custom_arena(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_activities(db: DbState<'_>) -> Result<serde_json::Value, String> {
    let db = db.lock().await;
    db.get_activities()
        .map(|a| json!(a))
        .map_err(|e| e.to_string())
}
