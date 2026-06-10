export interface Blade {
  id: string;
  name: string;
  type: 'attack' | 'defense' | 'stamina' | 'balance';
  weight: number;
  attack_multiplier: number;
  defense_multiplier: number;
  stamina_multiplier: number;
}

export interface Ratchet {
  id: string;
  name: string;
  height: number; // 60, 70, 80
  sides: number; // 1, 2, 3, 4, 5, 7, 9
  weight: number;
}

export interface Bit {
  id: string;
  name: string;
  type: 'attack' | 'defense' | 'stamina' | 'balance';
  weight: number;
  burst_resistance: number; // 1 to 10
  speed_multiplier: number;
}

export const BLADES: Blade[] = [
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
  { id: 'b_tyranno_beat', name: 'Tyranno Beat', type: 'attack', weight: 37.2, attack_multiplier: 1.6, defense_multiplier: 0.9, stamina_multiplier: 0.8 },
];

export const RATCHETS: Ratchet[] = [
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
  { id: 'r_7_60', name: '7-60', height: 60, sides: 7, weight: 7.0 },
];

export const BITS: Bit[] = [
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
  { id: 'bt_q', name: 'Quake (Q)', type: 'attack', weight: 2.2, burst_resistance: 8, speed_multiplier: 1.6 },
];

export function calculateStats(bladeId: string, ratchetId: string, bitId: string) {
  const blade = BLADES.find(b => b.id === bladeId);
  const ratchet = RATCHETS.find(r => r.id === ratchetId);
  const bit = BITS.find(b => b.id === bitId);

  if (!blade || !ratchet || !bit) return null;

  const totalWeight = blade.weight + ratchet.weight + bit.weight;
  
  // Base stats from 0 to 100
  let attack = (totalWeight * blade.attack_multiplier * bit.speed_multiplier) * 1.2;
  let defense = (totalWeight * blade.defense_multiplier) + (bit.burst_resistance * 2) + (100 - ratchet.height * 0.5);
  let stamina = (totalWeight * blade.stamina_multiplier) + (10 - bit.speed_multiplier * 5) * 5;
  let speed = (bit.speed_multiplier * 40) + (blade.attack_multiplier * 10);

  // Normalize
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
