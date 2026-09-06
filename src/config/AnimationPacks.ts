/**
 * AnimationPacks.ts
 * Animation pack mapping and best-animation selection for Call of Deity
 *
 * Integrates 7 downloaded Mixamo FBX animation packs:
 *   1. Pro Rifle Pack (PRIMARY — most complete)
 *   2. Rifle 8-Way Locomotion Pack (secondary locomotion)
 *   3. Lite Rifle Pack (fallback locomotion)
 *   4. Basic Shooter Pack (specific actions: firing, reloading, hit)
 *   5. Shooter Pack (start/stop walking, death)
 *   6. Slim Shooter Pack (compact rifle set)
 *   7. PistolHandgun Locomotion Pack (pistol alternate)
 *
 * For each game state, selects the BEST animation from available packs:
 *   - Pro Rifle Pack is primary (most complete, highest quality)
 *   - Rifle 8-Way as secondary (adds directional variants)
 *   - Basic Shooter for specific actions (firing, reloading, hit)
 *   - Shooter Pack for transitions (start/stop walking)
 *   - Lite Rifle as fallback
 *
 * Usage:
 *   import { BEST_ANIMATION_MAP, getBestAnimation } from '../config/AnimationPacks';
 *   const mapping = getBestAnimation('idle');
 *   // → { file: 'idle.fbx', pack: 'Pro Rifle Pack', mixamoName: 'Standing Idle' }
 */

import * as THREE from 'three';
import { FBXAnimationDefinition } from '../utils/FBXAnimationLoader';

// ============================================================
// PACK PRIORITIES (higher = preferred)
// ============================================================

/**
 * Priority order for animation pack selection.
 * When multiple packs have the same animation, the highest-priority pack wins.
 */
export enum PackPriority {
  PRO_RIFLE = 100,           // Primary — most complete set
  RIFLE_8WAY = 90,           // Secondary — excellent directional variants
  BASIC_SHOOTER = 80,        // Best for combat actions (fire, reload, hit)
  SHOOTER = 70,              // Good transitions (start/stop walking)
  SLIM_SHOOTER = 60,         // Compact fallback
  LITE_RIFLE = 50,           // Fallback locomotion
  PISTOL = 40,               // Alternate weapon set
}

// ============================================================
// ANIMATION PACK DEFINITIONS
// ============================================================

/**
 * Each pack defines its file→animation mapping.
 * Keys are FBX filenames (without .fbx extension).
 * Values are logical game state names.
 */

export const PRO_RIFLE_PACK = {
  packName: 'Pro Rifle Pack',
  packPath: 'assets/animations/Pro Rifle Pack',
  priority: PackPriority.PRO_RIFLE,
  animations: {
    // Idle
    'idle':                          'idle',
    'idle aiming':                   'rifleIdle',
    'idle crouching':                'crouchIdle',
    'idle crouching aiming':         'rifleCrouchIdle',

    // Walk (8-way)
    'walk forward':                  'walkForward',
    'walk backward':                 'walkBackward',
    'walk left':                     'walkLeft',
    'walk right':                    'walkRight',
    'walk forward left':             'walkForwardLeft',
    'walk forward right':            'walkForwardRight',
    'walk backward left':            'walkBackwardLeft',
    'walk backward right':           'walkBackwardRight',

    // Run (8-way)
    'run forward':                   'runForward',
    'run backward':                  'runBackward',
    'run left':                      'runLeft',
    'run right':                     'runRight',
    'run forward left':              'runForwardLeft',
    'run forward right':             'runForwardRight',
    'run backward left':             'runBackwardLeft',
    'run backward right':            'runBackwardRight',

    // Sprint (8-way)
    'sprint forward':                'sprintForward',
    'sprint backward':               'sprintBackward',
    'sprint left':                   'sprintLeft',
    'sprint right':                  'sprintRight',
    'sprint forward left':           'sprintForwardLeft',
    'sprint forward right':          'sprintForwardRight',
    'sprint backward left':          'sprintBackwardLeft',
    'sprint backward right':         'sprintBackwardRight',

    // Crouch Walk (8-way)
    'walk crouching forward':        'crouchWalkForward',
    'walk crouching backward':       'crouchWalkBackward',
    'walk crouching left':           'crouchWalkLeft',
    'walk crouching right':          'crouchWalkRight',
    'walk crouching forward left':   'crouchWalkForwardLeft',
    'walk crouching forward right':  'crouchWalkForwardRight',
    'walk crouching backward left':  'crouchWalkBackwardLeft',
    'walk crouching backward right': 'crouchWalkBackwardRight',

    // Turns
    'turn 90 left':                  'turnLeft',
    'turn 90 right':                 'turnRight',
    'crouching turn 90 left':        'crouchTurnLeft',
    'crouching turn 90 right':       'crouchTurnRight',

    // Jump
    'jump up':                       'jumpUp',
    'jump loop':                     'jumpLoop',
    'jump down':                     'jumpDown',

    // Death (multiple directions)
    'death from front headshot':     'deathFrontHeadshot',
    'death from front':              'deathFront',
    'death from right':              'deathRight',
    'death from the back':           'deathBack',
    'death from back headshot':      'deathBackHeadshot',
    'death crouching headshot front':'deathCrouchFront',
  } as Record<string, string>,
};

export const RIFLE_8WAY_PACK = {
  packName: 'Rifle 8-Way Locomotion Pack',
  packPath: 'assets/animations/Rifle 8-Way Locomotion Pack',
  priority: PackPriority.RIFLE_8WAY,
  animations: {
    'idle':                          'idle',
    'idle aiming':                   'rifleIdle',
    'idle crouching':                'crouchIdle',
    'idle crouching aiming':         'rifleCrouchIdle',

    'walk forward':                  'walkForward',
    'walk backward':                 'walkBackward',
    'walk left':                     'walkLeft',
    'walk right':                    'walkRight',
    'walk forward left':             'walkForwardLeft',
    'walk forward right':            'walkForwardRight',
    'walk backward left':            'walkBackwardLeft',
    'walk backward right':           'walkBackwardRight',

    'run forward':                   'runForward',
    'run backward':                  'runBackward',
    'run left':                      'runLeft',
    'run right':                     'runRight',
    'run forward left':              'runForwardLeft',
    'run forward right':             'runForwardRight',
    'run backward left':             'runBackwardLeft',
    'run backward right':            'runBackwardRight',

    'sprint forward':                'sprintForward',
    'sprint backward':               'sprintBackward',
    'sprint left':                   'sprintLeft',
    'sprint right':                  'sprintRight',
    'sprint forward left':           'sprintForwardLeft',
    'sprint forward right':          'sprintForwardRight',
    'sprint backward left':          'sprintBackwardLeft',
    'sprint backward right':         'sprintBackwardRight',

    'walk crouching forward':        'crouchWalkForward',
    'walk crouching backward':       'crouchWalkBackward',
    'walk crouching left':           'crouchWalkLeft',
    'walk crouching right':          'crouchWalkRight',
    'walk crouching forward left':   'crouchWalkForwardLeft',
    'walk crouching forward right':  'crouchWalkForwardRight',
    'walk crouching backward left':  'crouchWalkBackwardLeft',
    'walk crouching backward right': 'crouchWalkBackwardRight',

    'turn 90 left':                  'turnLeft',
    'turn 90 right':                 'turnRight',
    'crouching turn 90 left':        'crouchTurnLeft',
    'crouching turn 90 right':       'crouchTurnRight',

    'jump up':                       'jumpUp',
    'jump loop':                     'jumpLoop',
    'jump down':                     'jumpDown',

    'death from front headshot':     'deathFrontHeadshot',
    'death from front':              'deathFront',
    'death from right':              'deathRight',
    'death from the back':           'deathBack',
    'death from back headshot':      'deathBackHeadshot',
    'death crouching headshot front':'deathCrouchFront',
  } as Record<string, string>,
};

export const BASIC_SHOOTER_PACK = {
  packName: 'Basic Shooter Pack',
  packPath: 'assets/animations/Basic Shooter Pack',
  priority: PackPriority.BASIC_SHOOTER,
  animations: {
    'Ch15_nonPBR':                   '_skip_reference_model',
    'rifle aiming idle':             'rifleIdle',
    'firing rifle':                  'rifleShoot',
    'reloading':                     'rifleReload',
    'hit reaction':                  'hitReaction',
    'rifle run':                     'rifleRun',
    'rifle jump':                    'rifleJump',
    'walking':                       'walk',
    'walking backwards':             'walkBackward',
    'run backwards':                 'runBackward',
    'strafe':                        'strafeForward',
    'strafe (2)':                    'strafeForward2',
    'strafe left':                   'strafeLeft',
    'strafe right':                  'strafeRight',
    'turn left':                     'turnLeft',
    'turning right 45 degrees':      'turnRight',
    'toss grenade':                  'grenade',
  } as Record<string, string>,
};

export const SHOOTER_PACK = {
  packName: 'Shooter Pack',
  packPath: 'assets/animations/Shooter Pack',
  priority: PackPriority.SHOOTER,
  animations: {
    'Ch15_nonPBR':                   '_skip_reference_model',
    'rifle aiming idle':             'rifleIdle',
    'firing rifle':                  'rifleShoot',
    'rifle run':                     'rifleRun',
    'walking':                       'walk',
    'walking backwards':             'walkBackward',
    'run backwards':                 'runBackward',
    'strafe':                        'strafeForward',
    'strafe (2)':                    'strafeForward2',
    'start walking':                 'walkStart',
    'stop walking':                  'walkStop',
    'start walking backwards':       'walkBackwardStart',
    'walk backwards stop':           'walkBackwardStop',
    'jump forward':                  'jumpForward',
    'jump backward':                 'jumpBackward',
    'walking to dying':              'deathTransition',
  } as Record<string, string>,
};

export const SLIM_SHOOTER_PACK = {
  packName: 'Slim Shooter Pack',
  packPath: 'assets/animations/Slim Shooter Pack',
  priority: PackPriority.SLIM_SHOOTER,
  animations: {
    'Ch15_nonPBR':                   '_skip_reference_model',
    'rifle aiming idle':             'rifleIdle',
    'firing rifle':                  'rifleShoot',
    'reloading':                     'rifleReload',
    'rifle run':                     'rifleRun',
    'walking':                       'walk',
    'strafe':                        'strafeForward',
    'strafe (2)':                    'strafeForward2',
  } as Record<string, string>,
};

export const LITE_RIFLE_PACK = {
  packName: 'Lite Rifle Pack',
  packPath: 'assets/animations/Lite Rifle Pack',
  priority: PackPriority.LITE_RIFLE,
  animations: {
    'Ch15_nonPBR':                   '_skip_reference_model',
    'idle':                          'idle',
    'idle aiming':                   'rifleIdle',
    'idle crouching':                'crouchIdle',
    'run forward':                   'runForward',
    'run backward':                  'runBackward',
    'run left':                      'runLeft',
    'run right':                     'runRight',
    'run forward left':              'runForwardLeft',
    'run forward right':             'runForwardRight',
    'run backward left':             'runBackwardLeft',
    'run backward right':            'runBackwardRight',
    'turn 90 left':                  'turnLeft',
    'turn 90 right':                 'turnRight',
    'death from front headshot':     'deathFrontHeadshot',
  } as Record<string, string>,
};

export const PISTOL_PACK = {
  packName: 'PistolHandgun Locomotion Pack',
  packPath: 'assets/animations/PistolHandgun Locomotion Pack',
  priority: PackPriority.PISTOL,
  animations: {
    'Ch15_nonPBR':                   '_skip_reference_model',
    'pistol idle':                   'pistolIdle',
    'pistol walk':                   'pistolWalk',
    'pistol walk backward':          'pistolWalkBackward',
    'pistol run':                    'pistolRun',
    'pistol run backward':           'pistolRunBackward',
    'pistol strafe':                 'pistolStrafe',
    'pistol strafe (2)':             'pistolStrafe2',
    'pistol walk arc':               'pistolWalkArc',
    'pistol walk arc (2)':           'pistolWalkArc2',
    'pistol run arc':                'pistolRunArc',
    'pistol run arc (2)':            'pistolRunArc2',
    'pistol run backward arc':       'pistolRunBackwardArc',
    'pistol run backward arc (2)':   'pistolRunBackwardArc2',
    'pistol walk backward arc':      'pistolWalkBackwardArc',
    'pistol walk backward arc (2)':  'pistolWalkBackwardArc2',
    'pistol jump':                   'pistolJump',
    'pistol jump (2)':               'pistolJump2',
    'pistol stand to kneel':         'pistolStandToKneel',
    'pistol kneeling idle':          'pistolKneelIdle',
    'pistol kneel to stand':         'pistolKneelToStand',
  } as Record<string, string>,
};

// ============================================================
// ALL PACKS ARRAY
// ============================================================

/** All animation packs in priority order (highest first) */
export const ALL_PACKS = [
  PRO_RIFLE_PACK,
  RIFLE_8WAY_PACK,
  BASIC_SHOOTER_PACK,
  SHOOTER_PACK,
  SLIM_SHOOTER_PACK,
  LITE_RIFLE_PACK,
  PISTOL_PACK,
];

// ============================================================
// BEST ANIMATION SELECTION
// ============================================================

/**
 * Resolved animation entry: the best animation for a given game state.
 */
export interface ResolvedAnimation {
  /** Logical game state name */
  stateName: string;
  /** FBX filename (without extension) */
  fbxFile: string;
  /** FBX filename with extension */
  fbxFileWithExt: string;
  /** Pack directory path */
  packPath: string;
  /** Pack name (for debugging) */
  packName: string;
  /** Pack priority (higher = better) */
  packPriority: number;
  /** Original Mixamo animation name (inside the FBX) */
  mixamoName: string;
}

/**
 * Master resolution map: game state name → best ResolvedAnimation.
 * Built by scanning all packs in priority order.
 */
const RESOLUTION_CACHE = new Map<string, ResolvedAnimation>();

/**
 * Build the resolution cache by scanning all packs.
 * Higher-priority packs overwrite lower-priority entries.
 */
function buildResolutionCache(): void {
  RESOLUTION_CACHE.clear();

  // Sort packs by priority (highest first)
  const sortedPacks = [...ALL_PACKS].sort(
    (a, b) => b.priority - a.priority
  );

  // Scan all packs — first (highest priority) match for each state wins
  for (const pack of sortedPacks) {
    for (const [fbxFilename, stateName] of Object.entries(pack.animations)) {
      // Skip reference models and internal entries
      if (stateName === '_skip_reference_model') continue;

      // Don't overwrite a higher-priority entry
      if (RESOLUTION_CACHE.has(stateName)) continue;

      RESOLUTION_CACHE.set(stateName, {
        stateName,
        fbxFile: fbxFilename,
        fbxFileWithExt: `${fbxFilename}.fbx`,
        packPath: pack.packPath,
        packName: pack.packName,
        packPriority: pack.priority,
        mixamoName: stateName, // Will be resolved by the loader
      });
    }
  }
}

// Build on module load
buildResolutionCache();

/**
 * Get the best animation for a game state.
 * Returns the highest-priority pack's version of this animation.
 *
 * @param stateName - Logical game state name (e.g., 'idle', 'rifleShoot')
 * @returns Resolved animation entry, or undefined if not found
 */
export function getBestAnimation(stateName: string): ResolvedAnimation | undefined {
  return RESOLUTION_CACHE.get(stateName);
}

/**
 * Get ALL available animations for a game state (all packs that have it).
 * Useful for fallback chains or quality selection.
 *
 * @param stateName - Logical game state name
 * @returns Array of resolved animations, sorted by priority (highest first)
 */
export function getAllAnimationsFor(stateName: string): ResolvedAnimation[] {
  const results: ResolvedAnimation[] = [];

  for (const pack of ALL_PACKS) {
    for (const [fbxFilename, mappedState] of Object.entries(pack.animations)) {
      if (mappedState === stateName) {
        results.push({
          stateName,
          fbxFile: fbxFilename,
          fbxFileWithExt: `${fbxFilename}.fbx`,
          packPath: pack.packPath,
          packName: pack.packName,
          packPriority: pack.priority,
          mixamoName: stateName,
        });
      }
    }
  }

  // Sort by priority (highest first)
  results.sort((a, b) => b.packPriority - a.packPriority);
  return results;
}

// ============================================================
// ANIMATION STATE → PACK MAPPING (for loading)
// ============================================================

/**
 * Complete mapping of game states to their best FBX source files.
 * Used by the loading pipeline to know exactly which FBX to load
 * for each animation state.
 *
 * This is the "final answer" that the rest of the system uses.
 */
export interface AnimationStateMapping {
  /** Logical state name */
  state: string;
  /** FBX file path (relative to pack directory) */
  fbxPath: string;
  /** Full URL (resolved at load time) */
  fullPath?: string;
  /** Loop mode */
  loop: THREE.AnimationActionLoopStyles;
  /** Time scale multiplier */
  timeScale: number;
  /** Clamp when finished (for one-shots) */
  clampWhenFinished: boolean;
  /** Blend weight for layered animation */
  weight: number;
  /** Whether this is an additive animation */
  additive: boolean;
  /** Bones this animation affects (empty = all bones) */
  affectedBones: string[];
  /** Source pack name */
  sourcePack: string;
}

/**
 * Build the complete state mapping by resolving each game state
 * to its best animation source.
 */
export function buildStateMapping(): AnimationStateMapping[] {
  const states: AnimationStateMapping[] = [];

  // ── Idle States ──
  const addState = (
    state: string,
    fbxFile: string,
    packPath: string,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
    timeScale: number = 1.0,
    clampWhenFinished: boolean = false,
    weight: number = 1.0,
    additive: boolean = false,
    affectedBones: string[] = []
  ) => {
    const resolved = getBestAnimation(state);
    states.push({
      state,
      fbxPath: `${fbxFile}.fbx`,
      loop,
      timeScale,
      clampWhenFinished,
      weight,
      additive,
      affectedBones,
      sourcePack: resolved?.packName ?? 'Unknown',
    });
  };

  // ── Standing Idle ──
  addState('idle', 'idle', 'assets/animations/Pro Rifle Pack');

  // ── Walk (forward = default) ──
  addState('walk', 'walk forward', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 1.0);

  // ── Run (forward = default) ──
  addState('run', 'run forward', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 1.0);

  // ── Sprint (forward = default) ──
  addState('sprint', 'sprint forward', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 1.0);

  // ── Walk directional variants ──
  addState('walkForward', 'walk forward', 'assets/animations/Pro Rifle Pack');
  addState('walkBackward', 'walk backward', 'assets/animations/Pro Rifle Pack');
  addState('walkLeft', 'walk left', 'assets/animations/Pro Rifle Pack');
  addState('walkRight', 'walk right', 'assets/animations/Pro Rifle Pack');
  addState('walkForwardLeft', 'walk forward left', 'assets/animations/Pro Rifle Pack');
  addState('walkForwardRight', 'walk forward right', 'assets/animations/Pro Rifle Pack');
  addState('walkBackwardLeft', 'walk backward left', 'assets/animations/Pro Rifle Pack');
  addState('walkBackwardRight', 'walk backward right', 'assets/animations/Pro Rifle Pack');

  // ── Run directional variants ──
  addState('runForward', 'run forward', 'assets/animations/Pro Rifle Pack');
  addState('runBackward', 'run backward', 'assets/animations/Pro Rifle Pack');
  addState('runLeft', 'run left', 'assets/animations/Pro Rifle Pack');
  addState('runRight', 'run right', 'assets/animations/Pro Rifle Pack');
  addState('runForwardLeft', 'run forward left', 'assets/animations/Pro Rifle Pack');
  addState('runForwardRight', 'run forward right', 'assets/animations/Pro Rifle Pack');
  addState('runBackwardLeft', 'run backward left', 'assets/animations/Pro Rifle Pack');
  addState('runBackwardRight', 'run backward right', 'assets/animations/Pro Rifle Pack');

  // ── Sprint directional variants ──
  addState('sprintForward', 'sprint forward', 'assets/animations/Pro Rifle Pack');
  addState('sprintBackward', 'sprint backward', 'assets/animations/Pro Rifle Pack');
  addState('sprintLeft', 'sprint left', 'assets/animations/Pro Rifle Pack');
  addState('sprintRight', 'sprint right', 'assets/animations/Pro Rifle Pack');
  addState('sprintForwardLeft', 'sprint forward left', 'assets/animations/Pro Rifle Pack');
  addState('sprintForwardRight', 'sprint forward right', 'assets/animations/Pro Rifle Pack');
  addState('sprintBackwardLeft', 'sprint backward left', 'assets/animations/Pro Rifle Pack');
  addState('sprintBackwardRight', 'sprint backward right', 'assets/animations/Pro Rifle Pack');

  // ── Crouch States ──
  addState('crouchIdle', 'idle crouching', 'assets/animations/Pro Rifle Pack');
  addState('crouchWalkForward', 'walk crouching forward', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 0.85);
  addState('crouchWalkBackward', 'walk crouching backward', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 0.85);
  addState('crouchWalkLeft', 'walk crouching left', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 0.85);
  addState('crouchWalkRight', 'walk crouching right', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 0.85);
  addState('crouchWalkForwardLeft', 'walk crouching forward left', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 0.85);
  addState('crouchWalkForwardRight', 'walk crouching forward right', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 0.85);
  addState('crouchWalkBackwardLeft', 'walk crouching backward left', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 0.85);
  addState('crouchWalkBackwardRight', 'walk crouching backward right', 'assets/animations/Pro Rifle Pack', THREE.LoopRepeat, 0.85);

  // ── Rifle Idle (ADS) ──
  addState('rifleIdle', 'idle aiming', 'assets/animations/Pro Rifle Pack');

  // ── Rifle Crouch Idle (ADS crouched) ──
  addState('rifleCrouchIdle', 'idle crouching aiming', 'assets/animations/Pro Rifle Pack');

  // ── Combat Actions ──
  addState('rifleShoot', 'firing rifle', 'assets/animations/Basic Shooter Pack',
    THREE.LoopOnce, 1.0, true, 1.0, true, ['Spine1', 'Spine2', 'Neck', 'Head',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']);

  addState('rifleReload', 'reloading', 'assets/animations/Basic Shooter Pack',
    THREE.LoopOnce, 1.0, true);

  addState('hitReaction', 'hit reaction', 'assets/animations/Basic Shooter Pack',
    THREE.LoopOnce, 1.0, true, 1.0, true);

  addState('grenade', 'toss grenade', 'assets/animations/Basic Shooter Pack',
    THREE.LoopOnce, 1.0, true);

  // ── Turn Transitions ──
  addState('turnLeft', 'turn 90 left', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('turnRight', 'turn 90 right', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('crouchTurnLeft', 'crouching turn 90 left', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('crouchTurnRight', 'crouching turn 90 right', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);

  // ── Walk Start/Stop Transitions ──
  addState('walkStart', 'start walking', 'assets/animations/Shooter Pack',
    THREE.LoopOnce, 1.0, true);
  addState('walkStop', 'stop walking', 'assets/animations/Shooter Pack',
    THREE.LoopOnce, 1.0, true);
  addState('walkBackwardStart', 'start walking backwards', 'assets/animations/Shooter Pack',
    THREE.LoopOnce, 1.0, true);
  addState('walkBackwardStop', 'walk backwards stop', 'assets/animations/Shooter Pack',
    THREE.LoopOnce, 1.0, true);

  // ── Jump ──
  addState('jumpUp', 'jump up', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('jumpLoop', 'jump loop', 'assets/animations/Pro Rifle Pack',
    THREE.LoopRepeat);
  addState('jumpDown', 'jump down', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);

  // ── Death Variants ──
  addState('death', 'death from front', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('deathFrontHeadshot', 'death from front headshot', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('deathRight', 'death from right', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('deathBack', 'death from the back', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('deathBackHeadshot', 'death from back headshot', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);
  addState('deathCrouchFront', 'death crouching headshot front', 'assets/animations/Pro Rifle Pack',
    THREE.LoopOnce, 1.0, true);

  return states;
}

// ============================================================
// DIRECTIONAL BLEND HELPERS
// ============================================================

/**
 * Directional animation set for blend tree interpolation.
 * Maps a movement direction (angle in degrees) to the best
 * matching directional animation.
 */
export interface DirectionalAnimSet {
  /** Forward (0°) */
  forward: string;
  /** Forward-right (45°) */
  forwardRight: string;
  /** Right (90°) */
  right: string;
  /** Backward-right (135°) */
  backwardRight: string;
  /** Backward (180°) */
  backward: string;
  /** Backward-left (225°) */
  backwardLeft: string;
  /** Left (270°) */
  left: string;
  /** Forward-left (315°) */
  forwardLeft: string;
}

/**
 * Pre-built directional sets for each movement speed.
 */
export const WALK_DIRECTIONS: DirectionalAnimSet = {
  forward:      'walkForward',
  forwardRight: 'walkForwardRight',
  right:        'walkRight',
  backwardRight:'walkBackwardRight',
  backward:     'walkBackward',
  backwardLeft: 'walkBackwardLeft',
  left:         'walkLeft',
  forwardLeft:  'walkForwardLeft',
};

export const RUN_DIRECTIONS: DirectionalAnimSet = {
  forward:      'runForward',
  forwardRight: 'runForwardRight',
  right:        'runRight',
  backwardRight:'runBackwardRight',
  backward:     'runBackward',
  backwardLeft: 'runBackwardLeft',
  left:         'runLeft',
  forwardLeft:  'runForwardLeft',
};

export const SPRINT_DIRECTIONS: DirectionalAnimSet = {
  forward:      'sprintForward',
  forwardRight: 'sprintForwardRight',
  right:        'sprintRight',
  backwardRight:'sprintBackwardRight',
  backward:     'sprintBackward',
  backwardLeft: 'sprintBackwardLeft',
  left:         'sprintLeft',
  forwardLeft:  'sprintForwardLeft',
};

export const CROUCH_DIRECTIONS: DirectionalAnimSet = {
  forward:      'crouchWalkForward',
  forwardRight: 'crouchWalkForwardRight',
  right:        'crouchWalkRight',
  backwardRight:'crouchWalkBackwardRight',
  backward:     'crouchWalkBackward',
  backwardLeft: 'crouchWalkBackwardLeft',
  left:         'crouchWalkLeft',
  forwardLeft:  'crouchWalkForwardLeft',
};

/**
 * Get the two closest directional animations for blend interpolation.
 *
 * @param angle - Movement angle in radians (0 = forward, PI/2 = right)
 * @param directions - The directional animation set to use
 * @returns Two animations and their blend weight [anim1, anim2, weight]
 */
export function getDirectionalBlend(
  angle: number,
  directions: DirectionalAnimSet
): [string, string, number] {
  // Normalize angle to [0, 2π)
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // Convert to degrees for easier matching
  const degrees = (normalized * 180) / Math.PI;

  // Define direction breakpoints
  const dirs: Array<{ name: string; angle: number }> = [
    { name: 'forward',       angle: 0 },
    { name: 'forwardRight',  angle: 45 },
    { name: 'right',         angle: 90 },
    { name: 'backwardRight', angle: 135 },
    { name: 'backward',      angle: 180 },
    { name: 'backwardLeft',  angle: 225 },
    { name: 'left',          angle: 270 },
    { name: 'forwardLeft',   angle: 315 },
  ];

  // Find the two closest directions
  let best1 = dirs[0];
  let best2 = dirs[1];
  let minDist = 999;

  for (let i = 0; i < dirs.length; i++) {
    const next = dirs[(i + 1) % dirs.length];
    const dist = Math.abs(degrees - dirs[i].angle);
    const wrapDist = Math.abs(degrees - dirs[i].angle + 360);
    const actualDist = Math.min(dist, wrapDist);

    if (actualDist < minDist) {
      minDist = actualDist;
      best1 = dirs[i];
      best2 = dirs[(i + 1) % dirs.length];
    }
  }

  // Calculate blend weight (0 = fully best1, 1 = fully best2)
  const range = Math.abs(best2.angle - best1.angle) || 360;
  let t = (degrees - best1.angle) / range;
  if (t < 0) t += 1;
  t = Math.max(0, Math.min(1, t));

  const anim1 = (directions as any)[best1.name] as string;
  const anim2 = (directions as any)[best2.name] as string;

  return [anim1, anim2, t];
}
