use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BattleRound {
    pub round_num: i32,
    pub round_type: String, // "finish", "draw", "foul"
    pub winner_id: Option<String>,
    pub finish_type: Option<String>,
    pub foul_blader_id: Option<String>,
    pub b1_points: i32,
    pub b2_points: i32,
    pub bey1: Option<String>,
    pub bey2: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BattleRecord {
    pub id: String,
    pub battle_type: String, // "versus", "challenge", "tournament"
    pub associated_id: Option<String>,
    pub associated_name: Option<String>,
    pub blader1_id: String,
    pub blader1_name: String,
    pub blader2_id: String,
    pub blader2_name: String,
    pub winner_id: Option<String>,
    pub blader1_points: i32,
    pub blader2_points: i32,
    pub rounds: Vec<BattleRound>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Blader {
    pub id: String,
    pub name: String,
    pub avatar_color: String,
    pub avatar_initials: String,
    pub avatar_image: Option<String>,
    pub beys: Vec<String>,
    pub wins: i32,
    pub losses: i32,
    pub points_total: i32,
    pub created_at: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tournament {
    pub id: String,
    pub name: String,
    pub format: String,        // "1on1", "3on3", "deck", "team"
    pub arena: String,
    pub point_threshold: i32,
    pub join_code: String,
    pub status: String,        // "lobby", "active", "completed"
    pub blader_ids: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Match {
    pub id: String,
    pub tournament_id: String,
    pub round: i32,
    pub blader1_id: String,
    pub blader2_id: String,
    pub winner_id: Option<String>,
    pub blader1_points: i32,
    pub blader2_points: i32,
    pub finish_type: Option<String>, // "spin", "over", "burst", "xtreme"
    pub bey1: Option<String>,
    pub bey2: Option<String>,
    pub status: String, // "pending", "active", "done"
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CustomBey {
    pub id: String,
    pub blader_id: Option<String>,
    pub name: String,
    pub blade: String,
    pub ratchet: String,
    pub bit: String,
    pub type_class: String,
    pub color: Option<String>,
    pub stats: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomArena {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "maxPlayers")]
    pub max_players: i32,
    #[serde(rename = "hasXtremeLine")]
    pub has_xtreme_line: bool,
    pub tags: Vec<String>,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivityLog {
    pub id: String,
    pub event_type: String,
    pub message_it: String,
    pub message_en: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Part {
    pub id: String,
    pub part_type: String,  // blade | ratchet | bit | assist_blade | lock_chip | over_blade
    pub name: String,
    pub serial: String,
    pub pack: String,
    pub brand: String,      // takara_tomy | hasbro
    pub series: String,     // bx | ux | cx | cx_new
    pub color: Option<String>,
    pub image_url: Option<String>,
    pub protrusions: Option<i32>,
    pub height: Option<i32>,
    pub created_at: String,
}

pub struct Database {
    pub conn: Connection,
}

impl Database {
    pub fn new() -> Result<Self> {
        let path = dirs_path();
        let conn = Connection::open(&path)?;
        let db = Database { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        self.conn.execute_batch("
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS bladers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                avatar_color TEXT NOT NULL DEFAULT '#6C63FF',
                avatar_initials TEXT NOT NULL DEFAULT '?',
                avatar_image TEXT,
                wins INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0,
                points_total INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                password TEXT NOT NULL DEFAULT 'changeme'
            );

            CREATE TABLE IF NOT EXISTS tournaments (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                format TEXT NOT NULL DEFAULT '1on1',
                arena TEXT NOT NULL DEFAULT 'xtreme',
                point_threshold INTEGER NOT NULL DEFAULT 4,
                join_code TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'lobby',
                blader_ids TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS matches (
                id TEXT PRIMARY KEY,
                tournament_id TEXT NOT NULL,
                round INTEGER NOT NULL DEFAULT 1,
                blader1_id TEXT NOT NULL,
                blader2_id TEXT NOT NULL,
                winner_id TEXT,
                blader1_points INTEGER NOT NULL DEFAULT 0,
                blader2_points INTEGER NOT NULL DEFAULT 0,
                finish_type TEXT,
                bey1 TEXT,
                bey2 TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
            );
            CREATE TABLE IF NOT EXISTS custom_beys (
                id TEXT PRIMARY KEY,
                blader_id TEXT,
                name TEXT NOT NULL,
                blade TEXT NOT NULL,
                ratchet TEXT NOT NULL,
                bit TEXT NOT NULL,
                type_class TEXT NOT NULL,
                color TEXT,
                stats TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS custom_arenas (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                max_players INTEGER NOT NULL DEFAULT 2,
                has_xtreme_line INTEGER NOT NULL DEFAULT 1,
                tags TEXT NOT NULL DEFAULT '[]',
                color TEXT NOT NULL DEFAULT '#00d4ff',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS activity_log (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                message_it TEXT NOT NULL,
                message_en TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS battle_history (
                id TEXT PRIMARY KEY,
                battle_type TEXT NOT NULL,
                associated_id TEXT,
                associated_name TEXT,
                blader1_id TEXT NOT NULL,
                blader1_name TEXT NOT NULL,
                blader2_id TEXT NOT NULL,
                blader2_name TEXT NOT NULL,
                winner_id TEXT,
                blader1_points INTEGER NOT NULL DEFAULT 0,
                blader2_points INTEGER NOT NULL DEFAULT 0,
                rounds TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS parts (
                id TEXT PRIMARY KEY,
                part_type TEXT NOT NULL,
                name TEXT NOT NULL,
                serial TEXT NOT NULL DEFAULT '',
                pack TEXT NOT NULL DEFAULT '',
                brand TEXT NOT NULL DEFAULT 'takara_tomy',
                series TEXT NOT NULL DEFAULT 'bx',
                color TEXT,
                image_url TEXT,
                protrusions INTEGER,
                height INTEGER,
                created_at TEXT NOT NULL
            );
        ")?;

        // Migration to add beys column if missing
        let _ = self.conn.execute("ALTER TABLE bladers ADD COLUMN beys TEXT DEFAULT '[]'", []);
        // Migration to add password column if missing
        let _ = self.conn.execute("ALTER TABLE bladers ADD COLUMN password TEXT NOT NULL DEFAULT 'changeme'", []);

        Ok(())
    }


    // ─── Bladers ─────────────────────────────────────────────────────────────

    pub fn get_bladers(&self) -> Result<Vec<Blader>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, avatar_color, avatar_initials, avatar_image, wins, losses, points_total, created_at, beys, password FROM bladers ORDER BY wins DESC"
        )?;
        let bladers = stmt.query_map([], |row| {
            let beys_str: String = row.get(9).unwrap_or_else(|_| "[]".to_string());
            let beys: Vec<String> = serde_json::from_str(&beys_str).unwrap_or_default();
            let password = row.get(10).unwrap_or_else(|_| "changeme".to_string());
            Ok(Blader {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar_color: row.get(2)?,
                avatar_initials: row.get(3)?,
                avatar_image: row.get(4)?,
                wins: row.get(5)?,
                losses: row.get(6)?,
                points_total: row.get(7)?,
                created_at: row.get(8)?,
                beys,
                password,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(bladers)
    }

    pub fn create_blader(&self, name: &str, avatar_color: &str, avatar_image: Option<&str>, password: Option<&str>) -> Result<Blader> {
        let id = uuid::Uuid::new_v4().to_string();
        let initials = name.split_whitespace()
            .filter_map(|w| w.chars().next())
            .take(2)
            .collect::<String>()
            .to_uppercase();
        let created_at = Utc::now().to_rfc3339();
        let password_val = password.unwrap_or("changeme");
        self.conn.execute(
            "INSERT INTO bladers (id, name, avatar_color, avatar_initials, avatar_image, created_at, beys, password) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '[]', ?7)",
            rusqlite::params![id, name, avatar_color, initials, avatar_image, created_at, password_val],
        )?;

        let msg_it = format!("Nuovo Blader registrato: {}", name);
        let msg_en = format!("New Blader registered: {}", name);
        let _ = self.log_activity("blader", &msg_it, &msg_en);

        Ok(Blader {
            id,
            name: name.to_string(),
            avatar_color: avatar_color.to_string(),
            avatar_initials: initials,
            avatar_image: avatar_image.map(|s| s.to_string()),
            beys: vec![],
            wins: 0,
            losses: 0,
            points_total: 0,
            created_at,
            password: password_val.to_string(),
        })
    }

    pub fn update_blader(&self, id: &str, name: &str, avatar_color: &str, avatar_image: Option<&str>, beys: &[String], password: Option<&str>) -> Result<()> {
        let initials = name.split_whitespace()
            .filter_map(|w| w.chars().next())
            .take(2)
            .collect::<String>()
            .to_uppercase();
        let beys_str = serde_json::to_string(beys).unwrap_or_else(|_| "[]".to_string());
        if let Some(pw) = password {
            self.conn.execute(
                "UPDATE bladers SET name=?1, avatar_color=?2, avatar_initials=?3, avatar_image=?4, beys=?5, password=?6 WHERE id=?7",
                rusqlite::params![name, avatar_color, initials, avatar_image, beys_str, pw, id],
            )?;
        } else {
            self.conn.execute(
                "UPDATE bladers SET name=?1, avatar_color=?2, avatar_initials=?3, avatar_image=?4, beys=?5 WHERE id=?6",
                rusqlite::params![name, avatar_color, initials, avatar_image, beys_str, id],
            )?;
        }
        Ok(())
    }

    pub fn update_blader_deck(&self, id: &str, beys: &[String]) -> Result<()> {
        let beys_str = serde_json::to_string(beys).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "UPDATE bladers SET beys=?1 WHERE id=?2",
            rusqlite::params![beys_str, id],
        )?;
        Ok(())
    }

    pub fn change_blader_password(&self, id: &str, new_password: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE bladers SET password=?1 WHERE id=?2",
            rusqlite::params![new_password, id],
        )?;
        Ok(())
    }

    pub fn delete_blader(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM bladers WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }

    // ─── Custom Beys ─────────────────────────────────────────────────────────

    pub fn get_custom_beys(&self) -> Result<Vec<CustomBey>> {
        let mut stmt = self.conn.prepare("SELECT id, blader_id, name, blade, ratchet, bit, type_class, color, stats, created_at FROM custom_beys")?;
        let beys = stmt.query_map([], |row| {
            Ok(CustomBey {
                id: row.get(0)?,
                blader_id: row.get(1)?,
                name: row.get(2)?,
                blade: row.get(3)?,
                ratchet: row.get(4)?,
                bit: row.get(5)?,
                type_class: row.get(6)?,
                color: row.get(7)?,
                stats: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(beys)
    }

    pub fn create_custom_bey(
        &self,
        blader_id: Option<&str>,
        name: &str,
        blade: &str,
        ratchet: &str,
        bit: &str,
        type_class: &str,
        color: Option<&str>,
        stats: &str,
    ) -> Result<CustomBey> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO custom_beys (id, blader_id, name, blade, ratchet, bit, type_class, color, stats, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            rusqlite::params![id, blader_id, name, blade, ratchet, bit, type_class, color, stats, created_at],
        )?;

        let owner_name = if let Some(bid) = blader_id {
            self.conn.query_row(
                "SELECT name FROM bladers WHERE id=?1",
                rusqlite::params![bid],
                |row| row.get(0),
            ).unwrap_or_else(|_| "Unknown".to_string())
        } else {
            "Admin".to_string()
        };
        let msg_it = format!("{} ha creato il Beyblade custom '{}' ({}-{}{})", owner_name, name, blade, ratchet, bit);
        let msg_en = format!("{} created custom Beyblade '{}' ({}-{}{})", owner_name, name, blade, ratchet, bit);
        let _ = self.log_activity("beyblade", &msg_it, &msg_en);

        Ok(CustomBey {
            id,
            blader_id: blader_id.map(|s| s.to_string()),
            name: name.to_string(),
            blade: blade.to_string(),
            ratchet: ratchet.to_string(),
            bit: bit.to_string(),
            type_class: type_class.to_string(),
            color: color.map(|s| s.to_string()),
            stats: stats.to_string(),
            created_at,
        })
    }

    pub fn delete_custom_bey(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM custom_beys WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }

    pub fn get_custom_arenas(&self) -> Result<Vec<CustomArena>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, max_players, has_xtreme_line, tags, color, created_at FROM custom_arenas ORDER BY created_at DESC"
        )?;
        let arenas = stmt.query_map([], |row| {
            let tags_str: String = row.get(5)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(CustomArena {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                max_players: row.get(3)?,
                has_xtreme_line: row.get::<_, i32>(4)? != 0,
                tags,
                color: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(arenas)
    }

    pub fn create_custom_arena(
        &self,
        name: &str,
        description: &str,
        max_players: i32,
        has_xtreme_line: bool,
        tags: &[String],
        color: &str,
    ) -> Result<CustomArena> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        let tags_str = serde_json::to_string(tags).unwrap_or_default();
        let has_xtreme_line_int = if has_xtreme_line { 1 } else { 0 };
        
        self.conn.execute(
            "INSERT INTO custom_arenas (id, name, description, max_players, has_xtreme_line, tags, color, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![id, name, description, max_players, has_xtreme_line_int, tags_str, color, created_at],
        )?;
        
        let msg_it = format!("Creata nuova arena personalizzata '{}'", name);
        let msg_en = format!("Created new custom arena '{}'", name);
        let _ = self.log_activity("arena", &msg_it, &msg_en);

        Ok(CustomArena {
            id,
            name: name.to_string(),
            description: description.to_string(),
            max_players,
            has_xtreme_line,
            tags: tags.to_vec(),
            color: color.to_string(),
            created_at,
        })
    }

    pub fn delete_custom_arena(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM custom_arenas WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }

    // ─── Versus Battles ──────────────────────────────────────────────────────

    pub fn record_versus_battle(&self, blader1_id: &str, blader2_id: &str, winner_id: &str, rounds: Vec<BattleRound>) -> Result<()> {
        let b1_name: String = self.conn.query_row(
            "SELECT name FROM bladers WHERE id=?1",
            rusqlite::params![blader1_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());
        
        let b2_name: String = self.conn.query_row(
            "SELECT name FROM bladers WHERE id=?1",
            rusqlite::params![blader2_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());

        let mut blader1_points = 0;
        let mut blader2_points = 0;
        for r in &rounds {
            blader1_points += r.b1_points;
            blader2_points += r.b2_points;
        }

        let record = BattleRecord {
            id: uuid::Uuid::new_v4().to_string(),
            battle_type: "versus".to_string(),
            associated_id: None,
            associated_name: None,
            blader1_id: blader1_id.to_string(),
            blader1_name: b1_name,
            blader2_id: blader2_id.to_string(),
            blader2_name: b2_name,
            winner_id: Some(winner_id.to_string()),
            blader1_points,
            blader2_points,
            rounds,
            created_at: Utc::now().to_rfc3339(),
        };

        self.record_battle(&record)
    }

    pub fn record_battle(&self, record: &BattleRecord) -> Result<()> {
        let rounds_str = serde_json::to_string(&record.rounds).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "INSERT INTO battle_history (id, battle_type, associated_id, associated_name, blader1_id, blader1_name, blader2_id, blader2_name, winner_id, blader1_points, blader2_points, rounds, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                record.id,
                record.battle_type,
                record.associated_id,
                record.associated_name,
                record.blader1_id,
                record.blader1_name,
                record.blader2_id,
                record.blader2_name,
                record.winner_id,
                record.blader1_points,
                record.blader2_points,
                rounds_str,
                record.created_at,
            ],
        )?;

        if record.battle_type == "versus" || record.battle_type == "challenge" {
            if let Some(ref w_id) = record.winner_id {
                let loser_id = if w_id == &record.blader1_id { &record.blader2_id } else { &record.blader1_id };
                let winner_pts = if w_id == &record.blader1_id { record.blader1_points } else { record.blader2_points };

                self.conn.execute(
                    "UPDATE bladers SET wins=wins+1, points_total=points_total+?1 WHERE id=?2",
                    rusqlite::params![winner_pts, w_id],
                )?;
                self.conn.execute(
                    "UPDATE bladers SET losses=losses+1 WHERE id=?1",
                    rusqlite::params![loser_id],
                )?;

                let activity_type = if record.battle_type == "challenge" { "challenge" } else { "versus" };
                let msg_it = format!("Sfida {}: {} ha sconfitto {} (+{} pt)", if record.battle_type == "challenge" { "Lobby" } else { "Versus" }, record.blader1_name, record.blader2_name, winner_pts);
                let msg_en = format!("{} Battle: {} defeated {} (+{} pts)", if record.battle_type == "challenge" { "Lobby" } else { "Versus" }, record.blader1_name, record.blader2_name, winner_pts);
                let _ = self.log_activity(activity_type, &msg_it, &msg_en);
            }
        }
        Ok(())
    }

    pub fn get_battle_history_for_blader(&self, blader_id: &str) -> Result<Vec<BattleRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, battle_type, associated_id, associated_name, blader1_id, blader1_name, blader2_id, blader2_name, winner_id, blader1_points, blader2_points, rounds, created_at FROM battle_history WHERE blader1_id=?1 OR blader2_id=?1 ORDER BY datetime(created_at) DESC"
        )?;
        let history = stmt.query_map(rusqlite::params![blader_id], |row| {
            let rounds_str: String = row.get(11)?;
            let rounds: Vec<BattleRound> = serde_json::from_str(&rounds_str).unwrap_or_default();
            Ok(BattleRecord {
                id: row.get(0)?,
                battle_type: row.get(1)?,
                associated_id: row.get(2)?,
                associated_name: row.get(3)?,
                blader1_id: row.get(4)?,
                blader1_name: row.get(5)?,
                blader2_id: row.get(6)?,
                blader2_name: row.get(7)?,
                winner_id: row.get(8)?,
                blader1_points: row.get(9)?,
                blader2_points: row.get(10)?,
                rounds,
                created_at: row.get(12)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(history)
    }

    // ─── Tournaments ─────────────────────────────────────────────────────────

    pub fn get_tournaments(&self) -> Result<Vec<Tournament>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, format, arena, point_threshold, join_code, status, blader_ids, created_at FROM tournaments ORDER BY created_at DESC"
        )?;
        let tournaments = stmt.query_map([], |row| {
            let blader_ids_str: String = row.get(7)?;
            let blader_ids: Vec<String> = serde_json::from_str(&blader_ids_str).unwrap_or_default();
            Ok(Tournament {
                id: row.get(0)?,
                name: row.get(1)?,
                format: row.get(2)?,
                arena: row.get(3)?,
                point_threshold: row.get(4)?,
                join_code: row.get(5)?,
                status: row.get(6)?,
                blader_ids,
                created_at: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(tournaments)
    }

    pub fn get_tournament(&self, id: &str) -> Result<Option<Tournament>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, format, arena, point_threshold, join_code, status, blader_ids, created_at FROM tournaments WHERE id=?1"
        )?;
        let result = stmt.query_row(rusqlite::params![id], |row| {
            let blader_ids_str: String = row.get(7)?;
            let blader_ids: Vec<String> = serde_json::from_str(&blader_ids_str).unwrap_or_default();
            Ok(Tournament {
                id: row.get(0)?,
                name: row.get(1)?,
                format: row.get(2)?,
                arena: row.get(3)?,
                point_threshold: row.get(4)?,
                join_code: row.get(5)?,
                status: row.get(6)?,
                blader_ids,
                created_at: row.get(8)?,
            })
        }).ok();
        Ok(result)
    }

    pub fn create_tournament(
        &self, name: &str, format: &str, arena: &str,
        point_threshold: i32, join_code: &str, blader_ids: &[String]
    ) -> Result<Tournament> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        let blader_ids_str = serde_json::to_string(blader_ids).unwrap_or_default();
        self.conn.execute(
            "INSERT INTO tournaments (id, name, format, arena, point_threshold, join_code, status, blader_ids, created_at) VALUES (?1,?2,?3,?4,?5,?6,'lobby',?7,?8)",
            rusqlite::params![id, name, format, arena, point_threshold, join_code, blader_ids_str, created_at],
        )?;
        // Generate bracket matches
        self.generate_bracket(&id, blader_ids, format)?;

        let msg_it = format!("Creato nuovo torneo '{}'", name);
        let msg_en = format!("Created new tournament '{}'", name);
        let _ = self.log_activity("tournament", &msg_it, &msg_en);

        Ok(Tournament {
            id,
            name: name.to_string(),
            format: format.to_string(),
            arena: arena.to_string(),
            point_threshold,
            join_code: join_code.to_string(),
            status: "lobby".to_string(),
            blader_ids: blader_ids.to_vec(),
            created_at,
        })
    }

    pub fn delete_tournament(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM matches WHERE tournament_id=?1", rusqlite::params![id])?;
        self.conn.execute("DELETE FROM tournaments WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }

    pub fn update_tournament(&self, id: &str, name: &str, arena: &str, point_threshold: i32, format: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE tournaments SET name=?1, arena=?2, point_threshold=?3, format=?4 WHERE id=?5",
            rusqlite::params![name, arena, point_threshold, format, id],
        )?;
        Ok(())
    }

    pub fn reset_tournament(&self, id: &str) -> Result<()> {
        // Delete existing matches
        self.conn.execute("DELETE FROM matches WHERE tournament_id=?1", rusqlite::params![id])?;

        // Reset status to lobby
        self.conn.execute("UPDATE tournaments SET status='lobby' WHERE id=?1", rusqlite::params![id])?;

        // Regenerate brackets
        if let Ok(Some(t)) = self.get_tournament(id) {
            self.generate_bracket(id, &t.blader_ids, &t.format)?;
        }
        Ok(())
    }

    fn generate_bracket(&self, tournament_id: &str, blader_ids: &[String], _format: &str) -> Result<()> {
        // Single elimination bracket generation
        let mut participants: Vec<String> = blader_ids.to_vec();
        // Shuffle for random seeding
        use rand::seq::SliceRandom;
        let mut rng = rand::thread_rng();
        participants.shuffle(&mut rng);

        // Pad to next power of 2
        let n = participants.len();
        let next_pow2 = n.next_power_of_two();
        let byes = next_pow2 - n;

        let round = 1;
        let created_at = Utc::now().to_rfc3339();

        let mut i = 0;
        let mut bye_count = 0;
        while i < participants.len() {
            let match_id = uuid::Uuid::new_v4().to_string();
            if bye_count < byes {
                // BYE match: blader auto-advances, mark as done immediately with winner set
                let b1 = &participants[i];
                let bye_id = format!("BYE_{}", i);
                self.conn.execute(
                    "INSERT INTO matches (id, tournament_id, round, blader1_id, blader2_id, winner_id, blader1_points, blader2_points, finish_type, status, created_at) VALUES (?1,?2,?3,?4,?5,?4,0,0,'bye','done',?6)",
                    rusqlite::params![match_id, tournament_id, round, b1, bye_id, created_at],
                )?;
                bye_count += 1;
                i += 1;
            } else if i + 1 < participants.len() {
                let b1 = &participants[i];
                let b2 = &participants[i + 1];
                self.conn.execute(
                    "INSERT INTO matches (id, tournament_id, round, blader1_id, blader2_id, status, created_at) VALUES (?1,?2,?3,?4,?5,'pending',?6)",
                    rusqlite::params![match_id, tournament_id, round, b1, b2, created_at],
                )?;
                i += 2;
            } else {
                break;
            }
        }
        Ok(())
    }

    pub fn add_match_result(
        &self, match_id: &str, winner_id: &str,
        b1_points: i32, b2_points: i32, finish_type: &str,
        bey1: Option<&str>, bey2: Option<&str>,
        rounds: Vec<BattleRound>
    ) -> Result<()> {
        // 1. Save the result
        self.conn.execute(
            "UPDATE matches SET winner_id=?1, blader1_points=?2, blader2_points=?3, finish_type=?4, bey1=?5, bey2=?6, status='done' WHERE id=?7",
            rusqlite::params![winner_id, b1_points, b2_points, finish_type, bey1, bey2, match_id],
        )?;

        // 2. Update blader stats
        let (tournament_id, current_round, blader1_id, blader2_id): (String, i32, String, String) = self.conn.query_row(
            "SELECT tournament_id, round, blader1_id, blader2_id FROM matches WHERE id=?1",
            rusqlite::params![match_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        let winner_points = if winner_id == blader1_id { b1_points } else { b2_points };
        let loser_id = if winner_id == blader1_id { &blader2_id } else { &blader1_id };
        self.conn.execute(
            "UPDATE bladers SET wins=wins+1, points_total=points_total+?1 WHERE id=?2",
            rusqlite::params![winner_points, winner_id],
        )?;
        self.conn.execute(
            "UPDATE bladers SET losses=losses+1 WHERE id=?1",
            rusqlite::params![loser_id],
        )?;

        // 3. Set tournament to active if still in lobby
        self.conn.execute(
            "UPDATE tournaments SET status='active' WHERE id=?1 AND status='lobby'",
            rusqlite::params![tournament_id],
        )?;

        // Log tournament match activity!
        let tournament_name: String = self.conn.query_row(
            "SELECT name FROM tournaments WHERE id=?1",
            rusqlite::params![tournament_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());
        
        let winner_name: String = self.conn.query_row(
            "SELECT name FROM bladers WHERE id=?1",
            rusqlite::params![winner_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());
        
        let loser_name: String = self.conn.query_row(
            "SELECT name FROM bladers WHERE id=?1",
            rusqlite::params![loser_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());

        let b1_name: String = self.conn.query_row(
            "SELECT name FROM bladers WHERE id=?1",
            rusqlite::params![&blader1_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());

        let b2_name: String = self.conn.query_row(
            "SELECT name FROM bladers WHERE id=?1",
            rusqlite::params![&blader2_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());

        if finish_type != "bye" {
            let record = BattleRecord {
                id: match_id.to_string(),
                battle_type: "tournament".to_string(),
                associated_id: Some(tournament_id.clone()),
                associated_name: Some(tournament_name.clone()),
                blader1_id: blader1_id.clone(),
                blader1_name: b1_name,
                blader2_id: blader2_id.clone(),
                blader2_name: b2_name,
                winner_id: Some(winner_id.to_string()),
                blader1_points: b1_points,
                blader2_points: b2_points,
                rounds,
                created_at: Utc::now().to_rfc3339(),
            };
            let _ = self.record_battle(&record);
        }

        let msg_it = format!("Torneo '{}': {} ha sconfitto {} nel Round {}", tournament_name, winner_name, loser_name, current_round);
        let msg_en = format!("Tournament '{}': {} defeated {} in Round {}", tournament_name, winner_name, loser_name, current_round);
        let _ = self.log_activity("tournament", &msg_it, &msg_en);

        // 4. Check if all matches in current round are done
        let pending_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM matches WHERE tournament_id=?1 AND round=?2 AND status != 'done'",
            rusqlite::params![tournament_id, current_round],
            |row| row.get(0),
        )?;

        if pending_count > 0 {
            return Ok(()); // Still matches to play in this round
        }

        // 5. Collect winners of current round (skip BYE matches — their blader1 auto-advances)
        let mut stmt = self.conn.prepare(
            "SELECT winner_id, blader2_id FROM matches WHERE tournament_id=?1 AND round=?2 ORDER BY id"
        )?;
        let winners: Vec<String> = stmt.query_map(rusqlite::params![tournament_id, current_round], |row| {
            let winner_id: Option<String> = row.get(0)?;
            let blader2_id: String = row.get(1)?;
            // If this was a BYE match, blader1 auto-advances (winner_id holds it)
            Ok(winner_id.unwrap_or(blader2_id))
        })?
        .filter_map(|r| r.ok())
        .collect();

        // 6. If only 1 winner remains → tournament complete
        if winners.len() <= 1 {
            self.conn.execute(
                "UPDATE tournaments SET status='completed' WHERE id=?1",
                rusqlite::params![tournament_id],
            )?;

            // Log tournament completion!
            let tournament_name: String = self.conn.query_row(
                "SELECT name FROM tournaments WHERE id=?1",
                rusqlite::params![tournament_id],
                |row| row.get(0),
            ).unwrap_or_else(|_| "Unknown".to_string());

            let final_winner_name: String = if let Some(wid) = winners.first() {
                self.conn.query_row(
                    "SELECT name FROM bladers WHERE id=?1",
                    rusqlite::params![wid],
                    |row| row.get(0),
                ).unwrap_or_else(|_| "Unknown".to_string())
            } else {
                "Unknown".to_string()
            };

            let msg_it = format!("Torneo '{}' concluso! Vincitore: {}", tournament_name, final_winner_name);
            let msg_en = format!("Tournament '{}' completed! Winner: {}", tournament_name, final_winner_name);
            let _ = self.log_activity("tournament", &msg_it, &msg_en);

            return Ok(());
        }

        // 7. Generate next round matches
        let next_round = current_round + 1;
        let created_at = chrono::Utc::now().to_rfc3339();
        let mut i = 0;
        while i < winners.len() {
            let b1 = &winners[i];
            if i + 1 < winners.len() {
                let b2 = &winners[i + 1];
                let match_id = uuid::Uuid::new_v4().to_string();
                self.conn.execute(
                    "INSERT INTO matches (id, tournament_id, round, blader1_id, blader2_id, status, created_at) VALUES (?1,?2,?3,?4,?5,'pending',?6)",
                    rusqlite::params![match_id, tournament_id, next_round, b1, b2, created_at],
                )?;
                i += 2;
            } else {
                // Odd player out — gets a bye in next round
                let bye_id = format!("BYE_{}", i);
                let match_id = uuid::Uuid::new_v4().to_string();
                self.conn.execute(
                    "INSERT INTO matches (id, tournament_id, round, blader1_id, blader2_id, winner_id, blader1_points, blader2_points, status, created_at) VALUES (?1,?2,?3,?4,?5,?4,0,0,'done',?6)",
                    rusqlite::params![match_id, tournament_id, next_round, b1, bye_id, created_at],
                )?;
                i += 1;
            }
        }

        Ok(())
    }

    pub fn get_matches_for_tournament(&self, tournament_id: &str) -> Result<Vec<Match>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, tournament_id, round, blader1_id, blader2_id, winner_id, blader1_points, blader2_points, finish_type, bey1, bey2, status, created_at FROM matches WHERE tournament_id=?1 ORDER BY round, id"
        )?;
        let matches = stmt.query_map(rusqlite::params![tournament_id], |row| {
            Ok(Match {
                id: row.get(0)?,
                tournament_id: row.get(1)?,
                round: row.get(2)?,
                blader1_id: row.get(3)?,
                blader2_id: row.get(4)?,
                winner_id: row.get(5)?,
                blader1_points: row.get(6)?,
                blader2_points: row.get(7)?,
                finish_type: row.get(8)?,
                bey1: row.get(9)?,
                bey2: row.get(10)?,
                status: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(matches)
    }

    pub fn log_activity(&self, event_type: &str, message_it: &str, message_en: &str) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO activity_log (id, event_type, message_it, message_en, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, event_type, message_it, message_en, created_at],
        )?;
        Ok(())
    }

    pub fn get_activities(&self) -> Result<Vec<ActivityLog>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, event_type, message_it, message_en, created_at FROM activity_log ORDER BY datetime(created_at) DESC LIMIT 200"
        )?;
        let logs = stmt.query_map([], |row| {
            Ok(ActivityLog {
                id: row.get(0)?,
                event_type: row.get(1)?,
                message_it: row.get(2)?,
                message_en: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(logs)
    }

    // ─── Parts ───────────────────────────────────────────────────────────────

    pub fn get_parts(&self, type_filter: Option<&str>, series_filter: Option<&str>, brand_filter: Option<&str>) -> Result<Vec<Part>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, part_type, name, serial, pack, brand, series, color, image_url, protrusions, height, created_at FROM parts ORDER BY part_type, series, name"
        )?;
        let all: Vec<Part> = stmt.query_map([], |row| {
            Ok(Part {
                id: row.get(0)?,
                part_type: row.get(1)?,
                name: row.get(2)?,
                serial: row.get(3)?,
                pack: row.get(4)?,
                brand: row.get(5)?,
                series: row.get(6)?,
                color: row.get(7)?,
                image_url: row.get(8)?,
                protrusions: row.get(9)?,
                height: row.get(10)?,
                created_at: row.get(11)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

        let filtered = all.into_iter()
            .filter(|p| type_filter.map_or(true, |t| p.part_type == t))
            .filter(|p| series_filter.map_or(true, |s| p.series == s))
            .filter(|p| brand_filter.map_or(true, |b| p.brand == b))
            .collect();
        Ok(filtered)
    }

    pub fn get_part(&self, id: &str) -> Result<Option<Part>> {
        let result = self.conn.query_row(
            "SELECT id, part_type, name, serial, pack, brand, series, color, image_url, protrusions, height, created_at FROM parts WHERE id=?1",
            rusqlite::params![id],
            |row| Ok(Part {
                id: row.get(0)?,
                part_type: row.get(1)?,
                name: row.get(2)?,
                serial: row.get(3)?,
                pack: row.get(4)?,
                brand: row.get(5)?,
                series: row.get(6)?,
                color: row.get(7)?,
                image_url: row.get(8)?,
                protrusions: row.get(9)?,
                height: row.get(10)?,
                created_at: row.get(11)?,
            }),
        ).ok();
        Ok(result)
    }

    pub fn create_part(
        &self, part_type: &str, name: &str, serial: &str, pack: &str,
        brand: &str, series: &str, color: Option<&str>, image_url: Option<&str>,
        protrusions: Option<i32>, height: Option<i32>,
    ) -> Result<Part> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO parts (id, part_type, name, serial, pack, brand, series, color, image_url, protrusions, height, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            rusqlite::params![id, part_type, name, serial, pack, brand, series, color, image_url, protrusions, height, created_at],
        )?;
        Ok(Part {
            id, part_type: part_type.to_string(), name: name.to_string(),
            serial: serial.to_string(), pack: pack.to_string(), brand: brand.to_string(),
            series: series.to_string(), color: color.map(|s| s.to_string()),
            image_url: image_url.map(|s| s.to_string()), protrusions, height, created_at,
        })
    }

    pub fn update_part(
        &self, id: &str, part_type: &str, name: &str, serial: &str, pack: &str,
        brand: &str, series: &str, color: Option<&str>, image_url: Option<&str>,
        protrusions: Option<i32>, height: Option<i32>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE parts SET part_type=?1, name=?2, serial=?3, pack=?4, brand=?5, series=?6, color=?7, image_url=?8, protrusions=?9, height=?10 WHERE id=?11",
            rusqlite::params![part_type, name, serial, pack, brand, series, color, image_url, protrusions, height, id],
        )?;
        Ok(())
    }

    pub fn delete_part(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM parts WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }
}

fn dirs_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let dir = std::path::Path::new(&home).join(".beyblade-x-app");
    std::fs::create_dir_all(&dir).ok();
    dir.join("data.db")
}
