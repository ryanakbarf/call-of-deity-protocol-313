/**
 * AnimationStateMachine.ts
 * AAA-quality character animation state machine for Call of Deity: Protocol 313
 *
 * Features:
 *   - Full state hierarchy: LOCOMOTION / STANCE / COMBAT / DIRECTIONAL / TRANSITION / DEATH
 *   - 3-layer animation system: Layer 0 (Locomotion), Layer 1 (Upper Body), Layer 2 (Additive)
 *   - Blend parameters: speed, direction, stance, combat with smooth interpolation
 *   - Directional blend tree: forward/backward/left/right/diagonal weight evaluation
 *   - Priority-based state transitions with queuing
 *   - Entry → Loop → Exit animation lifecycle per state
 *   - Smooth crossfade blending with configurable per-transition durations
 *   - State interruption and resolution
 *   - Procedural animation integration (recoil, hit reaction)
 *   - Event system for gameplay synchronization
 *
 * Usage:
 *   const sm = new AnimationStateMachine(mixer);
 *   sm.addAnimation('idle', idleClip);
 *   sm.addAnimation('walk', walkClip);
 *   sm.setState('idle');
 *   // Every frame:
 *   sm.update(delta);
 */

import * as THREE from 'three';
import {
  AnimState,
  AnimStateConfig,
  ANIM_STATE_CONFIGS,
  STATE_PRIORITY,
  StateTransition,
  TRANSITION_DURATIONS,
  getTransitionTable,
  ANIMATION_SPEEDS,
  BlendParameters,
  createDefaultBlendParams,
  computeDirectionalWeights,
  computeSpeedBlend,
  resolveLocomotionState,
  resolveDirectionalState,
  ANIM_LAYERS,
  ANIM_LAYER_CONFIGS,
  AnimLayer,
  AnimLayerConfig,
} from '../config/AnimationConfig';

// ============================================================
// TYPES
// ============================================================

/** All supported animation states — string union for flexibility */
export type AnimationState = string;

/** Phase of a state's animation lifecycle */
export type AnimationPhase = 'none' | 'entry' | 'loop' | 'exit';

/** Configuration for a single animation clip registered with the machine */
export interface AnimationClipConfig {
  name: AnimationState;
  clip: THREE.AnimationClip;
  loop?: THREE.AnimationActionLoopStyles;
  clampWhenFinished?: boolean;
  timeScale?: number;
  weight?: number;
  additive?: boolean;
  /** Which layer this animation belongs to (default: 0) */
  layer?: AnimLayer;
}

/** State machine event */
export interface AnimationEvent {
  type: 'stateChange' | 'transitionStart' | 'transitionEnd' | 'loop' | 'finished' | 'phaseChange' | 'blendUpdate' | 'layerChange';
  from?: AnimationState;
  to?: AnimationState;
  phase?: AnimationPhase;
  action?: THREE.AnimationAction;
  layer?: AnimLayer;
  blendParams?: Partial<BlendParameters>;
}

type EventCallback = (event: AnimationEvent) => void;

/** Internal tracking for a state's entry/loop/exit cycle */
interface StateCycle {
  phase: AnimationPhase;
  phaseTime: number;
  entryDuration: number;
  exitDuration: number;
  entryComplete: boolean;
  exitComplete: boolean;
}

/** Animation playback control options */
export interface PlaybackOptions {
  fadeDuration?: number;
  timeScale?: number;
  loop?: boolean;
  weight?: number;
  layer?: AnimLayer;
}

/** Layer state tracking */
interface LayerState {
  /** Currently active state on this layer */
  currentState: AnimationState;
  /** The active animation action */
  action: THREE.AnimationAction | null;
  /** Phase tracking */
  cycle: StateCycle;
  /** Current blend weight for this layer */
  weight: number;
  /** Target weight (lerping toward this) */
  targetWeight: number;
  /** Blend speed for weight interpolation */
  blendSpeed: number;
}

/** Speed thresholds for locomotion state resolution */
interface SpeedThresholds {
  walk: number;
  run: number;
  sprint: number;
}

// ============================================================
// DEFAULTS
// ============================================================

const DEFAULT_CROSSFADE_DURATION = 0.25;
const DEFAULT_BLEND_SPEED = 8.0;
const DEFAULT_LAYER_BLEND_SPEED = 6.0;

/** Default speed thresholds for state resolution */
const DEFAULT_SPEED_THRESHOLDS: SpeedThresholds = {
  walk: 0.1,
  run: 0.5,
  sprint: 0.85,
};

// ============================================================
// ANIMATION STATE MACHINE CLASS
// ============================================================

export class AnimationStateMachine {
  private mixer: THREE.AnimationMixer;
  private actions: Map<AnimationState, THREE.AnimationAction> = new Map();
  private clips: Map<AnimationState, THREE.AnimationClip> = new Map();
  private transitions: StateTransition[];
  private listeners: Map<string, EventCallback[]> = new Map();

  // ── Layer system (3 layers) ──
  private layers: Map<AnimLayer, LayerState> = new Map();

  // ── Current state tracking (primary — Layer 0) ──
  private currentState: AnimationState = '';
  private previousState: AnimationState = '';

  // ── Transition tracking ──
  private isTransitioning: boolean = false;
  private transitionTime: number = 0;
  private transitionDuration: number = 0;
  private pendingState: AnimationState | null = null;

  // ── Blend parameters ──
  private blendParams: BlendParameters = createDefaultBlendParams();
  private blendParamsTarget: BlendParameters = createDefaultBlendParams();
  private blendParamLerpSpeed: number = 10.0; // Interpolation speed per second

  // ── Speed thresholds ──
  private speedThresholds: SpeedThresholds = { ...DEFAULT_SPEED_THRESHOLDS };

  // ── Entry/exit animation handling ──
  private pendingEntryAction: THREE.AnimationAction | null = null;
  private pendingExitAction: THREE.AnimationAction | null = null;
  private entryPhaseActive: boolean = false;
  private exitPhaseActive: boolean = false;
  private entryPhaseTime: number = 0;
  private exitPhaseTime: number = 0;

  // ── State config cache ──
  private stateConfigs: Map<string, AnimStateConfig> = new Map();

  // ── Global settings ──
  private globalTimeScale: number = 1.0;
  private enabled: boolean = true;

  // ── Playback control history ──
  private playbackHistory: Array<{ state: AnimationState; time: number }> = [];
  private maxHistoryLength: number = 20;

  // ── Auto-resolve: automatically pick locomotion state from blend params ──
  private autoResolveEnabled: boolean = true;

  // ── Death state tracking ──
  private isDead: boolean = false;

  // ════════════════════════════════════════════════════════
  // CONSTRUCTOR
  // ════════════════════════════════════════════════════════

  constructor(mixer: THREE.AnimationMixer, customTransitions?: StateTransition[]) {
    this.mixer = mixer;
    this.transitions = customTransitions || getTransitionTable();

    // Cache state configs
    for (const [key, config] of Object.entries(ANIM_STATE_CONFIGS)) {
      this.stateConfigs.set(key, config);
    }

    // Initialize 3 layers
    for (const layerConfig of ANIM_LAYER_CONFIGS) {
      this.layers.set(layerConfig.index, {
        currentState: '',
        action: null,
        cycle: this.createEmptyCycle(),
        weight: layerConfig.defaultWeight,
        targetWeight: layerConfig.defaultWeight,
        blendSpeed: DEFAULT_LAYER_BLEND_SPEED,
      });
    }

    // Listen for mixer events
    this.mixer.addEventListener('loop', (e: any) => {
      this.emit({ type: 'loop', action: e.action });
    });
    this.mixer.addEventListener('finished', (e: any) => {
      this.emit({ type: 'finished', action: e.action });
      this.onActionFinished(e.action);
    });
  }

  // ============================================================
  // REGISTRATION
  // ============================================================

  /**
   * Register an animation clip with the state machine.
   */
  addAnimation(config: AnimationClipConfig): void;
  addAnimation(name: AnimationState, clip: THREE.AnimationClip, options?: Partial<Omit<AnimationClipConfig, 'name' | 'clip'>>): void;
  addAnimation(
    nameOrConfig: AnimationState | AnimationClipConfig,
    clip?: THREE.AnimationClip,
    options?: Partial<Omit<AnimationClipConfig, 'name' | 'clip'>>
  ): void {
    let config: AnimationClipConfig;

    if (typeof nameOrConfig === 'string') {
      config = {
        name: nameOrConfig,
        clip: clip!,
        ...options,
      };
    } else {
      config = nameOrConfig;
    }

    // Store clip reference
    this.clips.set(config.name, config.clip);

    const action = this.mixer.clipAction(config.clip);

    // Apply configuration
    if (config.loop !== undefined) action.loop = config.loop;
    else action.loop = THREE.LoopRepeat;

    if (config.clampWhenFinished !== undefined) action.clampWhenFinished = config.clampWhenFinished;
    if (config.timeScale !== undefined) {
      action.timeScale = config.timeScale * this.globalTimeScale;
    } else {
      const speed = ANIMATION_SPEEDS[config.name] ?? 1.0;
      action.timeScale = speed * this.globalTimeScale;
    }
    if (config.weight !== undefined) action.setEffectiveWeight(config.weight);

    action.reset();
    action.enabled = true;

    this.actions.set(config.name, action);
  }

  /**
   * Register multiple animations at once.
   */
  addAnimations(configs: AnimationClipConfig[]): void {
    for (const config of configs) {
      this.addAnimation(config);
    }
  }

  /**
   * Add a custom transition rule.
   */
  addTransition(transition: StateTransition): void {
    this.transitions.push(transition);
  }

  /**
   * Remove a transition rule.
   */
  removeTransition(from: AnimationState, to: AnimationState): void {
    this.transitions = this.transitions.filter(
      (t) => !(t.from === from && t.to === to)
    );
  }

  // ============================================================
  // BLEND PARAMETERS
  // ============================================================

  /**
   * Set the current blend parameters (smoothly interpolated).
   * Call this every frame with the latest player input data.
   */
  setBlendParams(params: Partial<BlendParameters>): void {
    Object.assign(this.blendParamsTarget, params);
  }

  /**
   * Set blend parameters immediately (no interpolation).
   */
  setBlendParamsImmediate(params: Partial<BlendParameters>): void {
    Object.assign(this.blendParams, params);
    Object.assign(this.blendParamsTarget, params);
  }

  /**
   * Get the current (interpolated) blend parameters.
   */
  getBlendParams(): Readonly<BlendParameters> {
    return this.blendParams;
  }

  /**
   * Get the target blend parameters (what we're lerping toward).
   */
  getBlendParamsTarget(): Readonly<BlendParameters> {
    return this.blendParamsTarget;
  }

  /**
   * Set the blend parameter interpolation speed.
   */
  setBlendLerpSpeed(speed: number): void {
    this.blendParamLerpSpeed = speed;
  }

  /**
   * Set movement speed blend parameter directly.
   * @param speed 0 = idle, 0.33 = walk, 0.66 = run, 1.0 = sprint
   */
  setSpeed(speed: number): void {
    this.blendParamsTarget.speed = Math.max(0, Math.min(1, speed));
  }

  /**
   * Set movement direction blend parameters.
   * @param moveX -1 = left, 0 = center, 1 = right
   * @param moveY -1 = backward, 0 = idle, 1 = forward
   */
  setDirection(moveX: number, moveY: number): void {
    this.blendParamsTarget.directionX = moveX;
    this.blendParamsTarget.directionY = moveY;

    // Compute directional weights
    const weights = computeDirectionalWeights(moveX, moveY);
    this.blendParamsTarget.forwardWeight = weights.forward;
    this.blendParamsTarget.backwardWeight = weights.backward;
    this.blendParamsTarget.leftWeight = weights.left;
    this.blendParamsTarget.rightWeight = weights.right;
  }

  /**
   * Set stance blend parameter.
   * @param stance 0 = standing, 0.5 = crouching, 1 = prone
   */
  setStance(stance: number): void {
    this.blendParamsTarget.stanceBlend = Math.max(0, Math.min(1, stance));
  }

  /**
   * Set combat blend parameter.
   * @param combat 0 = hip fire / no weapon, 1 = ADS
   */
  setCombat(combat: number): void {
    this.blendParamsTarget.combatBlend = Math.max(0, Math.min(1, combat));
  }

  /**
   * Set turn angle for turn transition detection.
   * @param angle Degrees: negative = left, positive = right
   */
  setTurnAngle(angle: number): void {
    this.blendParamsTarget.turnAngle = angle;
  }

  /**
   * Set recoil intensity for additive layer.
   */
  setRecoilIntensity(intensity: number): void {
    this.blendParamsTarget.recoilIntensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Set hit reaction intensity for additive layer.
   */
  setHitIntensity(intensity: number): void {
    this.blendParamsTarget.hitIntensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Enable/disable automatic locomotion state resolution from blend params.
   */
  setAutoResolve(enabled: boolean): void {
    this.autoResolveEnabled = enabled;
  }

  /**
   * Set speed thresholds for automatic state resolution.
   */
  setSpeedThresholds(thresholds: Partial<SpeedThresholds>): void {
    Object.assign(this.speedThresholds, thresholds);
  }

  // ============================================================
  // STATE MANAGEMENT
  // ============================================================

  /**
   * Transition to a new animation state.
   * If a transition is in progress, the new state is queued.
   *
   * Handles entry/loop/exit animation phases,
   * priority-based resolution, and smooth crossfading.
   */
  setState(state: AnimationState, force: boolean = false): void {
    if (!this.enabled) return;

    // Skip if already in this state
    if (state === this.currentState && !force) return;

    // Death is terminal — block all transitions out unless force or respawn
    if (this.isDead && state !== AnimState.IDLE && !force) return;

    // If state doesn't exist, try to find a fallback
    if (!this.actions.has(state)) {
      const baseState = this.findBaseState(state);
      if (baseState && this.actions.has(baseState)) {
        state = baseState;
      } else {
        console.warn(`[AnimationStateMachine] State "${state}" not registered`);
        return;
      }
    }

    // Check priority — don't allow lower-priority state to interrupt higher
    if (!force && this.currentState) {
      const currentPriority = STATE_PRIORITY[this.currentState] ?? 0;
      const newPriority = STATE_PRIORITY[state] ?? 0;
      if (newPriority < currentPriority) {
        this.pendingState = state;
        return;
      }
    }

    // If currently transitioning, queue the new state
    if (this.isTransitioning && !force) {
      this.pendingState = state;
      return;
    }

    // Find transition duration
    const transition = this.findTransition(this.currentState, state);
    const duration = transition?.duration ?? DEFAULT_CROSSFADE_DURATION;
    const useEntry = transition?.useEntry ?? true;
    const useExit = transition?.useExit ?? false;

    // Perform transition
    this.performTransition(state, duration, useEntry, useExit);
  }

  /**
   * Force an immediate state change (no crossfade).
   */
  forceState(state: AnimationState): void {
    this.setState(state, true);
  }

  /**
   * Get current state name.
   */
  getState(): AnimationState {
    return this.currentState;
  }

  /**
   * Get previous state name.
   */
  getPreviousState(): AnimationState {
    return this.previousState;
  }

  /**
   * Check if a state is registered.
   */
  hasState(state: AnimationState): boolean {
    return this.actions.has(state);
  }

  /**
   * Check if a transition is currently in progress.
   */
  isTransitioningState(): boolean {
    return this.isTransitioning;
  }

  /**
   * Get the current animation phase (entry/loop/exit).
   */
  getCurrentPhase(): AnimationPhase {
    const layer0 = this.layers.get(0);
    return layer0?.cycle.phase ?? 'none';
  }

  /**
   * Get the current phase progress (0-1).
   */
  getPhaseProgress(): number {
    const layer0 = this.layers.get(0);
    if (!layer0) return 0;

    switch (layer0.cycle.phase) {
      case 'entry':
        if (layer0.cycle.entryDuration > 0) {
          return Math.min(this.entryPhaseTime / layer0.cycle.entryDuration, 1);
        }
        return 1;
      case 'exit':
        if (layer0.cycle.exitDuration > 0) {
          return Math.min(this.exitPhaseTime / layer0.cycle.exitDuration, 1);
        }
        return 1;
      case 'loop':
        return this.getProgress();
      default:
        return 0;
    }
  }

  /**
   * Check if the player is dead (terminal state).
   */
  isPlayerDead(): boolean {
    return this.isDead;
  }

  // ============================================================
  // LAYER MANAGEMENT
  // ============================================================

  /**
   * Get a layer state by index.
   */
  getLayer(layer: AnimLayer): LayerState | undefined {
    return this.layers.get(layer);
  }

  /**
   * Get the currently active state on a specific layer.
   */
  getLayerState(layer: AnimLayer): AnimationState {
    return this.layers.get(layer)?.currentState ?? '';
  }

  /**
   * Set the weight of an animation layer.
   * @param layer Layer index (0, 1, 2)
   * @param weight Target weight (0–1)
   * @param blendTime Time to interpolate to target weight
   */
  setLayerWeight(layer: AnimLayer, weight: number, blendTime: number = 0.2): void {
    const layerState = this.layers.get(layer);
    if (layerState) {
      layerState.targetWeight = Math.max(0, Math.min(1, weight));
      layerState.blendSpeed = blendTime > 0 ? 1.0 / blendTime : 100.0;
    }
  }

  /**
   * Get the current weight of an animation layer.
   */
  getLayerWeight(layer: AnimLayer): number {
    return this.layers.get(layer)?.weight ?? 0;
  }

  /**
   * Set an animation on a specific layer.
   * Layer 0: Full body locomotion
   * Layer 1: Upper body weapon overlay
   * Layer 2: Additive effects
   */
  setLayerState(layer: AnimLayer, state: AnimationState, duration: number = 0.2): void {
    if (!this.actions.has(state)) {
      console.warn(`[AnimationStateMachine] State "${state}" not registered`);
      return;
    }

    const layerState = this.layers.get(layer);
    if (!layerState) return;

    const oldAction = layerState.action;
    const newAction = this.actions.get(state)!;

    // Store previous state for this layer
    const oldState = layerState.currentState;
    layerState.currentState = state;

    if (duration <= 0 || !oldAction) {
      // Instant switch
      newAction.reset();
      newAction.enabled = true;
      newAction.setEffectiveWeight(layerState.weight);
      newAction.play();

      if (oldAction && oldAction !== newAction) {
        oldAction.stop();
      }

      layerState.action = newAction;
      layerState.cycle = { ...this.createEmptyCycle(), phase: 'loop' };

      this.emit({ type: 'layerChange', from: oldState, to: state, layer });
    } else {
      // Crossfade
      newAction.reset();
      newAction.enabled = true;
      newAction.setEffectiveWeight(0);
      newAction.play();

      oldAction?.crossFadeTo(newAction, duration, true);

      layerState.action = newAction;
      layerState.cycle = { ...this.createEmptyCycle(), phase: 'loop' };
    }
  }

  /**
   * Set the secondary (Layer 1) animation state (upper body overlay).
   */
  setSecondaryState(state: AnimationState): void {
    this.setLayerState(1, state);
    this.setLayerWeight(1, 1.0, 0.2);
  }

  /**
   * Stop the secondary layer (Layer 1).
   */
  stopSecondaryLayer(): void {
    const layer1 = this.layers.get(1);
    if (layer1?.action) {
      layer1.action.stop();
      layer1.action = null;
      layer1.currentState = '';
    }
    this.setLayerWeight(1, 0, 0.2);
  }

  /**
   * Set the additive (Layer 2) animation state.
   */
  setAdditiveState(state: AnimationState, weight: number = 1.0): void {
    if (!this.actions.has(state)) return;

    const action = this.actions.get(state)!;
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(weight);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.play();

    const layer2 = this.layers.get(2);
    if (layer2) {
      layer2.action = action;
      layer2.currentState = state;
      layer2.weight = weight;
      layer2.targetWeight = weight;
    }
  }

  // ============================================================
  // TRANSITION LOGIC
  // ============================================================

  /**
   * Find a matching transition rule.
   */
  private findTransition(from: AnimationState, to: AnimationState): StateTransition | undefined {
    // Find exact match
    const exact = this.transitions.find((t) => t.from === from && t.to === to);
    if (exact) return exact;

    // Find wildcard (from: '*' matches any source)
    return this.transitions.find((t) => t.from === '*' && t.to === to);
  }

  /**
   * Find the base state name by stripping suffixes.
   */
  private findBaseState(state: AnimationState): AnimationState | null {
    const suffixes = ['Entry', 'Exit', 'entry', 'exit'];
    for (const suffix of suffixes) {
      if (state.endsWith(suffix)) {
        const base = state.slice(0, -suffix.length);
        if (this.actions.has(base)) return base;
      }
    }
    return null;
  }

  /**
   * Create an empty state cycle.
   */
  private createEmptyCycle(): StateCycle {
    return {
      phase: 'none',
      phaseTime: 0,
      entryDuration: 0,
      exitDuration: 0,
      entryComplete: false,
      exitComplete: false,
    };
  }

  /**
   * Perform the actual state transition with entry/loop/exit handling.
   */
  private performTransition(
    newState: AnimationState,
    duration: number,
    useEntry: boolean = true,
    useExit: boolean = false
  ): void {
    const layer0 = this.layers.get(0)!;
    const oldAction = layer0.action;
    const newAction = this.actions.get(newState)!;

    // Record playback history
    this.recordPlayback(newState);

    // Store previous state
    this.previousState = this.currentState;
    this.currentState = newState;

    // Track death state
    if (newState.startsWith('death') || newState === AnimState.DEATH) {
      this.isDead = true;
    }

    // Get state config for entry/exit clip names
    const config = this.stateConfigs.get(newState);
    const entryClipName = config?.clips.entry;
    const exitClipName = config?.clips.exit;

    // ── Phase 1: Exit animation from previous state ──
    if (useExit && exitClipName && oldAction) {
      const exitAction = this.actions.get(exitClipName);
      if (exitAction) {
        this.startExitPhase(exitAction, oldAction, duration);
      }
    }

    // ── Phase 2: Entry animation into new state ──
    if (useEntry && entryClipName && duration > 0) {
      const entryAction = this.actions.get(entryClipName);
      if (entryAction) {
        this.startEntryPhase(entryAction, newAction, duration);
        return; // Entry phase will transition to loop when complete
      }
    }

    // ── No entry animation — go straight to loop ──
    this.performLoopTransition(newAction, oldAction, duration);
  }

  /**
   * Start the entry animation phase.
   */
  private startEntryPhase(
    entryAction: THREE.AnimationAction,
    loopAction: THREE.AnimationAction,
    duration: number
  ): void {
    const layer0 = this.layers.get(0)!;

    // Reset and configure entry action
    entryAction.reset();
    entryAction.enabled = true;
    entryAction.setEffectiveWeight(1);
    entryAction.setLoop(THREE.LoopOnce, 1);
    entryAction.clampWhenFinished = true;

    const speed = ANIMATION_SPEEDS[entryAction.getClip().name] ?? 1.0;
    entryAction.timeScale = speed * this.globalTimeScale;

    entryAction.play();

    // Configure loop action to fade in
    loopAction.reset();
    loopAction.enabled = true;
    loopAction.setEffectiveWeight(0);
    loopAction.play();

    // Crossfade from old state to entry
    if (layer0.action) {
      layer0.action.crossFadeTo(entryAction, Math.min(duration * 0.5, 0.15), true);
    }

    // Update layer 0
    layer0.action = loopAction;
    layer0.weight = 1;
    layer0.targetWeight = 1;
    layer0.cycle = this.createEmptyCycle();

    // Track entry phase
    this.entryPhaseActive = true;
    this.entryPhaseTime = 0;
    this.pendingEntryAction = entryAction;
    this.pendingExitAction = null;

    // Set entry phase on cycle
    layer0.cycle.phase = 'entry';
    layer0.cycle.entryDuration = entryAction.getClip().duration / speed;

    this.emit({ type: 'phaseChange', from: this.previousState, to: this.currentState, phase: 'entry' });
  }

  /**
   * Start the exit animation phase.
   */
  private startExitPhase(
    exitAction: THREE.AnimationAction,
    oldAction: THREE.AnimationAction,
    duration: number
  ): void {
    exitAction.reset();
    exitAction.enabled = true;
    exitAction.setEffectiveWeight(0);
    exitAction.setLoop(THREE.LoopOnce, 1);
    exitAction.clampWhenFinished = true;

    const speed = ANIMATION_SPEEDS[exitAction.getClip().name] ?? 1.0;
    exitAction.timeScale = speed * this.globalTimeScale;

    exitAction.play();

    oldAction.crossFadeTo(exitAction, Math.min(duration * 0.3, 0.1), true);

    this.exitPhaseActive = true;
    this.exitPhaseTime = 0;
    this.pendingExitAction = exitAction;

    this.emit({ type: 'phaseChange', from: this.previousState, to: this.currentState, phase: 'exit' });
  }

  /**
   * Perform the loop transition (crossfade from old to new loop animation).
   */
  private performLoopTransition(
    newAction: THREE.AnimationAction,
    oldAction: THREE.AnimationAction | null,
    duration: number
  ): void {
    const layer0 = this.layers.get(0)!;

    // Configure new action
    newAction.reset();

    if (duration <= 0 || !oldAction) {
      // Instant transition
      newAction.setEffectiveWeight(1);
      newAction.play();

      if (oldAction) {
        oldAction.stop();
      }

      layer0.action = newAction;
      layer0.weight = 1;
      layer0.targetWeight = 1;
      layer0.cycle = { ...this.createEmptyCycle(), phase: 'loop' };

      this.isTransitioning = false;
      this.emit({ type: 'stateChange', from: this.previousState, to: this.currentState });
    } else {
      // Crossfade transition
      this.isTransitioning = true;
      this.transitionTime = 0;
      this.transitionDuration = duration;

      newAction.setEffectiveWeight(0);
      newAction.play();

      oldAction.crossFadeTo(newAction, duration, true);

      layer0.action = newAction;
      layer0.weight = 0;
      layer0.targetWeight = 1;
      layer0.cycle = { ...this.createEmptyCycle(), phase: 'loop' };

      this.emit({ type: 'transitionStart', from: this.previousState, to: this.currentState });
    }

    this.entryPhaseActive = false;
    this.exitPhaseActive = false;
    this.pendingEntryAction = null;
    this.pendingExitAction = null;
  }

  /**
   * Handle an animation action finishing (one-shot clips).
   */
  private onActionFinished(action: THREE.AnimationAction): void {
    // Check if this was the entry animation
    if (this.entryPhaseActive && this.pendingEntryAction === action) {
      this.entryPhaseActive = false;
      this.pendingEntryAction = null;

      const layer0 = this.layers.get(0)!;
      const loopAction = layer0.action;
      if (loopAction) {
        action.crossFadeTo(loopAction, 0.15, true);
        loopAction.setEffectiveWeight(1);
      }

      layer0.cycle.phase = 'loop';
      layer0.cycle.entryComplete = true;

      this.emit({ type: 'phaseChange', from: this.previousState, to: this.currentState, phase: 'loop' });
    }

    // Check if this was the exit animation
    if (this.exitPhaseActive && this.pendingExitAction === action) {
      this.exitPhaseActive = false;
      this.pendingExitAction = null;

      const layer0 = this.layers.get(0)!;
      layer0.cycle.phase = 'loop';
      layer0.cycle.exitComplete = true;
    }
  }

  // ============================================================
  // UPDATE (Call every frame)
  // ============================================================

  update(delta: number): void {
    if (!this.enabled) return;

    // ── Interpolate blend parameters ──
    this.updateBlendParams(delta);

    // ── Auto-resolve locomotion state from blend parameters ──
    if (this.autoResolveEnabled && !this.isDead) {
      this.autoResolveState();
    }

    // ── Update layer weights ──
    this.updateLayerWeights(delta);

    // ── Update additive layer intensity ──
    this.updateAdditiveLayer(delta);

    // ── Update transition tracking ──
    if (this.isTransitioning) {
      this.transitionTime += delta;

      if (this.transitionTime >= this.transitionDuration) {
        this.isTransitioning = false;
        this.transitionTime = 0;

        // Stop the old action
        if (this.previousState) {
          const oldAction = this.actions.get(this.previousState);
          const layer0 = this.layers.get(0);
          if (oldAction && oldAction !== layer0?.action) {
            oldAction.stop();
          }
        }

        this.emit({ type: 'transitionEnd', from: this.previousState, to: this.currentState });

        // Process queued state
        if (this.pendingState !== null) {
          const queued = this.pendingState;
          this.pendingState = null;
          this.setState(queued);
        }
      }
    }

    // ── Update entry phase ──
    if (this.entryPhaseActive) {
      this.entryPhaseTime += delta;
    }

    // ── Update exit phase ──
    if (this.exitPhaseActive) {
      this.exitPhaseTime += delta;
    }

    // ── Update the mixer (drives all animations) ──
    this.mixer.update(delta);
  }

  /**
   * Interpolate blend parameters toward their targets.
   */
  private updateBlendParams(delta: number): void {
    const lerpFactor = Math.min(1, this.blendParamLerpSpeed * delta);

    this.blendParams.speed = THREE.MathUtils.lerp(this.blendParams.speed, this.blendParamsTarget.speed, lerpFactor);
    this.blendParams.directionX = THREE.MathUtils.lerp(this.blendParams.directionX, this.blendParamsTarget.directionX, lerpFactor);
    this.blendParams.directionY = THREE.MathUtils.lerp(this.blendParams.directionY, this.blendParamsTarget.directionY, lerpFactor);
    this.blendParams.forwardWeight = THREE.MathUtils.lerp(this.blendParams.forwardWeight, this.blendParamsTarget.forwardWeight, lerpFactor);
    this.blendParams.backwardWeight = THREE.MathUtils.lerp(this.blendParams.backwardWeight, this.blendParamsTarget.backwardWeight, lerpFactor);
    this.blendParams.leftWeight = THREE.MathUtils.lerp(this.blendParams.leftWeight, this.blendParamsTarget.leftWeight, lerpFactor);
    this.blendParams.rightWeight = THREE.MathUtils.lerp(this.blendParams.rightWeight, this.blendParamsTarget.rightWeight, lerpFactor);
    this.blendParams.stanceBlend = THREE.MathUtils.lerp(this.blendParams.stanceBlend, this.blendParamsTarget.stanceBlend, lerpFactor);
    this.blendParams.combatBlend = THREE.MathUtils.lerp(this.blendParams.combatBlend, this.blendParamsTarget.combatBlend, lerpFactor);
    this.blendParams.turnAngle = THREE.MathUtils.lerp(this.blendParams.turnAngle, this.blendParamsTarget.turnAngle, lerpFactor);
    this.blendParams.recoilIntensity = THREE.MathUtils.lerp(this.blendParams.recoilIntensity, this.blendParamsTarget.recoilIntensity, lerpFactor);
    this.blendParams.hitIntensity = THREE.MathUtils.lerp(this.blendParams.hitIntensity, this.blendParamsTarget.hitIntensity, lerpFactor);
  }

  /**
   * Auto-resolve the locomotion state based on current blend parameters.
   * This implements the automatic state selection logic:
   *   - Speed → idle / walk / run / sprint
   *   - Direction → directional variants
   *   - Stance → standing / crouching / prone
   *   - Combat → ADS overlay on upper body
   */
  private autoResolveState(): void {
    const params = this.blendParams;

    // ── Determine base locomotion state from speed ──
    const baseLocomotion = resolveLocomotionState(params.speed, this.speedThresholds);

    // ── Apply directional variant ──
    let targetLocomotion = baseLocomotion;
    if (params.speed > 0.05) {
      // Only resolve direction when moving
      targetLocomotion = resolveDirectionalState(
        baseLocomotion,
        params.directionX,
        params.directionY,
      );
    }

    // ── Apply stance override ──
    let targetState = targetLocomotion;
    if (params.stanceBlend >= 0.75) {
      // Prone
      targetState = params.speed > 0.05 ? AnimState.PRONE_CRAWL : AnimState.PRONE_IDLE;
    } else if (params.stanceBlend >= 0.25) {
      // Crouching
      targetState = params.speed > 0.05 ? AnimState.CROUCH_WALK : AnimState.CROUCH_IDLE;
    }

    // ── Apply combat overlay (Layer 1, not full body override) ──
    if (params.combatBlend > 0.5) {
      // ADS active — use rifle locomotion variants on Layer 0
      if (params.stanceBlend >= 0.25 && params.stanceBlend < 0.75) {
        targetState = AnimState.RIFLE_CROUCH_IDLE;
      } else if (params.speed > 0.05) {
        targetState = params.speed >= this.speedThresholds.run
          ? AnimState.RIFLE_RUN
          : AnimState.RIFLE_WALK;
      } else {
        targetState = AnimState.RIFLE_IDLE;
      }

      // Blend in upper body layer
      this.setLayerWeight(1, params.combatBlend, 0.2);
    } else {
      // No ADS — blend out upper body layer
      this.setLayerWeight(1, 0, 0.3);
    }

    // ── Transition to resolved state ──
    if (targetState !== this.currentState) {
      this.setState(targetState);
    }

    // ── Update animation playback speed based on velocity ──
    const currentAction = this.layers.get(0)?.action;
    if (currentAction && this.currentState) {
      const baseSpeed = ANIMATION_SPEEDS[this.currentState] ?? 1.0;
      // Scale speed by blend param for smooth acceleration feel
      const speedMult = THREE.MathUtils.lerp(0.8, 1.2, params.speed);
      currentAction.timeScale = baseSpeed * speedMult * this.globalTimeScale;
    }
  }

  /**
   * Update layer weights (smooth interpolation).
   */
  private updateLayerWeights(delta: number): void {
    for (const [layerIndex, layerState] of this.layers) {
      if (Math.abs(layerState.weight - layerState.targetWeight) > 0.001) {
        const speed = layerState.blendSpeed;
        layerState.weight += (layerState.targetWeight - layerState.weight) * speed * delta;
      } else {
        layerState.weight = layerState.targetWeight;
      }

      // Apply weight to action
      if (layerState.action) {
        layerState.action.setEffectiveWeight(layerState.weight);
      }
    }
  }

  /**
   * Update the additive layer based on procedural parameters.
   */
  private updateAdditiveLayer(delta: number): void {
    const layer2 = this.layers.get(2);
    if (!layer2) return;

    const params = this.blendParams;

    // Recoil: blend in while firing, decay when not
    if (params.recoilIntensity > 0.01) {
      if (layer2.action) {
        layer2.weight = params.recoilIntensity;
      }
    } else if (params.hitIntensity > 0.01) {
      // Hit reaction takes priority over recoil on additive layer
      if (layer2.action) {
        layer2.weight = params.hitIntensity;
      }
    } else {
      // Decay additive layer
      layer2.weight *= 0.9; // Quick decay
      if (layer2.weight < 0.01) {
        layer2.weight = 0;
        if (layer2.action) {
          layer2.action.stop();
          layer2.action = null;
        }
      }
    }

    if (layer2.action) {
      layer2.action.setEffectiveWeight(layer2.weight);
    }
  }

  // ============================================================
  // ANIMATION PLAYBACK CONTROLS
  // ============================================================

  /**
   * Play an animation by name with optional crossfade.
   */
  play(name: AnimationState, options?: PlaybackOptions): void {
    if (!this.actions.has(name)) {
      console.warn(`[AnimationStateMachine] Cannot play "${name}": not registered`);
      return;
    }

    const fadeDuration = options?.fadeDuration ?? DEFAULT_CROSSFADE_DURATION;

    if (options?.timeScale !== undefined) {
      this.setTimeScale(name, options.timeScale);
    }

    if (options?.loop !== undefined) {
      const action = this.actions.get(name)!;
      action.loop = options.loop ? THREE.LoopRepeat : THREE.LoopOnce;
      action.clampWhenFinished = !options.loop;
    }

    // Route to appropriate layer
    if (options?.layer !== undefined) {
      this.setLayerState(options.layer, name, fadeDuration);
      return;
    }

    if (name === this.currentState) {
      this.setState(name, true);
    } else {
      const oldTransition = this.findTransition(this.currentState, name);
      if (oldTransition) {
        oldTransition.duration = fadeDuration;
      }
      this.setState(name);
    }
  }

  /**
   * Blend between current and next animation over a specified duration.
   */
  blendTo(
    targetState: AnimationState,
    duration: number = DEFAULT_CROSSFADE_DURATION,
    weight: number = 1
  ): void {
    if (!this.actions.has(targetState)) {
      console.warn(`[AnimationStateMachine] Cannot blend to "${targetState}": not registered`);
      return;
    }

    const targetAction = this.actions.get(targetState)!;
    const layer0 = this.layers.get(0)!;
    const currentAction = layer0.action;

    if (!currentAction || currentAction === targetAction) {
      this.setState(targetState);
      return;
    }

    targetAction.reset();
    targetAction.enabled = true;
    targetAction.setEffectiveWeight(0);
    targetAction.play();

    currentAction.crossFadeTo(targetAction, duration, true);

    layer0.action = targetAction;
    layer0.weight = 0;
    layer0.targetWeight = weight;
    layer0.cycle = { ...this.createEmptyCycle(), phase: 'loop' };

    this.previousState = this.currentState;
    this.currentState = targetState;
    this.isTransitioning = true;
    this.transitionTime = 0;
    this.transitionDuration = duration;

    this.emit({ type: 'transitionStart', from: this.previousState, to: this.currentState });
  }

  /**
   * Set the playback speed for a specific animation.
   */
  setPlaybackSpeed(state: AnimationState, speed: number): void {
    const action = this.actions.get(state);
    if (action) {
      action.timeScale = speed * this.globalTimeScale;
    }
  }

  /**
   * Get the current playback speed for an animation.
   */
  getPlaybackSpeed(state: AnimationState): number {
    const action = this.actions.get(state);
    return action ? action.timeScale / this.globalTimeScale : 0;
  }

  /**
   * Pause the current animation.
   */
  pause(): void {
    this.globalTimeScale = 0;
    for (const action of this.actions.values()) {
      action.timeScale = 0;
    }
  }

  /**
   * Resume playback at normal speed.
   */
  resume(): void {
    this.globalTimeScale = 1.0;
    for (const [name, action] of this.actions) {
      const speed = ANIMATION_SPEEDS[name] ?? 1.0;
      action.timeScale = speed;
    }
  }

  /**
   * Check if an animation is currently playing.
   */
  isPlaying(state: AnimationState): boolean {
    const action = this.actions.get(state);
    return action ? action.isRunning() : false;
  }

  /**
   * Get the current animation progress (0–1) for a specific state.
   */
  getAnimationProgress(state?: AnimationState): number {
    const action = state
      ? this.actions.get(state)
      : this.layers.get(0)?.action;

    if (!action) return 0;

    const clip = action.getClip();
    const duration = clip.duration;
    const time = action.time;

    return (time % duration) / duration;
  }

  /**
   * Set the animation to a specific point in its timeline.
   */
  seekTo(state: AnimationState, normalizedTime: number): void {
    const action = this.actions.get(state);
    if (action) {
      const clip = action.getClip();
      action.time = normalizedTime * clip.duration;
    }
  }

  /**
   * Get the duration of an animation clip in seconds.
   */
  getAnimationDuration(state: AnimationState): number {
    const clip = this.clips.get(state);
    return clip ? clip.duration : 0;
  }

  /**
   * Get all registered animation state names.
   */
  getRegisteredStates(): AnimationState[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Get the playback history.
   */
  getPlaybackHistory(count: number = 10): Array<{ state: AnimationState; time: number }> {
    return this.playbackHistory.slice(-count);
  }

  /**
   * Record a state transition to the playback history.
   */
  private recordPlayback(state: AnimationState): void {
    this.playbackHistory.push({ state, time: performance.now() });
    if (this.playbackHistory.length > this.maxHistoryLength) {
      this.playbackHistory.shift();
    }
  }

  // ============================================================
  // CONTROLS (Legacy/Compatibility)
  // ============================================================

  /**
   * Set the global time scale (affects all registered animations).
   */
  setGlobalTimeScale(scale: number): void {
    this.globalTimeScale = scale;
    for (const action of this.actions.values()) {
      action.timeScale = scale;
    }
  }

  /**
   * Set time scale for a specific animation state.
   */
  setTimeScale(state: AnimationState, scale: number): void {
    const action = this.actions.get(state);
    if (action) {
      action.timeScale = scale * this.globalTimeScale;
    }
  }

  /**
   * Enable or disable the state machine.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      for (const action of this.actions.values()) {
        action.stop();
      }
    }
  }

  /**
   * Get the current animation action (primary layer).
   */
  getCurrentAction(): THREE.AnimationAction | null {
    return this.layers.get(0)?.action ?? null;
  }

  /**
   * Get the action for a specific state.
   */
  getAction(state: AnimationState): THREE.AnimationAction | undefined {
    return this.actions.get(state);
  }

  /**
   * Get animation progress (0-1) for the current state.
   */
  getProgress(): number {
    return this.getAnimationProgress();
  }

  /**
   * Get normalized time (0-1) of the current loop.
   */
  getNormalizedTime(): number {
    const action = this.layers.get(0)?.action;
    if (!action) return 0;
    const clip = action.getClip();
    return action.time / clip.duration;
  }

  /**
   * Get the mixer's time (total elapsed animation time).
   */
  getTime(): number {
    return this.mixer.time;
  }

  // ============================================================
  // SECONDARY LAYER (Legacy Compatibility)
  // ============================================================

  /**
   * Set the secondary animation layer weight.
   */
  setSecondaryWeight(weight: number): void {
    this.setLayerWeight(1, weight);
  }

  /**
   * Get current secondary layer blend weight.
   */
  getSecondaryWeight(): number {
    return this.getLayerWeight(1);
  }

  // ============================================================
  // STATE QUERY HELPERS
  // ============================================================

  /**
   * Get the state config for the current state.
   */
  getCurrentStateConfig(): AnimStateConfig | undefined {
    return this.stateConfigs.get(this.currentState);
  }

  /**
   * Get the ground offset (stance height) for the current state.
   */
  getCurrentGroundOffset(): number {
    const config = this.getCurrentStateConfig();
    return config?.groundOffset ?? 1.7;
  }

  /**
   * Get the movement speed multiplier for the current state.
   */
  getCurrentMoveSpeedMult(): number {
    const config = this.getCurrentStateConfig();
    return config?.moveSpeedMult ?? 0;
  }

  /**
   * Check if the current state is interruptible.
   */
  isCurrentStateInterruptible(): boolean {
    const config = this.getCurrentStateConfig();
    return config?.interruptible ?? true;
  }

  /**
   * Get the priority of the current state.
   */
  getCurrentPriority(): number {
    return STATE_PRIORITY[this.currentState] ?? 0;
  }

  /**
   * Get the priority of a given state.
   */
  getPriority(state: AnimationState): number {
    return STATE_PRIORITY[state] ?? 0;
  }

  /**
   * Check if a state can transition to another state.
   */
  canTransition(from: AnimationState, to: AnimationState): boolean {
    const transition = this.findTransition(from, to);
    if (!transition) return false;

    if (transition.condition) {
      return transition.condition();
    }

    return true;
  }

  /**
   * Get the blend parameters as a snapshot for debugging.
   */
  getBlendSnapshot(): {
    speed: number;
    directionX: number;
    stanceBlend: number;
    combatBlend: number;
    currentState: string;
    layerWeights: number[];
  } {
    return {
      speed: this.blendParams.speed,
      directionX: this.blendParams.directionX,
      stanceBlend: this.blendParams.stanceBlend,
      combatBlend: this.blendParams.combatBlend,
      currentState: this.currentState,
      layerWeights: [
        this.getLayerWeight(0),
        this.getLayerWeight(1),
        this.getLayerWeight(2),
      ],
    };
  }

  // ============================================================
  // DEATH MANAGEMENT
  // ============================================================

  /**
   * Trigger death animation based on damage direction.
   * @param hitAngle Angle from which the hit came (radians)
   * @param isHeadshot Whether it was a headshot
   * @param isCrouched Whether the player was crouched
   */
  triggerDeath(hitAngle: number, isHeadshot: boolean = false, isCrouched: boolean = false): void {
    this.isDead = true;

    // Determine death variant based on hit angle
    let deathState: AnimState;

    if (isHeadshot) {
      deathState = AnimState.DEATH_HEADSHOT;
    } else if (isCrouched) {
      deathState = AnimState.DEATH_CROUCH_FRONT;
    } else {
      // Normalize angle to [0, 2π)
      const normalizedAngle = ((hitAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      if (normalizedAngle >= Math.PI * 0.75 && normalizedAngle <= Math.PI * 1.25) {
        deathState = AnimState.DEATH_FRONT;
      } else if (normalizedAngle >= Math.PI * 1.25 || normalizedAngle <= Math.PI * 0.25) {
        deathState = AnimState.DEATH_BACK;
      } else if (normalizedAngle > Math.PI * 0.25 && normalizedAngle < Math.PI * 0.75) {
        deathState = AnimState.DEATH_RIGHT;
      } else {
        deathState = AnimState.DEATH_LEFT;
      }
    }

    this.setState(deathState, true);
  }

  /**
   * Reset death state (for respawn).
   */
  resetDeath(): void {
    this.isDead = false;
    this.setState(AnimState.IDLE, true);
  }

  /**
   * Trigger a hit reaction based on damage direction.
   */
  triggerHitReaction(hitAngle: number): void {
    if (this.isDead) return;

    const normalizedAngle = ((hitAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let hitState: AnimState;

    if (normalizedAngle >= Math.PI * 0.75 && normalizedAngle <= Math.PI * 1.25) {
      hitState = AnimState.HIT_FRONT;
    } else if (normalizedAngle >= Math.PI * 1.25 || normalizedAngle <= Math.PI * 0.25) {
      hitState = AnimState.HIT_BACK;
    } else if (normalizedAngle > Math.PI * 0.25 && normalizedAngle < Math.PI * 0.75) {
      hitState = AnimState.HIT_RIGHT;
    } else {
      hitState = AnimState.HIT_LEFT;
    }

    this.setState(hitState, true);
  }

  // ============================================================
  // EVENT SYSTEM
  // ============================================================

  /**
   * Subscribe to all events.
   */
  on(callback: EventCallback): () => void {
    const key = '*';
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(callback);

    return () => {
      const list = this.listeners.get(key);
      if (list) {
        const idx = list.indexOf(callback);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  /**
   * Subscribe to state-specific events.
   */
  onStateChange(state: AnimationState, callback: () => void): () => void {
    const key = `state:${state}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(() => callback());

    return () => {
      const list = this.listeners.get(key);
      if (list) {
        const idx = list.indexOf(callback as any);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  /**
   * Subscribe to phase-specific events.
   */
  onPhaseChange(phase: AnimationPhase, callback: () => void): () => void {
    const key = `phase:${phase}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(() => callback());

    return () => {
      const list = this.listeners.get(key);
      if (list) {
        const idx = list.indexOf(callback as any);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  private emit(event: AnimationEvent): void {
    // Wildcard listeners
    const wildcards = this.listeners.get('*');
    if (wildcards) {
      for (const cb of wildcards) {
        cb(event);
      }
    }

    // State-specific listeners
    if (event.type === 'stateChange' && event.to) {
      const stateListeners = this.listeners.get(`state:${event.to}`);
      if (stateListeners) {
        for (const cb of stateListeners) {
          cb(event);
        }
      }
    }

    // Phase-specific listeners
    if (event.type === 'phaseChange' && event.phase) {
      const phaseListeners = this.listeners.get(`phase:${event.phase}`);
      if (phaseListeners) {
        for (const cb of phaseListeners) {
          cb(event);
        }
      }
    }
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  dispose(): void {
    for (const action of this.actions.values()) {
      action.stop();
      this.mixer.uncacheAction(action.getClip());
    }
    this.actions.clear();
    this.clips.clear();
    this.listeners.clear();
    this.layers.clear();
    this.pendingEntryAction = null;
    this.pendingExitAction = null;
    this.playbackHistory = [];
  }
}
