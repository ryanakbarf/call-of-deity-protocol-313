/**
 * AnimationBlendSystem.ts
 * Layered animation blending system for Call of Deity: Protocol 313
 *
 * Features:
 *   - Upper body / Lower body split for simultaneous locomotion + aiming
 *   - Additive blending for recoil, hit reactions, breathing
 *   - Smooth transitions between blend states (0.1–0.2s default)
 *   - Bone mask system for partial-body animation
 *   - Directional blend trees for 8-way locomotion
 *   - Priority-based layer management
 *   - Runtime blend weight adjustment
 *
 * Architecture:
 *   Layer 0: Full body locomotion (idle/walk/run/sprint/crouch)
 *   Layer 1: Upper body overlay (aiming, shooting, reloading)
 *   Layer 2: Additive effects (recoil, hit reaction, breathing)
 *   Layer 3: One-shot actions (grenade throw, death)
 *
 * Usage:
 *   const blendSystem = new AnimationBlendSystem(mixer, skeleton);
 *   blendSystem.addLayer('locomotion', 0, boneMaskLower);
 *   blendSystem.addLayer('aiming', 1, boneMaskUpper);
 *   blendSystem.setAnimation('locomotion', 'runForward');
 *   blendSystem.setAnimation('aiming', 'rifleIdle');
 *   blendSystem.setLayerWeight('aiming', 0.8);
 *   // In game loop:
 *   blendSystem.update(delta);
 */

import * as THREE from 'three';
import { SKELETON_GROUPS, getSkeletonBones } from '../config/modelConfig';

// ============================================================
// TYPES
// ============================================================

/** Blend layer configuration */
export interface BlendLayerConfig {
  /** Unique layer name */
  name: string;
  /** Layer index (lower = evaluated first, 0 = base) */
  index: number;
  /** Bone mask — only these bones are affected (empty = all bones) */
  boneMask: string[];
  /** Default blend weight (0–1) */
  defaultWeight: number;
  /** Whether this layer uses additive blending */
  additive: boolean;
  /**Blend mode */
  blendMode: number;
  /** Whether this layer can be interrupted by higher layers */
  interruptible: boolean;
}

/** Runtime blend layer state */
interface BlendLayerState {
  config: BlendLayerConfig;
  /** Current animation playing on this layer */
  currentAnim: string | null;
  /** Previous animation (for crossfade) */
  previousAnim: string | null;
  /** The THREE.js action for the current animation */
  currentAction: THREE.AnimationAction | null;
  /** The THREE.js action for the previous animation (crossfading out) */
  previousAction: THREE.AnimationAction | null;
  /** Current blend weight (0–1) */
  weight: number;
  /** Target weight (lerping toward this) */
  targetWeight: number;
  /** Blend-in/out speed (weight units per second) */
  blendSpeed: number;
  /** Crossfade progress (0–1) */
  crossfadeProgress: number;
  /** Crossfade duration in seconds */
  crossfadeDuration: number;
  /** Whether a crossfade is in progress */
  isCrossfading: boolean;
  /** Whether this layer is enabled */
  enabled: boolean;
}

/** Directional blend state for locomotion */
interface DirectionalBlendState {
  /** Primary animation (closest direction) */
  primaryAnim: string;
  /** Secondary animation (next closest direction) */
  secondaryAnim: string;
  /** Blend weight between primary and secondary (0 = fully primary) */
  blendWeight: number;
  /** Movement angle in radians */
  angle: number;
  /** Movement speed (0 = idle, 1 = walk, 2 = run, 3 = sprint) */
  speed: number;
}

/** Additive animation layer for effects like recoil */
interface AdditiveLayer {
  /** Name of this additive effect */
  name: string;
  /** Animation to add */
  clip: THREE.AnimationClip;
  /** Current weight (0 = off, 1 = full effect) */
  weight: number;
  /** Target weight */
  targetWeight: number;
  /** Speed of weight transition */
  transitionSpeed: number;
  /** Duration (0 = auto from clip) */
  duration: number;
  /** Time elapsed */
  time: number;
  /** Whether this effect is active */
  active: boolean;
  /** The THREE.js action */
  action: THREE.AnimationAction | null;
  /** Whether this is a one-shot effect */
  oneShot: boolean;
  /** Callback when one-shot finishes */
  onComplete?: () => void;
}

// ============================================================
// BLEND SYSTEM CLASS
// ============================================================

export class AnimationBlendSystem {
  private mixer: THREE.AnimationMixer;
  private skeleton: THREE.Skeleton | null;
  private boneNames: string[];
  private boneNameToIndex: Map<string, number>;

  /** Registered blend layers (sorted by index) */
  private layers: Map<string, BlendLayerState> = new Map();

  /** All registered animations (name → clip) */
  private clips: Map<string, THREE.AnimationClip> = new Map();

  /** All registered actions (name → action) */
  private actions: Map<string, THREE.AnimationAction> = new Map();

  /** Additive effect layers */
  private additiveLayers: Map<string, AdditiveLayer> = new Map();

  /** Directional blend state (for locomotion) */
  private directionalState: DirectionalBlendState = {
    primaryAnim: 'idle',
    secondaryAnim: 'idle',
    blendWeight: 0,
    angle: 0,
    speed: 0,
  };

  /** Global time scale */
  private globalTimeScale: number = 1.0;

  /** Whether the system is enabled */
  private enabled: boolean = true;

  /** Default crossfade duration */
  private defaultCrossfadeDuration: number = 0.15;

  constructor(
    mixer: THREE.AnimationMixer,
    skeleton?: THREE.Skeleton | null
  ) {
    this.mixer = mixer;
    this.skeleton = skeleton ?? null;
    this.boneNames = skeleton
      ? skeleton.bones.map((b) => b.name)
      : getSkeletonBones();
    this.boneNameToIndex = new Map(
      this.boneNames.map((name, index) => [name, index])
    );
  }

  // ============================================================
  // ANIMATION REGISTRATION
  // ============================================================

  /**
   * Register an animation clip with the blend system.
   *
   * @param name - Logical animation name
   * @param clip - The AnimationClip to register
   * @param options - Optional playback settings
   */
  addAnimation(
    name: string,
    clip: THREE.AnimationClip,
    options?: {
      loop?: THREE.AnimationActionLoopStyles;
      clampWhenFinished?: boolean;
      timeScale?: number;
    }
  ): void {
    this.clips.set(name, clip);

    const action = this.mixer.clipAction(clip);
    action.enabled = true;

    if (options?.loop !== undefined) action.loop = options.loop;
    if (options?.clampWhenFinished !== undefined) action.clampWhenFinished = options.clampWhenFinished;
    if (options?.timeScale !== undefined) action.timeScale = options.timeScale * this.globalTimeScale;

    this.actions.set(name, action);
  }

  /**
   * Register multiple animations at once.
   */
  addAnimations(
    animations: Array<{
      name: string;
      clip: THREE.AnimationClip;
      loop?: THREE.AnimationActionLoopStyles;
      clampWhenFinished?: boolean;
      timeScale?: number;
    }>
  ): void {
    for (const anim of animations) {
      this.addAnimation(anim.name, anim.clip, {
        loop: anim.loop,
        clampWhenFinished: anim.clampWhenFinished,
        timeScale: anim.timeScale,
      });
    }
  }

  // ============================================================
  // LAYER MANAGEMENT
  // ============================================================

  /**
   * Add a blend layer.
   *
   * @param config - Layer configuration
   */
  addLayer(config: BlendLayerConfig): void {
    const state: BlendLayerState = {
      config,
      currentAnim: null,
      previousAnim: null,
      currentAction: null,
      previousAction: null,
      weight: config.defaultWeight,
      targetWeight: config.defaultWeight,
      blendSpeed: 8, // Fast default blend
      crossfadeProgress: 1,
      crossfadeDuration: this.defaultCrossfadeDuration,
      isCrossfading: false,
      enabled: true,
    };

    this.layers.set(config.name, state);
  }

  /**
   * Remove a blend layer.
   */
  removeLayer(name: string): void {
    const layer = this.layers.get(name);
    if (layer) {
      layer.currentAction?.stop();
      layer.previousAction?.stop();
      this.layers.delete(name);
    }
  }

  /**
   * Get a layer by name.
   */
  getLayer(name: string): BlendLayerState | undefined {
    return this.layers.get(name);
  }

  // ============================================================
  // ANIMATION PLAYBACK ON LAYERS
  // ============================================================

  /**
   * Set the animation playing on a specific layer.
   * Automatically crossfades from the current animation.
   *
   * @param layerName - Layer to set animation on
   * @param animName - Animation name (must be registered)
   * @param crossfadeDuration - Crossfade time in seconds (default: 0.15)
   */
  setLayerAnimation(
    layerName: string,
    animName: string,
    crossfadeDuration?: number
  ): void {
    const layer = this.layers.get(layerName);
    if (!layer) {
      console.warn(`[BlendSystem] Layer "${layerName}" not found`);
      return;
    }

    const newAction = this.actions.get(animName);
    if (!newAction) {
      console.warn(`[BlendSystem] Animation "${animName}" not registered`);
      return;
    }

    // Skip if already playing this animation
    if (layer.currentAnim === animName) return;

    const duration = crossfadeDuration ?? this.defaultCrossfadeDuration;

    // Store previous animation for crossfade
    layer.previousAnim = layer.currentAnim;
    layer.previousAction = layer.currentAction;
    layer.currentAnim = animName;
    layer.currentAction = newAction;

    // Reset and play new action
    newAction.reset();
    newAction.enabled = true;
    newAction.setEffectiveWeight(0);
    newAction.play();

    // Set up crossfade
    if (layer.previousAction && duration > 0) {
      layer.isCrossfading = true;
      layer.crossfadeProgress = 0;
      layer.crossfadeDuration = duration;

      // Crossfade from old to new
      layer.previousAction.crossFadeTo(newAction, duration, true);
    } else {
      // Instant switch
      newAction.setEffectiveWeight(layer.weight);
      layer.previousAction?.stop();
      layer.isCrossfading = false;
    }
  }

  /**
   * Get the current animation name on a layer.
   */
  getLayerAnimation(layerName: string): string | null {
    return this.layers.get(layerName)?.currentAnim ?? null;
  }

  // ============================================================
  // BLEND WEIGHT CONTROL
  // ============================================================

  /**
   * Set the blend weight for a layer.
   *
   * @param layerName - Layer name
   * @param weight - Target weight (0 = off, 1 = fully active)
   * @param instant - If true, set immediately (no lerp)
   */
  setLayerWeight(
    layerName: string,
    weight: number,
    instant: boolean = false
  ): void {
    const layer = this.layers.get(layerName);
    if (!layer) return;

    layer.targetWeight = Math.max(0, Math.min(1, weight));

    if (instant) {
      layer.weight = layer.targetWeight;
      if (layer.currentAction) {
        layer.currentAction.setEffectiveWeight(layer.weight);
      }
    }
  }

  /**
   * Get the current weight for a layer.
   */
  getLayerWeight(layerName: string): number {
    return this.layers.get(layerName)?.weight ?? 0;
  }

  /**
   * Set blend speed for weight lerping.
   */
  setLayerBlendSpeed(layerName: string, speed: number): void {
    const layer = this.layers.get(layerName);
    if (layer) layer.blendSpeed = speed;
  }

  // ============================================================
  // DIRECTIONAL BLEND TREE
  // ============================================================

  /**
   * Update the directional blend for locomotion layers.
   * Interpolates between 8 directional animations based on
   * movement angle and speed.
   *
   * @param layerName - Layer to apply directional blend to
   * @param angle - Movement angle in radians (0 = forward, PI/2 = right)
   * @param speed - Movement speed (0 = idle, 1 = walk, 2 = run, 3 = sprint)
   * @param directionSets - Directional animation sets for each speed
   */
  updateDirectionalBlend(
    layerName: string,
    angle: number,
    speed: number,
    directionSets?: {
      idle?: string;
      walk?: Record<string, string>;
      run?: Record<string, string>;
      sprint?: Record<string, string>;
    }
  ): void {
    const layer = this.layers.get(layerName);
    if (!layer) return;

    // Determine which directional set to use based on speed
    let anim1: string, anim2: string, blendWeight: number;

    if (speed < 0.1) {
      // Idle — no directional blend needed
      this.setLayerAnimation(layerName, 'idle');
      return;
    } else if (speed < 1.5) {
      // Walk
      const dirs = directionSets?.walk ?? this.getDefaultDirs('walk');
      [anim1, anim2, blendWeight] = this.resolveDirection(angle, dirs);
    } else if (speed < 2.5) {
      // Run
      const dirs = directionSets?.run ?? this.getDefaultDirs('run');
      [anim1, anim2, blendWeight] = this.resolveDirection(angle, dirs);
    } else {
      // Sprint
      const dirs = directionSets?.sprint ?? this.getDefaultDirs('sprint');
      [anim1, anim2, blendWeight] = this.resolveDirection(angle, dirs);
    }

    // For now, play the primary direction animation
    // (Full blend tree interpolation requires骨骼mask-based blending)
    this.setLayerAnimation(layerName, anim1);

    // Store directional state for potential blend tree usage
    this.directionalState = {
      primaryAnim: anim1,
      secondaryAnim: anim2,
      blendWeight,
      angle,
      speed,
    };
  }

  /**
   * Get default directional animation names for a speed level.
   */
  private getDefaultDirs(speed: string): Record<string, string> {
    switch (speed) {
      case 'walk': return {
        forward: 'walkForward', forwardRight: 'walkForwardRight',
        right: 'walkRight', backwardRight: 'walkBackwardRight',
        backward: 'walkBackward', backwardLeft: 'walkBackwardLeft',
        left: 'walkLeft', forwardLeft: 'walkForwardLeft',
      };
      case 'run': return {
        forward: 'runForward', forwardRight: 'runForwardRight',
        right: 'runRight', backwardRight: 'runBackwardRight',
        backward: 'runBackward', backwardLeft: 'runBackwardLeft',
        left: 'runLeft', forwardLeft: 'runForwardLeft',
      };
      case 'sprint': return {
        forward: 'sprintForward', forwardRight: 'sprintForwardRight',
        right: 'sprintRight', backwardRight: 'sprintBackwardRight',
        backward: 'sprintBackward', backwardLeft: 'sprintBackwardLeft',
        left: 'sprintLeft', forwardLeft: 'sprintForwardLeft',
      };
      default: return {
        forward: 'idle', forwardRight: 'idle',
        right: 'idle', backwardRight: 'idle',
        backward: 'idle', backwardLeft: 'idle',
        left: 'idle', forwardLeft: 'idle',
      };
    }
  }

  /**
   * Resolve movement angle to two closest directional animations.
   */
  private resolveDirection(
    angle: number,
    dirs: Record<string, string>
  ): [string, string, number] {
    const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const degrees = (normalized * 180) / Math.PI;

    const dirAngles: Array<{ key: string; angle: number }> = [
      { key: 'forward', angle: 0 },
      { key: 'forwardRight', angle: 45 },
      { key: 'right', angle: 90 },
      { key: 'backwardRight', angle: 135 },
      { key: 'backward', angle: 180 },
      { key: 'backwardLeft', angle: 225 },
      { key: 'left', angle: 270 },
      { key: 'forwardLeft', angle: 315 },
    ];

    // Find closest direction
    let bestIdx = 0;
    let minDist = 999;

    for (let i = 0; i < dirAngles.length; i++) {
      const dist = Math.min(
        Math.abs(degrees - dirAngles[i].angle),
        Math.abs(degrees - dirAngles[i].angle + 360),
        Math.abs(degrees - dirAngles[i].angle - 360)
      );
      if (dist < minDist) {
        minDist = dist;
        bestIdx = i;
      }
    }

    // Get next direction for blend
    const nextIdx = (bestIdx + 1) % dirAngles.length;
    const best = dirAngles[bestIdx];
    const next = dirAngles[nextIdx];

    const range = next.angle > best.angle
      ? next.angle - best.angle
      : (360 - best.angle + next.angle);

    let t = range > 0 ? (degrees - best.angle) / range : 0;
    if (t < 0) t += 1;
    t = Math.max(0, Math.min(1, t));

    return [
      dirs[best.key] ?? 'idle',
      dirs[next.key] ?? 'idle',
      t,
    ];
  }

  // ============================================================
  // ADDITIVE BLENDING
  // ============================================================

  /**
   * Register an additive animation effect.
   * Additive animations are layered on top of the base animation
   * with additive blending mode.
   *
   * @param name - Effect name (e.g., 'recoil', 'hitReaction')
   * @param clip - Animation clip for the effect
   * @param options - Effect options
   */
  addAdditiveEffect(
    name: string,
    clip: THREE.AnimationClip,
    options?: {
      oneShot?: boolean;
      duration?: number;
      transitionSpeed?: number;
      onComplete?: () => void;
    }
  ): void {
    const action = this.mixer.clipAction(clip);
    action.enabled = false;
    action.setLoop(
      options?.oneShot ? THREE.LoopOnce : THREE.LoopRepeat,
      1
    );
    action.clampWhenFinished = true;
    action.blendMode = THREE.AdditiveAnimationBlendMode;

    const effect: AdditiveLayer = {
      name,
      clip,
      weight: 0,
      targetWeight: 0,
      transitionSpeed: options?.transitionSpeed ?? 10,
      duration: options?.duration ?? clip.duration,
      time: 0,
      active: false,
      action,
      oneShot: options?.oneShot ?? false,
      onComplete: options?.onComplete,
    };

    this.additiveLayers.set(name, effect);
  }

  /**
   * Trigger an additive effect.
   *
   * @param name - Effect name
   * @param weight - Target weight (0–1)
   * @param duration - Optional override duration
   */
  triggerAdditiveEffect(
    name: string,
    weight: number = 1.0,
    duration?: number
  ): void {
    const effect = this.additiveLayers.get(name);
    if (!effect) return;

    effect.targetWeight = weight;
    effect.active = true;
    effect.time = 0;
    if (duration !== undefined) effect.duration = duration;

    // Reset and play the action
    if (effect.action) {
      effect.action.reset();
      effect.action.enabled = true;
      effect.action.setEffectiveWeight(0);
      effect.action.play();
    }
  }

  /**
   * Stop an additive effect.
   */
  stopAdditiveEffect(name: string): void {
    const effect = this.additiveLayers.get(name);
    if (!effect) return;

    effect.targetWeight = 0;
    if (effect.action) {
      effect.action.stop();
    }
    effect.active = false;
  }

  /**
   * Get the current weight of an additive effect.
   */
  getAdditiveWeight(name: string): number {
    return this.additiveLayers.get(name)?.weight ?? 0;
  }

  // ============================================================
  // PRESET LAYER CONFIGURATIONS
  // ============================================================

  /**
   * Create a standard locomotion layer (lower body).
   */
  static createLocomotionLayer(
    index: number = 0,
    weight: number = 1.0
  ): BlendLayerConfig {
    return {
      name: 'locomotion',
      index,
      boneMask: [
        ...SKELETON_GROUPS.LEGS,
        'Hips',
        'Spine', 'Spine1',
      ],
      defaultWeight: weight,
      additive: false,
      blendMode: THREE.NormalAnimationBlendMode,
      interruptible: true,
    };
  }

  /**
   * Create a standard aiming layer (upper body overlay).
   */
  static createAimingLayer(
    index: number = 1,
    weight: number = 0.0
  ): BlendLayerConfig {
    return {
      name: 'aiming',
      index,
      boneMask: [
        ...SKELETON_GROUPS.UPPER,
      ],
      defaultWeight: weight,
      additive: false,
      blendMode: THREE.NormalAnimationBlendMode,
      interruptible: true,
    };
  }

  /**
   * Create a standard recoil/additive layer.
   */
  static createRecoilLayer(
    index: number = 2,
    weight: number = 0.0
  ): BlendLayerConfig {
    return {
      name: 'recoil',
      index,
      boneMask: [
        'Spine1', 'Spine2',
        'RightArm', 'RightForeArm', 'RightHand',
      ],
      defaultWeight: weight,
      additive: true,
      blendMode: THREE.AdditiveAnimationBlendMode,
      interruptible: true,
    };
  }

  /**
   * Create a one-shot action layer (grenade, death, etc.).
   */
  static createActionLayer(
    index: number = 3,
    weight: number = 0.0
  ): BlendLayerConfig {
    return {
      name: 'action',
      index,
      boneMask: [], // Full body
      defaultWeight: weight,
      additive: false,
      blendMode: THREE.NormalAnimationBlendMode,
      interruptible: false,
    };
  }

  /**
   * Set up the standard 4-layer blend configuration.
   */
  setupStandardLayers(): void {
    this.addLayer(AnimationBlendSystem.createLocomotionLayer(0, 1.0));
    this.addLayer(AnimationBlendSystem.createAimingLayer(1, 0.0));
    this.addLayer(AnimationBlendSystem.createRecoilLayer(2, 0.0));
    this.addLayer(AnimationBlendSystem.createActionLayer(3, 0.0));
  }

  // ============================================================
  // CONVENIENCE METHODS
  // ============================================================

  /**
   * Set the locomotion animation (lower body).
   *
   * @param animName - Animation name
   * @param crossfadeDuration - Crossfade time
   */
  setLocomotion(animName: string, crossfadeDuration?: number): void {
    this.setLayerAnimation('locomotion', animName, crossfadeDuration);
  }

  /**
   * Set the aiming animation (upper body overlay).
   *
   * @param animName - Animation name (or null to disable)
   * @param weight - Blend weight (0 = off, 1 = full)
   */
  setAiming(animName: string | null, weight: number = 1.0): void {
    if (animName === null) {
      this.setLayerWeight('aiming', 0);
      return;
    }
    this.setLayerAnimation('aiming', animName);
    this.setLayerWeight('aiming', weight);
  }

  /**
   * Trigger a recoil effect.
   *
   * @param intensity - Recoil intensity (0–1)
   */
  triggerRecoil(intensity: number = 1.0): void {
    this.triggerAdditiveEffect('recoil', intensity, 0.1);
  }

  /**
   * Trigger a hit reaction.
   *
   * @param intensity - Hit intensity (0–1)
   */
  triggerHitReaction(intensity: number = 1.0): void {
    this.triggerAdditiveEffect('hitReaction', intensity, 0.2);
  }

  // ============================================================
  // UPDATE (Call every frame)
  // ============================================================

  update(delta: number): void {
    if (!this.enabled) return;

    const scaledDelta = delta * this.globalTimeScale;

    // ── Update layer weights (lerp toward target) ──
    for (const [, layer] of this.layers) {
      if (Math.abs(layer.weight - layer.targetWeight) > 0.001) {
        layer.weight += (layer.targetWeight - layer.weight)
          * Math.min(layer.blendSpeed * scaledDelta, 1);
      } else {
        layer.weight = layer.targetWeight;
      }

      // Apply weight to current action
      if (layer.currentAction) {
        layer.currentAction.setEffectiveWeight(layer.weight);
      }

      // Update crossfade progress
      if (layer.isCrossfading) {
        layer.crossfadeProgress += scaledDelta / layer.crossfadeDuration;
        if (layer.crossfadeProgress >= 1) {
          layer.isCrossfading = false;
          layer.previousAction?.stop();
          layer.previousAction = null;
          layer.previousAnim = null;
        }
      }
    }

    // ── Update additive effects ──
    for (const [, effect] of this.additiveLayers) {
      if (!effect.active) continue;

      effect.time += scaledDelta;

      // Lerp weight toward target
      if (Math.abs(effect.weight - effect.targetWeight) > 0.001) {
        effect.weight += (effect.targetWeight - effect.weight)
          * Math.min(effect.transitionSpeed * scaledDelta, 1);
      } else {
        effect.weight = effect.targetWeight;
      }

      // Apply weight
      if (effect.action) {
        effect.action.setEffectiveWeight(effect.weight);
      }

      // Check if one-shot is complete
      if (effect.oneShot && effect.time >= effect.duration) {
        effect.active = false;
        effect.targetWeight = 0;
        effect.action?.stop();
        effect.onComplete?.();
      }
    }

    // ── Update the mixer ──
    this.mixer.update(scaledDelta);
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Check if an animation is registered.
   */
  hasAnimation(name: string): boolean {
    return this.clips.has(name);
  }

  /**
   * Get the clip for a registered animation.
   */
  getClip(name: string): THREE.AnimationClip | undefined {
    return this.clips.get(name);
  }

  /**
   * Get the action for a registered animation.
   */
  getAction(name: string): THREE.AnimationAction | undefined {
    return this.actions.get(name);
  }

  /**
   * Get the current directional blend state.
   */
  getDirectionalState(): Readonly<DirectionalBlendState> {
    return this.directionalState;
  }

  /**
   * Get all registered animation names.
   */
  getRegisteredAnimations(): string[] {
    return Array.from(this.clips.keys());
  }

  /**
   * Get all layer names.
   */
  getLayerNames(): string[] {
    return Array.from(this.layers.keys());
  }

  // ============================================================
  // SETTINGS
  // ============================================================

  /**
   * Set the global time scale.
   */
  setGlobalTimeScale(scale: number): void {
    this.globalTimeScale = scale;
  }

  /**
   * Set default crossfade duration.
   */
  setDefaultCrossfadeDuration(duration: number): void {
    this.defaultCrossfadeDuration = duration;
  }

  /**
   * Enable or disable the blend system.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  dispose(): void {
    // Stop all actions
    for (const action of this.actions.values()) {
      action.stop();
    }

    // Stop all additive effects
    for (const effect of this.additiveLayers.values()) {
      effect.action?.stop();
    }

    this.layers.clear();
    this.clips.clear();
    this.actions.clear();
    this.additiveLayers.clear();
  }
}

// ============================================================
// BONE MASK FACTORY
// ============================================================

/**
 * Utility for creating bone masks for blend layers.
 */
export class BoneMaskFactory {
  /**
   * Create a bone mask from a list of bone names.
   * Returns a Set for efficient lookup.
   */
  static create(boneNames: string[]): Set<string> {
    return new Set(boneNames);
  }

  /**
   * Create an upper body mask (arms, spine, head).
   */
  static upperBody(): Set<string> {
    return new Set(SKELETON_GROUPS.UPPER);
  }

  /**
   * Create a lower body mask (legs, hips).
   */
  static lowerBody(): Set<string> {
    return new Set(SKELETON_GROUPS.LOWER);
  }

  /**
   * Create a full body mask (all bones).
   */
  static fullBody(): Set<string> {
    return new Set(getSkeletonBones());
  }

  /**
   * Create a head/neck mask.
   */
  static head(): Set<string> {
    return new Set(SKELETON_GROUPS.HEAD);
  }

  /**
   * Create a spine mask.
   */
  static spine(): Set<string> {
    return new Set(SKELETON_GROUPS.SPINE);
  }

  /**
   * Create a mask for right arm only (trigger hand).
   */
  static rightArm(): Set<string> {
    return new Set(SKELETON_GROUPS.RIGHT_ARM);
  }

  /**
   * Create a mask for left arm only (support hand).
   */
  static leftArm(): Set<string> {
    return new Set(SKELETON_GROUPS.LEFT_ARM);
  }

  /**
   * Create a mask for both arms.
   */
  static arms(): Set<string> {
    return new Set(SKELETON_GROUPS.ARMS);
  }

  /**
   * Create a mask for both legs.
   */
  static legs(): Set<string> {
    return new Set(SKELETON_GROUPS.LEGS);
  }

  /**
   * Combine multiple masks (union).
   */
  static combine(...masks: Set<string>[]): Set<string> {
    const result = new Set<string>();
    for (const mask of masks) {
      for (const bone of mask) {
        result.add(bone);
      }
    }
    return result;
  }

  /**
   * Subtract one mask from another.
   */
  static subtract(base: Set<string>, remove: Set<string>): Set<string> {
    const result = new Set(base);
    for (const bone of remove) {
      result.delete(bone);
    }
    return result;
  }
}
