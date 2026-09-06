/**
 * modelConfig.ts
 * Model configuration for Call of Deity: Protocol 313
 *
 * Centralizes all character model definitions:
 *   - Model file paths and loading parameters
 *   - Mixamo skeleton bone names (standard hierarchy)
 *   - Character scale and eye height (for LOS / camera)
 *   - Material override templates for runtime re-skinning
 *   - Per-character-type configuration (hero vs enemy)
 *
 * All models are expected as GLB files downloaded from Mixamo.
 * Animations live alongside the model in the same directory.
 *
 * Usage:
 *   import { MODEL_CONFIGS, getSkeletonBones } from '../config/modelConfig';
 *   const config = MODEL_CONFIGS['gas-mask'];
 *   const { model, animations } = await loader.loadCharacter(
 *     config.name, config.modelPath, config.modelFile, config.animations
 *   );
 */

import * as THREE from 'three';
import { AnimationDefinition } from '../utils/MixamoLoader';

// ============================================================
// MIXAMO SKELETON DEFINITION
// ============================================================

/**
 * Standard Mixamo skeleton bone hierarchy.
 *
 * These names match exactly what Mixamo exports in GLB files.
 * The loader strips any "mixamorig:" prefix automatically.
 *
 * Bone order follows the standard humanoid rig:
 *   Root → Hips → Spine → … → Head
 *                          → LeftArm → … → LeftHand
 *                          → RightArm → … → RightHand
 *              → LeftUpLeg → … → LeftToeBase
 *              → RightUpLeg → … → RightToeBase
 *
 * Use getSkeletonBones() for the full ordered list,
 * or SKELETON_GROUPS for logical bone groupings.
 */

/** Full ordered bone list — matches Mixamo export order */
export const MIXAMO_BONES: readonly string[] = [
  // ── Root ──
  'Hips',

  // ── Spine Chain ──
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',

  // ── Left Arm Chain ──
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',

  // ── Right Arm Chain ──
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',

  // ── Left Leg Chain ──
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',

  // ── Right Leg Chain ──
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',

  // ── Fingers (if present on model) ──
  // Left hand
  'LeftHandThumb1',
  'LeftHandThumb2',
  'LeftHandThumb3',
  'LeftHandIndex1',
  'LeftHandIndex2',
  'LeftHandIndex3',
  'LeftHandMiddle1',
  'LeftHandMiddle2',
  'LeftHandMiddle3',
  'LeftHandRing1',
  'LeftHandRing2',
  'LeftHandRing3',
  'LeftHandPinky1',
  'LeftHandPinky2',
  'LeftHandPinky3',

  // Right hand
  'RightHandThumb1',
  'RightHandThumb2',
  'RightHandThumb3',
  'RightHandIndex1',
  'RightHandIndex2',
  'RightHandIndex3',
  'RightHandMiddle1',
  'RightHandMiddle2',
  'RightHandMiddle3',
  'RightHandRing1',
  'RightHandRing2',
  'RightHandRing3',
  'RightHandPinky1',
  'RightHandPinky2',
  'RightHandPinky3',
] as const;

/**
 * Logical bone groupings for blend trees and animation layering.
 * Used by the animation state machine to apply partial-body blends.
 */
export const SKELETON_GROUPS = {
  /** Full spine chain — torso rotation, breathing */
  SPINE: ['Spine', 'Spine1', 'Spine2'] as const,

  /** Head and neck — look direction, nod */
  HEAD: ['Neck', 'Head'] as const,

  /** Left arm — weapon hold, gestures */
  LEFT_ARM: ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'] as const,

  /** Right arm — trigger hand, gestures */
  RIGHT_ARM: ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'] as const,

  /** Both arms together — two-handed weapon poses */
  ARMS: [
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  ] as const,

  /** Left leg — stride, kick */
  LEFT_LEG: ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'] as const,

  /** Right leg — stride, kick */
  RIGHT_LEG: ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'] as const,

  /** Both legs — locomotion base */
  LEGS: [
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
    'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  ] as const,

  /** Upper body — weapon, gestures, head look */
  UPPER: [
    'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  ] as const,

  /** Lower body — locomotion */
  LOWER: [
    'Hips',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
    'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  ] as const,

  /** Left fingers only */
  LEFT_FINGERS: [
    'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
    'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3',
    'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
    'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3',
    'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
  ] as const,

  /** Right fingers only */
  RIGHT_FINGERS: [
    'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
    'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
    'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
    'RightHandRing1', 'RightHandRing2', 'RightHandRing3',
    'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
  ] as const,
} as const;

/**
 * Get the full ordered bone name list.
 * Returns a copy so callers can safely modify it.
 */
export function getSkeletonBones(): string[] {
  return [...MIXAMO_BONES];
}

/**
 * Get bone names for a specific group.
 * Returns a copy of the array.
 */
export function getBoneGroup(group: keyof typeof SKELETON_GROUPS): string[] {
  return [...SKELETON_GROUPS[group]];
}

// ============================================================
// CHARACTER TYPES
// ============================================================

/**
 * High-level character category.
 * Used for grouping, AI behavior, and material defaults.
 */
export enum CharacterType {
  /** Player-controlled hero characters */
  HERO = 'hero',
  /** AI-controlled enemy combatants */
  ENEMY = 'enemy',
  /** NPC civilians / friendly forces */
  NPC = 'npc',
  /** Environmental / prop characters (ragdolls, etc.) */
  PROP = 'prop',
}

// ============================================================
// MATERIAL OVERRIDE TEMPLATES
// ============================================================

/**
 * Material override definition.
 * When applied, replaces the default PBR material on matching meshes.
 * Mesh matching is done by name substring (case-insensitive).
 */
export interface MaterialOverride {
  /** Substring to match against mesh names (e.g., 'body', 'armor', 'helmet') */
  meshNamePattern: string | RegExp;
  /** PBR properties to apply */
  properties: {
    color?: THREE.Color;
    roughness?: number;
    metalness?: number;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
    side?: THREE.Side;
    map?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    metalnessMap?: THREE.Texture;
    emissiveMap?: THREE.Texture;
  };
}

/**
 * Predefined material override sets for quick re-skinning.
 * Each set contains overrides for all relevant mesh parts.
 */
export const MATERIAL_PRESETS = {
  // ── Gas Mask (Hero) Defaults ──
  GAS_MASK: {
    /** Dark tactical suit base */
    SUIT: {
      meshNamePattern: /body|suit|uniform|pants|shirt/i,
      properties: {
        color: new THREE.Color(0x1a1a2e),
        roughness: 0.8,
        metalness: 0.05,
      },
    },
    /** Gas mask canister and frame */
    MASK: {
      meshNamePattern: /mask|head|helmet|gas/i,
      properties: {
        color: new THREE.Color(0x2d2d2d),
        roughness: 0.4,
        metalness: 0.6,
      },
    },
    /** Tactical vest / plate carrier */
    VEST: {
      meshNamePattern: /vest|armor|plate|carrier/i,
      properties: {
        color: new THREE.Color(0x3a3a3a),
        roughness: 0.6,
        metalness: 0.3,
      },
    },
    /** Boots */
    BOOTS: {
      meshNamePattern: /boot|shoe|foot/i,
      properties: {
        color: new THREE.Color(0x1a1a1a),
        roughness: 0.9,
        metalness: 0.0,
      },
    },
    /** Gas mask lenses — glow effect */
    LENSES: {
      meshNamePattern: /lens|glass|eye|visor/i,
      properties: {
        color: new THREE.Color(0x00ff88),
        roughness: 0.1,
        metalness: 0.8,
        emissive: new THREE.Color(0x00ff88),
        emissiveIntensity: 0.4,
      },
    },
  },

  // ── SWAT Guy (Enemy) Defaults ──
  SWAT: {
    /** Dark police uniform */
    UNIFORM: {
      meshNamePattern: /body|uniform|suit|pants|shirt/i,
      properties: {
        color: new THREE.Color(0x0d1b2a),
        roughness: 0.75,
        metalness: 0.05,
      },
    },
    /** SWAT helmet */
    HELMET: {
      meshNamePattern: /helmet|head|mask|visor/i,
      properties: {
        color: new THREE.Color(0x1b1b1b),
        roughness: 0.3,
        metalness: 0.5,
      },
    },
    /** Tactical vest */
    VEST: {
      meshNamePattern: /vest|armor|plate|carrier/i,
      properties: {
        color: new THREE.Color(0x252525),
        roughness: 0.5,
        metalness: 0.4,
      },
    },
    /** Boots */
    BOOTS: {
      meshNamePattern: /boot|shoe|foot/i,
      properties: {
        color: new THREE.Color(0x111111),
        roughness: 0.85,
        metalness: 0.0,
      },
    },
    /** Visor / face shield — red tint for enemy indication */
    VISOR: {
      meshNamePattern: /visor|glass|eye|lens|face/i,
      properties: {
        color: new THREE.Color(0x1a1a1a),
        roughness: 0.1,
        metalness: 0.7,
        emissive: new THREE.Color(0xff2200),
        emissiveIntensity: 0.3,
      },
    },
  },

  // ── Damage / Hit Flash ──
  DAMAGE_FLASH: {
    meshNamePattern: /.*/,
    properties: {
      emissive: new THREE.Color(0xff0000),
      emissiveIntensity: 0.8,
    },
  },

  // ── Selection Highlight ──
  HIGHLIGHT: {
    meshNamePattern: /.*/,
    properties: {
      emissive: new THREE.Color(0x00aaff),
      emissiveIntensity: 0.5,
    },
  },

  // ── Stealth / Cloak (semi-transparent) ──
  STEALTH: {
    meshNamePattern: /.*/,
    properties: {
      opacity: 0.3,
      transparent: true,
      side: THREE.DoubleSide,
    },
  },
} as const;

/**
 * Apply material overrides to a loaded model.
 *
 * Traverses the model's mesh hierarchy and applies matching overrides.
 * Mesh name matching is case-insensitive substring search.
 *
 * @param model - The loaded THREE.Group to modify
 * @param overrides - Array of material overrides to apply
 * @returns Number of meshes modified
 */
export function applyMaterialOverrides(
  model: THREE.Group,
  overrides: MaterialOverride[]
): number {
  let modifiedCount = 0;

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const meshName = child.name.toLowerCase();

    for (const override of overrides) {
      const pattern = override.meshNamePattern;
      const matches =
        pattern instanceof RegExp
          ? pattern.test(child.name)
          : meshName.includes(pattern.toLowerCase());

      if (matches) {
        const mat = child.material as THREE.MeshStandardMaterial;

        if (!(mat instanceof THREE.MeshStandardMaterial)) {
          // Convert to standard material first
          const std = new THREE.MeshStandardMaterial();
          if (mat && 'color' in mat) std.color = (mat as any).color.clone();
          child.material = std;
        }

        const target = child.material as THREE.MeshStandardMaterial;
        const props = override.properties;

        if (props.color !== undefined) target.color = props.color.clone();
        if (props.roughness !== undefined) target.roughness = props.roughness;
        if (props.metalness !== undefined) target.metalness = props.metalness;
        if (props.emissive !== undefined) target.emissive = props.emissive.clone();
        if (props.emissiveIntensity !== undefined) target.emissiveIntensity = props.emissiveIntensity;
        if (props.opacity !== undefined) target.opacity = props.opacity;
        if (props.transparent !== undefined) target.transparent = props.transparent;
        if (props.side !== undefined) target.side = props.side;
        if (props.map !== undefined) target.map = props.map;
        if (props.normalMap !== undefined) target.normalMap = props.normalMap;
        if (props.roughnessMap !== undefined) target.roughnessMap = props.roughnessMap;
        if (props.metalnessMap !== undefined) target.metalnessMap = props.metalnessMap;
        if (props.emissiveMap !== undefined) target.emissiveMap = props.emissiveMap;

        target.needsUpdate = true;
        modifiedCount++;
        break; // First matching override wins per mesh
      }
    }
  });

  return modifiedCount;
}

/**
 * Reset all materials on a model to their original PBR defaults.
 * Useful for clearing damage flashes or temporary material effects.
 */
export function resetMaterials(model: THREE.Group): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const mat = child.material as THREE.MeshStandardMaterial;
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
      mat.opacity = 1;
      mat.transparent = false;
      mat.side = THREE.FrontSide;
      mat.needsUpdate = true;
    }
  });
}

// ============================================================
// CHARACTER MODEL CONFIGURATION
// ============================================================

/**
 * Complete configuration for a character model.
 * Used by the loading pipeline and runtime systems.
 */
export interface CharacterModelConfig {
  /** Unique identifier (matches directory name) */
  name: string;

  /** Character type (hero, enemy, npc, prop) */
  type: CharacterType;

  /** Display name for UI */
  displayName: string;

  // ── Paths ──

  /** Base directory containing model and animation files.
   *  Relative to public/ root (e.g., 'assets/models/gas-mask') */
  modelPath: string;

  /** Model filename within modelPath (e.g., 'model.glb') */
  modelFile: string;

  // ── Scale & Dimensions ──

  /**
   * Scale factor applied to the loaded model.
   *
   * Mixamo exports in centimeters; Three.js uses meters.
   * The loader applies 0.01 by default (cm → m).
   *
   * Set to 1.0 if the model was already exported at correct scale,
   * or adjust per-character to match desired world height.
   *
   * Example: A 180cm Mixamo model at scale 0.01 = 1.8m world height.
   *          At scale 1.0, the model is treated as already in meters.
   */
  scale: number;

  /**
   * Eye height in world units (meters).
   * Used for:
   *   - Camera positioning (first-person view)
   *   - Line-of-sight calculations
   *   - Head position offset
   */
  eyeHeight: number;

  /**
   * Total character height in world units (meters).
   * Used for:
   *   - Collision capsule sizing
   *   - Cover system height checks
   *   - Prone/crouch height transitions
   */
  characterHeight: number;

  // ── Skeleton ──

  /** Expected bone names in this model's skeleton.
   *  Must match Mixamo export exactly. */
  skeletonBones: readonly string[];

  /** Bone groups for blend layering */
  boneGroups: typeof SKELETON_GROUPS;

  // ── Materials ──

  /** Default material overrides applied on load */
  defaultMaterials: MaterialOverride[];

  // ── Animations ──

  /** Animation definitions for this character.
   *  Each entry maps a logical state to a GLB file. */
  animations: AnimationDefinition[];

  /** Use procedural fallback for missing animations? */
  useProceduralFallback: boolean;

  // ── Shadow ──

  /** Cast shadows from character meshes */
  castShadow: boolean;

  /** Receive shadows on character meshes */
  receiveShadow: boolean;

  // ── Physics ──

  /** Collision capsule radius (meters) */
  capsuleRadius: number;

  /** Collision capsule half-height (meters, standing) */
  capsuleHalfHeight: number;

  /** Collision capsule half-height when crouching */
  crouchCapsuleHalfHeight: number;

  /** Collision capsule half-height when prone */
  proneCapsuleHalfHeight: number;
}

// ============================================================
// GAS MASK — HERO CHARACTERS (Wolf & Falcon)
// ============================================================

/**
 * Gas Mask model configuration.
 * Used for Wolf and Falcon hero characters.
 *
 * Model source: Mixamo "Gas Mask" character
 *   https://www.mixamo.com/#/search?type=Character&query=gas%20mask
 *
 * Download instructions:
 *   1. Go to Mixamo → Characters → search "Gas Mask"
 *   2. Select the gas mask soldier character
 *   3. Download as FBX with "Without Skin" for animations only
 *   4. Download with skin for the model itself
 *   5. Convert FBX to GLB using Blender or online converter
 *   6. Place in: public/assets/models/gas-mask/
 */
export const GAS_MASK_CONFIG: CharacterModelConfig = {
  name: 'gas-mask',
  type: CharacterType.HERO,
  displayName: 'Gas Mask Operative',

  // ── Paths ──
  modelPath: 'assets/models/gas-mask',
  modelFile: 'model.fbx',

  // ── Scale & Dimensions ──
  scale: 1.0,
  eyeHeight: 1.6,
  characterHeight: 1.8,

  // ── Skeleton ──
  skeletonBones: MIXAMO_BONES,
  boneGroups: SKELETON_GROUPS,

  // ── Materials ──
  defaultMaterials: [
    MATERIAL_PRESETS.GAS_MASK.SUIT,
    MATERIAL_PRESETS.GAS_MASK.MASK,
    MATERIAL_PRESETS.GAS_MASK.VEST,
    MATERIAL_PRESETS.GAS_MASK.BOOTS,
    MATERIAL_PRESETS.GAS_MASK.LENSES,
  ],

  // ── Animations (FBX from Mixamo packs) ──
  // Animations are loaded from animation pack directories,
  // not from the model directory. The file paths here are relative
  // to the animation pack directory.
  animations: [
    // Core locomotion (Pro Rifle Pack)
    { name: 'idle',        file: 'idle.fbx',              loop: THREE.LoopRepeat },
    { name: 'walk',        file: 'walk forward.fbx',      loop: THREE.LoopRepeat, timeScale: 1.0 },
    { name: 'run',         file: 'run forward.fbx',       loop: THREE.LoopRepeat, timeScale: 1.0 },
    { name: 'sprint',      file: 'sprint forward.fbx',    loop: THREE.LoopRepeat, timeScale: 1.0 },

    // Crouch (Pro Rifle Pack)
    { name: 'crouchIdle',  file: 'idle crouching.fbx',    loop: THREE.LoopRepeat },
    { name: 'crouchWalk',  file: 'walk crouching forward.fbx', loop: THREE.LoopRepeat, timeScale: 0.85 },

    // Rifle Aim (Pro Rifle Pack)
    { name: 'rifleIdle',   file: 'idle aiming.fbx',       loop: THREE.LoopRepeat },

    // Combat (Basic Shooter Pack — better quality for these)
    { name: 'rifleShoot',  file: 'firing rifle.fbx',     loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'rifleReload', file: 'reloading.fbx',         loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'hitReaction', file: 'hit reaction.fbx',      loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'grenade',     file: 'toss grenade.fbx',      loop: THREE.LoopOnce, clampWhenFinished: true },

    // Death (Pro Rifle Pack — multiple directions)
    { name: 'death',       file: 'death from front.fbx',  loop: THREE.LoopOnce, clampWhenFinished: true },

    // Walk transitions (Shooter Pack)
    { name: 'walkStart',   file: 'start walking.fbx',     loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'walkStop',    file: 'stop walking.fbx',      loop: THREE.LoopOnce, clampWhenFinished: true },

    // Turns (Pro Rifle Pack)
    { name: 'turnLeft',    file: 'turn 90 left.fbx',      loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'turnRight',   file: 'turn 90 right.fbx',     loop: THREE.LoopOnce, clampWhenFinished: true },

    // Jump (Pro Rifle Pack)
    { name: 'jumpUp',      file: 'jump up.fbx',           loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'jumpLoop',    file: 'jump loop.fbx',         loop: THREE.LoopRepeat },
    { name: 'jumpDown',    file: 'jump down.fbx',         loop: THREE.LoopOnce, clampWhenFinished: true },
  ],
  useProceduralFallback: true,

  // ── Shadow ──
  castShadow: true,
  receiveShadow: true,

  // ── Physics ──
  capsuleRadius: 0.35,
  capsuleHalfHeight: 0.9,
  crouchCapsuleHalfHeight: 0.55,
  proneCapsuleHalfHeight: 0.25,
};

// ============================================================
// SWAT GUY — ENEMY CHARACTERS
// ============================================================

/**
 * SWAT Guy model configuration.
 * Used for AI enemy combatants.
 *
 * Model source: Mixamo "SWAT" character
 *   https://www.mixamo.com/#/search?type=Character&query=swat
 *
 * Download instructions:
 *   1. Go to Mixamo → Characters → search "SWAT"
 *   2. Select the SWAT character
 *   3. Download as FBX with "Without Skin" for animations only
 *   4. Download with skin for the model itself
 *   5. Convert FBX to GLB using Blender or online converter
 *   6. Place in: public/assets/models/swat-guy/
 */
export const SWAT_GUY_CONFIG: CharacterModelConfig = {
  name: 'swat-guy',
  type: CharacterType.ENEMY,
  displayName: 'SWAT Operative',

  // ── Paths ──
  modelPath: 'assets/models/swat-guy',
  modelFile: 'model.fbx',

  // ── Scale & Dimensions ──
  scale: 1.0,
  eyeHeight: 1.6,
  characterHeight: 1.8,

  // ── Skeleton ──
  skeletonBones: MIXAMO_BONES,
  boneGroups: SKELETON_GROUPS,

  // ── Materials ──
  defaultMaterials: [
    MATERIAL_PRESETS.SWAT.UNIFORM,
    MATERIAL_PRESETS.SWAT.HELMET,
    MATERIAL_PRESETS.SWAT.VEST,
    MATERIAL_PRESETS.SWAT.BOOTS,
    MATERIAL_PRESETS.SWAT.VISOR,
  ],

  // ── Animations (FBX from Mixamo packs) ──
  // Same animation set as hero — enemies share the same rig/animations
  animations: [
    // Core locomotion (Pro Rifle Pack)
    { name: 'idle',        file: 'idle.fbx',              loop: THREE.LoopRepeat },
    { name: 'walk',        file: 'walk forward.fbx',      loop: THREE.LoopRepeat, timeScale: 1.0 },
    { name: 'run',         file: 'run forward.fbx',       loop: THREE.LoopRepeat, timeScale: 1.0 },
    { name: 'sprint',      file: 'sprint forward.fbx',    loop: THREE.LoopRepeat, timeScale: 1.0 },

    // Crouch (Pro Rifle Pack)
    { name: 'crouchIdle',  file: 'idle crouching.fbx',    loop: THREE.LoopRepeat },
    { name: 'crouchWalk',  file: 'walk crouching forward.fbx', loop: THREE.LoopRepeat, timeScale: 0.85 },

    // Rifle Aim (Pro Rifle Pack)
    { name: 'rifleIdle',   file: 'idle aiming.fbx',       loop: THREE.LoopRepeat },

    // Combat (Basic Shooter Pack)
    { name: 'rifleShoot',  file: 'firing rifle.fbx',     loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'rifleReload', file: 'reloading.fbx',         loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'hitReaction', file: 'hit reaction.fbx',      loop: THREE.LoopOnce, clampWhenFinished: true },

    // Death (Pro Rifle Pack)
    { name: 'death',       file: 'death from front.fbx',  loop: THREE.LoopOnce, clampWhenFinished: true },

    // Walk transitions (Shooter Pack)
    { name: 'walkStart',   file: 'start walking.fbx',     loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'walkStop',    file: 'stop walking.fbx',      loop: THREE.LoopOnce, clampWhenFinished: true },

    // Turns (Pro Rifle Pack)
    { name: 'turnLeft',    file: 'turn 90 left.fbx',      loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'turnRight',   file: 'turn 90 right.fbx',     loop: THREE.LoopOnce, clampWhenFinished: true },

    // Jump (Pro Rifle Pack)
    { name: 'jumpUp',      file: 'jump up.fbx',           loop: THREE.LoopOnce, clampWhenFinished: true },
    { name: 'jumpLoop',    file: 'jump loop.fbx',         loop: THREE.LoopRepeat },
    { name: 'jumpDown',    file: 'jump down.fbx',         loop: THREE.LoopOnce, clampWhenFinished: true },
  ],
  useProceduralFallback: true,

  // ── Shadow ──
  castShadow: true,
  receiveShadow: true,

  // ── Physics ──
  capsuleRadius: 0.35,
  capsuleHalfHeight: 0.9,
  crouchCapsuleHalfHeight: 0.55,
  proneCapsuleHalfHeight: 0.25,
};

// ============================================================
// MASTER CONFIG REGISTRY
// ============================================================

/**
 * All registered character model configs, keyed by name.
 * Used by the loading pipeline to resolve character types at runtime.
 */
export const MODEL_CONFIGS: Record<string, CharacterModelConfig> = {
  'gas-mask': GAS_MASK_CONFIG,
  'swat-guy': SWAT_GUY_CONFIG,
};

/**
 * Get a model config by name.
 * Returns undefined if no config exists for the given name.
 */
export function getModelConfig(name: string): CharacterModelConfig | undefined {
  return MODEL_CONFIGS[name];
}

/**
 * Get all model configs for a specific character type.
 */
export function getConfigsByType(type: CharacterType): CharacterModelConfig[] {
  return Object.values(MODEL_CONFIGS).filter((c) => c.type === type);
}

/**
 * Get all registered model names.
 */
export function getRegisteredModelNames(): string[] {
  return Object.keys(MODEL_CONFIGS);
}

// ============================================================
// RUNTIME OVERRIDE INTERFACE
// ============================================================

/**
 * Options for overriding model config at load time.
 * Used when spawning characters with non-default settings.
 */
export interface ModelLoadOverrides {
  /** Override the model path (e.g., for alternate skins) */
  modelPath?: string;

  /** Override the model file */
  modelFile?: string;

  /** Override the scale factor */
  scale?: number;

  /** Override eye height */
  eyeHeight?: number;

  /** Override default materials */
  materials?: MaterialOverride[];

  /** Override animation definitions */
  animations?: AnimationDefinition[];

  /** Force procedural animations only (skip Mixamo file loading) */
  proceduralOnly?: boolean;

  /** Override shadow settings */
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Create a merged config by applying overrides to an existing config.
 * Does not mutate the original — returns a new object.
 */
export function mergeModelConfig(
  base: CharacterModelConfig,
  overrides: ModelLoadOverrides
): CharacterModelConfig {
  return {
    ...base,
    modelPath: overrides.modelPath ?? base.modelPath,
    modelFile: overrides.modelFile ?? base.modelFile,
    scale: overrides.scale ?? base.scale,
    eyeHeight: overrides.eyeHeight ?? base.eyeHeight,
    defaultMaterials: overrides.materials ?? base.defaultMaterials,
    animations: overrides.animations ?? base.animations,
    useProceduralFallback: overrides.proceduralOnly ?? base.useProceduralFallback,
    castShadow: overrides.castShadow ?? base.castShadow,
    receiveShadow: overrides.receiveShadow ?? base.receiveShadow,
  };
}

// ============================================================
// ASSET DIRECTORY STRUCTURE
// ============================================================

/**
 * Expected file structure after downloading from Mixamo:
 *
 * public/
 * └── assets/
 *     ├── models/
 *     │   ├── gas-mask/
 *     │   │   └── model.fbx              ← Character mesh + skeleton
 *     │   └── swat-guy/
 *     │       └── model.fbx              ← Character mesh + skeleton
 *     │
 *     └── animations/
 *         ├── Pro Rifle Pack/            ← PRIMARY animation source
 *         │   ├── Ch15_nonPBR.fbx        ← Reference model (skip)
 *         │   ├── idle.fbx
 *         │   ├── idle aiming.fbx
 *         │   ├── idle crouching.fbx
 *         │   ├── idle crouching aiming.fbx
 *         │   ├── walk forward.fbx       ← (8-way directional variants)
 *         │   ├── walk backward.fbx
 *         │   ├── walk left.fbx
 *         │   ├── walk right.fbx
 *         │   ├── run forward.fbx        ← (8-way directional variants)
 *         │   ├── sprint forward.fbx     ← (8-way directional variants)
 *         │   ├── walk crouching forward.fbx ← (8-way directional)
 *         │   ├── turn 90 left.fbx
 *         │   ├── turn 90 right.fbx
 *         │   ├── jump up.fbx
 *         │   ├── jump loop.fbx
 *         │   ├── jump down.fbx
 *         │   ├── death from front.fbx
 *         │   ├── death from front headshot.fbx
 *         │   └── ... (50+ animation files)
 *         │
 *         ├── Basic Shooter Pack/        ← Combat actions (fire, reload, hit)
 *         │   ├── firing rifle.fbx
 *         │   ├── reloading.fbx
 *         │   ├── hit reaction.fbx
 *         │   └── toss grenade.fbx
 *         │
 *         ├── Shooter Pack/              ← Transitions (start/stop walk)
 *         │   ├── start walking.fbx
 *         │   ├── stop walking.fbx
 *         │   └── walking to dying.fbx
 *         │
 *         ├── Rifle 8-Way Locomotion Pack/ ← Secondary locomotion
 *         ├── Lite Rifle Pack/           ← Fallback locomotion
 *         ├── Slim Shooter Pack/         ← Compact rifle set
 *         └── PistolHandgun Locomotion Pack/ ← Pistol alternate
 *
 * MIXAMO DOWNLOAD MAPPING:
 * ─────────────────────────
 * Game State              →  FBX File (from best pack)
 * ───────────────────────────────────────────────────
 * idle                    →  Pro Rifle Pack/idle.fbx
 * walkForward             →  Pro Rifle Pack/walk forward.fbx
 * runForward              →  Pro Rifle Pack/run forward.fbx
 * sprintForward           →  Pro Rifle Pack/sprint forward.fbx
 * crouchIdle              →  Pro Rifle Pack/idle crouching.fbx
 * crouchWalkForward       →  Pro Rifle Pack/walk crouching forward.fbx
 * rifleIdle               →  Pro Rifle Pack/idle aiming.fbx
 * rifleShoot              →  Basic Shooter Pack/firing rifle.fbx
 * rifleReload             →  Basic Shooter Pack/reloading.fbx
 * hitReaction             →  Basic Shooter Pack/hit reaction.fbx
 * grenade                 →  Basic Shooter Pack/toss grenade.fbx
 * death                   →  Pro Rifle Pack/death from front.fbx
 * walkStart               →  Shooter Pack/start walking.fbx
 * walkStop                →  Shooter Pack/stop walking.fbx
 * turnLeft                →  Pro Rifle Pack/turn 90 left.fbx
 * turnRight               →  Pro Rifle Pack/turn 90 right.fbx
 * jumpUp                  →  Pro Rifle Pack/jump up.fbx
 */

// ============================================================
// QUICK REFERENCE: Usage Examples
// ============================================================

/**
 * Example 1: Load a hero character with default settings
 * ```ts
 * import { GAS_MASK_CONFIG } from '../config/modelConfig';
 * const loader = new MixamoLoader();
 * const { model, animations } = await loader.loadCharacter(
 *   GAS_MASK_CONFIG.name,
 *   GAS_MASK_CONFIG.modelPath,
 *   GAS_MASK_CONFIG.modelFile,
 *   GAS_MASK_CONFIG.animations
 * );
 * // Apply default materials
 * applyMaterialOverrides(model, GAS_MASK_CONFIG.defaultMaterials);
 * ```
 *
 * Example 2: Load an enemy with overrides
 * ```ts
 * import { SWAT_GUY_CONFIG, mergeModelConfig } from '../config/modelConfig';
 * const config = mergeModelConfig(SWAT_GUY_CONFIG, {
 *   scale: 0.95,         // Slightly smaller enemy variant
 *   eyeHeight: 1.55,
 * });
 * ```
 *
 * Example 3: Apply damage flash
 * ```ts
 * import { applyMaterialOverrides, MATERIAL_PRESETS } from '../config/modelConfig';
 * applyMaterialOverrides(enemyModel, [MATERIAL_PRESETS.DAMAGE_FLASH]);
 * // Clear after 100ms
 * setTimeout(() => resetMaterials(enemyModel), 100);
 * ```
 *
 * Example 4: Get bones for blend tree
 * ```ts
 * import { getBoneGroup } from '../config/modelConfig';
 * const upperBones = getBoneGroup('UPPER');
 * // Use upperBones to create animation mask for upper-body blend
 * ```
 */
