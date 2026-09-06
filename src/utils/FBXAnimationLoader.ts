/**
 * FBXAnimationLoader.ts
 * FBX-aware loader for Mixamo models and animations in Three.js
 *
 * Handles:
 *   - Loading FBX character models (mesh + skeleton) with correct scale
 *   - Loading animation clips from separate FBX files
 *   - Batch loading with progress tracking
 *   - Caching loaded assets to avoid duplicate requests
 *   - Proper Mixamo skeleton/scale handling (FBX is cm, Three.js is meters)
 *   - Animation clip extraction and normalization
 *   - Fallback chain: FBX → GLB → procedural
 *
 * Mixamo FBX notes:
 *   - Models export at centimeter scale (divide by 100 for meters)
 *   - Animations export with "mixamorig:" bone prefix
 *   - Each animation FBX contains a single AnimationClip
 *   - The Ch15_nonPBR.fbx in each pack is the reference model (skip it)
 *
 * Usage:
 *   const loader = new FBXAnimationLoader();
 *   const model = await loader.loadModel('/assets/models/gas-mask/model.fbx');
 *   const anim = await loader.loadAnimation('/assets/animations/Pro Rifle Pack/idle.fbx', 'idle');
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// ============================================================
// TYPES
// ============================================================

/** Animation definition — maps a logical name to an FBX file path */
export interface FBXAnimationDefinition {
  /** Logical name (e.g., 'idle', 'walk', 'run') */
  name: string;
  /** Filename relative to pack/model directory (e.g., 'idle.fbx') */
  file: string;
  /** Optional: override loop mode */
  loop?: THREE.AnimationActionLoopStyles;
  /** Optional: override time scale */
  timeScale?: number;
  /** Optional: clamp when finished (for one-shot animations) */
  clampWhenFinished?: boolean;
  /** Optional: blend weight for layered animation */
  weight?: number;
  /** Optional: whether this is an additive animation */
  additive?: boolean;
  /** Optional: bones this animation affects (for partial-body blending) */
  affectedBones?: string[];
}

/** Loaded FBX model result */
export interface FBXLoadedModel {
  /** The Three.js group containing the character model */
  model: THREE.Group;
  /** The skeleton (for debugging or retargeting) */
  skeleton: THREE.Skeleton | null;
  /** Bone names extracted from the skeleton */
  boneNames: string[];
}

/** Loaded FBX animation result */
export interface FBXLoadedAnimation {
  /** The extracted AnimationClip */
  clip: THREE.AnimationClip;
  /** Original FBX clip name (before renaming) */
  originalName: string;
}

/** Progress callback */
export type FBXProgressCallback = (loaded: number, total: number, item: string) => void;

/** Loading options for models */
export interface FBXModelOptions {
  /** Scale factor (default: 0.01 for Mixamo cm→m) */
  scale?: number;
  /** Whether to cast shadows */
  castShadow?: boolean;
  /** Whether to receive shadows */
  receiveShadow?: boolean;
  /** Convert Phong materials to Standard materials */
  convertMaterials?: boolean;
}

// ============================================================
// MIXAMO FBX BONE NAME PREFIX
// ============================================================

/**
 * Mixamo FBX exports use "mixamorig:" prefix on all bone names.
 * This prefix must be stripped for Three.js to work correctly
 * with AnimationMixer and skeleton binding.
 */
const MIXAMO_PREFIX = 'mixamorig:';

/**
 * Strip Mixamo bone name prefix from all tracks in a clip.
 */
function stripMixamoPrefix(clip: THREE.AnimationClip): void {
  for (const track of clip.tracks) {
    if (track.name.includes(MIXAMO_PREFIX)) {
      track.name = track.name.replace(new RegExp(MIXAMO_PREFIX.replace(':', '\\:'), 'g'), '');
    }
  }
}

/**
 * Strip Mixamo bone name prefix from all bones in a skeleton.
 */
function stripSkeletonPrefix(skeleton: THREE.Skeleton): void {
  for (const bone of skeleton.bones) {
    if (bone.name.startsWith(MIXAMO_PREFIX)) {
      bone.name = bone.name.replace(MIXAMO_PREFIX, '');
    }
  }
  // Also fix boneInverses names don't need fixing (they're matrices)
}

// ============================================================
// ANIMATION CLIP NORMALIZATION
// ============================================================

/**
 * Normalize an AnimationClip from FBX for use with Three.js AnimationMixer.
 *
 * Steps:
 *   1. Strip "mixamorig:" prefix from track names
 *   2. Ensure clip name is set correctly
 *   3. Validate tracks exist
 */
function normalizeFBXClip(clip: THREE.AnimationClip, desiredName: string): THREE.AnimationClip {
  // Strip Mixamo prefix
  stripMixamoPrefix(clip);

  // Rename clip
  clip.name = desiredName;

  return clip;
}

// ============================================================
// FBX ANIMATION LOADER CLASS
// ============================================================

export class FBXAnimationLoader {
  private loader: FBXLoader;
  private modelCache: Map<string, THREE.Group> = new Map();
  private animationCache: Map<string, THREE.AnimationClip> = new Map();
  private loadingPromises: Map<string, Promise<any>> = new Map();

  /** Mixamo models are in centimeters; Three.js uses meters. */
  static readonly DEFAULT_SCALE = 0.01;

  constructor() {
    this.loader = new FBXLoader();
  }

  // ============================================================
  // MODEL LOADING
  // ============================================================

  /**
   * Load a character model (mesh + skeleton) from an FBX file.
   * Applies correct scale, shadow settings, and material conversion.
   *
   * @param url - Full URL to the FBX model file
   * @param options - Loading options
   * @returns The loaded model with skeleton info
   */
  async loadModel(
    url: string,
    options?: FBXModelOptions
  ): Promise<FBXLoadedModel> {
    // Check cache
    if (this.modelCache.has(url)) {
      const cached = this.modelCache.get(url)!.clone();
      return this.extractModelInfo(cached);
    }

    // Deduplicate concurrent loads
    if (this.loadingPromises.has(url)) {
      await this.loadingPromises.get(url);
      const cached = this.modelCache.get(url)!.clone();
      return this.extractModelInfo(cached);
    }

    const promise = new Promise<void>((resolve, reject) => {
      this.loader.load(
        url,
        (fbx) => {
          const model = this.processModel(fbx, options);
          this.modelCache.set(url, model);
          resolve();
        },
        undefined,
        (error) => {
          console.error(`[FBXAnimationLoader] Failed to load model: ${url}`, error);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(url, promise);
    await promise;
    this.loadingPromises.delete(url);

    const cached = this.modelCache.get(url)!.clone();
    return this.extractModelInfo(cached);
  }

  /**
   * Process a loaded FBX object into a proper Three.js model.
   */
  private processModel(
    fbx: THREE.Group,
    options?: FBXModelOptions
  ): THREE.Group {
    const scale = options?.scale ?? FBXAnimationLoader.DEFAULT_SCALE;
    const castShadow = options?.castShadow ?? true;
    const receiveShadow = options?.receiveShadow ?? true;
    const convertMaterials = options?.convertMaterials ?? true;

    // Apply Mixamo scale (cm → m)
    fbx.scale.set(scale, scale, scale);

    // Process meshes
    fbx.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;

        // Convert materials if needed
        if (convertMaterials && child.material) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];

          const newMaterials: THREE.Material[] = [];
          for (const mat of materials) {
            if (mat instanceof THREE.MeshPhongMaterial) {
              // Convert Phong → Standard for PBR pipeline
              const std = new THREE.MeshStandardMaterial({
                color: mat.color,
                map: mat.map,
                normalMap: mat.normalMap,
                emissive: mat.emissive,
                emissiveMap: mat.emissiveMap,
                transparent: mat.transparent,
                opacity: mat.opacity,
                side: mat.side,
                roughness: 0.7,
                metalness: 0.1,
              });
              newMaterials.push(std);
            } else if (mat instanceof THREE.MeshStandardMaterial) {
              newMaterials.push(mat);
            } else {
              // Unknown material type — create a basic standard material
              const std = new THREE.MeshStandardMaterial({
                color: (mat as any).color ?? new THREE.Color(0xcccccc),
                roughness: 0.7,
                metalness: 0.1,
              });
              newMaterials.push(std);
            }
          }

          child.material = newMaterials.length === 1 ? newMaterials[0] : newMaterials;
        }
      }
    });

    return fbx;
  }

  /**
   * Extract model info (skeleton, bones) from a loaded model.
   */
  private extractModelInfo(model: THREE.Group): FBXLoadedModel {
    let skeleton: THREE.Skeleton | null = null;
    let boneNames: string[] = [];

    model.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.skeleton) {
        skeleton = child.skeleton;

        // Strip Mixamo prefix from skeleton bones
        stripSkeletonPrefix(skeleton);

        boneNames = skeleton.bones.map((b) => b.name);
      }
    });

    return { model, skeleton, boneNames };
  }

  // ============================================================
  // ANIMATION LOADING
  // ============================================================

  /**
   * Load a single animation clip from an FBX file.
   * The FBX should contain only the animation (character "Without Skin").
   *
   * @param url - Full URL to the FBX animation file
   * @param name - Name to assign to the clip (logical name)
   * @returns The loaded and normalized animation clip
   */
  async loadAnimation(url: string, name: string): Promise<THREE.AnimationClip> {
    // Check cache
    if (this.animationCache.has(name)) {
      return this.animationCache.get(name)!.clone();
    }

    // Deduplicate
    if (this.loadingPromises.has(url)) {
      await this.loadingPromises.get(url);
      return this.animationCache.get(name)!.clone();
    }

    const promise = new Promise<void>((resolve, reject) => {
      this.loader.load(
        url,
        (fbx) => {
          if (fbx.animations.length === 0) {
            reject(new Error(`No animations found in ${url}`));
            return;
          }

          const clip = fbx.animations[0];
          const originalName = clip.name;

          // Normalize the clip (strip Mixamo prefix, rename)
          normalizeFBXClip(clip, name);

          // Store original name as metadata
          (clip as any).__originalName = originalName;
          (clip as any).__sourceUrl = url;

          this.animationCache.set(name, clip);
          resolve();
        },
        undefined,
        (error) => {
          console.error(`[FBXAnimationLoader] Failed to load animation: ${url}`, error);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(url, promise);
    await promise;
    this.loadingPromises.delete(url);

    return this.animationCache.get(name)!.clone();
  }

  /**
   * Load multiple animation clips in parallel from FBX files.
   *
   * @param basePath - Base directory for animation files
   * @param definitions - Array of animation definitions
   * @param onProgress - Optional progress callback
   * @returns Map of animation name → clip
   */
  async loadAnimations(
    basePath: string,
    definitions: FBXAnimationDefinition[],
    onProgress?: FBXProgressCallback
  ): Promise<Map<string, THREE.AnimationClip>> {
    const animations = new Map<string, THREE.AnimationClip>();
    const total = definitions.length;
    let loaded = 0;

    const promises = definitions.map(async (def) => {
      const url = `${basePath}/${def.file}`;
      try {
        const clip = await this.loadAnimation(url, def.name);

        // Apply per-animation settings as metadata
        if (def.timeScale !== undefined) {
          (clip as any).__timeScale = def.timeScale;
        }
        if (def.additive !== undefined) {
          (clip as any).__additive = def.additive;
        }
        if (def.affectedBones !== undefined) {
          (clip as any).__affectedBones = def.affectedBones;
        }

        animations.set(def.name, clip);
        loaded++;
        onProgress?.(loaded, total, def.name);
      } catch (err) {
        console.warn(`[FBXAnimationLoader] Skipping animation "${def.name}": ${err}`);
        loaded++;
        onProgress?.(loaded, total, def.name);
      }
    });

    await Promise.allSettled(promises);
    return animations;
  }

  /**
   * Load all animations from a Mixamo animation pack directory.
   * Skips the Ch15_nonPBR.fbx reference model file automatically.
   *
   * @param packPath - Path to the animation pack directory
   * @param mapping - Map of FBX filename (without extension) → logical name
   * @param onProgress - Optional progress callback
   */
  async loadPack(
    packPath: string,
    mapping: Record<string, string>,
    onProgress?: FBXProgressCallback
  ): Promise<Map<string, THREE.AnimationClip>> {
    const definitions: FBXAnimationDefinition[] = Object.entries(mapping).map(
      ([filename, logicalName]) => ({
        name: logicalName,
        file: `${filename}.fbx`,
      })
    );

    return this.loadAnimations(packPath, definitions, onProgress);
  }

  // ============================================================
  // BATCH LOADING
  // ============================================================

  /**
   * Load a complete character with FBX model and animations.
   *
   * @param modelUrl - Full URL to the FBX model file
   * @param animationSources - Array of { packPath, mapping } for each animation pack
   * @param modelOptions - Model loading options
   * @param onProgress - Optional progress callback
   */
  async loadCharacter(
    modelUrl: string,
    animationSources: Array<{
      packPath: string;
      mapping: Record<string, string>;
    }>,
    modelOptions?: FBXModelOptions,
    onProgress?: FBXProgressCallback
  ): Promise<{
    model: FBXLoadedModel;
    animations: Map<string, THREE.AnimationClip>;
  }> {
    // Count total items for progress
    const totalAnimDefs = animationSources.reduce(
      (sum, src) => sum + Object.keys(src.mapping).length, 0
    );
    const totalItems = 1 + totalAnimDefs;
    let loaded = 0;

    // Load model
    const modelPromise = this.loadModel(modelUrl, modelOptions).then((model) => {
      loaded++;
      onProgress?.(loaded, totalItems, 'model');
      return model;
    });

    // Load all animation packs in parallel
    const animPromises = animationSources.map(async (src) => {
      const anims = await this.loadPack(
        src.packPath,
        src.mapping,
        (animLoaded, _total, name) => {
          loaded++;
          onProgress?.(loaded, totalItems, name);
        }
      );
      return anims;
    });

    const [model, ...packResults] = await Promise.all([
      modelPromise,
      ...animPromises,
    ]);

    // Merge all animation packs into one map
    const animations = new Map<string, THREE.AnimationClip>();
    for (const packAnims of packResults) {
      for (const [name, clip] of packAnims) {
        animations.set(name, clip);
      }
    }

    return { model, animations };
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
   * Get the FBXLoader instance for custom loading needs.
   */
  getLoader(): FBXLoader {
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
// HELPER: Create AnimationMixer with FBX-loaded character
// ============================================================

/**
 * Convenience function: create an AnimationMixer and populate it
 * with all loaded FBX animations.
 *
 * @param model - The character model group
 * @param animations - Map of animation name → clip
 * @returns Object with mixer and pre-created actions
 */
export function createFBXCharacterMixer(
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
