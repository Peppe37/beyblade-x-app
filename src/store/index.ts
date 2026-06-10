import { api } from '../services/api';
import { create } from 'zustand';
import { Blader, Tournament, TournamentDetail, Lang, CustomBey, Arena } from '../types';

// ─── Settings Store ──────────────────────────────────────────────────────────

interface SettingsStore {
  lang: Lang;
  localIp: string;
  setLang: (lang: Lang) => void;
  fetchLocalIp: () => Promise<void>;
}

export const useSettings = create<SettingsStore>((set) => ({
  lang: (localStorage.getItem('lang') as Lang) || 'it',
  localIp: '',
  setLang: (lang) => {
    localStorage.setItem('lang', lang);
    set({ lang });
  },
  fetchLocalIp: async () => {
    try {
      const ip = await api.getLocalIp();
      set({ localIp: ip });
    } catch {
      set({ localIp: '127.0.0.1' });
    }
  },
}));

// ─── Bladers Store ───────────────────────────────────────────────────────────

interface BladersStore {
  bladers: Blader[];
  customBeys: CustomBey[];
  loading: boolean;
  fetchBladers: () => Promise<void>;
  fetchCustomBeys: () => Promise<void>;
  createBlader: (name: string, color: string, image?: string, password?: string) => Promise<Blader>;
  updateBlader: (id: string, name: string, color: string, image?: string, beys?: string[], password?: string) => Promise<void>;
  deleteBlader: (id: string) => Promise<void>;
  createCustomBey: (args: any) => Promise<void>;
  deleteCustomBey: (id: string) => Promise<void>;
}

export const useBladers = create<BladersStore>((set, get) => ({
  bladers: [],
  customBeys: [],
  loading: false,
  fetchBladers: async () => {
    set({ loading: true });
    try {
      const bladers = await api.getBladers();
      set({ bladers, loading: false });
    } catch (e) {
      console.error('fetchBladers error:', e);
      set({ loading: false });
    }
  },
  fetchCustomBeys: async () => {
    try {
      const customBeys = await api.getCustomBeys();
      set({ customBeys });
    } catch (e) {
      console.error('fetchCustomBeys error:', e);
    }
  },
  createBlader: async (name, color, image, password) => {
    const blader = await api.createBlader(name, color, image, password);
    set((s) => ({ bladers: [...s.bladers, blader] }));
    return blader;
  },
  updateBlader: async (id, name, color, image, beys = [], password) => {
    await api.updateBlader(id, name, color, image, beys, password);
    await get().fetchBladers();
  },
  deleteBlader: async (id) => {
    await api.deleteBlader(id);
    set((s) => ({ bladers: s.bladers.filter((b) => b.id !== id) }));
  },
  createCustomBey: async (args) => {
    await api.createCustomBey(args);
    await get().fetchCustomBeys();
  },
  deleteCustomBey: async (id) => {
    await api.deleteCustomBey(id);
    await get().fetchCustomBeys();
  },
}));

// ─── Tournaments Store ───────────────────────────────────────────────────────

interface TournamentsStore {
  tournaments: Tournament[];
  currentDetail: TournamentDetail | null;
  loading: boolean;
  fetchTournaments: () => Promise<void>;
  createTournament: (args: {
    name: string;
    format: string;
    arena: string;
    point_threshold: number;
    blader_ids: string[];
  }) => Promise<Tournament>;
  fetchTournamentDetail: (id: string) => Promise<void>;
  updateTournament: (id: string, name: string, arena: string, point_threshold: number, format: string) => Promise<void>;
  deleteTournament: (id: string) => Promise<void>;
  resetTournament: (id: string) => Promise<void>;
  addMatchResult: (args: {
    match_id: string;
    winner_id: string;
    blader1_points: number;
    blader2_points: number;
    finish_type: string;
    bey1?: string;
    bey2?: string;
    rounds?: any[];
  }) => Promise<void>;
}

export const useTournaments = create<TournamentsStore>((set, get) => ({
  tournaments: [],
  currentDetail: null,
  loading: false,
  fetchTournaments: async () => {
    set({ loading: true });
    try {
      const tournaments = await api.getTournaments();
      set({ tournaments, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  createTournament: async (args) => {
    const tournament = await api.createTournament(args);
    set((s) => ({ tournaments: [tournament, ...s.tournaments] }));
    return tournament;
  },
  fetchTournamentDetail: async (id) => {
    set({ loading: true });
    try {
      const detail = await api.getTournament(id);
      set({ currentDetail: detail, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  addMatchResult: async (args) => {
    await api.addMatchResult(args);
    // Refresh the current detail
    const detail = get().currentDetail;
    if (detail) {
      await get().fetchTournamentDetail(detail.tournament.id);
    }
  },
  updateTournament: async (id, name, arena, point_threshold, format) => {
    await api.updateTournament({ id, name, arena, point_threshold, format });
    await get().fetchTournamentDetail(id);
    await get().fetchTournaments();
  },
  deleteTournament: async (id) => {
    await api.deleteTournament(id);
    set((s) => ({ tournaments: s.tournaments.filter(t => t.id !== id), currentDetail: null }));
  },
  resetTournament: async (id) => {
    await api.resetTournament(id);
    await get().fetchTournamentDetail(id);
  },
}));

// ─── Toast Store ─────────────────────────────────────────────────────────────

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// ─── Arenas Store ─────────────────────────────────────────────────────────────

interface ArenasStore {
  customArenas: Arena[];
  loading: boolean;
  fetchCustomArenas: () => Promise<void>;
  createCustomArena: (name: string, description: string, maxPlayers: number, hasXtremeLine: boolean, tags: string[], color: string) => Promise<Arena>;
  deleteCustomArena: (id: string) => Promise<void>;
}

export const useArenas = create<ArenasStore>((set) => ({
  customArenas: [],
  loading: false,
  fetchCustomArenas: async () => {
    set({ loading: true });
    try {
      const customArenas = await api.getCustomArenas();
      set({ customArenas, loading: false });
    } catch (e) {
      console.error('fetchCustomArenas error:', e);
      set({ loading: false });
    }
  },
  createCustomArena: async (name, description, maxPlayers, hasXtremeLine, tags, color) => {
    const arena = await api.createCustomArena({
      name, description, maxPlayers, hasXtremeLine, tags, color
    });
    set((s) => ({ customArenas: [...s.customArenas, arena] }));
    return arena;
  },
  deleteCustomArena: async (id) => {
    await api.deleteCustomArena(id);
    set((s) => ({ customArenas: s.customArenas.filter((a) => a.id !== id) }));
  },
}));
