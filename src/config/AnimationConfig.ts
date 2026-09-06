/**
 * AnimationConfig.ts
 * Animation system configuration for Call of Deity: Protocol 313
 *
 * Centralizes all animation-related constants, timing, and state definitions.
 * Edit this file to tune animation behavior without touching game logic.
 *
 * AAA Animation State Machine Configuration:
 *   - Full state hierarchy: LOCOMOTION / STANCE / COMBAT / DIRECTIONAL / TRANSITION / DEATH
 *   - Priority-based transition resolution
 *   - Blend parameter definitions (speed, direction, stance, combat)
 *   - 3-layer animation system (Locomotion, Upper Body, Additive)
 *   - Entry → Loop → Exit animation cycles per state
 *   - Smooth crossfade blending with configurable durations
 *
 * Animation Packs:
 *   - Pro Rifle Pack:  Idle, 8-way walk/run/sprint, crouch 8-way, turns, jump, death
 *   - Basic Shooter:   Fire, reload, hit reaction, grenade, strafe
 *   - Pistol Pack:     Pistol idle, run, walk, kneel, strafe
 */

import * as THREE from 'three';
import { AnimationDefinition } from '../utils/MixamoLoader';

// ============================================================
// ANIMATION STATE ENUM — FULL HIERARCHY
// ============================================================

/**
 * All supported animation states in the state machine.
 * Organized by category following AAA state hierarchy:
 *
 *   LOCOMOTION: idle, walk, run, sprint
 *   STANCE: standing, crouching, prone
 *   COMBAT: aiming, firing, reloading, hit reaction
 *   DIRECTIONAL: forward, backward, left, right, diagonal
 *   TRANSITION: start, stop, turn 90, turn 180
 *   DEATH: from front, from back, from side, headshot
 *   PISTOL: pistol weapon set
 */
export enum AnimState {
  // ══════════════════════════════════════════════════
  // LOCOMOTION (Layer 0 — legs + body)
  // ══════════════════════════════════════════════════
  IDLE          = 'idle',
  WALK          = 'walk',
  RUN           = 'run',
  SPRINT        = 'sprint',

  // ── Walk Directional Variants ──
  WALK_FORWARD       = 'walkForward',
  WALK_BACKWARD      = 'walkBackward',
  WALK_LEFT          = 'walkLeft',
  WALK_RIGHT         = 'walkRight',
  WALK_FORWARD_LEFT  = 'walkForwardLeft',
  WALK_FORWARD_RIGHT = 'walkForwardRight',
  WALK_BACKWARD_LEFT = 'walkBackwardLeft',
  WALK_BACKWARD_RIGHT= 'walkBackwardRight',

  // ── Run Directional Variants ──
  RUN_FORWARD        = 'runForward',
  RUN_BACKWARD       = 'runBackward',
  RUN_LEFT           = 'runLeft',
  RUN_RIGHT          = 'runRight',
  RUN_FORWARD_LEFT   = 'runForwardLeft',
  RUN_FORWARD_RIGHT  = 'runForwardRight',
  RUN_BACKWARD_LEFT  = 'runBackwardLeft',
  RUN_BACKWARD_RIGHT = 'runBackwardRight',

  // ── Sprint Directional Variants ──
  SPRINT_FORWARD     = 'sprintForward',
  SPRINT_BACKWARD    = 'sprintBackward',
  SPRINT_LEFT        = 'sprintLeft',
  SPRINT_RIGHT       = 'sprintRight',
  SPRINT_FORWARD_LEFT = 'sprintForwardLeft',
  SPRINT_FORWARD_RIGHT= 'sprintForwardRight',
  SPRINT_BACKWARD_LEFT= 'sprintBackwardLeft',
  SPRINT_BACKWARD_RIGHT='sprintBackwardRight',

  // ══════════════════════════════════════════════════
  // STANCE (Layer 0 — full body override)
  // ══════════════════════════════════════════════════
  CROUCH_IDLE   = 'crouchIdle',
  CROUCH_WALK   = 'crouchWalk',

  // ── Crouch Walk Directional Variants ──
  CROUCH_WALK_FORWARD       = 'crouchWalkForward',
  CROUCH_WALK_BACKWARD      = 'crouchWalkBackward',
  CROUCH_WALK_LEFT          = 'crouchWalkLeft',
  CROUCH_WALK_RIGHT         = 'crouchWalkRight',
  CROUCH_WALK_FORWARD_LEFT  = 'crouchWalkForwardLeft',
  CROUCH_WALK_FORWARD_RIGHT = 'crouchWalkForwardRight',
  CROUCH_WALK_BACKWARD_LEFT = 'crouchWalkBackwardLeft',
  CROUCH_WALK_BACKWARD_RIGHT= 'crouchWalkBackwardRight',

  PRONE_IDLE    = 'proneIdle',
  PRONE_CRAWL   = 'proneCrawl',

  // ── Prone Crawl Directional Variants ──
  PRONE_CRAWL_FORWARD  = 'proneCrawlForward',
  PRONE_CRAWL_BACKWARD = 'proneCrawlBackward',
  PRONE_CRAWL_LEFT     = 'proneCrawlLeft',
  PRONE_CRAWL_RIGHT    = 'proneCrawlRight',

  // ══════════════════════════════════════════════════
  // COVER
  // ══════════════════════════════════════════════════
  COVER_IDLE    = 'coverIdle',
  COVER_PEEK    = 'coverPeek',

  // ══════════════════════════════════════════════════
  // COMBAT (Layer 1 — upper body weapon overlay)
  // ══════════════════════════════════════════════════
  RIFLE_IDLE        = 'rifleIdle',
  RIFLE_CROUCH_IDLE = 'rifleCrouchIdle',
  RIFLE_WALK        = 'rifleWalk',
  RIFLE_RUN         = 'rifleRun',
  RIFLE_SHOOT       = 'rifleShoot',
  RIFLE_RELOAD      = 'rifleReload',

  // ── Rifle Directional Variants ──
  RIFLE_WALK_FORWARD  = 'rifleWalkForward',
  RIFLE_WALK_BACKWARD = 'rifleWalkBackward',
  RIFLE_WALK_LEFT     = 'rifleWalkLeft',
  RIFLE_WALK_RIGHT    = 'rifleWalkRight',

  RIFLE_RUN_FORWARD   = 'rifleRunForward',
  RIFLE_RUN_BACKWARD  = 'rifleRunBackward',
  RIFLE_RUN_LEFT      = 'rifleRunLeft',
  RIFLE_RUN_RIGHT     = 'rifleRunRight',

  // ══════════════════════════════════════════════════
  // TRANSITION ANIMATIONS (one-shot bridge clips)
  // ══════════════════════════════════════════════════
  WALK_START    = 'walkStart',
  WALK_STOP     = 'walkStop',
  TURN_LEFT_90  = 'turnLeft90',
  TURN_RIGHT_90 = 'turnRight90',
  TURN_LEFT_180 = 'turnLeft180',
  TURN_RIGHT_180= 'turnRight180',

  // ── Stance Transitions ──
  STAND_TO_CROUCH  = 'standToCrouch',
  CROUCH_TO_STAND  = 'crouchToStand',
  CROUCH_TO_PRONE  = 'crouchToProne',
  PRONE_TO_CROUCH  = 'proneToCrouch',
  STAND_TO_PRONE   = 'standToProne',
  PRONE_TO_STAND   = 'proneToStand',

  // ── Crouch Turn Transitions ──
  CROUCH_TURN_LEFT_90  = 'crouchTurnLeft90',
  CROUCH_TURN_RIGHT_90 = 'crouchTurnRight90',

  // ══════════════════════════════════════════════════
  // DEATH (Layer 0 — terminal, full body)
  // ══════════════════════════════════════════════════
  DEATH              = 'death',
  DEATH_FRONT        = 'deathFront',
  DEATH_BACK         = 'deathBack',
  DEATH_LEFT         = 'deathLeft',
  DEATH_RIGHT        = 'deathRight',
  DEATH_HEADSHOT     = 'deathHeadshot',
  DEATH_FRONT_HEADSHOT  = 'deathFrontHeadshot',
  DEATH_BACK_HEADSHOT   = 'deathBackHeadshot',
  DEATH_CROUCH_FRONT = 'deathCrouchFront',

  // ══════════════════════════════════════════════════
  // HIT REACTIONS (Layer 2 — additive overlay)
  // ══════════════════════════════════════════════════
  HIT_FRONT     = 'hitFront',
  HIT_BACK      = 'hitBack',
  HIT_LEFT      = 'hitLeft',
  HIT_RIGHT     = 'hitRight',
  HIT_REACTION  = 'hitReaction',

  // ══════════════════════════════════════════════════
  // JUMP (Layer 0 — full body override)
  // ══════════════════════════════════════════════════
  JUMP_UP       = 'jumpUp',
  JUMP_LOOP     = 'jumpLoop',
  JUMP_DOWN     = 'jumpDown',

  // ══════════════════════════════════════════════════
  // SOCIAL / AMBIENT
  // ══════════════════════════════════════════════════
  SMOKING       = 'smoking',
  TALKING       = 'talking',
  SITTING       = 'sitting',
  RADIO         = 'radio',
  GRENADE       = 'grenade',

  // ══════════════════════════════════════════════════
  // PISTOL WEAPON SET (Layer 0/1 — full body / upper body)
  // ══════════════════════════════════════════════════
  PISTOL_IDLE        = 'pistolIdle',
  PISTOL_RUN         = 'pistolRun',
  PISTOL_WALK        = 'pistolWalk',
  PISTOL_CROUCH_IDLE = 'pistolCrouchIdle',
  PISTOL_CROUCH_WALK = 'pistolCrouchWalk',
  PISTOL_STRAFE      = 'pistolStrafe',

  // ══════════════════════════════════════════════════
  // ADDITIONAL AIM / COMBAT STATES
  // ══════════════════════════════════════════════════
  AIM_IDLE           = 'aimIdle',
  CROUCH_AIM_IDLE    = 'crouchAimIdle',
  STRAFE             = 'strafe',
}

// ============================================================
// ANIMATION LAYERS
// ============================================================

/**
 * Animation layer definitions for the 3-layer system.
 *
 * Layer 0: Locomotion (legs + body) — primary movement animations
 * Layer 1: Upper Body (arms + weapon) — weapon overlay, ADS, shooting
 * Layer 2: Additive (recoil, hit reaction) — procedural/additive effects
 */
export const ANIM_LAYERS = {
  LOCOMOTION:   0,  // Full body locomotion
  UPPER_BODY:   1,  // Arms + weapon overlay
  ADDITIVE:     2,  // Recoil, hit reaction, procedural
} as const;

export type AnimLayer = typeof ANIM_LAYERS[keyof typeof ANIM_LAYERS];

/**
 * Per-layer configuration: bone masks, blend weights, and priority.
 */
export interface AnimLayerConfig {
  /** Layer index */
  index: AnimLayer;
  /** Layer name for debugging */
  name: string;
  /** Default blend weight (0–1) */
  defaultWeight: number;
  /** Whether this layer uses additive blending */
  additive: boolean;
  /** Bone mask — empty array means all bones */
  boneMask: string[];
  /** Whether this layer can interrupt the layer below */
  canOverride: boolean;
}

export const ANIM_LAYER_CONFIGS: AnimLayerConfig[] = [
  {
    index: 0,
    name: 'Locomotion',
    defaultWeight: 1.0,
    additive: false,
    boneMask: [], // All bones (full body)
    canOverride: true,
  },
  {
    index: 1,
    name: 'UpperBody',
    defaultWeight: 0.0, // Blended in when ADS/combat active
    additive: false,
    boneMask: [
      'Spine1', 'Spine2', 'Neck', 'Head',
      'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
      'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    ],
    canOverride: true,
  },
  {
    index: 2,
    name: 'Additive',
    defaultWeight: 0.0,
    additive: true,
    boneMask: [], // All bones
    canOverride: false,
  },
];

// ============================================================
// BLEND PARAMETERS
// ============================================================

/**
 * Blend parameters for the animation state machine.
 * These drive continuous blending between states rather than
 * discrete state switches.
 */
export interface BlendParameters {
  /** Movement speed: 0 = stationary, 1 = max speed (idle/walk/run/sprint blend) */
  speed: number;
  /** Horizontal direction: -1 = left, 0 = forward, 1 = right */
  directionX: number;
  /** Vertical direction: -1 = backward, 0 = forward, 1 = forward (unused, use forwardWeight) */
  directionY: number;
  /** Forward movement weight: 0 = not moving forward, 1 = full forward */
  forwardWeight: number;
  /** Backward movement weight */
  backwardWeight: number;
  /** Left strafe weight */
  leftWeight: number;
  /** Right strafe weight */
  rightWeight: number;
  /** Stance: 0 = standing, 0.5 = crouching, 1 = prone */
  stanceBlend: number;
  /** Combat: 0 = hip fire / no weapon, 1 = ADS (aiming down sights) */
  combatBlend: number;
  /** Turn angle in degrees (positive = right, negative = left) */
  turnAngle: number;
  /** Recoil intensity (0–1, driven by weapon system) */
  recoilIntensity: number;
  /** Hit reaction intensity (0–1, driven by damage system) */
  hitIntensity: number;
}

/** Create default (neutral) blend parameters */
export function createDefaultBlendParams(): BlendParameters {
  return {
    speed: 0,
    directionX: 0,
    directionY: 0,
    forwardWeight: 0,
    backwardWeight: 0,
    leftWeight: 0,
    rightWeight: 0,
    stanceBlend: 0,
    combatBlend: 0,
    turnAngle: 0,
    recoilIntensity: 0,
    hitIntensity: 0,
  };
}

/**
 * Compute directional blend weights from raw input.
 * Converts a 2D movement vector into per-direction weights
 * for blend tree evaluation.
 */
export function computeDirectionalWeights(
  moveX: number,  // -1 (left) to 1 (right)
  moveY: number,  // -1 (backward) to 1 (forward)
): { forward: number; backward: number; left: number; right: number } {
  const forward  = Math.max(0, moveY);
  const backward = Math.max(0, -moveY);
  const left     = Math.max(0, -moveX);
  const right    = Math.max(0, moveX);

  return { forward, backward, left, right };
}

/**
 * Compute the effective locomotion speed category from a normalized speed value.
 * Returns a blend factor: 0 = idle, 0.33 = walk, 0.66 = run, 1.0 = sprint
 */
export function computeSpeedBlend(normalizedSpeed: number): number {
  return Math.max(0, Math.min(1, normalizedSpeed));
}

/**
 * Resolve which discrete locomotion state to use based on speed threshold.
 */
export function resolveLocomotionState(
  speed: number,
  thresholds: { walk: number; run: number; sprint: number } = {
    walk: 0.1,
    run: 0.5,
    sprint: 0.85,
  },
): AnimState {
  if (speed >= thresholds.sprint) return AnimState.SPRINT;
  if (speed >= thresholds.run)    return AnimState.RUN;
  if (speed >= thresholds.walk)   return AnimState.WALK;
  return AnimState.IDLE;
}

/**
 * Resolve which directional variant to use based on movement vector.
 */
export function resolveDirectionalState(
  baseState: AnimState,
  moveX: number,
  moveY: number,
): AnimState {
  // Determine if there's significant lateral or backward movement
  const absX = Math.abs(moveX);
  const absY = Math.abs(moveY);
  const diagThreshold = 0.4; // Minimum ratio for diagonal detection

  // Pure forward (most common — no variant needed, use base state)
  if (absY > 0.5 && absX < 0.3) {
    return moveY > 0 ? baseState : getBackwardVariant(baseState);
  }

  // Pure backward
  if (absY > 0.5 && absX < 0.3 && moveY < 0) {
    return getBackwardVariant(baseState);
  }

  // Pure left/right strafe
  if (absX > 0.5 && absY < 0.3) {
    return moveX < 0 ? getLeftVariant(baseState) : getRightVariant(baseState);
  }

  // Diagonal
  if (absX > diagThreshold && absY > diagThreshold) {
    if (moveY > 0) {
      return moveX < 0 ? getForwardLeftVariant(baseState) : getForwardRightVariant(baseState);
    } else {
      return moveX < 0 ? getBackwardLeftVariant(baseState) : getBackwardRightVariant(baseState);
    }
  }

  // Default: base state (forward)
  return baseState;
}

/** Mapping from base state to directional variants */
const DIRECTIONAL_MAP: Record<string, { forward?: string; backward?: string; left?: string; right?: string; forwardLeft?: string; forwardRight?: string; backwardLeft?: string; backwardRight?: string }> = {
  [AnimState.WALK]: {
    forward: AnimState.WALK_FORWARD,
    backward: AnimState.WALK_BACKWARD,
    left: AnimState.WALK_LEFT,
    right: AnimState.WALK_RIGHT,
    forwardLeft: AnimState.WALK_FORWARD_LEFT,
    forwardRight: AnimState.WALK_FORWARD_RIGHT,
    backwardLeft: AnimState.WALK_BACKWARD_LEFT,
    backwardRight: AnimState.WALK_BACKWARD_RIGHT,
  },
  [AnimState.RUN]: {
    forward: AnimState.RUN_FORWARD,
    backward: AnimState.RUN_BACKWARD,
    left: AnimState.RUN_LEFT,
    right: AnimState.RUN_RIGHT,
    forwardLeft: AnimState.RUN_FORWARD_LEFT,
    forwardRight: AnimState.RUN_FORWARD_RIGHT,
    backwardLeft: AnimState.RUN_BACKWARD_LEFT,
    backwardRight: AnimState.RUN_BACKWARD_RIGHT,
  },
  [AnimState.SPRINT]: {
    forward: AnimState.SPRINT_FORWARD,
    backward: AnimState.SPRINT_BACKWARD,
    left: AnimState.SPRINT_LEFT,
    right: AnimState.SPRINT_RIGHT,
    forwardLeft: AnimState.SPRINT_FORWARD_LEFT,
    forwardRight: AnimState.SPRINT_FORWARD_RIGHT,
    backwardLeft: AnimState.SPRINT_BACKWARD_LEFT,
    backwardRight: AnimState.SPRINT_BACKWARD_RIGHT,
  },
  [AnimState.CROUCH_WALK]: {
    forward: AnimState.CROUCH_WALK_FORWARD,
    backward: AnimState.CROUCH_WALK_BACKWARD,
    left: AnimState.CROUCH_WALK_LEFT,
    right: AnimState.CROUCH_WALK_RIGHT,
    forwardLeft: AnimState.CROUCH_WALK_FORWARD_LEFT,
    forwardRight: AnimState.CROUCH_WALK_FORWARD_RIGHT,
    backwardLeft: AnimState.CROUCH_WALK_BACKWARD_LEFT,
    backwardRight: AnimState.CROUCH_WALK_BACKWARD_RIGHT,
  },
  [AnimState.PRONE_CRAWL]: {
    forward: AnimState.PRONE_CRAWL_FORWARD,
    backward: AnimState.PRONE_CRAWL_BACKWARD,
    left: AnimState.PRONE_CRAWL_LEFT,
    right: AnimState.PRONE_CRAWL_RIGHT,
  },
  [AnimState.RIFLE_WALK]: {
    forward: AnimState.RIFLE_WALK_FORWARD,
    backward: AnimState.RIFLE_WALK_BACKWARD,
    left: AnimState.RIFLE_WALK_LEFT,
    right: AnimState.RIFLE_WALK_RIGHT,
  },
  [AnimState.RIFLE_RUN]: {
    forward: AnimState.RIFLE_RUN_FORWARD,
    backward: AnimState.RIFLE_RUN_BACKWARD,
    left: AnimState.RIFLE_RUN_LEFT,
    right: AnimState.RIFLE_RUN_RIGHT,
  },
};

function getBackwardVariant(base: AnimState): AnimState {
  const map = DIRECTIONAL_MAP[base];
  return (map?.backward as AnimState) ?? base;
}

function getLeftVariant(base: AnimState): AnimState {
  const map = DIRECTIONAL_MAP[base];
  return (map?.left as AnimState) ?? base;
}

function getRightVariant(base: AnimState): AnimState {
  const map = DIRECTIONAL_MAP[base];
  return (map?.right as AnimState) ?? base;
}

function getForwardLeftVariant(base: AnimState): AnimState {
  const map = DIRECTIONAL_MAP[base];
  return (map?.forwardLeft as AnimState) ?? base;
}

function getForwardRightVariant(base: AnimState): AnimState {
  const map = DIRECTIONAL_MAP[base];
  return (map?.forwardRight as AnimState) ?? base;
}

function getBackwardLeftVariant(base: AnimState): AnimState {
  const map = DIRECTIONAL_MAP[base];
  return (map?.backwardLeft as AnimState) ?? base;
}

function getBackwardRightVariant(base: AnimState): AnimState {
  const map = DIRECTIONAL_MAP[base];
  return (map?.backwardRight as AnimState) ?? base;
}

// ============================================================
// STATE PRIORITY
// ============================================================

/**
 * Higher priority states can interrupt lower priority ones.
 * Used for automatic transition resolution when multiple states
 * could be active (e.g., DEATH always wins).
 *
 * Priority tiers:
 *   100: Death (terminal)
 *    90: Hit reactions (immediate override)
 *    80: Shooting (combat override)
 *    78: Grenade throw
 *    75: Reload
 *    70: Cover
 *    65: ADS (rifle aiming)
 *    55: Jump
 *    52: Turn transitions
 *    50: Prone
 *    45: Stance transitions
 *    40: Crouch
 *    35: Sprint
 *    30: Run
 *    25: Walk transitions
 *    20: Walk
 *    10: Idle (default lowest)
 */
export const STATE_PRIORITY: Record<string, number> = {
  // ── Death: terminal, highest ──
  [AnimState.DEATH]:               100,
  [AnimState.DEATH_FRONT]:         100,
  [AnimState.DEATH_BACK]:          100,
  [AnimState.DEATH_LEFT]:          100,
  [AnimState.DEATH_RIGHT]:         100,
  [AnimState.DEATH_HEADSHOT]:      100,
  [AnimState.DEATH_FRONT_HEADSHOT]: 100,
  [AnimState.DEATH_BACK_HEADSHOT]: 100,
  [AnimState.DEATH_CROUCH_FRONT]:  100,

  // ── Hit reactions: immediate override ──
  [AnimState.HIT_FRONT]:    90,
  [AnimState.HIT_BACK]:     90,
  [AnimState.HIT_LEFT]:     90,
  [AnimState.HIT_RIGHT]:    90,
  [AnimState.HIT_REACTION]: 90,

  // ── Combat ──
  [AnimState.RIFLE_SHOOT]:  80,
  [AnimState.GRENADE]:      78,
  [AnimState.RIFLE_RELOAD]: 75,

  // ── Cover ──
  [AnimState.COVER_IDLE]:   70,
  [AnimState.COVER_PEEK]:   70,

  // ── ADS (rifle aiming) ──
  [AnimState.RIFLE_IDLE]:        65,
  [AnimState.RIFLE_CROUCH_IDLE]: 65,
  [AnimState.RIFLE_WALK]:        65,
  [AnimState.RIFLE_RUN]:         65,
  [AnimState.RIFLE_WALK_FORWARD]:  65,
  [AnimState.RIFLE_WALK_BACKWARD]: 65,
  [AnimState.RIFLE_WALK_LEFT]:     65,
  [AnimState.RIFLE_WALK_RIGHT]:    65,
  [AnimState.RIFLE_RUN_FORWARD]:   65,
  [AnimState.RIFLE_RUN_BACKWARD]:  65,
  [AnimState.RIFLE_RUN_LEFT]:      65,
  [AnimState.RIFLE_RUN_RIGHT]:     65,

  // ── Jump ──
  [AnimState.JUMP_UP]:    55,
  [AnimState.JUMP_LOOP]:  55,
  [AnimState.JUMP_DOWN]:  55,

  // ── Turn transitions ──
  [AnimState.TURN_LEFT_90]:       52,
  [AnimState.TURN_RIGHT_90]:      52,
  [AnimState.TURN_LEFT_180]:      52,
  [AnimState.TURN_RIGHT_180]:     52,
  [AnimState.CROUCH_TURN_LEFT_90]:  52,
  [AnimState.CROUCH_TURN_RIGHT_90]: 52,

  // ── Prone ──
  [AnimState.PRONE_IDLE]:    50,
  [AnimState.PRONE_CRAWL]:   50,
  [AnimState.PRONE_CRAWL_FORWARD]:  50,
  [AnimState.PRONE_CRAWL_BACKWARD]: 50,
  [AnimState.PRONE_CRAWL_LEFT]:     50,
  [AnimState.PRONE_CRAWL_RIGHT]:    50,

  // ── Stance transitions ──
  [AnimState.STAND_TO_CROUCH]:  45,
  [AnimState.CROUCH_TO_STAND]:  45,
  [AnimState.CROUCH_TO_PRONE]:  45,
  [AnimState.PRONE_TO_CROUCH]:  45,
  [AnimState.STAND_TO_PRONE]:   45,
  [AnimState.PRONE_TO_STAND]:   45,

  // ── Crouch ──
  [AnimState.CROUCH_IDLE]:   40,
  [AnimState.CROUCH_WALK]:   40,
  [AnimState.CROUCH_WALK_FORWARD]:  40,
  [AnimState.CROUCH_WALK_BACKWARD]: 40,
  [AnimState.CROUCH_WALK_LEFT]:     40,
  [AnimState.CROUCH_WALK_RIGHT]:    40,
  [AnimState.CROUCH_WALK_FORWARD_LEFT]:  40,
  [AnimState.CROUCH_WALK_FORWARD_RIGHT]: 40,
  [AnimState.CROUCH_WALK_BACKWARD_LEFT]:  40,
  [AnimState.CROUCH_WALK_BACKWARD_RIGHT]: 40,

  // ── Sprint ──
  [AnimState.SPRINT]:              35,
  [AnimState.SPRINT_FORWARD]:      35,
  [AnimState.SPRINT_BACKWARD]:     35,
  [AnimState.SPRINT_LEFT]:         35,
  [AnimState.SPRINT_RIGHT]:        35,
  [AnimState.SPRINT_FORWARD_LEFT]:  35,
  [AnimState.SPRINT_FORWARD_RIGHT]: 35,
  [AnimState.SPRINT_BACKWARD_LEFT]: 35,
  [AnimState.SPRINT_BACKWARD_RIGHT]:35,

  // ── Run ──
  [AnimState.RUN]:              30,
  [AnimState.RUN_FORWARD]:      30,
  [AnimState.RUN_BACKWARD]:     30,
  [AnimState.RUN_LEFT]:         30,
  [AnimState.RUN_RIGHT]:        30,
  [AnimState.RUN_FORWARD_LEFT]:  30,
  [AnimState.RUN_FORWARD_RIGHT]: 30,
  [AnimState.RUN_BACKWARD_LEFT]: 30,
  [AnimState.RUN_BACKWARD_RIGHT]:30,

  // ── Walk transitions ──
  [AnimState.WALK_START]:  25,
  [AnimState.WALK_STOP]:   25,

  // ── Walk ──
  [AnimState.WALK]:              20,
  [AnimState.WALK_FORWARD]:      20,
  [AnimState.WALK_BACKWARD]:     20,
  [AnimState.WALK_LEFT]:         20,
  [AnimState.WALK_RIGHT]:        20,
  [AnimState.WALK_FORWARD_LEFT]:  20,
  [AnimState.WALK_FORWARD_RIGHT]: 20,
  [AnimState.WALK_BACKWARD_LEFT]: 20,
  [AnimState.WALK_BACKWARD_RIGHT]:20,

  // ── Idle: lowest ──
  [AnimState.IDLE]: 10,

  // ── Pistol weapon set (rifle-equivalent priorities) ──
  [AnimState.PISTOL_IDLE]:        65,
  [AnimState.PISTOL_CROUCH_IDLE]: 65,
  [AnimState.PISTOL_WALK]:        60,
  [AnimState.PISTOL_RUN]:         60,
  [AnimState.PISTOL_CROUCH_WALK]: 55,
  [AnimState.PISTOL_STRAFE]:      60,

  // ── Aim states ──
  [AnimState.AIM_IDLE]:           65,
  [AnimState.CROUCH_AIM_IDLE]:    65,

  // ── Strafe ──
  [AnimState.STRAFE]:             30,
};

// ============================================================
// MIXAMO ANIMATION MAP
// ============================================================

/**
 * Maps every AnimState to its actual FBX file source (from downloaded packs),
 * whether the clip loops or plays once, and the playback time scale.
 *
 * Animation Sources:
 *   PRO RIFLE PACK  — Primary: idle, locomotion (8-way), crouch, sprint, jump, death, turns
 *   BASIC SHOOTER   — Actions: fire, reload, hit reaction, grenade, strafe
 *   PISTOL PACK     — Pistol weapon set
 */
export interface MixamoAnimEntry {
  /** Exact Mixamo library animation name (as downloaded) */
  mixamoName: string;
  /** Source pack */
  pack: 'pro-rifle' | 'basic-shooter' | 'pistol';
  /** Exact FBX filename on disk */
  file: string;
  /** Loop mode: true = loop continuously, false = play once (one-shot) */
  loop: boolean;
  /** Playback speed multiplier (1.0 = original Mixamo speed) */
  timeScale: number;
  /** Clamp at final frame when one-shot (keeps the pose held) */
  clampWhenFinished: boolean;
  /** Blend group: which animation layer / blend group this belongs to */
  blendGroup: 'locomotion' | 'upperBody' | 'fullBody' | 'additive' | 'stance' | 'reaction';
}

export const MIXAMO_ANIMATION_MAP: Record<string, MixamoAnimEntry> = {

  // ════════════════════════════════════════════════════════════
  // IDLE STATES — Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.IDLE]: {
    mixamoName: 'Idle', pack: 'pro-rifle', file: 'idle.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.AIM_IDLE]: {
    mixamoName: 'Idle Aiming', pack: 'pro-rifle', file: 'idle aiming.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'upperBody',
  },
  [AnimState.CROUCH_IDLE]: {
    mixamoName: 'Idle Crouching', pack: 'pro-rifle', file: 'idle crouching.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_AIM_IDLE]: {
    mixamoName: 'Idle Crouching Aiming', pack: 'pro-rifle', file: 'idle crouching aiming.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'upperBody',
  },

  // ════════════════════════════════════════════════════════════
  // WALK (8-Way) — Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.WALK]: {
    mixamoName: 'Walk Forward', pack: 'pro-rifle', file: 'walk forward.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.WALK_FORWARD]: {
    mixamoName: 'Walk Forward', pack: 'pro-rifle', file: 'walk forward.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.WALK_BACKWARD]: {
    mixamoName: 'Walk Backward', pack: 'pro-rifle', file: 'walk backward.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.WALK_LEFT]: {
    mixamoName: 'Walk Left', pack: 'pro-rifle', file: 'walk left.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.WALK_RIGHT]: {
    mixamoName: 'Walk Right', pack: 'pro-rifle', file: 'walk right.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.WALK_FORWARD_LEFT]: {
    mixamoName: 'Walk Forward Left', pack: 'pro-rifle', file: 'walk forward left.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.WALK_FORWARD_RIGHT]: {
    mixamoName: 'Walk Forward Right', pack: 'pro-rifle', file: 'walk forward right.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.WALK_BACKWARD_LEFT]: {
    mixamoName: 'Walk Backward Left', pack: 'pro-rifle', file: 'walk backward left.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.WALK_BACKWARD_RIGHT]: {
    mixamoName: 'Walk Backward Right', pack: 'pro-rifle', file: 'walk backward right.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // RUN (8-Way) — Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.RUN]: {
    mixamoName: 'Run Forward', pack: 'pro-rifle', file: 'run forward.fbx',
    loop: true, timeScale: 1.15, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RUN_FORWARD]: {
    mixamoName: 'Run Forward', pack: 'pro-rifle', file: 'run forward.fbx',
    loop: true, timeScale: 1.15, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RUN_BACKWARD]: {
    mixamoName: 'Run Backward', pack: 'pro-rifle', file: 'run backward.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RUN_LEFT]: {
    mixamoName: 'Run Left', pack: 'pro-rifle', file: 'run left.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RUN_RIGHT]: {
    mixamoName: 'Run Right', pack: 'pro-rifle', file: 'run right.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RUN_FORWARD_LEFT]: {
    mixamoName: 'Run Forward Left', pack: 'pro-rifle', file: 'run forward left.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RUN_FORWARD_RIGHT]: {
    mixamoName: 'Run Forward Right', pack: 'pro-rifle', file: 'run forward right.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RUN_BACKWARD_LEFT]: {
    mixamoName: 'Run Backward Left', pack: 'pro-rifle', file: 'run backward left.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RUN_BACKWARD_RIGHT]: {
    mixamoName: 'Run Backward Right', pack: 'pro-rifle', file: 'run backward right.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // SPRINT (8-Way) — Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.SPRINT]: {
    mixamoName: 'Sprint Forward', pack: 'pro-rifle', file: 'sprint forward.fbx',
    loop: true, timeScale: 1.25, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SPRINT_FORWARD]: {
    mixamoName: 'Sprint Forward', pack: 'pro-rifle', file: 'sprint forward.fbx',
    loop: true, timeScale: 1.25, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SPRINT_BACKWARD]: {
    mixamoName: 'Sprint Backward', pack: 'pro-rifle', file: 'sprint backward.fbx',
    loop: true, timeScale: 1.2, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SPRINT_LEFT]: {
    mixamoName: 'Sprint Left', pack: 'pro-rifle', file: 'sprint left.fbx',
    loop: true, timeScale: 1.2, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SPRINT_RIGHT]: {
    mixamoName: 'Sprint Right', pack: 'pro-rifle', file: 'sprint right.fbx',
    loop: true, timeScale: 1.2, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SPRINT_FORWARD_LEFT]: {
    mixamoName: 'Sprint Forward Left', pack: 'pro-rifle', file: 'sprint forward left.fbx',
    loop: true, timeScale: 1.2, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SPRINT_FORWARD_RIGHT]: {
    mixamoName: 'Sprint Forward Right', pack: 'pro-rifle', file: 'sprint forward right.fbx',
    loop: true, timeScale: 1.2, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SPRINT_BACKWARD_LEFT]: {
    mixamoName: 'Sprint Backward Left', pack: 'pro-rifle', file: 'sprint backward left.fbx',
    loop: true, timeScale: 1.2, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SPRINT_BACKWARD_RIGHT]: {
    mixamoName: 'Sprint Backward Right', pack: 'pro-rifle', file: 'sprint backward right.fbx',
    loop: true, timeScale: 1.2, clampWhenFinished: false, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // CROUCH WALK (8-Way) — Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.CROUCH_WALK]: {
    mixamoName: 'Walk Crouching Forward', pack: 'pro-rifle', file: 'walk crouching forward.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_WALK_FORWARD]: {
    mixamoName: 'Walk Crouching Forward', pack: 'pro-rifle', file: 'walk crouching forward.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_WALK_BACKWARD]: {
    mixamoName: 'Walk Crouching Backward', pack: 'pro-rifle', file: 'walk crouching backward.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_WALK_LEFT]: {
    mixamoName: 'Walk Crouching Left', pack: 'pro-rifle', file: 'walk crouching left.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_WALK_RIGHT]: {
    mixamoName: 'Walk Crouching Right', pack: 'pro-rifle', file: 'walk crouching right.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_WALK_FORWARD_LEFT]: {
    mixamoName: 'Walk Crouching Forward Left', pack: 'pro-rifle', file: 'walk crouching forward left.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_WALK_FORWARD_RIGHT]: {
    mixamoName: 'Walk Crouching Forward Right', pack: 'pro-rifle', file: 'walk crouching forward right.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_WALK_BACKWARD_LEFT]: {
    mixamoName: 'Walk Crouching Backward Left', pack: 'pro-rifle', file: 'walk crouching backward left.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_WALK_BACKWARD_RIGHT]: {
    mixamoName: 'Walk Crouching Backward Right', pack: 'pro-rifle', file: 'walk crouching backward right.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // TURN TRANSITIONS — Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.TURN_LEFT_90]: {
    mixamoName: 'Turn 90 Left', pack: 'pro-rifle', file: 'turn 90 left.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.TURN_RIGHT_90]: {
    mixamoName: 'Turn 90 Right', pack: 'pro-rifle', file: 'turn 90 right.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.TURN_LEFT_180]: {
    mixamoName: 'Turn 90 Left', pack: 'pro-rifle', file: 'turn 90 left.fbx',
    loop: false, timeScale: 1.5, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.TURN_RIGHT_180]: {
    mixamoName: 'Turn 90 Right', pack: 'pro-rifle', file: 'turn 90 right.fbx',
    loop: false, timeScale: 1.5, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_TURN_LEFT_90]: {
    mixamoName: 'Crouching Turn 90 Left', pack: 'pro-rifle', file: 'crouching turn 90 left.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_TURN_RIGHT_90]: {
    mixamoName: 'Crouching Turn 90 Right', pack: 'pro-rifle', file: 'crouching turn 90 right.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // JUMP — Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.JUMP_UP]: {
    mixamoName: 'Jump Up', pack: 'pro-rifle', file: 'jump up.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'fullBody',
  },
  [AnimState.JUMP_LOOP]: {
    mixamoName: 'Jump Loop', pack: 'pro-rifle', file: 'jump loop.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'fullBody',
  },
  [AnimState.JUMP_DOWN]: {
    mixamoName: 'Jump Down', pack: 'pro-rifle', file: 'jump down.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },

  // ════════════════════════════════════════════════════════════
  // DEATH — Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.DEATH]: {
    mixamoName: 'Death from the Front', pack: 'pro-rifle', file: 'death from the front.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },
  [AnimState.DEATH_FRONT]: {
    mixamoName: 'Death from the Front', pack: 'pro-rifle', file: 'death from the front.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },
  [AnimState.DEATH_BACK]: {
    mixamoName: 'Death from the Back', pack: 'pro-rifle', file: 'death from the back.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },
  [AnimState.DEATH_LEFT]: {
    mixamoName: 'Death from Right', pack: 'pro-rifle', file: 'death from right.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },
  [AnimState.DEATH_RIGHT]: {
    mixamoName: 'Death from Right', pack: 'pro-rifle', file: 'death from right.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },
  [AnimState.DEATH_HEADSHOT]: {
    mixamoName: 'Death from Front Headshot', pack: 'pro-rifle', file: 'death from front headshot.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },
  [AnimState.DEATH_FRONT_HEADSHOT]: {
    mixamoName: 'Death from Front Headshot', pack: 'pro-rifle', file: 'death from front headshot.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },
  [AnimState.DEATH_BACK_HEADSHOT]: {
    mixamoName: 'Death from Back Headshot', pack: 'pro-rifle', file: 'death from back headshot.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },
  [AnimState.DEATH_CROUCH_FRONT]: {
    mixamoName: 'Death Crouching Headshot Front', pack: 'pro-rifle', file: 'death crouching headshot front.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'fullBody',
  },

  // ════════════════════════════════════════════════════════════
  // COMBAT ACTIONS — Basic Shooter Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.RIFLE_SHOOT]: {
    mixamoName: 'Firing Rifle', pack: 'basic-shooter', file: 'firing rifle.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'upperBody',
  },
  [AnimState.RIFLE_RELOAD]: {
    mixamoName: 'Reloading', pack: 'basic-shooter', file: 'reloading.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'upperBody',
  },
  [AnimState.HIT_REACTION]: {
    mixamoName: 'Hit Reaction', pack: 'basic-shooter', file: 'hit reaction.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'additive',
  },
  [AnimState.GRENADE]: {
    mixamoName: 'Toss Grenade', pack: 'basic-shooter', file: 'toss grenade.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'upperBody',
  },
  [AnimState.STRAFE]: {
    mixamoName: 'Strafe', pack: 'basic-shooter', file: 'strafe.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // HIT REACTIONS — Basic Shooter Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.HIT_FRONT]: {
    mixamoName: 'Hit Reaction', pack: 'basic-shooter', file: 'hit reaction.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'additive',
  },
  [AnimState.HIT_BACK]: {
    mixamoName: 'Hit Reaction', pack: 'basic-shooter', file: 'hit reaction.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'additive',
  },
  [AnimState.HIT_LEFT]: {
    mixamoName: 'Hit Reaction', pack: 'basic-shooter', file: 'hit reaction.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'additive',
  },
  [AnimState.HIT_RIGHT]: {
    mixamoName: 'Hit Reaction', pack: 'basic-shooter', file: 'hit reaction.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'additive',
  },

  // ════════════════════════════════════════════════════════════
  // PISTOL WEAPON SET — Pistol Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.PISTOL_IDLE]: {
    mixamoName: 'Pistol Idle', pack: 'pistol', file: 'pistol idle.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'upperBody',
  },
  [AnimState.PISTOL_RUN]: {
    mixamoName: 'Pistol Run', pack: 'pistol', file: 'pistol run.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PISTOL_WALK]: {
    mixamoName: 'Pistol Walk', pack: 'pistol', file: 'pistol walk.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PISTOL_CROUCH_IDLE]: {
    mixamoName: 'Pistol Kneeling Idle', pack: 'pistol', file: 'pistol kneeling idle.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PISTOL_CROUCH_WALK]: {
    mixamoName: 'Pistol Walk', pack: 'pistol', file: 'pistol walk.fbx',
    loop: true, timeScale: 0.85, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PISTOL_STRAFE]: {
    mixamoName: 'Pistol Strafe', pack: 'pistol', file: 'pistol strafe.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // COVER — Reuse aim idle from Pro Rifle Pack
  // ════════════════════════════════════════════════════════════
  [AnimState.COVER_IDLE]: {
    mixamoName: 'Idle Aiming', pack: 'pro-rifle', file: 'idle aiming.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'stance',
  },
  [AnimState.COVER_PEEK]: {
    mixamoName: 'Idle Aiming', pack: 'pro-rifle', file: 'idle aiming.fbx',
    loop: false, timeScale: 1.2, clampWhenFinished: true, blendGroup: 'stance',
  },

  // ════════════════════════════════════════════════════════════
  // RIFLE ADS — Pro Rifle Pack (aim idle as upper body overlay)
  // ════════════════════════════════════════════════════════════
  [AnimState.RIFLE_IDLE]: {
    mixamoName: 'Idle Aiming', pack: 'pro-rifle', file: 'idle aiming.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'upperBody',
  },
  [AnimState.RIFLE_CROUCH_IDLE]: {
    mixamoName: 'Idle Crouching Aiming', pack: 'pro-rifle', file: 'idle crouching aiming.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'upperBody',
  },
  [AnimState.RIFLE_WALK]: {
    mixamoName: 'Idle Aiming', pack: 'pro-rifle', file: 'idle aiming.fbx',
    loop: true, timeScale: 0.95, clampWhenFinished: false, blendGroup: 'upperBody',
  },
  [AnimState.RIFLE_RUN]: {
    mixamoName: 'Idle Aiming', pack: 'pro-rifle', file: 'idle aiming.fbx',
    loop: true, timeScale: 1.1, clampWhenFinished: false, blendGroup: 'upperBody',
  },

  // ════════════════════════════════════════════════════════════
  // SOCIAL / AMBIENT — Fallback to idle animations
  // ════════════════════════════════════════════════════════════
  [AnimState.SMOKING]: {
    mixamoName: 'Idle', pack: 'pro-rifle', file: 'idle.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.TALKING]: {
    mixamoName: 'Idle', pack: 'pro-rifle', file: 'idle.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.SITTING]: {
    mixamoName: 'Idle Crouching', pack: 'pro-rifle', file: 'idle crouching.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.RADIO]: {
    mixamoName: 'Idle', pack: 'pro-rifle', file: 'idle.fbx',
    loop: true, timeScale: 1.0, clampWhenFinished: false, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // STANCE TRANSITIONS — Use crouch/idle as one-shot bridges
  // ════════════════════════════════════════════════════════════
  [AnimState.STAND_TO_CROUCH]: {
    mixamoName: 'Idle Crouching', pack: 'pro-rifle', file: 'idle crouching.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_TO_STAND]: {
    mixamoName: 'Idle', pack: 'pro-rifle', file: 'idle.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.CROUCH_TO_PRONE]: {
    mixamoName: 'Idle Crouching', pack: 'pro-rifle', file: 'idle crouching.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.PRONE_TO_CROUCH]: {
    mixamoName: 'Idle Crouching', pack: 'pro-rifle', file: 'idle crouching.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.STAND_TO_PRONE]: {
    mixamoName: 'Idle Crouching', pack: 'pro-rifle', file: 'idle crouching.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.PRONE_TO_STAND]: {
    mixamoName: 'Idle', pack: 'pro-rifle', file: 'idle.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // WALK START/STOP — Crossfade bridges
  // ════════════════════════════════════════════════════════════
  [AnimState.WALK_START]: {
    mixamoName: 'Walk Forward', pack: 'pro-rifle', file: 'walk forward.fbx',
    loop: false, timeScale: 1.0, clampWhenFinished: true, blendGroup: 'locomotion',
  },
  [AnimState.WALK_STOP]: {
    mixamoName: 'Walk Forward', pack: 'pro-rifle', file: 'walk forward.fbx',
    loop: false, timeScale: 0.5, clampWhenFinished: true, blendGroup: 'locomotion',
  },

  // ════════════════════════════════════════════════════════════
  // PRONE — Use crouch locomotion at reduced speed as fallback
  // ════════════════════════════════════════════════════════════
  [AnimState.PRONE_IDLE]: {
    mixamoName: 'Idle Crouching', pack: 'pro-rifle', file: 'idle crouching.fbx',
    loop: true, timeScale: 0.8, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PRONE_CRAWL]: {
    mixamoName: 'Walk Crouching Forward', pack: 'pro-rifle', file: 'walk crouching forward.fbx',
    loop: true, timeScale: 0.65, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PRONE_CRAWL_FORWARD]: {
    mixamoName: 'Walk Crouching Forward', pack: 'pro-rifle', file: 'walk crouching forward.fbx',
    loop: true, timeScale: 0.65, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PRONE_CRAWL_BACKWARD]: {
    mixamoName: 'Walk Crouching Backward', pack: 'pro-rifle', file: 'walk crouching backward.fbx',
    loop: true, timeScale: 0.65, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PRONE_CRAWL_LEFT]: {
    mixamoName: 'Walk Crouching Left', pack: 'pro-rifle', file: 'walk crouching left.fbx',
    loop: true, timeScale: 0.65, clampWhenFinished: false, blendGroup: 'locomotion',
  },
  [AnimState.PRONE_CRAWL_RIGHT]: {
    mixamoName: 'Walk Crouching Right', pack: 'pro-rifle', file: 'walk crouching right.fbx',
    loop: true, timeScale: 0.65, clampWhenFinished: false, blendGroup: 'locomotion',
  },
};

/** Get the Mixamo animation entry for a given game state */
export function getMixamoEntry(state: string): MixamoAnimEntry | undefined {
  return MIXAMO_ANIMATION_MAP[state];
}

/** Get the Mixamo clip name for a given game state */
export function getMixamoClipName(state: string): string {
  return MIXAMO_ANIMATION_MAP[state]?.mixamoName ?? state;
}

// ============================================================
// ANIMATION PACK PATHS
// ============================================================

/** Base paths for each downloaded animation pack */
export const ANIMATION_PACK_PATHS = {
  PRO_RIFLE:    '/assets/animations/Pro Rifle Pack',
  BASIC_SHOOTER:'/assets/animations/Basic Shooter Pack',
  PISTOL:       '/assets/animations/PistolHandgun Locomotion Pack',
  LITE_RIFLE:   '/assets/animations/Lite Rifle Pack',
  RIFLE_8WAY:   '/assets/animations/Rifle 8-Way Locomotion Pack',
  SHOOTER:      '/assets/animations/Shooter Pack',
  SLIM_SHOOTER: '/assets/animations/Slim Shooter Pack',
} as const;

// ============================================================
// ANIMATION ASSET DEFINITIONS
// ============================================================

/**
 * Wolf character animations — Assault rifle operator.
 *
 * Each entry maps a logical animation name to an actual FBX file.
 * Files are loaded from pack directories (set at load time).
 * Format: { name: AnimState key, file: FBX filename, loop: THREE loop mode }
 */
export const WOLF_ANIMATIONS: AnimationDefinition[] = [
  // ══════════════════════════════════════════════
  // Pro Rifle Pack: Idle
  // ══════════════════════════════════════════════
  { name: 'idle',              file: 'idle.fbx',                    loop: THREE.LoopRepeat },
  { name: 'aimIdle',           file: 'idle aiming.fbx',             loop: THREE.LoopRepeat },
  { name: 'crouchIdle',        file: 'idle crouching.fbx',          loop: THREE.LoopRepeat },
  { name: 'crouchAimIdle',     file: 'idle crouching aiming.fbx',   loop: THREE.LoopRepeat },

  // ══════════════════════════════════════════════
  // Pro Rifle Pack: Walk (8-Way)
  // ══════════════════════════════════════════════
  { name: 'walk',              file: 'walk forward.fbx',            loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkForward',       file: 'walk forward.fbx',            loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkBackward',      file: 'walk backward.fbx',           loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkLeft',          file: 'walk left.fbx',               loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkRight',         file: 'walk right.fbx',              loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkForwardLeft',   file: 'walk forward left.fbx',       loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkForwardRight',  file: 'walk forward right.fbx',      loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkBackwardLeft',  file: 'walk backward left.fbx',      loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'walkBackwardRight', file: 'walk backward right.fbx',     loop: THREE.LoopRepeat, timeScale: 1.0 },

  // ══════════════════════════════════════════════
  // Pro Rifle Pack: Run (8-Way)
  // ══════════════════════════════════════════════
  { name: 'run',               file: 'run forward.fbx',             loop: THREE.LoopRepeat, timeScale: 1.15 },
  { name: 'runForward',        file: 'run forward.fbx',             loop: THREE.LoopRepeat, timeScale: 1.15 },
  { name: 'runBackward',       file: 'run backward.fbx',            loop: THREE.LoopRepeat, timeScale: 1.1 },
  { name: 'runLeft',           file: 'run left.fbx',                loop: THREE.LoopRepeat, timeScale: 1.1 },
  { name: 'runRight',          file: 'run right.fbx',               loop: THREE.LoopRepeat, timeScale: 1.1 },
  { name: 'runForwardLeft',    file: 'run forward left.fbx',        loop: THREE.LoopRepeat, timeScale: 1.1 },
  { name: 'runForwardRight',   file: 'run forward right.fbx',       loop: THREE.LoopRepeat, timeScale: 1.1 },
  { name: 'runBackwardLeft',   file: 'run backward left.fbx',       loop: THREE.LoopRepeat, timeScale: 1.1 },
  { name: 'runBackwardRight',  file: 'run backward right.fbx',      loop: THREE.LoopRepeat, timeScale: 1.1 },

  // ══════════════════════════════════════════════
  // Pro Rifle Pack: Sprint (8-Way)
  // ══════════════════════════════════════════════
  { name: 'sprint',              file: 'sprint forward.fbx',          loop: THREE.LoopRepeat, timeScale: 1.25 },
  { name: 'sprintForward',       file: 'sprint forward.fbx',          loop: THREE.LoopRepeat, timeScale: 1.25 },
  { name: 'sprintBackward',      file: 'sprint backward.fbx',         loop: THREE.LoopRepeat, timeScale: 1.2 },
  { name: 'sprintLeft',          file: 'sprint left.fbx',             loop: THREE.LoopRepeat, timeScale: 1.2 },
  { name: 'sprintRight',         file: 'sprint right.fbx',            loop: THREE.LoopRepeat, timeScale: 1.2 },
  { name: 'sprintForwardLeft',   file: 'sprint forward left.fbx',     loop: THREE.LoopRepeat, timeScale: 1.2 },
  { name: 'sprintForwardRight',  file: 'sprint forward right.fbx',    loop: THREE.LoopRepeat, timeScale: 1.2 },
  { name: 'sprintBackwardLeft',  file: 'sprint backward left.fbx',    loop: THREE.LoopRepeat, timeScale: 1.2 },
  { name: 'sprintBackwardRight', file: 'sprint backward right.fbx',   loop: THREE.LoopRepeat, timeScale: 1.2 },

  // ══════════════════════════════════════════════
  // Pro Rifle Pack: Crouch Walk (8-Way)
  // ══════════════════════════════════════════════
  { name: 'crouchWalk',              file: 'walk crouching forward.fbx',          loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkForward',       file: 'walk crouching forward.fbx',          loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkBackward',      file: 'walk crouching backward.fbx',         loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkLeft',          file: 'walk crouching left.fbx',             loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkRight',         file: 'walk crouching right.fbx',            loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkForwardLeft',   file: 'walk crouching forward left.fbx',     loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkForwardRight',  file: 'walk crouching forward right.fbx',    loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkBackwardLeft',  file: 'walk crouching backward left.fbx',    loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'crouchWalkBackwardRight', file: 'walk crouching backward right.fbx',   loop: THREE.LoopRepeat, timeScale: 0.85 },

  // ══════════════════════════════════════════════
  // Pro Rifle Pack: Turns
  // ══════════════════════════════════════════════
  { name: 'turnLeft90',         file: 'turn 90 left.fbx',              loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'turnRight90',        file: 'turn 90 right.fbx',             loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'crouchTurnLeft90',   file: 'crouching turn 90 left.fbx',    loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'crouchTurnRight90',  file: 'crouching turn 90 right.fbx',   loop: THREE.LoopOnce, clampWhenFinished: true },

  // ══════════════════════════════════════════════
  // Pro Rifle Pack: Jump
  // ══════════════════════════════════════════════
  { name: 'jumpUp',             file: 'jump up.fbx',                   loop: THREE.LoopOnce },
  { name: 'jumpLoop',           file: 'jump loop.fbx',                 loop: THREE.LoopRepeat },
  { name: 'jumpDown',           file: 'jump down.fbx',                 loop: THREE.LoopOnce, clampWhenFinished: true },

  // ══════════════════════════════════════════════
  // Pro Rifle Pack: Death
  // ══════════════════════════════════════════════
  { name: 'death',              file: 'death from the front.fbx',       loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'deathFront',         file: 'death from the front.fbx',       loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'deathBack',          file: 'death from the back.fbx',        loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'deathLeft',          file: 'death from right.fbx',           loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'deathRight',         file: 'death from right.fbx',           loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'deathHeadshot',      file: 'death from front headshot.fbx',  loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'deathFrontHeadshot', file: 'death from front headshot.fbx',  loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'deathBackHeadshot',  file: 'death from back headshot.fbx',   loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'deathCrouchFront',   file: 'death crouching headshot front.fbx', loop: THREE.LoopOnce, clampWhenFinished: true },

  // ══════════════════════════════════════════════
  // Basic Shooter Pack: Combat Actions
  // ══════════════════════════════════════════════
  { name: 'rifleShoot',         file: 'firing rifle.fbx',              loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'rifleReload',        file: 'reloading.fbx',                 loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitReaction',        file: 'hit reaction.fbx',              loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitFront',           file: 'hit reaction.fbx',              loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitBack',            file: 'hit reaction.fbx',              loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitLeft',            file: 'hit reaction.fbx',              loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitRight',           file: 'hit reaction.fbx',              loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'grenade',            file: 'toss grenade.fbx',              loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'strafe',             file: 'strafe.fbx',                    loop: THREE.LoopRepeat },

  // ══════════════════════════════════════════════
  // Pistol Pack: Weapon Set
  // ══════════════════════════════════════════════
  { name: 'pistolIdle',         file: 'pistol idle.fbx',               loop: THREE.LoopRepeat },
  { name: 'pistolRun',          file: 'pistol run.fbx',                loop: THREE.LoopRepeat, timeScale: 1.1 },
  { name: 'pistolWalk',         file: 'pistol walk.fbx',               loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'pistolCrouchIdle',   file: 'pistol kneeling idle.fbx',      loop: THREE.LoopRepeat },
  { name: 'pistolCrouchWalk',   file: 'pistol walk.fbx',               loop: THREE.LoopRepeat, timeScale: 0.85 },
  { name: 'pistolStrafe',       file: 'pistol strafe.fbx',             loop: THREE.LoopRepeat },

  // ══════════════════════════════════════════════
  // Social / Ambient — Fallback (use idle)
  // ══════════════════════════════════════════════
  { name: 'smoking',            file: 'idle.fbx',                      loop: THREE.LoopRepeat },
  { name: 'talking',            file: 'idle.fbx',                      loop: THREE.LoopRepeat },
  { name: 'sitting',            file: 'idle crouching.fbx',            loop: THREE.LoopRepeat },
  { name: 'radio',              file: 'idle.fbx',                      loop: THREE.LoopRepeat },
];

/** Falcon character animations — Sniper/overwatch (mirrors Wolf with different model) */
export const FALCON_ANIMATIONS: AnimationDefinition[] = [...WOLF_ANIMATIONS];

// ============================================================
// STATE DEFINITIONS
// ============================================================

/**
 * Per-state configuration: entry/loop/exit clips, blend weights,
 * speed multipliers, and transition behavior.
 */
export interface AnimStateConfig {
  state: string;
  clips: {
    entry?: string;
    loop: string;
    exit?: string;
  };
  speed: number;
  weight: number;
  interruptible: boolean;
  loops: boolean;
  groundOffset: number;
  moveSpeedMult: number;
  categories: ('locomotion' | 'upperBody' | 'fullBody' | 'stance' | 'reaction' | 'additive')[];
  /** Which animation layer this state primarily drives */
  layer: AnimLayer;
}

export const ANIM_STATE_CONFIGS: Record<string, AnimStateConfig> = {

  // ── Standing Idle ──
  [AnimState.IDLE]: {
    state: AnimState.IDLE,
    clips: { loop: 'idle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.AIM_IDLE]: {
    state: AnimState.AIM_IDLE,
    clips: { loop: 'aimIdle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody', 'fullBody'], layer: 1,
  },

  // ── Walk 8-Way ──
  [AnimState.WALK]: {
    state: AnimState.WALK,
    clips: { loop: 'walk' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.WALK_FORWARD]: {
    state: AnimState.WALK_FORWARD,
    clips: { loop: 'walkForward' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.WALK_BACKWARD]: {
    state: AnimState.WALK_BACKWARD,
    clips: { loop: 'walkBackward' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0.8,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.WALK_LEFT]: {
    state: AnimState.WALK_LEFT,
    clips: { loop: 'walkLeft' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0.85,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.WALK_RIGHT]: {
    state: AnimState.WALK_RIGHT,
    clips: { loop: 'walkRight' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0.85,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.WALK_FORWARD_LEFT]: {
    state: AnimState.WALK_FORWARD_LEFT,
    clips: { loop: 'walkForwardLeft' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0.9,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.WALK_FORWARD_RIGHT]: {
    state: AnimState.WALK_FORWARD_RIGHT,
    clips: { loop: 'walkForwardRight' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0.9,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.WALK_BACKWARD_LEFT]: {
    state: AnimState.WALK_BACKWARD_LEFT,
    clips: { loop: 'walkBackwardLeft' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0.75,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.WALK_BACKWARD_RIGHT]: {
    state: AnimState.WALK_BACKWARD_RIGHT,
    clips: { loop: 'walkBackwardRight' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0.75,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },

  // ── Run 8-Way ──
  [AnimState.RUN]: {
    state: AnimState.RUN,
    clips: { loop: 'run' },
    speed: 1.15, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.6,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.RUN_FORWARD]: {
    state: AnimState.RUN_FORWARD,
    clips: { loop: 'runForward' },
    speed: 1.15, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.6,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.RUN_BACKWARD]: {
    state: AnimState.RUN_BACKWARD,
    clips: { loop: 'runBackward' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.2,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.RUN_LEFT]: {
    state: AnimState.RUN_LEFT,
    clips: { loop: 'runLeft' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.3,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.RUN_RIGHT]: {
    state: AnimState.RUN_RIGHT,
    clips: { loop: 'runRight' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.3,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.RUN_FORWARD_LEFT]: {
    state: AnimState.RUN_FORWARD_LEFT,
    clips: { loop: 'runForwardLeft' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.4,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.RUN_FORWARD_RIGHT]: {
    state: AnimState.RUN_FORWARD_RIGHT,
    clips: { loop: 'runForwardRight' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.4,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.RUN_BACKWARD_LEFT]: {
    state: AnimState.RUN_BACKWARD_LEFT,
    clips: { loop: 'runBackwardLeft' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.1,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.RUN_BACKWARD_RIGHT]: {
    state: AnimState.RUN_BACKWARD_RIGHT,
    clips: { loop: 'runBackwardRight' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.1,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },

  // ── Sprint 8-Way ──
  [AnimState.SPRINT]: {
    state: AnimState.SPRINT,
    clips: { loop: 'sprint' },
    speed: 1.25, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 2.2,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.SPRINT_FORWARD]: {
    state: AnimState.SPRINT_FORWARD,
    clips: { loop: 'sprintForward' },
    speed: 1.25, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 2.2,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.SPRINT_BACKWARD]: {
    state: AnimState.SPRINT_BACKWARD,
    clips: { loop: 'sprintBackward' },
    speed: 1.2, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.8,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.SPRINT_LEFT]: {
    state: AnimState.SPRINT_LEFT,
    clips: { loop: 'sprintLeft' },
    speed: 1.2, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.9,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.SPRINT_RIGHT]: {
    state: AnimState.SPRINT_RIGHT,
    clips: { loop: 'sprintRight' },
    speed: 1.2, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.9,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.SPRINT_FORWARD_LEFT]: {
    state: AnimState.SPRINT_FORWARD_LEFT,
    clips: { loop: 'sprintForwardLeft' },
    speed: 1.2, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 2.0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.SPRINT_FORWARD_RIGHT]: {
    state: AnimState.SPRINT_FORWARD_RIGHT,
    clips: { loop: 'sprintForwardRight' },
    speed: 1.2, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 2.0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.SPRINT_BACKWARD_LEFT]: {
    state: AnimState.SPRINT_BACKWARD_LEFT,
    clips: { loop: 'sprintBackwardLeft' },
    speed: 1.2, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.7,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.SPRINT_BACKWARD_RIGHT]: {
    state: AnimState.SPRINT_BACKWARD_RIGHT,
    clips: { loop: 'sprintBackwardRight' },
    speed: 1.2, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.7,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },

  // ── Crouch Idle ──
  [AnimState.CROUCH_IDLE]: {
    state: AnimState.CROUCH_IDLE,
    clips: { loop: 'crouchIdle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_AIM_IDLE]: {
    state: AnimState.CROUCH_AIM_IDLE,
    clips: { loop: 'crouchAimIdle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0,
    categories: ['upperBody', 'fullBody', 'stance'], layer: 1,
  },

  // ── Crouch Walk 8-Way ──
  [AnimState.CROUCH_WALK]: {
    state: AnimState.CROUCH_WALK,
    clips: { loop: 'crouchWalk' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.5,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_WALK_FORWARD]: {
    state: AnimState.CROUCH_WALK_FORWARD,
    clips: { loop: 'crouchWalkForward' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.5,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_WALK_BACKWARD]: {
    state: AnimState.CROUCH_WALK_BACKWARD,
    clips: { loop: 'crouchWalkBackward' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.4,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_WALK_LEFT]: {
    state: AnimState.CROUCH_WALK_LEFT,
    clips: { loop: 'crouchWalkLeft' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.45,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_WALK_RIGHT]: {
    state: AnimState.CROUCH_WALK_RIGHT,
    clips: { loop: 'crouchWalkRight' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.45,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_WALK_FORWARD_LEFT]: {
    state: AnimState.CROUCH_WALK_FORWARD_LEFT,
    clips: { loop: 'crouchWalkForwardLeft' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.45,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_WALK_FORWARD_RIGHT]: {
    state: AnimState.CROUCH_WALK_FORWARD_RIGHT,
    clips: { loop: 'crouchWalkForwardRight' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.45,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_WALK_BACKWARD_LEFT]: {
    state: AnimState.CROUCH_WALK_BACKWARD_LEFT,
    clips: { loop: 'crouchWalkBackwardLeft' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.35,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_WALK_BACKWARD_RIGHT]: {
    state: AnimState.CROUCH_WALK_BACKWARD_RIGHT,
    clips: { loop: 'crouchWalkBackwardRight' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.35,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },

  // ── Prone ──
  [AnimState.PRONE_IDLE]: {
    state: AnimState.PRONE_IDLE,
    clips: { loop: 'proneIdle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 0.5, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.PRONE_CRAWL]: {
    state: AnimState.PRONE_CRAWL,
    clips: { loop: 'proneCrawl' },
    speed: 0.65, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 0.5, moveSpeedMult: 0.3,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },

  // ── Cover ──
  [AnimState.COVER_IDLE]: {
    state: AnimState.COVER_IDLE,
    clips: { loop: 'coverIdle' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.COVER_PEEK]: {
    state: AnimState.COVER_PEEK,
    clips: { loop: 'coverPeek' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.3, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },

  // ── Rifle ADS ──
  [AnimState.RIFLE_IDLE]: {
    state: AnimState.RIFLE_IDLE,
    clips: { loop: 'rifleIdle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody', 'fullBody'], layer: 1,
  },
  [AnimState.RIFLE_CROUCH_IDLE]: {
    state: AnimState.RIFLE_CROUCH_IDLE,
    clips: { loop: 'rifleCrouchIdle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0,
    categories: ['upperBody', 'fullBody', 'stance'], layer: 1,
  },
  [AnimState.RIFLE_WALK]: {
    state: AnimState.RIFLE_WALK,
    clips: { loop: 'rifleWalk' },
    speed: 0.95, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0.85,
    categories: ['locomotion', 'upperBody', 'fullBody'], layer: 0,
  },
  [AnimState.RIFLE_RUN]: {
    state: AnimState.RIFLE_RUN,
    clips: { loop: 'rifleRun' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.3,
    categories: ['locomotion', 'upperBody', 'fullBody'], layer: 0,
  },

  // ── Rifle Shoot / Reload ──
  [AnimState.RIFLE_SHOOT]: {
    state: AnimState.RIFLE_SHOOT,
    clips: { loop: 'rifleShoot' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody'], layer: 1,
  },
  [AnimState.RIFLE_RELOAD]: {
    state: AnimState.RIFLE_RELOAD,
    clips: { loop: 'rifleReload' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody'], layer: 1,
  },

  // ── Death ──
  [AnimState.DEATH]: {
    state: AnimState.DEATH,
    clips: { loop: 'death' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },
  [AnimState.DEATH_FRONT]: {
    state: AnimState.DEATH_FRONT,
    clips: { loop: 'deathFront' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },
  [AnimState.DEATH_BACK]: {
    state: AnimState.DEATH_BACK,
    clips: { loop: 'deathBack' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },
  [AnimState.DEATH_LEFT]: {
    state: AnimState.DEATH_LEFT,
    clips: { loop: 'deathLeft' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },
  [AnimState.DEATH_RIGHT]: {
    state: AnimState.DEATH_RIGHT,
    clips: { loop: 'deathRight' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },
  [AnimState.DEATH_HEADSHOT]: {
    state: AnimState.DEATH_HEADSHOT,
    clips: { loop: 'deathHeadshot' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },
  [AnimState.DEATH_FRONT_HEADSHOT]: {
    state: AnimState.DEATH_FRONT_HEADSHOT,
    clips: { loop: 'deathFrontHeadshot' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },
  [AnimState.DEATH_BACK_HEADSHOT]: {
    state: AnimState.DEATH_BACK_HEADSHOT,
    clips: { loop: 'deathBackHeadshot' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },
  [AnimState.DEATH_CROUCH_FRONT]: {
    state: AnimState.DEATH_CROUCH_FRONT,
    clips: { loop: 'deathCrouchFront' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 0.3, moveSpeedMult: 0,
    categories: ['fullBody', 'reaction'], layer: 0,
  },

  // ── Hit Reactions ──
  [AnimState.HIT_FRONT]: {
    state: AnimState.HIT_FRONT,
    clips: { loop: 'hitFront' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody', 'reaction'], layer: 2,
  },
  [AnimState.HIT_BACK]: {
    state: AnimState.HIT_BACK,
    clips: { loop: 'hitBack' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody', 'reaction'], layer: 2,
  },
  [AnimState.HIT_LEFT]: {
    state: AnimState.HIT_LEFT,
    clips: { loop: 'hitLeft' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody', 'reaction'], layer: 2,
  },
  [AnimState.HIT_RIGHT]: {
    state: AnimState.HIT_RIGHT,
    clips: { loop: 'hitRight' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody', 'reaction'], layer: 2,
  },

  // ── Grenade ──
  [AnimState.GRENADE]: {
    state: AnimState.GRENADE,
    clips: { loop: 'grenade' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody'], layer: 1,
  },

  // ── Strafe ──
  [AnimState.STRAFE]: {
    state: AnimState.STRAFE,
    clips: { loop: 'strafe' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },

  // ── Pistol Weapon Set ──
  [AnimState.PISTOL_IDLE]: {
    state: AnimState.PISTOL_IDLE,
    clips: { loop: 'pistolIdle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['upperBody', 'fullBody'], layer: 1,
  },
  [AnimState.PISTOL_CROUCH_IDLE]: {
    state: AnimState.PISTOL_CROUCH_IDLE,
    clips: { loop: 'pistolCrouchIdle' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.PISTOL_WALK]: {
    state: AnimState.PISTOL_WALK,
    clips: { loop: 'pistolWalk' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.PISTOL_RUN]: {
    state: AnimState.PISTOL_RUN,
    clips: { loop: 'pistolRun' },
    speed: 1.1, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.6,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.PISTOL_CROUCH_WALK]: {
    state: AnimState.PISTOL_CROUCH_WALK,
    clips: { loop: 'pistolCrouchWalk' },
    speed: 0.85, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.0, moveSpeedMult: 0.5,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.PISTOL_STRAFE]: {
    state: AnimState.PISTOL_STRAFE,
    clips: { loop: 'pistolStrafe' },
    speed: 1.0, weight: 1.0, interruptible: true, loops: true,
    groundOffset: 1.7, moveSpeedMult: 1.0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },

  // ── Jump ──
  [AnimState.JUMP_UP]: {
    state: AnimState.JUMP_UP,
    clips: { loop: 'jumpUp' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['fullBody'], layer: 0,
  },
  [AnimState.JUMP_LOOP]: {
    state: AnimState.JUMP_LOOP,
    clips: { loop: 'jumpLoop' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: true,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['fullBody'], layer: 0,
  },
  [AnimState.JUMP_DOWN]: {
    state: AnimState.JUMP_DOWN,
    clips: { loop: 'jumpDown' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['fullBody'], layer: 0,
  },

  // ── Turn Transitions ──
  [AnimState.TURN_LEFT_90]: {
    state: AnimState.TURN_LEFT_90,
    clips: { loop: 'turnLeft90' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.TURN_RIGHT_90]: {
    state: AnimState.TURN_RIGHT_90,
    clips: { loop: 'turnRight90' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.7, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody'], layer: 0,
  },
  [AnimState.CROUCH_TURN_LEFT_90]: {
    state: AnimState.CROUCH_TURN_LEFT_90,
    clips: { loop: 'crouchTurnLeft90' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.0, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
  [AnimState.CROUCH_TURN_RIGHT_90]: {
    state: AnimState.CROUCH_TURN_RIGHT_90,
    clips: { loop: 'crouchTurnRight90' },
    speed: 1.0, weight: 1.0, interruptible: false, loops: false,
    groundOffset: 1.0, moveSpeedMult: 0,
    categories: ['locomotion', 'fullBody', 'stance'], layer: 0,
  },
};

// ============================================================
// TRANSITION TIMING (AAA Specifications)
// ============================================================

/**
 * Crossfade durations (seconds) for each transition type.
 * Tuned for AAA-quality responsiveness and natural feel.
 */
export const TRANSITION_DURATIONS = {
  // ── Standing Locomotion ──
  IDLE_WALK: 0.15,
  WALK_RUN: 0.2,
  RUN_SPRINT: 0.2,
  WALK_IDLE: 0.15,
  RUN_WALK: 0.2,
  SPRINT_RUN: 0.2,
  IDLE_RUN: 0.25,
  IDLE_SPRINT: 0.3,

  // ── Stance Changes (deliberate, weighted) ──
  STAND_CROUCH: 0.2,
  CROUCH_STAND: 0.2,
  CROUCH_PRONE: 0.3,
  PRONE_CROUCH: 0.3,
  PRONE_STAND: 0.45,
  STAND_PRONE: 0.35,

  // ── Cover ──
  TO_COVER: 0.3,
  FROM_COVER: 0.25,
  COVER_PEEK: 0.15,
  PEEK_RETURN: 0.2,

  // ── Combat ──
  TO_RIFLE_AIM: 0.2,
  FROM_RIFLE_AIM: 0.25,
  SHOOT_RECOVER: 0.15,
  RELOAD_START: 0.15,
  RELOAD_FINISH: 0.2,

  // ── Reactions ──
  DEATH: 0.1,
  HIT: 0.08,

  // ── Transitions ──
  WALK_START: 0.15,
  WALK_STOP: 0.2,
  TURN_90: 0.2,
  TURN_180: 0.3,

  // ── Default ──
  DEFAULT: 0.25,
} as const;

// ============================================================
// STATE TRANSITION TABLE
// ============================================================

/**
 * Valid transitions between animation states.
 * The state machine evaluates transitions in order; first match wins.
 * Wildcard transitions (from: '*') serve as catch-alls.
 */
export interface StateTransition {
  from: string;
  to: string;
  duration: number;
  condition?: () => boolean;
  useEntry?: boolean;
  useExit?: boolean;
}

export function getTransitionTable(): StateTransition[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // WILDCARD TRANSITIONS — Any state → terminal/high-priority
    // ═══════════════════════════════════════════════════════════════

    // Death: terminal and immediate from any state
    { from: '*', to: AnimState.DEATH,        duration: TRANSITION_DURATIONS.DEATH, useExit: false },
    { from: '*', to: AnimState.DEATH_FRONT,  duration: TRANSITION_DURATIONS.DEATH, useExit: false },
    { from: '*', to: AnimState.DEATH_BACK,   duration: TRANSITION_DURATIONS.DEATH, useExit: false },
    { from: '*', to: AnimState.DEATH_LEFT,   duration: TRANSITION_DURATIONS.DEATH, useExit: false },
    { from: '*', to: AnimState.DEATH_RIGHT,  duration: TRANSITION_DURATIONS.DEATH, useExit: false },
    { from: '*', to: AnimState.DEATH_HEADSHOT, duration: TRANSITION_DURATIONS.DEATH, useExit: false },

    // Hit reactions: snap interrupt from any state
    { from: '*', to: AnimState.HIT_FRONT,    duration: TRANSITION_DURATIONS.HIT, useExit: false },
    { from: '*', to: AnimState.HIT_BACK,     duration: TRANSITION_DURATIONS.HIT, useExit: false },
    { from: '*', to: AnimState.HIT_LEFT,     duration: TRANSITION_DURATIONS.HIT, useExit: false },
    { from: '*', to: AnimState.HIT_RIGHT,    duration: TRANSITION_DURATIONS.HIT, useExit: false },

    // ═══════════════════════════════════════════════════════════════
    // IDLE TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.IDLE, to: AnimState.WALK,         duration: TRANSITION_DURATIONS.IDLE_WALK },
    { from: AnimState.IDLE, to: AnimState.RUN,          duration: TRANSITION_DURATIONS.IDLE_RUN },
    { from: AnimState.IDLE, to: AnimState.SPRINT,       duration: TRANSITION_DURATIONS.IDLE_SPRINT },
    { from: AnimState.IDLE, to: AnimState.CROUCH_IDLE,  duration: TRANSITION_DURATIONS.STAND_CROUCH },
    { from: AnimState.IDLE, to: AnimState.PRONE_IDLE,   duration: TRANSITION_DURATIONS.STAND_PRONE },
    { from: AnimState.IDLE, to: AnimState.COVER_IDLE,   duration: TRANSITION_DURATIONS.TO_COVER },
    { from: AnimState.IDLE, to: AnimState.RIFLE_IDLE,   duration: TRANSITION_DURATIONS.TO_RIFLE_AIM },

    // ═══════════════════════════════════════════════════════════════
    // WALK TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.WALK, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.WALK_IDLE },
    { from: AnimState.WALK, to: AnimState.RUN,          duration: TRANSITION_DURATIONS.WALK_RUN },
    { from: AnimState.WALK, to: AnimState.SPRINT,       duration: TRANSITION_DURATIONS.RUN_SPRINT },
    { from: AnimState.WALK, to: AnimState.CROUCH_WALK,  duration: TRANSITION_DURATIONS.STAND_CROUCH },
    { from: AnimState.WALK, to: AnimState.RIFLE_WALK,   duration: TRANSITION_DURATIONS.TO_RIFLE_AIM },

    // ═══════════════════════════════════════════════════════════════
    // RUN TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.RUN, to: AnimState.WALK,      duration: TRANSITION_DURATIONS.RUN_WALK },
    { from: AnimState.RUN, to: AnimState.SPRINT,    duration: TRANSITION_DURATIONS.RUN_SPRINT },
    { from: AnimState.RUN, to: AnimState.IDLE,      duration: TRANSITION_DURATIONS.IDLE_RUN },
    { from: AnimState.RUN, to: AnimState.RIFLE_RUN, duration: TRANSITION_DURATIONS.TO_RIFLE_AIM },

    // ═══════════════════════════════════════════════════════════════
    // SPRINT TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.SPRINT, to: AnimState.RUN,   duration: TRANSITION_DURATIONS.SPRINT_RUN },
    { from: AnimState.SPRINT, to: AnimState.WALK,  duration: TRANSITION_DURATIONS.RUN_WALK },
    { from: AnimState.SPRINT, to: AnimState.IDLE,  duration: TRANSITION_DURATIONS.IDLE_SPRINT },

    // ═══════════════════════════════════════════════════════════════
    // CROUCH IDLE TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.CROUCH_IDLE, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.CROUCH_STAND },
    { from: AnimState.CROUCH_IDLE, to: AnimState.CROUCH_WALK,  duration: TRANSITION_DURATIONS.IDLE_WALK },
    { from: AnimState.CROUCH_IDLE, to: AnimState.PRONE_IDLE,   duration: TRANSITION_DURATIONS.CROUCH_PRONE },
    { from: AnimState.CROUCH_IDLE, to: AnimState.RIFLE_CROUCH_IDLE, duration: TRANSITION_DURATIONS.TO_RIFLE_AIM },

    // ═══════════════════════════════════════════════════════════════
    // CROUCH WALK TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.CROUCH_WALK, to: AnimState.CROUCH_IDLE,  duration: TRANSITION_DURATIONS.IDLE_WALK },
    { from: AnimState.CROUCH_WALK, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.CROUCH_STAND },
    { from: AnimState.CROUCH_WALK, to: AnimState.WALK,         duration: TRANSITION_DURATIONS.CROUCH_STAND },

    // ═══════════════════════════════════════════════════════════════
    // PRONE IDLE TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.PRONE_IDLE, to: AnimState.IDLE,          duration: TRANSITION_DURATIONS.PRONE_STAND },
    { from: AnimState.PRONE_IDLE, to: AnimState.PRONE_CRAWL,   duration: TRANSITION_DURATIONS.IDLE_WALK },
    { from: AnimState.PRONE_IDLE, to: AnimState.CROUCH_IDLE,   duration: TRANSITION_DURATIONS.PRONE_CROUCH },

    // ═══════════════════════════════════════════════════════════════
    // PRONE CRAWL TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.PRONE_CRAWL, to: AnimState.PRONE_IDLE,   duration: TRANSITION_DURATIONS.IDLE_WALK },
    { from: AnimState.PRONE_CRAWL, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.PRONE_STAND },

    // ═══════════════════════════════════════════════════════════════
    // COVER TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.COVER_IDLE, to: AnimState.IDLE,       duration: TRANSITION_DURATIONS.FROM_COVER },
    { from: AnimState.COVER_IDLE, to: AnimState.COVER_PEEK, duration: TRANSITION_DURATIONS.COVER_PEEK },
    { from: AnimState.COVER_PEEK, to: AnimState.COVER_IDLE, duration: TRANSITION_DURATIONS.PEEK_RETURN },
    { from: AnimState.COVER_IDLE, to: AnimState.WALK,       duration: TRANSITION_DURATIONS.FROM_COVER },
    { from: AnimState.COVER_IDLE, to: AnimState.RUN,        duration: TRANSITION_DURATIONS.FROM_COVER },

    // ═══════════════════════════════════════════════════════════════
    // RIFLE (ADS) TRANSITIONS
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.RIFLE_IDLE, to: AnimState.IDLE,         duration: TRANSITION_DURATIONS.FROM_RIFLE_AIM },
    { from: AnimState.RIFLE_IDLE, to: AnimState.RIFLE_WALK,   duration: TRANSITION_DURATIONS.IDLE_WALK },
    { from: AnimState.RIFLE_IDLE, to: AnimState.RIFLE_RUN,    duration: TRANSITION_DURATIONS.WALK_RUN },
    { from: AnimState.RIFLE_IDLE, to: AnimState.RIFLE_SHOOT,  duration: TRANSITION_DURATIONS.SHOOT_RECOVER },
    { from: AnimState.RIFLE_IDLE, to: AnimState.RIFLE_RELOAD, duration: TRANSITION_DURATIONS.RELOAD_START },

    { from: AnimState.RIFLE_WALK, to: AnimState.RIFLE_IDLE,   duration: TRANSITION_DURATIONS.IDLE_WALK },
    { from: AnimState.RIFLE_WALK, to: AnimState.RIFLE_RUN,    duration: TRANSITION_DURATIONS.WALK_RUN },
    { from: AnimState.RIFLE_WALK, to: AnimState.WALK,         duration: TRANSITION_DURATIONS.FROM_RIFLE_AIM },

    { from: AnimState.RIFLE_RUN, to: AnimState.RIFLE_WALK,    duration: TRANSITION_DURATIONS.WALK_RUN },
    { from: AnimState.RIFLE_RUN, to: AnimState.RIFLE_IDLE,    duration: TRANSITION_DURATIONS.IDLE_RUN },
    { from: AnimState.RIFLE_RUN, to: AnimState.RUN,           duration: TRANSITION_DURATIONS.FROM_RIFLE_AIM },

    // ═══════════════════════════════════════════════════════════════
    // FIRE / RELOAD
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.RIFLE_SHOOT,  to: AnimState.RIFLE_IDLE,  duration: TRANSITION_DURATIONS.SHOOT_RECOVER },
    { from: AnimState.RIFLE_SHOOT,  to: AnimState.RIFLE_WALK,  duration: TRANSITION_DURATIONS.SHOOT_RECOVER },
    { from: AnimState.RIFLE_SHOOT,  to: AnimState.RIFLE_RELOAD, duration: TRANSITION_DURATIONS.RELOAD_START },

    { from: AnimState.RIFLE_RELOAD, to: AnimState.RIFLE_IDLE,  duration: TRANSITION_DURATIONS.RELOAD_FINISH },
    { from: AnimState.RIFLE_RELOAD, to: AnimState.RIFLE_WALK,  duration: TRANSITION_DURATIONS.RELOAD_FINISH },

    // ═══════════════════════════════════════════════════════════════
    // GRENADE THROW
    // ═══════════════════════════════════════════════════════════════
    { from: '*', to: AnimState.GRENADE, duration: 0.15, useEntry: false },
    { from: AnimState.GRENADE, to: AnimState.IDLE,       duration: 0.25 },
    { from: AnimState.GRENADE, to: AnimState.RIFLE_IDLE, duration: 0.25 },

    // ═══════════════════════════════════════════════════════════════
    // HIT REACTION RECOVERY
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.HIT_FRONT, to: AnimState.IDLE,  duration: 0.3 },
    { from: AnimState.HIT_FRONT, to: AnimState.WALK,  duration: 0.3 },
    { from: AnimState.HIT_BACK,  to: AnimState.IDLE,  duration: 0.3 },
    { from: AnimState.HIT_BACK,  to: AnimState.WALK,  duration: 0.3 },

    // ═══════════════════════════════════════════════════════════════
    // DEATH RESET (for respawn)
    // ═══════════════════════════════════════════════════════════════
    { from: AnimState.DEATH,          to: AnimState.IDLE, duration: 0 },
    { from: AnimState.DEATH_FRONT,    to: AnimState.IDLE, duration: 0 },
    { from: AnimState.DEATH_BACK,     to: AnimState.IDLE, duration: 0 },
    { from: AnimState.DEATH_LEFT,     to: AnimState.IDLE, duration: 0 },
    { from: AnimState.DEATH_RIGHT,    to: AnimState.IDLE, duration: 0 },
    { from: AnimState.DEATH_HEADSHOT, to: AnimState.IDLE, duration: 0 },
  ];
}

// ============================================================
// ANIMATION SPEED OVERRIDES
// ============================================================

/** Per-animation speed multipliers (applied on top of time scale from loader) */
export const ANIMATION_SPEEDS: Record<string, number> = {
  // Idle
  idle: 1.0,
  aimIdle: 1.0,

  // Walk 8-Way
  walk: 1.0,
  walkForward: 1.0,
  walkBackward: 1.0,
  walkLeft: 1.0,
  walkRight: 1.0,
  walkForwardLeft: 1.0,
  walkForwardRight: 1.0,
  walkBackwardLeft: 1.0,
  walkBackwardRight: 1.0,

  // Run 8-Way
  run: 1.15,
  runForward: 1.15,
  runBackward: 1.1,
  runLeft: 1.1,
  runRight: 1.1,
  runForwardLeft: 1.1,
  runForwardRight: 1.1,
  runBackwardLeft: 1.1,
  runBackwardRight: 1.1,

  // Sprint 8-Way
  sprint: 1.25,
  sprintForward: 1.25,
  sprintBackward: 1.2,
  sprintLeft: 1.2,
  sprintRight: 1.2,
  sprintForwardLeft: 1.2,
  sprintForwardRight: 1.2,
  sprintBackwardLeft: 1.2,
  sprintBackwardRight: 1.2,

  // Crouch Idle
  crouchIdle: 1.0,
  crouchAimIdle: 1.0,

  // Crouch Walk 8-Way
  crouchWalk: 0.85,
  crouchWalkForward: 0.85,
  crouchWalkBackward: 0.85,
  crouchWalkLeft: 0.85,
  crouchWalkRight: 0.85,
  crouchWalkForwardLeft: 0.85,
  crouchWalkForwardRight: 0.85,
  crouchWalkBackwardLeft: 0.85,
  crouchWalkBackwardRight: 0.85,

  // Prone
  proneIdle: 1.0,
  proneCrawl: 0.65,

  // Cover
  coverIdle: 1.0,
  coverPeek: 1.2,

  // Rifle ADS
  rifleIdle: 1.0,
  rifleCrouchIdle: 1.0,
  rifleWalk: 0.95,
  rifleRun: 1.1,
  rifleShoot: 1.0,
  rifleReload: 1.0,

  // Death
  death: 1.0,
  deathFront: 1.0,
  deathBack: 1.0,
  deathLeft: 1.0,
  deathRight: 1.0,
  deathHeadshot: 1.0,
  deathFrontHeadshot: 1.0,
  deathBackHeadshot: 1.0,
  deathCrouchFront: 1.0,

  // Hit Reactions
  hitFront: 1.0,
  hitBack: 1.0,
  hitLeft: 1.0,
  hitRight: 1.0,
  hitReaction: 1.0,

  // Grenade / Actions
  grenade: 1.0,
  strafe: 1.0,

  // Jump
  jumpUp: 1.0,
  jumpLoop: 1.0,
  jumpDown: 1.0,

  // Turns
  turnLeft90: 1.0,
  turnRight90: 1.0,
  turnLeft180: 1.0,
  turnRight180: 1.0,
  crouchTurnLeft90: 1.0,
  crouchTurnRight90: 1.0,

  // Walk Start/Stop
  walkStart: 1.0,
  walkStop: 1.0,

  // Stance Transitions
  standToCrouch: 1.0,
  crouchToStand: 1.0,
  crouchToProne: 1.0,
  proneToCrouch: 1.0,
  standToProne: 1.0,
  proneToStand: 1.0,

  // Pistol
  pistolIdle: 1.0,
  pistolRun: 1.1,
  pistolWalk: 1.0,
  pistolCrouchIdle: 1.0,
  pistolCrouchWalk: 0.85,
  pistolStrafe: 1.0,

  // Social (fallback)
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
 * Priority order:
 *   1. Death (terminal)
 *   2. Hit reactions
 *   3. Cover stance
 *   4. Shooting / Reloading
 *   5. Prone stance
 *   6. Crouch stance
 *   7. ADS (rifle)
 *   8. Locomotion speed tiers
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
  if (params.isDead) return AnimState.DEATH;

  if (params.isTakingCover) {
    if (params.isCoverPeeking) return AnimState.COVER_PEEK;
    return AnimState.COVER_IDLE;
  }

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

  if (params.isProne) {
    return params.isMoving ? AnimState.PRONE_CRAWL : AnimState.PRONE_IDLE;
  }

  if (params.isCrouching) {
    return params.isMoving ? AnimState.CROUCH_WALK : AnimState.CROUCH_IDLE;
  }

  if (params.isADS) {
    if (params.isMoving) {
      return params.isSprinting ? AnimState.RIFLE_RUN : AnimState.RIFLE_WALK;
    }
    return AnimState.RIFLE_IDLE;
  }

  if (params.isMoving) {
    if (params.isSprinting) return AnimState.SPRINT;
    return AnimState.WALK;
  }

  return AnimState.IDLE;
}

// ============================================================
// BLEND TREE CONFIGURATION
// ============================================================

/** Blend groups for layered animation */
export const BLEND_GROUPS = {
  LOCOMOTION: {
    states: [
      AnimState.IDLE, AnimState.WALK, AnimState.RUN, AnimState.SPRINT,
      AnimState.WALK_FORWARD, AnimState.WALK_BACKWARD, AnimState.WALK_LEFT, AnimState.WALK_RIGHT,
      AnimState.WALK_FORWARD_LEFT, AnimState.WALK_FORWARD_RIGHT,
      AnimState.WALK_BACKWARD_LEFT, AnimState.WALK_BACKWARD_RIGHT,
      AnimState.RUN_FORWARD, AnimState.RUN_BACKWARD, AnimState.RUN_LEFT, AnimState.RUN_RIGHT,
      AnimState.RUN_FORWARD_LEFT, AnimState.RUN_FORWARD_RIGHT,
      AnimState.RUN_BACKWARD_LEFT, AnimState.RUN_BACKWARD_RIGHT,
      AnimState.SPRINT_FORWARD, AnimState.SPRINT_BACKWARD, AnimState.SPRINT_LEFT, AnimState.SPRINT_RIGHT,
      AnimState.SPRINT_FORWARD_LEFT, AnimState.SPRINT_FORWARD_RIGHT,
      AnimState.SPRINT_BACKWARD_LEFT, AnimState.SPRINT_BACKWARD_RIGHT,
      AnimState.CROUCH_WALK,
      AnimState.CROUCH_WALK_FORWARD, AnimState.CROUCH_WALK_BACKWARD,
      AnimState.CROUCH_WALK_LEFT, AnimState.CROUCH_WALK_RIGHT,
      AnimState.CROUCH_WALK_FORWARD_LEFT, AnimState.CROUCH_WALK_FORWARD_RIGHT,
      AnimState.CROUCH_WALK_BACKWARD_LEFT, AnimState.CROUCH_WALK_BACKWARD_RIGHT,
      AnimState.PRONE_CRAWL,
      AnimState.STRAFE,
      AnimState.PISTOL_WALK, AnimState.PISTOL_RUN, AnimState.PISTOL_CROUCH_WALK, AnimState.PISTOL_STRAFE,
      AnimState.RIFLE_WALK, AnimState.RIFLE_RUN,
    ],
    bones: [
      'Hips', 'Spine', 'LeftUpLeg', 'LeftLeg', 'LeftFoot',
      'RightUpLeg', 'RightLeg', 'RightFoot',
    ],
  },
  UPPER_BODY: {
    states: [
      AnimState.RIFLE_IDLE, AnimState.RIFLE_CROUCH_IDLE,
      AnimState.RIFLE_SHOOT, AnimState.RIFLE_RELOAD,
      AnimState.AIM_IDLE, AnimState.CROUCH_AIM_IDLE,
      AnimState.PISTOL_IDLE,
      AnimState.GRENADE,
      AnimState.COVER_IDLE, AnimState.COVER_PEEK,
    ],
    bones: [
      'Spine1', 'Spine2', 'Neck', 'Head',
      'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
      'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
    ],
  },
  FULL_BODY: {
    states: [
      AnimState.DEATH, AnimState.DEATH_FRONT, AnimState.DEATH_BACK,
      AnimState.DEATH_LEFT, AnimState.DEATH_RIGHT,
      AnimState.DEATH_HEADSHOT, AnimState.DEATH_FRONT_HEADSHOT,
      AnimState.DEATH_BACK_HEADSHOT, AnimState.DEATH_CROUCH_FRONT,
      AnimState.HIT_FRONT, AnimState.HIT_BACK, AnimState.HIT_LEFT, AnimState.HIT_RIGHT,
      AnimState.JUMP_UP, AnimState.JUMP_LOOP, AnimState.JUMP_DOWN,
    ],
    bones: [],
  },
  STANCE: {
    states: [
      AnimState.CROUCH_IDLE, AnimState.PRONE_IDLE,
      AnimState.COVER_IDLE, AnimState.COVER_PEEK,
      AnimState.PISTOL_CROUCH_IDLE,
    ],
    bones: [],
  },
} as const;

// ============================================================
// THIRD PERSON CHARACTER ANIMATION
// ============================================================

export const THIRD_PERSON_ANIM = {
  STANCE_LERP_SPEED: 8,
  WALK_CYCLE_SPEED: 5,
  RUN_CYCLE_SPEED: 8,
  WALK_SWING: 0.25,
  RUN_SWING: 0.4,
  ARM_SWING_FACTOR: 0.5,
} as const;

// ============================================================
// PROTOTYPE FALLBACK (No Real Models)
// ============================================================

export const PROTOTYPE_ANIM = {
  WALK_BOB_FREQ: 8,
  SPRINT_BOB_FREQ: 12,
  WALK_BOB_AMP: 0.03,
  CROUCH_BOB_AMP: 0.015,
  LEG_SWING_SPEED_WALK: 5,
  LEG_SWING_SPEED_SPRINT: 8,
  LEG_SWING_WALK: 0.25,
  LEG_SWING_SPRINT: 0.4,
  PRONE_ANGLE: -Math.PI / 2,
  COVER_PEEK_RISE: 0.4,
  COVER_WEAPON_HEIGHT: -0.3,
} as const;

// ============================================================
// ASSET PATHS
// ============================================================

export const ASSET_PATHS = {
  CHARACTERS: '/assets/characters',
  getWolfPath: () => '/assets/characters/wolf',
  getFalconPath: () => '/assets/characters/falcon',
  WOLF_MODEL: 'wolf.glb',
  FALCON_MODEL: 'falcon.glb',
} as const;
