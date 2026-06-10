// ─── Bey Types ─────────────────────────────────────────────────────────────

export type BeyType = 'attack' | 'defense' | 'stamina' | 'balance';

export interface Bey {
  id: string;
  name: string;
  fullName: string;       // e.g. "Dran Sword 4-60F"
  blade: string;
  ratchet: string;        // e.g. "4-60"
  bit: string;            // e.g. "F (Flat)"
  type: BeyType;
  color: string;          // hex color
  description: string;
  isCustom?: boolean;
}

export interface CustomBey {
  id: string;
  blader_id?: string;
  name: string;
  blade: string;
  ratchet: string;
  bit: string;
  blade_part_id?: string;
  ratchet_part_id?: string;
  bit_part_id?: string;
  assist_blade_part_id?: string;
  lock_chip_part_id?: string;
  over_blade_part_id?: string;
  type_class: string;
  color?: string;
  stats: string; // JSON string
  created_at: string;
}

export interface Part {
  id: string;
  part_type: string; // blade | ratchet | bit | assist_blade | lock_chip | over_blade
  name: string;
  serial: string;
  pack: string;
  brand: string;
  series: string;
  color?: string;
  image_url?: string;
  protrusions?: number;
  height?: number;
  created_at: string;
}

// ─── Finish Types ───────────────────────────────────────────────────────────

export type FinishType = 'spin' | 'over' | 'burst' | 'xtreme' | 'bye' | 'foul' | 'draw';

export const FINISH_POINTS: Record<FinishType, number> = {
  spin: 1,
  over: 2,
  burst: 2,
  xtreme: 3,
  bye: 0,
  foul: 0,
  draw: 0,
};

export const FINISH_LABELS: Record<FinishType, string> = {
  spin: 'Spin Finish',
  over: 'Over Finish',
  burst: 'Burst Finish',
  xtreme: 'Xtreme Finish',
  bye: 'Turno Libero',
  foul: 'Fallo',
  draw: 'Pareggio',
};

export const FINISH_COLORS: Record<FinishType, string> = {
  spin: 'var(--primary)',
  over: 'var(--secondary)',
  burst: 'var(--danger)',
  xtreme: 'var(--accent)',
  bye: 'var(--text-muted)',
  foul: '#ffaa00',
  draw: '#888888',
};

export interface BattleRound {
  round_num: number;
  round_type: 'finish' | 'draw' | 'foul';
  winner_id?: string;
  finish_type?: FinishType;
  foul_blader_id?: string;
  b1_points: number;
  b2_points: number;
  bey1?: string;
  bey2?: string;
}

export interface BattleRecord {
  id: string;
  battle_type: 'versus' | 'challenge' | 'tournament';
  associated_id?: string;
  associated_name?: string;
  blader1_id: string;
  blader1_name: string;
  blader2_id: string;
  blader2_name: string;
  winner_id?: string;
  blader1_points: number;
  blader2_points: number;
  rounds: BattleRound[];
  created_at: string;
}


// ─── Battle Modes ───────────────────────────────────────────────────────────

export type BattleMode = '1on1' | '3on3' | 'deck' | 'team';

export const BATTLE_MODE_LABELS: Record<BattleMode, string> = {
  '1on1': '1 vs 1',
  '3on3': '3 vs 3',
  'deck': 'Deck Battle',
  'team': 'Team Battle',
};

export const BATTLE_MODE_DESC: Record<BattleMode, string> = {
  '1on1': 'Ogni blader usa un solo Bey per tutta la sfida.',
  '3on3': 'Ogni blader porta 3 Bey. Vince chi ottiene 2 punti primo.',
  'deck': '3 Bey ciascuno. Selezione segreta simultanea ogni round.',
  'team': 'Team vs Team. Ogni membro sfida la sua controparte.',
};

// ─── Versus Modes ────────────────────────────────────────────────────────────

export type VersusMode = '1on1_single' | '1on1_bo3' | '3on3' | 'deck';

export interface VersusModeInfo {
  id: VersusMode;
  label: string;
  labelIt: string;
  desc: string;
  descIt: string;
  icon: string;
  rounds: number; // number of beys per player (1 or 3)
  bestOf: number; // best of X rounds (1 or 3)
}

export const VERSUS_MODES: VersusModeInfo[] = [
  {
    id: '1on1_single',
    label: '1v1 — Single Battle',
    labelIt: '1v1 — Sfida Singola',
    desc: 'One Bey each. One round. Quick and decisive.',
    descIt: 'Un Bey ciascuno. Un round. Veloce e decisivo.',
    icon: '⚔️',
    rounds: 1,
    bestOf: 1,
  },
  {
    id: '1on1_bo3',
    label: '1v1 — Best of 3',
    labelIt: '1v1 — Al Meglio di 3',
    desc: 'Same Bey, best of 3 rounds. First to 2 wins.',
    descIt: 'Stesso Bey, al meglio di 3 round. Primo a 2 vittorie.',
    icon: '🔁',
    rounds: 1,
    bestOf: 3,
  },
  {
    id: '3on3',
    label: '3v3 — Three-Bey Battle',
    labelIt: '3v3 — Tre Bey',
    desc: '3 Beys each. Best of 3. Switch Bey between rounds.',
    descIt: '3 Bey ciascuno. Cambia Bey tra i round. Chi vince 2 round vince.',
    icon: '🌀',
    rounds: 3,
    bestOf: 3,
  },
  {
    id: 'deck',
    label: 'Deck Battle',
    labelIt: 'Deck Battle',
    desc: '3 Beys each. Secret simultaneous selection each round.',
    descIt: '3 Bey ciascuno. Selezione segreta e simultanea ogni round.',
    icon: '🃏',
    rounds: 3,
    bestOf: 3,
  },
];

// ─── Arenas ─────────────────────────────────────────────────────────────────

export interface Arena {
  id: string;
  name: string;
  description: string;
  maxPlayers: number;
  hasXtremeLine: boolean;
  tags: string[];
  color: string;
}

// ─── Blader ─────────────────────────────────────────────────────────────────

export interface Blader {
  id: string;
  name: string;
  avatar_color: string;
  avatar_initials: string;
  avatar_image?: string;
  beys: string[];
  wins: number;
  losses: number;
  points_total: number;
  created_at: string;
  password?: string;
}

// ─── Tournament ─────────────────────────────────────────────────────────────

export type TournamentStatus = 'lobby' | 'active' | 'completed';

export interface Tournament {
  id: string;
  name: string;
  format: BattleMode;
  arena: string;
  point_threshold: number;
  join_code: string;
  status: TournamentStatus;
  blader_ids: string[];
  created_at: string;
}

// ─── Match ───────────────────────────────────────────────────────────────────

export type MatchStatus = 'pending' | 'active' | 'done';

export interface Match {
  id: string;
  tournament_id: string;
  round: number;
  blader1_id: string;
  blader2_id: string;
  winner_id?: string;
  blader1_points: number;
  blader2_points: number;
  finish_type?: FinishType;
  bey1?: string;
  bey2?: string;
  status: MatchStatus;
  created_at: string;
}

// ─── Tournament Detail ───────────────────────────────────────────────────────

export interface TournamentDetail {
  tournament: Tournament;
  bladers: Blader[];
  matches: Match[];
}

// ─── UI ─────────────────────────────────────────────────────────────────────

export type Lang = 'it' | 'en';

export interface AppSettings {
  lang: Lang;
  serverPort: number;
}

// ─── Translations ────────────────────────────────────────────────────────────

export const t: Record<Lang, Record<string, string>> = {
  it: {
    home: 'Home',
    bladers: 'Blader',
    beys: 'Beyblade',
    arenas: 'Arene',
    tournaments: 'Tornei',
    versus: 'Versus',
    settings: 'Impostazioni',
    createTournament: 'Nuovo Torneo',
    new_blader: 'Nuovo Blader',
    name: 'Nome',
    type: 'Tipo',
    wins: 'Vittorie',
    losses: 'Sconfitte',
    points: 'Punti',
    format: 'Formato',
    arena: 'Arena',
    status: 'Stato',
    join_code: 'Codice Join',
    created: 'Creato',
    attack: 'Attacco',
    defense: 'Difesa',
    stamina: 'Resistenza',
    balance: 'Bilanciato',
    save: 'Salva',
    cancel: 'Annulla',
    delete: 'Elimina',
    edit: 'Modifica',
    start: 'Inizia',
    finish: 'Fine',
    result: 'Risultato',
    winner: 'Vincitore',
    round: 'Round',
    bracket: 'Tabellone',
    standings: 'Classifica',
    active: 'Attivo',
    lobby: 'Lobby',
    completed: 'Completato',
    no_bladers: 'Nessun blader trovato',
    no_tournaments: 'Nessun torneo trovato',
    scan_qr: 'Scansiona il QR o inserisci il codice',
    point_threshold: 'Soglia Punti',
    participants: 'Partecipanti',
    select_bladers: 'Seleziona Blader',
    connect_mobile: 'Connetti Dispositivi',
    share_url: 'URL per i giocatori',
    officina: 'Officina',
  },
  en: {
    home: 'Home',
    bladers: 'Bladers',
    beys: 'Beyblades',
    arenas: 'Arenas',
    tournaments: 'Tournaments',
    versus: 'Versus',
    settings: 'Settings',
    createTournament: 'New Tournament',
    new_blader: 'New Blader',
    name: 'Name',
    type: 'Type',
    wins: 'Wins',
    losses: 'Losses',
    points: 'Points',
    format: 'Format',
    arena: 'Arena',
    status: 'Status',
    join_code: 'Join Code',
    created: 'Created',
    attack: 'Attack',
    defense: 'Defense',
    stamina: 'Stamina',
    balance: 'Balance',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    start: 'Start',
    finish: 'Finish',
    result: 'Result',
    winner: 'Winner',
    round: 'Round',
    bracket: 'Bracket',
    standings: 'Standings',
    active: 'Active',
    lobby: 'Lobby',
    completed: 'Completed',
    no_bladers: 'No bladers found',
    no_tournaments: 'No tournaments found',
    scan_qr: 'Scan QR or enter code',
    point_threshold: 'Point Threshold',
    participants: 'Participants',
    select_bladers: 'Select Bladers',
    connect_mobile: 'Connect Devices',
    share_url: 'Player URL',
    officina: 'Workshop',
  }
};
