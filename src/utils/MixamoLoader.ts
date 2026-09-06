/**
 * MixamoLoader.ts
 * Utility for loading Mixamo characters and animations in Three.js
 *
 * Handles:
 *   - Loading GLB character models with correct scale
 *   - Loading animation clips from separate GLB files
 *   - Mixamo name mapping (logical state → Mixamo clip name)
 *   - Procedural placeholder animations for prototyping
 *   - Caching loaded assets to avoid duplicate requests
 *   - Batch loading with progress tracking
 *   - Proper Mixamo skeleton/scale handling
 *
 * Usage:
 *   const loader = new MixamoLoader();
 *   const { model, animations } = await loader.loadCharacter('wolf', '/assets/characters/wolf/');
 *   scene.add(model);
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================
// TYPES
// ============================================================

/** Animation definition — maps a logical name to a file path */
export interface AnimationDefinition {
  /** Logical name (e.g., 'idle', 'walk', 'run') */
  name: string;
  /** Filename relative to character directory (e.g., 'wolf_idle.glb') */
  file: string;
  /** Optional: override loop mode */
  loop?: THREE.AnimationActionLoopStyles;
  /** Optional: override time scale */
  timeScale?: number;
  /** Optional: clamp when finished (for one-shot animations like death) */
  clampWhenFinished?: boolean;
}

/** Procedural animation oscillation */
export interface Oscillation {
  amp: number;
  freq: number;
  phase: number;
}

/** Body part animation data */
export interface BodyPartAnim {
  posX?: Oscillation;
  posY?: Oscillation;
  posZ?: Oscillation;
  rotX?: Oscillation;
  rotY?: Oscillation;
  rotZ?: Oscillation;
}

/** Procedural animation definition */
export interface ProceduralAnim {
  duration: number;
  keyframeCount: number;
  hips?: BodyPartAnim;
  spine?: BodyPartAnim;
  head?: BodyPartAnim;
  leftArm?: BodyPartAnim;
  rightArm?: BodyPartAnim;
  leftLeg?: BodyPartAnim;
  rightLeg?: BodyPartAnim;
}

/** Loaded character result */
export interface LoadedCharacter {
  /** The Three.js group containing the character model */
  model: THREE.Group;
  /** Map of animation name → AnimationClip */
  animations: Map<string, THREE.AnimationClip>;
  /** The skeleton (for debugging or retargeting) */
  skeleton: THREE.Skeleton | null;
}

/** Progress callback */
export type ProgressCallback = (loaded: number, total: number, item: string) => void;

// ============================================================
// MIXAMO ANIMATION NAME MAPPING
// ============================================================

/**
 * Maps our internal logical state names to the actual Mixamo animation
 * clip names as they appear when downloaded from the Mixamo library.
 *
 * When loading real Mixamo GLB files, the loader uses these names to
 * search for the correct animation clip inside each file.
 *
 * NOTE: Mixamo exports each animation as a separate GLB. The file
 * naming is handled by CHARACTER_ANIMATIONS; this map tells us what
 * the clip inside the file is actually called.
 */
export const MIXAMO_ANIMATION_NAMES: Record<string, string> = {
  // ── Standing Locomotion ──
  idle:             'Standing Idle',
  walk:             'Walking',
  run:              'Running',

  // ── Crouch ──
  crouchIdle:       'Crouching Idle',
  crouchWalk:       'Crouching Walk',

  // ── Prone ──
  proneIdle:        'Prone Idle',
  proneCrawl:       'Prone Crawl',

  // ── Cover / Aim ──
  coverIdle:        'Rifle Aiming',
  coverPeek:        'Rifle Aiming',

  // ── Combat (Rifle) ──
  rifleIdle:        'Rifle Aiming',
  rifleWalk:        'Rifle Walking',
  rifleRun:         'Rifle Running',
  rifleShoot:       'Rifle Shooting',
  rifleReload:      'Rifle Reloading',

  // ── Reactions ──
  death:            'Death Fall',
  hitFront:         'Hit Front',
  hitBack:          'Hit Back',

  // ── Social / Ambient ──
  smoking:          'Smoking',
  talking:          'Talking',
  sitting:          'Sitting',
  radio:            'Using Radio',
};

/**
 * Get the Mixamo clip name for a logical animation state.
 * Falls back to the logical name itself if no mapping exists.
 */
export function getMixamoName(logicalName: string): string {
  return MIXAMO_ANIMATION_NAMES[logicalName] ?? logicalName;
}

// ============================================================
// PREDEFINED ANIMATION SETS
// ============================================================

/** Standard animation set for Wolf/Falcon characters */
export const CHARACTER_ANIMATIONS: AnimationDefinition[] = [
  // Core locomotion
  { name: 'idle',        file: 'idle.glb',         loop: THREE.LoopRepeat },
  { name: 'walk',        file: 'walk.glb',         loop: THREE.LoopRepeat, timeScale: 1.0 },
  { name: 'run',         file: 'run.glb',          loop: THREE.LoopRepeat, timeScale: 1.0 },

  // Crouch
  { name: 'crouchIdle',  file: 'crouch_idle.glb',  loop: THREE.LoopRepeat },
  { name: 'crouchWalk',  file: 'crouch_walk.glb',  loop: THREE.LoopRepeat, timeScale: 0.9 },

  // Prone
  { name: 'proneIdle',   file: 'prone_idle.glb',   loop: THREE.LoopRepeat },
  { name: 'proneCrawl',  file: 'prone_crawl.glb',  loop: THREE.LoopRepeat, timeScale: 0.7 },

  // Combat
  { name: 'rifleIdle',   file: 'rifle_idle.glb',   loop: THREE.LoopRepeat },
  { name: 'rifleWalk',   file: 'rifle_walk.glb',   loop: THREE.LoopRepeat },
  { name: 'rifleRun',    file: 'rifle_run.glb',    loop: THREE.LoopRepeat },
  { name: 'rifleShoot',  file: 'rifle_shoot.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'rifleReload', file: 'rifle_reload.glb',  loop: THREE.LoopOnce, clampWhenFinished: true },

  // Reactions
  { name: 'death',       file: 'death.glb',        loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitFront',    file: 'hit_front.glb',     loop: THREE.LoopOnce, clampWhenFinished: true },
  { name: 'hitBack',     file: 'hit_back.glb',      loop: THREE.LoopOnce, clampWhenFinished: true },

  // Social / Ambient
  { name: 'smoking',     file: 'smoking.glb',      loop: THREE.LoopRepeat },
  { name: 'talking',     file: 'talking.glb',      loop: THREE.LoopRepeat },
  { name: 'sitting',     file: 'sitting.glb',      loop: THREE.LoopRepeat },
  { name: 'radio',       file: 'radio.glb',        loop: THREE.LoopRepeat },
];

/** Minimal locomotion-only set (for prototyping with fewer files) */
export const MINIMAL_ANIMATIONS: AnimationDefinition[] = [
  { name: 'idle',  file: 'idle.glb',  loop: THREE.LoopRepeat },
  { name: 'walk',  file: 'walk.glb',  loop: THREE.LoopRepeat },
  { name: 'run',   file: 'run.glb',   loop: THREE.LoopRepeat },
  { name: 'death', file: 'death.glb', loop: THREE.LoopOnce, clampWhenFinished: true },
];

// ============================================================
// PROCEDURAL ANIMATION GENERATOR
// ============================================================

/**
 * Procedural animation parameters for each state.
 * Each parameter set defines sinusoidal keyframes for root, spine,
 * limbs, and head to create visually distinct placeholder animations.
 *
 * The generated clips operate on standard Mixamo skeleton bones:
 *   Hips, Spine, Spine1, Spine2, Neck, Head,
 *   LeftArm, LeftForeArm, LeftHand,
 *   RightArm, RightForeArm, RightHand,
 *   LeftUpLeg, LeftLeg, LeftFoot,
 *   RightUpLeg, RightLeg, RightFoot
 */
interface ProceduralAnimParams {
  /** Animation duration in seconds */
  duration: number;
  /** Number of keyframes to generate */
  keyframeCount: number;
  /** Root (Hips) bone transforms */
  hips: {
    /** Vertical offset (breathing / bob) */
    y?: { amp: number; freq: number; phase: number };
    /** Sway left/right */
    x?: { amp: number; freq: number; phase: number };
    /** Lean forward/back */
    rotX?: { amp: number; freq: number; phase: number };
    /** Twist left/right */
    rotY?: { amp: number; freq: number; phase: number };
    /** Tilt */
    rotZ?: { amp: number; freq: number; phase: number };
  };
  /** Spine bone transforms (subtle torso twist) */
  spine?: {
    rotX?: { amp: number; freq: number; phase: number };
    rotY?: { amp: number; freq: number; phase: number };
    rotZ?: { amp: number; freq: number; phase: number };
  };
  /** Head movement */
  head?: {
    rotX?: { amp: number; freq: number; phase: number };
    rotY?: { amp: number; freq: number; phase: number };
    rotZ?: { amp: number; freq: number; phase: number };
  };
  /** Left arm transforms */
  leftArm?: {
    rotX?: { amp: number; freq: number; phase: number };
    rotZ?: { amp: number; freq: number; phase: number };
  };
  /** Right arm transforms */
  rightArm?: {
    rotX?: { amp: number; freq: number; phase: number };
    rotZ?: { amp: number; freq: number; phase: number };
  };
  /** Left forearm (elbow bend) */
  leftForeArm?: {
    rotX?: { amp: number; freq: number; phase: number };
  };
  /** Right forearm (elbow bend) */
  rightForeArm?: {
    rotX?: { amp: number; freq: number; phase: number };
  };
  /** Left leg transforms */
  leftLeg?: {
    rotX?: { amp: number; freq: number; phase: number };
  };
  /** Left shin */
  leftShin?: {
    rotX?: { amp: number; freq: number; phase: number };
  };
  /** Right leg transforms */
  rightLeg?: {
    rotX?: { amp: number; freq: number; phase: number };
  };
  /** Right shin */
  rightShin?: {
    rotX?: { amp: number; freq: number; phase: number };
  };
}

/** Oscillation parameter helper */
function osc(amp: number, freq: number, phase: number = 0) {
  return { amp, freq, phase };
}

/**
 * Complete set of procedural parameters for every animation state.
 * Each state has a distinct visual profile created through different
 * frequencies, amplitudes, and phases for each bone group.
 */
const PROCEDURAL_PARAMS: Record<string, ProceduralAnimParams> = {

  // ──────────────────────────────────────────────────
  // IDLE — Gentle breathing, subtle sway
  // ──────────────────────────────────────────────────
  idle: {
    duration: 2.5,
    keyframeCount: 60,
    hips: {
      y: osc(0.008, 1, 0),
      x: osc(0.003, 0.5, 0.5),
    },
    spine: {
      rotX: osc(0.02, 1, 0),
      rotZ: osc(0.01, 0.5, 0.5),
    },
    head: {
      rotX: osc(0.01, 0.8, 0.3),
      rotY: osc(0.008, 0.3, 0),
    },
    leftArm: {
      rotZ: osc(0.02, 0.5, 0),
    },
    rightArm: {
      rotZ: osc(0.02, 0.5, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // WALK — Rhythmic stride, arm swing, vertical bob
  // ──────────────────────────────────────────────────
  walk: {
    duration: 1.0,
    keyframeCount: 48,
    hips: {
      y: osc(0.04, 2, 0),
      x: osc(0.02, 2, Math.PI / 2),
      rotZ: osc(0.04, 2, 0),
    },
    spine: {
      rotX: osc(0.03, 2, 0.2),
      rotZ: osc(0.02, 2, Math.PI),
    },
    head: {
      rotX: osc(0.02, 2, 0.1),
      rotZ: osc(0.01, 2, Math.PI),
    },
    leftArm: {
      rotX: osc(0.3, 2, Math.PI),
      rotZ: osc(0.1, 2, 0),
    },
    rightArm: {
      rotX: osc(0.3, 2, 0),
      rotZ: osc(0.1, 2, Math.PI),
    },
    leftLeg: {
      rotX: osc(0.4, 2, 0),
    },
    leftShin: {
      rotX: osc(0.25, 2, Math.PI / 2),
    },
    rightLeg: {
      rotX: osc(0.4, 2, Math.PI),
    },
    rightShin: {
      rotX: osc(0.25, 2, Math.PI * 1.5),
    },
  },

  // ──────────────────────────────────────────────────
  // RUN — Faster stride, higher bob, more arm swing
  // ──────────────────────────────────────────────────
  run: {
    duration: 0.65,
    keyframeCount: 48,
    hips: {
      y: osc(0.07, 3, 0),
      x: osc(0.025, 3, Math.PI / 2),
      rotZ: osc(0.06, 3, 0),
    },
    spine: {
      rotX: osc(0.06, 3, 0.15),
      rotZ: osc(0.03, 3, Math.PI),
    },
    head: {
      rotX: osc(0.025, 3, 0.1),
      rotZ: osc(0.015, 3, Math.PI),
    },
    leftArm: {
      rotX: osc(0.6, 3, Math.PI),
      rotZ: osc(0.15, 3, 0),
    },
    rightArm: {
      rotX: osc(0.6, 3, 0),
      rotZ: osc(0.15, 3, Math.PI),
    },
    leftForeArm: {
      rotX: osc(0.4, 3, Math.PI * 0.5),
    },
    rightForeArm: {
      rotX: osc(0.4, 3, Math.PI * 1.5),
    },
    leftLeg: {
      rotX: osc(0.7, 3, 0),
    },
    leftShin: {
      rotX: osc(0.5, 3, Math.PI * 0.6),
    },
    rightLeg: {
      rotX: osc(0.7, 3, Math.PI),
    },
    rightShin: {
      rotX: osc(0.5, 3, Math.PI * 1.6),
    },
  },

  // ──────────────────────────────────────────────────
  // CROUCH IDLE — Reduced sway, lowered spine
  // ──────────────────────────────────────────────────
  crouchIdle: {
    duration: 3.0,
    keyframeCount: 60,
    hips: {
      y: osc(0.005, 0.8, 0),
      rotX: osc(0.03, 0.8, 0),
    },
    spine: {
      rotX: osc(0.04, 0.8, 0),
      rotZ: osc(0.008, 0.4, 0.5),
    },
    head: {
      rotX: osc(0.015, 0.6, 0.2),
      rotY: osc(0.01, 0.25, 0),
    },
    leftArm: {
      rotZ: osc(0.03, 0.5, 0),
    },
    rightArm: {
      rotZ: osc(0.03, 0.5, Math.PI),
    },
    leftForeArm: {
      rotX: osc(0.05, 0.5, 0),
    },
    rightForeArm: {
      rotX: osc(0.05, 0.5, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // CROUCH WALK — Slow, low-profile strides
  // ──────────────────────────────────────────────────
  crouchWalk: {
    duration: 1.6,
    keyframeCount: 48,
    hips: {
      y: osc(0.025, 1.5, 0),
      x: osc(0.015, 1.5, Math.PI / 2),
      rotX: osc(0.04, 1.5, 0),
      rotZ: osc(0.03, 1.5, 0),
    },
    spine: {
      rotX: osc(0.05, 1.5, 0.1),
      rotZ: osc(0.015, 1.5, Math.PI),
    },
    head: {
      rotX: osc(0.02, 1.5, 0.05),
    },
    leftArm: {
      rotX: osc(0.2, 1.5, Math.PI),
      rotZ: osc(0.08, 1.5, 0),
    },
    rightArm: {
      rotX: osc(0.2, 1.5, 0),
      rotZ: osc(0.08, 1.5, Math.PI),
    },
    leftLeg: {
      rotX: osc(0.3, 1.5, 0),
    },
    leftShin: {
      rotX: osc(0.2, 1.5, Math.PI * 0.5),
    },
    rightLeg: {
      rotX: osc(0.3, 1.5, Math.PI),
    },
    rightShin: {
      rotX: osc(0.2, 1.5, Math.PI * 1.5),
    },
  },

  // ──────────────────────────────────────────────────
  // PRONE IDLE — Minimal movement, mostly breathing
  // ──────────────────────────────────────────────────
  proneIdle: {
    duration: 3.5,
    keyframeCount: 60,
    hips: {
      y: osc(0.003, 0.6, 0),
    },
    spine: {
      rotX: osc(0.01, 0.6, 0),
    },
    head: {
      rotX: osc(0.015, 0.5, 0.2),
      rotY: osc(0.02, 0.15, 0),
    },
    leftArm: {
      rotZ: osc(0.01, 0.3, 0),
    },
    rightArm: {
      rotZ: osc(0.01, 0.3, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // PRONE CRAWL — Alternating arm pull, body drag
  // ──────────────────────────────────────────────────
  proneCrawl: {
    duration: 1.8,
    keyframeCount: 48,
    hips: {
      y: osc(0.008, 1.2, 0),
      x: osc(0.01, 1.2, Math.PI / 2),
    },
    spine: {
      rotZ: osc(0.02, 1.2, 0),
    },
    head: {
      rotX: osc(0.02, 1.2, 0.1),
    },
    leftArm: {
      rotX: osc(0.35, 1.2, 0),
      rotZ: osc(0.1, 1.2, 0),
    },
    rightArm: {
      rotX: osc(0.35, 1.2, Math.PI),
      rotZ: osc(0.1, 1.2, Math.PI),
    },
    leftLeg: {
      rotX: osc(0.1, 1.2, Math.PI * 0.3),
    },
    rightLeg: {
      rotX: osc(0.1, 1.2, Math.PI * 1.3),
    },
  },

  // ──────────────────────────────────────────────────
  // COVER IDLE (Rifle Aiming) — Leaning, weapon raised
  // ──────────────────────────────────────────────────
  coverIdle: {
    duration: 2.8,
    keyframeCount: 60,
    hips: {
      y: osc(0.004, 0.7, 0),
      rotX: osc(0.03, 0.7, 0),
    },
    spine: {
      rotX: osc(0.025, 0.7, 0),
      rotY: osc(0.04, 0.35, 0),
      rotZ: osc(0.015, 0.7, Math.PI),
    },
    head: {
      rotX: osc(0.01, 0.6, 0.1),
      rotY: osc(0.015, 0.3, 0),
    },
    leftArm: {
      rotX: osc(0.04, 0.7, 0),
      rotZ: osc(-0.3, 0.7, 0),   // Arms forward (weapon hold)
    },
    rightArm: {
      rotX: osc(0.04, 0.7, Math.PI),
      rotZ: osc(0.3, 0.7, Math.PI),
    },
    leftForeArm: {
      rotX: osc(0.02, 0.7, 0),
    },
    rightForeArm: {
      rotX: osc(0.02, 0.7, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // DEATH — Falling collapse
  // ──────────────────────────────────────────────────
  death: {
    duration: 1.2,
    keyframeCount: 36,
    hips: {
      y: osc(0.15, 0.8, 0),
      rotX: osc(0.3, 0.8, 0),
    },
    spine: {
      rotX: osc(0.2, 0.8, 0.3),
      rotZ: osc(0.15, 0.8, 0.5),
    },
    head: {
      rotX: osc(0.25, 0.8, 0.2),
      rotZ: osc(0.15, 0.8, 0.6),
    },
    leftArm: {
      rotX: osc(0.4, 0.8, 0),
      rotZ: osc(0.3, 0.8, 0.5),
    },
    rightArm: {
      rotX: osc(0.3, 0.8, 0.3),
      rotZ: osc(-0.4, 0.8, 0.3),
    },
    leftLeg: {
      rotX: osc(0.2, 0.8, 0.2),
    },
    rightLeg: {
      rotX: osc(0.15, 0.8, 0.4),
    },
  },

  // ──────────────────────────────────────────────────
  // SMOKING — Hand-to-mouth, relaxed sway
  // ──────────────────────────────────────────────────
  smoking: {
    duration: 4.0,
    keyframeCount: 60,
    hips: {
      y: osc(0.006, 0.6, 0),
      x: osc(0.004, 0.4, 0.5),
    },
    spine: {
      rotX: osc(0.015, 0.6, 0),
      rotZ: osc(0.01, 0.4, 0.5),
    },
    head: {
      rotX: osc(0.012, 0.5, 0.3),
      rotY: osc(0.02, 0.2, 0),
      rotZ: osc(0.008, 0.4, 0.5),
    },
    leftArm: {
      rotZ: osc(0.03, 0.6, 0),
    },
    // Right arm lifts to mouth periodically
    rightArm: {
      rotX: osc(0.25, 0.6, Math.PI * 0.5),
      rotZ: osc(0.15, 0.6, Math.PI),
    },
    rightForeArm: {
      rotX: osc(0.35, 0.6, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // TALKING — Head nods, hand gestures
  // ──────────────────────────────────────────────────
  talking: {
    duration: 2.0,
    keyframeCount: 48,
    hips: {
      y: osc(0.005, 0.8, 0),
      rotZ: osc(0.015, 0.5, 0),
    },
    spine: {
      rotX: osc(0.02, 0.8, 0),
      rotZ: osc(0.012, 0.5, Math.PI / 2),
    },
    head: {
      rotX: osc(0.035, 1.2, 0),   // Nodding while talking
      rotY: osc(0.025, 0.6, 0),
      rotZ: osc(0.012, 0.8, Math.PI / 2),
    },
    leftArm: {
      rotX: osc(0.1, 0.6, 0),
      rotZ: osc(0.15, 0.6, 0),
    },
    rightArm: {
      rotX: osc(0.12, 0.5, Math.PI * 0.5),
      rotZ: osc(0.18, 0.5, Math.PI),
    },
    rightForeArm: {
      rotX: osc(0.15, 0.5, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // SITTING — Minimal movement, hands on lap
  // ──────────────────────────────────────────────────
  sitting: {
    duration: 3.5,
    keyframeCount: 60,
    hips: {
      y: osc(0.003, 0.5, 0),
    },
    spine: {
      rotX: osc(0.015, 0.5, 0),
      rotZ: osc(0.008, 0.3, 0.5),
    },
    head: {
      rotX: osc(0.012, 0.4, 0.2),
      rotY: osc(0.02, 0.15, 0),
    },
    leftArm: {
      rotZ: osc(0.02, 0.3, 0),
    },
    rightArm: {
      rotZ: osc(0.02, 0.3, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // RADIO — Hand to ear, slight lean
  // ──────────────────────────────────────────────────
  radio: {
    duration: 3.0,
    keyframeCount: 60,
    hips: {
      y: osc(0.004, 0.6, 0),
    },
    spine: {
      rotX: osc(0.018, 0.6, 0),
      rotY: osc(0.03, 0.3, 0),
    },
    head: {
      rotX: osc(0.01, 0.5, 0.2),
      rotZ: osc(0.04, 0.5, 0),    // Tilt toward radio
    },
    leftArm: {
      rotZ: osc(0.03, 0.6, 0),
    },
    // Right arm up to ear
    rightArm: {
      rotX: osc(0.15, 0.6, Math.PI),
      rotZ: osc(0.4, 0.6, Math.PI),
    },
    rightForeArm: {
      rotX: osc(0.5, 0.6, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // RIFLE SHOOT — Recoil impulse
  // ──────────────────────────────────────────────────
  rifleShoot: {
    duration: 0.3,
    keyframeCount: 18,
    hips: {
      y: osc(0.01, 5, 0),
      rotX: osc(0.03, 5, 0),
    },
    spine: {
      rotX: osc(0.04, 5, 0),
    },
    head: {
      rotX: osc(0.02, 5, 0.1),
    },
    rightArm: {
      rotX: osc(0.05, 5, 0),
      rotZ: osc(0.03, 5, Math.PI),
    },
    rightForeArm: {
      rotX: osc(0.03, 5, 0),
    },
  },

  // ──────────────────────────────────────────────────
  // RIFLE RELOAD — Arm movement to weapon
  // ──────────────────────────────────────────────────
  rifleReload: {
    duration: 2.2,
    keyframeCount: 48,
    hips: {
      y: osc(0.006, 0.8, 0),
      rotX: osc(0.02, 0.8, 0),
    },
    spine: {
      rotX: osc(0.04, 0.8, 0),
      rotY: osc(0.06, 0.8, Math.PI / 2),
    },
    head: {
      rotX: osc(0.03, 0.8, 0.3),
      rotY: osc(0.04, 0.8, 0),
    },
    leftArm: {
      rotX: osc(0.2, 0.8, 0),
      rotZ: osc(0.25, 0.8, 0),
    },
    leftForeArm: {
      rotX: osc(0.3, 0.8, Math.PI * 0.5),
    },
    rightArm: {
      rotX: osc(0.1, 0.8, Math.PI),
      rotZ: osc(0.15, 0.8, Math.PI),
    },
    rightForeArm: {
      rotX: osc(0.2, 0.8, Math.PI * 0.5),
    },
  },

  // ──────────────────────────────────────────────────
  // HIT FRONT — Backward snap
  // ──────────────────────────────────────────────────
  hitFront: {
    duration: 0.5,
    keyframeCount: 18,
    hips: {
      rotX: osc(0.15, 3, 0),
    },
    spine: {
      rotX: osc(0.2, 3, 0.2),
      rotZ: osc(0.08, 3, 0.5),
    },
    head: {
      rotX: osc(0.25, 3, 0.1),
    },
    leftArm: {
      rotX: osc(0.15, 3, 0),
      rotZ: osc(0.2, 3, 0),
    },
    rightArm: {
      rotX: osc(0.1, 3, 0.3),
      rotZ: osc(-0.15, 3, Math.PI),
    },
  },

  // ──────────────────────────────────────────────────
  // HIT BACK — Forward snap
  // ──────────────────────────────────────────────────
  hitBack: {
    duration: 0.5,
    keyframeCount: 18,
    hips: {
      rotX: osc(-0.12, 3, 0),
    },
    spine: {
      rotX: osc(-0.18, 3, 0.2),
      rotZ: osc(0.08, 3, 0.5),
    },
    head: {
      rotX: osc(-0.2, 3, 0.1),
    },
    leftArm: {
      rotX: osc(-0.12, 3, 0),
      rotZ: osc(0.15, 3, 0),
    },
    rightArm: {
      rotX: osc(-0.1, 3, 0.3),
      rotZ: osc(0.15, 3, Math.PI),
    },
  },
};

/**
 * Procedural animation settings.
 * Controls how placeholder animations are generated and scaled.
 */
export const PROCEDURAL_ANIM_SETTINGS = {
  /** Global scale multiplier for all procedural bone rotations */
  SCALE_MULTIPLIER: 1.0,

  /** Default duration for states not in the params table */
  DEFAULT_DURATION: 2.0,

  /** Default keyframe count for procedural generation */
  DEFAULT_KEYFRAME_COUNT: 48,
};

/**
 * Generate a procedural AnimationClip for a given state name.
 *
 * Creates sinusoidal keyframe tracks for the Mixamo skeleton hierarchy.
 * Each state has a distinct visual profile (different sway, bob, limb swing).
 *
 * @param stateName - Logical animation state name (e.g., 'idle', 'walk', 'run')
 * @param skeletonBones - Array of bone names from the loaded skeleton
 *                        (used to verify bone existence; optional)
 * @returns A new THREE.AnimationClip ready for use with AnimationMixer
 */
export function generateProceduralAnimation(
  stateName: string,
  skeletonBones?: string[]
): THREE.AnimationClip {
  const params = PROCEDURAL_PARAMS[stateName];
  const duration = params?.duration ?? PROCEDURAL_ANIM_SETTINGS.DEFAULT_DURATION;
  const kCount = params?.keyframeCount ?? PROCEDURAL_ANIM_SETTINGS.DEFAULT_KEYFRAME_COUNT;
  const tracks: THREE.KeyframeTrack[] = [];

  // Helper: generate sine-wave keyframe values
  function sineWave(
    amp: number,
    freq: number,
    phase: number,
    count: number,
    dur: number
  ): number[] {
    const values: number[] = [];
    const scale = PROCEDURAL_ANIM_SETTINGS.SCALE_MULTIPLIER;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * dur;
      values.push(Math.sin(t * freq * Math.PI * 2 + phase) * amp * scale);
    }
    return values;
  }

  // Helper: generate time array
  function timeArray(count: number, dur: number): number[] {
    const times: number[] = [];
    for (let i = 0; i < count; i++) {
      times.push((i / count) * dur);
    }
    return times;
  }

  // Helper: check if bone exists in skeleton (if provided)
  function boneExists(boneName: string): boolean {
    if (!skeletonBones) return true; // If no skeleton info, assume it exists
    return skeletonBones.includes(boneName);
  }

  // Helper: create a Quaternion keyframe track from Euler oscillations
  function createQuatTrack(
    boneName: string,
    rotX?: { amp: number; freq: number; phase: number },
    rotY?: { amp: number; freq: number; phase: number },
    rotZ?: { amp: number; freq: number; phase: number }
  ): THREE.KeyframeTrack | null {
    if (!boneExists(boneName)) return null;

    const times = timeArray(kCount, duration);
    const values: number[] = [];

    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();

    for (let i = 0; i < kCount; i++) {
      const t = (i / kCount) * duration;
      const scale = PROCEDURAL_ANIM_SETTINGS.SCALE_MULTIPLIER;

      const x = rotX
        ? Math.sin(t * rotX.freq * Math.PI * 2 + rotX.phase) * rotX.amp * scale
        : 0;
      const y = rotY
        ? Math.sin(t * rotY.freq * Math.PI * 2 + rotY.phase) * rotY.amp * scale
        : 0;
      const z = rotZ
        ? Math.sin(t * rotZ.freq * Math.PI * 2 + rotZ.phase) * rotZ.amp * scale
        : 0;

      euler.set(x, y, z, 'XYZ');
      quat.setFromEuler(euler);
      values.push(quat.x, quat.y, quat.z, quat.w);
    }

    return new THREE.QuaternionKeyframeTrack(
      `${boneName}.quaternion`,
      times,
      values
    );
  }

  // Helper: create a Vector3 keyframe track
  function createVec3Track(
    boneName: string,
    prop: 'position',
    pos?: { x?: { amp: number; freq: number; phase: number }; y?: { amp: number; freq: number; phase: number }; z?: { amp: number; freq: number; phase: number } }
  ): THREE.KeyframeTrack | null {
    if (!boneExists(boneName) || !pos) return null;

    const times = timeArray(kCount, duration);
    const values: number[] = [];

    for (let i = 0; i < kCount; i++) {
      const t = (i / kCount) * duration;
      const scale = PROCEDURAL_ANIM_SETTINGS.SCALE_MULTIPLIER;

      values.push(
        pos.x
          ? Math.sin(t * pos.x.freq * Math.PI * 2 + pos.x.phase) * pos.x.amp * scale
          : 0,
        pos.y
          ? Math.sin(t * pos.y.freq * Math.PI * 2 + pos.y.phase) * pos.y.amp * scale
          : 0,
        pos.z
          ? Math.sin(t * pos.z.freq * Math.PI * 2 + pos.z.phase) * pos.z.amp * scale
          : 0
      );
    }

    return new THREE.VectorKeyframeTrack(
      `${boneName}.${prop}`,
      times,
      values
    );
  }

  // ── Build tracks from params ──

  if (params) {
    // Hips
    if (params.hips) {
      const posTrack = createVec3Track('Hips', 'position', params.hips);
      if (posTrack) tracks.push(posTrack);

      const rotTrack = createQuatTrack('Hips', params.hips.rotX, params.hips.rotY, params.hips.rotZ);
      if (rotTrack) tracks.push(rotTrack);
    }

    // Spine
    if (params.spine) {
      const rotTrack = createQuatTrack('Spine', params.spine.rotX, params.spine.rotY, params.spine.rotZ);
      if (rotTrack) tracks.push(rotTrack);
    }

    // Spine1 (secondary spine)
    if (params.spine) {
      const rotTrack = createQuatTrack(
        'Spine1',
        params.spine.rotX ? { amp: params.spine.rotX.amp * 0.5, freq: params.spine.rotX.freq, phase: params.spine.rotX.phase } : undefined,
        params.spine.rotY ? { amp: params.spine.rotY.amp * 0.5, freq: params.spine.rotY.freq, phase: params.spine.rotY.phase } : undefined,
        params.spine.rotZ ? { amp: params.spine.rotZ.amp * 0.5, freq: params.spine.rotZ.freq, phase: params.spine.rotZ.phase } : undefined
      );
      if (rotTrack) tracks.push(rotTrack);
    }

    // Head
    if (params.head) {
      const rotTrack = createQuatTrack('Head', params.head.rotX, params.head.rotY, params.head.rotZ);
      if (rotTrack) tracks.push(rotTrack);
    }

    // Left arm chain
    if (params.leftArm) {
      const rotTrack = createQuatTrack('LeftArm', params.leftArm.rotX, undefined, params.leftArm.rotZ);
      if (rotTrack) tracks.push(rotTrack);
    }
    if (params.leftForeArm) {
      const rotTrack = createQuatTrack('LeftForeArm', params.leftForeArm.rotX);
      if (rotTrack) tracks.push(rotTrack);
    }

    // Right arm chain
    if (params.rightArm) {
      const rotTrack = createQuatTrack('RightArm', params.rightArm.rotX, undefined, params.rightArm.rotZ);
      if (rotTrack) tracks.push(rotTrack);
    }
    if (params.rightForeArm) {
      const rotTrack = createQuatTrack('RightForeArm', params.rightForeArm.rotX);
      if (rotTrack) tracks.push(rotTrack);
    }

    // Left leg chain
    if (params.leftLeg) {
      const rotTrack = createQuatTrack('LeftUpLeg', params.leftLeg.rotX);
      if (rotTrack) tracks.push(rotTrack);
    }
    if (params.leftShin) {
      const rotTrack = createQuatTrack('LeftLeg', params.leftShin.rotX);
      if (rotTrack) tracks.push(rotTrack);
    }

    // Right leg chain
    if (params.rightLeg) {
      const rotTrack = createQuatTrack('RightUpLeg', params.rightLeg.rotX);
      if (rotTrack) tracks.push(rotTrack);
    }
    if (params.rightShin) {
      const rotTrack = createQuatTrack('RightLeg', params.rightShin.rotX);
      if (rotTrack) tracks.push(rotTrack);
    }
  } else {
    // Fallback: generate a generic subtle idle sway for unknown states
    const times = timeArray(kCount, duration);
    const scale = PROCEDURAL_ANIM_SETTINGS.SCALE_MULTIPLIER;

    // Simple body sway
    const hipRotTrack = createQuatTrack('Hips', osc(0.015, 0.7, 0), undefined, osc(0.008, 0.4, 0.5));
    if (hipRotTrack) tracks.push(hipRotTrack);

    const spineRotTrack = createQuatTrack('Spine', osc(0.01, 0.7, 0));
    if (spineRotTrack) tracks.push(spineRotTrack);

    const headRotTrack = createQuatTrack('Head', osc(0.008, 0.5, 0.2));
    if (headRotTrack) tracks.push(headRotTrack);
  }

  // Ensure we have at least one track
  if (tracks.length === 0) {
    // Absolute minimum: an empty clip
    const times = [0, duration];
    const values = [0, 0, 0, 1, 0, 0, 0, 1]; // Two identical quaternions
    tracks.push(new THREE.QuaternionKeyframeTrack('Hips.quaternion', times, values));
  }

  const clip = new THREE.AnimationClip(
    stateName,
    duration,
    tracks
  );

  return clip;
}

/**
 * Generate procedural animations for ALL registered states.
 * Returns a map of state name → AnimationClip.
 *
 * This is the primary function for prototyping: it provides
 * placeholder animations for every state without requiring
 * any downloaded Mixamo files.
 *
 * @param skeletonBones - Optional array of bone names from the skeleton
 *                        to verify against (skips tracks for missing bones)
 */
export function generateAllProceduralAnimations(
  skeletonBones?: string[]
): Map<string, THREE.AnimationClip> {
  const clips = new Map<string, THREE.AnimationClip>();

  for (const stateName of Object.keys(PROCEDURAL_PARAMS)) {
    clips.set(stateName, generateProceduralAnimation(stateName, skeletonBones));
  }

  return clips;
}

// ============================================================
// MIXAMO LOADER CLASS
// ============================================================

export class MixamoLoader {
  private loader: GLTFLoader;
  private modelCache: Map<string, THREE.Group> = new Map();
  private animationCache: Map<string, THREE.AnimationClip> = new Map();
  private loadingPromises: Map<string, Promise<any>> = new Map();

  /** Mixamo models are in centimeters; Three.js uses meters. */
  static readonly SCALE_FACTOR = 0.01;

  constructor() {
    this.loader = new GLTFLoader();
  }

  // ============================================================
  // MODEL LOADING
  // ============================================================

  /**
   * Load a character model (mesh + skeleton) from a GLB file.
   * Applies correct scale and shadow settings.
   *
   * @param url - Full URL to the GLB file
   * @param options - Loading options
   */
  async loadModel(
    url: string,
    options?: {
      scale?: number;
      castShadow?: boolean;
      receiveShadow?: boolean;
    }
  ): Promise<THREE.Group> {
    // Check cache
    if (this.modelCache.has(url)) {
      return this.modelCache.get(url)!.clone();
    }

    // Deduplicate concurrent loads of the same URL
    if (this.loadingPromises.has(url)) {
      const cached = await this.loadingPromises.get(url);
      return cached.clone();
    }

    const promise = new Promise<THREE.Group>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          const model = this.processModel(gltf, options);
          this.modelCache.set(url, model);
          resolve(model);
        },
        undefined,
        (error) => {
          console.error(`[MixamoLoader] Failed to load model: ${url}`, error);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(url, promise);
    const result = await promise;
    this.loadingPromises.delete(url);
    return result;
  }

  /**
   * Process a loaded GLTF result into a proper Three.js model.
   */
  private processModel(
    gltf: GLTF,
    options?: {
      scale?: number;
      castShadow?: boolean;
      receiveShadow?: boolean;
    }
  ): THREE.Group {
    const model = gltf.scene;
    const scale = options?.scale ?? MixamoLoader.SCALE_FACTOR;
    const castShadow = options?.castShadow ?? true;
    const receiveShadow = options?.receiveShadow ?? true;

    // Apply Mixamo scale (cm → m)
    model.scale.set(scale, scale, scale);

    // Enable shadows on all meshes
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;

        // Ensure materials use standard material for lighting
        if (child.material) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];

          for (const mat of materials) {
            if (mat instanceof THREE.MeshStandardMaterial) {
              // Already standard — good
            } else if (mat instanceof THREE.MeshPhongMaterial) {
              // Convert phong to standard for PBR pipeline
              const std = new THREE.MeshStandardMaterial({
                color: mat.color,
                map: mat.map,
                normalMap: mat.normalMap,
                roughness: 0.7,
                metalness: 0.1,
              });
              child.material = std;
            }
          }
        }
      }
    });

    return model;
  }

  // ============================================================
  // ANIMATION LOADING
  // ============================================================

  /**
   * Load a single animation clip from a GLB file.
   * The GLB should contain only the animation (no mesh needed).
   *
   * @param url - Full URL to the GLB animation file
   * @param name - Name to assign to the clip
   */
  async loadAnimation(url: string, name: string): Promise<THREE.AnimationClip> {
    // Check cache
    if (this.animationCache.has(name)) {
      return this.animationCache.get(name)!;
    }

    // Deduplicate
    if (this.loadingPromises.has(url)) {
      return await this.loadingPromises.get(url);
    }

    const promise = new Promise<THREE.AnimationClip>((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          if (gltf.animations.length === 0) {
            reject(new Error(`No animations found in ${url}`));
            return;
          }

          const clip = gltf.animations[0];
          clip.name = name;

          // Fix Mixamo bone names if needed (sometimes they have "mixamorig:" prefix)
          this.fixMixamoBoneNames(clip);

          this.animationCache.set(name, clip);
          resolve(clip);
        },
        undefined,
        (error) => {
          console.error(`[MixamoLoader] Failed to load animation: ${url}`, error);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(url, promise);
    const result = await promise;
    this.loadingPromises.delete(url);
    return result;
  }

  /**
   * Load multiple animation clips in parallel.
   *
   * @param basePath - Base directory for animation files
   * @param definitions - Array of animation definitions
   * @param onProgress - Optional progress callback
   */
  async loadAnimations(
    basePath: string,
    definitions: AnimationDefinition[],
    onProgress?: ProgressCallback
  ): Promise<Map<string, THREE.AnimationClip>> {
    const animations = new Map<string, THREE.AnimationClip>();
    const total = definitions.length;
    let loaded = 0;

    const promises = definitions.map(async (def) => {
      const url = `${basePath}/${def.file}`;
      try {
        const clip = await this.loadAnimation(url, def.name);

        // Apply per-animation settings
        if (def.timeScale !== undefined) {
          // Store custom time scale in clip metadata for later use
          (clip as any).__timeScale = def.timeScale;
        }

        animations.set(def.name, clip);
        loaded++;
        onProgress?.(loaded, total, def.name);
      } catch (err) {
        console.warn(`[MixamoLoader] Skipping animation "${def.name}": ${err}`);
        loaded++;
        onProgress?.(loaded, total, def.name);
      }
    });

    await Promise.allSettled(promises);
    return animations;
  }

  /**
   * Load animations with automatic Mixamo name resolution.
   * Tries to match loaded clips by Mixamo's internal animation name
   * (from MIXAMO_ANIMATION_NAMES) in addition to the filename.
   *
   * @param basePath - Base directory for animation files
   * @param definitions - Array of animation definitions
   * @param onProgress - Optional progress callback
   */
  async loadAnimationsWithMixamoNames(
    basePath: string,
    definitions: AnimationDefinition[],
    onProgress?: ProgressCallback
  ): Promise<Map<string, THREE.AnimationClip>> {
    const animations = new Map<string, THREE.AnimationClip>();
    const total = definitions.length;
    let loaded = 0;

    const promises = definitions.map(async (def) => {
      const url = `${basePath}/${def.file}`;
      try {
        const clip = await this.loadAnimation(url, def.name);

        // Check if the loaded clip name matches the expected Mixamo name
        const expectedMixamoName = getMixamoName(def.name);
        if (clip.name !== expectedMixamoName && clip.name !== def.name) {
          console.log(
            `[MixamoLoader] Clip "${def.name}": Mixamo name "${clip.name}" ` +
            `(expected "${expectedMixamoName}")`
          );
        }

        // Apply per-animation settings
        if (def.timeScale !== undefined) {
          (clip as any).__timeScale = def.timeScale;
        }

        animations.set(def.name, clip);
        loaded++;
        onProgress?.(loaded, total, def.name);
      } catch (err) {
        console.warn(`[MixamoLoader] Skipping animation "${def.name}": ${err}`);
        loaded++;
        onProgress?.(loaded, total, def.name);
      }
    });

    await Promise.allSettled(promises);
    return animations;
  }

  // ============================================================
  // CHARACTER LOADING (Model + Animations)
  // ============================================================

  /**
   * Load a complete character with all animations.
   *
   * @param characterName - Name of the character (e.g., 'wolf', 'falcon')
   * @param basePath - Base path to character assets (e.g., '/assets/characters/wolf')
   * @param modelFile - Model filename (default: '{characterName}.glb')
   * @param animationDefs - Animation definitions (default: CHARACTER_ANIMATIONS)
   * @param onProgress - Optional progress callback
   */
  async loadCharacter(
    characterName: string,
    basePath: string,
    modelFile?: string,
    animationDefs?: AnimationDefinition[],
    onProgress?: ProgressCallback
  ): Promise<LoadedCharacter> {
    const modelUrl = `${basePath}/${modelFile ?? `${characterName}.glb`}`;
    const anims = animationDefs ?? CHARACTER_ANIMATIONS;

    // Load model and animations in parallel
    let loaded = 0;
    const total = 1 + anims.length; // model + all animations

    const modelPromise = this.loadModel(modelUrl).then((model) => {
      loaded++;
      onProgress?.(loaded, total, 'model');
      return model;
    });

    const animationsPromise = this.loadAnimations(
      basePath,
      anims,
      (animLoaded, _total, name) => {
        loaded++;
        onProgress?.(loaded, total, name);
      }
    );

    const [model, animations] = await Promise.all([modelPromise, animationsPromise]);

    // Extract skeleton if present
    let skeleton: THREE.Skeleton | null = null;
    model.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.skeleton) {
        skeleton = child.skeleton;
      }
    });

    return { model, animations, skeleton };
  }

  /**
   * Load a complete character with procedural fallback animations.
   * If any Mixamo files fail to load, procedural placeholders are used.
   *
   * @param characterName - Name of the character (e.g., 'wolf', 'falcon')
   * @param basePath - Base path to character assets
   * @param modelFile - Model filename (default: '{characterName}.glb')
   * @param animationDefs - Animation definitions (default: CHARACTER_ANIMATIONS)
   * @param onProgress - Optional progress callback
   */
  async loadCharacterWithProceduralFallback(
    characterName: string,
    basePath: string,
    modelFile?: string,
    animationDefs?: AnimationDefinition[],
    onProgress?: ProgressCallback
  ): Promise<LoadedCharacter> {
    const modelUrl = `${basePath}/${modelFile ?? `${characterName}.glb`}`;
    const anims = animationDefs ?? CHARACTER_ANIMATIONS;

    // Load model first (needed for skeleton bone names)
    let loaded = 0;
    const total = 1 + anims.length;

    const model = await this.loadModel(modelUrl);
    loaded++;
    onProgress?.(loaded, total, 'model');

    // Extract skeleton bones for procedural animation generation
    let skeletonBones: string[] | undefined;
    let skeleton: THREE.Skeleton | null = null;
    model.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.skeleton) {
        skeleton = child.skeleton;
        skeletonBones = child.skeleton.bones.map((b) => b.name);
      }
    });

    // Generate procedural animations as baseline
    const proceduralClips = generateAllProceduralAnimations(skeletonBones);

    // Try to load real Mixamo animations
    const mixamoClips = await this.loadAnimations(
      basePath,
      anims,
      (animLoaded, _total, name) => {
        loaded++;
        onProgress?.(loaded, total, name);
      }
    );

    // Merge: real Mixamo clips override procedural where available
    const animations = new Map<string, THREE.AnimationClip>();
    for (const def of anims) {
      if (mixamoClips.has(def.name)) {
        animations.set(def.name, mixamoClips.get(def.name)!);
      } else if (proceduralClips.has(def.name)) {
        console.log(
          `[MixamoLoader] Using procedural fallback for "${def.name}"`
        );
        animations.set(def.name, proceduralClips.get(def.name)!);
      }
    }

    // Also include any procedural clips not in the definitions
    for (const [name, clip] of proceduralClips) {
      if (!animations.has(name)) {
        animations.set(name, clip);
      }
    }

    return { model, animations, skeleton };
  }

  /**
   * Load ONLY procedural animations (no network requests).
   * Ideal for prototyping before any Mixamo files exist.
   *
   * @param skeletonBones - Optional bone names from the loaded skeleton
   */
  loadProceduralOnly(
    skeletonBones?: string[]
  ): Map<string, THREE.AnimationClip> {
    return generateAllProceduralAnimations(skeletonBones);
  }

  // ============================================================
  // MIXAMO BONE NAME FIXING
  // ============================================================

  /**
   * Fix Mixamo bone naming conventions.
   * Mixamo exports sometimes use "mixamorig:" prefix or
   * inconsistent naming that needs normalization.
   */
  private fixMixamoBoneNames(clip: THREE.AnimationClip): void {
    for (const track of clip.tracks) {
      // Fix bone name paths: "mixamorig:Hips.position" → "Hips.position"
      if (track.name.includes('mixamorig:')) {
        track.name = track.name.replace(/mixamorig:/g, '');
      }
    }
  }

  // ============================================================
  // CACHE MANAGEMENT
  // ============================================================

  /**
   * Clear all cached assets.
   */
  clearCache(): void {
    this.modelCache.clear();
    this.animationCache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get the GLTFLoader instance for custom loading needs.
   */
  getLoader(): GLTFLoader {
    return this.loader;
  }

  /**
   * Dispose of all cached resources.
   */
  dispose(): void {
    for (const model of this.modelCache.values()) {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }
    this.clearCache();
  }
}

// ============================================================
// HELPER: Create AnimationMixer with loaded character
// ============================================================

/**
 * Convenience function: create an AnimationMixer and populate it
 * with all loaded animations.
 *
 * @param model - The character model (THREE.Group)
 * @param animations - Map of animation name → clip
 * @returns Object with mixer and pre-created actions
 */
export function createCharacterMixer(
  model: THREE.Group,
  animations: Map<string, THREE.AnimationClip>
): {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
} {
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();

  for (const [name, clip] of animations) {
    const action = mixer.clipAction(clip);
    action.enabled = true;

    // Apply stored time scale if present
    const customTimeScale = (clip as any).__timeScale;
    if (customTimeScale !== undefined) {
      action.timeScale = customTimeScale;
    }

    actions.set(name, action);
  }

  return { mixer, actions };
}
