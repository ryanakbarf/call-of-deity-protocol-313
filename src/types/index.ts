/**
 * Type definitions for Call of Deity: Protocol 313
 */

// ============================================================
// GAME CONFIG
// ============================================================

export interface GameConfig {
  WIDTH: number;
  HEIGHT: number;
  PIXEL_RATIO: number;
  MAX_FPS: number;
  SHADOW_ENABLED: boolean;
  SHADOW_MAP_SIZE: number;
  DIFFICULTY: 'easy' | 'normal' | 'hard';
  MUSIC_VOLUME: number;
  SFX_VOLUME: number;
  PLAYER_HEIGHT: number;
  PLAYER_SPEED: number;
  PLAYER_SPRINT_SPEED: number;
  PLAYER_CROUCH_SPEED: number;
  PLAYER_PRONE_SPEED: number;
  HEADSHOT_MULTIPLIER: number;
  STEALTH_KILL_RANGE: number;
  SUPPRESSOR_NOISE_RADIUS: number;
  UNSUPPRESSED_NOISE_RADIUS: number;
}

// ============================================================
// PLAYER
// ============================================================

export type CharacterType = 'wolf' | 'falcon';

export interface CharacterData {
  name: string;
  role: string;
  speed: number;
  weapons: string[];
}

// ============================================================
// WEAPONS
// ============================================================

export type WeaponType = 'primary' | 'secondary' | 'melee';

export interface Weapon {
  name: string;
  type: WeaponType;
  damage: number;
  fireRate: number;
  ammo: number;
  maxAmmo: number;
  isSuppressed: boolean;
  range: number;
  lastFireTime: number;
}

// ============================================================
// ENEMIES
// ============================================================

export type EnemyState = 'idle' | 'patrol' | 'alert' | 'search' | 'attack' | 'dead';

export interface EnemyData {
  state: EnemyState;
  health: number;
  maxHealth: number;
  speed: number;
  detectionRange: number;
  attackRange: number;
  attackDamage: number;
  alertLevel: number;
}

// ============================================================
// STEALTH
// ============================================================

export type DetectionLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface DetectionState {
  level: DetectionLevel;
  progress: number;
  isDetected: boolean;
}

// ============================================================
// SUMMONS
// ============================================================

export type SummonType = 'drone_swarm' | 'kamikaze' | 'recon' | 'fire_support';

export interface SummonAbility {
  name: string;
  type: SummonType;
  cooldown: number;
  lastUsed: number;
  maxUses: number;
  currentUses: number;
  damage: number;
  radius: number;
}

// ============================================================
// MISSIONS
// ============================================================

export interface Objective {
  id: string;
  description: string;
  isCompleted: boolean;
}

export interface Mission {
  id: number;
  title: string;
  subtitle: string;
  setting: string;
  objectives: Objective[];
  isActive: boolean;
  isCompleted: boolean;
  isPremium: boolean;
}

// ============================================================
// GAME STATE
// ============================================================

export type GameState = 'loading' | 'menu' | 'playing' | 'paused';
