/**
 * AnimationStateMachine.ts
 * Character animation state machine for Call of Deity: Protocol 313
 *
 * Features:
 *   - Clear state hierarchy and priority-based transitions
 *   - Entry → Loop → Exit animation cycle per state
 *   - Smooth crossfade blending with configurable durations
 *   - Blend tree support for layered upper/lower body animation
 *   - State interruption and queuing
 *   - Animation playback controls (play, blend, loop/one-shot)
 *   - Procedural animation integration
 *   - Event system for gameplay synchronization
 *
 * Usage:
 *   const sm = new AnimationStateMachine(mixer);
 *   sm.addAnimation('idle', idleClip);
 *   sm.addAnimation('walk', walkClip);
 *   sm.setState('idle');
 *   // In game loop:
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
}

/** State machine event */
export interface AnimationEvent {
  type: 'stateChange' | 'transitionStart' | 'transitionEnd' | 'loop' | 'finished' | 'phaseChange';
  from?: AnimationState;
  to?: AnimationState;
  phase?: AnimationPhase;
  action?: THREE.AnimationAction;
}

type EventCallback = (event: AnimationEvent) => void;

/** Internal tracking for a state's entry/loop/exit cycle */
interface StateCycle {
  /** The active phase within this state */
  phase: AnimationPhase;
  /** Time elapsed in the current phase */
  phaseTime: number;
  /** Total duration of the entry animation (if available) */
  entryDuration: number;
  /** Total duration of the exit animation (if available) */
  exitDuration: number;
  /** Whether the entry animation has completed */
  entryComplete: boolean;
  /** Whether the exit animation has completed */
  exitComplete: boolean;
}

/** Blend weight for a single animation layer */
interface BlendLayer {
  /** State driving this layer */
  state: AnimationState;
  /** Current blend weight */
  weight: number;
  /** Target weight (lerping toward this) */
  targetWeight: number;
  /** The THREE.js action for this layer */
  action: THREE.AnimationAction;
  /** Phase tracking */
  cycle: StateCycle;
}

/** Animation playback control options */
export interface PlaybackOptions {
  /** Crossfade duration in seconds (default: 0.25) */
  fadeDuration?: number;
  /** Time scale override for this playback */
  timeScale?: number;
  /** Whether to loop (default: based on state config) */
  loop?: boolean;
  /** Weight for blend operations (0–1) */
  weight?: number;
}

// ============================================================
// DEFAULT TRANSITIONS
// ============================================================

const DEFAULT_CROSSFADE_DURATION = 0.25;

// ============================================================
// ANIMATION STATE MACHINE CLASS
// ============================================================

export class AnimationStateMachine {
  private mixer: THREE.AnimationMixer;
  private actions: Map<AnimationState, THREE.AnimationAction> = new Map();
  private clips: Map<AnimationState, THREE.AnimationClip> = new Map();
  private transitions: StateTransition[];
  private listeners: Map<string, EventCallback[]> = new Map();

  // ── Current state tracking ──
  private currentState: AnimationState = '';
  private previousState: AnimationState = '';

  // ── Active layers (for blend tree support) ──
  private layers: BlendLayer[] = [];

  // ── Primary layer (index 0 — full body by default) ──
  private primaryLayer: BlendLayer | null = null;

  // ── Secondary layer (index 1 — upper body overlay when needed) ──
  private secondaryLayer: BlendLayer | null = null;

  // ── Transition tracking ──
  private isTransitioning: boolean = false;
  private transitionTime: number = 0;
  private transitionDuration: number = 0;
  private pendingState: AnimationState | null = null;

  // ── State cycle tracking ──
  private currentCycle: StateCycle = this.createEmptyCycle();

  // ── Global settings ──
  private globalTimeScale: number = 1.0;
  private enabled: boolean = true;

  // ── Blend factor for secondary layer (0 = primary only, 1 = secondary only) ──
  private secondaryBlendWeight: number = 0;
  private secondaryBlendTarget: number = 0;
  private secondaryBlendSpeed: number = 8; // Lerp speed per second

  // ── Entry/exit animation handling ──
  private pendingEntryAction: THREE.AnimationAction | null = null;
  private pendingExitAction: THREE.AnimationAction | null = null;
  private entryPhaseActive: boolean = false;
  private exitPhaseActive: boolean = false;
  private entryPhaseTime: number = 0;
  private exitPhaseTime: number = 0;

  // ── State config cache ──
  private stateConfigs: Map<string, AnimStateConfig> = new Map();

  // ── Playback control history ──
  private playbackHistory: Array<{ state: AnimationState; time: number }> = [];
  private maxHistoryLength: number = 20;

  constructor(mixer: THREE.AnimationMixer, customTransitions?: StateTransition[]) {
    this.mixer = mixer;
    this.transitions = customTransitions || getTransitionTable();

    // Cache state configs
    for (const [key, config] of Object.entries(ANIM_STATE_CONFIGS)) {
      this.stateConfigs.set(key, config);
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
   * Supports both config object and (name, clip, options) form.
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

    // Store the clip reference for playback controls
    this.clips.set(config.name, config.clip);

    const action = this.mixer.clipAction(config.clip);

    // Apply configuration
    if (config.loop !== undefined) action.loop = config.loop;
    else action.loop = THREE.LoopRepeat; // Default: loop

    if (config.clampWhenFinished !== undefined) action.clampWhenFinished = config.clampWhenFinished;
    if (config.timeScale !== undefined) {
      action.timeScale = config.timeScale * this.globalTimeScale;
    } else {
      // Look up speed from ANIMATION_SPEEDS
      const speed = ANIMATION_SPEEDS[config.name] ?? 1.0;
      action.timeScale = speed * this.globalTimeScale;
    }
    if (config.weight !== undefined) action.setEffectiveWeight(config.weight);

    // Don't play yet — just register
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

    // If state doesn't exist, try to find a fallback
    if (!this.actions.has(state)) {
      // Try to find the base state (e.g., 'rifleWalkEntry' → 'rifleWalk')
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
        // Queue the state instead of forcing it
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
    return this.currentCycle.phase;
  }

  /**
   * Get the current phase progress (0-1).
   */
  getPhaseProgress(): number {
    switch (this.currentCycle.phase) {
      case 'entry':
        if (this.currentCycle.entryDuration > 0) {
          return Math.min(this.entryPhaseTime / this.currentCycle.entryDuration, 1);
        }
        return 1;
      case 'exit':
        if (this.currentCycle.exitDuration > 0) {
          return Math.min(this.exitPhaseTime / this.currentCycle.exitDuration, 1);
        }
        return 1;
      case 'loop':
        return this.getProgress();
      default:
        return 0;
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
   * Find the base state name by stripping suffixes like 'Entry', 'Exit'.
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
    const oldAction = this.primaryLayer?.action ?? null;
    const newAction = this.actions.get(newState)!;

    // Record playback history
    this.recordPlayback(newState);

    // Store previous state
    this.previousState = this.currentState;
    this.currentState = newState;

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
   * Crossfades from the entry clip into the loop clip over `duration`.
   */
  private startEntryPhase(
    entryAction: THREE.AnimationAction,
    loopAction: THREE.AnimationAction,
    duration: number
  ): void {
    const oldLayer = this.primaryLayer;

    // Reset and configure entry action
    entryAction.reset();
    entryAction.enabled = true;
    entryAction.setEffectiveWeight(1);
    entryAction.setLoop(THREE.LoopOnce, 1);
    entryAction.clampWhenFinished = true;

    // Apply speed
    const speed = ANIMATION_SPEEDS[entryAction.getClip().name] ?? 1.0;
    entryAction.timeScale = speed * this.globalTimeScale;

    entryAction.play();

    // Configure loop action to fade in
    loopAction.reset();
    loopAction.enabled = true;
    loopAction.setEffectiveWeight(0);
    loopAction.play();

    // Store old action for crossfade
    if (oldLayer) {
      // Crossfade from old state to entry
      oldLayer.action.crossFadeTo(entryAction, Math.min(duration * 0.5, 0.15), true);
    }

    // Create new primary layer
    this.primaryLayer = {
      state: this.currentState,
      weight: 1,
      targetWeight: 1,
      action: loopAction,
      cycle: this.createEmptyCycle(),
    };

    // Track entry phase
    this.entryPhaseActive = true;
    this.entryPhaseTime = 0;
    this.pendingEntryAction = entryAction;
    this.pendingExitAction = null;

    // Set entry phase on cycle
    this.primaryLayer.cycle.phase = 'entry';
    this.primaryLayer.cycle.entryDuration = entryAction.getClip().duration / speed;

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
    // Reset and configure exit action
    exitAction.reset();
    exitAction.enabled = true;
    exitAction.setEffectiveWeight(0);
    exitAction.setLoop(THREE.LoopOnce, 1);
    exitAction.clampWhenFinished = true;

    const speed = ANIMATION_SPEEDS[exitAction.getClip().name] ?? 1.0;
    exitAction.timeScale = speed * this.globalTimeScale;

    exitAction.play();

    // Crossfade from old to exit
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
    // Configure new action
    newAction.reset();

    if (duration <= 0 || !oldAction) {
      // Instant transition (no crossfade)
      newAction.setEffectiveWeight(1);
      newAction.play();

      if (oldAction) {
        oldAction.stop();
      }

      this.primaryLayer = {
        state: this.currentState,
        weight: 1,
        targetWeight: 1,
        action: newAction,
        cycle: { ...this.createEmptyCycle(), phase: 'loop' },
      };

      this.isTransitioning = false;
      this.emit({ type: 'stateChange', from: this.previousState, to: this.currentState });
    } else {
      // Crossfade transition
      this.isTransitioning = true;
      this.transitionTime = 0;
      this.transitionDuration = duration;

      // Set up crossfade
      newAction.setEffectiveWeight(0);
      newAction.play();

      // Fade out old, fade in new
      oldAction.crossFadeTo(newAction, duration, true);

      this.primaryLayer = {
        state: this.currentState,
        weight: 0,
        targetWeight: 1,
        action: newAction,
        cycle: { ...this.createEmptyCycle(), phase: 'loop' },
      };

      this.emit({ type: 'transitionStart', from: this.previousState, to: this.currentState });
    }

    this.entryPhaseActive = false;
    this.exitPhaseActive = false;
    this.pendingEntryAction = null;
    this.pendingExitAction = null;
  }

  /**
   * Handle an animation action finishing (for one-shot clips like entry/exit).
   */
  private onActionFinished(action: THREE.AnimationAction): void {
    // Check if this was the entry animation
    if (this.entryPhaseActive && this.pendingEntryAction === action) {
      // Entry complete — transition to loop
      this.entryPhaseActive = false;
      this.pendingEntryAction = null;

      const loopAction = this.primaryLayer?.action;
      if (loopAction) {
        // Crossfade from entry to loop
        action.crossFadeTo(loopAction, 0.15, true);
        loopAction.setEffectiveWeight(1);
      }

      if (this.primaryLayer) {
        this.primaryLayer.cycle.phase = 'loop';
        this.primaryLayer.cycle.entryComplete = true;
      }

      this.emit({ type: 'phaseChange', from: this.previousState, to: this.currentState, phase: 'loop' });
    }

    // Check if this was the exit animation
    if (this.exitPhaseActive && this.pendingExitAction === action) {
      this.exitPhaseActive = false;
      this.pendingExitAction = null;

      if (this.primaryLayer) {
        this.primaryLayer.cycle.phase = 'loop';
        this.primaryLayer.cycle.exitComplete = true;
      }
    }
  }

  // ============================================================
  // UPDATE (Call every frame)
  // ============================================================

  update(delta: number): void {
    if (!this.enabled) return;

    // ── Update transition tracking ──
    if (this.isTransitioning) {
      this.transitionTime += delta;

      if (this.transitionTime >= this.transitionDuration) {
        // Transition complete
        this.isTransitioning = false;
        this.transitionTime = 0;

        // Stop the old action
        if (this.previousState) {
          const oldAction = this.actions.get(this.previousState);
          if (oldAction && oldAction !== this.primaryLayer?.action) {
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

    // ── Update secondary blend weight ──
    if (Math.abs(this.secondaryBlendWeight - this.secondaryBlendTarget) > 0.001) {
      this.secondaryBlendWeight += (this.secondaryBlendTarget - this.secondaryBlendWeight) * this.secondaryBlendSpeed * delta;
    } else {
      this.secondaryBlendWeight = this.secondaryBlendTarget;
    }

    // ── Update the mixer (drives all animations) ──
    this.mixer.update(delta);
  }

  // ============================================================
  // ANIMATION PLAYBACK CONTROLS
  // ============================================================

  /**
   * Play an animation by name with optional crossfade.
   * This is a convenience wrapper around setState that adds
   * explicit playback options.
   *
   * @param name - Animation state name to play
   * @param options - Playback options (fade, time scale, loop, weight)
   */
  play(name: AnimationState, options?: PlaybackOptions): void {
    if (!this.actions.has(name)) {
      console.warn(`[AnimationStateMachine] Cannot play "${name}": not registered`);
      return;
    }

    const fadeDuration = options?.fadeDuration ?? DEFAULT_CROSSFADE_DURATION;

    // Set time scale override if provided
    if (options?.timeScale !== undefined) {
      this.setTimeScale(name, options.timeScale);
    }

    // Set loop mode if explicitly specified
    if (options?.loop !== undefined) {
      const action = this.actions.get(name)!;
      action.loop = options.loop
        ? THREE.LoopRepeat
        : THREE.LoopOnce;
      action.clampWhenFinished = !options.loop;
    }

    // Use setState with the appropriate force flag
    if (name === this.currentState) {
      this.setState(name, true); // Force restart
    } else {
      // Temporarily override transition duration
      const oldTransition = this.findTransition(this.currentState, name);
      if (oldTransition) {
        oldTransition.duration = fadeDuration;
      }
      this.setState(name);
    }
  }

  /**
   * Blend between current and next animation over a specified duration.
   * This creates a smooth crossfade without fully transitioning state.
   *
   * @param targetState - The target animation to blend toward
   * @param duration - Crossfade duration in seconds
   * @param weight - Blend weight (0 = stay on current, 1 = fully on target)
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
    const currentAction = this.primaryLayer?.action;

    if (!currentAction || currentAction === targetAction) {
      // No current action or same action — just play it
      this.setState(targetState);
      return;
    }

    // Start the target animation
    targetAction.reset();
    targetAction.enabled = true;
    targetAction.setEffectiveWeight(0);
    targetAction.play();

    // Crossfade from current to target
    currentAction.crossFadeTo(targetAction, duration, true);

    // Update primary layer
    this.primaryLayer = {
      state: targetState,
      weight: 0,
      targetWeight: weight,
      action: targetAction,
      cycle: { ...this.createEmptyCycle(), phase: 'loop' },
    };

    this.previousState = this.currentState;
    this.currentState = targetState;
    this.isTransitioning = true;
    this.transitionTime = 0;
    this.transitionDuration = duration;

    this.emit({ type: 'transitionStart', from: this.previousState, to: this.currentState });
  }

  /**
   * Set the playback speed for a specific animation.
   *
   * @param state - Animation state name
   * @param speed - Playback speed multiplier (1.0 = normal, 2.0 = double speed)
   */
  setPlaybackSpeed(state: AnimationState, speed: number): void {
    const action = this.actions.get(state);
    if (action) {
      action.timeScale = speed * this.globalTimeScale;
    }
  }

  /**
   * Get the current playback speed for an animation.
   *
   * @param state - Animation state name
   * @returns Playback speed multiplier
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
   *
   * @param state - Animation state name to check
   * @returns True if the animation is active and playing
   */
  isPlaying(state: AnimationState): boolean {
    const action = this.actions.get(state);
    return action ? action.isRunning() : false;
  }

  /**
   * Get the current animation progress (0–1) for a specific state.
   * Useful for syncing gameplay events to animation phases.
   *
   * @param state - Animation state name (defaults to current state)
   * @returns Progress from 0 to 1
   */
  getAnimationProgress(state?: AnimationState): number {
    const action = state
      ? this.actions.get(state)
      : this.primaryLayer?.action;

    if (!action) return 0;

    const clip = action.getClip();
    const duration = clip.duration;
    const time = action.time;

    return (time % duration) / duration;
  }

  /**
   * Set the animation to a specific point in its timeline.
   * Useful for syncing to audio or gameplay events.
   *
   * @param state - Animation state name
   * @param normalizedTime - Time position (0–1, where 0 is start, 1 is end)
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
   *
   * @param state - Animation state name
   * @returns Duration in seconds, or 0 if not found
   */
  getAnimationDuration(state: AnimationState): number {
    const clip = this.clips.get(state);
    return clip ? clip.duration : 0;
  }

  /**
   * Get all registered animation state names.
   *
   * @returns Array of state names
   */
  getRegisteredStates(): AnimationState[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Get the playback history (recent state transitions).
   *
   * @param count - Number of recent entries to return
   * @returns Array of { state, time } objects
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
      // Stop all animations
      for (const action of this.actions.values()) {
        action.stop();
      }
    }
  }

  /**
   * Get the current animation action (primary layer).
   */
  getCurrentAction(): THREE.AnimationAction | null {
    return this.primaryLayer?.action ?? null;
  }

  /**
   * Get the action for a specific state.
   */
  getAction(state: AnimationState): THREE.AnimationAction | undefined {
    return this.actions.get(state);
  }

  /**
   * Get animation progress (0-1) for the current state.
   * (Legacy alias for getAnimationProgress)
   */
  getProgress(): number {
    return this.getAnimationProgress();
  }

  /**
   * Get normalized time (0-1) of the current loop.
   */
  getNormalizedTime(): number {
    const action = this.primaryLayer?.action;
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
  // BLEND TREE / LAYERED ANIMATION
  // ============================================================

  /**
   * Set the secondary animation layer weight (0 = off, 1 = fully active).
   * Useful for blending upper-body weapon animations over locomotion.
   */
  setSecondaryWeight(weight: number): void {
    this.secondaryBlendTarget = Math.max(0, Math.min(1, weight));
  }

  /**
   * Get current secondary layer blend weight.
   */
  getSecondaryWeight(): number {
    return this.secondaryBlendWeight;
  }

  /**
   * Set the secondary layer animation state (e.g., for upper-body overlay).
   */
  setSecondaryState(state: AnimationState): void {
    if (!this.actions.has(state)) {
      console.warn(`[AnimationStateMachine] Secondary state "${state}" not registered`);
      return;
    }

    const action = this.actions.get(state)!;
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(this.secondaryBlendWeight);
    action.play();

    this.secondaryLayer = {
      state,
      weight: this.secondaryBlendWeight,
      targetWeight: this.secondaryBlendWeight,
      action,
      cycle: { ...this.createEmptyCycle(), phase: 'loop' },
    };
  }

  /**
   * Stop the secondary layer.
   */
  stopSecondaryLayer(): void {
    if (this.secondaryLayer) {
      this.secondaryLayer.action.stop();
      this.secondaryLayer = null;
      this.secondaryBlendTarget = 0;
    }
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

    // Check condition if present
    if (transition.condition) {
      return transition.condition();
    }

    return true;
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
    // Emit to wildcard listeners
    const wildcards = this.listeners.get('*');
    if (wildcards) {
      for (const cb of wildcards) {
        cb(event);
      }
    }

    // Emit to state-specific listeners
    if (event.type === 'stateChange' && event.to) {
      const stateListeners = this.listeners.get(`state:${event.to}`);
      if (stateListeners) {
        for (const cb of stateListeners) {
          cb(event);
        }
      }
    }

    // Emit to phase-specific listeners
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
    this.layers = [];
    this.primaryLayer = null;
    this.secondaryLayer = null;
    this.pendingEntryAction = null;
    this.pendingExitAction = null;
    this.playbackHistory = [];
  }
}
