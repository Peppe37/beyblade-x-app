import { invoke } from '@tauri-apps/api/core';
import { Blader, Tournament, TournamentDetail, Arena, CustomBey, BattleRecord } from '../types';

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
};

export const getBackendMode = (): 'local' | 'remote' => {
  return 'remote';
};

export const getRemoteUrl = (): string => {
  if (!isTauri()) {
    return window.location.origin;
  }
  return localStorage.getItem('remote_backend_url') || 'http://127.0.0.1:7878';
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getRemoteUrl();
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errMsg = `Request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.error) {
        errMsg = errJson.error;
      }
    } catch {
      // Ignore
    }
    throw new Error(errMsg);
  }

  // Some endpoints return empty 200 OK responses
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as unknown as T);
}

export const api = {
  getActivities: async (): Promise<any[]> => {
    if (getBackendMode() === 'local') {
      return invoke<any[]>('get_activities');
    }
    return request<any[]>('/api/activities');
  },

  getLocalIp: async (): Promise<string> => {
    if (getBackendMode() === 'local') {
      return invoke<string>('get_local_ip');
    }
    // In remote mode, we return the host part of the remote URL
    try {
      const url = new URL(getRemoteUrl());
      return url.hostname;
    } catch {
      return '127.0.0.1';
    }
  },

  getBladers: async (): Promise<Blader[]> => {
    if (getBackendMode() === 'local') {
      return invoke<Blader[]>('get_bladers');
    }
    return request<Blader[]>('/api/bladers');
  },

  createBlader: async (name: string, color: string, image?: string, password?: string): Promise<Blader> => {
    if (getBackendMode() === 'local') {
      return invoke<Blader>('create_blader', {
        name,
        avatarColor: color,
        avatarImage: image ?? null,
        password: password ?? null,
      });
    }
    return request<Blader>('/api/bladers', {
      method: 'POST',
      body: JSON.stringify({
        name,
        avatarColor: color,
        avatarImage: image ?? null,
        password: password ?? null,
      }),
    });
  },

  updateBlader: async (id: string, name: string, color: string, image?: string, beys: string[] = [], password?: string): Promise<void> => {
    if (getBackendMode() === 'local') {
      return invoke<void>('update_blader', {
        id,
        name,
        avatarColor: color,
        avatarImage: image ?? null,
        beys,
        password: password ?? null,
      });
    }
    return request<void>(`/api/bladers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name,
        avatarColor: color,
        avatarImage: image ?? null,
        beys,
        password: password ?? null,
      }),
    });
  },

  deleteBlader: async (id: string): Promise<void> => {
    if (getBackendMode() === 'local') {
      return invoke<void>('delete_blader', { id });
    }
    return request<void>(`/api/bladers/${id}`, {
      method: 'DELETE',
    });
  },

  getCustomBeys: async (): Promise<CustomBey[]> => {
    if (getBackendMode() === 'local') {
      return invoke<CustomBey[]>('get_custom_beys');
    }
    return request<CustomBey[]>('/api/custom-beys');
  },

  createCustomBey: async (args: {
    blader_id?: string;
    name: string;
    blade: string;
    ratchet: string;
    bit: string;
    type_class: string;
    color?: string;
    stats: string;
  }): Promise<CustomBey> => {
    if (getBackendMode() === 'local') {
      return invoke<CustomBey>('create_custom_bey', { args });
    }
    return request<CustomBey>('/api/custom-beys', {
      method: 'POST',
      body: JSON.stringify(args),
    });
  },

  deleteCustomBey: async (id: string): Promise<void> => {
    if (getBackendMode() === 'local') {
      return invoke<void>('delete_custom_bey', { id });
    }
    return request<void>(`/api/custom-beys/${id}`, {
      method: 'DELETE',
    });
  },

  getTournaments: async (): Promise<Tournament[]> => {
    if (getBackendMode() === 'local') {
      return invoke<Tournament[]>('get_tournaments');
    }
    return request<Tournament[]>('/api/tournaments');
  },

  createTournament: async (args: {
    name: string;
    format: string;
    arena: string;
    point_threshold: number;
    blader_ids: string[];
  }): Promise<Tournament> => {
    if (getBackendMode() === 'local') {
      return invoke<Tournament>('create_tournament', { args });
    }
    return request<Tournament>('/api/tournaments', {
      method: 'POST',
      body: JSON.stringify({ args }),
    });
  },

  getTournament: async (id: string): Promise<TournamentDetail> => {
    if (getBackendMode() === 'local') {
      return invoke<TournamentDetail>('get_tournament', { id });
    }
    return request<TournamentDetail>(`/api/tournaments/${id}`);
  },

  updateTournament: async (args: {
    id: string;
    name: string;
    arena: string;
    point_threshold: number;
    format: string;
  }): Promise<void> => {
    if (getBackendMode() === 'local') {
      return invoke<void>('update_tournament', { args });
    }
    return request<void>(`/api/tournaments/${args.id}`, {
      method: 'PUT',
      body: JSON.stringify({ args }),
    });
  },

  deleteTournament: async (id: string): Promise<void> => {
    if (getBackendMode() === 'local') {
      return invoke<void>('delete_tournament', { id });
    }
    return request<void>(`/api/tournaments/${id}`, {
      method: 'DELETE',
    });
  },

  resetTournament: async (id: string): Promise<void> => {
    if (getBackendMode() === 'local') {
      return invoke<void>('reset_tournament', { id });
    }
    return request<void>(`/api/tournaments/${id}/reset`, {
      method: 'POST',
    });
  },

  addMatchResult: async (args: {
    match_id: string;
    winner_id: string;
    blader1_points: number;
    blader2_points: number;
    finish_type: string;
    bey1?: string;
    bey2?: string;
    rounds?: any[];
  }): Promise<void> => {
    const payload = {
      ...args,
      rounds: args.rounds || [],
    };
    if (getBackendMode() === 'local') {
      return invoke<void>('add_match_result', { args: payload });
    }
    return request<void>(`/api/tournaments/${args.match_id}/match-result`, {
      method: 'POST',
      body: JSON.stringify({ args: payload }),
    });
  },

  recordVersusBattle: async (args: {
    blader1_id: string;
    blader2_id: string;
    winner_id: string;
    winner_points: number;
    rounds: any[];
  }): Promise<void> => {
    if (getBackendMode() === 'local') {
      return invoke<void>('record_versus_battle', { args });
    }
    return request<void>('/api/versus', {
      method: 'POST',
      body: JSON.stringify({ args }),
    });
  },

  getBattleHistory: async (bladerId: string): Promise<BattleRecord[]> => {
    if (getBackendMode() === 'local') {
      return invoke<BattleRecord[]>('get_battle_history', { bladerId });
    }
    return request<BattleRecord[]>(`/api/blader/${bladerId}/history`);
  },

  getCustomArenas: async (): Promise<Arena[]> => {
    if (getBackendMode() === 'local') {
      return invoke<Arena[]>('get_custom_arenas');
    }
    return request<Arena[]>('/api/custom-arenas');
  },

  createCustomArena: async (args: {
    name: string;
    description: string;
    maxPlayers: number;
    hasXtremeLine: boolean;
    tags: string[];
    color: string;
  }): Promise<Arena> => {
    if (getBackendMode() === 'local') {
      return invoke<Arena>('create_custom_arena', { args });
    }
    return request<Arena>('/api/custom-arenas', {
      method: 'POST',
      body: JSON.stringify({ args }),
    });
  },

  deleteCustomArena: async (id: string): Promise<void> => {
    if (getBackendMode() === 'local') {
      return invoke<void>('delete_custom_arena', { id });
    }
    return request<void>(`/api/custom-arenas/${id}`, {
      method: 'DELETE',
    });
  },
};
