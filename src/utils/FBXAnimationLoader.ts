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
 *   - Fallback chain: FBX → procedural placeholder
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
 *
 *   // With fallback:
 *   const model = await loader.loadModelWithFallback(
 *     '/assets/models/gas-mask/model.fbx',
 *     { position: new THREE.Vector3(0, 0, 0) }
 *   );
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
  /** Whether this model was loaded from FBX (false = procedural fallback) */
  fromFBX: boolean;
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

/** Individual item progress callback (for FBXLoader's built-in progress) */
export type FBXItemProgressCallback = (url: string, loaded: number, total: number) => void;

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
  /** Position to set on the model after loading */
  position?: THREE.Vector3;
  /** Rotation to set on the model after loading */
  rotation?: THREE.Euler;
}

/** Options for model loading with fallback */
export interface FBXModelFallbackOptions extends FBXModelOptions {
  /** Color to use for the procedural fallback model */
  fallbackColor?: number;
  /** Name to assign to the fallback model */
  fallbackName?: string;
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
// PROCEDURAL FALLBACK MODEL GENERATOR
// ============================================================

/**
 * Create a minimal procedural character model to use as a fallback
 * when FBX loading fails. This ensures the game always has something
 * to display, even if it's not the high-quality FBX model.
 *
 * @param color - Primary body color
 * @param name - Name to assign to the group
 * @returns A THREE.Group with box-geometry character parts
 */
function createProceduralFallbackModel(
  color: number = 0x2a2a3e,
  name: string = 'fallback-character'
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;

  // Body
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.35), bodyMat);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  // Vest
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.7 });
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.35, 0.4), vestMat);
  vest.position.set(0, 1.15, 0.03);
  vest.castShadow = true;
  group.add(vest);

  // Head
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a882, roughness: 0.7 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), skinMat);
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);

  // Helmet
  const helmetMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.28), helmetMat);
  helmet.position.y = 1.65;
  helmet.castShadow = true;
  group.add(helmet);

  // Face
  const faceMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.05), faceMat);
  face.position.set(0, 1.52, 0.12);
  group.add(face);

  // Left arm
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.4, 1.2, 0);
  const upperArmGeo = new THREE.BoxGeometry(0.15, 0.35, 0.15);
  const leftUpperArm = new THREE.Mesh(upperArmGeo, bodyMat);
  leftUpperArm.position.y = -0.15;
  leftUpperArm.castShadow = true;
  leftArmGroup.add(leftUpperArm);
  const lowerArmGeo = new THREE.BoxGeometry(0.12, 0.3, 0.12);
  const leftLowerArm = new THREE.Mesh(lowerArmGeo, skinMat);
  leftLowerArm.position.y = -0.45;
  leftLowerArm.castShadow = true;
  leftArmGroup.add(leftLowerArm);
  group.add(leftArmGroup);

  // Right arm
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.4, 1.2, 0);
  const rightUpperArm = new THREE.Mesh(upperArmGeo, bodyMat);
  rightUpperArm.position.y = -0.15;
  rightUpperArm.castShadow = true;
  rightArmGroup.add(rightUpperArm);
  const rightLowerArm = new THREE.Mesh(lowerArmGeo, skinMat);
  rightLowerArm.position.y = -0.45;
  rightLowerArm.position.z = -0.1;
  rightLowerArm.castShadow = true;
  rightArmGroup.add(rightLowerArm);
  group.add(rightArmGroup);

  // Left leg
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.13, 0.7, 0);
  const legGeo = new THREE.BoxGeometry(0.18, 0.5, 0.18);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 });
  const leftUpperLeg = new THREE.Mesh(legGeo, legMat);
  leftUpperLeg.position.y = -0.25;
  leftUpperLeg.castShadow = true;
  leftLegGroup.add(leftUpperLeg);
  const bootGeo = new THREE.BoxGeometry(0.2, 0.2, 0.25);
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
  const leftBoot = new THREE.Mesh(bootGeo, bootMat);
  leftBoot.position.set(0, -0.55, 0.02);
  leftBoot.castShadow = true;
  leftLegGroup.add(leftBoot);
  group.add(leftLegGroup);

  // Right leg
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.13, 0.7, 0);
  const rightUpperLeg = new THREE.Mesh(legGeo, legMat);
  rightUpperLeg.position.y = -0.25;
  rightUpperLeg.castShadow = true;
  rightLegGroup.add(rightUpperLeg);
  const rightBoot = new THREE.Mesh(bootGeo, bootMat);
  rightBoot.position.set(0, -0.55, 0.02);
  rightBoot.castShadow = true;
  rightLegGroup.add(rightBoot);
  group.add(rightLegGroup);

  // Store references for animation
  group.userData.leftArm = leftArmGroup;
  group.userData.rightArm = rightArmGroup;
  group.userData.leftLeg = leftLegGroup;
  group.userData.rightLeg = rightLegGroup;
  group.userData.body = body;
  group.userData.head = head;
  group.userData.isFallback = true;

  return group;
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

  /** Event listeners for loading progress */
  private onItemProgress: FBXItemProgressCallback | null = null;

  constructor() {
    this.loader = new FBXLoader();
    console.log('[FBXAnimationLoader] Initialized FBXLoader');
  }

  /**
   * Set a callback for individual file loading progress.
   */
  setItemProgressCallback(callback: FBXItemProgressCallback): void {
    this.onItemProgress = callback;
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
    console.log(`[FBXAnimationLoader] Loading model: ${url}`);

    // Check cache
    if (this.modelCache.has(url)) {
      console.log(`[FBXAnimationLoader] Model cache hit: ${url}`);
      const cached = this.modelCache.get(url)!.clone();
      const result = this.extractModelInfo(cached);
      result.fromFBX = true;
      return result;
    }

    // Deduplicate concurrent loads
    if (this.loadingPromises.has(url)) {
      console.log(`[FBXAnimationLoader] Deduplicating concurrent load: ${url}`);
      await this.loadingPromises.get(url);
      const cached = this.modelCache.get(url)!.clone();
      const result = this.extractModelInfo(cached);
      result.fromFBX = true;
      return result;
    }

    const promise = new Promise<void>((resolve, reject) => {
      this.loader.load(
        url,
        (fbx) => {
          console.log(`[FBXAnimationLoader] Model loaded successfully: ${url}`);
          const model = this.processModel(fbx, options);
          this.modelCache.set(url, model);
          resolve();
        },
        (progress) => {
          // Progress callback — log percentage
          if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (percent % 25 === 0 || percent === 100) {
              console.log(`[FBXAnimationLoader] Model loading: ${percent}% (${url})`);
            }
            this.onItemProgress?.(url, progress.loaded, progress.total);
          }
        },
        (error) => {
          console.error(`[FBXAnimationLoader] Failed to load model: ${url}`, error);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(url, promise);
    try {
      await promise;
    } finally {
      this.loadingPromises.delete(url);
    }

    const cached = this.modelCache.get(url)!.clone();
    const result = this.extractModelInfo(cached);
    result.fromFBX = true;
    return result;
  }

  /**
   * Load a character model from FBX with automatic fallback.
   * If FBX loading fails, creates a procedural placeholder model
   * so the game never shows nothing.
   *
   * @param url - Full URL to the FBX model file
   * @param options - Loading options with fallback configuration
   * @returns The loaded or fallback model with skeleton info
   */
  async loadModelWithFallback(
    url: string,
    options?: FBXModelFallbackOptions
  ): Promise<FBXLoadedModel> {
    try {
      const model = await this.loadModel(url, options);
      console.log(`[FBXAnimationLoader] FBX model loaded, applying position/rotation`);

      // Apply position if specified
      if (options?.position) {
        model.model.position.copy(options.position);
        console.log(`[FBXAnimationLoader] Set model position to: ${options.position.x.toFixed(2)}, ${options.position.y.toFixed(2)}, ${options.position.z.toFixed(2)}`);
      }

      // Apply rotation if specified
      if (options?.rotation) {
        model.model.rotation.copy(options.rotation);
      }

      return model;
    } catch (err) {
      console.warn(`[FBXAnimationLoader] FBX load failed for ${url}, creating procedural fallback:`, err);

      const fallbackColor = options?.fallbackColor ?? 0x2a2a3e;
      const fallbackName = options?.fallbackName ?? 'fallback-model';

      const fallbackModel = createProceduralFallbackModel(fallbackColor, fallbackName);

      // Apply position to fallback
      if (options?.position) {
        fallbackModel.position.copy(options.position);
      }
      if (options?.rotation) {
        fallbackModel.rotation.copy(options.rotation);
      }

      console.log(`[FBXAnimationLoader] Procedural fallback created at position: ${fallbackModel.position.x.toFixed(2)}, ${fallbackModel.position.y.toFixed(2)}, ${fallbackModel.position.z.toFixed(2)}`);

      return {
        model: fallbackModel,
        skeleton: null,
        boneNames: [],
        fromFBX: false,
      };
    }
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
    console.log(`[FBXAnimationLoader] Applied scale: ${scale} (cm → m conversion)`);

    // Process meshes
    let meshCount = 0;
    let materialCount = 0;

    fbx.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshCount++;
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
              materialCount++;
            } else if (mat instanceof THREE.MeshStandardMaterial) {
              newMaterials.push(mat);
              materialCount++;
            } else {
              // Unknown material type — create a basic standard material
              const std = new THREE.MeshStandardMaterial({
                color: (mat as any).color ?? new THREE.Color(0xcccccc),
                roughness: 0.7,
                metalness: 0.1,
              });
              newMaterials.push(std);
              materialCount++;
            }
          }

          child.material = newMaterials.length === 1 ? newMaterials[0] : newMaterials;
        }
      }
    });

    console.log(`[FBXAnimationLoader] Processed model: ${meshCount} meshes, ${materialCount} materials`);

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
        console.log(`[FBXAnimationLoader] Extracted skeleton with ${boneNames.length} bones`);
      }
    });

    return { model, skeleton, boneNames, fromFBX: true };
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
    console.log(`[FBXAnimationLoader] Loading animation: ${url} → "${name}"`);

    // Check cache
    if (this.animationCache.has(name)) {
      console.log(`[FBXAnimationLoader] Animation cache hit: "${name}"`);
      return this.animationCache.get(name)!.clone();
    }

    // Deduplicate
    if (this.loadingPromises.has(url)) {
      console.log(`[FBXAnimationLoader] Deduplicating animation load: ${url}`);
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

          console.log(`[FBXAnimationLoader] Animation loaded: "${name}" (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)`);

          this.animationCache.set(name, clip);
          resolve();
        },
        (progress) => {
          if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (percent % 25 === 0 || percent === 100) {
              console.log(`[FBXAnimationLoader] Animation loading: ${percent}% (${name})`);
            }
            this.onItemProgress?.(url, progress.loaded, progress.total);
          }
        },
        (error) => {
          console.error(`[FBXAnimationLoader] Failed to load animation: ${url}`, error);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(url, promise);
    try {
      await promise;
    } finally {
      this.loadingPromises.delete(url);
    }

    return this.animationCache.get(name)!.clone();
  }

  /**
   * Load a single animation clip from FBX with fallback.
   * If the FBX fails, returns null instead of throwing.
   *
   * @param url - Full URL to the FBX animation file
   * @param name - Logical name for the clip
   * @returns The loaded clip, or null if loading failed
   */
  async loadAnimationWithFallback(
    url: string,
    name: string
  ): Promise<THREE.AnimationClip | null> {
    try {
      return await this.loadAnimation(url, name);
    } catch (err) {
      console.warn(`[FBXAnimationLoader] Animation fallback: "${name}" failed to load from ${url}`);
      return null;
    }
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

    console.log(`[FBXAnimationLoader] Loading ${total} animations from: ${basePath}`);

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

    console.log(`[FBXAnimationLoader] Animation loading complete: ${animations.size}/${total} loaded`);
    return animations;
  }

  /**
   * Load multiple animations with fallback — failed animations return null entries
   * rather than being skipped entirely.
   *
   * @param basePath - Base directory for animation files
   * @param definitions - Array of animation definitions
   * @param onProgress - Optional progress callback
   * @returns Map of animation name → clip (null values indicate failed loads)
   */
  async loadAnimationsWithFallback(
    basePath: string,
    definitions: FBXAnimationDefinition[],
    onProgress?: FBXProgressCallback
  ): Promise<Map<string, THREE.AnimationClip | null>> {
    const animations = new Map<string, THREE.AnimationClip | null>();
    const total = definitions.length;
    let loaded = 0;

    console.log(`[FBXAnimationLoader] Loading ${total} animations with fallback from: ${basePath}`);

    const promises = definitions.map(async (def) => {
      const url = `${basePath}/${def.file}`;
      const clip = await this.loadAnimationWithFallback(url, def.name);

      if (clip) {
        if (def.timeScale !== undefined) {
          (clip as any).__timeScale = def.timeScale;
        }
        if (def.additive !== undefined) {
          (clip as any).__additive = def.additive;
        }
        if (def.affectedBones !== undefined) {
          (clip as any).__affectedBones = def.affectedBones;
        }
      }

      animations.set(def.name, clip);
      loaded++;
      onProgress?.(loaded, total, def.name);
    });

    await Promise.allSettled(promises);

    const loadedCount = [...animations.values()].filter(c => c !== null).length;
    console.log(`[FBXAnimationLoader] Animation loading complete: ${loadedCount}/${total} loaded, ${total - loadedCount} failed`);

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

    console.log(`[FBXAnimationLoader] Loading character: ${modelUrl}`);
    console.log(`[FBXAnimationLoader] Total items: ${totalItems} (1 model + ${totalAnimDefs} animations)`);

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

    console.log(`[FBXAnimationLoader] Character loaded: model=${model.fromFBX ? 'FBX' : 'fallback'}, animations=${animations.size}`);

    return { model, animations };
  }

  /**
   * Load a complete character with FBX model and animations, with full fallback chain.
   * Tries FBX → procedural placeholder for model.
   * Tries FBX → null for animations.
   *
   * @param modelUrl - Full URL to the FBX model file
   * @param animationSources - Array of { packPath, mapping } for each animation pack
   * @param modelOptions - Model loading options with fallback config
   * @param onProgress - Optional progress callback
   */
  async loadCharacterWithFallback(
    modelUrl: string,
    animationSources: Array<{
      packPath: string;
      mapping: Record<string, string>;
    }>,
    modelOptions?: FBXModelFallbackOptions,
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

    console.log(`[FBXAnimationLoader] Loading character with fallback: ${modelUrl}`);

    // Load model with fallback
    const modelPromise = this.loadModelWithFallback(modelUrl, modelOptions).then((model) => {
      loaded++;
      onProgress?.(loaded, totalItems, 'model');
      return model;
    });

    // Load all animation packs with individual fallback
    const animPromises = animationSources.map(async (src) => {
      const definitions: FBXAnimationDefinition[] = Object.entries(src.mapping).map(
        ([filename, logicalName]) => ({
          name: logicalName,
          file: `${filename}.fbx`,
        })
      );

      const anims = new Map<string, THREE.AnimationClip>();
      for (const def of definitions) {
        const url = `${src.packPath}/${def.file}`;
        const clip = await this.loadAnimationWithFallback(url, def.name);
        if (clip) {
          anims.set(def.name, clip);
        }
        loaded++;
        onProgress?.(loaded, totalItems, def.name);
      }
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

    console.log(`[FBXAnimationLoader] Character with fallback loaded: model=${model.fromFBX ? 'FBX' : 'procedural'}, animations=${animations.size}`);

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
    console.log('[FBXAnimationLoader] Cache cleared');
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
    console.log('[FBXAnimationLoader] Disposed all resources');
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

  console.log(`[FBXAnimationLoader] Created AnimationMixer with ${actions.size} actions`);

  return { mixer, actions };
}
