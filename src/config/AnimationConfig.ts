/**
 * AnimationConfig.ts
 * Animation system configuration for Call of Deity: Protocol 313
 *
 * Centralizes all animation-related constants, timing, and state definitions.
 * Edit this file to tune animation behavior without touching game logic.
 *
 * IMPROVED: Defines clear animation states with entry/loop/exit transitions,
 * priority-based state hierarchy, and smooth blend configuration.
 */

import * as THREE from 'three';
import { AnimationDefinition } from '../utils/MixamoLoader';

// ============================================================
// ANIMATION STATE ENUM
// ============================================================

/**
 * All supported animation states in the state machine.
 * Organized by category for clarity.
 *
 * Each state represents a distinct locomotion/stance/pose that the
 * character can be in, with its own entry → loop → exit cycle.
 */
export enum AnimState {
  // ── Standing Locomotion ──
  IDLE          = 'idle',
  WALK          = 'walk',
  RUN           = 'run',

  // ── Crouch ──
  CROUCH_IDLE   = 'crouchIdle',
  CROUCH_WALK   = 'crouchWalk',

  // ── Prone ──
  PRONE_IDLE    = 'proneIdle',
  PRONE_CRAWL   = 'proneCrawl',

  // ── Cover ──
  COVER_IDLE    = 'coverIdle',
  COVER_PEEK    = 'coverPeek',

  // ── Combat ──
  RIFLE_IDLE    = 'rifleIdle',
  RIFLE_WALK    = 'rifleWalk',
  RIFLE_RUN     = 'rifleRun',
  RIFLE_SHOOT   = 'rifleShoot',
  RIFLE_RELOAD  = 'rifleReload',

  // ── Reactions ──
  DEATH         = 'death',
  HIT_FRONT     = 'hitFront',
  HIT_BACK      = 'hitBack',

  // ── Social / Ambient ──
  SMOKING       = 'smoking',
  TALKING       = 'talking',
  SITTING       = 'sitting',
  RADIO         = 'radio',
  GRENADE       = 'grenade',
}

// ============================================================
// STATE PRIORITY
// ============================================================

/**
 * Higher priority states can interrupt lower priority ones.
 * Used for automatic transition resolution when multiple states
 * could be active (e.g., DEATH always wins).
 */
export const STATE_PRIORITY: Record<string, number> = {
  [AnimState.DEATH]:        100,  // Terminal — highest priority
  [AnimState.HIT_FRONT]:     90,  // Reactions override everything
  [AnimState.HIT_BACK]:      90,
  [AnimState.RIFLE_SHOOT]:   80,  // Shooting overrides locomotion
  [AnimState.RIFLE_RELOAD]:  75,  // Reload overrides locomotion
  [AnimState.GRENADE]:       78,  // Grenade throw overrides locomotion
  [AnimState.COVER_IDLE]:    70,  // Cover stance is deliberate
  [AnimState.COVER_PEEK]:    70,
  [AnimState.RIFLE_IDLE]:    60,  // ADS states override hip states
  [AnimState.RIFLE_WALK]:    60,
  [AnimState.RIFLE_RUN]:     60,
  [AnimState.PRONE_CRAWL]:   50,  // Prone overrides crouch
  [AnimState.PRONE_IDLE]:    50,
  [AnimState.CROUCH_IDLE]:   40,  // Crouch overrides standing
  [AnimState.CROUCH_WALK]:   40,
  [AnimState.RUN]:           30,  // Sprint overrides walk
  [AnimState.WALK]:          20,
  [AnimState.IDLE]:          10,  // Default lowest priority
};

// ============================================================
// MIXAMO ANIMATION MAP
// ============================================================

/**
 * Maps every AnimState to the exact Mixamo animation clip name,
 * whether the clip loops or plays once, and the playback time scale.
 *
 * This is the single source of truth for the Mixamo ↔ game-state
 * mapping. MixamoLoader uses this to resolve which GLB clip to
 * pull for each state, and the AnimationStateMachine uses it to
 * configure loop / one-shot / speed at action creation time.
 *
 * Clip names match the official Mixamo library titles exactly
 * (e.g., "Standing Idle", "Rifle Shooting", "Death Fall").
 */
export interface MixamoAnimEntry {
  /** Exact Mixamo library animation name (as downloaded) */
  mixamoName: string;
  /** Loop mode: true = loop continuously, false = play once (one-shot) */
  loop: boolean;
  /** Playback speed multiplier (1.0 = original Mixamo speed) */
  timeScale: number;
  /** Clamp at final frame when one-shot (keeps the pose held) */
  clampWhenFinished: boolean;
}

export const MIXAMO_ANIMATION_MAP: Record<string, MixamoAnimEntry> = {

  // ──────────────────────────────────────────────────
  // IDLE STATES
  // ──────────────────────────────────────────────────
  [AnimState.IDLE]: {
    mixamoName: 'Standing Idle',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.RIFLE_IDLE]: {
    mixamoName: 'Rifle Aiming',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.CROUCH_IDLE]: {
    mixamoName: 'Crouching Idle',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.PRONE_IDLE]: {
    mixamoName: 'Prone Idle',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },

  // ──────────────────────────────────────────────────
  // LOCOMOTION
  // ──────────────────────────────────────────────────
  [AnimState.WALK]: {
    mixamoName: 'Walking',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.RUN]: {
    mixamoName: 'Running',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.CROUCH_WALK]: {
    mixamoName: 'Crouching Walk',
    loop: true,
    timeScale: 0.85,
    clampWhenFinished: false,
  },
  [AnimState.PRONE_CRAWL]: {
    mixamoName: 'Prone Crawl',
    loop: true,
    timeScale: 0.65,
    clampWhenFinished: false,
  },

  // ──────────────────────────────────────────────────
  // COVER STATES
  // ──────────────────────────────────────────────────
  [AnimState.COVER_IDLE]: {
    mixamoName: 'Rifle Aiming',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.COVER_PEEK]: {
    mixamoName: 'Rifle Aiming',
    loop: false,
    timeScale: 1.2,
    clampWhenFinished: true,
  },

  // ──────────────────────────────────────────────────
  // COMBAT (RIFLE)
  // ──────────────────────────────────────────────────
  [AnimState.RIFLE_WALK]: {
    mixamoName: 'Rifle Walking',
    loop: true,
    timeScale: 0.95,
    clampWhenFinished: false,
  },
  [AnimState.RIFLE_RUN]: {
    mixamoName: 'Rifle Running',
    loop: true,
    timeScale: 1.1,
    clampWhenFinished: false,
  },
  [AnimState.RIFLE_SHOOT]: {
    mixamoName: 'Rifle Shooting',
    loop: false,
    timeScale: 1.0,
    clampWhenFinished: true,
  },
  [AnimState.RIFLE_RELOAD]: {
    mixamoName: 'Rifle Reloading',
    loop: false,
    timeScale: 1.0,
    clampWhenFinished: true,
  },

  // ──────────────────────────────────────────────────
  // REACTIONS
  // ──────────────────────────────────────────────────
  [AnimState.DEATH]: {
    mixamoName: 'Death Fall',
    loop: false,
    timeScale: 1.0,
    clampWhenFinished: true,
  },
  [AnimState.HIT_FRONT]: {
    mixamoName: 'Hit Front',
    loop: false,
    timeScale: 1.0,
    clampWhenFinished: true,
  },
  [AnimState.HIT_BACK]: {
    mixamoName: 'Hit Back',
    loop: false,
    timeScale: 1.0,
    clampWhenFinished: true,
  },

  // ──────────────────────────────────────────────────
  // SOCIAL / AMBIENT
  // ──────────────────────────────────────────────────
  [AnimState.SMOKING]: {
    mixamoName: 'Smoking',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.TALKING]: {
    mixamoName: 'Talking',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.SITTING]: {
    mixamoName: 'Sitting',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },
  [AnimState.RADIO]: {
    mixamoName: 'Using Radio',
    loop: true,
    timeScale: 1.0,
    clampWhenFinished: false,
  },

  // ──────────────────────────────────────────────────
  // GRENADE
  // ──────────────────────────────────────────────────
  [AnimState.GRENADE]: {
    mixamoName: 'Throwing',
    loop: false,
    timeScale: 1.0,
    clampWhenFinished: true,
  },
};

/**
 * Get the Mixamo animation entry for a given game state.
 * Returns undefined if the state has no Mixamo mapping.
 */
export function getMixamoEntry(state: string): MixamoAnimEntry | undefined {
  return MIXAMO_ANIMATION_MAP[state];
}

/**
 * Get the Mixamo clip name for a given game state.
 * Falls back to the state string itself if no mapping exists.
 */
export function getMixamoClipName(state: string): string {
  return MIXAMO_ANIMATION_MAP[state]?.mixamoName ?? state;
}

// ============================================================
// ANIMATION ASSET DEFINITIONS
// ============================================================

/**
 * Wolf character animations — Assault rifle operator.
 * Files expected in: /assets/characters/wolf/
 *
 * IMPROVED: Each state has separate entry/loop/exit clips where available.
 * Entry = transition pose into this state (e.g., "stand up into idle")
 * Loop = continuous animation while in this state
 * Exit = transition pose out of this state (e.g., "crouch down from idle")
 */
export const WOLF_ANIMATIONS: AnimationDefinition[] = [
  // === Standing Locomotion ===
  { name: 'idle',              file: 'wolf_idle.glb',              loop: THREE.LoopRepeat },
  { name: 'idleEntry',         file: 'wolf_idle_entry.glb',        loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'idleExit',          file: 'wolf_idle_exit.glb',         loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'walk',              file: 'wolf_walk.glb',              loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkEntry',         file: 'wolf_walk_entry.glb',        loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'walkExit',          file: 'wolf_walk_exit.glb',         loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'run',               file: 'wolf_run.glb',               loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'runEntry',          file: 'wolf_run_entry.glb',         loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'runExit',           file: 'wolf_run_exit.glb',          loop: THREE.LoopOnce, clampWhenFinished: true },

  // === Crouch ===
  { name: 'crouchIdle',        file: 'wolf_crouch_idle.glb',       loop: THREE.LoopRepeat },
  { name: 'crouchIdleEntry',   file: 'wolf_crouch_idle_entry.glb', loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'crouchIdleExit',    file: 'wolf_crouch_idle_exit.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'crouchWalk',        file: 'wolf_crouch_walk.glb',       loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkEntry',   file: 'wolf_crouch_walk_entry.glb', loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'crouchWalkExit',    file: 'wolf_crouch_walk_exit.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },

  // === Prone ===
  { name: 'proneIdle',         file: 'wolf_prone_idle.glb',        loop: THREE.LoopRepeat },
  { name: 'proneIdleEntry',    file: 'wolf_prone_idle_entry.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'proneIdleExit',     file: 'wolf_prone_idle_exit.glb',   loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'proneCrawl',        file: 'wolf_prone_crawl.glb',       loop: THREE.LoopRepeat, timeScale: 0.65 },
  { name: 'proneCrawlEntry',   file: 'wolf_prone_crawl_entry.glb', loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'proneCrawlExit',    file: 'wolf_prone_crawl_exit.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },

  // === Cover ===
  { name: 'coverIdle',         file: 'wolf_cover_idle.glb',        loop: THREE.LoopRepeat },
  { name: 'coverIdleEntry',    file: 'wolf_cover_idle_entry.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'coverIdleExit',     file: 'wolf_cover_idle_exit.glb',   loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'coverPeek',         file: 'wolf_cover_peek.glb',        loop: THREE.LoopRepeat },
  { name: 'coverPeekEntry',    file: 'wolf_cover_peek_entry.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'coverPeekExit',     file: 'wolf_cover_peek_exit.glb',   loop: THREE.LoopOnce, clampWhenFinished: true },

  // === Combat (Rifle) ===
  { name: 'rifleIdle',         file: 'wolf_rifle_idle.glb',        loop: THREE.LoopRepeat },
  { name: 'rifleIdleEntry',    file: 'wolf_rifle_idle_entry.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'rifleIdleExit',     file: 'wolf_rifle_idle_exit.glb',   loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'rifleWalk',         file: 'wolf_rifle_walk.glb',        loop: THREE.LoopRepeat, timeScale: 0.95 },
  { name: 'rifleRun',          file: 'wolf_rifle_run.glb',         loop: THREE.LoopRepeat, timeScale: 1.1 },
  { name: 'rifleShoot',        file: 'wolf_rifle_shoot.glb',       loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'rifleReload',       file: 'wolf_rifle_reload.glb',      loop: THREE.LoopOnce, clampWhenFinished: true },

  // === Combat Actions ===
  { name: 'grenade',           file: 'wolf_grenade.glb',           loop: THREE.LoopOnce, clampWhenFinished: true },

  // === Reactions ===
  { name: 'death',             file: 'wolf_death.glb',             loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitFront',          file: 'wolf_hit_front.glb',         loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitBack',           file: 'wolf_hit_back.glb',          loop: THREE.LoopOnce, clampWhenFinished: true },

  // === Social / Ambient ===
  { name: 'smoking',           file: 'wolf_smoking.glb',           loop: THREE.LoopRepeat },
  { name: 'talking',           file: 'wolf_talking.glb',           loop: THREE.LoopRepeat },
  { name: 'sitting',           file: 'wolf_sitting.glb',           loop: THREE.LoopRepeat },
  { name: 'radio',             file: 'wolf_radio.glb',             loop: THREE.LoopRepeat },
];

/**
 * Falcon character animations — Sniper/overwatch.
 * Same structure as Wolf but with different file prefixes.
 */
export const FALCON_ANIMATIONS: AnimationDefinition[] = WOLF_ANIMATIONS.map((def) => ({
  ...def,
  file: def.file.replace('wolf_', 'falcon_'),
}));

// ============================================================
// STATE DEFINITIONS
// ============================================================

/**
 * Per-state configuration: entry/loop/exit clips, blend weights,
 * speed multipliers, and transition behavior.
 *
 * This is the core configuration that the AnimationStateMachine reads
 * to know how to handle each state.
 */
export interface AnimStateConfig {
  /** The state identifier (matches AnimState enum values) */
  state: string;

  /** Animation clip names for entry → loop → exit cycle */
  clips: {
    entry?: string;   // Optional entry animation (crossfade in)
    loop: string;     // Required loop animation (continuous)
    exit?: string;    // Optional exit animation (crossfade out)
  };

  /** Playback speed multiplier for the loop clip */
  speed: number;

  /** Blend weight (0–1) when this state is fully active */
  weight: number;

  /** Whether this state can be interrupted by higher-priority states */
  interruptible: boolean;

  /** Whether this state loops (true) or plays once and holds (false) */
  loops: boolean;

  /** Grounded height offset for this stance (in world units) */
  groundOffset: number;

  /** Movement speed multiplier when in this state */
  moveSpeedMult: number;

  /** Categories this state belongs to (for blend group resolution) */
  categories: ('locomotion' | 'upperBody' | 'fullBody' | 'stance' | 'reaction')[];
}

export const ANIM_STATE_CONFIGS: Record<string, AnimStateConfig> = {
  // ── Standing Idle ──
  [AnimState.IDLE]: {
    state: AnimState.IDLE,
    clips: { entry: 'idleEntry', loop: 'idle', exit: 'idleExit' },
    speed: 1.0,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 1.7,
    moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody'],
  },

  // ── Standing Walk ──
  [AnimState.WALK]: {
    state: AnimState.WALK,
    clips: { entry: 'walkEntry', loop: 'walk', exit: 'walkExit' },
    speed: 1.0,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 1.7,
    moveSpeedMult: 1.0,
    categories: ['locomotion', 'fullBody'],
  },

  // ── Standing Run ──
  [AnimState.RUN]: {
    state: AnimState.RUN,
    clips: { entry: 'runEntry', loop: 'run', exit: 'runExit' },
    speed: 1.15,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 1.7,
    moveSpeedMult: 1.6,
    categories: ['locomotion', 'fullBody'],
  },

  // ── Crouch Idle ──
  [AnimState.CROUCH_IDLE]: {
    state: AnimState.CROUCH_IDLE,
    clips: { entry: 'crouchIdleEntry', loop: 'crouchIdle', exit: 'crouchIdleExit' },
    speed: 1.0,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 1.0,
    moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'],
  },

  // ── Crouch Walk ──
  [AnimState.CROUCH_WALK]: {
    state: AnimState.CROUCH_WALK,
    clips: { entry: 'crouchWalkEntry', loop: 'crouchWalk', exit: 'crouchWalkExit' },
    speed: 0.85,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 1.0,
    moveSpeedMult: 0.5,
    categories: ['locomotion', 'fullBody', 'stance'],
  },

  // ── Prone Idle ──
  [AnimState.PRONE_IDLE]: {
    state: AnimState.PRONE_IDLE,
    clips: { entry: 'proneIdleEntry', loop: 'proneIdle', exit: 'proneIdleExit' },
    speed: 1.0,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 0.5,
    moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'],
  },

  // ── Prone Crawl ──
  [AnimState.PRONE_CRAWL]: {
    state: AnimState.PRONE_CRAWL,
    clips: { entry: 'proneCrawlEntry', loop: 'proneCrawl', exit: 'proneCrawlExit' },
    speed: 0.65,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 0.5,
    moveSpeedMult: 0.3,
    categories: ['locomotion', 'fullBody', 'stance'],
  },

  // ── Cover Idle ──
  [AnimState.COVER_IDLE]: {
    state: AnimState.COVER_IDLE,
    clips: { entry: 'coverIdleEntry', loop: 'coverIdle', exit: 'coverIdleExit' },
    speed: 1.0,
    weight: 1.0,
    interruptible: false, // Cover is a deliberate position — don't auto-interrupt
    loops: true,
    groundOffset: 1.0,  // Usually crouched in cover
    moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'],
  },

  // ── Cover Peek ──
  [AnimState.COVER_PEEK]: {
    state: AnimState.COVER_PEEK,
    clips: { entry: 'coverPeekEntry', loop: 'coverPeek', exit: 'coverPeekExit' },
    speed: 1.0,
    weight: 1.0,
    interruptible: false,
    loops: false, // Peek plays once, then returns to coverIdle
    groundOffset: 1.3,
    moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'],
  },

  // ── Rifle Idle (ADS) ──
  [AnimState.RIFLE_IDLE]: {
    state: AnimState.RIFLE_IDLE,
    clips: { entry: 'rifleIdleEntry', loop: 'rifleIdle', exit: 'rifleIdleExit' },
    speed: 1.0,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 1.7,
    moveSpeedMult: 0,
    categories: ['upperBody', 'fullBody'],
  },

  // ── Rifle Walk (ADS) ──
  [AnimState.RIFLE_WALK]: {
    state: AnimState.RIFLE_WALK,
    clips: { loop: 'rifleWalk' },
    speed: 0.95,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 1.7,
    moveSpeedMult: 0.85,
    categories: ['locomotion', 'upperBody', 'fullBody'],
  },

  // ── Rifle Run (ADS) ──
  [AnimState.RIFLE_RUN]: {
    state: AnimState.RIFLE_RUN,
    clips: { loop: 'rifleRun' },
    speed: 1.1,
    weight: 1.0,
    interruptible: true,
    loops: true,
    groundOffset: 1.7,
    moveSpeedMult: 1.3,
    categories: ['locomotion', 'upperBody', 'fullBody'],
  },

  // ── Rifle Shoot ──
  [AnimState.RIFLE_SHOOT]: {
    state: AnimState.RIFLE_SHOOT,
    clips: { loop: 'rifleShoot' },
    speed: 1.0,
    weight: 1.0,
    interruptible: true,
    loops: false,
    groundOffset: 1.7,
    moveSpeedMult: 0,
    categories: ['upperBody'],
  },

  // ── Rifle Reload ──
  [AnimState.RIFLE_RELOAD]: {
    state: AnimState.RIFLE_RELOAD,
    clips: { loop: 'rifleReload' },
    speed: 1.0,
    weight: 1.0,
    interruptible: false, // Reload completes fully
    loops: false,
    groundOffset: 1.7,
    moveSpeedMult: 0,
    categories: ['upperBody'],
  },

  // ── Death ──
  [AnimState.DEATH]: {
    state: AnimState.DEATH,
    clips: { loop: 'death' },
    speed: 1.0,
    weight: 1.0,
    interruptible: false,
    loops: false,
    groundOffset: 0.3,
    moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'],
  },

  // ── Hit Front ──
  [AnimState.HIT_FRONT]: {
    state: AnimState.HIT_FRONT,
    clips: { loop: 'hitFront' },
    speed: 1.0,
    weight: 1.0,
    interruptible: true,
    loops: false,
    groundOffset: 1.7,
    moveSpeedMult: 0,
    categories: ['upperBody', 'reaction'],
  },

  // ── Hit Back ──
  [AnimState.HIT_BACK]: {
    state: AnimState.HIT_BACK,
    clips: { loop: 'hitBack' },
    speed: 1.0,
    weight: 1.0,
    interruptible: true,
    loops: false,
    groundOffset: 1.7,
    moveSpeedMult: 0,
    categories: ['upperBody', 'reaction'],
  },

  // ── Grenade Throw ──
  [AnimState.GRENADE]: {
    state: AnimState.GRENADE,
    clips: { loop: 'grenade' },
    speed: 1.0,
    weight: 1.0,
    interruptible: false, // Throw completes fully
    loops: false,
    groundOffset: 1.7,
    moveSpeedMult: 0,
    categories: ['upperBody'],
  },
};

// ============================================================
// TRANSITION TIMING
// ============================================================

/** Crossfade durations (seconds) for each transition type */
export const TRANSITION_DURATIONS = {
  // ── Standing locomotion ──
  /** Idle ↔ Walk (natural, smooth) */
  IDLE_WALK: 0.25,
  /** Walk ↔ Run (quick, responsive) */
  WALK_RUN: 0.2,
  /** Idle ↔ Run (fast but visible) */
  IDLE_RUN: 0.3,

  // ── Stance changes (slower, deliberate) ──
  /** Standing → Crouch / Crouch → Standing */
  STAND_CROUCH: 0.3,
  /** Crouch ↔ Prone (multi-step transition) */
  CROUCH_PRONE: 0.4,
  /** Prone → Standing (longest transition) */
  PRONE_STAND: 0.5,
  /** Standing ↔ Prone (direct, no intermediate) */
  STAND_PRONE: 0.45,

  // ── Cover ──
  /** Enter cover (from any stance) */
  TO_COVER: 0.3,
  /** Exit cover (return to stance) */
  FROM_COVER: 0.25,
  /** Cover → Cover Peek */
  COVER_PEEK: 0.15,
  /** Cover Peek → Cover (return from peek) */
  PEEK_RETURN: 0.2,

  // ── Combat ──
  /** Enter ADS (rifle aim) */
  TO_RIFLE_AIM: 0.25,
  /** Exit ADS (return to hip) */
  FROM_RIFLE_AIM: 0.3,
  /** Shoot recovery (return from shoot) */
  SHOOT_RECOVER: 0.15,
  /** Reload start */
  RELOAD_START: 0.15,
  /** Reload finish */
  RELOAD_FINISH: 0.2,

  // ── Reactions ──
  /** Death (instant, no blend) */
  DEATH: 0.1,
  /** Hit reactions (quick snap) */
  HIT: 0.08,

  // ── Default ──
  /** Default fallback for undefined transitions */
  DEFAULT: 0.25,
} as const;

// ============================================================
// STATE TRANSITION TABLE
// ============================================================

/**
 * Valid transitions between animation states.
 * Each entry defines:
 *   - from: source state (or '*' for any)
 *   - to: target state
 *   - duration: crossfade time in seconds
 *   - condition: optional function that must return true for transition
 *
 * The state machine evaluates transitions in order; first match wins.
 * Wildcard transitions (from: '*') serve as catch-alls for common targets.
 */
export interface StateTransition {
  from: string;
  to: string;
  duration: number;
  /** Optional condition — if provided, transition only happens when true */
  condition?: () => boolean;
  /** Whether to play the entry animation of the target state */
  useEntry?: boolean;
  /** Whether to play the exit animation of the current state first */
  useExit?: boolean;
}

export function getTransitionTable(): StateTransition[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // WILDCARD TRANSITIONS — Any state → common targets
    // ═══════════════════════════════════════════════════════════════

    // Death is terminal and immediate
    { from: '*', to: AnimState.DEATH, duration: TRANSITION_DURATIONS.DEATH, useExit: false },

    // Hit reactions can interrupt most states
    { from: '*', to: AnimState.HIT_FRONT, duration: TRANSITION_DURATIONS.HIT, useExit: false },
    { from: '*', to: AnimState.HIT_BACK, duration: TRANSITION_DURATIONS.HIT, useExit: false },

    // ═══════════════════════════════════════════════════════════════
    // IDLE TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.IDLE, to: AnimState.WALK,       duration: TRANSITION_DURATIONS.IDLE_WALK,  useEntry: true, useExit: true },
    { from: AnimState.IDLE, to: AnimState.RUN,        duration: TRANSITION_DURATIONS.IDLE_RUN,   useEntry: true, useExit: true },
    { from: AnimState.IDLE, to: AnimState.CROUCH_IDLE, duration: TRANSITION_DURATIONS.STAND_CROUCH, useEntry: true, useExit: true },
    { from: AnimState.IDLE, to: AnimState.PRONE_IDLE,  duration: TRANSITION_DURATIONS.STAND_PRONE, useEntry: true, useExit: true },
    { from: AnimState.IDLE, to: AnimState.COVER_IDLE,  duration: TRANSITION_DURATIONS.TO_COVER,   useEntry: true, useExit: true },
    { from: AnimState.IDLE, to: AnimState.RIFLE_IDLE,  duration: TRANSITION_DURATIONS.TO_RIFLE_AIM, useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // WALK TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.WALK, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.IDLE_WALK,   useEntry: true },
    { from: AnimState.WALK, to: AnimState.RUN,          duration: TRANSITION_DURATIONS.WALK_RUN,    useEntry: true, useExit: true },
    { from: AnimState.WALK, to: AnimState.CROUCH_WALK,  duration: TRANSITION_DURATIONS.STAND_CROUCH, useEntry: true, useExit: true },
    { from: AnimState.WALK, to: AnimState.RIFLE_WALK,   duration: TRANSITION_DURATIONS.TO_RIFLE_AIM, useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // RUN TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.RUN, to: AnimState.WALK,    duration: TRANSITION_DURATIONS.WALK_RUN,    useEntry: true, useExit: true },
    { from: AnimState.RUN, to: AnimState.IDLE,    duration: TRANSITION_DURATIONS.IDLE_RUN,    useEntry: true },
    { from: AnimState.RUN, to: AnimState.RIFLE_RUN, duration: TRANSITION_DURATIONS.TO_RIFLE_AIM, useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // CROUCH IDLE TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.CROUCH_IDLE, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.STAND_CROUCH, useEntry: true },
    { from: AnimState.CROUCH_IDLE, to: AnimState.CROUCH_WALK,  duration: TRANSITION_DURATIONS.IDLE_WALK,    useEntry: true, useExit: true },
    { from: AnimState.CROUCH_IDLE, to: AnimState.PRONE_IDLE,   duration: TRANSITION_DURATIONS.CROUCH_PRONE, useEntry: true, useExit: true },

    // ═══════════════════════════════════════════════════════════════
    // CROUCH WALK TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.CROUCH_WALK, to: AnimState.CROUCH_IDLE,  duration: TRANSITION_DURATIONS.IDLE_WALK,    useEntry: true },
    { from: AnimState.CROUCH_WALK, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.STAND_CROUCH, useEntry: true },
    { from: AnimState.CROUCH_WALK, to: AnimState.WALK,         duration: TRANSITION_DURATIONS.STAND_CROUCH, useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // PRONE IDLE TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.PRONE_IDLE, to: AnimState.IDLE,          duration: TRANSITION_DURATIONS.PRONE_STAND,  useEntry: true },
    { from: AnimState.PRONE_IDLE, to: AnimState.PRONE_CRAWL,   duration: TRANSITION_DURATIONS.IDLE_WALK,    useEntry: true, useExit: true },
    { from: AnimState.PRONE_IDLE, to: AnimState.CROUCH_IDLE,   duration: TRANSITION_DURATIONS.CROUCH_PRONE, useEntry: true, useExit: true },

    // ═══════════════════════════════════════════════════════════════
    // PRONE CRAWL TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.PRONE_CRAWL, to: AnimState.PRONE_IDLE,   duration: TRANSITION_DURATIONS.IDLE_WALK,    useEntry: true },
    { from: AnimState.PRONE_CRAWL, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.PRONE_STAND,  useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // COVER TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.COVER_IDLE, to: AnimState.IDLE,       duration: TRANSITION_DURATIONS.FROM_COVER,  useEntry: true },
    { from: AnimState.COVER_IDLE, to: AnimState.COVER_PEEK, duration: TRANSITION_DURATIONS.COVER_PEEK,  useEntry: true, useExit: true },
    { from: AnimState.COVER_PEEK, to: AnimState.COVER_IDLE, duration: TRANSITION_DURATIONS.PEEK_RETURN,  useEntry: true },
    { from: AnimState.COVER_IDLE, to: AnimState.WALK,       duration: TRANSITION_DURATIONS.FROM_COVER,  useEntry: true },
    { from: AnimState.COVER_IDLE, to: AnimState.RUN,        duration: TRANSITION_DURATIONS.FROM_COVER,  useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // RIFLE (ADS) TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.RIFLE_IDLE, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.FROM_RIFLE_AIM, useEntry: true },
    { from: AnimState.RIFLE_IDLE, to: AnimState.RIFLE_WALK,   duration: TRANSITION_DURATIONS.IDLE_WALK,      useEntry: true },
    { from: AnimState.RIFLE_IDLE, to: AnimState.RIFLE_RUN,    duration: TRANSITION_DURATIONS.WALK_RUN,       useEntry: true },
    { from: AnimState.RIFLE_IDLE, to: AnimState.RIFLE_SHOOT,  duration: TRANSITION_DURATIONS.SHOOT_RECOVER,  useEntry: false },
    { from: AnimState.RIFLE_IDLE, to: AnimState.RIFLE_RELOAD, duration: TRANSITION_DURATIONS.RELOAD_START,  useEntry: false },

    { from: AnimState.RIFLE_WALK, to: AnimState.RIFLE_IDLE,   duration: TRANSITION_DURATIONS.IDLE_WALK,      useEntry: true },
    { from: AnimState.RIFLE_WALK, to: AnimState.RIFLE_RUN,    duration: TRANSITION_DURATIONS.WALK_RUN,       useEntry: true },
    { from: AnimState.RIFLE_WALK, to: AnimState.WALK,         duration: TRANSITION_DURATIONS.FROM_RIFLE_AIM, useEntry: true },

    { from: AnimState.RIFLE_RUN, to: AnimState.RIFLE_WALK,    duration: TRANSITION_DURATIONS.WALK_RUN,       useEntry: true },
    { from: AnimState.RIFLE_RUN, to: AnimState.RIFLE_IDLE,    duration: TRANSITION_DURATIONS.IDLE_RUN,       useEntry: true },
    { from: AnimState.RIFLE_RUN, to: AnimState.RUN,           duration: TRANSITION_DURATIONS.FROM_RIFLE_AIM, useEntry: true },

    { from: AnimState.RIFLE_SHOOT,  to: AnimState.RIFLE_IDLE,  duration: TRANSITION_DURATIONS.SHOOT_RECOVER, useEntry: false },
    { from: AnimState.RIFLE_SHOOT,  to: AnimState.RIFLE_WALK,  duration: TRANSITION_DURATIONS.SHOOT_RECOVER, useEntry: false },
    { from: AnimState.RIFLE_SHOOT,  to: AnimState.RIFLE_RELOAD, duration: TRANSITION_DURATIONS.RELOAD_START, useEntry: false },

    { from: AnimState.RIFLE_RELOAD, to: AnimState.RIFLE_IDLE,  duration: TRANSITION_DURATIONS.RELOAD_FINISH, useEntry: true },
    { from: AnimState.RIFLE_RELOAD, to: AnimState.RIFLE_WALK,  duration: TRANSITION_DURATIONS.RELOAD_FINISH, useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // GRENADE THROW
    // ═══════════════════════════════════════════════════════════════
    { from: '*', to: AnimState.GRENADE, duration: 0.15, useEntry: false },
    { from: AnimState.GRENADE, to: AnimState.IDLE,       duration: 0.25, useEntry: true },
    { from: AnimState.GRENADE, to: AnimState.RIFLE_IDLE, duration: 0.25, useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // HIT REACTION RECOVERY
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.HIT_FRONT, to: AnimState.IDLE,  duration: 0.3, useEntry: true },
    { from: AnimState.HIT_FRONT, to: AnimState.WALK,  duration: 0.3, useEntry: true },
    { from: AnimState.HIT_BACK,  to: AnimState.IDLE,  duration: 0.3, useEntry: true },
    { from: AnimState.HIT_BACK,  to: AnimState.WALK,  duration: 0.3, useEntry: true },

    // ═══════════════════════════════════════════════════════════════
    // DEATH RESET (for respawn)
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.DEATH, to: AnimState.IDLE, duration: 0, useEntry: false },
  ];
}

// ============================================================
// ANIMATION SPEED OVERRIDES
// ============================================================

/**
 * Per-animation speed multipliers.
 * These are applied on top of any time scale from the loader.
 * Use to fine-tune walk/run speed without changing the animation clip.
 */
export const ANIMATION_SPEEDS: Record<string, number> = {
  idle: 1.0,
  idleEntry: 1.0,
  idleExit: 1.0,
  walk: 1.0,
  walkEntry: 1.0,
  walkExit: 1.0,
  run: 1.15,
  runEntry: 1.15,
  runExit: 1.15,
  crouchIdle: 1.0,
  crouchIdleEntry: 1.0,
  crouchIdleExit: 1.0,
  crouchWalk: 0.85,
  crouchWalkEntry: 0.85,
  crouchWalkExit: 0.85,
  proneIdle: 1.0,
  proneIdleEntry: 1.0,
  proneIdleExit: 1.0,
  proneCrawl: 0.65,
  proneCrawlEntry: 0.65,
  proneCrawlExit: 0.65,
  coverIdle: 1.0,
  coverIdleEntry: 1.0,
  coverIdleExit: 1.0,
  coverPeek: 1.2,
  coverPeekEntry: 1.0,
  coverPeekExit: 1.0,
  rifleIdle: 1.0,
  rifleIdleEntry: 1.0,
  rifleIdleExit: 1.0,
  rifleWalk: 0.95,
  rifleRun: 1.1,
  rifleShoot: 1.0,
  rifleReload: 1.0,
  death: 1.0,
  hitFront: 1.0,
  hitBack: 1.0,
  grenade: 1.0,
  smoking: 1.0,
  talking: 1.0,
  sitting: 1.0,
  radio: 1.0,
};

// ============================================================
// PLAYER MOVEMENT → ANIMATION MAPPING
// ============================================================

/**
 * Maps player state (moving, crouching, prone, etc.)
 * to the appropriate animation state name.
 *
 * Use this in the Player update loop to drive the animation state machine.
 *
 * IMPROVED: Now handles cover state and priority resolution.
 */
export function getPlayerAnimationState(params: {
  isMoving: boolean;
  isSprinting: boolean;
  isCrouching: boolean;
  isProne: boolean;
  isADS: boolean;
  isDead: boolean;
  isShooting: boolean;
  isReloading: boolean;
  isTakingCover: boolean;
  isCoverPeeking: boolean;
  moveSpeed: number;
}): string {
  // ── Priority 1: Death is always terminal ──
  if (params.isDead) return AnimState.DEATH;

  // ── Priority 2: Hit reactions (handled externally, but included for safety) ──

  // ── Priority 3: Cover stance (deliberate, player-commanded) ──
  if (params.isTakingCover) {
    if (params.isCoverPeeking) return AnimState.COVER_PEEK;
    return AnimState.COVER_IDLE;
  }

  // ── Priority 4: Shooting/reloading/grenade override movement ──
  if (params.isReloading) {
    return params.isMoving
      ? (params.isSprinting ? AnimState.RIFLE_RUN : AnimState.RIFLE_WALK)
      : AnimState.RIFLE_RELOAD;
  }

  if (params.isShooting) {
    return params.isMoving
      ? (params.isSprinting ? AnimState.RIFLE_RUN : AnimState.RIFLE_WALK)
      : AnimState.RIFLE_SHOOT;
  }

  if ((params as any).isThrowingGrenade) {
    return AnimState.GRENADE;
  }

  // ── Priority 5: Prone stance ──
  if (params.isProne) {
    return params.isMoving ? AnimState.PRONE_CRAWL : AnimState.PRONE_IDLE;
  }

  // ── Priority 6: Crouch stance ──
  if (params.isCrouching) {
    return params.isMoving ? AnimState.CROUCH_WALK : AnimState.CROUCH_IDLE;
  }

  // ── Priority 7: Standing — ADS uses rifle animations ──
  if (params.isADS) {
    if (params.isMoving) {
      return params.isSprinting ? AnimState.RIFLE_RUN : AnimState.RIFLE_WALK;
    }
    return AnimState.RIFLE_IDLE;
  }

  // ── Priority 8: Standing — hip fire / no weapon ──
  if (params.isMoving) {
    return params.isSprinting ? AnimState.RUN : AnimState.WALK;
  }

  return AnimState.IDLE;
}

// ============================================================
// BLEND TREE CONFIGURATION
// ============================================================

/**
 * For more advanced blending (e.g., upper body + lower body),
 * define blend groups. This is a future-facing configuration
 * for when we add layered animations.
 */
export const BLEND_GROUPS = {
  /** Lower body: locomotion */
  LOCOMOTION: {
    states: [
      AnimState.IDLE, AnimState.WALK, AnimState.RUN,
      AnimState.CROUCH_WALK, AnimState.PRONE_CRAWL,
      AnimState.RIFLE_WALK, AnimState.RIFLE_RUN,
    ],
    bones: [
      'Hips', 'Spine', 'LeftUpLeg', 'LeftLeg', 'LeftFoot',
      'RightUpLeg', 'RightLeg', 'RightFoot',
    ],
  },

  /** Upper body: weapon/arms */
  UPPER_BODY: {
    states: [
      AnimState.RIFLE_IDLE, AnimState.RIFLE_SHOOT, AnimState.RIFLE_RELOAD,
      AnimState.COVER_IDLE, AnimState.COVER_PEEK,
    ],
    bones: [
      'Spine1', 'Spine2', 'Neck', 'Head',
      'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
      'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    ],
  },

  /** Full body (default for most states) */
  FULL_BODY: {
    states: [
      AnimState.DEATH, AnimState.HIT_FRONT, AnimState.HIT_BACK,
    ],
    bones: [], // Empty = affects all bones
  },

  /** Stance transitions (crouch/prone/cover) — affects entire skeleton */
  STANCE: {
    states: [
      AnimState.CROUCH_IDLE, AnimState.PRONE_IDLE,
      AnimState.COVER_IDLE, AnimState.COVER_PEEK,
    ],
    bones: [], // Full body
  },
} as const;

// ============================================================
// THIRD PERSON CHARACTER ANIMATION
// ============================================================

/**
 * Third-person character animation settings.
 * Used for the character model visible to the other player.
 */
export const THIRD_PERSON_ANIM = {
  /** Lerp speed for stance transitions (higher = snappier) */
  STANCE_LERP_SPEED: 8,

  /** Walk cycle speed (radians per second) */
  WALK_CYCLE_SPEED: 5,

  /** Run cycle speed */
  RUN_CYCLE_SPEED: 8,

  /** Walk leg swing amplitude (radians) */
  WALK_SWING: 0.25,

  /** Run leg swing amplitude */
  RUN_SWING: 0.4,

  /** Arm swing multiplier relative to legs */
  ARM_SWING_FACTOR: 0.5,
} as const;

// ============================================================
// PROTOTYPE FALLBACK (No Real Models)
// ============================================================

/**
 * When real Mixamo models aren't loaded yet, use these placeholder
 * settings for the box-character animation system in Player.ts.
 */
export const PROTOTYPE_ANIM = {
  /** Head bob frequency while walking */
  WALK_BOB_FREQ: 8,

  /** Head bob frequency while sprinting */
  SPRINT_BOB_FREQ: 12,

  /** Walk bob amplitude */
  WALK_BOB_AMP: 0.03,

  /** Crouch bob amplitude (subtler) */
  CROUCH_BOB_AMP: 0.015,

  /** Leg swing speed for walk */
  LEG_SWING_SPEED_WALK: 5,

  /** Leg swing speed for sprint */
  LEG_SWING_SPEED_SPRINT: 8,

  /** Leg swing amplitude for walk */
  LEG_SWING_WALK: 0.25,

  /** Leg swing amplitude for sprint */
  LEG_SWING_SPRINT: 0.4,

  /** Prone body angle (radians from horizontal) */
  PRONE_ANGLE: -Math.PI / 2,

  /** Cover peek rise amount (0-1, how much to rise from cover) */
  COVER_PEEK_RISE: 0.4,

  /** Cover idle weapon raised height */
  COVER_WEAPON_HEIGHT: -0.3,
} as const;

// ============================================================
// ASSET PATHS
// ============================================================

/**
 * Base paths for character assets.
 * Adjust these when restructuring the assets directory.
 */
export const ASSET_PATHS = {
  CHARACTERS: '/assets/characters',

  getWolfPath: () => '/assets/characters/wolf',
  getFalconPath: () => '/assets/characters/falcon',

  /** Model file names */
  WOLF_MODEL: 'wolf.glb',
  FALCON_MODEL: 'falcon.glb',
} as const;
