/**
 * MissionConfig.ts
 * Centralized configuration for Mission 1 — "Desert Dawn"
 * 
 * ALL magic numbers live here. No hardcoded values in game logic.
 */

// ============================================================
// ZONE BOUNDARIES
// ============================================================

export const ZONE_BOUNDS = {
  outskirts:      { zMin: 100, zMax: 120 },
  inner_perimeter: { zMin: 75,  zMax: 100 },
  compound:       { zMin: 50,  zMax: 75  },
  border_wall:    { zMin: 40,  zMax: 50  },
} as const;

// ============================================================
// PLAYER CONFIG
// ============================================================

export const PLAYER_CONFIG = {
  // Spawn
  SPAWN_X_WOLF: -2,
  SPAWN_X_FALCON: 2,
  SPAWN_Z: 190,

  // Heights (stance)
  STANDING_HEIGHT: 1.7,
  CROUCH_HEIGHT: 1.0,
  PRONE_HEIGHT: 0.5,

  // Speed multipliers
  SPRINT_SPEED_MULT: 1.6,
  CROUCH_SPEED_MULT: 0.5,
  PRONE_SPEED_MULT: 0.3,

  // Camera
  FIRST_PERSON_EYE_OFFSET: 0.15,
  MOUSE_SENSITIVITY: 0.002,
  MOUSE_SENSITIVITY_PRONE_MULT: 0.5,

  // Head bob
  HEADBOB_SPEED_WALK: 8,
  HEADBOB_SPEED_SPRINT: 12,
  HEADBOB_AMP_STAND: 0.03,
  HEADBOB_AMP_CROUCH: 0.015,

  // Screen shake
  SHAKE_HORIZONTAL_MULT: 0.12,
  SHAKE_VERTICAL_MULT: 0.08,
  SHAKE_DECAY: 0.9,
  SHAKE_MAX_INTENSITY: 8,
  SHAKE_DAMAGE_SCALE: 0.6,
  SHAKE_DAMAGE_CAP: 50,

  // Combat
  HEADSHOT_Y_THRESHOLD: 1.4,
  TORSO_HEIGHT: 1.2,
  MELEE_RANGE: 2.5,
  LOW_HEALTH_THRESHOLD: 30,

  // Stance animation
  STANCE_LERP_SPEED: 14,
  PRONE_LERP_SPEED: 7,
} as const;

// ============================================================
// ENEMY CONFIG
// ============================================================

export const ENEMY_CONFIG = {
  // Eye level for LOS checks
  EYE_LEVEL: 1.6,

  // Detection
  DETECTION_RATE_FACTOR: 35,
  ALERT_DECAY_RATE: 12,
  ALERT_PATROL_THRESHOLD: 25,
  ALERT_ATTACK_THRESHOLD: 70,
  ALERT_SEARCH_THRESHOLD: 75,

  // Alert propagation
  ALERT_RADIUS: 20,
  ALERT_BOOST_AMOUNT: 40,

  // Headshot
  HEADSHOT_MULTIPLIER: 2.5,

  // Combat
  PEEK_DELAY: 1.5,
  SEARCH_SPEED_MULTIPLIER: 1.8,
  WAYPOINT_REACHED_DISTANCE: 1.5,

  // Death
  DEAD_BODY_LIFETIME_MS: 5000,
  DEAD_BODY_Y_OFFSET: 0.4,

  // Cover offsets
  COVER_CROUCH_OFFSET: 0.3,
  COVER_DUCK_OFFSET: 0.4,
} as const;

// ============================================================
// MISSION PROGRESSION
// ============================================================

export const MISSION_CONFIG = {
  // Phase 1: Reach perimeter
  PHASE1_ZONE_CHECK: 100, // player z < this = still in outskirts

  // Phase 2: Kill targets
  PHASE2_KILL_TARGET: 5,

  // Phase 3: C4 planting
  RADAR_INTERACT_RANGE: 5,
  C4_PLANT_TIME: 3, // seconds

  // Phase 4: Wave defense
  TOTAL_WAVES: 3,
  WAVE_SIZE: 5,
  WAVE_CENTER_Z: 70,
  WAVE_SPREAD_X: 16,
  WAVE_SPREAD_Z: 8,
  WAVE_ENEMY_HP: 80,
  WAVE_ENEMY_SPEED: 3,
  WAVE_ENEMY_DAMAGE: 8,
  INTER_WAVE_DELAY: 10, // seconds
  INITIAL_WAVE_DELAY: 2,

  // Phase 5: Extraction
  EXTRACTION_TIME: 60, // seconds
  EXTRACTION_ZONE_Z: 195,

  // Radar position
  RADAR_POSITION: { x: 12, y: 0, z: 46 },
} as const;

// ============================================================
// SCORING
// ============================================================

export const SCORE_CONFIG = {
  KILL_SCORE: 100,
  HEADSHOT_KILL_SCORE: 150,
  STEALTH_KILL_SCORE: 200,
  HIT_SCORE: 10,
  MELEE_KILL_SCORE: 150,
  MELEE_STEALTH_KILL_SCORE: 250,
} as const;

// ============================================================
// WEAPON CONFIG
// ============================================================

export interface WeaponDef {
  name: string;
  type: 'melee' | 'pistol' | 'rifle' | 'sniper';
  damage: number;
  fireRate: number;
  magSize: number;
  reserve: number;
  range: number;
  noiseRadius: number;
  reloadTime: number;
  icon: string;
}

export const WOLF_WEAPONS: WeaponDef[] = [
  { name: 'Bare Hands', type: 'melee', damage: 15, fireRate: 4, magSize: 1, reserve: 999, range: 2, noiseRadius: 0, reloadTime: 0, icon: '👊' },
  { name: 'Combat Knife', type: 'melee', damage: 50, fireRate: 3, magSize: 1, reserve: 999, range: 2.5, noiseRadius: 0, reloadTime: 0, icon: '🔪' },
  { name: 'Makara-9', type: 'pistol', damage: 35, fireRate: 5, magSize: 12, reserve: 48, range: 50, noiseRadius: 25, reloadTime: 1.5, icon: '🔫' },
  { name: 'Zulfiqar-47', type: 'rifle', damage: 25, fireRate: 8, magSize: 30, reserve: 120, range: 100, noiseRadius: 50, reloadTime: 2.0, icon: '🔫' },
];

export const FALCON_WEAPONS: WeaponDef[] = [
  { name: 'Bare Hands', type: 'melee', damage: 15, fireRate: 4, magSize: 1, reserve: 999, range: 2, noiseRadius: 0, reloadTime: 0, icon: '👊' },
  { name: 'Crescent Dagger', type: 'melee', damage: 60, fireRate: 2.5, magSize: 1, reserve: 999, range: 2.5, noiseRadius: 0, reloadTime: 0, icon: '🗡️' },
  { name: 'Makara-9', type: 'pistol', damage: 35, fireRate: 5, magSize: 12, reserve: 48, range: 50, noiseRadius: 25, reloadTime: 1.5, icon: '🔫' },
  { name: 'Shahin-SR', type: 'sniper', damage: 85, fireRate: 1.5, magSize: 10, reserve: 30, range: 200, noiseRadius: 60, reloadTime: 3.0, icon: '🎯' },
];

// ============================================================
// AUDIO CONFIG
// ============================================================

export const AUDIO_CONFIG = {
  DEFAULT_MASTER_VOLUME: 0.7,
  DEFAULT_SFX_VOLUME: 0.7,
  DEFAULT_MUSIC_VOLUME: 0.5,
  WIND_VOLUME_BASE: 0.04,
  WIND_LFO_FREQUENCY: 0.15,
  WIND_MODULATION_DEPTH: 0.015,
  COMBAT_MUSIC_BPM: 140,
  EXTRACTION_RISE_START_FREQ: 200,
  EXTRACTION_RISE_END_FREQ: 600,
  EXTRACTION_RISE_DURATION: 60,
} as const;

// ============================================================
// UI CONFIG
// ============================================================

export const UI_CONFIG = {
  KILL_STREAK_TIMEOUT_MS: 5000,
  KILL_FEED_DURATION_MS: 3000,
  MAX_KILL_FEED_ENTRIES: 5,
  XP_POPUP_DURATION_MS: 1500,
  DAMAGE_NUMBER_DURATION_MS: 1000,
  DAMAGE_NUMBER_SCATTER: 20,
  LOW_RESERVE_THRESHOLD_PERCENT: 0.3,
  CROSSHAIR_SPREAD_ADS: 10,
  CROSSHAIR_SPREAD_CROUCH: 14,
  CROSSHAIR_SPREAD_STAND: 24,
} as const;

// ============================================================
// GAME ENGINE CONFIG
// ============================================================

export const ENGINE_CONFIG = {
  MAX_DELTA_TIME: 0.05,
  CAMERA_FOV: 75,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 1000,
  FOG_DENSITY: 0.006,
  FOG_COLOR: 0x1a1a2e,
  EXPOSURE: 1.2,
  DEFAULT_WIDTH: 1920,
  DEFAULT_HEIGHT: 1080,
} as const;
