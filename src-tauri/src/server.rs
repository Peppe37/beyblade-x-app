use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::{Mutex, broadcast, mpsc};
use axum::{
    Router,
    extract::{Path, State, WebSocketUpgrade, Query},
    extract::ws::{WebSocket, Message},
    response::{Html, IntoResponse},
    routing::{get, post, delete, put},
    Json,
};
use tower_http::cors::{CorsLayer, Any};
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::db::Database;
use chrono::Utc;

#[derive(Clone)]
pub struct LobbyConnection {
    pub blader_id: String,
    pub name: String,
    pub avatar_color: String,
    pub avatar_initials: String,
    pub beys: Vec<String>,
    pub tx: mpsc::UnboundedSender<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ChallengeState {
    pub id: String,
    pub from_id: String,
    pub from_name: String,
    pub to_id: String,
    pub format: String,
    pub point_threshold: i32,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct LiveMatchRound {
    pub round_num: i32,
    pub round_type: String, // "finish", "draw", "foul"
    pub winner_id: Option<String>,
    pub finish_type: Option<String>,
    pub foul_blader_id: Option<String>,
    pub b1_points: i32,
    pub b2_points: i32,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct LiveMatchState {
    pub id: String,
    pub challenger_id: String,
    pub challenger_name: String,
    pub opponent_id: String,
    pub opponent_name: String,
    pub format: String,
    pub point_threshold: i32,
    pub challenger_points: i32,
    pub opponent_points: i32,
    pub challenger_wins: i32,
    pub opponent_wins: i32,
    pub challenger_fouls: i32,
    pub opponent_fouls: i32,
    pub rounds: Vec<LiveMatchRound>,
    pub status: String,
}

pub struct WsState {
    pub tx: broadcast::Sender<String>,
    pub lobby_players: Mutex<HashMap<String, LobbyConnection>>, // Key: blader_id
    pub active_challenges: Mutex<HashMap<String, ChallengeState>>, // Key: challenge_id
    pub live_matches: Mutex<HashMap<String, LiveMatchState>>, // Key: match_id
}

impl WsState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        WsState {
            tx,
            lobby_players: Mutex::new(HashMap::new()),
            active_challenges: Mutex::new(HashMap::new()),
            live_matches: Mutex::new(HashMap::new()),
        }
    }

    pub fn broadcast(&self, msg: &str) {
        let _ = self.tx.send(msg.to_string());
    }
}

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Database>>,
    ws_state: Arc<WsState>,
    admin_user: String,
    admin_pass: String,
}

fn load_admin_credentials() -> (String, String) {
    if let (Ok(u), Ok(p)) = (std::env::var("ADMIN_USER"), std::env::var("ADMIN_PASS")) {
        return (u, p);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    for path in [
        std::path::PathBuf::from(".env"),
        std::path::PathBuf::from("../.env"),
        std::path::Path::new(&home).join(".beyblade-x-app").join(".env"),
    ] {
        if let Ok(content) = std::fs::read_to_string(&path) {
            let mut user = None;
            let mut pass = None;
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with('#') || line.is_empty() { continue; }
                if let Some(v) = line.strip_prefix("ADMIN_USER=") {
                    user = Some(v.trim_matches('"').trim_matches('\'').to_string());
                } else if let Some(v) = line.strip_prefix("ADMIN_PASS=") {
                    pass = Some(v.trim_matches('"').trim_matches('\'').to_string());
                }
            }
            if let (Some(u), Some(p)) = (user, pass) {
                return (u, p);
            }
        }
    }
    ("admin".to_string(), "beyblade".to_string())
}

fn decode_base64(s: &str) -> Option<Vec<u8>> {
    let mut table = [-1i8; 256];
    for (i, &c) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".iter().enumerate() {
        table[c as usize] = i as i8;
    }
    let s = s.trim_end_matches('=');
    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &b in s.as_bytes() {
        let val = table[b as usize];
        if val < 0 { return None; }
        buf = (buf << 6) | val as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            result.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(result)
}

fn check_basic_auth(headers: &axum::http::HeaderMap, user: &str, pass: &str) -> bool {
    if let Some(auth) = headers.get("authorization") {
        if let Ok(auth_str) = auth.to_str() {
            if let Some(encoded) = auth_str.strip_prefix("Basic ") {
                if let Some(decoded) = decode_base64(encoded.trim()) {
                    if let Ok(s) = String::from_utf8(decoded) {
                        let mut parts = s.splitn(2, ':');
                        if let (Some(u), Some(p)) = (parts.next(), parts.next()) {
                            return u == user && p == pass;
                        }
                    }
                }
            }
        }
    }
    false
}

pub async fn start_server(db: Arc<Mutex<Database>>, ws_state: Arc<WsState>) {
    let (admin_user, admin_pass) = load_admin_credentials();
    println!("Admin panel: http://0.0.0.0:7878/admin  (user: {})", admin_user);
    let state = AppState { db, ws_state, admin_user, admin_pass };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/", get(mobile_index))
        .route("/lobby", get(mobile_lobby))
        .route("/vs/:id", get(mobile_lobby))
        .route("/join/:code", get(mobile_join))
        .route("/ws/:code", get(ws_handler))
        .route("/api/tournament/:code", get(get_tournament_api))
        .route("/api/tournament/:code/matches", get(get_matches_api))
        .route("/api/bladers", get(get_all_bladers_api).post(create_blader_api))
        .route("/api/bladers/:id", put(update_blader_api).delete(delete_blader_api))
        .route("/api/tournaments", get(get_all_tournaments_api).post(create_tournament_api))
        .route("/api/tournaments/:id", get(get_tournament_details_api).put(update_tournament_api).delete(delete_tournament_api))
        .route("/api/tournaments/:id/reset", post(reset_tournament_api))
        .route("/api/tournaments/:id/match-result", post(add_match_result_api))
        .route("/api/versus", post(record_versus_battle_api))
        .route("/api/blader/:id/history", get(get_blader_history_api))
        .route("/api/auth/login", post(auth_login))
        .route("/api/auth/register", post(auth_register))
        .route("/api/auth/change-password", post(auth_change_password))
        .route("/api/custom-beys", get(get_custom_beys_api).post(create_custom_bey_api))
        .route("/api/custom-beys/:id", delete(delete_custom_bey_api))
        .route("/api/blader/deck", post(update_blader_deck_api))
        .route("/api/custom-arenas", get(get_custom_arenas_api).post(create_custom_arena_api))
        .route("/api/custom-arenas/:id", delete(delete_custom_arena_api))
        .route("/api/activities", get(get_activities_api))
        // Public parts API
        .route("/api/parts", get(get_parts_api))
        .route("/api/parts/:id", get(get_part_api))
        // User parts (officina)
        .route("/api/bladers/:id/parts", get(get_blader_parts_api).post(add_blader_part_api))
        .route("/api/bladers/:id/parts/:part_id", delete(remove_blader_part_api))
        // Admin panel
        .route("/admin", get(admin_page))
        .route("/api/admin/parts", post(create_part_api))
        .route("/api/admin/parts/:id", put(update_part_api).delete(delete_part_api))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:7878").await
        .expect("Failed to bind port 7878");

    axum::serve(listener, app).await.expect("Server failed");
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok", "app": "BeybladeX" }))
}

async fn mobile_index() -> Html<String> {
    Html(mobile_html(None))
}

async fn mobile_join(Path(code): Path<String>) -> Html<String> {
    Html(mobile_html(Some(&code)))
}

async fn mobile_lobby() -> Html<String> {
    Html(mobile_lobby_html())
}

#[derive(Deserialize)]
struct LoginRequest {
    name: String,
    password: Option<String>,
}

async fn auth_login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let bladers = db.get_bladers().unwrap_or_default();
    
    if let Some(b) = bladers.iter().find(|b| b.name.trim().eq_ignore_ascii_case(payload.name.trim())) {
        let input_pw = payload.password.unwrap_or_default();
        if b.password == input_pw {
            return (axum::http::StatusCode::OK, Json(json!({
                "id": b.id,
                "name": b.name,
                "avatar_color": b.avatar_color,
                "avatar_initials": b.avatar_initials,
                "beys": b.beys,
                "wins": b.wins,
                "losses": b.losses,
                "points_total": b.points_total,
                "created_at": b.created_at,
            }))).into_response();
        }
    }
    (axum::http::StatusCode::UNAUTHORIZED, Json(json!({ "error": "Credenziali non valide" }))).into_response()
}

#[derive(Deserialize)]
struct RegisterRequest {
    name: String,
    password: String,
    avatar_color: String,
}

async fn auth_register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let bladers = db.get_bladers().unwrap_or_default();

    if payload.name.trim().is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(json!({ "error": "Il nome non può essere vuoto" }))).into_response();
    }
    
    if bladers.iter().any(|b| b.name.trim().eq_ignore_ascii_case(payload.name.trim())) {
        return (axum::http::StatusCode::BAD_REQUEST, Json(json!({ "error": "Nome blader già esistente" }))).into_response();
    }

    match db.create_blader(payload.name.trim(), &payload.avatar_color, None, Some(&payload.password)) {
        Ok(b) => {
            (axum::http::StatusCode::CREATED, Json(json!({
                "id": b.id,
                "name": b.name,
                "avatar_color": b.avatar_color,
                "avatar_initials": b.avatar_initials,
                "beys": b.beys,
                "wins": b.wins,
                "losses": b.losses,
                "points_total": b.points_total,
                "created_at": b.created_at,
            }))).into_response()
        }
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Deserialize)]
struct ChangePasswordRequest {
    blader_id: String,
    old_password: Option<String>,
    new_password: String,
}

async fn auth_change_password(
    State(state): State<AppState>,
    Json(payload): Json<ChangePasswordRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let bladers = db.get_bladers().unwrap_or_default();
    
    if let Some(b) = bladers.iter().find(|b| b.id == payload.blader_id) {
        if let Some(ref old_pw) = payload.old_password {
            if b.password != *old_pw {
                return (axum::http::StatusCode::UNAUTHORIZED, Json(json!({ "error": "Vecchia password errata" }))).into_response();
            }
        }
        if db.change_blader_password(&payload.blader_id, &payload.new_password).is_ok() {
            return (axum::http::StatusCode::OK, Json(json!({ "status": "success" }))).into_response();
        }
    }
    (axum::http::StatusCode::BAD_REQUEST, Json(json!({ "error": "Impossibile aggiornare la password" }))).into_response()
}

#[derive(Deserialize)]
struct CustomBeysQuery {
    blader_id: Option<String>,
}

async fn get_custom_beys_api(
    State(state): State<AppState>,
    Query(params): Query<CustomBeysQuery>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let list = db.get_custom_beys().unwrap_or_default();
    let filtered: Vec<crate::db::CustomBey> = if let Some(blader_id) = params.blader_id {
        list.into_iter().filter(|b| b.blader_id.as_deref() == Some(&blader_id)).collect()
    } else {
        list
    };
    Json(filtered)
}

async fn get_custom_arenas_api(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_custom_arenas() {
        Ok(a) => (axum::http::StatusCode::OK, Json(a)).into_response(),
        Err(err) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err.to_string() })),
        ).into_response(),
    }
}

async fn get_activities_api(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_activities() {
        Ok(a) => (axum::http::StatusCode::OK, Json(a)).into_response(),
        Err(err) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err.to_string() })),
        ).into_response(),
    }
}

#[derive(Deserialize)]
struct CreateCustomBeyRequest {
    blader_id: Option<String>,
    name: String,
    blade: String,
    ratchet: String,
    bit: String,
    type_class: String,
    color: Option<String>,
    stats: String,
    blade_part_id: Option<String>,
    ratchet_part_id: Option<String>,
    bit_part_id: Option<String>,
    assist_blade_part_id: Option<String>,
    lock_chip_part_id: Option<String>,
    over_blade_part_id: Option<String>,
}

async fn create_custom_bey_api(
    State(state): State<AppState>,
    Json(payload): Json<CreateCustomBeyRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.create_custom_bey(
        payload.blader_id.as_deref(),
        &payload.name,
        &payload.blade,
        &payload.ratchet,
        &payload.bit,
        &payload.type_class,
        payload.color.as_deref(),
        &payload.stats,
        payload.blade_part_id.as_deref(),
        payload.ratchet_part_id.as_deref(),
        payload.bit_part_id.as_deref(),
        payload.assist_blade_part_id.as_deref(),
        payload.lock_chip_part_id.as_deref(),
        payload.over_blade_part_id.as_deref(),
    ) {
        Ok(bey) => (axum::http::StatusCode::CREATED, Json(bey)).into_response(),
        Err(err) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err.to_string() })),
        ).into_response(),
    }
}

async fn delete_custom_bey_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.delete_custom_bey(&id) {
        Ok(_) => (axum::http::StatusCode::OK, Json(json!({ "status": "deleted" }))).into_response(),
        Err(err) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err.to_string() })),
        ).into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateDeckRequest {
    blader_id: String,
    beys: Vec<String>,
}

async fn update_blader_deck_api(
    State(state): State<AppState>,
    Json(payload): Json<UpdateDeckRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.update_blader_deck(&payload.blader_id, &payload.beys) {
        Ok(_) => {
            // Update in lobby active players state
            let mut players = state.ws_state.lobby_players.lock().await;
            if let Some(conn) = players.get_mut(&payload.blader_id) {
                conn.beys = payload.beys.clone();
            }
            drop(players);

            // Broadcast lobby update
            send_lobby_update(&state.ws_state).await;

            (axum::http::StatusCode::OK, Json(json!({ "status": "updated" }))).into_response()
        }
        Err(err) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err.to_string() })),
        ).into_response(),
    }
}

async fn get_all_bladers_api(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let bladers = db.get_bladers().unwrap_or_default();
    let public_bladers: Vec<serde_json::Value> = bladers.iter().map(|b| {
        json!({
            "id": b.id,
            "name": b.name,
            "avatar_color": b.avatar_color,
            "avatar_initials": b.avatar_initials,
            "beys": b.beys,
            "wins": b.wins,
            "losses": b.losses,
            "points_total": b.points_total,
        })
    }).collect();
    Json(json!(public_bladers))
}

async fn get_all_tournaments_api(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let tournaments = db.get_tournaments().unwrap_or_default();
    Json(json!(tournaments))
}

async fn ws_handler(
    Path(code): Path<String>,
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, code, state))
}

async fn handle_ws(mut socket: WebSocket, code: String, state: AppState) {
    if code != "lobby" {
        // Tournament WS handler
        let mut rx = state.ws_state.tx.subscribe();

        let _ = socket.send(Message::Text(
            json!({ "type": "connected", "code": code }).to_string().into()
        )).await;

        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Ok(text) => {
                            if socket.send(Message::Text(text.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                msg = socket.recv() => {
                    if msg.is_none() { break; }
                }
            }
        }
        return;
    }

    // Lobby WS handler
    let (tx, mut rx_direct) = mpsc::unbounded_channel::<String>();
    let mut rx_broadcast = state.ws_state.tx.subscribe();
    let mut authenticated_blader_id: Option<String> = None;

    let _ = socket.send(Message::Text(
        json!({ "type": "connected", "code": "lobby" }).to_string().into()
    )).await;

    loop {
        tokio::select! {
            msg = rx_direct.recv() => {
                match msg {
                    Some(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            msg = rx_broadcast.recv() => {
                match msg {
                    Ok(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => {}
                }
            }
            msg = socket.recv() => {
                let msg = match msg {
                    Some(Ok(Message::Text(text))) => text,
                    _ => break,
                };

                let parsed: serde_json::Value = match serde_json::from_str(&msg) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                let msg_type = parsed.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match msg_type {
                    "join_lobby" => {
                        let blader_id = parsed.get("blader_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        let db = state.db.lock().await;
                        let bladers = db.get_bladers().unwrap_or_default();
                        if let Some(b) = bladers.iter().find(|bl| bl.id == blader_id) {
                            authenticated_blader_id = Some(blader_id.clone());
                            let conn = LobbyConnection {
                                blader_id: blader_id.clone(),
                                name: b.name.clone(),
                                avatar_color: b.avatar_color.clone(),
                                avatar_initials: b.avatar_initials.clone(),
                                beys: b.beys.clone(),
                                tx: tx.clone(),
                            };
                            let mut players = state.ws_state.lobby_players.lock().await;
                            players.insert(blader_id.clone(), conn);
                            drop(players);

                            send_lobby_update(&state.ws_state).await;

                            // Check if this blader has an active match in memory and restore it!
                            let live_matches = state.ws_state.live_matches.lock().await;
                            let my_match = live_matches.values().find(|m| m.challenger_id == blader_id || m.opponent_id == blader_id);
                            if let Some(m) = my_match {
                                let _ = tx.send(json!({
                                    "type": "match_start",
                                    "match": m
                                }).to_string());
                            }
                        }
                    }
                    "challenge_send" => {
                        let from_id = parsed.get("from_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        let to_id = parsed.get("to_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        let format = parsed.get("format").and_then(|f| f.as_str()).unwrap_or("1on1").to_string();
                        let point_threshold = parsed.get("point_threshold").and_then(|p| p.as_i64()).unwrap_or(4) as i32;

                        let challenger_name = {
                            let players = state.ws_state.lobby_players.lock().await;
                            players.get(&from_id).map(|p| p.name.clone()).unwrap_or_else(|| "Challenger".to_string())
                        };

                        let challenge_id = uuid::Uuid::new_v4().to_string();
                        let challenge = ChallengeState {
                            id: challenge_id.clone(),
                            from_id,
                            from_name: challenger_name,
                            to_id: to_id.clone(),
                            format,
                            point_threshold,
                        };

                        state.ws_state.active_challenges.lock().await.insert(challenge_id.clone(), challenge.clone());

                        let players = state.ws_state.lobby_players.lock().await;
                        if let Some(recipient_conn) = players.get(&to_id) {
                            let _ = recipient_conn.tx.send(json!({
                                "type": "challenge_received",
                                "challenge": challenge
                            }).to_string());
                            let _ = tx.send(json!({
                                "type": "challenge_sent",
                                "challenge_id": challenge_id
                            }).to_string());
                        } else {
                            let _ = tx.send(json!({
                                "type": "challenge_error",
                                "message": "Il giocatore è offline"
                            }).to_string());
                        }
                    }
                    "challenge_accept" => {
                        let challenge_id = parsed.get("challenge_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        let mut challenges = state.ws_state.active_challenges.lock().await;
                        if let Some(ch) = challenges.remove(&challenge_id) {
                            let players = state.ws_state.lobby_players.lock().await;
                            let opponent_name = players.get(&ch.to_id).map(|p| p.name.clone()).unwrap_or_else(|| "Opponent".to_string());

                            let live_match = LiveMatchState {
                                id: ch.id.clone(),
                                challenger_id: ch.from_id.clone(),
                                challenger_name: ch.from_name.clone(),
                                opponent_id: ch.to_id.clone(),
                                opponent_name,
                                format: ch.format.clone(),
                                point_threshold: ch.point_threshold,
                                challenger_points: 0,
                                opponent_points: 0,
                                challenger_wins: 0,
                                opponent_wins: 0,
                                challenger_fouls: 0,
                                opponent_fouls: 0,
                                rounds: vec![],
                                status: "playing".to_string(),
                            };

                            state.ws_state.live_matches.lock().await.insert(ch.id.clone(), live_match.clone());

                            if let Some(challenger) = players.get(&ch.from_id) {
                                let _ = challenger.tx.send(json!({
                                    "type": "match_start",
                                    "match": live_match
                                }).to_string());
                            }
                            if let Some(recipient) = players.get(&ch.to_id) {
                                let _ = recipient.tx.send(json!({
                                    "type": "match_start",
                                    "match": live_match
                                }).to_string());
                            }
                        }
                    }
                    "challenge_decline" => {
                        let challenge_id = parsed.get("challenge_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        let mut challenges = state.ws_state.active_challenges.lock().await;
                        if let Some(ch) = challenges.remove(&challenge_id) {
                            let players = state.ws_state.lobby_players.lock().await;
                            if let Some(challenger) = players.get(&ch.from_id) {
                                let _ = challenger.tx.send(json!({
                                    "type": "challenge_result",
                                    "status": "declined",
                                    "challenge_id": challenge_id
                                }).to_string());
                            }
                        }
                    }
                    "match_round_submit" => {
                        let match_id = parsed.get("match_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        let winner_id = parsed.get("winner_id").and_then(|id| id.as_str()).map(|id| id.to_string());
                        let finish_type = parsed.get("finish_type").and_then(|f| f.as_str()).map(|f| f.to_string());
                        let round_type = parsed.get("round_type").and_then(|rt| rt.as_str()).unwrap_or("finish").to_string();
                        let foul_blader_id = parsed.get("foul_blader_id").and_then(|f| f.as_str()).map(|f| f.to_string());

                        let mut live_matches = state.ws_state.live_matches.lock().await;
                        if let Some(m) = live_matches.get_mut(&match_id) {
                            let mut b1_pts = 0;
                            let mut b2_pts = 0;
                            let mut round_winner_id = None;
                            let mut round_finish_type = None;

                            if round_type == "draw" {
                                round_finish_type = Some("draw".to_string());
                            } else if round_type == "foul" {
                                if let Some(ref f_id) = foul_blader_id {
                                    round_finish_type = Some("foul".to_string());
                                    if f_id == &m.challenger_id {
                                        m.challenger_fouls += 1;
                                        if m.challenger_fouls % 2 == 0 {
                                            m.opponent_points += 1;
                                            b2_pts = 1;
                                        }
                                    } else {
                                        m.opponent_fouls += 1;
                                        if m.opponent_fouls % 2 == 0 {
                                            m.challenger_points += 1;
                                            b1_pts = 1;
                                        }
                                    }
                                }
                            } else {
                                if let Some(ref w_id) = winner_id {
                                    if !w_id.is_empty() {
                                        round_winner_id = Some(w_id.clone());
                                        let f_type = finish_type.clone().unwrap_or_else(|| "spin".to_string());
                                        let pts = match f_type.as_str() {
                                            "spin" => 1,
                                            "over" => 2,
                                            "burst" => 2,
                                            "xtreme" => 3,
                                            _ => 1,
                                        };
                                        round_finish_type = Some(f_type);

                                        let is_challenger = w_id == &m.challenger_id;
                                        if is_challenger {
                                            m.challenger_points += pts;
                                            m.challenger_wins += 1;
                                            b1_pts = pts;
                                        } else {
                                            m.opponent_points += pts;
                                            m.opponent_wins += 1;
                                            b2_pts = pts;
                                        }
                                    }
                                }
                            }

                            let round_num = (m.rounds.len() + 1) as i32;
                            m.rounds.push(LiveMatchRound {
                                round_num,
                                round_type: round_type.clone(),
                                winner_id: round_winner_id,
                                finish_type: round_finish_type,
                                foul_blader_id,
                                b1_points: b1_pts,
                                b2_points: b2_pts,
                            });

                            let is_completed = if m.format == "1on1" {
                                m.challenger_points >= m.point_threshold || m.opponent_points >= m.point_threshold
                            } else {
                                m.challenger_wins >= 2 || m.opponent_wins >= 2
                            };

                            if is_completed {
                                m.status = "completed".to_string();
                                let db = state.db.lock().await;
                                let (final_winner, final_loser, winner_pts) = if m.format == "1on1" {
                                    if m.challenger_points >= m.point_threshold {
                                        (&m.challenger_id, &m.opponent_id, m.challenger_points)
                                    } else {
                                        (&m.opponent_id, &m.challenger_id, m.opponent_points)
                                    }
                                } else {
                                    if m.challenger_wins >= 2 {
                                        (&m.challenger_id, &m.opponent_id, m.challenger_points)
                                    } else {
                                        (&m.opponent_id, &m.challenger_id, m.opponent_points)
                                    }
                                };

                                let db_rounds: Vec<crate::db::BattleRound> = m.rounds.iter().map(|r| {
                                    crate::db::BattleRound {
                                        round_num: r.round_num,
                                        round_type: r.round_type.clone(),
                                        winner_id: r.winner_id.clone(),
                                        finish_type: r.finish_type.clone(),
                                        foul_blader_id: r.foul_blader_id.clone(),
                                        b1_points: r.b1_points,
                                        b2_points: r.b2_points,
                                        bey1: None,
                                        bey2: None,
                                    }
                                }).collect();

                                let record = crate::db::BattleRecord {
                                    id: m.id.clone(),
                                    battle_type: "challenge".to_string(),
                                    associated_id: None,
                                    associated_name: None,
                                    blader1_id: m.challenger_id.clone(),
                                    blader1_name: m.challenger_name.clone(),
                                    blader2_id: m.opponent_id.clone(),
                                    blader2_name: m.opponent_name.clone(),
                                    winner_id: Some(final_winner.to_string()),
                                    blader1_points: m.challenger_points,
                                    blader2_points: m.opponent_points,
                                    rounds: db_rounds,
                                    created_at: Utc::now().to_rfc3339(),
                                };

                                if db.record_battle(&record).is_ok() {
                                    let players = state.ws_state.lobby_players.lock().await;
                                    if let Some(p1) = players.get(&m.challenger_id) {
                                        let _ = p1.tx.send(json!({
                                            "type": "match_complete",
                                            "match": m
                                        }).to_string());
                                    }
                                    if let Some(p2) = players.get(&m.opponent_id) {
                                        let _ = p2.tx.send(json!({
                                            "type": "match_complete",
                                            "match": m
                                        }).to_string());
                                    }
                                    drop(players);

                                    state.ws_state.broadcast(&json!({
                                        "type": "standings_update",
                                        "bladers": db.get_bladers().unwrap_or_default()
                                    }).to_string());
                                }

                                drop(live_matches);
                                let mut matches = state.ws_state.live_matches.lock().await;
                                matches.remove(&match_id);
                            } else {
                                let players = state.ws_state.lobby_players.lock().await;
                                if let Some(p1) = players.get(&m.challenger_id) {
                                    let _ = p1.tx.send(json!({
                                        "type": "match_update",
                                        "match": m
                                    }).to_string());
                                }
                                if let Some(p2) = players.get(&m.opponent_id) {
                                    let _ = p2.tx.send(json!({
                                        "type": "match_update",
                                        "match": m
                                    }).to_string());
                                }
                            }
                        }
                    }
                    "match_cancel" => {
                        let match_id = parsed.get("match_id").and_then(|id| id.as_str()).unwrap_or("").to_string();
                        let mut live_matches = state.ws_state.live_matches.lock().await;
                        if let Some(m) = live_matches.remove(&match_id) {
                            let players = state.ws_state.lobby_players.lock().await;
                            if let Some(p1) = players.get(&m.challenger_id) {
                                let _ = p1.tx.send(json!({
                                    "type": "match_cancelled",
                                    "match_id": match_id
                                }).to_string());
                            }
                            if let Some(p2) = players.get(&m.opponent_id) {
                                let _ = p2.tx.send(json!({
                                    "type": "match_cancelled",
                                    "match_id": match_id
                                }).to_string());
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    if let Some(blader_id) = authenticated_blader_id {
        let mut players = state.ws_state.lobby_players.lock().await;
        players.remove(&blader_id);
        drop(players);
        send_lobby_update(&state.ws_state).await;
    }
}

async fn send_lobby_update(ws_state: &WsState) {
    let players = ws_state.lobby_players.lock().await;
    let list: Vec<serde_json::Value> = players.values().map(|p| {
        json!({
            "blader_id": p.blader_id,
            "name": p.name,
            "avatar_color": p.avatar_color,
            "avatar_initials": p.avatar_initials,
            "beys": p.beys,
        })
    }).collect();
    drop(players);

    let msg = json!({
        "type": "lobby_update",
        "online_players": list
    }).to_string();

    ws_state.broadcast(&msg);
}

async fn get_tournament_api(
    Path(code): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let tournaments = db.get_tournaments().unwrap_or_default();
    if let Some(t) = tournaments.iter().find(|t| t.join_code == code) {
        let bladers = db.get_bladers().unwrap_or_default();
        let t_bladers: Vec<serde_json::Value> = t.blader_ids.iter()
            .filter_map(|id| bladers.iter().find(|b| &b.id == id))
            .map(|b| json!({
                "id": b.id, "name": b.name, "avatar_color": b.avatar_color,
                "avatar_initials": b.avatar_initials, "wins": b.wins,
                "losses": b.losses, "points_total": b.points_total
            }))
            .collect();
        Json(json!({
            "id": t.id, "name": t.name, "format": t.format,
            "arena": t.arena, "point_threshold": t.point_threshold,
            "join_code": t.join_code, "status": t.status, "bladers": t_bladers
        })).into_response()
    } else {
        (axum::http::StatusCode::NOT_FOUND, Json(json!({"error": "not found"}))).into_response()
    }
}

async fn get_matches_api(
    Path(code): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let tournaments = db.get_tournaments().unwrap_or_default();
    if let Some(t) = tournaments.iter().find(|t| t.join_code == code) {
        let matches = db.get_matches_for_tournament(&t.id).unwrap_or_default();
        Json(json!(matches)).into_response()
    } else {
        (axum::http::StatusCode::NOT_FOUND, Json(json!({"error": "not found"}))).into_response()
    }
}

// ─── Axum Handlers for Remote Mode ──────────────────────────────────────────

#[derive(Deserialize)]
struct CreateBladerRequest {
    name: String,
    avatarColor: String,
    avatarImage: Option<String>,
    password: Option<String>,
}

async fn create_blader_api(
    State(state): State<AppState>,
    Json(payload): Json<CreateBladerRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.create_blader(&payload.name, &payload.avatarColor, payload.avatarImage.as_deref(), payload.password.as_deref()) {
        Ok(b) => (axum::http::StatusCode::CREATED, Json(b)).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateBladerRequest {
    name: String,
    avatarColor: String,
    avatarImage: Option<String>,
    beys: Vec<String>,
    password: Option<String>,
}

async fn update_blader_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateBladerRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.update_blader(&id, &payload.name, &payload.avatarColor, payload.avatarImage.as_deref(), &payload.beys, payload.password.as_deref()) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn delete_blader_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.delete_blader(&id) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Deserialize)]
struct CreateTournamentApiRequest {
    args: crate::commands::CreateTournamentArgs,
}

async fn create_tournament_api(
    State(state): State<AppState>,
    Json(payload): Json<CreateTournamentApiRequest>,
) -> impl IntoResponse {
    let join_code = generate_code();
    let db = state.db.lock().await;
    match db.create_tournament(
        &payload.args.name, &payload.args.format, &payload.args.arena,
        payload.args.point_threshold, &join_code, &payload.args.blader_ids
    ) {
        Ok(t) => (axum::http::StatusCode::CREATED, Json(t)).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn get_tournament_details_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    let tournament = db.get_tournament(&id).unwrap_or(None);
    let bladers = db.get_bladers().unwrap_or_default();
    let matches = db.get_matches_for_tournament(&id).unwrap_or_default();

    if let Some(t) = tournament {
        let t_bladers: Vec<serde_json::Value> = t.blader_ids.iter()
            .filter_map(|bid| bladers.iter().find(|b| &b.id == bid))
            .map(|b| json!(b))
            .collect();
        (axum::http::StatusCode::OK, Json(json!({
            "tournament": t,
            "bladers": t_bladers,
            "matches": matches
        }))).into_response()
    } else {
        (axum::http::StatusCode::NOT_FOUND, Json(json!({ "error": "Tournament not found" }))).into_response()
    }
}

#[derive(Deserialize)]
struct UpdateTournamentApiRequest {
    args: crate::commands::UpdateTournamentArgs,
}

async fn update_tournament_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateTournamentApiRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.update_tournament(&id, &payload.args.name, &payload.args.arena, payload.args.point_threshold, &payload.args.format) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn delete_tournament_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.delete_tournament(&id) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn reset_tournament_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.reset_tournament(&id) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Deserialize)]
struct AddMatchResultApiRequest {
    args: crate::commands::MatchResultArgs,
}

async fn add_match_result_api(
    State(state): State<AppState>,
    Path(_id): Path<String>,
    Json(payload): Json<AddMatchResultApiRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.add_match_result(
        &payload.args.match_id, &payload.args.winner_id,
        payload.args.blader1_points, payload.args.blader2_points,
        &payload.args.finish_type, payload.args.bey1.as_deref(), payload.args.bey2.as_deref(),
        payload.args.rounds.clone()
    ) {
        Ok(_) => {
            state.ws_state.broadcast(&json!({
                "type": "match_update",
                "match_id": payload.args.match_id,
                "winner_id": payload.args.winner_id,
                "finish_type": payload.args.finish_type
            }).to_string());
            axum::http::StatusCode::OK.into_response()
        }
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Deserialize)]
struct RecordVersusBattleApiRequest {
    args: crate::commands::VersusResultArgs,
}

async fn record_versus_battle_api(
    State(state): State<AppState>,
    Json(payload): Json<RecordVersusBattleApiRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.record_versus_battle(&payload.args.blader1_id, &payload.args.blader2_id, &payload.args.winner_id, payload.args.rounds.clone()) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn get_blader_history_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_battle_history_for_blader(&id) {
        Ok(h) => (axum::http::StatusCode::OK, Json(h)).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Deserialize)]
struct CreateCustomArenaApiRequest {
    args: crate::commands::CreateCustomArenaArgs,
}

async fn create_custom_arena_api(
    State(state): State<AppState>,
    Json(payload): Json<CreateCustomArenaApiRequest>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.create_custom_arena(
        &payload.args.name,
        &payload.args.description,
        payload.args.max_players,
        payload.args.has_xtreme_line,
        &payload.args.tags,
        &payload.args.color,
    ) {
        Ok(a) => (axum::http::StatusCode::CREATED, Json(a)).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn delete_custom_arena_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.delete_custom_arena(&id) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// ─── Admin Page ──────────────────────────────────────────────────────────────

async fn admin_page(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> axum::response::Response {
    if !check_basic_auth(&headers, &state.admin_user, &state.admin_pass) {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            [(axum::http::header::WWW_AUTHENTICATE, "Basic realm=\"BeybladeX Admin\"")],
            axum::response::Html("<h1>401 Unauthorized</h1>"),
        ).into_response();
    }
    axum::response::Html(admin_html()).into_response()
}

// ─── Public Parts API ────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PartsQuery {
    #[serde(rename = "type")]
    part_type: Option<String>,
    series: Option<String>,
    brand: Option<String>,
}

async fn get_parts_api(
    State(state): State<AppState>,
    Query(params): Query<PartsQuery>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_parts(params.part_type.as_deref(), params.series.as_deref(), params.brand.as_deref()) {
        Ok(parts) => (axum::http::StatusCode::OK, Json(parts)).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn get_part_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_part(&id) {
        Ok(Some(p)) => (axum::http::StatusCode::OK, Json(p)).into_response(),
        Ok(None) => (axum::http::StatusCode::NOT_FOUND, Json(json!({ "error": "Not found" }))).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// ─── User Parts (Officina) ───────────────────────────────────────────────────

async fn get_blader_parts_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.get_blader_parts(&id) {
        Ok(ids) => (axum::http::StatusCode::OK, Json(ids)).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Deserialize)]
struct AddPartBody { part_id: String }

async fn add_blader_part_api(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<AddPartBody>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.add_blader_part(&id, &body.part_id) {
        Ok(_) => (axum::http::StatusCode::OK, Json(json!({ "status": "ok" }))).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn remove_blader_part_api(
    State(state): State<AppState>,
    Path((id, part_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let db = state.db.lock().await;
    match db.remove_blader_part(&id, &part_id) {
        Ok(_) => (axum::http::StatusCode::OK, Json(json!({ "status": "ok" }))).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// ─── Admin Parts API (protected) ─────────────────────────────────────────────

#[derive(Deserialize)]
struct PartPayload {
    part_type: String,
    name: String,
    serial: Option<String>,
    pack: Option<String>,
    brand: Option<String>,
    series: Option<String>,
    color: Option<String>,
    image_url: Option<String>,
    protrusions: Option<i32>,
    height: Option<i32>,
}

async fn create_part_api(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(p): Json<PartPayload>,
) -> impl IntoResponse {
    if !check_basic_auth(&headers, &state.admin_user, &state.admin_pass) {
        return (axum::http::StatusCode::UNAUTHORIZED, Json(json!({ "error": "Unauthorized" }))).into_response();
    }
    let db = state.db.lock().await;
    match db.create_part(
        &p.part_type, &p.name,
        p.serial.as_deref().unwrap_or(""),
        p.pack.as_deref().unwrap_or(""),
        p.brand.as_deref().unwrap_or("takara_tomy"),
        p.series.as_deref().unwrap_or("bx"),
        p.color.as_deref(), p.image_url.as_deref(),
        p.protrusions, p.height,
    ) {
        Ok(part) => (axum::http::StatusCode::CREATED, Json(part)).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn update_part_api(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(id): Path<String>,
    Json(p): Json<PartPayload>,
) -> impl IntoResponse {
    if !check_basic_auth(&headers, &state.admin_user, &state.admin_pass) {
        return (axum::http::StatusCode::UNAUTHORIZED, Json(json!({ "error": "Unauthorized" }))).into_response();
    }
    let db = state.db.lock().await;
    match db.update_part(
        &id, &p.part_type, &p.name,
        p.serial.as_deref().unwrap_or(""),
        p.pack.as_deref().unwrap_or(""),
        p.brand.as_deref().unwrap_or("takara_tomy"),
        p.series.as_deref().unwrap_or("bx"),
        p.color.as_deref(), p.image_url.as_deref(),
        p.protrusions, p.height,
    ) {
        Ok(_) => (axum::http::StatusCode::OK, Json(json!({ "status": "updated" }))).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn delete_part_api(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if !check_basic_auth(&headers, &state.admin_user, &state.admin_pass) {
        return (axum::http::StatusCode::UNAUTHORIZED, Json(json!({ "error": "Unauthorized" }))).into_response();
    }
    let db = state.db.lock().await;
    match db.delete_part(&id) {
        Ok(_) => (axum::http::StatusCode::OK, Json(json!({ "status": "deleted" }))).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

fn generate_code() -> String {
    use rand::Rng;
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let part1: String = (0..3).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect();
    let part2: String = (0..3).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect();
    format!("{}-{}", part1, part2)
}

fn mobile_html(code: Option<&str>) -> String {
    let code_value = code.map(|c| format!("\"{}\"", c)).unwrap_or("null".to_string());
    r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Beyblade X — Tournament</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');
  :root {
    --bg: #0a0a1a; --surface: #12122a; --primary: #00d4ff; --secondary: #7c3aed;
    --accent: #ffd700; --danger: #ff4444; --text: #e2e8f0; --muted: #64748b;
    --neon: 0 0 20px rgba(0,212,255,0.5); --glow-gold: 0 0 20px rgba(255,215,0,0.4);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Rajdhani', sans-serif;
         min-height: 100vh; overflow-x: hidden; }
  .bg-particles {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;
    background: radial-gradient(ellipse at 20% 20%, rgba(124,58,237,0.15) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 80%, rgba(0,212,255,0.1) 0%, transparent 60%);
  }
  .container { position: relative; z-index: 1; max-width: 480px; margin: 0 auto; padding: 20px; }
  .logo { text-align: center; padding: 30px 0 20px; }
  .logo h1 { font-family: 'Orbitron', sans-serif; font-size: 2rem; font-weight: 900;
              background: linear-gradient(135deg, var(--primary), var(--accent));
              -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .logo p { color: var(--muted); font-size: 0.9rem; margin-top: 5px; }
  .card { background: var(--surface); border: 1px solid rgba(0,212,255,0.2); border-radius: 16px;
           padding: 24px; margin-bottom: 20px; backdrop-filter: blur(10px); }
  .card h2 { font-family: 'Orbitron', sans-serif; font-size: 1.1rem; color: var(--primary);
              margin-bottom: 16px; text-transform: uppercase; letter-spacing: 1px; }
  .code-inputs { display: flex; gap: 8px; justify-content: center; align-items: center; margin-bottom: 20px; }
  .code-group { display: flex; gap: 6px; }
  .code-sep { color: var(--primary); font-size: 1.5rem; font-weight: bold; line-height: 1; }
  .code-digit { width: 44px; height: 54px; background: rgba(0,212,255,0.05); border: 2px solid rgba(0,212,255,0.3);
                 border-radius: 10px; text-align: center; font-family: 'Orbitron', sans-serif;
                 font-size: 1.3rem; color: var(--text); outline: none; text-transform: uppercase;
                 transition: all 0.2s; caret-color: var(--primary); }
  .code-digit:focus { border-color: var(--primary); box-shadow: var(--neon); background: rgba(0,212,255,0.1); }
  .btn { width: 100%; padding: 14px; background: linear-gradient(135deg, var(--primary), var(--secondary));
          border: none; border-radius: 12px; color: white; font-family: 'Orbitron', sans-serif;
          font-size: 0.9rem; font-weight: 700; cursor: pointer; transition: all 0.3s;
          text-transform: uppercase; letter-spacing: 1px; }
  .btn:hover { transform: translateY(-2px); box-shadow: var(--neon); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .tournament-view { display: none; }
  .t-header { text-align: center; padding: 10px 0 20px; }
  .t-name { font-family: 'Orbitron', sans-serif; font-size: 1.4rem; color: var(--accent); }
  .t-code { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 0.75rem;
            font-weight: 600; text-transform: uppercase; }
  .badge-attack { background: rgba(255,68,68,0.2); color: #ff6b6b; border: 1px solid #ff4444; }
  .badge-defense { background: rgba(0,212,255,0.2); color: var(--primary); border: 1px solid var(--primary); }
  .badge-stamina { background: rgba(0,255,136,0.2); color: #00ff88; border: 1px solid #00ff88; }
  .badge-balance { background: rgba(255,215,0,0.2); color: var(--accent); border: 1px solid var(--accent); }
  .match-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
                 border-radius: 12px; padding: 14px; margin-bottom: 10px; }
  .match-vs { display: flex; align-items: center; gap: 10px; }
  .blader-name { flex: 1; font-weight: 600; font-size: 1rem; }
  .blader-name.winner { color: var(--accent); }
  .vs-badge { background: var(--secondary); color: white; width: 32px; height: 32px;
               border-radius: 50%; display: flex; align-items: center; justify-content: center;
               font-size: 0.7rem; font-weight: 700; flex-shrink: 0; }
  .score { display: flex; gap: 4px; font-family: 'Orbitron', sans-serif; font-size: 0.9rem; }
  .score span { padding: 2px 8px; background: rgba(255,255,255,0.05); border-radius: 6px; }
  .standings { list-style: none; }
  .standing-item { display: flex; align-items: center; gap: 12px; padding: 10px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.05); }
  .standing-rank { font-family: 'Orbitron', sans-serif; font-size: 1.2rem; color: var(--muted); width: 30px; }
  .standing-rank.gold { color: #ffd700; }
  .standing-rank.silver { color: #c0c0c0; }
  .standing-rank.bronze { color: #cd7f32; }
  .standing-name { flex: 1; font-size: 1rem; font-weight: 600; }
  .standing-stats { color: var(--muted); font-size: 0.85rem; }
  .status-live { display: inline-flex; align-items: center; gap: 6px; color: #00ff88; font-size: 0.8rem; }
  .dot { width: 8px; height: 8px; background: #00ff88; border-radius: 50%; animation: pulse 1.5s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .error-msg { color: var(--danger); text-align: center; font-size: 0.9rem; margin-top: 10px; display: none; }
  .tabs { display: flex; gap: 0; margin-bottom: 20px; background: var(--surface);
           border-radius: 12px; padding: 4px; border: 1px solid rgba(0,212,255,0.15); }
  .tab { flex: 1; padding: 10px; text-align: center; cursor: pointer; border-radius: 10px;
          font-family: 'Orbitron', sans-serif; font-size: 0.7rem; font-weight: 700;
          text-transform: uppercase; color: var(--muted); transition: all 0.2s; }
  .tab.active { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; }
  .tab-content { display: none; }
  .tab-content.active { display: block; }
  .spinner { width: 40px; height: 40px; border: 3px solid rgba(0,212,255,0.2);
              border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite;
              margin: 20px auto; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .round-label { font-family: 'Orbitron', sans-serif; font-size: 0.75rem; color: var(--secondary);
                  text-transform: uppercase; letter-spacing: 1px; margin: 16px 0 8px; }
  .finish-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; }
  .finish-xtreme { background: rgba(255,215,0,0.2); color: var(--accent); }
  .finish-burst { background: rgba(255,68,68,0.2); color: #ff6b6b; }
  .finish-over { background: rgba(124,58,237,0.2); color: #a78bfa; }
  .finish-spin { background: rgba(0,212,255,0.2); color: var(--primary); }
  .btn-back { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--text);
              font-family: 'Orbitron', sans-serif; font-size: 0.75rem; font-weight: bold;
              padding: 8px 12px; border-radius: 8px; background: var(--surface);
              border: 1px solid rgba(0,212,255,0.25); text-transform: uppercase; transition: all 0.2s;
              margin-bottom: 12px; }
  .btn-back:hover { border-color: var(--primary); box-shadow: var(--neon); }
</style>
</head>
<body>
<div class="bg-particles"></div>
<div class="container">
  <div style="text-align: left; margin-top: 10px;">
    <a href="/lobby" class="btn-back">← Torna alla Lobby</a>
  </div>
  <div class="logo">
    <h1>BEYBLADE X</h1>
    <p>Tournament Manager — Mobile View</p>
  </div>

  <!-- Join Form -->
  <div id="joinView">
    <div class="card">
      <h2>Enter Tournament Code</h2>
      <div class="code-inputs">
        <div class="code-group">
          <input class="code-digit" id="d0" maxlength="1" autocomplete="off">
          <input class="code-digit" id="d1" maxlength="1" autocomplete="off">
          <input class="code-digit" id="d2" maxlength="1" autocomplete="off">
        </div>
        <span class="code-sep">-</span>
        <div class="code-group">
          <input class="code-digit" id="d3" maxlength="1" autocomplete="off">
          <input class="code-digit" id="d4" maxlength="1" autocomplete="off">
          <input class="code-digit" id="d5" maxlength="1" autocomplete="off">
        </div>
      </div>
      <button class="btn" id="joinBtn" onclick="joinTournament()">JOIN TOURNAMENT</button>
      <p class="error-msg" id="errorMsg">Code not found. Check with the referee.</p>
    </div>
  </div>

  <!-- Tournament View -->
  <div id="tournamentView" class="tournament-view">
    <div class="t-header">
      <div class="t-name" id="tName"></div>
      <div class="t-code" id="tCode"></div>
      <div class="status-live" style="justify-content:center;margin-top:8px">
        <div class="dot"></div> LIVE
      </div>
    </div>
    <div class="tabs">
      <div class="tab active" onclick="showTab('bracket')">Bracket</div>
      <div class="tab" onclick="showTab('standings')">Standings</div>
    </div>
    <div id="bracketTab" class="tab-content active">
      <div id="bracketContent"><div class="spinner"></div></div>
    </div>
    <div id="standingsTab" class="tab-content">
      <div id="standingsContent"><div class="spinner"></div></div>
    </div>
  </div>
</div>

<script>
const INITIAL_CODE = {code_value};
let currentCode = null;
let ws = null;
let bladerMap = {};

// Auto-fill digits if code provided in URL
if (INITIAL_CODE) {
  const clean = INITIAL_CODE.replace('-', '');
  [...clean].forEach((c, i) => {
    const el = document.getElementById('d' + i);
    if (el) el.value = c.toUpperCase();
  });
  setTimeout(joinTournament, 100);
}

// Tab auto-advance input
document.querySelectorAll('.code-digit').forEach((inp, idx, all) => {
  inp.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (e.target.value && idx < all.length - 1) all[idx+1].focus();
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !e.target.value && idx > 0) all[idx-1].focus();
  });
});

function getCode() {
  return ['d0','d1','d2','d3','d4','d5'].map(id => document.getElementById(id).value).join('');
}

async function joinTournament() {
  const code = getCode();
  if (code.length < 6) return;
  const formatted = code.slice(0,3) + '-' + code.slice(3);
  const btn = document.getElementById('joinBtn');
  btn.disabled = true;
  btn.textContent = 'CONNECTING...';
  try {
    const res = await fetch('/api/tournament/' + formatted);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    currentCode = formatted;
    document.getElementById('joinView').style.display = 'none';
    document.getElementById('tournamentView').style.display = 'block';
    document.getElementById('tName').textContent = data.name;
    document.getElementById('tCode').textContent = 'Code: ' + formatted;
    // Build blader map
    (data.bladers || []).forEach(b => bladerMap[b.id] = b);
    connectWs(formatted);
    loadBracket(formatted);
    loadStandings(data.bladers || []);
  } catch(e) {
    document.getElementById('errorMsg').style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'JOIN TOURNAMENT';
  }
}

function connectWs(code) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/${code}`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'match_update' || msg.type === 'bracket_update') {
        loadBracket(code);
      }
      if (msg.type === 'standings_update' && msg.bladers) {
        bladerMap = {};
        msg.bladers.forEach(b => bladerMap[b.id] = b);
        loadStandings(msg.bladers);
      }
    } catch(_) {}
  };
  ws.onclose = () => setTimeout(() => connectWs(code), 3000);
}

async function loadBracket(code) {
  const res = await fetch('/api/tournament/' + code + '/matches');
  const matches = await res.json();
  const rounds = {};
  matches.forEach(m => {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });
  let html = '';
  Object.keys(rounds).sort().forEach(r => {
    const label = r === '1' ? 'Round 1' : r === '2' ? 'Semi-Finals' : r === '3' ? 'Final' : 'Round ' + r;
    html += `<div class="round-label">${label}</div>`;
    rounds[r].forEach(m => {
      if (m.blader2_id && m.blader2_id.startsWith('BYE_')) return;
      const b1 = bladerMap[m.blader1_id] || {name: m.blader1_id.substring(0,8)};
      const b2 = bladerMap[m.blader2_id] || {name: m.blader2_id.substring(0,8)};
      const w = m.winner_id;
      const finishHtml = m.finish_type ? `<span class="finish-badge finish-${m.finish_type}">${m.finish_type}</span>` : '';
      html += `<div class="match-card">
        <div class="match-vs">
          <span class="blader-name ${w===m.blader1_id?'winner':''}">${b1.name}</span>
          <span class="score"><span>${m.blader1_points}</span></span>
          <span class="vs-badge">VS</span>
          <span class="score"><span>${m.blader2_points}</span></span>
          <span class="blader-name ${w===m.blader2_id?'winner':''}" style="text-align:right">${b2.name}</span>
        </div>
        ${finishHtml ? '<div style="text-align:center;margin-top:8px">'+finishHtml+'</div>' : ''}
      </div>`;
    });
  });
  document.getElementById('bracketContent').innerHTML = html || '<p style="text-align:center;color:var(--muted)">No matches yet</p>';
}

function loadStandings(bladers) {
  const sorted = [...bladers].sort((a,b) => b.wins-a.wins || b.points_total-a.points_total);
  const ranks = ['gold','silver','bronze'];
  const html = '<ul class="standings">' + sorted.map((b,i) => `
    <li class="standing-item">
      <span class="standing-rank ${ranks[i]||''}">${i+1}</span>
      <span class="standing-name">${b.name}</span>
      <span class="standing-stats">${b.wins}W · ${b.losses}L · ${b.points_total}pts</span>
    </li>`).join('') + '</ul>';
  document.getElementById('standingsContent').innerHTML = html;
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', ['bracket','standings'][i]===tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tab+'Tab').classList.add('active');
}
</script>
</body>
</html>"##.replace("{code_value}", &code_value)
}

fn mobile_lobby_html() -> String {
    r##"<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Beyblade X — Mobile Lobby</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');
  :root {
    --bg: #060613; --surface: #101026; --surface-2: #18183a; --surface-3: #222252;
    --primary: #00d4ff; --secondary: #7c3aed; --accent: #ffd700; --danger: #ff4444;
    --success: #00ff88; --text: #e2e8f0; --muted: #64748b;
    --neon: 0 0 20px rgba(0,212,255,0.5); --glow-gold: 0 0 20px rgba(255,215,0,0.4);
    --glow-secondary: 0 0 20px rgba(124,58,237,0.5);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Rajdhani', sans-serif;
         min-height: 100vh; overflow-x: hidden; }
  .bg-particles {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;
    background: radial-gradient(ellipse at 10% 10%, rgba(124,58,237,0.15) 0%, transparent 60%),
                radial-gradient(ellipse at 90% 90%, rgba(0,212,255,0.1) 0%, transparent 60%);
  }
  .container { position: relative; z-index: 1; max-width: 480px; margin: 0 auto; padding: 16px; }
  
  /* Logo */
  .logo { text-align: center; padding: 20px 0 10px; }
  .logo h1 { font-family: 'Orbitron', sans-serif; font-size: 1.8rem; font-weight: 900;
              background: linear-gradient(135deg, var(--primary), var(--accent));
              -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .logo p { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }

  /* Cards & Forms */
  .card { background: var(--surface); border: 1px solid rgba(0,212,255,0.15); border-radius: 16px;
           padding: 20px; margin-bottom: 16px; backdrop-filter: blur(10px); }
  .card h2 { font-family: 'Orbitron', sans-serif; font-size: 1rem; color: var(--primary);
              margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }

  .form-group { margin-bottom: 12px; }
  .form-label { display: block; font-family: 'Orbitron', sans-serif; font-size: 0.7rem;
                 color: var(--muted); margin-bottom: 4px; letter-spacing: 1px; }
  .form-input, .form-select { width: 100%; padding: 12px; background: rgba(255,255,255,0.03);
                               border: 1px solid rgba(0,212,255,0.25); border-radius: 10px;
                               color: var(--text); outline: none; font-family: 'Rajdhani', sans-serif;
                               font-size: 1rem; transition: all 0.2s; }
  .form-input:focus, .form-select:focus { border-color: var(--primary); box-shadow: var(--neon);
                                           background: rgba(0,212,255,0.05); }
  
  .btn { width: 100%; padding: 12px; background: linear-gradient(135deg, var(--primary), var(--secondary));
          border: none; border-radius: 10px; color: white; font-family: 'Orbitron', sans-serif;
          font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.3s;
          text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center;
          justify-content: center; gap: 8px; }
  .btn:hover { transform: translateY(-1px); box-shadow: var(--neon); }
  .btn-secondary { background: var(--surface-2); border: 1px solid rgba(255,255,255,0.08); }
  .btn-secondary:hover { background: var(--surface-3); box-shadow: none; transform: none; }
  .btn-danger { background: linear-gradient(135deg, #ff4444, #880000); }
  .btn-danger:hover { box-shadow: 0 0 15px rgba(255,68,68,0.5); }

  /* Avatar Colors Swatch */
  .color-swatches { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .color-swatch { width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
                    border: 2px solid transparent; transition: all 0.2s; }
  .color-swatch.selected { border-color: white; transform: scale(1.1); box-shadow: 0 0 10px rgba(255,255,255,0.5); }

  /* Avatar Icon */
  .avatar { display: flex; align-items: center; justify-content: center; border-radius: 50%;
             color: white; font-family: 'Orbitron', sans-serif; font-weight: 700; flex-shrink: 0; }
  .avatar-sm { width: 36px; height: 36px; font-size: 0.65rem; }
  .avatar-md { width: 44px; height: 44px; font-size: 0.8rem; }
  .avatar-lg { width: 56px; height: 56px; font-size: 1rem; }

  /* Lobby view */
  #authView, #mainLobbyView, #liveMatchView { display: none; }
  
  /* User profile header */
  .profile-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .profile-info { flex: 1; }
  .profile-name { font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--accent); }
  .profile-stats { color: var(--muted); font-size: 0.8rem; margin-top: 2px; }
  .settings-btn { background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 1.2rem; }

  /* Navigation Tabs */
  .tabs { display: flex; background: var(--surface); border-radius: 12px; padding: 4px;
           border: 1px solid rgba(0,212,255,0.1); margin-bottom: 16px; }
  .tab { flex: 1; padding: 10px; text-align: center; cursor: pointer; border-radius: 8px;
          font-family: 'Orbitron', sans-serif; font-size: 0.75rem; font-weight: 700;
          text-transform: uppercase; color: var(--muted); transition: all 0.2s; }
  .tab.active { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; }
  
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* Online Bladers List */
  .player-item { display: flex; align-items: center; gap: 12px; padding: 12px;
                  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
                  border-radius: 12px; margin-bottom: 8px; transition: all 0.2s; }
  .player-item:hover { border-color: rgba(0,212,255,0.2); background: rgba(255,255,255,0.04); }
  .player-name-wrapper { flex: 1; }
  .player-name { font-family: 'Orbitron', sans-serif; font-size: 0.9rem; font-weight: 700; }
  .player-beys { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .bey-badge { font-size: 0.6rem; padding: 1px 6px; background: rgba(0,212,255,0.1);
                 border: 1px solid rgba(0,212,255,0.25); color: var(--primary); border-radius: 4px; }
  .challenge-btn { padding: 8px 12px; border-radius: 8px; font-size: 0.7rem; width: auto; flex-shrink: 0; }

  /* Modal Overlay */
  .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%;
               background: rgba(6,6,19,0.9); z-index: 100; display: none;
               align-items: center; justify-content: center; padding: 16px; overflow-y: auto; }
  .overlay-content { background: var(--surface); border: 1px solid var(--primary);
                     border-radius: 16px; padding: 20px; width: 100%; max-width: 400px;
                     position: relative; box-shadow: var(--neon); }
  .overlay-close { position: absolute; top: 12px; right: 12px; background: transparent;
                    border: none; color: var(--muted); font-size: 1.2rem; cursor: pointer; }
  .overlay-title { font-family: 'Orbitron', sans-serif; font-size: 1rem; color: var(--accent);
                    margin-bottom: 16px; text-transform: uppercase; }

  /* Tournaments List */
  .tournament-item { display: flex; justify-content: space-between; align-items: center; padding: 14px;
                      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
                      border-radius: 12px; margin-bottom: 8px; }
  .t-info { flex: 1; }
  .t-title { font-family: 'Orbitron', sans-serif; font-size: 0.9rem; font-weight: 700; color: var(--text); }
  .t-meta { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }
  .t-status { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem;
                font-family: 'Orbitron', sans-serif; text-transform: uppercase; font-weight: bold; }
  .t-status.lobby { background: rgba(0,212,255,0.1); color: var(--primary); border: 1px solid var(--primary); }
  .t-status.active { background: rgba(0,255,136,0.1); color: var(--success); border: 1px solid var(--success); }
  .t-status.completed { background: rgba(255,68,68,0.1); color: var(--danger); border: 1px solid var(--danger); }

  /* Score Inputs */
  .score-selector { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 16px 0; }
  .score-box { width: 60px; height: 60px; text-align: center; font-family: 'Orbitron', sans-serif;
                font-size: 1.8rem; font-weight: 900; border-radius: 10px; background: rgba(0,212,255,0.05);
                border: 2px solid rgba(0,212,255,0.3); color: var(--text); outline: none; }
  .score-box:focus { border-color: var(--primary); box-shadow: var(--neon); }
  .score-dash { font-size: 1.5rem; color: var(--muted); font-weight: bold; }

  /* Finish Type Swatches */
  .finish-types { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
  .finish-type-btn { padding: 10px; border-radius: 8px; font-family: 'Orbitron', sans-serif;
                      font-size: 0.75rem; text-align: center; border: 1px solid rgba(255,255,255,0.1);
                      background: rgba(255,255,255,0.02); color: var(--muted); cursor: pointer; transition: all 0.2s; }
  .finish-type-btn.selected.spin { border-color: var(--primary); background: rgba(0,212,255,0.15); color: var(--primary); }
  .finish-type-btn.selected.over { border-color: var(--secondary); background: rgba(124,58,237,0.15); color: #a78bfa; }
  .finish-type-btn.selected.burst { border-color: var(--danger); background: rgba(255,68,68,0.15); color: #ff6b6b; }
  .finish-type-btn.selected.xtreme { border-color: var(--accent); background: rgba(255,215,0,0.15); color: var(--accent); }

  /* Challenge alert modal popup */
  .incoming-alert-box { text-align: center; }
  .incoming-alert-desc { font-size: 1rem; margin: 12px 0 20px; line-height: 1.5; color: var(--text); }
  .incoming-alert-desc strong { color: var(--accent); }
  
  .error-txt { color: var(--danger); text-align: center; font-size: 0.85rem; margin-top: 8px; display: none; }

  /* Tournament details overlay */
  .t-overlay-inner { width: 100%; max-width: 460px; }
  .t-overlay-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  
  /* Toast Notification */
  .toast-container { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                      z-index: 1000; width: 90%; max-width: 320px; }
  .toast { background: rgba(16,16,38,0.95); border: 1px solid var(--primary); border-radius: 8px;
            padding: 12px; color: var(--text); font-size: 0.85rem; box-shadow: var(--neon);
            margin-top: 8px; display: flex; align-items: center; gap: 8px; animation: slideUp 0.3s forwards; }
  .toast.success { border-color: var(--success); box-shadow: 0 0 15px rgba(0,255,136,0.3); }
  .toast.error { border-color: var(--danger); box-shadow: 0 0 15px rgba(255,68,68,0.3); }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .spinner {
    border: 4px solid rgba(0, 212, 255, 0.1);
    border-left-color: var(--primary);
    border-radius: 50%;
    width: 36px;
    height: 36px;
    animation: spin-loader 1s linear infinite;
    margin: 0 auto;
  }
  @keyframes spin-loader {
    to { transform: rotate(360deg); }
  }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js"></script>
</head>
<body>
<div class="bg-particles"></div>
<div class="container">
  <div class="logo">
    <h1>BEYBLADE X</h1>
    <p>Lobby Mobile per Blader</p>
  </div>

  <!-- AUTH VIEW -->
  <div id="authView">
    <div class="card" id="loginCard">
      <h2>Accedi come Blader</h2>
      <div class="form-group">
        <label class="form-label">Scegli Blader</label>
        <select class="form-select" id="loginSelect">
          <option value="">Caricamento bladers...</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" id="loginPassword" type="password" placeholder="Inserisci password">
      </div>
      <button class="btn" onclick="login()">ACCEDI</button>
      <div style="text-align:center;margin-top:16px">
        <a href="#" style="color:var(--primary);font-size:0.85rem" onclick="toggleAuth(false)">Oppure registrati come nuovo Blader</a>
      </div>
      <p class="error-txt" id="loginError"></p>
    </div>

    <div class="card" id="registerCard" style="display:none">
      <h2>Registrati come Blader</h2>
      <div class="form-group">
        <label class="form-label">Nome Blader</label>
        <input class="form-input" id="regName" placeholder="Es. Valt Aoi">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" id="regPassword" type="password" placeholder="Scegli password">
      </div>
      <div class="form-group">
        <label class="form-label">Colore Avatar</label>
        <div class="color-swatches" id="regSwatches"></div>
      </div>
      <button class="btn" onclick="register()">REGISTRATI</button>
      <div style="text-align:center;margin-top:16px">
        <a href="#" style="color:var(--primary);font-size:0.85rem" onclick="toggleAuth(true)">Hai già un account? Accedi</a>
      </div>
      <p class="error-txt" id="regError"></p>
    </div>
  </div>

  <!-- MAIN LOBBY VIEW -->
  <div id="mainLobbyView">
    <!-- Header profilo -->
    <div class="card">
      <div class="profile-header">
        <div class="avatar avatar-md" id="userAvatar">?</div>
        <div class="profile-info">
          <div class="profile-name" id="userName">---</div>
          <div class="profile-stats" id="userStats">0 Vittorie · 0 Sconfitte · 0 Punti</div>
        </div>
        <button class="settings-btn" onclick="openSettings()">⚙️</button>
      </div>
    </div>

    <!-- Navigazione Tab -->
    <div class="tabs">
      <div class="tab active" onclick="showTab('players')">Online</div>
      <div class="tab" onclick="showTab('tournaments')">Tornei</div>
      <div class="tab" onclick="showTab('beys')">Beys</div>
      <div class="tab" onclick="showTab('profile')">Profilo</div>
      <div class="tab" onclick="showTab('history')">Attività</div>
    </div>

    <!-- Players Tab -->
    <div id="playersTab" class="tab-content active">
      <div class="card">
        <h2>Blader Attivi</h2>
        <div id="onlinePlayersContent">
          <div class="spinner"></div>
        </div>
      </div>
    </div>

    <!-- Tournaments Tab -->
    <div id="tournamentsTab" class="tab-content">
      <div class="card">
        <h2>Tornei Disponibili</h2>
        <div id="tournamentsContent">
          <div class="spinner"></div>
        </div>
      </div>
    </div>

    <!-- Beys Tab -->
    <div id="beysTab" class="tab-content">
      <!-- Il Mio Deck -->
      <div class="card">
        <h2>Il Mio Deck (Max 3 Bey)</h2>
        <p style="font-size:0.8rem;color:var(--muted);margin-bottom:12px">Configura il tuo deck di 3 Beyblade per sfidare gli altri Blader.</p>
        <div class="deck-container" style="display:flex;flex-direction:column;gap:10px">
          <div class="deck-slot" onclick="openDeckSelect(0)" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface-2);border:1px dashed rgba(0,212,255,0.3);border-radius:12px;cursor:pointer">
            <div>
              <div style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;font-family:'Orbitron'">Slot 1</div>
              <div id="deckSlot0Name" style="font-size:1rem;font-weight:bold;color:var(--text)">Slot vuoto</div>
            </div>
            <div style="font-size:1.2rem;color:var(--primary)">✏️</div>
          </div>
          <div class="deck-slot" onclick="openDeckSelect(1)" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface-2);border:1px dashed rgba(0,212,255,0.3);border-radius:12px;cursor:pointer">
            <div>
              <div style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;font-family:'Orbitron'">Slot 2</div>
              <div id="deckSlot1Name" style="font-size:1rem;font-weight:bold;color:var(--text)">Slot vuoto</div>
            </div>
            <div style="font-size:1.2rem;color:var(--primary)">✏️</div>
          </div>
          <div class="deck-slot" onclick="openDeckSelect(2)" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface-2);border:1px dashed rgba(0,212,255,0.3);border-radius:12px;cursor:pointer">
            <div>
              <div style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;font-family:'Orbitron'">Slot 3</div>
              <div id="deckSlot2Name" style="font-size:1rem;font-weight:bold;color:var(--text)">Slot vuoto</div>
            </div>
            <div style="font-size:1.2rem;color:var(--primary)">✏️</div>
          </div>
        </div>
      </div>

      <!-- I Miei Bey Custom -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2>I Miei Bey Custom</h2>
          <div style="display:flex;gap:8px">
            <button class="btn" style="width:auto;padding:6px 12px;font-size:0.75rem;background:linear-gradient(135deg, var(--accent), var(--secondary));box-shadow:var(--glow-gold)" onclick="startQrScanner(false)">Scan QR</button>
            <button class="btn" style="width:auto;padding:6px 12px;font-size:0.75rem" onclick="openCreateBey()">Nuovo Bey</button>
          </div>
        </div>
        <div id="customBeysList" style="display:flex;flex-direction:column;gap:10px">
          <p style="text-align:center;color:var(--muted);font-size:0.85rem">Nessun Bey custom creato.</p>
        </div>
      </div>

      <!-- Beyblade Standard -->
      <div class="card">
        <h2>Beyblade Standard</h2>
        <div class="form-group" style="position:relative;margin-bottom:12px">
          <input class="form-input" id="searchStandardBeysInput" placeholder="Cerca Beyblade..." oninput="filterStandardBeysMobile()">
        </div>
        <div id="standardBeysListMobile" style="display:flex;flex-direction:column;gap:10px;max-height:300px;overflow-y:auto">
          <!-- Rendered dynamically -->
        </div>
      </div>
    </div>

    <!-- Profile Tab -->
    <div id="profileTab" class="tab-content">
      <!-- Statistiche Personali -->
      <div class="card">
        <h2>Statistiche Blader</h2>
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:8px">
          <div class="stat-box" style="background:var(--surface-2);padding:12px;border-radius:10px;text-align:center;border:1px solid rgba(255,255,255,0.03)">
            <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-family:'Orbitron'">Vittorie</div>
            <div id="profWins" style="font-size:1.8rem;font-weight:bold;color:var(--success);font-family:'Orbitron';margin-top:4px">0</div>
          </div>
          <div class="stat-box" style="background:var(--surface-2);padding:12px;border-radius:10px;text-align:center;border:1px solid rgba(255,255,255,0.03)">
            <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-family:'Orbitron'">Sconfitte</div>
            <div id="profLosses" style="font-size:1.8rem;font-weight:bold;color:var(--danger);font-family:'Orbitron';margin-top:4px">0</div>
          </div>
          <div class="stat-box" style="background:var(--surface-2);padding:12px;border-radius:10px;text-align:center;border:1px solid rgba(255,255,255,0.03)">
            <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-family:'Orbitron'">Win Rate</div>
            <div id="profWinRate" style="font-size:1.8rem;font-weight:bold;color:var(--accent);font-family:'Orbitron';margin-top:4px">0%</div>
          </div>
          <div class="stat-box" style="background:var(--surface-2);padding:12px;border-radius:10px;text-align:center;border:1px solid rgba(255,255,255,0.03)">
            <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-family:'Orbitron'">Punti Totali</div>
            <div id="profPoints" style="font-size:1.8rem;font-weight:bold;color:var(--primary);font-family:'Orbitron';margin-top:4px">0</div>
          </div>
        </div>
      </div>

      <!-- Cronologia Battaglie -->
      <div class="card">
        <h2>Cronologia Battaglie</h2>
        <div id="profileMatchesHistory" style="display:flex;flex-direction:column;gap:10px;margin-top:12px;max-height:300px;overflow-y:auto">
          <p style="text-align:center;color:var(--muted);font-size:0.85rem">Nessuna battaglia registrata.</p>
        </div>
      </div>
    </div>

    <!-- History Tab -->
    <div id="historyTab" class="tab-content">
      <div class="card">
        <h2>Cronologia Attività</h2>
        <div id="historyContent" style="display:flex;flex-direction:column;gap:10px;max-height:550px;overflow-y:auto;margin-top:12px">
          <div class="spinner"></div>
        </div>
      </div>
    </div>

  </div>
</div>

<!-- TOAST CONTAINER -->
<div class="toast-container" id="toastContainer"></div>

<!-- CHALLENGE MODAL (INVIO SFIDA) -->
<div class="overlay" id="challengeModal">
  <div class="overlay-content">
    <button class="overlay-close" onclick="closeOverlay('challengeModal')">×</button>
    <div class="overlay-title" id="challengeTitle">Invia Sfida</div>
    
    <div class="form-group">
      <label class="form-label">Modalità di Sfida</label>
      <select class="form-select" id="challengeFormat" onchange="adjustPointsThreshold()">
        <option value="1on1">1on1 (Soglia Punti)</option>
        <option value="3on3">3on3 (Best-of-3 · 2 Vittorie)</option>
        <option value="deck">Deck (Best-of-3 · 2 Vittorie)</option>
      </select>
    </div>

    <div class="form-group" id="pointThresholdGroup">
      <label class="form-label">Soglia Punti</label>
      <select class="form-select" id="challengeThreshold">
        <option value="4">⚡ 4 Punti</option>
        <option value="7">⚡ 7 Punti</option>
      </select>
    </div>

    <button class="btn" style="margin-top:16px" onclick="sendChallengeSubmit()">LANCIA SFIDA LIVE</button>
  </div>
</div>

<!-- CHALLENGE RECEIVED MODAL (RICEZIONE SFIDA) -->
<div class="overlay" id="challengeReceivedModal">
  <div class="overlay-content incoming-alert-box">
    <div class="overlay-title" style="color:var(--primary)">Sfida Ricevuta!</div>
    <div class="incoming-alert-desc" id="incomingChallengeDesc">
      ---
    </div>
    <div style="display:flex;gap:12px">
      <button class="btn btn-secondary" onclick="declineChallenge()">RIFIUTA</button>
      <button class="btn" style="background:var(--success)" onclick="acceptChallenge()">ACCETTA</button>
    </div>
  </div>
</div>

<!-- CHALLENGE WAITING MODAL (ATTESA ACCETTAZIONE) -->
<div class="overlay" id="challengeWaitingModal">
  <div class="overlay-content" style="text-align:center">
    <div class="overlay-title" style="color:var(--primary)">Attesa Conferma</div>
    <div style="margin:24px 0">
      <div class="spinner"></div>
      <p id="challengeWaitingDesc" style="font-size:0.85rem;line-height:1.4;color:var(--text);margin-top:12px">
        In attesa che l'avversario accetti la sfida...
      </p>
    </div>
    <button class="btn btn-secondary" onclick="cancelWaitingChallenge()">ANNULLA</button>
  </div>
</div>

<!-- LIVE MATCH VIEW -->
<div id="liveMatchView" style="display:none">
  <!-- Scoreboard Card -->
  <div class="card" style="padding: 16px;">
    <div style="font-family:'Orbitron';font-size:0.75rem;color:var(--primary);text-align:center;letter-spacing:2px;margin-bottom:12px;text-transform:uppercase">
      Versus Live Match
    </div>
    
    <div class="score-display-wrapper" style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-2);padding:16px;border-radius:12px;border:1px solid rgba(0,212,255,0.1)">
      <div style="text-align:center;flex:1">
        <div id="lmChallengerName" style="font-family:'Orbitron';font-weight:700;font-size:0.95rem;color:var(--accent);margin-bottom:6px">SFIDANTE</div>
        <div id="lmChallengerScore" style="font-family:'Orbitron';font-size:2rem;font-weight:900;text-shadow:0 0 10px var(--primary)">0</div>
        <div id="lmChallengerMeta" style="font-size:0.7rem;color:var(--muted)">0 Wins</div>
      </div>
      
      <div style="font-family:'Orbitron';font-weight:900;color:var(--text);font-size:1.2rem;padding:0 12px">VS</div>
      
      <div style="text-align:center;flex:1">
        <div id="lmOpponentName" style="font-family:'Orbitron';font-weight:700;font-size:0.95rem;color:var(--danger);margin-bottom:6px">AVVERSARIO</div>
        <div id="lmOpponentScore" style="font-family:'Orbitron';font-size:2rem;font-weight:900;text-shadow:0 0 10px var(--danger)">0</div>
        <div id="lmOpponentMeta" style="font-size:0.7rem;color:var(--muted)">0 Wins</div>
      </div>
    </div>

    <div style="text-align:center;margin-top:12px">
      <span class="t-status lobby" id="lmMatchFormat" style="font-family:'Orbitron';font-size:0.7rem;padding:4px 8px;border-radius:6px">1on1 · Soglia: 4 pt</span>
    </div>
  </div>

  <!-- Referee Panel (Only Challenger) -->
  <div class="card" id="lmRefereePanel" style="display:none">
    <h2 style="margin-bottom:16px">Registra Round</h2>
    
    <div class="form-group">
      <label class="form-label">Esito Round</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <button class="btn btn-secondary" id="lmWinBtn1" onclick="selectRoundOutcome('winner1')">Vittoria Tu</button>
        <button class="btn btn-secondary" id="lmWinBtn2" onclick="selectRoundOutcome('winner2')">Vittoria Avv.</button>
        <button class="btn btn-secondary" id="lmWinDraw" style="grid-column:span 2" onclick="selectRoundOutcome('draw')">Pareggio</button>
        <button class="btn btn-secondary" id="lmWinFoul1" onclick="selectRoundOutcome('foul1')">Fallo Tuo</button>
        <button class="btn btn-secondary" id="lmWinFoul2" onclick="selectRoundOutcome('foul2')">Fallo Avv.</button>
      </div>
    </div>

    <div class="form-group" id="lmFinishGroup">
      <label class="form-label">Tipo di Finish</label>
      <div class="finish-types">
        <button class="finish-type-btn selected spin" id="lmFinishSpin" onclick="selectLmFinish('spin')">Spin Finish (+1)</button>
        <button class="finish-type-btn over" id="lmFinishOver" onclick="selectLmFinish('over')">Over Finish (+2)</button>
        <button class="finish-type-btn burst" id="lmFinishBurst" onclick="selectLmFinish('burst')">Burst Finish (+2)</button>
        <button class="finish-type-btn xtreme" id="lmFinishXtreme" onclick="selectLmFinish('xtreme')">Xtreme Finish (+3)</button>
      </div>
    </div>

    <button class="btn" style="margin-top:16px" onclick="submitRound()">REGISTRA ROUND</button>
  </div>

  <!-- Spectator Status Panel (Opponent) -->
  <div class="card" id="lmSpectatorPanel" style="display:none;text-align:center;padding:24px 16px">
    <div class="spinner"></div>
    <p style="font-size:0.85rem;color:var(--text);margin-top:12px">
      In attesa che l'avversario registri il round...
    </p>
  </div>

  <!-- Live Round History -->
  <div class="card">
    <h2>Storico Round</h2>
    <div id="lmRoundHistoryContent" style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto">
      <p style="text-align:center;color:var(--muted);font-size:0.8rem;padding:12px 0">Nessun round giocato.</p>
    </div>
  </div>

  <!-- Match Controls -->
  <button class="btn btn-danger" style="margin-top:8px" onclick="cancelLiveMatch()">RITIRO / ANNULLA MATCH</button>
</div>

<!-- SETTINGS MODAL -->
<div class="overlay" id="settingsModal">
  <div class="overlay-content">
    <button class="overlay-close" onclick="closeOverlay('settingsModal')">×</button>
    <div class="overlay-title">Impostazioni Blader</div>
    
    <div class="card" style="background:rgba(255,255,255,0.02);padding:14px;border:none">
      <h3 style="font-family:'Orbitron';font-size:0.85rem;color:var(--primary);margin-bottom:12px">Cambia Password</h3>
      <div class="form-group">
        <label class="form-label">Vecchia Password</label>
        <input class="form-input" id="oldPasswordInput" type="password" placeholder="Lascia vuoto se prima volta">
      </div>
      <div class="form-group">
        <label class="form-label">Nuova Password</label>
        <input class="form-input" id="newPasswordInput" type="password" placeholder="Inserisci nuova password">
      </div>
      <button class="btn" onclick="submitChangePassword()">Salva Password</button>
      <p class="error-txt" id="changePasswordError"></p>
    </div>

    <button class="btn btn-danger" style="margin-top:16px" onclick="logout()">LOGOUT</button>
  </div>
</div>

<!-- DECK SELECT MODAL -->
<div class="overlay" id="deckSelectModal">
  <div class="overlay-content" style="max-width:420px">
    <button class="overlay-close" onclick="closeOverlay('deckSelectModal')">×</button>
    <div class="overlay-title" id="deckSelectModalTitle">Seleziona Beyblade</div>
    <button class="btn" style="margin-bottom:14px;background:linear-gradient(135deg, var(--accent), var(--secondary));box-shadow:var(--glow-gold)" onclick="startQrScanner(true)">📷 SCAN QR CODE BEY</button>
    
    <div class="tabs" style="margin-bottom:12px">
      <div class="tab active" id="deckSelTabStandard" onclick="toggleDeckSelectTab('standard')">Standard</div>
      <div class="tab" id="deckSelTabCustom" onclick="toggleDeckSelectTab('custom')">Custom</div>
    </div>

    <div id="deckSelectStandardList" style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;padding-right:4px">
      <!-- Popolated via JS -->
    </div>

    <div id="deckSelectCustomList" style="display:none;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;padding-right:4px">
      <!-- Popolated via JS -->
    </div>

    <button class="btn btn-danger" style="margin-top:16px" onclick="removeBeyFromSlot()">RIMUOVI BEY DA QUESTO SLOT</button>
  </div>
</div>

<!-- QR SCANNER MODAL -->
<div class="overlay" id="qrScannerModal" style="z-index: 200;">
  <div class="overlay-content" style="max-width: 400px; text-align: center;">
    <button class="overlay-close" onclick="stopQrScanner()">×</button>
    <div class="overlay-title">Scansiona QR Beyblade</div>
    <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 16px;">
      Inquadra il QR code di un Beyblade originale o il QR di condivisione di un amico.
    </p>
    <div id="qr-reader" style="width: 100%; max-width: 320px; margin: 0 auto; background: #0c0c1e; border-radius: 12px; overflow: hidden; border: 2px solid var(--primary); box-shadow: var(--neon);"></div>
    <div style="margin-top: 16px;">
      <button class="btn" style="background: linear-gradient(135deg, var(--accent), var(--secondary)); box-shadow: var(--glow-gold); font-size: 0.75rem; padding: 10px 14px;" onclick="document.getElementById('qr-file-input').click()">
        📁 CARICA / SCATTA FOTO QR
      </button>
      <input type="file" accept="image/*" id="qr-file-input" style="display:none" onchange="handleQrFileSelected(event)">
    </div>
    <div id="qr-reader-results" style="margin-top: 12px; font-size: 0.9rem; font-weight: bold; color: var(--success); font-family: 'Orbitron';"></div>
    <button class="btn btn-secondary" style="margin-top: 16px;" onclick="stopQrScanner()">ANNULLA</button>
  </div>
</div>

<!-- QR ASSOCIATION MODAL -->
<div class="overlay" id="qrAssociationModal" style="z-index: 250;">
  <div class="overlay-content" style="max-width: 400px; text-align: center;">
    <button class="overlay-close" onclick="closeOverlay('qrAssociationModal')">×</button>
    <div class="overlay-title">Associa Codice QR</div>
    <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 16px; line-height: 1.4;">
      Codice sconosciuto rilevato. A quale Beyblade standard appartiene questo QR?
    </p>
    <div class="form-group" style="text-align: left; margin-bottom: 20px;">
      <label class="form-label" style="font-size: 0.75rem;">Seleziona Beyblade</label>
      <select class="form-input" id="qrAssociateSelect" style="background: var(--surface-2); color: var(--text); border: 1px solid var(--border); font-size: 0.85rem; padding: 10px;">
        <!-- Filled via JS -->
      </select>
    </div>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <button class="btn btn-secondary" onclick="closeOverlay('qrAssociationModal')">ANNULLA</button>
      <button class="btn" id="qrAssociateBtn" style="background: var(--primary); color: var(--bg-dark);" onclick="confirmQrAssociation()">ASSOCIA</button>
    </div>
  </div>
</div>

<!-- SHARE BEY MODAL -->
<div class="overlay" id="shareBeyModal" style="z-index: 200;">
  <div class="overlay-content" style="max-width: 350px; text-align: center;">
    <button class="overlay-close" onclick="closeOverlay('shareBeyModal')">×</button>
    <div class="overlay-title" id="shareBeyTitle">Condividi Beyblade</div>
    <div style="background: white; padding: 12px; border-radius: 12px; display: inline-block; margin: 16px 0; border: 2px solid var(--primary); box-shadow: var(--neon);">
      <img id="shareBeyQrImg" src="" alt="QR Code" style="width: 200px; height: 200px; display: block;">
    </div>
    <p style="font-size: 0.85rem; color: var(--muted); line-height: 1.4;">
      Fai scansionare questo QR code a un amico dal suo smartphone per passargli la tua configurazione custom!
    </p>
    <button class="btn btn-secondary" style="margin-top: 16px;" onclick="closeOverlay('shareBeyModal')">CHIUDI</button>
  </div>
</div>

<!-- CREATE CUSTOM BEY MODAL -->
<div class="overlay" id="createBeyModal">
  <div class="overlay-content" style="max-width:440px">
    <button class="overlay-close" onclick="closeOverlay('createBeyModal')">×</button>
    <div class="overlay-title">Crea Beyblade Custom</div>
    
    <div class="form-group">
      <label class="form-label">Nome Beyblade</label>
      <input class="form-input" id="cbName" placeholder="Es. Buster X">
    </div>

    <div class="form-group">
      <label class="form-label">Blade</label>
      <select class="form-select" id="cbBlade" onchange="updateCbStatsPreview()"></select>
    </div>

    <div class="form-group">
      <label class="form-label">Ratchet</label>
      <select class="form-select" id="cbRatchet" onchange="updateCbStatsPreview()"></select>
    </div>

    <div class="form-group">
      <label class="form-label">Bit</label>
      <select class="form-select" id="cbBit" onchange="updateCbStatsPreview()"></select>
    </div>

    <div class="form-group">
      <label class="form-label">Colore Neon</label>
      <input type="color" class="form-input" id="cbColor" value="#00d4ff" style="height:44px;padding:4px;cursor:pointer">
    </div>

    <!-- Stats Preview Panel -->
    <div class="card" style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,212,255,0.1);padding:12px;margin:12px 0 16px">
      <h3 style="font-family:'Orbitron';font-size:0.75rem;color:var(--accent);margin-bottom:8px;text-transform:uppercase">Anteprima Statistiche</h3>
      <div style="font-size:0.8rem;margin-bottom:4px;color:var(--muted)">Tipo: <span id="cbPreviewType" style="color:var(--text);font-weight:bold;text-transform:uppercase">---</span></div>
      
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px">
            <span>Peso</span>
            <span id="cbValWeight">0g</span>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">
            <div id="cbBarWeight" style="height:100%;background:var(--primary);width:0%"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px">
            <span>Attacco</span>
            <span id="cbValAttack">0</span>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">
            <div id="cbBarAttack" style="height:100%;background:#ff4444;width:0%"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px">
            <span>Difesa</span>
            <span id="cbValDefense">0</span>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">
            <div id="cbBarDefense" style="height:100%;background:#00d4ff;width:0%"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px">
            <span>Resistenza</span>
            <span id="cbValStamina">0</span>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">
            <div id="cbBarStamina" style="height:100%;background:#00ff88;width:0%"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px">
            <span>Velocità</span>
            <span id="cbValSpeed">0</span>
          </div>
          <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">
            <div id="cbBarSpeed" style="height:100%;background:#ffd700;width:0%"></div>
          </div>
        </div>
      </div>
    </div>

    <button class="btn" onclick="saveCustomBey()">SALVA BEYBLADE</button>
    <p class="error-txt" id="cbError"></p>
  </div>
</div>

<!-- TOURNAMENT BRACKET OVERLAY -->
<div class="overlay" id="tournamentOverlay" style="align-items:flex-start">
  <div class="overlay-content t-overlay-inner" style="margin:20px auto;max-width:440px">
    <button class="overlay-close" onclick="closeOverlay('tournamentOverlay')">×</button>
    <div class="t-overlay-header">
      <div>
        <div class="overlay-title" id="overlayTName" style="margin-bottom:2px">Nome Torneo</div>
        <div style="font-size:0.75rem;color:var(--muted)" id="overlayTCode">Codice: ---</div>
      </div>
    </div>
    
    <div class="tabs" style="margin-bottom:12px">
      <div class="tab active" id="oTabBracket" onclick="showOverlayTab('bracket')">Tabellone</div>
      <div class="tab" id="oTabStandings" onclick="showOverlayTab('standings')">Classifica</div>
    </div>
    
    <div id="oBracketContent"></div>
    <div id="oStandingsContent" style="display:none"></div>
  </div>
</div>

<script>
const AVATAR_COLORS = [
  '#6C63FF', '#00d4ff', '#ff4444', '#ffd700', '#00ff88',
  '#ff5500', '#7c3aed', '#ff3366', '#00ccaa', '#ff8800',
];

let currentUser = null;
let ws = null;
let currentChallenge = null;
let selectedOpponentId = null;
let selectedOpponentName = "";
let currentSentChallengeId = null;
let selectedFinish = 'spin';
let activeOverlayTournamentCode = null;
let overlayBladers = [];
let currentLiveMatch = null;
let lmSelectedWinnerId = null;
let lmSelectedFinish = 'spin';

const STANDARD_BEYS = [
  { id: 'dran-sword', name: 'Dran Sword', fullName: 'Dran Sword 3-60F', type: 'attack', color: '#ff4444' },
  { id: 'shark-edge', name: 'Shark Edge', fullName: 'Shark Edge 3-60LF', type: 'attack', color: '#ff3366' },
  { id: 'dran-dagger', name: 'Dran Dagger', fullName: 'Dran Dagger 4-60R', type: 'attack', color: '#ff5544' },
  { id: 'phoenix-wing', name: 'Phoenix Wing', fullName: 'Phoenix Wing 9-60GF', type: 'attack', color: '#ff3300' },
  { id: 'tyranno-beat', name: 'Tyranno Beat', fullName: 'Tyranno Beat 4-70Q', type: 'attack', color: '#ff6622' },
  { id: 'dran-buster', name: 'Dran Buster', fullName: 'Dran Buster 1-60A', type: 'attack', color: '#cc1100' },
  { id: 'knight-shield', name: 'Knight Shield', fullName: 'Knight Shield 3-80N', type: 'defense', color: '#00d4ff' },
  { id: 'knight-lance', name: 'Knight Lance', fullName: 'Knight Lance 4-80HN', type: 'defense', color: '#0055cc' },
  { id: 'rhino-horn', name: 'Rhino Horn', fullName: 'Rhino Horn 3-80S', type: 'defense', color: '#1166ff' },
  { id: 'sphinx-cowl', name: 'Sphinx Cowl', fullName: 'Sphinx Cowl 9-80GN', type: 'defense', color: '#4488ff' },
  { id: 'black-shell', name: 'Black Shell', fullName: 'Black Shell 4-60D', type: 'defense', color: '#0033aa' },
  { id: 'leon-crest', name: 'Leon Crest', fullName: 'Leon Crest 7-60GN', type: 'defense', color: '#5577aa' },
  { id: 'wizard-arrow', name: 'Wizard Arrow', fullName: 'Wizard Arrow 4-80B', type: 'stamina', color: '#00ff88' },
  { id: 'viper-tail', name: 'Viper Tail', fullName: 'Viper Tail 5-80O', type: 'stamina', color: '#00ffaa' },
  { id: 'wyvern-gale', name: 'Wyvern Gale', fullName: 'Wyvern Gale 5-80GB', type: 'stamina', color: '#00cc88' },
  { id: 'wizard-rod', name: 'Wizard Rod', fullName: 'Wizard Rod 5-70DB', type: 'stamina', color: '#00ddbb' },
  { id: 'hells-scythe', name: 'Hells Scythe', fullName: 'Hells Scythe 4-60T', type: 'balance', color: '#ffd700' },
  { id: 'hells-chain', name: 'Hells Chain', fullName: 'Hells Chain 5-60HT', type: 'balance', color: '#ffcc00' },
  { id: 'leon-claw', name: 'Leon Claw', fullName: 'Leon Claw 5-60P', type: 'balance', color: '#ffaa00' },
  { id: 'unicorn-sting', name: 'Unicorn Sting', fullName: 'Unicorn Sting 5-60GP', type: 'balance', color: '#ddaa00' },
  { id: 'hells-hammer', name: 'Hells Hammer', fullName: 'Hells Hammer 3-70H', type: 'balance', color: '#ff9900' },
  { id: 'cobalt-dragoon', name: 'Cobalt Dragoon', fullName: 'Cobalt Dragoon 2-60C', type: 'balance', color: '#ffbb00' },
  { id: 'whale-wave', name: 'Whale Wave', fullName: 'Whale Wave 5-80E', type: 'balance', color: '#ee9900' }
];

const BLADES = [
  { id: 'b_dran_sword', name: 'Dran Sword', type: 'attack', weight: 34.5, attack_multiplier: 1.5, defense_multiplier: 0.8, stamina_multiplier: 0.7 },
  { id: 'b_hells_scythe', name: 'Hells Scythe', type: 'balance', weight: 33.2, attack_multiplier: 1.1, defense_multiplier: 1.1, stamina_multiplier: 1.1 },
  { id: 'b_wizard_arrow', name: 'Wizard Arrow', type: 'stamina', weight: 32.8, attack_multiplier: 0.7, defense_multiplier: 1.2, stamina_multiplier: 1.5 },
  { id: 'b_knight_shield', name: 'Knight Shield', type: 'defense', weight: 34.0, attack_multiplier: 0.8, defense_multiplier: 1.6, stamina_multiplier: 0.9 },
  { id: 'b_shark_edge', name: 'Shark Edge', type: 'attack', weight: 33.5, attack_multiplier: 1.6, defense_multiplier: 0.7, stamina_multiplier: 0.6 },
  { id: 'b_cobalt_dragoon', name: 'Cobalt Dragoon', type: 'attack', weight: 38.0, attack_multiplier: 1.8, defense_multiplier: 0.9, stamina_multiplier: 0.5 },
  { id: 'b_wizard_rod', name: 'Wizard Rod', type: 'stamina', weight: 35.0, attack_multiplier: 0.8, defense_multiplier: 1.3, stamina_multiplier: 1.8 },
  { id: 'b_knight_lance', name: 'Knight Lance', type: 'defense', weight: 34.2, attack_multiplier: 0.9, defense_multiplier: 1.5, stamina_multiplier: 1.0 },
  { id: 'b_viper_tail', name: 'Viper Tail', type: 'stamina', weight: 33.8, attack_multiplier: 0.9, defense_multiplier: 1.1, stamina_multiplier: 1.4 },
  { id: 'b_dran_dagger', name: 'Dran Dagger', type: 'attack', weight: 34.2, attack_multiplier: 1.4, defense_multiplier: 0.9, stamina_multiplier: 0.8 },
  { id: 'b_hells_chain', name: 'Hells Chain', type: 'balance', weight: 33.5, attack_multiplier: 1.2, defense_multiplier: 1.2, stamina_multiplier: 1.1 },
  { id: 'b_rhino_horn', name: 'Rhino Horn', type: 'defense', weight: 32.5, attack_multiplier: 0.8, defense_multiplier: 1.7, stamina_multiplier: 0.7 },
  { id: 'b_phoenix_wing', name: 'Phoenix Wing', type: 'attack', weight: 38.0, attack_multiplier: 1.7, defense_multiplier: 1.0, stamina_multiplier: 0.9 },
  { id: 'b_wyvern_gale', name: 'Wyvern Gale', type: 'stamina', weight: 32.5, attack_multiplier: 0.8, defense_multiplier: 1.1, stamina_multiplier: 1.5 },
  { id: 'b_unicorn_sting', name: 'Unicorn Sting', type: 'balance', weight: 34.5, attack_multiplier: 1.2, defense_multiplier: 1.3, stamina_multiplier: 1.1 },
  { id: 'b_sphinx_cowl', name: 'Sphinx Cowl', type: 'defense', weight: 33.2, attack_multiplier: 0.9, defense_multiplier: 1.5, stamina_multiplier: 1.0 },
  { id: 'b_hells_hammer', name: 'Hells Hammer', type: 'balance', weight: 34.5, attack_multiplier: 1.3, defense_multiplier: 1.1, stamina_multiplier: 1.0 },
  { id: 'b_dran_buster', name: 'Dran Buster', type: 'attack', weight: 35.0, attack_multiplier: 1.8, defense_multiplier: 0.7, stamina_multiplier: 0.6 },
  { id: 'b_leon_claw', name: 'Leon Claw', type: 'balance', weight: 31.8, attack_multiplier: 1.1, defense_multiplier: 1.1, stamina_multiplier: 1.2 },
  { id: 'b_black_shell', name: 'Black Shell', type: 'defense', weight: 34.5, attack_multiplier: 0.9, defense_multiplier: 1.6, stamina_multiplier: 0.9 },
  { id: 'b_whale_wave', name: 'Whale Wave', type: 'balance', weight: 35.0, attack_multiplier: 1.3, defense_multiplier: 1.2, stamina_multiplier: 1.1 },
  { id: 'b_leon_crest', name: 'Leon Crest', type: 'defense', weight: 37.5, attack_multiplier: 0.8, defense_multiplier: 1.8, stamina_multiplier: 0.9 },
  { id: 'b_tyranno_beat', name: 'Tyranno Beat', type: 'attack', weight: 37.2, attack_multiplier: 1.6, defense_multiplier: 0.9, stamina_multiplier: 0.8 }
];

const RATCHETS = [
  { id: 'r_3_60', name: '3-60', height: 60, sides: 3, weight: 6.5 },
  { id: 'r_4_60', name: '4-60', height: 60, sides: 4, weight: 6.8 },
  { id: 'r_5_60', name: '5-60', height: 60, sides: 5, weight: 7.0 },
  { id: 'r_9_60', name: '9-60', height: 60, sides: 9, weight: 7.2 },
  { id: 'r_3_80', name: '3-80', height: 80, sides: 3, weight: 6.6 },
  { id: 'r_4_80', name: '4-80', height: 80, sides: 4, weight: 6.9 },
  { id: 'r_5_80', name: '5-80', height: 80, sides: 5, weight: 7.1 },
  { id: 'r_9_80', name: '9-80', height: 80, sides: 9, weight: 7.3 },
  { id: 'r_1_60', name: '1-60', height: 60, sides: 1, weight: 6.4 },
  { id: 'r_2_60', name: '2-60', height: 60, sides: 2, weight: 6.6 },
  { id: 'r_3_70', name: '3-70', height: 70, sides: 3, weight: 6.5 },
  { id: 'r_4_70', name: '4-70', height: 70, sides: 4, weight: 6.8 },
  { id: 'r_5_70', name: '5-70', height: 70, sides: 5, weight: 7.0 },
  { id: 'r_7_60', name: '7-60', height: 60, sides: 7, weight: 7.0 }
];

const BITS = [
  { id: 'bt_f', name: 'Flat (F)', type: 'attack', weight: 2.1, burst_resistance: 8, speed_multiplier: 1.5 },
  { id: 'bt_lf', name: 'Low Flat (LF)', type: 'attack', weight: 2.2, burst_resistance: 8, speed_multiplier: 1.6 },
  { id: 'bt_t', name: 'Taper (T)', type: 'balance', weight: 2.0, burst_resistance: 6, speed_multiplier: 1.2 },
  { id: 'bt_b', name: 'Ball (B)', type: 'stamina', weight: 2.3, burst_resistance: 4, speed_multiplier: 0.8 },
  { id: 'bt_o', name: 'Orb (O)', type: 'stamina', weight: 2.4, burst_resistance: 4, speed_multiplier: 0.7 },
  { id: 'bt_n', name: 'Needle (N)', type: 'defense', weight: 2.1, burst_resistance: 5, speed_multiplier: 0.6 },
  { id: 'bt_hn', name: 'High Needle (HN)', type: 'defense', weight: 2.2, burst_resistance: 5, speed_multiplier: 0.5 },
  { id: 'bt_db', name: 'Disc Ball (DB)', type: 'stamina', weight: 3.5, burst_resistance: 7, speed_multiplier: 0.9 },
  { id: 'bt_c', name: 'Cyclone (C)', type: 'attack', weight: 2.5, burst_resistance: 9, speed_multiplier: 1.4 },
  { id: 'bt_r', name: 'Rush (R)', type: 'attack', weight: 2.1, burst_resistance: 8, speed_multiplier: 1.5 },
  { id: 'bt_gf', name: 'Gear Flat (GF)', type: 'attack', weight: 2.3, burst_resistance: 8, speed_multiplier: 1.8 },
  { id: 'bt_a', name: 'Accel (A)', type: 'attack', weight: 2.2, burst_resistance: 8, speed_multiplier: 1.6 },
  { id: 'bt_p', name: 'Point (P)', type: 'balance', weight: 2.2, burst_resistance: 6, speed_multiplier: 1.1 },
  { id: 'bt_gp', name: 'Gear Point (GP)', type: 'balance', weight: 2.3, burst_resistance: 6, speed_multiplier: 1.2 },
  { id: 'bt_h', name: 'Hexa (H)', type: 'balance', weight: 2.4, burst_resistance: 7, speed_multiplier: 1.0 },
  { id: 'bt_e', name: 'Elevate (E)', type: 'balance', weight: 2.4, burst_resistance: 6, speed_multiplier: 0.9 },
  { id: 'bt_gn', name: 'Gear Needle (GN)', type: 'defense', weight: 2.2, burst_resistance: 5, speed_multiplier: 0.7 },
  { id: 'bt_s', name: 'Spike (S)', type: 'defense', weight: 2.1, burst_resistance: 5, speed_multiplier: 0.6 },
  { id: 'bt_q', name: 'Quake (Q)', type: 'attack', weight: 2.2, burst_resistance: 8, speed_multiplier: 1.6 }
];

let customBeys = [];
let deckSelectActiveSlot = null;
let activeDeckSelectTab = 'standard';
let html5QrCode = null;
let qrScannerForSlot = true;

const QR_MAPPINGS = {
  'bx01': 'dran-sword',
  'bx02': 'hells-scythe',
  'bx03': 'wizard-arrow',
  'bx04': 'knight-shield',
  'bx13': 'knight-lance',
  'bx14': 'shark-edge',
  'bx16': 'viper-tail',
  'bx19': 'rhino-horn',
  'bx20': 'dran-dagger',
  'bx21': 'hells-chain',
  'bx23': 'phoenix-wing',
  'bx24': 'wyvern-gale',
  'bx26': 'unicorn-sting',
  'bx27': 'sphinx-cowl',
  'bx31': 'hells-hammer',
  'bx33': 'black-shell',
  'bx34': 'cobalt-dragoon',
  'ux01': 'dran-buster',
  'ux02': 'hells-hammer',
  'ux03': 'wizard-rod',
  'ux04': 'leon-claw',
  'ux05': 'whale-wave',
  'ux06': 'leon-crest',
  'ux09': 'tyranno-beat'
};

// Inizializzazione pagina
document.addEventListener('DOMContentLoaded', () => {
  // Genera Swatches
  const sw = document.getElementById('regSwatches');
  AVATAR_COLORS.forEach((color, idx) => {
    const el = document.createElement('div');
    el.className = `color-swatch ${idx===0?'selected':''}`;
    el.style.backgroundColor = color;
    el.onclick = () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      el.classList.add('selected');
    };
    sw.appendChild(el);
  });

  // Controlla localStorage
  const saved = localStorage.getItem('blader_auth');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      enterLobby();
    } catch(e) {
      showGate();
    }
  } else {
    showGate();
  }
});

function toggleAuth(showLogin) {
  document.getElementById('loginCard').style.display = showLogin ? 'block' : 'none';
  document.getElementById('registerCard').style.display = showLogin ? 'none' : 'block';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('regError').style.display = 'none';
}

async function showGate() {
  document.getElementById('authView').style.display = 'block';
  document.getElementById('mainLobbyView').style.display = 'none';
  // Carica i bladers per il select
  try {
    const res = await fetch('/api/bladers');
    const bladers = await res.json();
    const select = document.getElementById('loginSelect');
    select.innerHTML = '<option value="">-- Seleziona Blader --</option>' + bladers.map(b => 
      `<option value="${b.name}">${b.name}</option>`
    ).join('');
  } catch(e) {
    console.error(e);
  }
}

function enterLobby() {
  document.getElementById('authView').style.display = 'none';
  document.getElementById('mainLobbyView').style.display = 'block';
  updateProfileHeader();
  loadCustomBeys();
  connectWs();
  loadTournaments();
}

function updateProfileHeader() {
  document.getElementById('userName').textContent = currentUser.name;
  const avatar = document.getElementById('userAvatar');
  avatar.style.backgroundColor = currentUser.avatar_color;
  avatar.textContent = currentUser.avatar_initials;
  
  document.getElementById('userStats').textContent = 
    `${currentUser.wins} Vittorie · ${currentUser.losses} Sconfitte · ${currentUser.points_total} Punti`;
}

async function login() {
  const name = document.getElementById('loginSelect').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';

  if (!name) {
    errorEl.textContent = 'Seleziona un blader';
    errorEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password: password || "" })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Credenziali non valide');
    }

    currentUser = await res.json();
    localStorage.setItem('blader_auth', JSON.stringify(currentUser));
    showToast('Accesso effettuato con successo!');
    enterLobby();
  } catch(e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  }
}

async function register() {
  const name = document.getElementById('regName').value.trim();
  const password = document.getElementById('regPassword').value;
  const errorEl = document.getElementById('regError');
  errorEl.style.display = 'none';

  if (!name) {
    errorEl.textContent = 'Il nome non può essere vuoto';
    errorEl.style.display = 'block';
    return;
  }
  if (!password) {
    errorEl.textContent = 'Inserisci una password';
    errorEl.style.display = 'block';
    return;
  }

  const selectedSwatch = document.querySelector('.color-swatch.selected');
  const color = selectedSwatch ? selectedSwatch.style.backgroundColor : '#6C63FF';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, avatar_color: color })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Errore durante la registrazione');
    }

    currentUser = await res.json();
    localStorage.setItem('blader_auth', JSON.stringify(currentUser));
    showToast('Registrazione completata!');
    enterLobby();
  } catch(e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('blader_auth');
  currentUser = null;
  if (ws) ws.close();
  closeOverlay('settingsModal');
  showGate();
}

// Connessione WebSocket
function connectWs() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws/lobby`);
  
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "join_lobby",
      blader_id: currentUser.id
    }));
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "lobby_update") {
        renderOnlinePlayers(msg.online_players);
      } else if (msg.type === "challenge_received") {
        showChallengeReceived(msg.challenge);
      } else if (msg.type === "challenge_sent") {
        currentSentChallengeId = msg.challenge_id;
      } else if (msg.type === "challenge_cancelled") {
        if (currentChallenge && currentChallenge.id === msg.challenge_id) {
          closeOverlay('challengeReceivedModal');
          currentChallenge = null;
          showToast('La sfida è stata annullata dallo sfidante.', 'error');
        }
      } else if (msg.type === "challenge_error") {
        closeOverlay('challengeWaitingModal');
        showToast(msg.message, 'error');
      } else if (msg.type === "challenge_result") {
        handleChallengeResult(msg);
      } else if (msg.type === "match_start") {
        currentLiveMatch = msg.match;
        if (window.location.pathname !== `/vs/${currentLiveMatch.id}`) {
          window.history.pushState(null, '', `/vs/${currentLiveMatch.id}`);
        }
        closeOverlay('challengeWaitingModal');
        closeOverlay('challengeReceivedModal');
        document.getElementById('mainLobbyView').style.display = 'none';
        document.getElementById('liveMatchView').style.display = 'block';
        document.getElementById('lmChallengerName').textContent = currentLiveMatch.challenger_name;
        document.getElementById('lmOpponentName').textContent = currentLiveMatch.opponent_name;
        lmSelectedWinnerId = null;
        document.getElementById('lmWinBtn1').classList.remove('selected');
        document.getElementById('lmWinBtn1').style.borderColor = '';
        document.getElementById('lmWinBtn1').style.background = '';
        document.getElementById('lmWinBtn2').classList.remove('selected');
        document.getElementById('lmWinBtn2').style.borderColor = '';
        document.getElementById('lmWinBtn2').style.background = '';
        selectLmFinish('spin');
        renderLiveMatchScore();
      } else if (msg.type === "match_update") {
        if (currentLiveMatch && msg.match && msg.match.id === currentLiveMatch.id) {
          currentLiveMatch = msg.match;
          renderLiveMatchScore();
        }
        if (activeOverlayTournamentCode) {
          loadOverlayTournament(activeOverlayTournamentCode);
        }
      } else if (msg.type === "match_complete") {
        if (currentLiveMatch && msg.match && msg.match.id === currentLiveMatch.id) {
          currentLiveMatch = msg.match;
          renderLiveMatchScore();
          const amIChallenger = currentUser.id === currentLiveMatch.challenger_id;
          const challengerWon = currentLiveMatch.format === '1on1' 
            ? currentLiveMatch.challenger_points >= currentLiveMatch.point_threshold
            : currentLiveMatch.challenger_wins >= 2;
          const didIWin = (amIChallenger && challengerWon) || (!amIChallenger && !challengerWon);
          if (didIWin) {
            showToast('🏆 Complimenti! Hai vinto il match!', 'success');
          } else {
            showToast('Hai perso il match. Ritenta!', 'error');
          }
          setTimeout(() => {
            document.getElementById('liveMatchView').style.display = 'none';
            document.getElementById('mainLobbyView').style.display = 'block';
            currentLiveMatch = null;
            if (window.location.pathname !== '/lobby') {
              window.history.pushState(null, '', '/lobby');
            }
          }, 5000);
        }
      } else if (msg.type === "match_cancelled") {
        if (currentLiveMatch && msg.match_id === currentLiveMatch.id) {
          showToast('Il match è stato annullato.', 'error');
          document.getElementById('liveMatchView').style.display = 'none';
          document.getElementById('mainLobbyView').style.display = 'block';
          currentLiveMatch = null;
          if (window.location.pathname !== '/lobby') {
            window.history.pushState(null, '', '/lobby');
          }
        }
      } else if (msg.type === "bracket_update") {
        if (activeOverlayTournamentCode) {
          loadOverlayTournament(activeOverlayTournamentCode);
        }
      } else if (msg.type === "standings_update") {
        const updated = msg.bladers.find(b => b.id === currentUser.id);
        if (updated) {
          currentUser = updated;
          localStorage.setItem('blader_auth', JSON.stringify(currentUser));
          updateProfileHeader();
          if (document.getElementById('profileTab').classList.contains('active')) {
            loadProfileTab();
          }
        }
        if (activeOverlayTournamentCode) {
          loadOverlayTournament(activeOverlayTournamentCode);
        }
      }
    } catch(err) {
      console.error("Ws error:", err);
    }
  };

  ws.onclose = () => {
    // Riconnessione dopo 3 secondi
    setTimeout(connectWs, 3000);
  };
}

// Rendering Players Online
function renderOnlinePlayers(players) {
  const container = document.getElementById('onlinePlayersContent');
  // Filtra l'utente corrente
  const others = players.filter(p => p.blader_id !== currentUser.id);
  
  if (others.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px 0">Nessun altro blader online al momento.</p>';
    return;
  }

  container.innerHTML = others.map(p => {
    const initials = p.avatar_initials || p.name.substring(0,2).toUpperCase();
    const beysHtml = (p.beys || []).map(b => {
      const name = getBeyNameById(b);
      if (name === 'Slot vuoto') return '';
      return `<span class="bey-badge">${name}</span>`;
    }).filter(Boolean).join('');
    
    return `<div class="player-item">
      <div class="avatar avatar-sm" style="background-color:${p.avatar_color}">${initials}</div>
      <div class="player-name-wrapper">
        <div class="player-name">${p.name}</div>
        <div class="player-beys">${beysHtml || '<span style="color:var(--muted);font-size:0.6rem">Nessun Deck assegnato</span>'}</div>
      </div>
      <button class="btn challenge-btn" onclick="openChallengeModal('${p.blader_id}', '${p.name}')">SFIDA</button>
    </div>`;
  }).join('');
}

// Caricamento Tornei
async function loadTournaments() {
  const container = document.getElementById('tournamentsContent');
  try {
    const res = await fetch('/api/tournaments');
    const tournaments = await res.json();
    
    // Mostra solo tornei in cui il blader fa parte
    const myTournaments = tournaments.filter(t => t.blader_ids.includes(currentUser.id));
    
    if (myTournaments.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px 0">Non fai parte di nessun torneo attivo.</p>';
      return;
    }

    container.innerHTML = myTournaments.map(t => {
      const statusLabels = {
        'lobby': 'In Attesa',
        'active': 'In Corso',
        'completed': 'Finito'
      };
      return `<div class="tournament-item">
        <div class="t-info">
          <div class="t-title">${t.name}</div>
          <div class="t-meta">Arena: ${t.arena.toUpperCase()} · Formato: ${t.format.toUpperCase()}</div>
          <div style="margin-top:6px">
            <span class="t-status ${t.status}">${statusLabels[t.status] || t.status}</span>
          </div>
        </div>
        <button class="btn" style="width:auto;padding:8px 16px" onclick="window.location.href = '/join/' + '${t.join_code}'">VEDI</button>
      </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = '<p style="color:var(--danger);text-align:center">Impossibile caricare i tornei</p>';
  }
}

// Gestione Tabs
function showTab(tabId) {
  const lobbyTabs = document.querySelectorAll('#mainLobbyView > .tabs > .tab');
  lobbyTabs.forEach((t, i) => t.classList.toggle('active', ['players','tournaments','beys','profile','history'][i]===tabId));
  
  const lobbyContents = document.querySelectorAll('#mainLobbyView > .tab-content');
  lobbyContents.forEach(c => c.classList.remove('active'));
  
  document.getElementById(tabId+'Tab').classList.add('active');
  if (tabId === 'tournaments') {
    loadTournaments();
  } else if (tabId === 'profile') {
    loadProfileTab();
  } else if (tabId === 'history') {
    loadHistoryTab();
  }
}

async function loadHistoryTab() {
  const container = document.getElementById('historyContent');
  container.innerHTML = '<div style="display:flex;justify-content:center;padding:24px 0"><div class="spinner"></div></div>';
  try {
    const res = await fetch('/api/activities');
    const activities = await res.json();
    if (!activities || activities.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--muted);font-size:0.8rem;padding:24px 0">Nessuna attività registrata.</p>';
      return;
    }
    
    container.innerHTML = activities.map(act => {
      const date = new Date(act.created_at).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
      let icon = '📝';
      let accentColor = 'var(--muted)';
      
      switch(act.event_type) {
        case 'versus':
          icon = '⚔️';
          accentColor = 'var(--primary)';
          break;
        case 'tournament':
          icon = '🏆';
          accentColor = 'var(--accent)';
          break;
        case 'blader':
          icon = '👤';
          accentColor = 'var(--success)';
          break;
        case 'arena':
          icon = '🏟️';
          accentColor = 'var(--secondary)';
          break;
        case 'beyblade':
          icon = '🌀';
          accentColor = 'var(--primary)';
          break;
      }
      
      return `
        <div style="background:var(--surface-2);border-radius:12px;padding:12px 16px;display:flex;align-items:flex-start;gap:12px;border-left:4px solid ${accentColor};border-top:1px solid rgba(255,255,255,0.02);border-right:1px solid rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.02)">
          <span style="font-size:1.3rem;line-height:1;margin-top:2px">${icon}</span>
          <div style="flex:1">
            <p style="font-size:0.85rem;color:var(--text);margin:0;line-height:1.4">${act.message_it}</p>
            <span style="font-size:0.68rem;color:var(--muted);display:block;margin-top:4px">${date}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch(e) {
    container.innerHTML = '<p style="color:var(--danger);text-align:center">Impossibile caricare la cronologia</p>';
  }
}

// Modals Overlay
function openOverlay(id) {
  document.getElementById(id).style.display = 'flex';
}
function closeOverlay(id) {
  document.getElementById(id).style.display = 'none';
}

// Impostazioni
function openSettings() {
  document.getElementById('oldPasswordInput').value = '';
  document.getElementById('newPasswordInput').value = '';
  document.getElementById('changePasswordError').style.display = 'none';
  openOverlay('settingsModal');
}

async function submitChangePassword() {
  const oldPassword = document.getElementById('oldPasswordInput').value;
  const newPassword = document.getElementById('newPasswordInput').value;
  const errEl = document.getElementById('changePasswordError');
  errEl.style.display = 'none';

  if (!newPassword) {
    errEl.textContent = 'Inserisci la nuova password';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blader_id: currentUser.id,
        old_password: oldPassword || null,
        new_password: newPassword
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Errore aggiornamento password');
    }

    showToast('Password aggiornata correttamente!');
    closeOverlay('settingsModal');
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

// Sfida Verso Blader
function openChallengeModal(opponentId, name) {
  selectedOpponentId = opponentId;
  selectedOpponentName = name;
  document.getElementById('challengeTitle').textContent = `Sfida contro ${name}`;
  
  document.getElementById('challengeFormat').value = '1on1';
  document.getElementById('challengeThreshold').value = '4';
  adjustPointsThreshold();
  
  openOverlay('challengeModal');
}

function adjustPointsThreshold() {
  const format = document.getElementById('challengeFormat').value;
  const thresholdGroup = document.getElementById('pointThresholdGroup');
  if (format === '1on1') {
    thresholdGroup.style.display = 'block';
  } else {
    thresholdGroup.style.display = 'none';
  }
}

function sendChallengeSubmit() {
  const format = document.getElementById('challengeFormat').value;
  const threshold = parseInt(document.getElementById('challengeThreshold').value) || 4;

  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      document.getElementById('challengeWaitingDesc').textContent = `In attesa che ${selectedOpponentName} accetti la sfida...`;
      closeOverlay('challengeModal');
      openOverlay('challengeWaitingModal');

      ws.send(JSON.stringify({
        type: "challenge_send",
        from_id: currentUser.id,
        to_id: selectedOpponentId,
        format: format,
        point_threshold: threshold
      }));
    } catch (err) {
      console.error("Error sending challenge:", err);
      closeOverlay('challengeWaitingModal');
      openOverlay('challengeModal');
      showToast("Errore durante l'invio della sfida.", "error");
    }
  } else {
    showToast('Connessione persa, riprova.', 'error');
  }
}

// Ricezione Sfida
function showChallengeReceived(ch) {
  currentChallenge = ch;
  
  const formatLabel = ch.format === '1on1' ? '1on1' : 
                      ch.format === '3on3' ? '3on3 (Best of 3)' : 'Deck (Best of 3)';
                      
  const thresholdLabel = ch.format === '1on1' ? ` a <strong>${ch.point_threshold} punti</strong>` : '';

  document.getElementById('incomingChallengeDesc').innerHTML = 
    `<strong>${ch.from_name}</strong> ti ha lanciato una sfida live in modalità <strong>${formatLabel}</strong>${thresholdLabel}.<br><br>Vuoi accettare?`;
  
  openOverlay('challengeReceivedModal');
}

function acceptChallenge() {
  if (ws && ws.readyState === WebSocket.OPEN && currentChallenge) {
    ws.send(JSON.stringify({
      type: "challenge_accept",
      challenge_id: currentChallenge.id
    }));
    closeOverlay('challengeReceivedModal');
    currentChallenge = null;
  }
}

function declineChallenge() {
  if (ws && ws.readyState === WebSocket.OPEN && currentChallenge) {
    ws.send(JSON.stringify({
      type: "challenge_decline",
      challenge_id: currentChallenge.id
    }));
    closeOverlay('challengeReceivedModal');
    currentChallenge = null;
  }
}

function cancelWaitingChallenge() {
  if (ws && ws.readyState === WebSocket.OPEN && currentSentChallengeId) {
    ws.send(JSON.stringify({
      type: "challenge_cancel",
      challenge_id: currentSentChallengeId
    }));
  }
  closeOverlay('challengeWaitingModal');
  currentSentChallengeId = null;
}

function handleChallengeResult(msg) {
  closeOverlay('challengeWaitingModal');
  if (msg.status === 'declined') {
    showToast('La sfida è stata rifiutata dal destinatario.', 'error');
  }
}

// Live Versus Match Helper Functions
function renderLiveMatchScore() {
  if (!currentLiveMatch) return;
  
  // Scores
  document.getElementById('lmChallengerScore').textContent = currentLiveMatch.challenger_points;
  document.getElementById('lmOpponentScore').textContent = currentLiveMatch.opponent_points;
  
  // Wins / Metadatas
  document.getElementById('lmChallengerMeta').textContent = `${currentLiveMatch.challenger_wins} Vittorie`;
  document.getElementById('lmOpponentMeta').textContent = `${currentLiveMatch.opponent_wins} Vittorie`;
  
  // Format text
  const fmt = currentLiveMatch.format === '1on1' 
    ? `1on1 · Soglia: ${currentLiveMatch.point_threshold} pt`
    : `${currentLiveMatch.format.toUpperCase()} · Best of 3`;
  document.getElementById('lmMatchFormat').textContent = fmt;
  
  // Toggle Referee vs Spectator Panels
  const isReferee = currentUser.id === currentLiveMatch.challenger_id;
  if (isReferee) {
    document.getElementById('lmRefereePanel').style.display = 'block';
    document.getElementById('lmSpectatorPanel').style.display = 'none';
    
    // Update names on Referee winner buttons
    document.getElementById('lmWinBtn1').textContent = currentLiveMatch.challenger_name;
    document.getElementById('lmWinBtn2').textContent = currentLiveMatch.opponent_name;
  } else {
    document.getElementById('lmRefereePanel').style.display = 'none';
    document.getElementById('lmSpectatorPanel').style.display = 'block';
  }
  
  // Render Round History
  const historyContainer = document.getElementById('lmRoundHistoryContent');
  if (currentLiveMatch.rounds.length === 0) {
    historyContainer.innerHTML = '<p style="text-align:center;color:var(--muted);font-size:0.8rem;padding:12px 0">Nessun round giocato.</p>';
  } else {
    const finishLabels = {
      'spin': 'Spin Finish',
      'over': 'Over Finish',
      'burst': 'Burst Finish',
      'xtreme': 'Xtreme Finish',
      'draw': 'Pareggio',
      'foul': 'Fallo'
    };
    const finishColors = {
      'spin': 'var(--primary)',
      'over': 'var(--secondary)',
      'burst': 'var(--danger)',
      'xtreme': 'var(--accent)',
      'draw': '#888888',
      'foul': '#ffaa00'
    };
    
    historyContainer.innerHTML = currentLiveMatch.rounds.map((r, i) => {
      let desc = '';
      let pointsText = '';
      let color = 'var(--primary)';

      if (r.round_type === 'draw') {
        desc = 'Pareggio';
        color = finishColors['draw'];
        pointsText = '+0 pt';
      } else if (r.round_type === 'foul') {
        const foulBlader = r.foul_blader_id === currentLiveMatch.challenger_id
          ? currentLiveMatch.challenger_name
          : currentLiveMatch.opponent_name;
        desc = `Fallo a ${foulBlader}`;
        color = finishColors['foul'];
        const pts = r.foul_blader_id === currentLiveMatch.challenger_id ? r.b2_points : r.b1_points;
        pointsText = pts > 0 ? `+1 pt all'avversario` : '+0 pt';
      } else {
        const winnerName = r.winner_id === currentLiveMatch.challenger_id
          ? currentLiveMatch.challenger_name
          : currentLiveMatch.opponent_name;
        desc = `${winnerName} (${finishLabels[r.finish_type] || r.finish_type})`;
        color = finishColors[r.finish_type] || 'var(--primary)';
        const pts = r.winner_id === currentLiveMatch.challenger_id ? r.b1_points : r.b2_points;
        pointsText = `+${pts} pt`;
      }
        
      return `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-3);padding:8px 12px;border-radius:8px;font-size:0.8rem">
        <span style="color:var(--muted);font-family:'Orbitron'">Round ${i+1}</span>
        <span style="font-weight:700;color:var(--text);flex:1;margin-left:10px">${desc}</span>
        <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:${color}22;color:${color}">
          ${pointsText}
        </span>
      </div>`;
    }).join('');
  }
}

let lmSelectedOutcome = 'finish';
let lmSelectedFoulBladerId = null;

function selectRoundOutcome(outcome) {
  if (!currentLiveMatch) return;
  
  const p1 = document.getElementById('lmWinBtn1');
  const p2 = document.getElementById('lmWinBtn2');
  const drawBtn = document.getElementById('lmWinDraw');
  const foul1Btn = document.getElementById('lmWinFoul1');
  const foul2Btn = document.getElementById('lmWinFoul2');
  const finishGroup = document.getElementById('lmFinishGroup');
  
  const buttons = [p1, p2, drawBtn, foul1Btn, foul2Btn];
  buttons.forEach(btn => {
    if (btn) {
      btn.classList.remove('selected');
      btn.style.borderColor = '';
      btn.style.background = '';
    }
  });
  
  lmSelectedWinnerId = null;
  lmSelectedFoulBladerId = null;
  lmSelectedOutcome = 'finish';
  
  if (outcome === 'winner1') {
    p1.classList.add('selected');
    p1.style.borderColor = 'var(--primary)';
    p1.style.background = 'rgba(0,212,255,0.1)';
    lmSelectedWinnerId = currentLiveMatch.challenger_id;
    if (finishGroup) finishGroup.style.display = 'block';
  } else if (outcome === 'winner2') {
    p2.classList.add('selected');
    p2.style.borderColor = 'var(--danger)';
    p2.style.background = 'rgba(255,68,68,0.1)';
    lmSelectedWinnerId = currentLiveMatch.opponent_id;
    if (finishGroup) finishGroup.style.display = 'block';
  } else if (outcome === 'draw') {
    drawBtn.classList.add('selected');
    drawBtn.style.borderColor = '#888888';
    drawBtn.style.background = 'rgba(136,136,136,0.1)';
    lmSelectedOutcome = 'draw';
    if (finishGroup) finishGroup.style.display = 'none';
  } else if (outcome === 'foul1') {
    foul1Btn.classList.add('selected');
    foul1Btn.style.borderColor = '#ffaa00';
    foul1Btn.style.background = 'rgba(255,170,0,0.1)';
    lmSelectedOutcome = 'foul';
    lmSelectedFoulBladerId = currentLiveMatch.challenger_id;
    if (finishGroup) finishGroup.style.display = 'none';
  } else if (outcome === 'foul2') {
    foul2Btn.classList.add('selected');
    foul2Btn.style.borderColor = '#ffaa00';
    foul2Btn.style.background = 'rgba(255,170,0,0.1)';
    lmSelectedOutcome = 'foul';
    lmSelectedFoulBladerId = currentLiveMatch.opponent_id;
    if (finishGroup) finishGroup.style.display = 'none';
  }
}

function selectLmFinish(type) {
  const finishes = ['spin', 'over', 'burst', 'xtreme'];
  finishes.forEach(f => {
    document.getElementById('lmFinish' + f.charAt(0).toUpperCase() + f.slice(1)).classList.remove('selected');
  });
  
  document.getElementById('lmFinish' + type.charAt(0).toUpperCase() + type.slice(1)).classList.add('selected');
  lmSelectedFinish = type;
}

function submitRound() {
  if (!currentLiveMatch) return;
  if (lmSelectedOutcome === 'finish' && !lmSelectedWinnerId) {
    showToast('Seleziona il vincitore del round!', 'error');
    return;
  }
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "match_round_submit",
      match_id: currentLiveMatch.id,
      winner_id: lmSelectedWinnerId,
      finish_type: lmSelectedOutcome === 'finish' ? lmSelectedFinish : null,
      round_type: lmSelectedOutcome,
      foul_blader_id: lmSelectedFoulBladerId
    }));
    
    // Reset selection in UI
    selectRoundOutcome(null);
  } else {
    showToast('Connessione persa, riprova.', 'error');
  }
}

function cancelLiveMatch() {
  if (!currentLiveMatch) return;
  if (confirm('Vuoi davvero ritirarti o annullare il match live?')) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "match_cancel",
        match_id: currentLiveMatch.id
      }));
    }
  }
}

// TOAST NOTIFICATIONS
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// TORNEI DETTAGLIO OVERLAY
async function openOverlayTournament(code) {
  activeOverlayTournamentCode = code;
  openOverlay('tournamentOverlay');
  document.getElementById('overlayTCode').textContent = 'Codice: ' + code;
  
  showOverlayTab('bracket');
  loadOverlayTournament(code);
}

async function loadOverlayTournament(code) {
  try {
    const res = await fetch('/api/tournament/' + code);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    document.getElementById('overlayTName').textContent = data.name;
    
    overlayBladers = data.bladers || [];
    renderOverlayStandings();
    
    // Carica Bracket
    const resMatches = await fetch('/api/tournament/' + code + '/matches');
    const matches = await resMatches.json();
    
    renderOverlayBracket(matches);
  } catch(e) {
    console.error(e);
  }
}

function renderOverlayBracket(matches) {
  const bladerMap = {};
  overlayBladers.forEach(b => bladerMap[b.id] = b);
  
  const rounds = {};
  matches.forEach(m => {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });
  
  let html = '';
  Object.keys(rounds).sort().forEach(r => {
    const label = r === '1' ? 'Round 1' : r === '2' ? 'Semifinali' : r === '3' ? 'Finale' : 'Round ' + r;
    html += `<div class="round-label">${label}</div>`;
    rounds[r].forEach(m => {
      if (m.blader2_id && m.blader2_id.startsWith('BYE_')) return;
      const b1 = bladerMap[m.blader1_id] || {name: m.blader1_id.substring(0,8)};
      const b2 = bladerMap[m.blader2_id] || {name: m.blader2_id.substring(0,8)};
      const w = m.winner_id;
      const finishHtml = m.finish_type ? `<span class="finish-badge finish-${m.finish_type}">${m.finish_type}</span>` : '';
      html += `<div class="match-card">
        <div class="match-vs">
          <span class="blader-name ${w===m.blader1_id?'winner':''}">${b1.name}</span>
          <span class="score"><span>${m.blader1_points}</span></span>
          <span class="vs-badge">VS</span>
          <span class="score"><span>${m.blader2_points}</span></span>
          <span class="blader-name ${w===m.blader2_id?'winner':''}" style="text-align:right">${b2.name}</span>
        </div>
        ${finishHtml ? '<div style="text-align:center;margin-top:8px">'+finishHtml+'</div>' : ''}
      </div>`;
    });
  });
  document.getElementById('oBracketContent').innerHTML = html || '<p style="text-align:center;color:var(--muted)">Nessun match pronto.</p>';
}

function renderOverlayStandings() {
  const sorted = [...overlayBladers].sort((a,b) => b.wins-a.wins || b.points_total-a.points_total);
  const ranks = ['gold','silver','bronze'];
  const html = '<ul class="standings" style="margin-top:12px">' + sorted.map((b,i) => `
    <li class="standing-item">
      <span class="standing-rank ${ranks[i]||''}">${i+1}</span>
      <span class="standing-name">${b.name}</span>
      <span class="standing-stats">${b.wins}W · ${b.losses}L · ${b.points_total}pt</span>
    </li>`).join('') + '</ul>';
  document.getElementById('oStandingsContent').innerHTML = html;
}

// Gestione Tabs
function showOverlayTab(tab) {
  document.getElementById('oTabBracket').classList.toggle('active', tab === 'bracket');
  document.getElementById('oTabStandings').classList.toggle('active', tab === 'standings');
  document.getElementById('oBracketContent').style.display = tab === 'bracket' ? 'block' : 'none';
  document.getElementById('oStandingsContent').style.display = tab === 'standings' ? 'block' : 'none';
}

// Intercettazione chiusura overlay tornei per svuotare il codice attivo
const originalCloseOverlay = closeOverlay;
closeOverlay = function(id) {
  if (id === 'tournamentOverlay') {
    activeOverlayTournamentCode = null;
  }
  originalCloseOverlay(id);
}

// PROFILE TAB & DECK MANAGER LOGIC

function getBeyNameById(id) {
  if (!id) return 'Slot vuoto';
  const std = STANDARD_BEYS.find(b => b.id === id || b.name === id);
  if (std) return std.name;
  const cust = customBeys.find(b => b.id === id || b.name === id);
  if (cust) return cust.name;
  return id;
}

function updateDeckSlotUI() {
  const deck = currentUser.beys || [];
  document.getElementById('deckSlot0Name').textContent = getBeyNameById(deck[0]);
  document.getElementById('deckSlot1Name').textContent = getBeyNameById(deck[1]);
  document.getElementById('deckSlot2Name').textContent = getBeyNameById(deck[2]);
}

function openDeckSelect(slotIndex) {
  deckSelectActiveSlot = slotIndex;
  document.getElementById('deckSelectModalTitle').textContent = `Seleziona Beyblade (Slot ${slotIndex + 1})`;
  toggleDeckSelectTab('standard');
  renderDeckSelectList();
  openOverlay('deckSelectModal');
}

function toggleDeckSelectTab(tab) {
  activeDeckSelectTab = tab;
  document.getElementById('deckSelTabStandard').classList.toggle('active', tab === 'standard');
  document.getElementById('deckSelTabCustom').classList.toggle('active', tab === 'custom');
  
  document.getElementById('deckSelectStandardList').style.display = tab === 'standard' ? 'flex' : 'none';
  document.getElementById('deckSelectCustomList').style.display = tab === 'custom' ? 'flex' : 'none';
}

function renderDeckSelectList() {
  // Render Standard
  const stdContainer = document.getElementById('deckSelectStandardList');
  stdContainer.innerHTML = STANDARD_BEYS.map(b => `
    <div class="player-item" onclick="selectBeyForSlot('${b.id}')" style="cursor:pointer;justify-content:space-between">
      <div>
        <div class="player-name">${b.name}</div>
        <div style="font-size:0.75rem;color:var(--muted)">${b.fullName}</div>
      </div>
      <span class="bey-badge" style="border-color:${b.color};color:${b.color};background:rgba(0,0,0,0.2)">${b.type.toUpperCase()}</span>
    </div>
  `).join('');

  // Render Custom (only belonging to the currentUser)
  const custContainer = document.getElementById('deckSelectCustomList');
  const myBeys = customBeys.filter(b => b.blader_id === currentUser.id);
  if (myBeys.length === 0) {
    custContainer.innerHTML = '<p style="text-align:center;color:var(--muted);font-size:0.85rem;padding:16px 0">Nessun Bey custom creato</p>';
  } else {
    custContainer.innerHTML = myBeys.map(b => `
      <div class="player-item" onclick="selectBeyForSlot('${b.id}')" style="cursor:pointer;justify-content:space-between">
        <div>
          <div class="player-name">${b.name}</div>
          <div style="font-size:0.75rem;color:var(--muted)">${b.blade} ${b.ratchet}${b.bit}</div>
        </div>
        <span class="bey-badge" style="border-color:${b.color || '#ffd700'};color:${b.color || '#ffd700'};background:rgba(0,0,0,0.2)">${b.type_class.toUpperCase()}</span>
      </div>
    `).join('');
  }
}

async function selectBeyForSlot(beyId) {
  if (deckSelectActiveSlot === null) return;
  let deck = [...(currentUser.beys || [])];
  while (deck.length < 3) {
    deck.push('');
  }
  deck[deckSelectActiveSlot] = beyId;
  await saveDeck(deck);
  closeOverlay('deckSelectModal');
}

async function removeBeyFromSlot() {
  if (deckSelectActiveSlot === null) return;
  let deck = [...(currentUser.beys || [])];
  while (deck.length < 3) {
    deck.push('');
  }
  deck[deckSelectActiveSlot] = '';
  await saveDeck(deck);
  closeOverlay('deckSelectModal');
}

async function saveDeck(deck) {
  try {
    const res = await fetch('/api/blader/deck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blader_id: currentUser.id, beys: deck })
    });
    if (!res.ok) throw new Error('Errore nel salvataggio del deck');
    
    currentUser.beys = deck;
    localStorage.setItem('blader_auth', JSON.stringify(currentUser));
    updateProfileHeader();
    updateDeckSlotUI();
    showToast('Deck aggiornato con successo!');
  } catch(e) {
    showToast(e.message, 'error');
  }
}

// CUSTOM BEY CONSTRUCTOR LOGIC

function calculateStats(bladeId, ratchetId, bitId) {
  const blade = BLADES.find(b => b.id === bladeId);
  const ratchet = RATCHETS.find(r => r.id === ratchetId);
  const bit = BITS.find(b => b.id === bitId);

  if (!blade || !ratchet || !bit) return null;

  const totalWeight = blade.weight + ratchet.weight + bit.weight;
  
  let attack = (totalWeight * blade.attack_multiplier * bit.speed_multiplier) * 1.2;
  let defense = (totalWeight * blade.defense_multiplier) + (bit.burst_resistance * 2) + (100 - ratchet.height * 0.5);
  let stamina = (totalWeight * blade.stamina_multiplier) + (10 - bit.speed_multiplier * 5) * 5;
  let speed = (bit.speed_multiplier * 40) + (blade.attack_multiplier * 10);

  attack = Math.min(100, Math.max(10, Math.round(attack)));
  defense = Math.min(100, Math.max(10, Math.round(defense)));
  stamina = Math.min(100, Math.max(10, Math.round(stamina)));
  speed = Math.min(100, Math.max(10, Math.round(speed)));

  let typeClass = blade.type;
  if (bit.type === 'attack' && blade.type === 'balance') typeClass = 'attack';
  if (bit.type === 'stamina' && blade.type === 'balance') typeClass = 'stamina';

  return {
    weight: Math.round(totalWeight * 10) / 10,
    attack,
    defense,
    stamina,
    speed,
    typeClass,
  };
}

function openCreateBey() {
  document.getElementById('cbName').value = '';
  document.getElementById('cbColor').value = '#00d4ff';
  document.getElementById('cbError').style.display = 'none';
  
  // Populate parts select dropdowns
  const bladeSel = document.getElementById('cbBlade');
  bladeSel.innerHTML = BLADES.map(b => `<option value="${b.id}">${b.name} (${b.type})</option>`).join('');
  
  const ratchetSel = document.getElementById('cbRatchet');
  ratchetSel.innerHTML = RATCHETS.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  
  const bitSel = document.getElementById('cbBit');
  bitSel.innerHTML = BITS.map(bt => `<option value="${bt.id}">${bt.name} (${bt.type})</option>`).join('');
  
  updateCbStatsPreview();
  openOverlay('createBeyModal');
}

function updateCbStatsPreview() {
  const bladeId = document.getElementById('cbBlade').value;
  const ratchetId = document.getElementById('cbRatchet').value;
  const bitId = document.getElementById('cbBit').value;
  
  const stats = calculateStats(bladeId, ratchetId, bitId);
  if (!stats) return;
  
  document.getElementById('cbPreviewType').textContent = stats.typeClass;
  document.getElementById('cbValWeight').textContent = stats.weight + 'g';
  document.getElementById('cbBarWeight').style.width = (stats.weight / 50 * 100) + '%';
  
  document.getElementById('cbValAttack').textContent = stats.attack;
  document.getElementById('cbBarAttack').style.width = stats.attack + '%';
  
  document.getElementById('cbValDefense').textContent = stats.defense;
  document.getElementById('cbBarDefense').style.width = stats.defense + '%';
  
  document.getElementById('cbValStamina').textContent = stats.stamina;
  document.getElementById('cbBarStamina').style.width = stats.stamina + '%';
  
  document.getElementById('cbValSpeed').textContent = stats.speed;
  document.getElementById('cbBarSpeed').style.width = stats.speed + '%';
}

async function saveCustomBey() {
  const name = document.getElementById('cbName').value.trim();
  const bladeId = document.getElementById('cbBlade').value;
  const ratchetId = document.getElementById('cbRatchet').value;
  const bitId = document.getElementById('cbBit').value;
  const color = document.getElementById('cbColor').value;
  const errEl = document.getElementById('cbError');
  errEl.style.display = 'none';

  if (!name) {
    errEl.textContent = 'Inserisci un nome per il Beyblade';
    errEl.style.display = 'block';
    return;
  }

  const stats = calculateStats(bladeId, ratchetId, bitId);
  if (!stats) return;

  const bladeName = BLADES.find(b => b.id === bladeId).name;
  const ratchetName = RATCHETS.find(r => r.id === ratchetId).name;
  const bitName = BITS.find(b => b.id === bitId).name;

  try {
    const res = await fetch('/api/custom-beys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blader_id: currentUser.id,
        name,
        blade: bladeName,
        ratchet: ratchetName,
        bit: bitName,
        type_class: stats.typeClass,
        color,
        stats: JSON.stringify(stats)
      })
    });

    if (!res.ok) throw new Error('Errore durante il salvataggio');
    showToast('Beyblade custom creato!');
    closeOverlay('createBeyModal');
    
    await loadCustomBeys();
    renderCustomBeysList();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function deleteCustomBey(id) {
  if (!confirm('Sei sicuro di voler eliminare questo Beyblade custom?')) return;
  try {
    const res = await fetch(`/api/custom-beys/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Errore durante l\'eliminazione');
    showToast('Beyblade custom eliminato.');
    
    // Remove from deck if it was assigned
    let deck = [...(currentUser.beys || [])];
    let deckChanged = false;
    for (let i = 0; i < deck.length; i++) {
      if (deck[i] === id) {
        deck[i] = '';
        deckChanged = true;
      }
    }
    if (deckChanged) {
      await saveDeck(deck);
    }
    
    await loadCustomBeys();
    renderCustomBeysList();
  } catch(e) {
    showToast(e.message, 'error');
  }
}

async function loadCustomBeys() {
  try {
    const res = await fetch(`/api/custom-beys`);
    if (!res.ok) throw new Error('Impossibile caricare i beys custom');
    customBeys = await res.json();
  } catch(e) {
    console.error(e);
  }
}

function renderCustomBeysList() {
  const container = document.getElementById('customBeysList');
  const myBeys = customBeys.filter(b => b.blader_id === currentUser.id);
  if (myBeys.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--muted);font-size:0.85rem">Nessun Bey custom creato.</p>';
    return;
  }

  container.innerHTML = myBeys.map(b => {
    let statsObj = {};
    try {
      statsObj = JSON.parse(b.stats);
    } catch(e) {}
    
    const glowColor = b.color || '#00d4ff';

    return `
      <div class="player-item" style="flex-direction:column;align-items:stretch;gap:8px;border-color:rgba(255,255,255,0.06);position:relative">
        <button style="position:absolute;top:10px;right:36px;background:transparent;border:none;color:var(--primary);font-size:1.1rem;cursor:pointer" onclick="shareCustomBey('${b.id}')">📱</button>
        <button style="position:absolute;top:10px;right:10px;background:transparent;border:none;color:var(--danger);font-size:1.1rem;cursor:pointer" onclick="deleteCustomBey('${b.id}')">🗑️</button>
        
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:12px;height:12px;border-radius:50%;background:${glowColor};box-shadow:0 0 8px ${glowColor}"></div>
          <div class="player-name" style="color:var(--accent)">${b.name}</div>
        </div>
        
        <div style="font-size:0.8rem;color:var(--muted)">Combo: ${b.blade} ${b.ratchet}${b.bit}</div>
        
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
          <span class="bey-badge" style="border-color:${glowColor};color:${glowColor}">${b.type_class.toUpperCase()}</span>
          <span class="bey-badge" style="border-color:var(--muted);color:var(--muted)">${statsObj.weight || 0}g</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:6px;font-size:0.7rem;margin-top:6px;border-top:1px solid rgba(255,255,255,0.03);padding-top:6px">
          <div>
            <div style="display:flex;justify-content:space-between"><span>ATK</span><span>${statsObj.attack || 0}</span></div>
            <div style="width:100%;height:3px;background:rgba(255,255,255,0.05);border-radius:1.5px;overflow:hidden">
              <div style="height:100%;background:#ff4444;width:${statsObj.attack || 0}%"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between"><span>DEF</span><span>${statsObj.defense || 0}</span></div>
            <div style="width:100%;height:3px;background:rgba(255,255,255,0.05);border-radius:1.5px;overflow:hidden">
              <div style="height:100%;background:#00d4ff;width:${statsObj.defense || 0}%"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between"><span>STM</span><span>${statsObj.stamina || 0}</span></div>
            <div style="width:100%;height:3px;background:rgba(255,255,255,0.05);border-radius:1.5px;overflow:hidden">
              <div style="height:100%;background:#00ff88;width:${statsObj.stamina || 0}%"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between"><span>SPD</span><span>${statsObj.speed || 0}</span></div>
            <div style="width:100%;height:3px;background:rgba(255,255,255,0.05);border-radius:1.5px;overflow:hidden">
              <div style="height:100%;background:#ffd700;width:${statsObj.speed || 0}%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadProfileTab() {
  const total = currentUser.wins + currentUser.losses;
  const rate = total > 0 ? Math.round((currentUser.wins / total) * 100) : 0;
  
  document.getElementById('profWins').textContent = currentUser.wins;
  document.getElementById('profLosses').textContent = currentUser.losses;
  document.getElementById('profWinRate').textContent = rate + '%';
  document.getElementById('profPoints').textContent = currentUser.points_total;
  
  await loadCustomBeys();
  renderCustomBeysList();
  updateDeckSlotUI();
  await loadProfileBattleHistory();
}

async function loadProfileBattleHistory() {
  const container = document.getElementById('profileMatchesHistory');
  if (!container) return;
  
  try {
    const response = await fetch(`/api/blader/${currentUser.id}/history`);
    if (!response.ok) throw new Error("Errore durante il recupero dello storico");
    const history = await response.json();
    
    if (history.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--muted);font-size:0.85rem">Nessuna battaglia registrata.</p>';
      return;
    }
    
    const finishLabels = {
      'spin': 'Spin Finish',
      'over': 'Over Finish',
      'burst': 'Burst Finish',
      'xtreme': 'Xtreme Finish',
      'draw': 'Pareggio',
      'foul': 'Fallo'
    };
    
    container.innerHTML = history.map(match => {
      const isWinner = match.winner_id === currentUser.id;
      const opponentName = match.blader1_id === currentUser.id ? match.blader2_name : match.blader1_name;
      const myScore = match.blader1_id === currentUser.id ? match.blader1_points : match.blader2_points;
      const oppScore = match.blader1_id === currentUser.id ? match.blader2_points : match.blader1_points;
      
      const outcomeText = match.winner_id ? (isWinner ? 'VITTORIA' : 'SCONFITTA') : 'PAREGGIO';
      const outcomeClass = match.winner_id ? (isWinner ? 'success' : 'danger') : 'muted';
      
      let typeLabel = 'Sfida Versus';
      if (match.battle_type === 'challenge') {
        typeLabel = 'Sfida Lobby';
      } else if (match.battle_type === 'tournament') {
        typeLabel = `Torneo: ${match.associated_name || 'Torneo'}`;
      }

      const roundsHtml = match.rounds.map((r, i) => {
        let rDesc = '';
        let rPts = '';
        if (r.round_type === 'draw') {
          rDesc = 'Pareggio';
          rPts = '+0 pt';
        } else if (r.round_type === 'foul') {
          const foulBlader = r.foul_blader_id === match.blader1_id ? match.blader1_name : match.blader2_name;
          rDesc = `Fallo a ${foulBlader}`;
          const pts = r.foul_blader_id === match.blader1_id ? r.b2_points : r.b1_points;
          rPts = pts > 0 ? `+1 pt` : '+0 pt';
        } else {
          const wName = r.winner_id === match.blader1_id ? match.blader1_name : match.blader2_name;
          const fLbl = finishLabels[r.finish_type] || r.finish_type || 'Finish';
          rDesc = `${wName} (${fLbl})`;
          const pts = r.winner_id === match.blader1_id ? r.b1_points : r.b2_points;
          rPts = `+${pts} pt`;
        }
        return `<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--surface-3);border-radius:4px;font-size:0.75rem;margin-bottom:4px">
          <span style="color:var(--muted)">R${i+1}</span>
          <span style="font-weight:600">${rDesc}</span>
          <span style="color:var(--primary)">${rPts}</span>
        </div>`;
      }).join('');

      const detailId = `match-detail-${match.id}`;
      return `
        <div class="player-item" style="flex-direction:column;align-items:stretch;gap:8px" onclick="toggleMatchDetail('${detailId}')">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
            <div>
              <div style="font-size:0.75rem;color:var(--muted)">${typeLabel}</div>
              <div class="player-name">vs ${opponentName}</div>
            </div>
            <div style="text-align:right">
              <span class="t-status ${outcomeClass}" style="padding:2px 6px;font-size:0.65rem">${outcomeText}</span>
              <div style="font-family:'Orbitron';font-weight:bold;font-size:0.95rem;margin-top:2px;color:var(--text)">
                ${myScore} - ${oppScore}
              </div>
            </div>
          </div>
          <div id="${detailId}" style="display:none;border-top:1px solid rgba(255,255,255,0.05);padding-top:8px;margin-top:4px;width:100%">
            <div style="font-size:0.7rem;color:var(--muted);text-transform:uppercase;font-family:'Orbitron';letter-spacing:1px;margin-bottom:6px">Dettaglio Round</div>
            ${roundsHtml}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="text-align:center;color:var(--danger);font-size:0.85rem">Errore nel caricamento.</p>';
  }
}

function toggleMatchDetail(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
}

async function startQrScanner(forSlot = true) {
  qrScannerForSlot = forSlot;
  openOverlay('qrScannerModal');
  document.getElementById('qr-reader-results').textContent = '';
  
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
    } catch(e) {}
    html5QrCode = null;
  }
  
  // Wait 200ms to ensure the modal is fully visible and rendered
  setTimeout(async () => {
    try {
      html5QrCode = new Html5Qrcode("qr-reader");
      
      const qrCodeSuccessCallback = async (decodedText, decodedResult) => {
        document.getElementById('qr-reader-results').textContent = "Codice rilevato! Elaborazione...";
        try {
          await html5QrCode.stop();
          html5QrCode = null;
        } catch(e) {}
        closeOverlay('qrScannerModal');
        await handleScannedQr(decodedText, forSlot);
      };
      
      // Calculate dynamic qrbox based on container size to prevent OverconstrainedError on small screens
      const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdge * 0.7);
        return {
          width: qrboxSize,
          height: qrboxSize
        };
      };
      
      const config = { 
        fps: 15, 
        qrbox: qrboxFunction,
        aspectRatio: 1.0
      };
      
      // Try listing cameras to identify the back camera explicitly
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          let cameraId = devices[0].id;
          // Loop to find rear/back camera
          for (const device of devices) {
            const label = device.label.toLowerCase();
            if (label.includes("back") || label.includes("rear") || label.includes("ambiente") || label.includes("environment") || label.includes("retro") || label.includes("posteriore") || label.includes("main")) {
              cameraId = device.id;
              break;
            }
          }
          await html5QrCode.start(cameraId, config, qrCodeSuccessCallback);
        } else {
          // Fallback to default environment facingMode constraint
          await html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback);
        }
      } catch (camErr) {
        console.warn("Could not list cameras, using facingMode constraint fallback:", camErr);
        // Fallback to environment facingMode
        await html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      document.getElementById('qr-reader').innerHTML = `
        <div style="padding: 20px; color: var(--danger); font-size: 0.95rem; line-height: 1.4;">
          Errore di accesso alla fotocamera.<br><br>
          Assicurati di aver concesso i permessi necessari e che il protocollo sia sicuro (HTTPS o localhost).
        </div>
      `;
    }
  }, 200);
}

async function stopQrScanner() {
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
    } catch(e) {}
    html5QrCode = null;
  }
  closeOverlay('qrScannerModal');
}

let pendingScannedQrText = '';
let pendingScannedQrForSlot = null;

function openQrAssociationModal(text, forSlot) {
  pendingScannedQrText = text;
  pendingScannedQrForSlot = forSlot;
  
  const select = document.getElementById('qrAssociateSelect');
  select.innerHTML = STANDARD_BEYS.map(b => `<option value="${b.id}">${b.name} (${b.fullName})</option>`).join('');
  openOverlay('qrAssociationModal');
}

async function confirmQrAssociation() {
  const select = document.getElementById('qrAssociateSelect');
  const selectedBeyId = select.value;
  if (!selectedBeyId) return;
  
  let customMappings = {};
  try {
    customMappings = JSON.parse(localStorage.getItem('custom_qr_mappings') || '{}');
  } catch(e) {}
  
  customMappings[pendingScannedQrText] = selectedBeyId;
  localStorage.setItem('custom_qr_mappings', JSON.stringify(customMappings));
  
  closeOverlay('qrAssociationModal');
  showToast("Associazione salvata con successo!", "success");
  
  await handleScannedQr(pendingScannedQrText, pendingScannedQrForSlot);
}

async function handleScannedQr(text, forSlot) {
  text = text.trim();
  console.log("Scanned text payload:", text);
  
  // 1. Check if Custom Bey share code (Format: BEYX:name|blade|ratchet|bit|color)
  if (text.startsWith("BEYX:")) {
    const parts = text.substring(5).split('|');
    if (parts.length >= 4) {
      const name = parts[0].trim();
      const bladeName = parts[1].trim();
      const ratchetName = parts[2].trim();
      const bitName = parts[3].trim();
      const color = parts[4] ? parts[4].trim() : '#00d4ff';
      
      const bladeObj = BLADES.find(b => b.name.toLowerCase() === bladeName.toLowerCase() || b.id.toLowerCase() === bladeName.toLowerCase());
      const ratchetObj = RATCHETS.find(r => r.name.toLowerCase() === ratchetName.toLowerCase() || r.id.toLowerCase() === ratchetName.toLowerCase());
      const bitObj = BITS.find(b => b.name.toLowerCase() === bitName.toLowerCase() || b.id.toLowerCase() === bitName.toLowerCase());
      
      if (!bladeObj || !ratchetObj || !bitObj) {
        showToast("Codice QR non valido: componenti Beyblade non riconosciuti.", "error");
        return;
      }
      
      const stats = calculateStats(bladeObj.id, ratchetObj.id, bitObj.id);
      if (!stats) {
        showToast("Errore durante il calcolo delle statistiche del Bey scansionato.", "error");
        return;
      }
      
      try {
        const res = await fetch('/api/custom-beys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blader_id: currentUser.id,
            name,
            blade: bladeObj.name,
            ratchet: ratchetObj.name,
            bit: bitObj.name,
            type_class: stats.typeClass,
            color,
            stats: JSON.stringify(stats)
          })
        });
        
        if (!res.ok) throw new Error("Errore durante il salvataggio del Beyblade");
        const newBey = await res.json();
        
        showToast(`Bey custom "${name}" importato con successo!`, "success");
        await loadCustomBeys();
        renderCustomBeysList();
        
        if (forSlot && deckSelectActiveSlot !== null) {
          let deck = [...(currentUser.beys || [])];
          while (deck.length < 3) deck.push('');
          deck[deckSelectActiveSlot] = newBey.id;
          await saveDeck(deck);
          closeOverlay('deckSelectModal');
        }
      } catch(e) {
        showToast(e.message, "error");
      }
      return;
    }
  }
  
  // 2. Check if product code BX-XX / UX-XX (eg BX-01, UX-03)
  const regex = /([bu]x-?\d{2})/i;
  const match = text.match(regex);
  let resolvedBeyId = null;
  
  if (match) {
    const rawCode = match[1].toLowerCase().replace('-', '');
    resolvedBeyId = QR_MAPPINGS[rawCode];
  }
  
  // 3. Check custom mappings from localStorage (e.g. for Hasbro or custom QRs)
  if (!resolvedBeyId) {
    try {
      const customMappings = JSON.parse(localStorage.getItem('custom_qr_mappings') || '{}');
      if (customMappings[text]) {
        resolvedBeyId = customMappings[text];
      }
    } catch(e) {}
  }
  
  // 4. Fallback to exact ID match (eg dran-sword)
  if (!resolvedBeyId) {
    const std = STANDARD_BEYS.find(b => b.id.toLowerCase() === text.toLowerCase() || b.name.toLowerCase() === text.toLowerCase());
    if (std) {
      resolvedBeyId = std.id;
    }
  }
  
  if (resolvedBeyId) {
    const stdBey = STANDARD_BEYS.find(b => b.id === resolvedBeyId);
    showToast(`Rilevato: ${stdBey.name}!`);
    
    if (forSlot && deckSelectActiveSlot !== null) {
      let deck = [...(currentUser.beys || [])];
      while (deck.length < 3) deck.push('');
      deck[deckSelectActiveSlot] = resolvedBeyId;
      await saveDeck(deck);
      closeOverlay('deckSelectModal');
    } else {
      showToast(`Scansionato "${stdBey.name}". Usa "Slot Deck" per equipaggiarlo.`, "success");
    }
  } else {
    // Open association modal instead of showing error toast
    openQrAssociationModal(text, forSlot);
  }
}

function shareCustomBey(id) {
  const bey = customBeys.find(b => b.id === id);
  if (!bey) return;
  
  const payload = `BEYX:${bey.name}|${bey.blade}|${bey.ratchet}|${bey.bit}|${bey.color || '#00d4ff'}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payload)}`;
  
  document.getElementById('shareBeyTitle').textContent = `Condividi ${bey.name}`;
  document.getElementById('shareBeyQrImg').src = qrUrl;
  openOverlay('shareBeyModal');
}

async function handleQrFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  document.getElementById('qr-reader-results').textContent = "Elaborazione immagine...";
  const scanner = html5QrCode || new Html5Qrcode("qr-reader");
  
  try {
    const decodedText = await scanner.scanFile(file, true);
    document.getElementById('qr-reader-results').textContent = "Codice rilevato!";
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
      } catch(e) {}
      html5QrCode = null;
    }
    closeOverlay('qrScannerModal');
    await handleScannedQr(decodedText, qrScannerForSlot);
  } catch (err) {
    console.error("QR Code decoding error:", err);
    document.getElementById('qr-reader-results').textContent = "";
    showToast("Nessun codice QR rilevato nell'immagine. Riprova con un'inquadratura più nitida.", "error");
  } finally {
    event.target.value = '';
  }
}
</script>
</body>
</html>"##.to_string()
}

fn admin_html() -> String {
r##"<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BeybladeX — Admin</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600&display=swap');
  :root {
    --bg:#0a0a1a;--surface:#12122a;--surface2:#1a1a38;--primary:#00d4ff;--secondary:#7c3aed;
    --accent:#ffd700;--danger:#ff4444;--success:#00ff88;--text:#e2e8f0;--muted:#64748b;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);color:var(--text);font-family:'Rajdhani',system-ui,sans-serif;min-height:100vh;}
  header{background:var(--surface);border-bottom:1px solid rgba(0,212,255,.2);padding:14px 24px;display:flex;align-items:center;gap:16px;}
  header h1{font-family:'Orbitron',sans-serif;font-size:1.1rem;font-weight:900;background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-transform:uppercase;letter-spacing:2px;}
  header span{color:var(--muted);font-size:.85rem;}
  .wrap{max-width:1300px;margin:0 auto;padding:24px;}
  /* tabs */
  .tabs{display:flex;gap:4px;margin-bottom:24px;background:var(--surface);padding:4px;border-radius:12px;border:1px solid rgba(0,212,255,.15);flex-wrap:wrap;}
  .tab{flex:1;min-width:100px;padding:10px 8px;text-align:center;cursor:pointer;border-radius:8px;font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);transition:all .2s;}
  .tab.active{background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;}
  /* form card */
  .card{background:var(--surface);border:1px solid rgba(0,212,255,.2);border-radius:16px;padding:20px;margin-bottom:24px;}
  .card h2{font-family:'Orbitron',sans-serif;font-size:.9rem;color:var(--primary);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;}
  .field{display:flex;flex-direction:column;gap:5px;}
  .field label{font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;}
  .field input,.field select{background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.2);border-radius:8px;padding:8px 12px;color:var(--text);font-size:.9rem;font-family:inherit;outline:none;width:100%;}
  .field input:focus,.field select:focus{border-color:var(--primary);}
  .field input[type=color]{height:40px;padding:3px 6px;cursor:pointer;}
  .field select option{background:var(--surface2);color:var(--text);}
  .ratchet-preview{margin-top:12px;display:flex;align-items:center;gap:10px;}
  .ratchet-preview span{color:var(--muted);font-size:.85rem;}
  .ratchet-name{font-family:'Orbitron',sans-serif;font-size:1.2rem;color:var(--accent);padding:6px 14px;background:rgba(255,215,0,.07);border:1px solid rgba(255,215,0,.3);border-radius:8px;}
  .actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;}
  .btn{padding:9px 18px;border:none;border-radius:8px;font-weight:700;font-size:.8rem;font-family:inherit;cursor:pointer;text-transform:uppercase;letter-spacing:.5px;transition:all .2s;}
  .btn:hover{transform:translateY(-1px);opacity:.9;}
  .btn-primary{background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;}
  .btn-secondary{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:var(--text);}
  .btn-sm{padding:5px 10px;font-size:.72rem;}
  .btn-edit{background:rgba(0,212,255,.1);border:1px solid var(--primary);color:var(--primary);}
  .btn-del{background:rgba(255,68,68,.15);border:1px solid var(--danger);color:var(--danger);}
  /* table */
  .tcard{background:var(--surface);border:1px solid rgba(0,212,255,.2);border-radius:16px;overflow:hidden;}
  .tcard-head{padding:14px 20px;border-bottom:1px solid rgba(0,212,255,.1);display:flex;align-items:center;justify-content:space-between;}
  .tcard-head h2{font-family:'Orbitron',sans-serif;font-size:.9rem;color:var(--primary);text-transform:uppercase;letter-spacing:1px;}
  .tcard-head .count{color:var(--muted);font-size:.8rem;}
  table{width:100%;border-collapse:collapse;}
  th{padding:10px 14px;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);background:rgba(0,0,0,.25);white-space:nowrap;}
  td{padding:10px 14px;border-top:1px solid rgba(255,255,255,.05);font-size:.88rem;vertical-align:middle;}
  tr:hover td{background:rgba(0,212,255,.03);}
  .swatch{width:22px;height:22px;border-radius:50%;display:inline-block;border:2px solid rgba(255,255,255,.1);vertical-align:middle;}
  .badge{padding:2px 9px;border-radius:99px;font-size:.68rem;font-weight:700;text-transform:uppercase;display:inline-block;}
  .b-bx{background:rgba(0,212,255,.15);color:var(--primary);border:1px solid var(--primary);}
  .b-ux{background:rgba(124,58,237,.2);color:#a78bfa;border:1px solid #7c3aed;}
  .b-cx{background:rgba(255,215,0,.15);color:var(--accent);border:1px solid var(--accent);}
  .b-cx_new{background:rgba(255,68,68,.15);color:#ff8080;border:1px solid var(--danger);}
  .b-tt{background:rgba(255,255,255,.08);color:var(--text);border:1px solid rgba(255,255,255,.15);}
  .b-hasbro{background:rgba(0,255,136,.12);color:var(--success);border:1px solid var(--success);}
  .td-act{display:flex;gap:5px;flex-wrap:nowrap;}
  .empty{text-align:center;padding:48px 20px;color:var(--muted);}
  /* toast */
  .toast{position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;font-weight:700;font-size:.85rem;z-index:9999;animation:fdin .3s;}
  .toast.ok{background:var(--success);color:#000;}
  .toast.err{background:var(--danger);color:#fff;}
  @keyframes fdin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style>
</head>
<body>
<header>
  <h1>Beyblade X Admin</h1>
  <span>Gestione Pezzi &amp; Database</span>
</header>
<div class="wrap">
  <!-- Type Tabs -->
  <div class="tabs" id="typeTabs">
    <div class="tab active" onclick="switchTab('blade')">Blade</div>
    <div class="tab" onclick="switchTab('ratchet')">Ratchet</div>
    <div class="tab" onclick="switchTab('bit')">Bit</div>
    <div class="tab" onclick="switchTab('assist_blade')">Assist Blade</div>
    <div class="tab" onclick="switchTab('lock_chip')">Lock Chip</div>
    <div class="tab" onclick="switchTab('over_blade')">Over Blade</div>
  </div>

  <!-- Form -->
  <div class="card">
    <h2 id="formTitle">Aggiungi Blade</h2>
    <form id="partForm" onsubmit="submitForm(event)">
      <div class="grid">
        <!-- Name: unified free-text + datalist for all types -->
        <div class="field" id="fName">
          <label>Nome</label>
          <input type="text" id="nameInput" list="dl-name" placeholder="Cerca o inserisci..." autocomplete="off">
          <datalist id="dl-name"></datalist>
        </div>
        <!-- Ratchet specific -->
        <div class="field" id="fProt" style="display:none">
          <label>Sporgenze</label>
          <input type="text" id="protSel" list="dl-prot" placeholder="es. 3" autocomplete="off">
          <datalist id="dl-prot">
            <option>1</option><option>2</option><option>3</option><option>4</option>
            <option>5</option><option>6</option><option>7</option><option>8</option>
            <option>9</option><option>10</option><option>12</option>
          </datalist>
        </div>
        <div class="field" id="fHgt" style="display:none">
          <label>Altezza</label>
          <input type="text" id="hgtSel" list="dl-hgt" placeholder="es. 60" autocomplete="off">
          <datalist id="dl-hgt">
            <option>45</option><option>50</option><option>55</option><option>60</option>
            <option>65</option><option>70</option><option>75</option><option>80</option>
            <option>85</option><option>90</option>
          </datalist>
        </div>
        <!-- Common fields -->
        <div class="field">
          <label>Seriale</label>
          <input type="text" id="serialSel" list="dl-serial" placeholder="es. BX-01" autocomplete="off">
          <datalist id="dl-serial"></datalist>
        </div>
        <div class="field">
          <label>Pack</label>
          <input type="text" id="packSel" list="dl-pack" placeholder="es. Starter Pack" autocomplete="off">
          <datalist id="dl-pack"></datalist>
        </div>
        <div class="field">
          <label>Brand</label>
          <input type="text" id="brandSel" list="dl-brand" placeholder="Takara Tomy" autocomplete="off">
          <datalist id="dl-brand">
            <option>Takara Tomy</option>
            <option>Hasbro</option>
          </datalist>
        </div>
        <div class="field">
          <label>Serie</label>
          <input type="text" id="seriesSel" list="dl-series" placeholder="es. BX" autocomplete="off" oninput="updateSerials()">
          <datalist id="dl-series">
            <option>BX</option>
            <option>UX</option>
            <option>CX</option>
            <option>CX New</option>
          </datalist>
        </div>
        <div class="field">
          <label>Colore</label>
          <input type="color" id="colorPick" value="#00d4ff">
        </div>
        <div class="field">
          <label>Immagine URL (opz.)</label>
          <input type="text" id="imgUrl" placeholder="https://...">
        </div>
      </div>
      <!-- Ratchet name preview -->
      <div class="ratchet-preview" id="ratchetPrev" style="display:none">
        <span>Nome ratchet:</span>
        <span class="ratchet-name" id="ratchetName">3-60</span>
      </div>
      <div class="actions">
        <button type="submit" class="btn btn-primary" id="submitBtn">Aggiungi</button>
        <button type="button" class="btn btn-secondary" id="cancelBtn" onclick="cancelEdit()" style="display:none">Annulla</button>
      </div>
    </form>
  </div>

  <!-- Table -->
  <div class="tcard">
    <div class="tcard-head">
      <h2 id="tableTitle">Blade</h2>
      <span class="count" id="tableCount"></span>
    </div>
    <div id="tableWrap"><div class="empty">Caricamento...</div></div>
  </div>
</div>

<script>
const TYPE_LABELS = {blade:'Blade',ratchet:'Ratchet',bit:'Bit',assist_blade:'Assist Blade',lock_chip:'Lock Chip',over_blade:'Over Blade'};
const SERIES_LABELS = {bx:'BX',ux:'UX',cx:'CX',cx_new:'CX New'};

// Predefined name choices
const NAMES = {
  blade: [
    'Dran Sword','Hells Scythe','Wizard Arrow','Knight Shield','Shark Edge','Cobalt Dragoon',
    'Wizard Rod','Knight Lance','Viper Tail','Dran Dagger','Hells Chain','Rhino Horn',
    'Phoenix Wing','Wyvern Gale','Unicorn Sting','Sphinx Cowl','Hells Hammer','Dran Buster',
    'Leon Claw','Black Shell','Whale Wave','Leon Crest','Tyranno Beat','Hells Cyclone',
    'Pandora Box','Crimson Garuda','Galactic Spryzen','Storm Pegasus','Galaxy Pegasus',
    'Shadow Dranzer','Poison Serpent','Knight Dragon','Dran Dragon','Leon Storm',
    'Cobalt Valkyrie','Wizard Fafnir','Knight Lancer','Hells Belial','Venom Dran',
    'Tyrant Dragon','Dark Matter','Astral Spriggan','Imperial Dragon','Savior Valkyrie',
    'World Spriggan','Prominence Valkyrie','Guilty Longinus','Belial Evo','Sly Fox'
  ],
  assist_blade: [
    'Dran Assist','Cobalt Assist','Hells Assist','Wizard Assist','Knight Assist',
    'Leon Assist','Shark Assist','Phoenix Assist','Standard Assist','Heavy Assist'
  ],
  lock_chip: [
    'Lock Chip Standard','Lock Chip Light','Lock Chip Heavy',
    'Lock Chip Attack','Lock Chip Defense','Lock Chip Stamina'
  ],
  over_blade: [
    'Over Blade Standard','Over Blade Attack','Over Blade Defense',
    'Over Blade Stamina','Over Blade Balance','Over Blade Xtreme'
  ]
};

// Serials
const mkSerials = (prefix, count, start=1) =>
  Array.from({length:count}, (_,i) => `${prefix}-${String(i+start).padStart(2,'0')}`);

const SERIALS = {
  bx: ['BX-00', ...mkSerials('BX',45)],
  ux: mkSerials('UX',20),
  cx: mkSerials('CX',20),
  cx_new: mkSerials('CX',20,21),
};

const PACKS = [
  '-- Seleziona --',
  'Starter Pack','Starter Deck Set','Ultimate Deck Set',
  'Random Booster Vol.1','Random Booster Vol.2','Random Booster Vol.3',
  'Random Booster Vol.4','Random Booster Vol.5','Random Booster Vol.6',
  'Random Booster Vol.7','Random Booster Vol.8','Random Booster Vol.9',
  'Battle Pack','Dual Pack','Triple Pack',
  'Ultimate Random Booster','Premium Starter Set',
  'Trial Set','Versus Pack','Special Edition',
  'Anniversary Set','Collaboration Set','Entry Set',
];

let activeType = 'blade';
let editingId = null;
let parts = [];

function switchTab(type) {
  activeType = type;
  editingId = null;
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', Object.keys(TYPE_LABELS)[i] === type);
  });
  document.getElementById('tableTitle').textContent = TYPE_LABELS[type];
  document.getElementById('formTitle').textContent = 'Aggiungi ' + TYPE_LABELS[type];
  document.getElementById('submitBtn').textContent = 'Aggiungi';
  document.getElementById('cancelBtn').style.display = 'none';
  document.getElementById('partForm').reset();
  document.getElementById('colorPick').value = '#00d4ff';
  updateFormFields();
  loadParts();
}

function seriesKey(s) {
  const m = {'bx':'bx','ux':'ux','cx':'cx','cx new':'cx_new','cx_new':'cx_new'};
  return m[(s||'').toLowerCase().trim()] || 'bx';
}

function populateDl(id, values) {
  const dl = document.getElementById(id);
  if (!dl) return;
  const existing = new Set(Array.from(dl.options).map(o => o.value));
  values.forEach(v => {
    if (v && !existing.has(v)) {
      const opt = document.createElement('option');
      opt.value = v;
      dl.appendChild(opt);
      existing.add(v);
    }
  });
}

function updateFormFields() {
  const isR = activeType === 'ratchet';
  document.getElementById('fName').style.display = isR ? 'none' : '';
  document.getElementById('fProt').style.display = isR ? '' : 'none';
  document.getElementById('fHgt').style.display = isR ? '' : 'none';
  document.getElementById('ratchetPrev').style.display = isR ? '' : 'none';
  if (!isR) {
    const dl = document.getElementById('dl-name');
    dl.innerHTML = '';
    populateDl('dl-name', NAMES[activeType] || []);
  }
  updateSerials();
  updateRatchetName();
}

function updateSerials() {
  const s = document.getElementById('seriesSel').value;
  const list = SERIALS[seriesKey(s)] || SERIALS.bx;
  const dl = document.getElementById('dl-serial');
  dl.innerHTML = '';
  populateDl('dl-serial', list);
}

function updateRatchetName() {
  if (activeType !== 'ratchet') return;
  const p = document.getElementById('protSel').value;
  const h = document.getElementById('hgtSel').value;
  if (p && h) document.getElementById('ratchetName').textContent = p + '-' + h;
}

function updateDatalistsFromParts(data) {
  populateDl('dl-name', [...new Set(data.map(p => p.name).filter(Boolean))]);
  populateDl('dl-serial', [...new Set(data.map(p => p.serial).filter(Boolean))]);
  populateDl('dl-pack', [...new Set(data.map(p => p.pack).filter(Boolean))]);
  populateDl('dl-brand', [...new Set(data.map(p => p.brand).filter(Boolean))]);
  populateDl('dl-series', [...new Set(data.map(p => p.series).filter(Boolean))]);
}

async function initDatalistsFromAllParts() {
  try {
    const r = await fetch('/api/parts');
    if (r.ok) updateDatalistsFromParts(await r.json());
  } catch(e) {}
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadParts() {
  document.getElementById('tableWrap').innerHTML = '<div class="empty">Caricamento...</div>';
  try {
    const r = await fetch('/api/parts?type=' + activeType);
    parts = await r.json();
    updateDatalistsFromParts(parts);
    renderTable(parts);
  } catch(e) {
    document.getElementById('tableWrap').innerHTML = '<div class="empty">Errore nel caricamento</div>';
  }
}

function renderTable(data) {
  document.getElementById('tableCount').textContent = data.length + ' elementi';
  if (!data.length) {
    document.getElementById('tableWrap').innerHTML = '<div class="empty">Nessun pezzo trovato — aggiungine uno con il form sopra.</div>';
    return;
  }
  const rows = data.map((p, i) => {
    const color = p.color ? `<span class="swatch" style="background:${esc(p.color)}" title="${esc(p.color)}"></span>` : '—';
    const img = p.image_url ? `<a href="${esc(p.image_url)}" target="_blank" style="color:var(--primary)">🖼</a>` : '—';
    const extra = activeType === 'ratchet' && p.protrusions != null ? `${p.protrusions}-${p.height}` : esc(p.name);
    const bKey = (p.brand||'').toLowerCase().replace(/\s+/g,'_');
    const bClass = bKey === 'hasbro' ? 'hasbro' : 'tt';
    const bLabel = bKey === 'hasbro' ? 'Hasbro' : (bKey === 'takara_tomy' || bKey === 'takara tomy' ? 'Takara Tomy' : esc(p.brand||''));
    const sKey = seriesKey(p.series);
    const sLabel = SERIES_LABELS[sKey] || esc(p.series||'');
    return `<tr>
      <td><strong>${extra}</strong></td>
      <td>${esc(p.serial)||'—'}</td>
      <td>${esc(p.pack)||'—'}</td>
      <td><span class="badge b-${bClass}">${bLabel}</span></td>
      <td><span class="badge b-${sKey}">${sLabel}</span></td>
      <td>${color}</td>
      <td>${img}</td>
      <td class="td-act">
        <button class="btn btn-sm btn-edit" onclick="editPart(${i})">Modifica</button>
        <button class="btn btn-sm btn-del" onclick="deletePart('${esc(p.id)}')">Elimina</button>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('tableWrap').innerHTML = `
    <table>
      <thead><tr><th>Nome</th><th>Seriale</th><th>Pack</th><th>Brand</th><th>Serie</th><th>Colore</th><th>Img</th><th>Azioni</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function editPart(idx) {
  const p = parts[idx];
  if (!p) return;
  editingId = p.id;
  document.getElementById('formTitle').textContent = 'Modifica ' + TYPE_LABELS[activeType];
  document.getElementById('submitBtn').textContent = 'Aggiorna';
  document.getElementById('cancelBtn').style.display = '';
  if (activeType === 'ratchet') {
    document.getElementById('protSel').value = String(p.protrusions || 3);
    document.getElementById('hgtSel').value = String(p.height || 60);
    updateRatchetName();
  } else {
    document.getElementById('nameInput').value = p.name;
  }
  document.getElementById('seriesSel').value = p.series || 'BX';
  updateSerials();
  document.getElementById('serialSel').value = p.serial || '';
  document.getElementById('packSel').value = p.pack || '';
  document.getElementById('brandSel').value = p.brand || 'Takara Tomy';
  document.getElementById('colorPick').value = p.color || '#00d4ff';
  document.getElementById('imgUrl').value = p.image_url || '';
  window.scrollTo({top:0,behavior:'smooth'});
}

function cancelEdit() {
  editingId = null;
  document.getElementById('partForm').reset();
  document.getElementById('colorPick').value = '#00d4ff';
  document.getElementById('seriesSel').value = 'BX';
  document.getElementById('brandSel').value = 'Takara Tomy';
  document.getElementById('formTitle').textContent = 'Aggiungi ' + TYPE_LABELS[activeType];
  document.getElementById('submitBtn').textContent = 'Aggiungi';
  document.getElementById('cancelBtn').style.display = 'none';
  updateFormFields();
}

async function submitForm(e) {
  e.preventDefault();
  let name, protrusions = null, height = null;
  if (activeType === 'ratchet') {
    protrusions = parseInt(document.getElementById('protSel').value) || null;
    height = parseInt(document.getElementById('hgtSel').value) || null;
    name = (protrusions||'?') + '-' + (height||'?');
  } else {
    name = document.getElementById('nameInput').value.trim();
  }
  if (!name) { toast('Il nome è obbligatorio', false); return; }
  const payload = {
    part_type: activeType, name,
    serial: document.getElementById('serialSel').value.trim() || null,
    pack: document.getElementById('packSel').value.trim() || null,
    brand: document.getElementById('brandSel').value.trim() || null,
    series: document.getElementById('seriesSel').value.trim() || null,
    color: document.getElementById('colorPick').value || null,
    image_url: document.getElementById('imgUrl').value.trim() || null,
    protrusions, height,
  };
  try {
    const url = editingId ? `/api/admin/parts/${editingId}` : '/api/admin/parts';
    const method = editingId ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method, headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    });
    if (!r.ok) { const t = await r.json(); throw new Error(t.error || r.statusText); }
    toast(editingId ? 'Pezzo aggiornato!' : 'Pezzo aggiunto!', true);
    cancelEdit();
    loadParts();
  } catch(err) {
    toast('Errore: ' + err.message, false);
  }
}

async function deletePart(id) {
  if (!confirm('Eliminare questo pezzo definitivamente?')) return;
  try {
    const r = await fetch('/api/admin/parts/' + id, {method:'DELETE'});
    if (!r.ok) throw new Error('Errore eliminazione');
    toast('Pezzo eliminato', true);
    loadParts();
  } catch(err) {
    toast('Errore: ' + err.message, false);
  }
}

function toast(msg, ok) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast ' + (ok ? 'ok' : 'err');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function initPacks() {
  populateDl('dl-pack', PACKS.filter(p => p !== '-- Seleziona --'));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('protSel').addEventListener('input', updateRatchetName);
  document.getElementById('hgtSel').addEventListener('input', updateRatchetName);
  initPacks();
  initDatalistsFromAllParts();
  switchTab('blade');
});
</script>
</body>
</html>"##.to_string()
}
