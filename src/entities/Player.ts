/**
 * Player.ts
 * Player entity — Wolf & Falcon
 *
 * Handles player movement, state, character switching, 3D models,
 * and immersive damage feedback systems.
 *
 * Combat feel systems added:
 *   1. Weapon Recoil — pitch/yaw kick with exponential decay
 *   2. Weapon Sway  — idle sinusoidal / moving head-bob coupling
 *   3. Fire Kick    — brief Z-axis weapon viewModel kick
 *   4. ADS Smooth   — smooth weapon + FOV transition to ADS
 *
 * CHARACTER MODELS & ANIMATION:
 *   Both Wolf and Falcon use fully procedural (box-geometry) character models
 *   built in createCharacterModel(). No external GLB/FBX files are loaded at
 *   runtime. The procedural approach ensures the game works without any
 *   downloaded assets while still providing readable silhouettes.
 *
 *   The third-person models are animated by two independent systems:
 *     a) animateCharacter() — handles stance transitions (stand/crouch/prone),
 *        walking/running cycles, and ground-position sync. Runs every frame
 *        for both characters from Player.update().
 *     b) Teammate AI animations (animateTeammateIdle, animateTeammateWalk,
 *        animateTeammateRun, etc.) — handle the inactive character's rich
 *        idle body sway, head tracking, weapon ready-poses, and cover
 *        behaviors. Called from updateInactiveAI(). These animations
 *        intentionally override animateCharacter's limb decay to produce
 *        visible, life-like idle motion.
 *
 * MIXAMO INTEGRATION (future):
 *   A MixamoLoader utility (utils/MixamoLoader.ts) and configuration
 *   (config/modelConfig.ts, config/AnimationConfig.ts) exist to support
 *   loading real Mixamo GLB character models and skeleton-driven animations.
 *   When Mixamo GLB files are placed in public/models/wolf/ or
 *   public/models/falcon/, the loader can replace the procedural models
 *   with authentic skeletal animations. Until those files are downloaded
 *   from https://www.mixamo.com, the game falls back to the procedural
 *   characters defined here.
 *
 *   Expected Mixamo file structure:
 *     public/models/wolf/
 *       ├── model.glb          ← Character mesh + Mixamo skeleton
 *       ├── idle.glb           ← Standing Idle animation
 *       ├── walk.glb           ← Walking animation
 *       ├── run.glb            ← Running animation
 *       ├── crouch_idle.glb    ← Crouching Idle
 *       ├── crouch_walk.glb    ← Crouching Walk
 *       ├── prone_idle.glb     ← Prone Idle
 *       ├── prone_crawl.glb    ← Prone Crawl
 *       ├── rifle_idle.glb     ← Rifle Aiming Idle
 *       ├── rifle_walk.glb     ← Rifle Walking
 *       ├── rifle_run.glb      ← Rifle Running
 *       ├── rifle_shoot.glb    ← Rifle Shooting
 *       └── rifle_reload.glb   ← Rifle Reloading
 *     public/models/falcon/
 *       └── (same structure as wolf)
 */

import * as THREE from 'three';
import { PLAYER_CONFIG } from '../config/MissionConfig';
import { AudioManager } from '../utils/AudioManager';

// ============================================================
// TYPES
// ============================================================

interface PlayerConfig {
  PLAYER_HEIGHT: number;
  PLAYER_SPEED: number;
  PLAYER_SPRINT_SPEED: number;
  PLAYER_CROUCH_SPEED: number;
  PLAYER_PRONE_SPEED: number;
}

type CharacterType = 'wolf' | 'falcon';

interface CharacterData {
  name: string;
  role: string;
  color: number;
  speed: number;
  weapons: string[];
}

type ShootCallback = () => void;
type SwitchCallback = () => void;
type DeathCallback = () => void;
type FootstepCallback = (surface: 'sand' | 'concrete' | 'metal') => void;
type WeaponSlotCallback = (slot: number) => void;
type NightVisionCallback = (active: boolean) => void;
type CommandWheelCallback = (open: boolean) => void;
type TacticalCommandCallback = (command: 1 | 2 | 3 | 4) => void;
type LeanCallback = (direction: 'left' | 'right' | 'none') => void;

// ============================================================
// WEAPON FEEL CONSTANTS
// ============================================================

/** Pitch (upward) recoil added per shot. */
const RECOIL_PITCH_HIP = 0.015;
const RECOIL_PITCH_ADS = 0.008;

/** Yaw (horizontal) recoil range per shot: [-YAW, +YAW]. */
const RECOIL_YAW_RANGE = 0.005;

/** Decay factor applied to accumulated recoil every frame. */
const RECOIL_DECAY = 0.85;

/** Decay threshold below which recoil is zeroed out. */
const RECOIL_THRESHOLD = 0.0001;

/** Weapon kick displacement on Z axis when firing. */
const FIRE_KICK_Z = 0.05;

/** Duration in ms for the fire-kick lerp back to rest. */
const FIRE_KICK_RECOVER_MS = 50;

/** Screen shake intensity added per shot (fire feedback). */
const FIRE_SHAKE_INTENSITY = 0.12;

/** Decay factor for the fire screen-shake each frame. */
const FIRE_SHAKE_DECAY = 0.88;

/** Reload animation duration in seconds. */
const RELOAD_ANIM_DURATION = 2.0;

/** Idle sway — frequency (Hz-ish) and amplitude per axis. */
const IDLE_SWAY_FREQ_X = 0.8;
const IDLE_SWAY_FREQ_Y = 1.1;
const IDLE_SWAY_FREQ_Z = 0.65;
const IDLE_SWAY_AMP_X = 0.004;
const IDLE_SWAY_AMP_Y = 0.003;
const IDLE_SWAY_AMP_Z = 0.002; // breathing depth — subtle forward/back

/** Movement sway — amplitude multiplier when moving. */
const MOVE_SWAY_AMP_X = 0.01;
const MOVE_SWAY_AMP_Y = 0.005;

/** Sprint weapon lowering — weapon dips down + forward when sprinting. */
const SPRINT_WEAPON_DROP_Y = -0.06;
const SPRINT_WEAPON_PUSH_Z = 0.04;
const SPRINT_WEAPON_TILT_X = 0.08; // muzzle tilts slightly upward

/** Weapon rest position for hip and ADS. */
const WEAPON_POS_HIP = new THREE.Vector3(0.25, -0.2, -0.4);
const WEAPON_POS_ADS = new THREE.Vector3(0, -0.15, -0.35);

/** How fast the weapon lerps between hip and ADS (lerp factor per second). */
const ADS_LERP_SPEED = 10;

// ============================================================
// PRONE CONSTANTS
// ============================================================

/** Additional pitch offset (radians) applied to camera when prone — simulates looking forward while lying down. */
const PRONE_PITCH_OFFSET = -0.25;

/** Lerp speed for the prone pitch offset transition (per second). */
const PRONE_PITCH_LERP_SPEED = 8;

/** Mouse sensitivity multiplier when prone (harder to aim while lying down). */
const PRONE_SENSITIVITY_MULT = 0.5;

/** Lerp speed for stance height changes — higher = snappier transition. */
const STANCE_HEIGHT_LERP_SPEED = 14;

// ============================================================
// PLAYER CLASS
// ============================================================

export class Player {
  private scene: THREE.Scene;
  private config: PlayerConfig;
  private canvas: HTMLCanvasElement | null = null;
  
  // Callbacks
  private onShoot: ShootCallback | null = null;
  private onSwitch: SwitchCallback | null = null;
  private onDeath: DeathCallback | null = null;
  private onAutoSwitch: SwitchCallback | null = null;
  private onFootstep: FootstepCallback | null = null;
  private onWeaponSlotChange: WeaponSlotCallback | null = null;
  private onIsSniper: (() => boolean) | null = null;
  private onGetMaxZoom: (() => number) | null = null;
  private onNightVisionToggle: NightVisionCallback | null = null;
  private onCommandWheelToggle: CommandWheelCallback | null = null;
  private onTacticalCommand: TacticalCommandCallback | null = null;
  private onLeanChange: LeanCallback | null = null;
  
  // Scope state
  private scopeZoomLevel: number = 1;
  private scopeSwayTime: number = 0;
  private scopeSwayX: number = 0;
  private scopeSwayY: number = 0;
  private isHoldingBreath: boolean = false;
  private breathHoldTime: number = 0;
  private readonly MAX_BREATH_HOLD: number = 5; // seconds
  private breathRefillRate: number = 3; // seconds to fully refill

  // Audio manager reference — for direct footstep calls
  private audioManager: AudioManager | null = null;

  // Distance-based footstep tracking
  private lastFootstepPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly FOOTSTEP_DISTANCE: number = 2.4; // units between footstep sounds (walking) — slower rhythm
  
  // Both characters exist in the world
  private characters: Record<CharacterType, {
    data: CharacterData;
    group: THREE.Group;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    isActive: boolean;
    isCrouching: boolean;
    isProne: boolean;
    lastSlot: number; // Persisted weapon slot per character
  }>;
  
  private activeCharacter: CharacterType = 'wolf';
  
  // Movement state (global — sprint/ads/moving don't persist on switch)
  private isMoving: boolean = false;
  private isSprinting: boolean = false;
  private isADS: boolean = false;
  
  // Jump state
  private isJumping: boolean = false;
  private jumpVelocity: number = 0;
  private readonly JUMP_FORCE: number = 8;
  private readonly GRAVITY: number = -20;

  // Night Vision (per-character with battery)
  private isNightVision: boolean = false;
  private nvBattery: number = 100; // 0-100%
  private readonly NV_DRAIN_RATE: number = 15; // % per second when active
  private readonly NV_CHARGE_RATE: number = 8; // % per second when off
  private readonly NV_SPEED_MULT: number = 0.4; // 60% slower when NV active
  private readonly NV_ZOOM_FOV: number = 52; // Slight zoom when NV active
  
  // Per-character stance accessors
  private get isCrouching(): boolean {
    return this.characters[this.activeCharacter].isCrouching;
  }
  private set isCrouching(v: boolean) {
    this.characters[this.activeCharacter].isCrouching = v;
  }
  private get isProne(): boolean {
    return this.characters[this.activeCharacter].isProne;
  }
  private set isProne(v: boolean) {
    this.characters[this.activeCharacter].isProne = v;
  }
  
  // Weapon slot state
  private currentWeaponSlot: number = 4; // Start with primary (slot 4)
  private previousWeaponSlot: number = 4;

  // Per-character Health (DEBUG MODE — 100x for testing)
  private wolfHealth: number = 10000;
  private wolfMaxHealth: number = 10000;
  private falconHealth: number = 10000;
  private falconMaxHealth: number = 10000;
  private wolfArmor: number = 50;
  private wolfMaxArmor: number = 100;
  private falconArmor: number = 50;
  private falconMaxArmor: number = 100;

  // Per-character downed state
  private wolfIsDowned: boolean = false;
  private wolfDownedTimer: number = 0;
  private falconIsDowned: boolean = false;
  private falconDownedTimer: number = 0;
  private readonly DOWNED_TIMER_MAX: number = 60; // 60 seconds rescue timer
  private readonly DOWNED_REVIVE_PERCENT: number = 0.5; // Revive with 50% health
  private readonly RESCUE_DISTANCE: number = 2; // Must be within 2 units
  private readonly RESCUE_HOLD_TIME: number = 3; // Hold E for 3 seconds
  private rescueProgress: number = 0;
  private isRescuing: boolean = false;

  // Rescue particles
  private rescueParticles: THREE.Points | null = null;
  private rescueParticlePositions: Float32Array | null = null;

  // Downed character arrow/glow (can be Mesh or Group)
  private wolfGlowMesh: THREE.Object3D | null = null;
  private falconGlowMesh: THREE.Object3D | null = null;
  
  // Input state
  private keys: Record<string, boolean> = {};
  private mouseMovement: { x: number; y: number } = { x: 0, y: 0 };
  
  // Visual
  private headBob: number = 0;

  // Collision — reference to world colliders
  private colliders: THREE.Mesh[] = [];

  // Terrain height provider — callback from GameEngine for undulating terrain
  private terrainHeightProvider: ((x: number, z: number) => number) | null = null;

  // Player collision radius (horizontal)
  private readonly PLAYER_RADIUS: number = 0.3;
  
  // Weapon view model (first person)
  private weaponViewModel: THREE.Group | null = null;
  
  // ADS
  private baseFOV: number = 75;
  private adsFOV: number = 50;
  private currentFOV: number = 75;

  // Footstep timing — fires callback at each step based on head bob
  private lastFootstepPhase: number = 0;
  private footstepCooldown: number = 0;

  // ============================================================
  // DAMAGE FEEDBACK — Screen Shake
  // ============================================================

  /** Current screen shake intensity, 0–1 range. */
  private screenShakeIntensity: number = 0;

  // ============================================================
  // DAMAGE FEEDBACK — Recoil Offset (legacy vertical kick)
  // ============================================================

  /** Vertical recoil offset that decays over time. */
  private recoilOffset: number = 0;

  // ============================================================
  // DAMAGE FEEDBACK — DOM Element Cache
  // ============================================================

  /** Cached references to damage-indicator DOM elements. */
  private damageIndicators: {
    top: HTMLElement | null;
    bottom: HTMLElement | null;
    left: HTMLElement | null;
    right: HTMLElement | null;
    vignette: HTMLElement | null;
    lowHealthVignette: HTMLElement | null;
  };

  // ============================================================
  // COMBAT FEEL — Weapon Recoil (pitch / yaw)
  // ============================================================

  /** Accumulated pitch recoil (applied to camera rotation after mouse look). */
  private recoilPitch: number = 0;

  /** Accumulated yaw recoil (applied to camera rotation after mouse look). */
  private recoilYaw: number = 0;

  // ============================================================
  // COMBAT FEEL — Weapon Sway
  // ============================================================

  /** Accumulated time for idle sway oscillation. */
  private swayTime: number = 0;

  // ============================================================
  // COMBAT FEEL — Fire Kick
  // ============================================================

  /** Current Z-axis fire kick offset (positive = kicked back). */
  private fireKickZ: number = 0;

  /** Timestamp (ms) when the fire kick started. */
  private fireKickStartTime: number = 0;

  /** Whether a fire kick is currently in progress. */
  private fireKickActive: boolean = false;

  // ============================================================
  // COMBAT FEEL — Reload Animation
  // ============================================================

  /** Whether a reload animation is currently playing. */
  private reloadAnimActive: boolean = false;

  /** Timestamp (ms) when the reload animation started. */
  private reloadAnimStartTime: number = 0;

  /** Cached weapon position before reload started (lerp anchor). */
  private reloadWeaponBasePos: THREE.Vector3 = new THREE.Vector3();

  // ============================================================
  // PRONE — Camera Pitch Offset
  // ============================================================

  /** Current interpolated prone pitch offset (smoothly lerps toward target). */
  private currentPronePitchOffset: number = 0;

  // ============================================================
  // LEAN SYSTEM (Q / E toggle)
  // ============================================================

  /** Current lean angle on Z axis (radians). Negative = lean left, positive = lean right. */
  // Lean state (hold-based)
  private leanAngle: number = 0;
  private leanTargetAngle: number = 0;
  private leanOffset: number = 0; // Position offset (set by Q/E)
  private isLeaningLeft: boolean = false;
  private isLeaningRight: boolean = false;
  private readonly LEAN_ANGLE: number = 0.26; // ~15 degrees
  private readonly LEAN_LERP_SPEED: number = 12;

  /** Weapon X offset when leaning. */
  private readonly LEAN_WEAPON_OFFSET: number = 0.3;

  // ============================================================
  // TACTICAL COMMAND WHEEL
  // ============================================================

  /** Whether the tactical command wheel is currently open. */
  private commandWheelOpen: boolean = false;

  constructor(scene: THREE.Scene, config: PlayerConfig) {
    this.scene = scene;
    this.config = config;
    
    // Initialize both characters
    this.characters = {
      wolf: {
        data: {
          name: 'WOLF',
          role: 'THE OPERATOR',
          color: 0x2d5a27,
          speed: 5,
          weapons: ['Zulfiqar-47', 'Makara-9'],
        },
        group: new THREE.Group(),
        position: new THREE.Vector3(-2, 0, 190),
        rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
        isActive: true,
        isCrouching: false,
        isProne: false,
        lastSlot: 4,
      },
      falcon: {
        data: {
          name: 'FALCON',
          role: 'THE OVERWATCH',
          color: 0x1a3d5c,
          speed: 4,
          weapons: ['Shahin-SR', 'Makara-9'],
        },
        group: new THREE.Group(),
        position: new THREE.Vector3(2, 0, 190),
        rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
        isActive: false,
        isCrouching: false,
        isProne: false,
        lastSlot: 4,
      },
    };
    
    // Create both character models
    this.createCharacterModel('wolf');
    this.createCharacterModel('falcon');
    
    // Add to scene
    this.scene.add(this.characters.wolf.group);
    this.scene.add(this.characters.falcon.group);
    
    // Hide the active character (first person — can't see yourself)
    this.characters.wolf.group.visible = false;
    // Show inactive character (so you can see Falcon in the world)
    this.characters.falcon.group.visible = true;
    
    // Create first person weapon
    this.createWeaponViewModel();
    
    // Setup input
    this.setupInput();

    // Cache damage-feedback DOM elements
    this.damageIndicators = {
      top: document.getElementById('damage-top'),
      bottom: document.getElementById('damage-bottom'),
      left: document.getElementById('damage-left'),
      right: document.getElementById('damage-right'),
      vignette: document.getElementById('damage-vignette'),
      lowHealthVignette: document.getElementById('low-health-vignette'),
    };
  }

  // ============================================================
  // PUBLIC SETTERS (called by GameEngine)
  // ============================================================

  public setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  public setShootCallback(cb: ShootCallback): void {
    this.onShoot = cb;
  }

  public setSwitchCallback(cb: SwitchCallback): void {
    this.onSwitch = cb;
  }

  public setAutoSwitchCallback(cb: SwitchCallback): void {
    this.onAutoSwitch = cb;
  }

  public setIsSniperCallback(cb: () => boolean): void {
    this.onIsSniper = cb;
  }

  public setMaxZoomCallback(cb: () => number): void {
    this.onGetMaxZoom = cb;
  }

  public getScopeZoom(): number {
    return this.scopeZoomLevel;
  }

  public getBreathHoldTime(): number {
    return this.breathHoldTime;
  }

  public getMaxBreathHold(): number {
    return this.MAX_BREATH_HOLD;
  }

  public isBreathHolding(): boolean {
    return this.isHoldingBreath;
  }

  public isNightVisionActive(): boolean {
    return this.isNightVision;
  }

  public getNVBattery(): number {
    return this.nvBattery;
  }

  public setDeathCallback(cb: DeathCallback): void {
    this.onDeath = cb;
  }

  public setFootstepCallback(cb: FootstepCallback): void {
    this.onFootstep = cb;
  }

  public setWeaponSlotCallback(cb: WeaponSlotCallback): void {
    this.onWeaponSlotChange = cb;
  }

  public setNightVisionCallback(cb: NightVisionCallback): void {
    this.onNightVisionToggle = cb;
  }

  public setCommandWheelCallback(cb: CommandWheelCallback): void {
    this.onCommandWheelToggle = cb;
  }

  public setTacticalCommandCallback(cb: TacticalCommandCallback): void {
    this.onTacticalCommand = cb;
  }

  public setLeanCallback(cb: LeanCallback): void {
    this.onLeanChange = cb;
  }

  public setColliders(colliders: THREE.Mesh[]): void {
    this.colliders = colliders;

    // FIX 3: Validate spawn positions — push characters out of any collider
    this.validateSpawnPosition('wolf');
    this.validateSpawnPosition('falcon');
  }

  public setTerrainHeightProvider(provider: (x: number, z: number) => number): void {
    this.terrainHeightProvider = provider;
  }

  public setInitialTerrainHeight(): void {
    if (!this.terrainHeightProvider) return;
    
    // Set Wolf's initial Y based on terrain
    const wolfPos = this.characters.wolf.position;
    wolfPos.y = this.terrainHeightProvider(wolfPos.x, wolfPos.z) + PLAYER_CONFIG.STANDING_HEIGHT;
    
    // Set Falcon's initial Y based on terrain
    const falconPos = this.characters.falcon.position;
    falconPos.y = this.terrainHeightProvider(falconPos.x, falconPos.z) + PLAYER_CONFIG.STANDING_HEIGHT;

    // FIX 3: Validate spawn positions after terrain height is set
    this.validateSpawnPosition('wolf');
    this.validateSpawnPosition('falcon');
  }

  public setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
  }

  // ============================================================
  // FIX 3 — SPAWN POSITION VALIDATION
  // ============================================================

  /**
   * Validate that a character's spawn position is not inside any collider.
   * If the character overlaps a collider, push them to the nearest clear
   * position by sliding along the smallest penetration axis.
   * Prevents characters from spawning stuck inside walls.
   */
  private validateSpawnPosition(type: CharacterType): void {
    if (this.colliders.length === 0) return;

    const char = this.characters[type];
    const radius = this.PLAYER_RADIUS;
    let fixed = false;

    for (let attempt = 0; attempt < 10; attempt++) {
      let isBlocked = false;
      let bestAxis: 'x' | 'z' | null = null;
      let bestPenetration = Infinity;
      let bestColliderBox: THREE.Box3 | null = null;

      for (const collider of this.colliders) {
        const box = new THREE.Box3().setFromObject(collider);

        // Check if the character's horizontal footprint overlaps the collider
        if (char.position.x + radius > box.min.x &&
            char.position.x - radius < box.max.x &&
            char.position.z + radius > box.min.z &&
            char.position.z - radius < box.max.z) {

          // Check vertical overlap (character must be at collider height)
          const stanceHeight = 1.7;
          const charFeet = char.position.y - stanceHeight;
          const charHead = char.position.y;
          if (charFeet >= box.max.y || charHead <= box.min.y) continue;

          isBlocked = true;

          // Calculate penetration depth on each axis
          const penLeft  = (char.position.x + radius) - box.min.x;
          const penRight = box.max.x - (char.position.x - radius);
          const penFront = (char.position.z + radius) - box.min.z;
          const penBack  = box.max.z - (char.position.z - radius);

          const minPen = Math.min(penLeft, penRight, penFront, penBack);

          if (minPen < bestPenetration) {
            bestPenetration = minPen;
            bestColliderBox = box;
            if (minPen === penLeft || minPen === penRight) {
              bestAxis = 'x';
            } else {
              bestAxis = 'z';
            }
          }
        }
      }

      if (!isBlocked || !bestColliderBox) {
        fixed = attempt > 0;
        break;
      }

      // Push character out along the axis of smallest penetration
      if (bestAxis === 'x') {
        const penLeft  = (char.position.x + radius) - bestColliderBox.min.x;
        const penRight = bestColliderBox.max.x - (char.position.x - radius);
        if (penLeft < penRight) {
          char.position.x = bestColliderBox.min.x - radius - 0.01;
        } else {
          char.position.x = bestColliderBox.max.x + radius + 0.01;
        }
      } else if (bestAxis === 'z') {
        const penFront = (char.position.z + radius) - bestColliderBox.min.z;
        const penBack = bestColliderBox.max.z - (char.position.z - radius);
        if (penFront < penBack) {
          char.position.z = bestColliderBox.min.z - radius - 0.01;
        } else {
          char.position.z = bestColliderBox.max.z + radius + 0.01;
        }
      }
    }

    if (fixed) {
      console.log(`[Player] ${type.toUpperCase()} spawn position was inside a collider — pushed to nearest clear position`);
      // Update group position to match
      char.group.position.copy(char.position);
    }
  }

  // ============================================================
  // CHARACTER MODELS (Third Person — visible to each other)
  // ============================================================

  private createCharacterModel(type: CharacterType): void {
    try {
    const char = this.characters[type];
    const color = char.data.color;
    
    const group = char.group;
    
    // === BODY ===
    const bodyGeometry = new THREE.BoxGeometry(0.55, 0.7, 0.35);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.8,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);
    
    // Tactical vest
    const vestGeometry = new THREE.BoxGeometry(0.58, 0.35, 0.4);
    const vestMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d3d3d,
      roughness: 0.7,
    });
    const vest = new THREE.Mesh(vestGeometry, vestMaterial);
    vest.position.y = 1.15;
    vest.position.z = 0.03;
    vest.castShadow = true;
    group.add(vest);
    
    // === HEAD ===
    const headGeometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9a882,
      roughness: 0.7,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);
    
    // Helmet
    const helmetGeometry = new THREE.BoxGeometry(0.28, 0.15, 0.28);
    const helmetMaterial = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
    });
    const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
    helmet.position.y = 1.65;
    helmet.castShadow = true;
    group.add(helmet);
    
    // Balaclava/face
    const faceGeometry = new THREE.BoxGeometry(0.22, 0.1, 0.05);
    const faceMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.9,
    });
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.position.set(0, 1.52, 0.12);
    group.add(face);
    
    // === LEFT ARM ===
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.4, 1.2, 0);
    
    const upperArmGeometry = new THREE.BoxGeometry(0.15, 0.35, 0.15);
    const upperArm = new THREE.Mesh(upperArmGeometry, bodyMaterial);
    upperArm.position.y = -0.15;
    upperArm.castShadow = true;
    leftArmGroup.add(upperArm);
    
    const lowerArmGeometry = new THREE.BoxGeometry(0.12, 0.3, 0.12);
    const lowerArm = new THREE.Mesh(lowerArmGeometry, headMaterial);
    lowerArm.position.y = -0.45;
    lowerArm.castShadow = true;
    leftArmGroup.add(lowerArm);
    
    // Left hand
    const handGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const hand = new THREE.Mesh(handGeometry, headMaterial);
    hand.position.y = -0.6;
    leftArmGroup.add(hand);
    
    group.add(leftArmGroup);
    
    // === RIGHT ARM (holding weapon) ===
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.4, 1.2, 0);
    
    const rightUpperArm = new THREE.Mesh(upperArmGeometry, bodyMaterial);
    rightUpperArm.position.y = -0.15;
    rightUpperArm.castShadow = true;
    rightArmGroup.add(rightUpperArm);
    
    const rightLowerArm = new THREE.Mesh(lowerArmGeometry, headMaterial);
    rightLowerArm.position.y = -0.45;
    rightLowerArm.position.z = -0.1;
    rightLowerArm.castShadow = true;
    rightArmGroup.add(rightLowerArm);
    
    // Right hand
    const rightHand = new THREE.Mesh(handGeometry, headMaterial);
    rightHand.position.y = -0.6;
    rightHand.position.z = -0.1;
    rightArmGroup.add(rightHand);
    
    // Weapon in right hand
    const weaponGroup = this.createWeaponMesh(type);
    weaponGroup.position.set(0, -0.5, -0.3);
    rightArmGroup.add(weaponGroup);
    
    group.add(rightArmGroup);
    
    // Store arm references for animation
    group.userData.leftArm = leftArmGroup;
    group.userData.rightArm = rightArmGroup;
    group.userData.body = body;
    group.userData.head = head;
    
    // === LEGS ===
    const legGeometry = new THREE.BoxGeometry(0.18, 0.5, 0.18);
    const legMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.8,
    });
    
    // Left leg
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.13, 0.7, 0);
    const leftUpperLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftUpperLeg.position.y = -0.25;
    leftUpperLeg.castShadow = true;
    leftLegGroup.add(leftUpperLeg);
    
    const bootGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.25);
    const bootMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
    const leftBoot = new THREE.Mesh(bootGeometry, bootMaterial);
    leftBoot.position.y = -0.55;
    leftBoot.position.z = 0.02;
    leftBoot.castShadow = true;
    leftLegGroup.add(leftBoot);
    group.add(leftLegGroup);
    
    // Right leg
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.13, 0.7, 0);
    const rightUpperLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightUpperLeg.position.y = -0.25;
    rightUpperLeg.castShadow = true;
    rightLegGroup.add(rightUpperLeg);
    
    const rightBoot = new THREE.Mesh(bootGeometry, bootMaterial);
    rightBoot.position.y = -0.55;
    rightBoot.position.z = 0.02;
    rightBoot.castShadow = true;
    rightLegGroup.add(rightBoot);
    group.add(rightLegGroup);
    
    group.userData.leftLeg = leftLegGroup;
    group.userData.rightLeg = rightLegGroup;
    
    // Set initial position
    group.position.copy(char.position);

    } catch (err) {
      // FIX 5: Fallback — if model creation fails (e.g. missing GLB files
      // or any runtime error), log a warning and create a minimal fallback
      // character model so the game doesn't crash.
      console.warn(`[Player] Failed to create ${type.toUpperCase()} character model — using procedural fallback:`, err);
      this.createFallbackCharacterModel(type);
    }
  }

  /**
   * FIX 5: Minimal procedural fallback character model.
   * Used when the primary character model creation fails (e.g. missing GLB files).
   * Creates a simple colored box so the character is still visible in the world.
   */
  private createFallbackCharacterModel(type: CharacterType): void {
    const char = this.characters[type];
    const group = char.group;
    const color = char.data.color;

    // Simple body box
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.5, 0.4),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
    );
    body.position.y = 0.75;
    body.castShadow = true;
    group.add(body);

    // Simple head
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xc9a882, roughness: 0.7 })
    );
    head.position.y = 1.65;
    group.add(head);

    // Store minimal references so animateCharacter doesn't crash
    const armStubL = new THREE.Group();
    armStubL.position.set(-0.4, 1.2, 0);
    group.add(armStubL);
    const armStubR = new THREE.Group();
    armStubR.position.set(0.4, 1.2, 0);
    group.add(armStubR);
    const legStubL = new THREE.Group();
    legStubL.position.set(-0.13, 0.7, 0);
    group.add(legStubL);
    const legStubR = new THREE.Group();
    legStubR.position.set(0.13, 0.7, 0);
    group.add(legStubR);

    group.userData.leftArm = armStubL;
    group.userData.rightArm = armStubR;
    group.userData.leftLeg = legStubL;
    group.userData.rightLeg = legStubR;
    group.userData.body = body;
    group.userData.head = head;

    group.position.copy(char.position);
  }

  private createWeaponMesh(type: CharacterType): THREE.Group {
    const weaponGroup = new THREE.Group();
    
    if (type === 'wolf') {
      // Assault Rifle (Zulfiqar-47)
      const gunBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.08, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x2f2f2f, metalness: 0.5, roughness: 0.4 })
      );
      weaponGroup.add(gunBody);
      
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7 })
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = -0.45;
      weaponGroup.add(barrel);
      
      // Magazine
      const mag = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.12, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.8 })
      );
      mag.position.set(0, -0.1, -0.05);
      weaponGroup.add(mag);
      
      // Stock
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 })
      );
      stock.position.z = 0.4;
      weaponGroup.add(stock);
      
    } else {
      // Sniper Rifle (Shahin-SR)
      const gunBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.07, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5, roughness: 0.4 })
      );
      weaponGroup.add(gunBody);
      
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7 })
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = -0.6;
      weaponGroup.add(barrel);
      
      // Scope
      const scope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6 })
      );
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.06, -0.1);
      weaponGroup.add(scope);
      
      // Scope lens
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.025, 8),
        new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 })
      );
      lens.position.set(0, 0.06, -0.16);
      weaponGroup.add(lens);
      
      // Stock
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.06, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 })
      );
      stock.position.z = 0.55;
      weaponGroup.add(stock);
    }
    
    return weaponGroup;
  }

  // ============================================================
  // FIRST PERSON WEAPON VIEW MODEL
  // ============================================================

  private createWeaponViewModel(): void {
    this.weaponViewModel = new THREE.Group();

    const skinColor = 0xc9a882; // hand skin tone

    switch (this.currentWeaponSlot) {
      case 1:
        // === SLOT 1: BARE HANDS — two fist box models ===
        this.createBareHandsModel(skinColor);
        break;

      case 2:
        // === SLOT 2: KNIFE / DAGGER ===
        this.createKnifeModel(skinColor);
        break;

      case 3:
        // === SLOT 3: MAKARA-9 PISTOL ===
        this.createPistolModel();
        break;

      case 4:
      default:
        // === SLOT 4: PRIMARY (Rifle / Sniper) ===
        if (this.activeCharacter === 'wolf') {
          this.createRifleModel();
        } else {
          this.createSniperModel();
        }
        break;
    }

    // Position weapon in view
    this.weaponViewModel.position.copy(WEAPON_POS_HIP);
    this.weaponViewModel.rotation.set(0, 0, 0);
  }

  // --------------------------------------------------------
  // VIEW MODEL: Bare Hands
  // --------------------------------------------------------
  private createBareHandsModel(skinColor: number): void {
    const handMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });

    // Right hand (main fist — slightly forward)
    const rightFist = new THREE.Group();
    const rPalm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.04), handMat);
    rightFist.add(rPalm);
    // Fingers (4 small boxes curled)
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.03), handMat);
      finger.position.set(-0.012 + i * 0.008, 0, -0.02);
      finger.rotation.x = -0.5;
      rightFist.add(finger);
    }
    // Glove knuckle guard
    const rGuard = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.015, 0.015), gloveMat);
    rGuard.position.set(0, 0.015, -0.015);
    rightFist.add(rGuard);
    rightFist.position.set(0.12, -0.18, -0.32);
    rightFist.rotation.set(-0.3, 0.1, 0);
    this.weaponViewModel!.add(rightFist);

    // Left hand (support fist — lower and behind)
    const leftFist = new THREE.Group();
    const lPalm = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.032, 0.038), handMat);
    leftFist.add(lPalm);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.018, 0.028), handMat);
      finger.position.set(-0.01 + i * 0.007, 0, -0.018);
      finger.rotation.x = -0.5;
      leftFist.add(finger);
    }
    const lGuard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.013, 0.013), gloveMat);
    lGuard.position.set(0, 0.013, -0.013);
    leftFist.add(lGuard);
    leftFist.position.set(-0.1, -0.22, -0.28);
    leftFist.rotation.set(-0.2, -0.1, 0);
    this.weaponViewModel!.add(leftFist);
  }

  // --------------------------------------------------------
  // VIEW MODEL: Knife / Dagger
  // --------------------------------------------------------
  private createKnifeModel(skinColor: number): void {
    const handMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });

    // Right hand gripping handle
    const rightHand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.035), handMat);
    rightHand.add(palm);
    // Thumb
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.012), handMat);
    thumb.position.set(0.02, 0.005, 0);
    thumb.rotation.z = -0.3;
    rightHand.add(thumb);

    // Knife handle (gripped by hand)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.1), handleMat);
    handle.position.set(0, 0, -0.05);
    rightHand.add(handle);

    // Hand guard
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.012), bladeMat);
    guard.position.set(0, 0, -0.1);
    rightHand.add(guard);

    // Blade (thin, pointed)
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.003, 0.14), bladeMat);
    blade.position.set(0, 0, -0.18);
    rightHand.add(blade);

    // Blade tip (triangular approximation)
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.008, 0.04, 4),
      bladeMat
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0, -0.27);
    rightHand.add(tip);

    rightHand.position.set(0.12, -0.18, -0.32);
    rightHand.rotation.set(-0.15, 0.1, -0.1);
    this.weaponViewModel!.add(rightHand);
  }

  // --------------------------------------------------------
  // VIEW MODEL: Makara-9 Pistol
  // --------------------------------------------------------
  private createPistolModel(): void {
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.35 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    const slideMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.25 });

    const pistol = new THREE.Group();

    // Frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.16), gunMat);
    pistol.add(frame);

    // Slide
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.015, 0.165), slideMat);
    slide.position.set(0, 0.018, 0);
    pistol.add(slide);

    // Barrel opening
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.016, -0.09);
    pistol.add(barrel);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.035), gripMat);
    grip.position.set(0, -0.035, 0.04);
    grip.rotation.x = 0.15;
    pistol.add(grip);

    // Trigger guard
    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.012, 0.002, 6, 8, Math.PI),
      gunMat
    );
    guard.position.set(0, -0.018, 0.015);
    guard.rotation.x = Math.PI / 2;
    guard.rotation.z = Math.PI;
    pistol.add(guard);

    // Trigger
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.003), gunMat);
    trigger.position.set(0, -0.015, 0.015);
    pistol.add(trigger);

    // Front sight
    const frontSight = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.006, 0.004),
      gunMat
    );
    frontSight.position.set(0, 0.03, -0.075);
    pistol.add(frontSight);

    pistol.position.set(0.14, -0.2, -0.35);
    pistol.rotation.set(0, 0, -0.05);
    this.weaponViewModel!.add(pistol);
  }

  // --------------------------------------------------------
  // VIEW MODEL: Zulfiqar-47 Assault Rifle (Wolf primary)
  // --------------------------------------------------------
  private createRifleModel(): void {
    const rifleColor = 0x2f2f2f; // dark grey base

    // === GUN BODY — elongated receiver ===
    const gunBodyMat = new THREE.MeshStandardMaterial({
      color: rifleColor,
      metalness: 0.7,
      roughness: 0.28,
    });
    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.45),
      gunBodyMat
    );
    this.weaponViewModel!.add(gunBody);

    // === BARREL — extends forward from body ===
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.85,
      roughness: 0.15,
    });
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.2, 12),
      barrelMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.33; // centered on the body's front edge + half barrel length
    this.weaponViewModel!.add(barrel);

    // === BARREL SHROUD / HEAT SHIELD (wraps barrel for visual bulk) ===
    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.6,
        roughness: 0.35,
      })
    );
    shroud.rotation.x = Math.PI / 2;
    shroud.position.z = -0.26;
    this.weaponViewModel!.add(shroud);

    // === MUZZLE BRAKE ===
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.01, 0.03, 10),
      barrelMat
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = -0.44;
    this.weaponViewModel!.add(muzzle);

    // === MAGAZINE — curved box below body ===
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.1, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x4a3520,
        roughness: 0.85,
        metalness: 0.2,
      })
    );
    mag.position.set(0, -0.075, -0.04);
    mag.rotation.x = 0.08; // slight forward tilt for AK-style curve
    this.weaponViewModel!.add(mag);

    // === MAGAZINE BASE PLATE ===
    const magBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.006, 0.052),
      new THREE.MeshStandardMaterial({ color: 0x2a2015, metalness: 0.4, roughness: 0.6 })
    );
    magBase.position.set(0, -0.13, -0.045);
    this.weaponViewModel!.add(magBase);

    // === FRONT SIGHT POST ===
    const frontSightPost = new THREE.Mesh(
      new THREE.BoxGeometry(0.003, 0.018, 0.003),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7 })
    );
    frontSightPost.position.set(0, 0.042, -0.32);
    this.weaponViewModel!.add(frontSightPost);

    // === FRONT SIGHT WINGS (protective ears) ===
    const sightWingMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 });
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012, 0.02), sightWingMat);
    leftWing.position.set(-0.008, 0.038, -0.32);
    this.weaponViewModel!.add(leftWing);
    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012, 0.02), sightWingMat);
    rightWing.position.set(0.008, 0.038, -0.32);
    this.weaponViewModel!.add(rightWing);

    // === REAR SIGHT (aperture) ===
    const rearSightBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.01, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.4 })
    );
    rearSightBase.position.set(0, 0.035, 0.05);
    this.weaponViewModel!.add(rearSightBase);

    // === PISTOL GRIP ===
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.045, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 })
    );
    grip.position.set(0, -0.045, 0.08);
    grip.rotation.x = 0.25; // angled back like an AK grip
    this.weaponViewModel!.add(grip);

    // === TRIGGER GUARD ===
    const guardGeo = new THREE.TorusGeometry(0.012, 0.002, 6, 8, Math.PI);
    const guardMesh = new THREE.Mesh(guardGeo, gunBodyMat);
    guardMesh.position.set(0, -0.025, 0.04);
    guardMesh.rotation.x = Math.PI / 2;
    guardMesh.rotation.z = Math.PI;
    this.weaponViewModel!.add(guardMesh);

    // === TRIGGER ===
    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(0.003, 0.01, 0.003),
      gunBodyMat
    );
    trigger.position.set(0, -0.02, 0.04);
    this.weaponViewModel!.add(trigger);

    // === STOCK — larger, solid ===
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.05, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x5a4a3a,
        roughness: 0.9,
        metalness: 0.1,
      })
    );
    stock.position.set(0, -0.005, 0.29);
    this.weaponViewModel!.add(stock);

    // === STOCK BUTT PLATE (rubber pad) ===
    const buttPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.055, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 })
    );
    buttPlate.position.set(0, -0.005, 0.355);
    this.weaponViewModel!.add(buttPlate);

    // === CHARGING HANDLE (right side) ===
    const chargingHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.035, 6),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.2 })
    );
    chargingHandle.rotation.z = Math.PI / 2;
    chargingHandle.position.set(0.032, 0.01, 0.0);
    this.weaponViewModel!.add(chargingHandle);
  }

  // --------------------------------------------------------
  // VIEW MODEL: Shahin-SR Sniper Rifle (Falcon primary)
  // --------------------------------------------------------
  private createSniperModel(): void {
    const sniperColor = 0x2a2a3a; // dark blue-grey base
    const metalMat = new THREE.MeshStandardMaterial({
      color: sniperColor,
      metalness: 0.7,
      roughness: 0.28,
    });

    // === GUN BODY — long precision receiver ===
    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.6),
      metalMat
    );
    this.weaponViewModel!.add(gunBody);

    // === TOP RAIL (Picatinny-style) ===
    const topRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.006, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.6, roughness: 0.35 })
    );
    topRail.position.set(0, 0.025, -0.04);
    this.weaponViewModel!.add(topRail);

    // === BARREL — long, thin precision barrel ===
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.85,
      roughness: 0.15,
    });
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.3, 12),
      barrelMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.45;
    this.weaponViewModel!.add(barrel);

    // === BARREL FLUTING (decorative grooves on barrel) ===
    const flutingMat = new THREE.MeshStandardMaterial({
      color: 0x181828,
      metalness: 0.8,
      roughness: 0.2,
    });
    const fluting = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.18, 8),
      flutingMat
    );
    fluting.rotation.x = Math.PI / 2;
    fluting.position.z = -0.35;
    this.weaponViewModel!.add(fluting);

    // === MUZZLE BRAKE / SUPPRESSOR ===
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.009, 0.05, 10),
      barrelMat
    );
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = -0.62;
    this.weaponViewModel!.add(muzzle);

    // === MUZZLE BRAKE PORTS (4 slots) ===
    const portMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
    for (let i = 0; i < 4; i++) {
      const port = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.002, 0.008),
        portMat
      );
      const angle = (i / 4) * Math.PI * 2;
      port.position.set(
        Math.cos(angle) * 0.006,
        Math.sin(angle) * 0.006,
        -0.6
      );
      port.rotation.z = angle;
      this.weaponViewModel!.add(port);
    }

    // === SCOPE — larger cylindrical body ===
    const scopeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.65,
      roughness: 0.3,
    });
    const scopeBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.14, 12),
      scopeMat
    );
    scopeBody.rotation.x = Math.PI / 2;
    scopeBody.position.set(0, 0.045, -0.06);
    this.weaponViewModel!.add(scopeBody);

    // === SCOPE — objective lens housing (wider front bell) ===
    const objectiveBell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.02, 0.025, 12),
      scopeMat
    );
    objectiveBell.rotation.x = Math.PI / 2;
    objectiveBell.position.set(0, 0.045, -0.145);
    this.weaponViewModel!.add(objectiveBell);

    // === SCOPE — eyepiece (wider rear ring) ===
    const eyepiece = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.02, 0.02, 12),
      scopeMat
    );
    eyepiece.rotation.x = Math.PI / 2;
    eyepiece.position.set(0, 0.045, 0.025);
    this.weaponViewModel!.add(eyepiece);

    // === SCOPE LENS (front — objective, blue tinted) ===
    const lensFront = new THREE.Mesh(
      new THREE.CircleGeometry(0.022, 16),
      new THREE.MeshBasicMaterial({
        color: 0x5599dd,
        transparent: true,
        opacity: 0.45,
      })
    );
    lensFront.position.set(0, 0.045, -0.158);
    this.weaponViewModel!.add(lensFront);

    // === SCOPE LENS (back — eyepiece) ===
    const lensBack = new THREE.Mesh(
      new THREE.CircleGeometry(0.018, 12),
      new THREE.MeshBasicMaterial({
        color: 0x3366aa,
        transparent: true,
        opacity: 0.3,
      })
    );
    lensBack.position.set(0, 0.045, 0.035);
    lensBack.rotation.y = Math.PI;
    this.weaponViewModel!.add(lensBack);

    // === SCOPE MOUNT RINGS ===
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.7, roughness: 0.3 });
    const frontRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.003, 8, 12, Math.PI),
      ringMat
    );
    frontRing.position.set(0, 0.045, -0.1);
    frontRing.rotation.z = 0;
    this.weaponViewModel!.add(frontRing);
    const rearRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.003, 8, 12, Math.PI),
      ringMat
    );
    rearRing.position.set(0, 0.045, 0.0);
    this.weaponViewModel!.add(rearRing);

    // === ELEVATION TURRET (top of scope) ===
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.6, roughness: 0.35 });
    const elevationTurret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8),
      turretMat
    );
    elevationTurret.position.set(0, 0.068, -0.04);
    this.weaponViewModel!.add(elevationTurret);

    // === WINDAGE TURRET (right side of scope) ===
    const windageTurret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.01, 8),
      turretMat
    );
    windageTurret.rotation.z = Math.PI / 2;
    windageTurret.position.set(0.03, 0.045, -0.04);
    this.weaponViewModel!.add(windageTurret);

    // === BOLT HANDLE — right side, small cylinder ===
    const boltMat = new THREE.MeshStandardMaterial({
      color: 0x666677,
      metalness: 0.85,
      roughness: 0.2,
    });
    const boltShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.04, 8),
      boltMat
    );
    boltShaft.rotation.z = Math.PI / 2;
    boltShaft.position.set(0.03, 0, 0.08);
    this.weaponViewModel!.add(boltShaft);

    // Bolt knob
    const boltKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 8, 8),
      boltMat
    );
    boltKnob.position.set(0.052, 0, 0.08);
    this.weaponViewModel!.add(boltKnob);

    // === PISTOL GRIP — precision angled ===
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.04, 0.022),
      new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9, metalness: 0.1 })
    );
    grip.position.set(0, -0.04, 0.1);
    grip.rotation.x = 0.3;
    this.weaponViewModel!.add(grip);

    // === TRIGGER GUARD ===
    const guardGeo = new THREE.TorusGeometry(0.01, 0.002, 6, 8, Math.PI);
    const guardMesh = new THREE.Mesh(guardGeo, metalMat);
    guardMesh.position.set(0, -0.022, 0.06);
    guardMesh.rotation.x = Math.PI / 2;
    guardMesh.rotation.z = Math.PI;
    this.weaponViewModel!.add(guardMesh);

    // === TRIGGER ===
    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(0.003, 0.009, 0.003),
      metalMat
    );
    trigger.position.set(0, -0.018, 0.06);
    this.weaponViewModel!.add(trigger);

    // === STOCK — precision adjustable stock ===
    const stockMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a4a,
      roughness: 0.85,
      metalness: 0.15,
    });
    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.05, 0.15),
      stockMat
    );
    stock.position.set(0, -0.005, 0.38);
    this.weaponViewModel!.add(stock);

    // === STOCK — adjustable cheek rest ===
    const cheekRest = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.015, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.8 })
    );
    cheekRest.position.set(0, 0.032, 0.36);
    this.weaponViewModel!.add(cheekRest);

    // === STOCK BUTT PLATE ===
    const buttPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.055, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.95 })
    );
    buttPlate.position.set(0, -0.005, 0.46);
    this.weaponViewModel!.add(buttPlate);

    // === BIPOD LEGS (folded, hanging below barrel) ===
    const bipodMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.7, roughness: 0.3 });
    const leftLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, 0.06, 6),
      bipodMat
    );
    leftLeg.position.set(-0.012, -0.025, -0.22);
    leftLeg.rotation.x = -0.4;
    leftLeg.rotation.z = 0.15;
    this.weaponViewModel!.add(leftLeg);
    const rightLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, 0.06, 6),
      bipodMat
    );
    rightLeg.position.set(0.012, -0.025, -0.22);
    rightLeg.rotation.x = -0.4;
    rightLeg.rotation.z = -0.15;
    this.weaponViewModel!.add(rightLeg);
  }

  // ============================================================
  // INPUT
  // ============================================================

  private inputHandlers: Array<{ type: string; handler: (e: any) => void }> = [];

  private setupInput(): void {
    // Store bound handlers for cleanup
    const kd = (e: KeyboardEvent) => this.onKeyDown(e);
    const ku = (e: KeyboardEvent) => this.onKeyUp(e);
    const mm = (e: MouseEvent) => this.onMouseMove(e);
    const md = (e: MouseEvent) => this.onMouseDown(e);
    const mu = (e: MouseEvent) => this.onMouseUp(e);
    const wh = (e: WheelEvent) => this.onWheel(e);

    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    window.addEventListener('wheel', wh, { passive: false });

    this.inputHandlers = [
      { type: 'keydown', handler: kd },
      { type: 'keyup', handler: ku },
      { type: 'mousemove', handler: mm },
      { type: 'mousedown', handler: md },
      { type: 'mouseup', handler: mu },
      { type: 'wheel', handler: wh },
    ];
  }

  public cleanupInput(): void {
    for (const h of this.inputHandlers) {
      window.removeEventListener(h.type, h.handler);
    }
    this.inputHandlers = [];
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.keys[e.code] = true;
    
    // --- TACTICAL COMMAND WHEEL (` key) ---
    if (e.code === 'Backquote') {
      e.preventDefault();
      this.commandWheelOpen = !this.commandWheelOpen;
      if (this.onCommandWheelToggle) {
        this.onCommandWheelToggle(this.commandWheelOpen);
      }
      return; // Don't process other keys while toggling wheel
    }

    // --- COMMAND WHEEL SELECTION (1-4 when wheel is open) ---
    if (this.commandWheelOpen) {
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
        const cmd = parseInt(e.code.replace('Digit', '')) as 1 | 2 | 3 | 4;
        // Close the command wheel
        this.commandWheelOpen = false;
        if (this.onCommandWheelToggle) {
          this.onCommandWheelToggle(false);
        }
        // Execute the command
        if (this.onTacticalCommand) {
          this.onTacticalCommand(cmd);
        }
      }
      return; // Block all other inputs while command wheel is open
    }
    
    if (e.code === 'KeyC' || e.code === 'ControlLeft') {
      this.isProne = false;
      this.isCrouching = !this.isCrouching;
    }
    if (e.code === 'KeyX') {
      this.isCrouching = false;
      this.isProne = !this.isProne;
    }
    if (e.code === 'Space') {
      // Jump — only when grounded and not prone
      if (!this.isJumping && !this.isProne) {
        this.isJumping = true;
        this.jumpVelocity = this.JUMP_FORCE;
        // Cancel crouch on jump
        this.isCrouching = false;
        e.preventDefault(); // Prevent page scroll
      }
    }
    if (e.code === 'ShiftLeft') {
      // Shift = Sprint (when not scoped) or Hold Breath (when scoped with sniper)
      if (this.isADS && this.onIsSniper && this.onIsSniper()) {
        // Only allow hold breath when fully refilled
        if (this.breathHoldTime >= this.MAX_BREATH_HOLD) {
          this.isHoldingBreath = true;
        }
      } else {
        this.isSprinting = true;
      }
    }

    // --- LEAN LEFT (Q) — hold to lean, release to reset ---
    // Body shifts LEFT (-2.0), camera rolls RIGHT (+15°)
    if (e.code === 'KeyQ' && !this.commandWheelOpen && !this.isRescuing) {
      this.leanAngle = this.LEAN_ANGLE; // Roll RIGHT (+15°)
      this.leanOffset = -2.0; // Body shifts LEFT (-2.0)
      this.isLeaningLeft = true;
      this.isLeaningRight = false;
      if (this.canvas && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
      if (this.onLeanChange) this.onLeanChange('left');
    }

    // --- LEAN RIGHT (E) — hold to lean, release to reset ---
    // Body shifts RIGHT (+2.0), camera rolls LEFT (-15°)
    if (e.code === 'KeyE' && !this.commandWheelOpen && !this.isRescuing) {
      this.leanAngle = -this.LEAN_ANGLE; // Roll LEFT (-15°)
      this.leanOffset = 2.0; // Body shifts RIGHT (+2.0)
      this.isLeaningRight = true;
      this.isLeaningLeft = false;
      if (this.canvas && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
      if (this.onLeanChange) this.onLeanChange('right');
    }

    // --- Weapon slot switching (1-4) ---
    if (e.code === 'Digit1') this.switchWeaponSlot(1);
    if (e.code === 'Digit2') this.switchWeaponSlot(2);
    if (e.code === 'Digit3') this.switchWeaponSlot(3);
    if (e.code === 'Digit4') this.switchWeaponSlot(4);

    // --- Night Vision toggle (V key) ---
    if (e.code === 'KeyV') {
      // Toggle night vision — per-character with battery
      if (this.isNightVision) {
        // Turn OFF
        this.isNightVision = false;
      } else if (this.nvBattery > 10) {
        // Turn ON (need at least 10% battery)
        this.isNightVision = true;
      }
      if (this.onNightVisionToggle) {
        this.onNightVisionToggle(this.isNightVision);
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
    if (e.code === 'ShiftLeft') {
      this.isSprinting = false;
      this.isHoldingBreath = false;
      this.breathHoldTime = 0;
    }
    // Lean reset on key release (hold-based lean)
    if (e.code === 'KeyQ' && this.isLeaningLeft) {
      this.leanAngle = 0;
      this.leanOffset = 0;
      this.isLeaningLeft = false;
      if (this.onLeanChange) this.onLeanChange('none');
    }
    if (e.code === 'KeyE' && this.isLeaningRight) {
      this.leanAngle = 0;
      this.leanOffset = 0;
      this.isLeaningRight = false;
      if (this.onLeanChange) this.onLeanChange('none');
    }
  }

  private onMouseMove(e: MouseEvent): void {
    // Always allow mouse look — no restrictions
    let sensitivity = 0.002;
    if (this.isProne) sensitivity *= PRONE_SENSITIVITY_MULT;
    if (this.isADS && this.onIsSniper && this.onIsSniper()) {
      sensitivity *= 0.3 / this.scopeZoomLevel;
    }
    const char = this.characters[this.activeCharacter];
    
    char.rotation.y -= e.movementX * sensitivity;
    char.rotation.x -= e.movementY * sensitivity;
    char.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, char.rotation.x));
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      // Left click — Shoot (requires pointer lock)
      const hasLock = this.canvas && document.pointerLockElement === this.canvas;
      const isLeaning = this.leanAngle !== 0;
      
      if (!hasLock && !isLeaning) {
        return;
      }
      
      if (this.onShoot) {
        this.onShoot();
      }
    } else if (e.button === 2) {
      // Right click — ADS or Scope Toggle
      if (!this.canvas || document.pointerLockElement !== this.canvas) return;
      if (this.onIsSniper && this.onIsSniper()) {
        this.isADS = !this.isADS;
        if (this.isADS) {
          this.scopeZoomLevel = 5;
        }
      } else {
        this.isADS = true;
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 2) {
      if (!(this.onIsSniper && this.onIsSniper())) {
        // Only release ADS for non-sniper weapons (sniper toggles)
        this.isADS = false;
      }
    }
  }

  private onWheel(e: WheelEvent): void {
    // Scope zoom with scroll wheel (only when in scope mode)
    if (this.isADS && this.onIsSniper && this.onIsSniper()) {
      // SNIPER: Scroll to zoom in/out (5x - 15x range)
      const zoomDelta = e.deltaY > 0 ? -0.5 : 0.5; // Half-step zoom for smooth feel
      const maxZoom = this.onGetMaxZoom ? this.onGetMaxZoom() : 15;
      this.scopeZoomLevel = Math.max(5, Math.min(maxZoom, this.scopeZoomLevel + zoomDelta));
      e.preventDefault();
      return;
    }
    
    // WEAPON SWITCH: Scroll to cycle weapon slots
    if (!this.canvas || document.pointerLockElement !== this.canvas) return;
    e.preventDefault();

    // Scroll up → next slot, scroll down → previous slot
    if (e.deltaY > 0) {
      // Scroll down → cycle prev
      const prevSlot = this.currentWeaponSlot <= 1 ? 4 : this.currentWeaponSlot - 1;
      this.switchWeaponSlot(prevSlot);
    } else if (e.deltaY < 0) {
      // Scroll up → cycle next
      const nextSlot = this.currentWeaponSlot >= 4 ? 1 : this.currentWeaponSlot + 1;
      this.switchWeaponSlot(nextSlot);
    }
  }

  // ============================================================
  // WEAPON SLOT SWITCHING
  // ============================================================

  /**
   * Switch to the given weapon slot (1-4).
   * Rebuilds the first-person view model and notifies listeners.
   */
  public switchWeaponSlot(slot: number): void {
    if (slot < 1 || slot > 4 || slot === this.currentWeaponSlot) return;

    this.previousWeaponSlot = this.currentWeaponSlot;
    this.currentWeaponSlot = slot;

    // Remove old view model from camera
    if (this.weaponViewModel && this.weaponViewModel.parent) {
      this.weaponViewModel.parent.remove(this.weaponViewModel);
    }

    // Rebuild first-person view model for the new weapon
    this.createWeaponViewModel();

    // Notify weapon system
    if (this.onWeaponSlotChange) {
      this.onWeaponSlotChange(slot);
    }
  }

  /**
   * Returns the current weapon slot (1-4).
   */
  public getWeaponSlot(): number {
    return this.currentWeaponSlot;
  }

  // ============================================================
  // COMBAT FEEL — Public Recoil Trigger
  // ============================================================

  /**
   * Add weapon recoil kick.  Call this from the shooting system
   * (e.g. inside the onShoot callback or weapon fire logic).
   *
   * Pitch is always upward; yaw is random left/right to simulate
   * horizontal kick.  ADS reduces the pitch kick because the
   * player is more braced.
   */
  public addRecoil(): void {
    // Pitch — always upward (positive = look up)
    const pitchKick = this.isADS ? RECOIL_PITCH_ADS : RECOIL_PITCH_HIP;
    this.recoilPitch += pitchKick;

    // Yaw — random horizontal kick
    const yawKick = (Math.random() * 2 - 1) * RECOIL_YAW_RANGE;
    this.recoilYaw += yawKick;
  }

  // ============================================================
  // COMBAT FEEL — Public Fire Kick Trigger
  // ============================================================

  /**
   * Trigger the brief weapon-view-model kick that accompanies each
   * shot.  Call alongside addRecoil() from the weapon fire system.
   * The kick is purely visual — it moves the viewModel backward on
   * Z and springs back over ~50 ms.
   */
  public triggerFireKick(): void {
    this.fireKickZ = FIRE_KICK_Z;
    this.fireKickStartTime = performance.now();
    this.fireKickActive = true;
  }

  // ============================================================
  // COMBAT FEEL — Shoot Screen Shake
  // ============================================================

  /**
   * Trigger a small camera vibration on every gunshot.
   * Much lighter than the damage screen shake — this is
   * purely about the feel of the weapon firing.
   */
  public triggerShootShake(): void {
    // Only increase — don't overwrite a stronger ongoing shake
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, FIRE_SHAKE_INTENSITY);
  }

  // ============================================================
  // RELOAD ANIMATION — Public API
  // ============================================================

  /**
   * Start the reload animation on the weapon view model.
   * The weapon dips down, tilts, then returns to rest position
   * over RELOAD_ANIM_DURATION seconds.  Call this from the weapon
   * system when a reload begins.
   */
  public startReloadAnimation(): void {
    this.reloadAnimActive = true;
    this.reloadAnimStartTime = performance.now();
    if (this.weaponViewModel) {
      this.reloadWeaponBasePos.copy(this.weaponViewModel.position);
    }
  }

  /** Whether the reload animation is currently playing. */
  public isReloadAnimating(): boolean {
    return this.reloadAnimActive;
  }

  /**
   * Returns 0–1 reload animation progress (0 = just started, 1 = done).
   * Returns 0 when no reload is active.
   */
  public getReloadAnimProgress(): number {
    if (!this.reloadAnimActive) return 0;
    const elapsed = (performance.now() - this.reloadAnimStartTime) / 1000;
    return Math.min(elapsed / RELOAD_ANIM_DURATION, 1);
  }

  // ============================================================
  // MOVEMENT & UPDATE
  // ============================================================

  private getMovementSpeed(): number {
    const base = this.characters[this.activeCharacter].data.speed;
    let speed = base;
    if (this.isProne) speed = base * 0.3;
    else if (this.isCrouching) speed = base * 0.5;
    else if (this.isSprinting) speed = base * 1.6;
    // Night vision penalty — much slower
    if (this.isNightVision) speed *= this.NV_SPEED_MULT;
    return speed;
  }

  /**
   * Returns the current stance height used for the collision box:
   *   Standing  → 1.7
   *   Crouching → 1.0
   *   Prone     → 0.5
   */
  private getStanceHeight(): number {
    return this.isProne ? 0.5 : this.isCrouching ? 1.0 : 1.7;
  }

  /**
   * Two-phase collision detection with step-up support.
   *
   * PHASE 1 — STEP-UP: For every collider whose world-space bounding-box
   *   top (max.y) is below STEP_THRESHOLD (1.2 units), check if the
   *   player's XZ footprint overlaps. If so, the player is raised to
   *   stand on top of the object (auto step-up). This covers rocks,
   *   sand dunes, tire stacks, and HESCO barriers.
   *
   * PHASE 2 — SOLID BLOCKING: For tall objects (max.y > STEP_THRESHOLD)
   *   such as walls, buildings, containers, and large rocks, the player
   *   is pushed out along the axis of smallest horizontal penetration.
   *
   * The method also enforces a floor at y = stanceHeight.
   */
  private checkCollision(newPos: THREE.Vector3, colliders: THREE.Mesh[]): THREE.Vector3 {
    const corrected = newPos.clone();
    const stanceHeight = this.getStanceHeight();

    // Maximum object height (from ground) that the player can step up onto.
    // Objects whose bounding-box top is below this value are treated as
    // stepable — the player automatically climbs onto them instead of
    // being blocked horizontally.
    const STEP_THRESHOLD = 1.2;

    // --- Terrain height floor: keep player above terrain surface ---
    const terrainY = this.terrainHeightProvider ? this.terrainHeightProvider(corrected.x, corrected.z) : 0;

    // --- Floor collision: keep camera.y >= terrain + stanceHeight so feet stay on ground ---
    if (corrected.y < terrainY + stanceHeight) {
      corrected.y = terrainY + stanceHeight;
    }

    // ================================================================
    // PHASE 1 — STEP-UP for low / climbable objects
    // Find the highest stepable surface whose XZ footprint contains the
    // player, then raise the player's Y to stand on top of it.
    // ================================================================
    let highestStepY = terrainY; // start from terrain level

    for (const collider of colliders) {
      const box = new THREE.Box3().setFromObject(collider);

      // Compute object's LOCAL height above terrain (not world Y)
      const objTerrainY = this.terrainHeightProvider 
        ? this.terrainHeightProvider(
            (box.min.x + box.max.x) / 2, 
            (box.min.z + box.max.z) / 2
          ) 
        : 0;
      const objLocalHeight = box.max.y - objTerrainY;

      // Only stepable objects (local height below threshold)
      if (objLocalHeight > STEP_THRESHOLD) continue;

      // Check if the player's horizontal position is within the object's footprint
      const inX = corrected.x >= box.min.x - this.PLAYER_RADIUS &&
                  corrected.x <= box.max.x + this.PLAYER_RADIUS;
      const inZ = corrected.z >= box.min.z - this.PLAYER_RADIUS &&
                  corrected.z <= box.max.z + this.PLAYER_RADIUS;

      if (inX && inZ) {
        highestStepY = Math.max(highestStepY, box.max.y);
      }
    }

    // Place the player on top of the highest stepable surface,
    // but NEVER lower the player below their current position.
    // This preserves jump height — without this guard, the collision
    // check would snap the player back to ground every frame mid-jump.
    const stepLevelY = Math.max(highestStepY + stanceHeight, stanceHeight);
    corrected.y = Math.max(corrected.y, stepLevelY);

    // ================================================================
    // PHASE 2 — SOLID BLOCKING for tall objects
    // Walls, buildings, containers, large rocks, etc. push the player
    // out along the axis of smallest horizontal penetration.
    // ================================================================
    const expandedBox = new THREE.Box3();

    for (const collider of colliders) {
      const box = new THREE.Box3().setFromObject(collider);

      // Compute object's LOCAL height above terrain
      const objTerrainY = this.terrainHeightProvider 
        ? this.terrainHeightProvider(
            (box.min.x + box.max.x) / 2, 
            (box.min.z + box.max.z) / 2
          ) 
        : 0;
      const objLocalHeight = box.max.y - objTerrainY;

      // Skip stepable objects — they don't cause horizontal blocking
      if (objLocalHeight <= STEP_THRESHOLD) continue;

      // Expand outward by PLAYER_RADIUS on horizontal axes
      expandedBox.copy(box);
      expandedBox.min.x -= this.PLAYER_RADIUS;
      expandedBox.max.x += this.PLAYER_RADIUS;
      expandedBox.min.z -= this.PLAYER_RADIUS;
      expandedBox.max.z += this.PLAYER_RADIUS;

      // Vertical overlap: the player's body (feet → head) must overlap
      // the object's vertical extent for horizontal blocking to apply.
      const playerFeet = corrected.y - stanceHeight;
      const playerHead = corrected.y;
      if (playerFeet >= box.max.y || playerHead <= box.min.y) continue;

      // Check if corrected XZ position is inside the expanded footprint
      if (
        corrected.x >= expandedBox.min.x &&
        corrected.x <= expandedBox.max.x &&
        corrected.z >= expandedBox.min.z &&
        corrected.z <= expandedBox.max.z
      ) {
        // Compute penetration depth on horizontal axes only
        const penLeft  = corrected.x - expandedBox.min.x;
        const penRight = expandedBox.max.x - corrected.x;
        const penFront = corrected.z - expandedBox.min.z;
        const penBack  = expandedBox.max.z - corrected.z;

        const minPen = Math.min(penLeft, penRight, penFront, penBack);

        if (minPen === penLeft) {
          corrected.x = expandedBox.min.x - 0.001;
        } else if (minPen === penRight) {
          corrected.x = expandedBox.max.x + 0.001;
        } else if (minPen === penFront) {
          corrected.z = expandedBox.min.z - 0.001;
        } else {
          corrected.z = expandedBox.max.z + 0.001;
        }
      }
    }

    return corrected;
  }

  public update(delta: number, camera: THREE.PerspectiveCamera): void {
    const char = this.characters[this.activeCharacter];
    
    // === Movement ===
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    
    const euler = new THREE.Euler(0, char.rotation.y, 0, 'YXZ');
    forward.applyEuler(euler);
    right.applyEuler(euler);
    
    const moveDir = new THREE.Vector3();
    if (this.keys['KeyW']) moveDir.add(forward);
    if (this.keys['KeyS']) moveDir.sub(forward);
    if (this.keys['KeyA']) moveDir.sub(right);
    if (this.keys['KeyD']) moveDir.add(right);
    
    if (moveDir.length() > 0) {
      moveDir.normalize();
      this.isMoving = true;
    } else {
      this.isMoving = false;
    }
    
    const speed = this.getMovementSpeed();
    char.position.x += moveDir.x * speed * delta;
    char.position.z += moveDir.z * speed * delta;
    
    // === JUMP PHYSICS ===
    const terrainY = this.terrainHeightProvider ? this.terrainHeightProvider(char.position.x, char.position.z) : 0;
    const stanceHeight = this.isProne ? 0.5 : this.isCrouching ? 1.0 : 1.7;
    const groundY = terrainY + stanceHeight;
    
    if (this.isJumping) {
      // Apply gravity
      this.jumpVelocity += this.GRAVITY * delta;
      char.position.y += this.jumpVelocity * delta;
      
      // Land when below ground level
      if (char.position.y <= groundY) {
        char.position.y = groundY;
        this.jumpVelocity = 0;
        this.isJumping = false;
      }
    } else {
      // Smoothly move to stance height (on ground)
      char.position.y += (groundY - char.position.y) * STANCE_HEIGHT_LERP_SPEED * delta;
    }
    
    // Head bob
    if (this.isMoving && !this.isProne) {
      this.headBob += delta * (this.isSprinting ? 12 : 8);
      const bobAmount = this.isCrouching ? 0.015 : 0.03;
      char.position.y += Math.sin(this.headBob) * bobAmount;

      // ---- FOOTSTEP SOUND TRIGGER ----
      // Distance-based: fire a footstep when the player has moved enough since last step
      // Adjust distance threshold based on stance
      const footstepDist = this.isProne ? this.FOOTSTEP_DISTANCE * 1.2 : 
                           this.isCrouching ? this.FOOTSTEP_DISTANCE * 1.08 :  // ≈ 2.6 units
                           this.isSprinting ? this.FOOTSTEP_DISTANCE * 0.8 : 
                           this.FOOTSTEP_DISTANCE;
      
      const distanceSinceLastFootstep = char.position.distanceTo(this.lastFootstepPosition);
      if (distanceSinceLastFootstep >= footstepDist) {
        // Pass stance info for volume control
        const stance = this.isProne ? 'prone' : this.isCrouching ? 'crouch' : 'stand';
        if (this.onFootstep) {
          this.onFootstep('sand');
        } else if (this.audioManager) {
          this.audioManager.playFootstepWithStance('sand', stance);
        }
        this.lastFootstepPosition.copy(char.position);
      }

      // Legacy phase-based fallback (coexists with distance-based)
      if (this.onFootstep && this.footstepCooldown <= 0) {
        const phase = Math.sin(this.headBob);
        if (this.lastFootstepPhase > 0 && phase <= 0) {
          // Only fire if distance-based hasn't already triggered this step
          if (distanceSinceLastFootstep < this.FOOTSTEP_DISTANCE * 0.5) {
            // Skip — distance-based already handled it
          }
        }
        this.lastFootstepPhase = phase;
      }
      if (this.footstepCooldown > 0) {
        this.footstepCooldown -= delta;
      }
    } else {
      this.lastFootstepPhase = 0;
      this.footstepCooldown = 0;
      // Reset footstep position tracking when stationary
      this.lastFootstepPosition.copy(char.position);
    }

    // === COLLISION DETECTION ===
    // Build candidate position and resolve against world colliders
    if (this.colliders.length > 0) {
      const corrected = this.checkCollision(char.position.clone(), this.colliders);
      char.position.copy(corrected);
    }
    
    // === Animate third person model ===
    this.animateCharacter(char, delta);
    
    // Also animate inactive character (so stance changes are visible when switched)
    const inactiveType = this.activeCharacter === 'wolf' ? 'falcon' : 'wolf';
    this.animateCharacter(this.characters[inactiveType], delta);
    
    // === Update camera to active character ===
    camera.position.copy(char.position);
    camera.position.y += 0.15; // Slight offset for first person view
    
    // ---- SCREEN SHAKE ----
    if (this.screenShakeIntensity > 0.001) {
      const shakeX = (Math.random() - 0.5) * 2 * this.screenShakeIntensity * 0.12;
      const shakeY = (Math.random() - 0.5) * 2 * this.screenShakeIntensity * 0.08;
      camera.position.x += shakeX;
      camera.position.y += shakeY;
      this.screenShakeIntensity *= FIRE_SHAKE_DECAY;
    } else {
      this.screenShakeIntensity = 0;
    }

    // ---- RECOIL OFFSET (legacy vertical camera displacement) ----
    if (this.recoilOffset > 0.0005) {
      camera.position.y += this.recoilOffset;
      this.recoilOffset *= 0.85;
    } else {
      this.recoilOffset = 0;
    }
    
    // ============================================================
    // CAMERA ROTATION — mouse look + recoil applied AFTER
    // ============================================================
    camera.rotation.order = 'YXZ';
    camera.rotation.y = char.rotation.y;
    camera.rotation.x = char.rotation.x;

    // --- Apply recoil pitch & yaw on top of mouse look ---
    if (Math.abs(this.recoilPitch) > RECOIL_THRESHOLD) {
      camera.rotation.x += this.recoilPitch;
      this.recoilPitch *= RECOIL_DECAY;
    } else {
      this.recoilPitch = 0;
    }

    if (Math.abs(this.recoilYaw) > RECOIL_THRESHOLD) {
      camera.rotation.y += this.recoilYaw;
      this.recoilYaw *= RECOIL_DECAY;
    } else {
      this.recoilYaw = 0;
    }

    // --- Prone camera tilt (pitch down slightly — looks forward while lying) ---
    const targetPronePitch = this.isProne ? PRONE_PITCH_OFFSET : 0;
    this.currentPronePitchOffset += (targetPronePitch - this.currentPronePitchOffset) * PRONE_PITCH_LERP_SPEED * delta;
    if (Math.abs(this.currentPronePitchOffset) > 0.0001) {
      camera.rotation.x += this.currentPronePitchOffset;
    }

    // --- Sniper Scope Sway (breathing) ---
    if (this.isADS && this.onIsSniper && this.onIsSniper()) {
      // Breath system: hold to decrease, release to refill
      if (this.isHoldingBreath && this.breathHoldTime > 0) {
        // Holding: decrease breath
        this.breathHoldTime -= delta;
        if (this.breathHoldTime <= 0) {
          this.breathHoldTime = 0;
          this.isHoldingBreath = false; // Force release when depleted
        }
      } else if (!this.isHoldingBreath && this.breathHoldTime < this.MAX_BREATH_HOLD) {
        // Not holding: refill breath
        this.breathHoldTime = Math.min(this.MAX_BREATH_HOLD, this.breathHoldTime + delta * this.breathRefillRate);
      }

      // Sway amplitude: reduced when holding breath, normal when not
      const swayAmplitude = this.isHoldingBreath ? 0.001 : 0.008;
      const swaySpeed = this.isHoldingBreath ? 0.5 : 1.5;

      this.scopeSwayTime += delta * swaySpeed;
      this.scopeSwayX = Math.sin(this.scopeSwayTime * 1.2) * swayAmplitude;
      this.scopeSwayY = Math.cos(this.scopeSwayTime * 0.8) * swayAmplitude * 0.7;

      camera.rotation.x += this.scopeSwayY;
      camera.rotation.y += this.scopeSwayX;
    } else {
      // Reset sway when not scoped
      this.scopeSwayTime = 0;
      this.scopeSwayX = 0;
      this.scopeSwayY = 0;
      this.isHoldingBreath = false;
      this.breathHoldTime = 0;
    }

    // ============================================================
    // LEAN — Camera roll + position offset (rotate from feet)
    // ============================================================
    this.leanTargetAngle = this.leanAngle;
    
    // Smooth camera roll
    if (Math.abs(camera.rotation.z - this.leanTargetAngle) > 0.001) {
      camera.rotation.z += (this.leanTargetAngle - camera.rotation.z) * this.LEAN_LERP_SPEED * delta;
    }
    
    // Position offset — body shifts sideways (leanOffset set by Q/E keydown)
    const targetX = char.position.x + this.leanOffset;
    camera.position.x += (targetX - camera.position.x) * this.LEAN_LERP_SPEED * delta;
    
    // ============================================================
    // ADS — smooth FOV transition (sniper uses scope zoom, NV uses slight zoom)
    // ============================================================
    let targetFOV = this.baseFOV;
    if (this.isADS) {
      if (this.onIsSniper && this.onIsSniper()) {
        // Sniper: FOV based on zoom level
        targetFOV = this.baseFOV / this.scopeZoomLevel;
      } else {
        targetFOV = this.adsFOV;
      }
    } else if (this.isNightVision) {
      // Night vision: slight zoom (like binoculars)
      targetFOV = this.NV_ZOOM_FOV;
    }
    this.currentFOV += (targetFOV - this.currentFOV) * ADS_LERP_SPEED * delta;
    camera.fov = this.currentFOV;
    camera.updateProjectionMatrix();
    
    // ============================================================
    // WEAPON VIEW MODEL — position, sway, fire kick, ADS
    // ============================================================
    if (this.weaponViewModel) {
      // --- Target position based on ADS state ---
      const weaponTarget = this.isADS
        ? WEAPON_POS_ADS.clone()
        : WEAPON_POS_HIP.clone();

      // --- Weapon sway ---
      if (this.isMoving) {
        // Moving sway follows the head-bob rhythm
        const swayX = Math.sin(this.headBob * 0.5) * MOVE_SWAY_AMP_X;
        const swayY = Math.abs(Math.cos(this.headBob * 0.5)) * MOVE_SWAY_AMP_Y;
        weaponTarget.x += swayX;
        weaponTarget.y += swayY;
      } else {
        // Idle sway — gentle sinusoidal breathing motion (X, Y, and Z for depth)
        this.swayTime += delta;
        const idleSwayX = Math.sin(this.swayTime * IDLE_SWAY_FREQ_X * Math.PI * 2) * IDLE_SWAY_AMP_X;
        const idleSwayY = Math.sin(this.swayTime * IDLE_SWAY_FREQ_Y * Math.PI * 2) * IDLE_SWAY_AMP_Y;
        const idleSwayZ = Math.sin(this.swayTime * IDLE_SWAY_FREQ_Z * Math.PI * 2) * IDLE_SWAY_AMP_Z;
        weaponTarget.x += idleSwayX;
        weaponTarget.y += idleSwayY;
        weaponTarget.z += idleSwayZ;
      }

      // --- Sprint weapon lowering — weapon drops and pushes forward ---
      if (this.isSprinting && !this.isADS) {
        weaponTarget.y += SPRINT_WEAPON_DROP_Y;
        weaponTarget.z += SPRINT_WEAPON_PUSH_Z;
      }

      // --- Fire kick (visual Z displacement) ---
      if (this.fireKickActive) {
        const elapsed = performance.now() - this.fireKickStartTime;
        if (elapsed < FIRE_KICK_RECOVER_MS) {
          // Linear lerp back toward zero over the recovery window
          const t = elapsed / FIRE_KICK_RECOVER_MS;
          weaponTarget.z += this.fireKickZ * (1 - t);
        } else {
          // Kick complete
          this.fireKickZ = 0;
          this.fireKickActive = false;
        }
      }

      // --- Reload animation — 4-phase magazine ejection curve (2.0s total) ---
      //
      // Phase 1  0.00–0.25s  (0–12.5%)  Magazine ejection
      //   Weapon dips DOWN + RIGHT + slight backward push, muzzle tilts down.
      //   Simulates slapping the mag release and pulling the old mag free.
      //
      // Phase 2  0.25–0.50s  (12.5–25%) New magazine insertion
      //   Weapon holds at bottom, gentle lateral wobble as fresh mag seats.
      //
      // Phase 3  0.50–0.75s  (25–50%)  Ready return
      //   Weapon arcs back UP + LEFT toward rest position.
      //
      // Phase 4  0.75–1.00s  (50–100%) Idle settle
      //   Weapon overshoots slightly then eases into rest —
      //   subtle Z-axis settle for tactile weight.
      //
      if (this.reloadAnimActive) {
        const elapsed = (performance.now() - this.reloadAnimStartTime) / 1000;
        const t = Math.min(elapsed / RELOAD_ANIM_DURATION, 1);

        // --- Phase 1: magazine ejection (0 → 0.25) ---
        if (t < 0.25) {
          const p = t / 0.25;                       // 0→1 within phase
          const ease = p * p * (3 - 2 * p);         // smoothstep ease-in
          weaponTarget.y -= 0.14 * ease;              // dip down
          weaponTarget.x += 0.06 * ease;              // drift right (mag ejection)
          weaponTarget.z += 0.06 * ease;              // slight backward push
          this.weaponViewModel.rotation.x = -0.02 + 0.30 * ease;   // muzzle tilts down
          this.weaponViewModel.rotation.z = -0.04 * ease;          // slight roll right

        // --- Phase 2: new magazine insertion (0.25 → 0.50) ---
        } else if (t < 0.50) {
          const p = (t - 0.25) / 0.25;              // 0→1 within phase
          // Gentle wobble at the bottom — lateral shake as mag seats
          const wobble = Math.sin(p * Math.PI * 3) * 0.012 * (1 - p);
          weaponTarget.y -= 0.14;
          weaponTarget.x += 0.06 + wobble;           // slight lateral wobble
          weaponTarget.z += 0.06;
          this.weaponViewModel.rotation.x = 0.28;    // hold muzzle-down tilt
          this.weaponViewModel.rotation.z = -0.04 + wobble * 2;

        // --- Phase 3: ready return (0.50 → 0.75) ---
        } else if (t < 0.75) {
          const p = (t - 0.50) / 0.25;              // 0→1 within phase
          const ease = 1 - Math.pow(1 - p, 3);      // cubic ease-out
          weaponTarget.y -= 0.14 * (1 - ease);       // arc back up
          weaponTarget.x += 0.06 * (1 - ease);       // drift back left
          weaponTarget.z += 0.06 * (1 - ease);       // push forward to rest
          this.weaponViewModel.rotation.x = 0.28 * (1 - ease);
          this.weaponViewModel.rotation.z = -0.04 * (1 - ease);

        // --- Phase 4: idle settle (0.75 → 1.0) ---
        } else {
          const p = (t - 0.75) / 0.25;              // 0→1 within phase
          // Subtle overshoot-and-settle on Z axis (weight feel)
          const settle = Math.sin(p * Math.PI) * 0.008 * (1 - p);
          weaponTarget.z += settle;
          // Nudge weapon to exact rest
          this.weaponViewModel.rotation.x *= (1 - p);
          this.weaponViewModel.rotation.z *= (1 - p);

          // Mark animation complete at t = 1
          if (t >= 1) {
            this.reloadAnimActive = false;
            this.weaponViewModel.rotation.x = 0;
            this.weaponViewModel.rotation.z = 0;
          }
        }
      }

      // --- Lean weapon X offset ---
      if (this.leanAngle !== 0 && !this.isCrouching && !this.isProne) {
        const leanWeaponDir = this.leanAngle < 0 ? -1 : 1;
        weaponTarget.x += leanWeaponDir * this.LEAN_WEAPON_OFFSET;
      }

      // --- Lerp weapon to target position (smooth ADS + sway + kick) ---
      this.weaponViewModel.position.lerp(weaponTarget, ADS_LERP_SPEED * delta);
      
      // --- Smooth weapon rotation toward ADS pitch (skip during reload anim) ---
      if (!this.reloadAnimActive) {
        let targetRotX = this.isADS ? -0.02 : 0;
        // Sprint tilt — muzzle tilts slightly upward when sprinting
        if (this.isSprinting && !this.isADS) {
          targetRotX = SPRINT_WEAPON_TILT_X;
        }
        this.weaponViewModel.rotation.x += (targetRotX - this.weaponViewModel.rotation.x) * ADS_LERP_SPEED * delta;
      }

      camera.add(this.weaponViewModel);
    }

    // ---- NV BATTERY DRAIN/CHARGE ----
    if (this.isNightVision) {
      this.nvBattery = Math.max(0, this.nvBattery - this.NV_DRAIN_RATE * delta);
      if (this.nvBattery <= 0) {
        // Auto-off when battery depleted
        this.isNightVision = false;
        if (this.onNightVisionToggle) this.onNightVisionToggle(false);
        console.log('[Player] Night Vision OFF — battery depleted');
      }
    } else {
      // Recharge when off
      this.nvBattery = Math.min(100, this.nvBattery + this.NV_CHARGE_RATE * delta);
    }

    // ---- LOW HEALTH VIGNETTE ----
    if (this.damageIndicators.lowHealthVignette) {
      const activeHealth = this.getHealth();
      const activeMax = this.getMaxHealth();
      if (activeHealth < 30 && activeHealth > 0) {
        this.damageIndicators.lowHealthVignette.classList.add('active');
      } else {
        this.damageIndicators.lowHealthVignette.classList.remove('active');
      }
    }
  }

  private animateCharacter(char: any, delta: number): void {
    const group = char.group;
    const leftArm = group.userData.leftArm;
    const rightArm = group.userData.rightArm;
    const leftLeg = group.userData.leftLeg;
    const rightLeg = group.userData.rightLeg;
    const body = group.userData.body;
    const head = group.userData.head;
    
    if (!leftArm || !rightArm || !leftLeg || !rightLeg) return;

    // FIX 5: Additional null safety for body/head (fallback model may not have these)
    if (!body || !head) {
      // Minimal animation — just update world position
      const terrainYChar = this.terrainHeightProvider ? this.terrainHeightProvider(char.position.x, char.position.z) : 0;
      group.position.set(char.position.x, group.position.y + terrainYChar, char.position.z);
      group.rotation.y = char.rotation.y;
      return;
    }

    // === STANCE ANIMATION ===
    const isThisCharCrouching = char.isCrouching;
    const isThisCharProne = char.isProne;

    if (isThisCharProne) {
      // PRONE: Character lies flat on ground
      // Rotate entire group to lay face-down
      const targetRotX = -Math.PI / 2; // 90 degrees forward
      group.rotation.x += (targetRotX - group.rotation.x) * 5 * delta;
      
      // Keep legs straight, arms forward (weapon ready)
      leftLeg.rotation.x = 0;
      rightLeg.rotation.x = 0;
      leftArm.rotation.x = -1.2; // Arms forward
      rightArm.rotation.x = -1.2;
      
      // Position on ground
      group.position.y = 0.2; // Slightly above ground to avoid clipping
      
    } else if (isThisCharCrouching) {
      // CROUCH: Knees bent, body lowered
      group.rotation.x *= 0.9; // Reset prone rotation smoothly
      
      // Bend legs significantly
      const crouchBend = -0.8;
      leftLeg.rotation.x += (crouchBend - leftLeg.rotation.x) * 8 * delta;
      rightLeg.rotation.x += (crouchBend - rightLeg.rotation.x) * 8 * delta;
      
      // Arms lower slightly
      leftArm.rotation.x += (-0.3 - leftArm.rotation.x) * 5 * delta;
      rightArm.rotation.x += (-0.3 - rightArm.rotation.x) * 5 * delta;
      
      // Lower body group
      group.position.y = 0; // Ground level, legs do the crouching
      
    } else {
      // STANDING: Reset everything
      group.rotation.x *= 0.9;
      
      // Only animate walk cycle for the ACTIVE character
      // Inactive characters have their animations set by the teammate AI system
      // (animateTeammateIdle, animateTeammateWalk, etc.) — we must NOT apply
      // the *= 0.9 idle decay here, because it fights with and dampens those
      // AI-driven animations, making idle body sway, head look, and weapon
      // ready-poses nearly invisible.
      const isActiveChar = char.isActive;

      if (isActiveChar && this.isMoving) {
        // Walking animation — only for the character being controlled
        const walkSpeed = this.isSprinting ? 8 : 5;
        const walkAmount = this.isSprinting ? 0.4 : 0.25;

        const legSwing = Math.sin(this.headBob * walkSpeed) * walkAmount;
        leftLeg.rotation.x = legSwing;
        rightLeg.rotation.x = -legSwing;

        // Arm swing
        leftArm.rotation.x = -legSwing * 0.5;
        rightArm.rotation.x = legSwing * 0.3;
      } else if (isActiveChar) {
        // Active character idle — gentle decay toward rest pose
        leftLeg.rotation.x *= 0.9;
        rightLeg.rotation.x *= 0.9;
        leftArm.rotation.x *= 0.9;
        rightArm.rotation.x *= 0.9;
      }
      // Inactive (AI-controlled) characters: skip rotation decay here.
      // The teammate AI animation system (updateInactiveAI → animateTeammate*)
      // handles all limb, body, and head rotations with visible, life-like
      // motion including body sway, weight shift, head tracking, and weapon
      // ready-poses. Applying *= 0.9 here would cancel those animations.
      
      group.position.y = 0;
    }
    
    // Update world position — include terrain height offset for third-person models
    const terrainYChar = this.terrainHeightProvider ? this.terrainHeightProvider(char.position.x, char.position.z) : 0;
    if (!isThisCharProne) {
      group.position.set(char.position.x, group.position.y + terrainYChar, char.position.z);
    } else {
      group.position.set(char.position.x, 0.2 + terrainYChar, char.position.z);
    }
    if (!isThisCharProne) {
      group.rotation.y = char.rotation.y;
    } else {
      // In prone, keep the Y rotation from the character but X stays flat
      group.rotation.y = char.rotation.y;
    }
  }

  // ============================================================
  // CHARACTER SWITCHING
  // ============================================================

  public switchCharacter(type: CharacterType): void {
    // Save current weapon slot to the OLD character before switching
    this.characters[this.activeCharacter].lastSlot = this.currentWeaponSlot;
    
    // Hide current character's weapon view model
    if (this.weaponViewModel && this.weaponViewModel.parent) {
      this.weaponViewModel.parent.remove(this.weaponViewModel);
    }
    
    // Deactivate old character — show in world (third person visible)
    this.characters[this.activeCharacter].isActive = false;
    this.characters[this.activeCharacter].group.visible = true;
    
    // Activate new character — hide in world (first person, can't see yourself)
    this.activeCharacter = type;
    this.characters[type].isActive = true;
    this.characters[type].group.visible = false;
    
    // Restore the NEW character's persisted weapon slot
    this.currentWeaponSlot = this.characters[type].lastSlot;
    this.previousWeaponSlot = this.currentWeaponSlot;

    // Reset ADS and global state (stance persists per character)
    this.isADS = false;
    this.isSprinting = false;
    this.headBob = 0;

    // Reset lean on character switch
    this.leanAngle = 0;
    if (this.onLeanChange) this.onLeanChange('none');

    // Reset combat feel state on switch
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.fireKickZ = 0;
    this.fireKickActive = false;
    this.reloadAnimActive = false;
    this.swayTime = 0;
    // Smoothly reset prone pitch offset on switch (no snap)
    this.currentPronePitchOffset = 0;

    // Reset inactive AI state on character switch
    // The teammate that was in takeCover/hold/covering mode
    // reverts to follow mode when their controller changes
    if (this.inactiveAIState === 'takeCover' || this.inactiveAIState === 'hold') {
      this.inactiveAIState = 'follow';
      this.inactiveAICoverPos = null;
      this.inactiveAICoverCollider = null;
      this.inactiveAICrouchBlend = 0;
      this.inactiveAIIsCrouching = false;
      this.takeCoverTimer = 0;
      this.takeCoverPeeking = false;
      this.takeCoverPhase = 'running';
      this.followWasIdle = false;
      this.followResumeTimer = 0;
      this.coverLookAtLerp = 0;
      // POLISH: Reset cover entry delay on switch
      this.coverEntryDelayTimer = 0;
      this.coverEntryDelayDone = false;
      this.coverAlertTimer = 0;
      // POLISH #5: Remove cover indicator on switch
      this.updateCoverIndicator(this.characters[this.activeCharacter === 'wolf' ? 'falcon' : 'wolf']);
    }
    
    // Create fresh weapon view model for new character
    this.createWeaponViewModel();
  }

  public getActiveCharacter(): CharacterType {
    return this.activeCharacter;
  }

  // ============================================================
  // PUBLIC GETTERS
  // ============================================================

  public getPosition(): THREE.Vector3 {
    return this.characters[this.activeCharacter].position.clone();
  }

  public getRotation(): THREE.Euler {
    return this.characters[this.activeCharacter].rotation.clone();
  }

  // Health — active character
  public getHealth(): number {
    return this.activeCharacter === 'wolf' ? this.wolfHealth : this.falconHealth;
  }
  public setHealth(value: number): void {
    if (this.activeCharacter === 'wolf') {
      this.wolfHealth = Math.max(0, Math.min(this.wolfMaxHealth, value));
    } else {
      this.falconHealth = Math.max(0, Math.min(this.falconMaxHealth, value));
    }
  }
  public getMaxHealth(): number {
    return this.activeCharacter === 'wolf' ? this.wolfMaxHealth : this.falconMaxHealth;
  }
  public getArmor(): number { return this.activeCharacter === 'wolf' ? this.wolfArmor : this.falconArmor; }
  public getMaxArmor(): number { return this.activeCharacter === 'wolf' ? this.wolfMaxArmor : this.falconMaxArmor; }

  // Per-character armor accessors
  public getWolfArmor(): number { return this.wolfArmor; }
  public getWolfMaxArmor(): number { return this.wolfMaxArmor; }
  public getFalconArmor(): number { return this.falconArmor; }
  public getFalconMaxArmor(): number { return this.falconMaxArmor; }

  // Per-character health accessors
  public getWolfHealth(): number { return this.wolfHealth; }
  public getWolfMaxHealth(): number { return this.wolfMaxHealth; }
  public getFalconHealth(): number { return this.falconHealth; }
  public getFalconMaxHealth(): number { return this.falconMaxHealth; }

  // Downed state accessors
  public isWolfDowned(): boolean { return this.wolfIsDowned; }
  public isFalconDowned(): boolean { return this.falconIsDowned; }
  public isCharacterDowned(type: CharacterType): boolean {
    return type === 'wolf' ? this.wolfIsDowned : this.falconIsDowned;
  }
  public getDownedTimer(type: CharacterType): number {
    return type === 'wolf' ? this.wolfDownedTimer : this.falconDownedTimer;
  }

  // Rescue state
  public getRescueProgress(): number { return this.rescueProgress; }
  public getIsRescuing(): boolean { return this.isRescuing; }

  /**
   * Returns the CharacterType of the downed character, or null if none is downed.
   */
  public getDownedCharacter(): CharacterType | null {
    if (this.wolfIsDowned && !this.falconIsDowned) return 'wolf';
    if (this.falconIsDowned && !this.wolfIsDowned) return 'falcon';
    return null;
  }

  /**
   * Returns true if both characters are downed (mission failed).
   */
  public areBothDowned(): boolean {
    return this.wolfIsDowned && this.falconIsDowned;
  }
  public isMovingState(): boolean { return this.isMoving; }
  public isADSState(): boolean { return this.isADS; }
  public isCrouchingState(): boolean { return this.isCrouching; }
  public isProneState(): boolean { return this.isProne; }

  /** Returns true if the given keyboard code is currently held down. */
  public isKeyDown(code: string): boolean {
    return this.keys[code] === true;
  }

  // ============================================================
  // MOBILE INPUT API — called by MobileControls
  // ============================================================

  /**
   * Simulate a key press/release from mobile touch controls.
   * Triggers the same logic as real keyboard events (crouch, lean, sprint, etc.)
   */
  public setMobileKey(code: string, pressed: boolean): void {
    if (pressed) {
      // Simulate keyDown behavior
      if (this.keys[code]) return; // Already held — avoid double-fire
      this.keys[code] = true;

      // Mirror onKeyDown logic for actions that need special handling
      if (code === 'KeyC' || code === 'ControlLeft') {
        this.isProne = false;
        this.isCrouching = !this.isCrouching;
      }
      if (code === 'KeyX') {
        this.isCrouching = false;
        this.isProne = !this.isProne;
      }
      if (code === 'Space') {
        if (!this.isJumping && !this.isProne) {
          this.isJumping = true;
          this.jumpVelocity = this.JUMP_FORCE;
          this.isCrouching = false;
        }
      }
      if (code === 'ShiftLeft') {
        if (this.isADS && this.onIsSniper && this.onIsSniper()) {
          if (this.breathHoldTime >= this.MAX_BREATH_HOLD) {
            this.isHoldingBreath = true;
          }
        } else {
          this.isSprinting = true;
        }
      }
      // Lean left (Q)
      if (code === 'KeyQ' && !this.commandWheelOpen && !this.isRescuing) {
        this.leanAngle = this.LEAN_ANGLE;
        this.leanOffset = -2.0;
        this.isLeaningLeft = true;
        this.isLeaningRight = false;
        if (this.onLeanChange) this.onLeanChange('left');
      }
      // Lean right (E)
      if (code === 'KeyE' && !this.commandWheelOpen && !this.isRescuing) {
        this.leanAngle = -this.LEAN_ANGLE;
        this.leanOffset = 2.0;
        this.isLeaningRight = true;
        this.isLeaningLeft = false;
        if (this.onLeanChange) this.onLeanChange('right');
      }
    } else {
      // Simulate keyUp behavior
      this.keys[code] = false;
      if (code === 'ShiftLeft') {
        this.isSprinting = false;
        this.isHoldingBreath = false;
        this.breathHoldTime = 0;
      }
      if (code === 'KeyQ' && this.isLeaningLeft) {
        this.leanAngle = 0;
        this.leanOffset = 0;
        this.isLeaningLeft = false;
        if (this.onLeanChange) this.onLeanChange('none');
      }
      if (code === 'KeyE' && this.isLeaningRight) {
        this.leanAngle = 0;
        this.leanOffset = 0;
        this.isLeaningRight = false;
        if (this.onLeanChange) this.onLeanChange('none');
      }
    }
  }

  /**
   * Apply a camera look delta from mobile touch drag.
   * Called every frame from the touch-look area on the right side of the screen.
   */
  public applyMobileLook(movementX: number, movementY: number): void {
    let sensitivity = 0.003; // Slightly higher than mouse for touch
    if (this.isProne) sensitivity *= PRONE_SENSITIVITY_MULT;
    if (this.isADS && this.onIsSniper && this.onIsSniper()) {
      sensitivity *= 0.3 / this.scopeZoomLevel;
    }
    const char = this.characters[this.activeCharacter];
    char.rotation.y -= movementX * sensitivity;
    char.rotation.x -= movementY * sensitivity;
    char.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, char.rotation.x));
  }

  /**
   * Trigger a shot from the mobile fire button.
   * Bypasses pointer-lock requirement that desktop needs.
   */
  public triggerMobileFire(): void {
    if (this.onShoot) {
      this.onShoot();
    }
  }

  /**
   * Set ADS (Aim Down Sights) state from the mobile ADS button.
   * active=true means button was tapped ON, active=false means tapped OFF.
   */
  public setMobileADS(active: boolean): void {
    if (active) {
      if (this.onIsSniper && this.onIsSniper()) {
        this.isADS = true;
        this.scopeZoomLevel = 5;
      } else {
        this.isADS = true;
      }
    } else {
      // Button turned OFF — always release ADS
      this.isADS = false;
    }
  }

  /**
   * Trigger a melee attack from the mobile melee button.
   */
  public triggerMobileMelee(): void {
    // Simulate F key for melee
    if (this.onShoot) {
      this.onShoot();
    }
  }

  /** Returns whether the tactical command wheel is currently open. */
  public isCommandWheelOpen(): boolean {
    return this.commandWheelOpen;
  }

  /** Returns current lean angle (radians). Negative = left, positive = right, 0 = none. */
  public getLeanAngle(): number {
    return this.leanAngle;
  }

  public getCharacterPosition(type: CharacterType): THREE.Vector3 {
    return this.characters[type].position.clone();
  }

  // ============================================================
  // DAMAGE FEEDBACK — Screen Shake
  // ============================================================

  /**
   * Trigger camera screen shake proportional to incoming damage.
   * Intensity is normalised to a 0–1 range (capped) and applied
   * as random position offsets each frame in update(), decaying
   * by ×0.9 every frame.
   */
  private triggerScreenShake(damageAmount: number): void {
    // Map damage to intensity: 0 damage → 0, 50+ damage → 1
    const intensity = Math.min(damageAmount / 50, 1);
    // Only increase — don't overwrite a stronger ongoing shake
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
  }

  // ============================================================
  // DAMAGE FEEDBACK — Damage Direction Indicators
  // ============================================================

  /**
   * Briefly flash a directional damage indicator on the HUD.
   *
   * @param fromAngle Angle in radians from the player to the
   *                  attacker. 0 = front, PI/2 = left, -PI/2 = right,
   *                  PI = behind.  Angles are in the XZ plane
   *                  relative to the player's forward direction.
   */
  public showDamageDirection(fromAngle: number): void {
    // Determine which indicator to light up
    let indicator: HTMLElement | null = null;

    // Normalise the angle to [0, 2*PI)
    let a = fromAngle % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;

    // Sector mapping (quadrant-based):
    //   Front:  a ∈ [−π/4, π/4)  i.e. [-45°, 45°)
    //   Right:  a ∈ [π/4, 3π/4)  i.e. [45°, 135°)
    //   Back:   a ∈ [3π/4, 5π/4) i.e. [135°, 225°)
    //   Left:   a ∈ [5π/4, 7π/4) i.e. [225°, 315°)
    if (a < Math.PI / 4 || a >= (7 * Math.PI) / 4) {
      indicator = this.damageIndicators.top;    // Front
    } else if (a >= Math.PI / 4 && a < (3 * Math.PI) / 4) {
      indicator = this.damageIndicators.left;   // Left
    } else if (a >= (3 * Math.PI) / 4 && a < (5 * Math.PI) / 4) {
      indicator = this.damageIndicators.bottom; // Behind
    } else {
      indicator = this.damageIndicators.right;  // Right
    }

    if (!indicator) return;

    // Flash the indicator
    indicator.classList.add('active');
    setTimeout(() => {
      indicator!.classList.remove('active');
    }, 400);
  }

  // ============================================================
  // DAMAGE FEEDBACK — Damage Vignette
  // ============================================================

  /**
   * Flash the red damage vignette overlay briefly.
   */
  private triggerDamageVignette(): void {
    const el = this.damageIndicators.vignette;
    if (!el) return;

    el.classList.add('active');
    setTimeout(() => {
      el.classList.remove('active');
    }, 300);
  }

  // ============================================================
  // DAMAGE FEEDBACK — Recoil Offset (legacy)
  // ============================================================

  /**
   * Apply a vertical recoil kick to the camera.  Call this from
   * the weapon/shooting system when the player fires.
   *
   * @param amount  Upward kick in world units (e.g. 0.02–0.06)
   */
  public applyRecoil(amount: number): void {
    this.recoilOffset += amount;
  }

  /**
   * Returns the current recoil camera-Y offset and lets it decay.
   * The weapon view model system can query this each frame to
   * adjust weapon position.
   */
  public getRecoilOffset(): number {
    // Return current offset and let it decay
    const offset = this.recoilOffset;
    if (this.recoilOffset > 0.0005) {
      this.recoilOffset *= 0.85;
    } else {
      this.recoilOffset = 0;
    }
    return offset;
  }

  // ============================================================
  // DAMAGE — Core
  // ============================================================

  /**
   * Full reset: health, positions, stance, active character, downed states.
   * Called when mission restarts.
   */
  public resetAll(spawnX_wolf: number, spawnZ: number, spawnX_falcon: number): void {
    // Reset health
    this.wolfHealth = this.wolfMaxHealth;
    this.falconHealth = this.falconMaxHealth;
    this.wolfArmor = this.wolfMaxArmor;
    this.falconArmor = this.falconMaxArmor;

    // Clear downed states
    this.wolfIsDowned = false;
    this.wolfDownedTimer = 0;
    this.falconIsDowned = false;
    this.falconDownedTimer = 0;
    this.rescueProgress = 0;
    this.isRescuing = false;

    // Remove downed visuals
    this.removeDownedVisual('wolf');
    this.removeDownedVisual('falcon');
    this.updateRescueParticles(null, false);

    // Reset positions to spawn
    const terrainY_w = this.terrainHeightProvider ? this.terrainHeightProvider(spawnX_wolf, spawnZ) : 0;
    const terrainY_f = this.terrainHeightProvider ? this.terrainHeightProvider(spawnX_falcon, spawnZ) : 0;
    this.characters.wolf.position.set(spawnX_wolf, terrainY_w + 1.7, spawnZ);
    this.characters.falcon.position.set(spawnX_falcon, terrainY_f + 1.7, spawnZ);
    this.characters.wolf.group.position.copy(this.characters.wolf.position);
    this.characters.falcon.group.position.copy(this.characters.falcon.position);
    this.characters.wolf.rotation.set(0, 0, 0, 'YXZ');
    this.characters.falcon.rotation.set(0, 0, 0, 'YXZ');

    // Reset stance
    this.characters.wolf.isCrouching = false;
    this.characters.wolf.isProne = false;
    this.characters.falcon.isCrouching = false;
    this.characters.falcon.isProne = false;

    // Reset to wolf
    this.activeCharacter = 'wolf';
    this.characters.wolf.isActive = true;
    this.characters.wolf.group.visible = false;
    this.characters.falcon.isActive = false;
    this.characters.falcon.group.visible = true;

    // Reset weapon slot
    this.characters.wolf.lastSlot = 4;
    this.characters.falcon.lastSlot = 4;
    this.currentWeaponSlot = 4;
    this.previousWeaponSlot = 4;

    // Reset movement state
    this.isMoving = false;
    this.isSprinting = false;
    this.isADS = false;
    this.headBob = 0;

    // Reset lean
    this.leanAngle = 0;

    // Clear damage feedback
    this.screenShakeIntensity = 0;
    this.recoilOffset = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.fireKickZ = 0;
    this.fireKickActive = false;
    this.reloadAnimActive = false;
    this.currentPronePitchOffset = 0;
    if (this.damageIndicators.lowHealthVignette) {
      this.damageIndicators.lowHealthVignette.classList.remove('active');
    }
    if (this.damageIndicators.vignette) {
      this.damageIndicators.vignette.classList.remove('active');
    }

    // Reset footstep tracking
    this.lastFootstepPosition.copy(this.characters.wolf.position);

    // Reset key state
    this.keys = {};

    // Reset teammate AI state
    this.followWasIdle = false;
    this.followResumeTimer = 0;
    this.prevTeammateAnimState = 'idle';
    this.teammateAnimBlend = 1.0;
    this.coverLookAtPlayer = false;
    this.coverLookAtLerp = 0;
    this.inactiveAIAnimTime = 0;
    this.inactiveAIIsMoving = false;
    this.inactiveAICoverTimer = 0;
    // Reset smooth follow deceleration
    this.teammateMoveVelocity = 0;
    this.walkToIdleBlend = 1;
    this.takeCoverNextPeekInterval = 4.0;
    this.currentPeekDuration = 1.5;
    this.followIdleSwayTime = 0;
    this.coverEntryDelayTimer = 0;
    this.coverEntryDelayDone = false;
    this.coverAlertTimer = 0;
    // POLISH #5: Clean up cover indicator on reset
    this.updateCoverIndicator(this.characters.wolf);
    this.updateCoverIndicator(this.characters.falcon);
    // FIX 2: Reset wall collision avoidance tracking
    this.followBlockedAttempts = 0;
    this.followBlockedWaitTimer = 0;
    this.lastPathfindingBlocked = false;

    // Recreate weapon view model for wolf
    if (this.weaponViewModel && this.weaponViewModel.parent) {
      this.weaponViewModel.parent.remove(this.weaponViewModel);
    }
    this.createWeaponViewModel();

    console.log('[Player] Full reset — positions, health, stance, weapon');
  }

  public resetHealth(): void {
    // Reset both characters' health
    this.wolfHealth = this.wolfMaxHealth;
    this.falconHealth = this.falconMaxHealth;
    this.wolfArmor = this.wolfMaxArmor;
    this.falconArmor = this.falconMaxArmor;

    // Clear downed states
    this.wolfIsDowned = false;
    this.wolfDownedTimer = 0;
    this.falconIsDowned = false;
    this.falconDownedTimer = 0;
    this.rescueProgress = 0;
    this.isRescuing = false;

    // Remove downed visuals
    this.removeDownedVisual('wolf');
    this.removeDownedVisual('falcon');
    this.updateRescueParticles(null, false);

    // Clear any lingering damage feedback
    this.screenShakeIntensity = 0;
    this.recoilOffset = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.fireKickZ = 0;
    this.fireKickActive = false;
    this.currentPronePitchOffset = 0;
    if (this.damageIndicators.lowHealthVignette) {
      this.damageIndicators.lowHealthVignette.classList.remove('active');
    }
  }

  public takeDamage(amount: number): void {
    // Can't damage a downed character
    if (this.isCharacterDowned(this.activeCharacter)) return;

    const previousHealth = this.getHealth();

    // Use active character's armor
    if (this.activeCharacter === 'wolf') {
      if (this.wolfArmor > 0) {
        const armorDamage = Math.min(amount * 0.5, this.wolfArmor);
        this.wolfArmor -= armorDamage;
        amount -= armorDamage;
      }
    } else {
      if (this.falconArmor > 0) {
        const armorDamage = Math.min(amount * 0.5, this.falconArmor);
        this.falconArmor -= armorDamage;
        amount -= armorDamage;
      }
    }
    this.setHealth(this.getHealth() - amount);

    // ---- Trigger all damage feedback systems ----
    this.triggerScreenShake(amount);
    this.triggerDamageVignette();

    const currentHealth = this.getHealth();

    if (currentHealth <= 0 && previousHealth > 0) {
      console.log(`[Player] ${this.activeCharacter.toUpperCase()} DOWNED!`);

      // Set downed state for active character
      if (this.activeCharacter === 'wolf') {
        this.wolfIsDowned = true;
        this.wolfDownedTimer = this.DOWNED_TIMER_MAX;
        this.wolfHealth = 0;
      } else {
        this.falconIsDowned = true;
        this.falconDownedTimer = this.DOWNED_TIMER_MAX;
        this.falconHealth = 0;
      }

      // Clear damage feedback
      this.screenShakeIntensity = 0;
      this.recoilOffset = 0;
      this.recoilPitch = 0;
      this.recoilYaw = 0;
      this.fireKickZ = 0;
      this.fireKickActive = false;
      this.currentPronePitchOffset = 0;
      if (this.damageIndicators.lowHealthVignette) {
        this.damageIndicators.lowHealthVignette.classList.remove('active');
      }

      // Show the downed character's third-person model prone with red glow
      this.showDownedVisual(this.activeCharacter);

      // Switch to the other character if available
      if (!this.areBothDowned()) {
        const otherType: CharacterType = this.activeCharacter === 'wolf' ? 'falcon' : 'wolf';
        console.log(`[Player] Auto-switching to ${otherType.toUpperCase()} — teammate downed!`);
        // Use callback to trigger GameEngine's full switch (updates UI, weapons, etc.)
        if (this.onAutoSwitch) {
          setTimeout(() => this.onAutoSwitch!(), 100);
        }
      } else {
        // Both downed — trigger game over
        console.log('[Player] BOTH OPERATIVES DOWN — MISSION FAILED');
        if (this.onDeath) this.onDeath();
      }
    }
  }

  // ============================================================
  // DOWNEC / RESCUE SYSTEM
  // ============================================================

  /**
   * Shows the downed character's third-person model in a prone position
   * with a BIG RED FLOATING ARROW above them to indicate they need rescue.
   * The arrow is visible through walls (bright emissive red) and bobs up/down.
   * Arrow is 3-4 units tall for high visibility.
   */
  private showDownedVisual(type: CharacterType): void {
    const char = this.characters[type];

    // Force the character model prone
    char.isProne = true;
    char.isCrouching = false;

    // Show the model in the world
    char.group.visible = true;

    // Create a group to hold the big red arrow + glow
    const arrowGroup = new THREE.Group();

    // --- BIG RED ARROW (3-4 units tall, visible through walls) ---
    // Arrow shaft — tall red box
    const shaftGeo = new THREE.BoxGeometry(0.4, 3.0, 0.4);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      transparent: true,
      opacity: 0.95,
    });
    const shaft = new THREE.Mesh(shaftGeo, arrowMat);
    shaft.position.y = 2.0; // Center of the shaft
    arrowGroup.add(shaft);

    // Arrow head — cone pointing down (toward the downed character)
    const headGeo = new THREE.ConeGeometry(0.9, 1.5, 4);
    const headMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.95,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.x = Math.PI; // Point downward
    head.position.y = 0.2; // Just above the character
    arrowGroup.add(head);

    // --- RED GLOW EFFECT (sphere around character for visibility) ---
    const glowGeometry = new THREE.SphereGeometry(1.0, 8, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.position.y = 0.5;
    arrowGroup.add(glowMesh);

    // --- RED POINT LIGHT for through-wall visibility ---
    const redLight = new THREE.PointLight(0xff0000, 3, 12, 2);
    redLight.position.y = 2.5;
    arrowGroup.add(redLight);

    // Position at downed character's location
    const terrainY = this.terrainHeightProvider
      ? this.terrainHeightProvider(char.position.x, char.position.z)
      : 0;
    arrowGroup.position.set(char.position.x, terrainY, char.position.z);

    this.scene.add(arrowGroup);

    if (type === 'wolf') {
      this.wolfGlowMesh = arrowGroup; // Store the group
    } else {
      this.falconGlowMesh = arrowGroup;
    }
  }

  /**
   * Removes the downed character's red arrow visual.
   */
  private removeDownedVisual(type: CharacterType): void {
    const glowMesh = type === 'wolf' ? this.wolfGlowMesh : this.falconGlowMesh;
    if (glowMesh) {
      // Handle both single mesh and group (arrow is a Group)
      if ((glowMesh as any).isGroup || glowMesh instanceof THREE.Group) {
        (glowMesh as THREE.Group).traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      } else {
        (glowMesh as THREE.Mesh).geometry.dispose();
        ((glowMesh as THREE.Mesh).material as THREE.Material).dispose();
      }
      this.scene.remove(glowMesh);
      if (type === 'wolf') {
        this.wolfGlowMesh = null;
      } else {
        this.falconGlowMesh = null;
      }
    }

    // Reset the character's prone state
    const char = this.characters[type];
    char.isProne = false;
  }

  /**
   * Update downed timers every frame. Called from gameLoop.
   * Returns the downed character type if their timer expired (game over trigger).
   */
  public updateDownedTimers(delta: number): CharacterType | null {
    const now = performance.now();

    if (this.wolfIsDowned) {
      this.wolfDownedTimer -= delta;

      // Update arrow glow pulsing (find glow mesh inside the group)
      if (this.wolfGlowMesh) {
        this.pulseDownedArrow(this.wolfGlowMesh, now);
      }

      if (this.wolfDownedTimer <= 0) {
        this.wolfDownedTimer = 0;
        return 'wolf';
      }
    }

    if (this.falconIsDowned) {
      this.falconDownedTimer -= delta;

      // Update arrow glow pulsing
      if (this.falconGlowMesh) {
        this.pulseDownedArrow(this.falconGlowMesh, now);
      }

      if (this.falconDownedTimer <= 0) {
        this.falconDownedTimer = 0;
        return 'falcon';
      }
    }

    return null;
  }

  /**
   * Pulse the glow mesh opacity inside a downed arrow group.
   */
  private pulseDownedArrow(obj: THREE.Object3D, now: number): void {
    if (obj instanceof THREE.Group) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          if (child.material.color.getHex() === 0xff0000) {
            child.material.opacity = 0.15 + Math.sin(now * 0.005) * 0.15;
          }
        }
      });
    }
  }

  /**
   * Update rescue mechanics every frame. Called from gameLoop.
   * Checks proximity to downed character and hold-E rescue.
   */
  public updateRescue(delta: number): void {
    const downedChar = this.getDownedCharacter();

    if (!downedChar || this.isCharacterDowned(this.activeCharacter)) {
      this.isRescuing = false;
      this.rescueProgress = 0;
      return;
    }

    // Check proximity to downed character
    const activePos = this.characters[this.activeCharacter].position;
    const downedPos = this.characters[downedChar].position;
    const distance = activePos.distanceTo(downedPos);

    if (distance <= this.RESCUE_DISTANCE && this.keys['KeyE']) {
      // Hold E near downed character — rescue in progress
      this.isRescuing = true;
      this.rescueProgress += delta;

      // Play rescue sound periodically
      if (Math.floor(this.rescueProgress * 3) !== Math.floor((this.rescueProgress - delta) * 3)) {
        if (this.audioManager) {
          this.audioManager.playRescue();
        }
      }

      // Show green rescue particles
      this.updateRescueParticles(downedPos, true);

      if (this.rescueProgress >= this.RESCUE_HOLD_TIME) {
        // Rescue complete!
        this.reviveCharacter(downedChar);
        this.rescueProgress = 0;
        this.isRescuing = false;
        this.updateRescueParticles(null, false);
      }
    } else {
      // Not rescuing — reset progress
      if (this.isRescuing) {
        this.rescueProgress = 0;
        this.isRescuing = false;
        this.updateRescueParticles(null, false);
      }
    }
  }

  /**
   * Revive a downed character with 50% health.
   */
  private reviveCharacter(type: CharacterType): void {
    console.log(`[Player] ${type.toUpperCase()} REVIVED!`);

    if (type === 'wolf') {
      this.wolfIsDowned = false;
      this.wolfDownedTimer = 0;
      this.wolfHealth = Math.floor(this.wolfMaxHealth * this.DOWNED_REVIVE_PERCENT);
    } else {
      this.falconIsDowned = false;
      this.falconDownedTimer = 0;
      this.falconHealth = Math.floor(this.falconMaxHealth * this.DOWNED_REVIVE_PERCENT);
    }

    // Remove downed visual
    this.removeDownedVisual(type);
  }

  /**
   * Creates or updates green rescue particles around the downed character.
   */
  private updateRescueParticles(position: THREE.Vector3 | null, active: boolean): void {
    if (!active) {
      // Remove particles
      if (this.rescueParticles) {
        this.scene.remove(this.rescueParticles);
        this.rescueParticles.geometry.dispose();
        (this.rescueParticles.material as THREE.Material).dispose();
        this.rescueParticles = null;
        this.rescueParticlePositions = null;
      }
      return;
    }

    if (!position) return;

    // Create particles if they don't exist
    if (!this.rescueParticles) {
      const count = 30;
      this.rescueParticlePositions = new Float32Array(count * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(this.rescueParticlePositions, 3));

      const material = new THREE.PointsMaterial({
        color: 0x00ff00,
        size: 0.08,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,
        depthWrite: false,
      });

      this.rescueParticles = new THREE.Points(geometry, material);
      this.scene.add(this.rescueParticles);
    }

    // Animate particles: spiral upward around the downed character
    const now = performance.now() * 0.001;
    const count = 30;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + now * 2;
      const radius = 0.5 + Math.sin(now * 3 + i) * 0.2;
      const height = (now * 0.5 + i * 0.05) % 1.2;

      this.rescueParticlePositions![i * 3 + 0] = position.x + Math.cos(angle) * radius;
      this.rescueParticlePositions![i * 3 + 1] = height;
      this.rescueParticlePositions![i * 3 + 2] = position.z + Math.sin(angle) * radius;
    }

    const posAttr = this.rescueParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;

    // Pulse the particle opacity
    (this.rescueParticles.material as THREE.PointsMaterial).opacity = 0.5 + Math.sin(now * 5) * 0.3;
  }

  /**
   * Update downed arrow positions to follow characters.
   * Arrow bobs up and down to draw attention.
   */
  public updateDownedVisuals(): void {
    const now = performance.now() * 0.001;

    if (this.wolfGlowMesh) {
      const pos = this.characters.wolf.position;
      const terrainY = this.terrainHeightProvider
        ? this.terrainHeightProvider(pos.x, pos.z) : 0;
      const bob = Math.sin(now * 3) * 0.4; // Bob up/down
      this.wolfGlowMesh.position.set(pos.x, terrainY + bob, pos.z);
    }
    if (this.falconGlowMesh) {
      const pos = this.characters.falcon.position;
      const terrainY = this.terrainHeightProvider
        ? this.terrainHeightProvider(pos.x, pos.z) : 0;
      const bob = Math.sin(now * 3 + 1.5) * 0.4; // Slightly offset phase
      this.falconGlowMesh.position.set(pos.x, terrainY + bob, pos.z);
    }
  }

  /**
   * Returns rescue distance constant for external checks.
   */
  public getRescueDistance(): number {
    return this.RESCUE_DISTANCE;
  }

  // ============================================================
  // INACTIVE CHARACTER AI — Improved Teammate Behavior
  // ============================================================

  /** Extended teammate AI states for richer behavior. */
  private inactiveAIState: 'follow' | 'covering' | 'peeking' | 'shooting' | 'hold' | 'takeCover' = 'follow';
  private inactiveAICoverPos: THREE.Vector3 | null = null;
  private inactiveAIPeekTimer: number = 0;
  private inactiveAIShootTimer: number = 0;
  private inactiveAIFollowOffset: THREE.Vector3 = new THREE.Vector3(-1.5, 0, 3);

  /** Timer for teammate idle animation (body sway, weight shift). */
  private inactiveAIAnimTime: number = 0;
  /** Whether the teammate is currently in motion (for idle vs walk animation). */
  private inactiveAIIsMoving: boolean = false;
  /** Timer for cover peek cycle. */
  private inactiveAICoverTimer: number = 0;
  /** Whether teammate is crouching in cover. */
  private inactiveAIIsCrouching: boolean = false;
  /** Smooth crouch transition factor (0 = standing, 1 = fully crouched). */
  private inactiveAICrouchBlend: number = 0;
  /** Cached nearest collider behind teammate for cover. */
  private inactiveAICoverCollider: THREE.Mesh | null = null;

  // ── Take Cover mode properties ──
  /** Timer for cover idle peek cycles (3-5 second intervals). */
  private takeCoverTimer: number = 0;
  /** Whether currently peeking from cover. */
  private takeCoverPeeking: boolean = false;
  /** Direction of current peek (-1 = left, +1 = right). */
  private takeCoverPeekDir: number = 1;
  /** Sub-type of takeCover state: 'running' | 'crouching' | 'idle'. */
  private takeCoverPhase: 'running' | 'crouching' | 'idle' = 'running';

  // ── Follow resume delay (0.5s delay before resuming after idle) ──
  /** Whether teammate was recently idle (within 3 units) and waiting for resume delay. */
  private followWasIdle: boolean = false;
  /** Timer counting up to FOLLOW_RESUME_DELAY before teammate starts moving again. */
  private followResumeTimer: number = 0;
  /** Delay in seconds before teammate resumes following after player starts moving. */
  private readonly FOLLOW_RESUME_DELAY: number = 0.5;

  // ── Smooth animation blend transitions (0.2s crossfade) ──
  /** Previous animation state name for blend tracking. */
  private prevTeammateAnimState: string = 'idle';
  /** Current animation blend progress (0 = just started, 1 = fully blended). */
  private teammateAnimBlend: number = 1.0;
  /** Duration of animation crossfade in seconds. */
  private readonly ANIM_BLEND_DURATION: number = 0.2;

  // ── Teammate look-at-player in cover mode ──
  /** Whether teammate should look toward the player (when player is nearby in cover). */
  private coverLookAtPlayer: boolean = false;
  /** Smooth interpolation factor for cover look-at rotation. */
  private coverLookAtLerp: number = 0;

  // ── Smooth follow deceleration (velocity-based movement) ──
  /** Current movement velocity of the teammate (units/sec, smoothed). */
  private teammateMoveVelocity: number = 0;
  /** Acceleration rate when speeding up to follow (units/sec²). */
  private readonly TEAMMATE_ACCEL: number = 12;
  /** Deceleration rate when slowing down to stop (units/sec²). */
  private readonly TEAMMATE_DECEL: number = 8;
  /** Maximum velocity the teammate can reach while following. */
  private readonly TEAMMATE_MAX_VELOCITY: number = 8;

  // ── Walk-to-idle blend transition ──
  /** Current walk-to-idle blend progress (0 = walking, 1 = idle). */
  private walkToIdleBlend: number = 1;
  /** Duration of the walk-to-idle blend in seconds. */
  private readonly WALK_TO_IDLE_BLEND: number = 0.2;

  // ── Cover peek randomization ──
  /** Next peek interval (randomly determined for each peek cycle). */
  private takeCoverNextPeekInterval: number = 4.0;

  // ── Map boundary constants ──
  /** Playable area X bounds (half-width). */
  private readonly MAP_BOUND_X: number = 45;
  /** Playable area Z min (forward boundary). */
  private readonly MAP_BOUND_Z_MIN: number = 42;
  /** Playable area Z max (back boundary). */
  private readonly MAP_BOUND_Z_MAX: number = 195;
  /** Maximum distance before teammate is teleported/resynced to follow position. */
  private readonly TEAMMATE_MAX_DRIFT: number = 20;

  // ── Fix 2: Wall collision avoidance during follow ──
  /** Counter for consecutive follow-pathfinding failures (all directions blocked). */
  private followBlockedAttempts: number = 0;
  /** Maximum blocked attempts before teammate waits for player to move. */
  private readonly FOLLOW_MAX_BLOCKED: number = 2;
  /** How long the teammate waits when blocked (seconds). */
  private readonly FOLLOW_BLOCKED_WAIT: number = 1.0;
  /** Timer counting up while teammate is blocked and waiting. */
  private followBlockedWaitTimer: number = 0;
  /** Whether the last pathfinding attempt was completely blocked (no alternative found). */
  private lastPathfindingBlocked: boolean = false;

  // References needed for AI (set by GameEngine)
  private enemyPositionsRef: (() => THREE.Vector3[]) | null = null;
  private collidersRef: THREE.Mesh[] = [];

  /** Follow distance constant. Teammate maintains this behind the player. */
  private readonly TEAMMATE_FOLLOW_DIST: number = 4.0;
  /** Distance at which teammate starts moving to catch up (> this = move). */
  private readonly TEAMMATE_CATCHUP_DIST: number = 5.5;
  /** Distance at which teammate stops and idles (measured from player, not follow target). */
  private readonly TEAMMATE_IDLE_DIST: number = 5.0;
  /** Maximum distance before teammate starts running to catch up. */
  private readonly TEAMMATE_RUN_THRESHOLD: number = 6.0;
  /** Speed multiplier when running to catch up. */
  private readonly TEAMMATE_RUN_SPEED: number = 7;
  /** Speed multiplier when walking to follow. */
  private readonly TEAMMATE_WALK_SPEED: number = 4.5;
  /** Speed multiplier when very close (slow approach). */
  private readonly TEAMMATE_SLOW_SPEED: number = 2.5;
  /** Cover search radius — find cover objects within this range. */
  private readonly TEAMMATE_COVER_RANGE: number = 15;
  /** How far behind cover objects the teammate positions. */
  private readonly TEAMMATE_COVER_OFFSET: number = 1.2;
  /** Peek duration before shooting. */
  private readonly TEAMMATE_PEEK_DURATION: number = 1.2;
  /** Shoot duration before ducking back. */
  private readonly TEAMMATE_SHOOT_DURATION: number = 1.5;
  /** Crouch blend speed (per second). */
  private readonly TEAMMATE_CROUCH_SPEED: number = 8;

  // ── Polish: Smooth deceleration when entering cover (0.3s ramp-down) ──
  /** Duration in seconds for the teammate to decelerate from full speed to zero when entering cover. */
  private readonly COVER_ENTRY_DECEL_DURATION: number = 0.3;
  /** Current deceleration progress (0 = full speed, 1 = stopped). */
  private coverEntryDecelTimer: number = 0;
  /** Speed at the moment deceleration started (captured from teammateMoveVelocity). */
  private coverEntryDecelStartSpeed: number = 0;

  // ── Polish: Cover entry pause + weapon raise ──
  /** Brief pause timer before teammate goes idle after reaching cover (0.4s). */
  private coverEntryPauseTimer: number = 0;
  /** Duration of the cover-entry pause (seconds). */
  private readonly COVER_ENTRY_PAUSE_DURATION: number = 0.4;

  // ── Polish: Idle pose variety system ──
  /** Index of the current idle pose (0, 1, or 2). */
  private idlePoseIndex: number = 0;
  /** Timer tracking time in current idle pose (switches every 10s). */
  private idlePoseTimer: number = 0;
  /** Duration of each idle pose before switching (seconds). */
  private readonly IDLE_POSE_DURATION: number = 10;
  /** Smooth blend factor for weight shift animation. */
  private idleWeightShiftBlend: number = 0;

  // ── Polish: Cover peek randomization ──
  /** Randomized duration of the current peek (1.0–2.0 seconds). */
  private currentPeekDuration: number = 1.2;

  // ── Polish: Cover mode visual indicators ──
  /** Shield icon mesh above teammate when in cover mode. */
  private coverShieldMesh: THREE.Mesh | null = null;
  /** Green circle on ground showing cover radius. */
  private coverRadiusMesh: THREE.Mesh | null = null;
  /** Whether cover mode indicator meshes have been created. */
  private coverIndicatorsCreated: boolean = false;

  // ── Polish: Cover entry delay (0.2s reaction time before running to cover) ──
  /** Timer counting up to COVER_ENTRY_DELAY before teammate starts running. */
  private coverEntryDelayTimer: number = 0;
  /** Duration of the reaction-time delay before running to cover (seconds). */
  private readonly COVER_ENTRY_DELAY: number = 0.2;
  /** Whether the cover entry delay has elapsed (teammate can start running). */
  private coverEntryDelayDone: boolean = false;

  // ── Polish: Follow-mode idle weapon sway timer ──
  /** Accumulated time for teammate idle weapon sway oscillation. */
  private followIdleSwayTime: number = 0;

  // ── Polish: Cover entry alert animation ──
  /** Timer for the brief alert animation when first entering cover mode. */
  private coverAlertTimer: number = 0;
  /** Duration of the alert animation (seconds). */
  private readonly COVER_ALERT_DURATION: number = 0.35;

  /**
   * Sets the callback to get alive enemy positions for AI awareness.
   */
  public setEnemyPositionsProvider(provider: () => THREE.Vector3[]): void {
    this.enemyPositionsRef = provider;
  }

  /**
   * Sets the inactive character AI command from the tactical command wheel.
   *   'cover' = seek cover immediately
   *   'follow' = follow active character
   *   'hold' = stay in current position (no movement AI)
   */
  public setInactiveAICommand(command: 'cover' | 'follow' | 'hold'): void {
    switch (command) {
      case 'cover':
        this.inactiveAIState = 'takeCover';
        this.inactiveAICoverPos = null;
        this.inactiveAICoverCollider = null;
        this.inactiveAICrouchBlend = 0;
        this.inactiveAIIsCrouching = false;
        this.takeCoverTimer = 0;
        this.takeCoverPeeking = false;
        this.takeCoverPeekDir = 1;
        this.takeCoverPhase = 'running';
        this.takeCoverNextPeekInterval = 3.0 + Math.random() * 4.0; // 3-7s
        this.currentPeekDuration = 1.0 + Math.random() * 2.0; // 1-3s
        // Polish: 0.2s delay before running to cover
        this.coverEntryDelayTimer = 0;
        this.coverEntryDelayDone = false;
        this.coverAlertTimer = 0;
        break;
      case 'follow':
        this.inactiveAIState = 'follow';
        this.inactiveAICoverPos = null;
        this.inactiveAICoverCollider = null;
        this.inactiveAIIsCrouching = false;
        this.inactiveAICrouchBlend = 0;
        this.takeCoverTimer = 0;
        this.takeCoverPeeking = false;
        this.takeCoverPhase = 'running';
        // Reset follow velocity for smooth transition
        this.teammateMoveVelocity = 0;
        this.walkToIdleBlend = 0;
        this.followWasIdle = false;
        this.followResumeTimer = 0;
        // POLISH: Reset cover entry delay
        this.coverEntryDelayTimer = 0;
        this.coverEntryDelayDone = false;
        this.coverAlertTimer = 0;
        // POLISH #5: Remove cover indicator
        this.updateCoverIndicator(this.characters[this.activeCharacter === 'wolf' ? 'falcon' : 'wolf']);
        break;
      case 'hold':
        this.inactiveAIState = 'hold';
        this.inactiveAICoverPos = null;
        this.inactiveAICoverCollider = null;
        this.inactiveAIIsCrouching = false;
        this.teammateMoveVelocity = 0;
        break;
    }
  }

  /**
   * Update inactive character AI every frame.
   * Handles follow, cover, peek, shoot states with proper animations.
   */
  public updateInactiveAI(delta: number): void {
    const inactiveType = this.activeCharacter === 'wolf' ? 'falcon' : 'wolf';
    const inactiveChar = this.characters[inactiveType];
    const activeChar = this.characters[this.activeCharacter];

    // Don't control if inactive character is downed
    if (inactiveType === 'wolf' ? this.wolfIsDowned : this.falconIsDowned) return;

    // Update animation timer
    this.inactiveAIAnimTime += delta;

    // ═══════════════════════════════════════════════════════════════
    // EDGE CASE: Player drifted too far from teammate (>20 units)
    // Resync teammate to follow position to prevent permanent separation
    // Also handles takeCover mode: if player moves >20 units away while
    // teammate is in cover, automatically switch back to follow mode.
    // ═══════════════════════════════════════════════════════════════
    const distToPlayerDrift = inactiveChar.position.distanceTo(activeChar.position);

    // FIX 1: takeCover mode — auto-switch to follow when player >20 units away
    if (this.inactiveAIState === 'takeCover' && distToPlayerDrift > this.TEAMMATE_MAX_DRIFT) {
      console.log('[Player] Teammate too far from player in cover mode — switching to follow');
      this.setInactiveAICommand('follow');
    }

    if (this.inactiveAIState === 'follow' || this.inactiveAIState === 'hold') {
      if (distToPlayerDrift > this.TEAMMATE_MAX_DRIFT) {
        // Teleport teammate near the player (behind them at follow distance)
        const behindDir = new THREE.Vector3(0, 0, 1);
        const activeEuler = new THREE.Euler(0, activeChar.rotation.y, 0, 'YXZ');
        behindDir.applyEuler(activeEuler);

        inactiveChar.position.x = activeChar.position.x + behindDir.x * this.TEAMMATE_FOLLOW_DIST;
        inactiveChar.position.z = activeChar.position.z + behindDir.z * this.TEAMMATE_FOLLOW_DIST;

        // Clamp to map bounds
        inactiveChar.position.x = Math.max(-this.MAP_BOUND_X, Math.min(this.MAP_BOUND_X, inactiveChar.position.x));
        inactiveChar.position.z = Math.max(this.MAP_BOUND_Z_MIN, Math.min(this.MAP_BOUND_Z_MAX, inactiveChar.position.z));

        // Update terrain height
        if (this.terrainHeightProvider) {
          inactiveChar.position.y = this.terrainHeightProvider(inactiveChar.position.x, inactiveChar.position.z) + 1.7;
        }

        // Reset velocity so teammate doesn't overshoot after resync
        this.teammateMoveVelocity = 0;

        // Face same direction as player
        inactiveChar.rotation.y = activeChar.rotation.y;
      }
    }

    // Get enemy positions if available
    let nearestEnemyDist = Infinity;
    let nearestEnemyPos: THREE.Vector3 | null = null;

    if (this.enemyPositionsRef) {
      const enemyPositions = this.enemyPositionsRef();
      for (const ePos of enemyPositions) {
        const dist = inactiveChar.position.distanceTo(ePos);
        if (dist < nearestEnemyDist) {
          nearestEnemyDist = dist;
          nearestEnemyPos = ePos;
        }
      }
    }

    // --- HOLD STATE: Stay in current position, animate idle ---
    if (this.inactiveAIState === 'hold') {
      this.inactiveAIIsMoving = false;
      // Gradually blend out of crouch
      this.inactiveAICrouchBlend = Math.max(0, this.inactiveAICrouchBlend - delta * this.TEAMMATE_CROUCH_SPEED);
      this.inactiveAIIsCrouching = this.inactiveAICrouchBlend > 0.1;
      this.animateTeammateIdle(inactiveChar, delta);
      return;
    }

    // --- TAKE COVER STATE: Player-commanded cover mode ---
    // Runs independently of combat — teammate seeks waist-high cover,
    // crouches, and stays in cover idle until told to follow.
    // Note: animateTeammateCoverIdle handles crouch visuals directly,
    // so we skip updateTeammateCrouch to avoid visual conflicts.
    if (this.inactiveAIState === 'takeCover') {
      this.updateTakeCover(inactiveChar, delta, activeChar);
      return;
    }

    // --- STATE MACHINE ---
    const inCombat = nearestEnemyDist < this.TEAMMATE_COVER_RANGE && nearestEnemyPos;

    if (inCombat && nearestEnemyPos) {
      // ═══ COMBAT ZONE — enemies nearby ═══
      switch (this.inactiveAIState) {
        case 'follow':
          // Enemy appeared — find cover and run to it
          if (!this.inactiveAICoverPos) {
            this.inactiveAICoverPos = this.findBestCoverPosition(
              inactiveChar.position, nearestEnemyPos
            );
          }
          this.inactiveAIState = 'covering';
          this.inactiveAICrouchBlend = 0;
          this.inactiveAIIsCrouching = false;
          // Fall through to covering movement below
          this.updateTeammateCovering(inactiveChar, delta, nearestEnemyPos);
          break;

        case 'covering':
          this.updateTeammateCovering(inactiveChar, delta, nearestEnemyPos);
          break;

        case 'peeking':
          this.updateTeammatePeeking(inactiveChar, delta, nearestEnemyPos);
          break;

        case 'shooting':
          this.updateTeammateShooting(inactiveChar, delta, nearestEnemyPos);
          break;
      }
    } else {
      // ═══ NO COMBAT — follow active character ═══
      if (this.inactiveAIState !== 'follow') {
        this.inactiveAIState = 'follow';
        this.inactiveAICoverPos = null;
        this.inactiveAICoverCollider = null;
      }

      // Blend out of crouch smoothly
      this.inactiveAICrouchBlend = Math.max(0, this.inactiveAICrouchBlend - delta * this.TEAMMATE_CROUCH_SPEED);
      this.inactiveAIIsCrouching = this.inactiveAICrouchBlend > 0.1;

      this.updateTeammateFollow(inactiveChar, activeChar, delta);
    }

    // Update teammate crouch height
    this.updateTeammateCrouch(inactiveChar, delta);

    // POLISH #5: Clean up cover indicator when not in takeCover mode
    // (updateCoverIndicator handles removal internally when state != 'takeCover')
    this.updateCoverIndicator(inactiveChar);
  }

  // ────────────────────────────────────────────────────────
  // FOLLOW BEHAVIOR
  // ────────────────────────────────────────────────────────

  /**
   * Follow active character at 4 units behind, pathfinding around obstacles.
   * 
   * Distance management (measured from PLAYER, not follow target):
   *   - Within 5 units of player: STOP completely and show idle animation
   *   - > 5 units: Resume following at appropriate speed
   * 
   * Speed tiers (based on distance to follow target):
   *   - > 6 units: SPRINT to catch up (speed = 7)
   *   - 4-6 units: WALK to follow (speed = 4.5)
   *   - 3-4 units: MAINTAIN distance (slow approach if needed)
   * 
   * Polish:
   *   - Smooth velocity-based acceleration/deceleration (no instant stops)
   *   - Walk-to-idle blend transition (0.2s crossfade)
   *   - Overshoot prevention (clamps movement to remaining distance)
   *   - Resume delay — 0.5s after idle before resuming follow
   *   - Speed/stance matching — mirrors player's sprint and crouch
   * 
   * The follow target is positioned BEHIND the player's facing direction,
   * with a slight offset to avoid overlapping.
   */
  private updateTeammateFollow(
    inactiveChar: any,
    activeChar: any,
    delta: number
  ): void {
    // Calculate direction BEHIND the active character (opposite to facing)
    const behindDir = new THREE.Vector3(0, 0, 1); // Behind = positive Z in local
    const activeEuler = new THREE.Euler(0, activeChar.rotation.y, 0, 'YXZ');
    behindDir.applyEuler(activeEuler);

    // Calculate follow target position:
    //   - Behind the player (opposite to facing direction)
    //   - Slight lateral offset (1.0 unit) to avoid direct collision
    const lateralDir = new THREE.Vector3(1, 0, 0); // Right = positive X in local
    lateralDir.applyEuler(activeEuler);

    const followTarget = new THREE.Vector3(
      activeChar.position.x + behindDir.x * this.TEAMMATE_FOLLOW_DIST + lateralDir.x * 1.0,
      activeChar.position.y,
      activeChar.position.z + behindDir.z * this.TEAMMATE_FOLLOW_DIST + lateralDir.z * 1.0
    );

    // Calculate distance between teammate and follow target
    const distToFollow = inactiveChar.position.distanceTo(followTarget);
    
    // Also calculate direct distance to player for better decision making
    const distToPlayer = inactiveChar.position.distanceTo(activeChar.position);

    // ═══════════════════════════════════════════════════════════════
    // SPEED / STANCE MATCHING — mirror player's movement state
    // ═══════════════════════════════════════════════════════════════
    
    // POLISH #4: Mirror player crouch state with smooth 0.3s blend
    // Uses a slower blend rate (3.33/sec ≈ 0.3s) for natural transition
    if (this.isMoving) {
      // Player is moving — match crouch if player is crouching
      const targetCrouchBlend = this.isCrouching ? 1 : 0;
      const CROUCH_BLEND_SPEED = 3.33; // 0.3s for full transition
      this.inactiveAICrouchBlend += (targetCrouchBlend - this.inactiveAICrouchBlend) * CROUCH_BLEND_SPEED * delta;
      this.inactiveAIIsCrouching = this.inactiveAICrouchBlend > 0.1;
    }

    // ═══════════════════════════════════════════════════════════════
    // FOLLOW RESUME DELAY — 0.5s delay after idle before moving
    // ═══════════════════════════════════════════════════════════════
    
    // FIX: Use direct player distance for idle check, not follow-target distance.
    // This ensures teammate stops when within 5 units of the PLAYER, not the
    // theoretical follow position behind the player.
    const isWithinIdleRange = distToPlayer <= this.TEAMMATE_IDLE_DIST;
    
    if (isWithinIdleRange) {
      // ── CLOSE ENOUGH: Smoothly decelerate to stop and idle ──
      this.followWasIdle = true;
      this.followResumeTimer = 0;

      // Smooth deceleration — velocity ramps down instead of instant stop
      this.teammateMoveVelocity = Math.max(0, this.teammateMoveVelocity - this.TEAMMATE_DECEL * delta);
      
      // Only stop moving once velocity is near zero (smooth blend to idle)
      if (this.teammateMoveVelocity < 0.5) {
        this.inactiveAIIsMoving = false;
        this.teammateMoveVelocity = 0;
      }
      
      // Walk-to-idle blend transition (0.2s crossfade)
      this.walkToIdleBlend = Math.min(1.0, this.walkToIdleBlend + delta / this.WALK_TO_IDLE_BLEND);
      
      // Face the same direction as the active character (smooth rotation)
      const targetAngle = activeChar.rotation.y;
      inactiveChar.rotation.y = this.lerpAnglePlayer(
        inactiveChar.rotation.y, targetAngle, 2 * delta
      );
    } else if (this.followWasIdle && this.isMoving) {
      // ── WAS IDLE, PLAYER STARTED MOVING: Wait for resume delay ──
      this.followResumeTimer += delta;
      
      if (this.followResumeTimer < this.FOLLOW_RESUME_DELAY) {
        // Still in delay window — stay idle, look at player
        this.inactiveAIIsMoving = false;
        this.teammateMoveVelocity = 0;
        
        // Look toward the player during the delay (head turns to track)
        const dirToPlayer = new THREE.Vector3().subVectors(activeChar.position, inactiveChar.position);
        dirToPlayer.y = 0;
        if (dirToPlayer.length() > 0.5) {
          const lookAngle = Math.atan2(dirToPlayer.x, dirToPlayer.z);
          inactiveChar.rotation.y = this.lerpAnglePlayer(
            inactiveChar.rotation.y, lookAngle, 4 * delta
          );
        }
      } else {
        // Delay elapsed — resume following
        this.followWasIdle = false;
        this.followResumeTimer = 0;
      }
    } else {
      // ── MOVING: Follow at appropriate speed with smooth acceleration ──
      this.followWasIdle = false;
      this.followResumeTimer = 0;

      // Reset walk-to-idle blend (we're transitioning back to walking)
      this.walkToIdleBlend = 0;

      // === DISTANCE-BASED TARGET SPEED ===
      let targetSpeed: number;
      
      if (distToFollow > this.TEAMMATE_RUN_THRESHOLD) {
        // ── VERY FAR: Sprint to catch up ──
        targetSpeed = this.isSprinting ? this.TEAMMATE_RUN_SPEED * 1.2 : this.TEAMMATE_RUN_SPEED;
      } else if (distToFollow > this.TEAMMATE_CATCHUP_DIST) {
        // ── MODERATELY FAR: Walk to follow ──
        targetSpeed = this.isSprinting ? this.TEAMMATE_RUN_SPEED : this.TEAMMATE_WALK_SPEED;
      } else {
        // ── NEAR: Slow approach to maintain distance ──
        targetSpeed = this.TEAMMATE_SLOW_SPEED;
      }

      // ═══════════════════════════════════════════════════════════════
      // SMOOTH ACCELERATION / DECELERATION
      // ═══════════════════════════════════════════════════════════════
      // POLISH #4: Reduce speed when crouching (match player's crouch speed)
      const crouchSpeedMult = this.inactiveAICrouchBlend > 0.3 ? 0.5 : 1.0;
      const adjustedTargetSpeed = targetSpeed * crouchSpeedMult;

      // Gradually ramp velocity toward target — prevents snapping between speeds
      if (this.teammateMoveVelocity < adjustedTargetSpeed) {
        // Accelerating
        this.teammateMoveVelocity = Math.min(
          adjustedTargetSpeed,
          this.teammateMoveVelocity + this.TEAMMATE_ACCEL * delta
        );
      } else if (this.teammateMoveVelocity > adjustedTargetSpeed) {
        // Decelerating
        this.teammateMoveVelocity = Math.max(
          adjustedTargetSpeed,
          this.teammateMoveVelocity - this.TEAMMATE_DECEL * delta
        );
      }

      // ═══════════════════════════════════════════════════════════════
      // OVERSHOOT PREVENTION
      // ═══════════════════════════════════════════════════════════════
      // Limit movement to remaining distance so teammate doesn't overshoot
      const maxStep = distToFollow * 0.8; // Never move more than 80% of remaining distance
      const effectiveSpeed = Math.min(this.teammateMoveVelocity, maxStep / Math.max(delta, 0.001));

      this.moveTeammateWithPathfinding(inactiveChar, followTarget, delta, effectiveSpeed);
      this.inactiveAIIsMoving = true;

      // ═══ FIX 2: WALL COLLISION AVOIDANCE — Wait after 2 blocked attempts ═══
      if (this.lastPathfindingBlocked) {
        this.followBlockedAttempts++;
        if (this.followBlockedAttempts >= this.FOLLOW_MAX_BLOCKED) {
          // All directions blocked for 2+ consecutive attempts — wait for player to move
          this.followBlockedWaitTimer += delta;
          this.inactiveAIIsMoving = false;
          this.teammateMoveVelocity = Math.max(0, this.teammateMoveVelocity - this.TEAMMATE_DECEL * delta);

          // Face the direction we're trying to go (so it looks natural when unblocked)
          // Keep trying perpendicular directions while waiting
          if (this.followBlockedWaitTimer > this.FOLLOW_BLOCKED_WAIT) {
            // After waiting, try a perpendicular slide — rotate direction 90° and attempt
            const dirToTarget = new THREE.Vector3().subVectors(followTarget, inactiveChar.position);
            dirToTarget.y = 0;
            dirToTarget.normalize();
            const perpX = -dirToTarget.z;
            const perpZ = dirToTarget.x;
            const slideX = inactiveChar.position.x + perpX * effectiveSpeed * delta;
            const slideZ = inactiveChar.position.z + perpZ * effectiveSpeed * delta;
            if (!this.isTeammatePositionBlocked(slideX, slideZ)) {
              inactiveChar.position.x = slideX;
              inactiveChar.position.z = slideZ;
              this.followBlockedAttempts = 0;
              this.followBlockedWaitTimer = 0;
            }
          }
        }
      } else {
        // Path was clear — reset blocked tracking
        this.followBlockedAttempts = 0;
        this.followBlockedWaitTimer = 0;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WALK-TO-IDLE BLEND — smooth animation crossfade (0.2s)
    // ═══════════════════════════════════════════════════════════════
    
    const newAnimState = this.inactiveAIIsMoving
      ? (this.teammateMoveVelocity > this.TEAMMATE_WALK_SPEED ? 'run' : 'walk')
      : 'idle';
    
    if (newAnimState !== this.prevTeammateAnimState) {
      // State changed — start blend
      this.teammateAnimBlend = 0;
      this.prevTeammateAnimState = newAnimState;
    }
    
    // Advance blend toward 1.0
    if (this.teammateAnimBlend < 1.0) {
      this.teammateAnimBlend = Math.min(1.0, this.teammateAnimBlend + delta / this.ANIM_BLEND_DURATION);
    }

    // === APPLY ANIMATION BASED ON STATE ===
    
    if (this.inactiveAIIsMoving) {
      // Determine walk vs run based on current velocity (smooth, not distance-based)
      if (this.teammateMoveVelocity > this.TEAMMATE_WALK_SPEED) {
        this.animateTeammateRun(inactiveChar, delta);
      } else {
        // Blend between walk and idle during deceleration for smooth transition
        if (this.walkToIdleBlend > 0 && this.walkToIdleBlend < 1) {
          // During walk-to-idle: play walk animation but it's blending out
          this.animateTeammateWalk(inactiveChar, delta);
        } else {
          this.animateTeammateWalk(inactiveChar, delta);
        }
      }
    } else {
      // Idle with alive animations (body sway, head look, weapon ready)
      this.animateTeammateIdle(inactiveChar, delta);
    }
  }

  // ────────────────────────────────────────────────────────
  // COVER BEHAVIOR
  // ────────────────────────────────────────────────────────

  /**
   * Run to nearest cover object (within 15 units), then crouch.
   * Uses collider-aware cover finding and pathfinding movement.
   */
  private updateTeammateCovering(
    inactiveChar: any,
    delta: number,
    enemyPos: THREE.Vector3
  ): void {
    // Find cover if we don't have one
    if (!this.inactiveAICoverPos) {
      this.inactiveAICoverPos = this.findBestCoverPosition(
        inactiveChar.position, enemyPos
      );
      this.inactiveAICrouchBlend = 0;
      this.inactiveAIIsCrouching = false;
    }

    if (!this.inactiveAICoverPos) return;

    const distToCover = inactiveChar.position.distanceTo(this.inactiveAICoverPos);

    if (distToCover > 1.0) {
      // Running to cover — enemy-like sprint movement
      this.moveTeammateWithPathfinding(inactiveChar, this.inactiveAICoverPos, delta, 6);
      this.inactiveAIIsMoving = true;
      this.inactiveAIIsCrouching = false;
      this.animateTeammateRun(inactiveChar, delta);
    } else {
      // At cover — crouch and face enemy
      this.inactiveAIIsMoving = false;
      this.inactiveAIIsCrouching = true;
      this.inactiveAICrouchBlend = Math.min(1, this.inactiveAICrouchBlend + delta * this.TEAMMATE_CROUCH_SPEED);

      // Face enemy while in cover
      if (enemyPos) {
        const dir = new THREE.Vector3().subVectors(enemyPos, inactiveChar.position);
        dir.y = 0;
        inactiveChar.rotation.y = Math.atan2(dir.x, dir.z);
      }

      // Transition to peeking after crouch is complete
      this.inactiveAICoverTimer += delta;
      if (this.inactiveAICoverTimer > 0.8 && this.inactiveAICrouchBlend >= 0.9) {
        this.inactiveAIState = 'peeking';
        this.inactiveAIPeekTimer = 0;
        this.inactiveAICoverTimer = 0;
      }

      this.animateTeammateCovering(inactiveChar, delta);
    }
  }

  // ────────────────────────────────────────────────────────
  // PEEK BEHAVIOR
  // ────────────────────────────────────────────────────────

  /**
   * Peek around cover to acquire target, then transition to shoot.
   * Shows partial rise and weapon raise animation.
   */
  private updateTeammatePeeking(
    inactiveChar: any,
    delta: number,
    enemyPos: THREE.Vector3
  ): void {
    this.inactiveAIIsMoving = false;
    this.inactiveAIPeekTimer += delta;

    // Face enemy
    if (enemyPos) {
      const dir = new THREE.Vector3().subVectors(enemyPos, inactiveChar.position);
      dir.y = 0;
      inactiveChar.rotation.y = this.lerpAnglePlayer(
        inactiveChar.rotation.y, Math.atan2(dir.x, dir.z), 4 * delta
      );
    }

    // Gradually raise from crouch (peek up)
    const peekProgress = Math.min(this.inactiveAIPeekTimer / this.TEAMMATE_PEEK_DURATION, 1);
    this.inactiveAICrouchBlend = 1.0 - peekProgress * 0.4; // Rise to 60% height

    // Weapon raising animation
    this.animateTeammatePeeking(inactiveChar, delta, peekProgress);

    if (this.inactiveAIPeekTimer >= this.TEAMMATE_PEEK_DURATION) {
      this.inactiveAIState = 'shooting';
      this.inactiveAIShootTimer = 0;
    }
  }

  // ────────────────────────────────────────────────────────
  // SHOOT BEHAVIOR
  // ────────────────────────────────────────────────────────

  /**
   * Engage enemy from cover position — weapon raised, standing to shoot.
   * After shoot duration, duck back to cover.
   */
  private updateTeammateShooting(
    inactiveChar: any,
    delta: number,
    enemyPos: THREE.Vector3
  ): void {
    this.inactiveAIIsMoving = false;
    this.inactiveAIShootTimer += delta;

    // Face enemy directly
    if (enemyPos) {
      const dir = new THREE.Vector3().subVectors(enemyPos, inactiveChar.position);
      dir.y = 0;
      inactiveChar.rotation.y = this.lerpAnglePlayer(
        inactiveChar.rotation.y, Math.atan2(dir.x, dir.z), 6 * delta
      );
    }

    // Fully raised from cover
    this.inactiveAICrouchBlend = Math.max(0, this.inactiveAICrouchBlend - delta * 10);

    // Shooting animation — weapon fully extended, recoil kick
    this.animateTeammateShooting(inactiveChar, delta);

    if (this.inactiveAIShootTimer >= this.TEAMMATE_SHOOT_DURATION) {
      // Duck back to cover
      this.inactiveAIState = 'covering';
      this.inactiveAICoverTimer = 0;
      this.inactiveAICrouchBlend = 0.6; // Start partially crouched
    }
  }

  // ────────────────────────────────────────────────────────
  // CROUCH UPDATE
  // ────────────────────────────────────────────────────────

  /**
   * Smoothly transition the teammate model's visual crouch height.
   * Lowers the body group and bends legs based on inactiveAICrouchBlend.
   */
  private updateTeammateCrouch(inactiveChar: any, delta: number): void {
    const group = inactiveChar.group;
    const leftLeg = group.userData.leftLeg;
    const rightLeg = group.userData.rightLeg;
    const body = group.userData.body;

    if (!leftLeg || !rightLeg || !body) return;

    const blend = this.inactiveAICrouchBlend;

    // Leg bend: standing = 0, crouched = -1.2 radians
    const legBend = blend * -1.2;
    leftLeg.rotation.x += (legBend - leftLeg.rotation.x) * 8 * delta;
    rightLeg.rotation.x += (legBend - rightLeg.rotation.x) * 8 * delta;

    // Body lowers slightly during crouch
    const bodyY = 1.05 - blend * 0.25;
    body.position.y += (bodyY - body.position.y) * 8 * delta;
  }

  // ────────────────────────────────────────────────────────
  // ANIMATION SYSTEM
  // ────────────────────────────────────────────────────────

  /**
   * Idle animation: subtle body sway, weight shift, weapon held at ready.
   * Plays when teammate is near player and not moving.
   * 
   * Animation layers:
   *   1. Body sway — sinusoidal rotation on Z axis (weight shift)
   *   2. Head — occasional look-around (scanning environment, random pauses)
   *   3. Legs — subtle weight transfer between legs
   *   4. Left arm — occasional weight adjustment (shifts position)
   *   5. Right arm — weapon held steady at ready position (no sway)
   * 
   * Polish: Smoother head look-around with random timing, weapon rock-steady.
   */
  private animateTeammateIdle(inactiveChar: any, delta: number): void {
    const group = inactiveChar.group;
    const leftArm = group.userData.leftArm;
    const rightArm = group.userData.rightArm;
    const leftLeg = group.userData.leftLeg;
    const rightLeg = group.userData.rightLeg;
    const body = group.userData.body;
    const head = group.userData.head;

    if (!leftArm || !rightArm || !leftLeg || !rightLeg || !body || !head) return;

    const t = this.inactiveAIAnimTime;

    // ══════════════════════════════════════════════════════════════════
    // POLISH #1: FOLLOW-MODE PROXIMITY CHECK — teammate within 3 units of player
    // Enables weapon sway, enhanced weight shift, and head tracking.
    // ══════════════════════════════════════════════════════════════════
    const activeChar = this.characters[this.activeCharacter];
    const distToPlayer = inactiveChar.position.distanceTo(activeChar.position);
    const isFollowClose = this.inactiveAIState === 'follow' && distToPlayer < 3.0;

    // Accumulate follow idle sway timer when in close follow
    if (isFollowClose) {
      this.followIdleSwayTime += delta;
    } else {
      // Slowly decay when not in close follow (smooth re-entry)
      this.followIdleSwayTime *= 0.95;
    }

    // ══════════════════════════════════════════════════════════════════
    // LAYER 1: BODY SWAY — Sinusoidal rotation (weight shift side-to-side)
    //   POLISH: Enhanced weight shift when in follow-close mode (body tilt)
    // ══════════════════════════════════════════════════════════════════
    
    // Primary sway cycle — slow, natural weight shift
    const swayCycle = Math.sin(t * 1.2);
    // Secondary cycle — slightly faster, creates complex motion
    const swayCycle2 = Math.sin(t * 0.8);
    // Breathing cycle — very slow, simulates respiration
    const breathCycle = Math.sin(t * 0.4);

    // Enhanced weight shift amplitude when close to player in follow mode
    const weightShiftAmplitude = isFollowClose ? 0.04 : 0.025;

    // Lateral body rotation (weight shift left/right)
    body.rotation.z = swayCycle * weightShiftAmplitude;

    // Slight forward/back lean (breathing motion)
    body.rotation.x = breathCycle * 0.012;

    // Vertical shift — standing on one leg is slightly taller
    body.position.y = 1.05 + Math.abs(swayCycle) * 0.015;

    // ══════════════════════════════════════════════════════════════════
    // LAYER 2: HEAD — Natural look-around with random timing
    //   POLISH: When in follow-close mode, head slowly tracks the player
    // ══════════════════════════════════════════════════════════════════
    
    if (isFollowClose && distToPlayer > 0.5) {
      // ── HEAD TRACKING: Slowly turn head toward player position ──
      const dirToPlayer = new THREE.Vector3().subVectors(activeChar.position, inactiveChar.position);
      dirToPlayer.y = 0;
      const lookAngle = Math.atan2(dirToPlayer.x, dirToPlayer.z);
      // Relative look direction (subtract body rotation so head turns independently)
      let relativeLookY = lookAngle - inactiveChar.rotation.y;
      while (relativeLookY > Math.PI) relativeLookY -= Math.PI * 2;
      while (relativeLookY < -Math.PI) relativeLookY += Math.PI * 2;
      // Clamp head turn to ±0.5 radians (~28°) — natural neck limit
      const clampedLookY = Math.max(-0.5, Math.min(0.5, relativeLookY));
      // Smooth interpolation — slow, deliberate head turn (0.8s feel)
      head.rotation.y += (clampedLookY - head.rotation.y) * 0.8 * delta;
      // Subtle upward tilt when looking at player (player is slightly taller in camera)
      head.rotation.x += (0.03 - head.rotation.x) * 0.6 * delta;
      // Very slight roll (natural head tilt)
      head.rotation.z = Math.sin(t * 0.28 + 2.0) * 0.01;
    } else {
      // ── SCAN ENVIRONMENT: Original behavior ──
      // Head scans the environment — looks left/right with pauses
      const headScanPrimary = Math.sin(t * 0.6);
      const headScanSecondary = Math.sin(t * 0.25 + 1.3);
      
      // Occasional "alert" look — every ~6-10 seconds, head snaps to one side
      const alertCycle = Math.sin(t * 0.12);
      const alertIntensity = alertCycle > 0.85 ? (alertCycle - 0.85) * 6.67 : 0;
      
      // Combine: slow scan + occasional alert snap
      head.rotation.y = headScanPrimary * 0.2 + alertIntensity * (headScanSecondary > 0 ? 0.4 : -0.4);
      
      // Head tilts slightly up/down (curiosity) — very subtle
      head.rotation.x = Math.sin(t * 0.35 + 1.0) * 0.04;
      
      // Very subtle roll (natural head tilt)
      head.rotation.z = Math.sin(t * 0.28 + 2.0) * 0.015;
    }

    // ══════════════════════════════════════════════════════════════════
    // LAYER 3: LEGS — Weight transfer between legs
    // ══════════════════════════════════════════════════════════════════
    
    // Weight shifts between legs (subtle, matches body sway)
    const weightShift = swayCycle * 0.035;
    leftLeg.rotation.x = -weightShift;
    rightLeg.rotation.x = weightShift;
    
    // Slight lateral leg adjustment (balance)
    leftLeg.rotation.z = swayCycle2 * 0.008;
    rightLeg.rotation.z = -swayCycle2 * 0.008;

    // ══════════════════════════════════════════════════════════════════
    // LAYER 4: LEFT ARM — Occasional weight adjustment
    // ══════════════════════════════════════════════════════════════════
    
    // Primary arm motion — follows body sway but with offset
    leftArm.rotation.x = swayCycle2 * 0.05;
    
    // Occasional weight shift — arm moves more noticeably every ~8 seconds
    const weightShiftCycle = Math.sin(t * 0.15);
    if (weightShiftCycle > 0.7) {
      // Arm repositioning phase — larger movement
      leftArm.rotation.x += Math.sin(t * 3) * 0.06;
      leftArm.rotation.z = Math.sin(t * 2) * 0.04;
    } else {
      // Normal idle — return to rest
      leftArm.rotation.z *= 0.95;
    }

    // ══════════════════════════════════════════════════════════════════
    // LAYER 5: RIGHT ARM — Weapon position + subtle sway
    //   POLISH: When in follow-close mode, weapon has subtle left-right sway
    // ══════════════════════════════════════════════════════════════════
    
    // Weapon held at hip/ready position
    rightArm.rotation.x = -0.18;

    if (isFollowClose) {
      // ── SUBTLE WEAPON SWAY: gentle left-right oscillation ──
      // Simulates natural breathing/weight shift affecting weapon
      const swayTime = this.followIdleSwayTime;
      const weaponSwayX = Math.sin(swayTime * 1.0) * 0.025;  // Left-right sway
      const weaponSwayY = Math.sin(swayTime * 0.65) * 0.012; // Subtle vertical
      rightArm.rotation.z = weaponSwayX;
      // Breathing micro-motion (slightly more pronounced than default)
      rightArm.position.x = 0.4 + weaponSwayX * 0.5;
      rightArm.position.y = 1.2 + breathCycle * 0.004 + weaponSwayY;
    } else {
      // Default: rock-steady weapon with breathing micro-motion
      rightArm.rotation.z = 0;
      rightArm.position.x = 0.4 + Math.sin(t * 0.6) * 0.003;
      rightArm.position.y = 1.2 + breathCycle * 0.002;
    }
  }

  /**
   * Walking animation: leg swing, arm swing, body bob.
   * Plays when teammate is moving toward follow target.
   * 
   * Polish: Smoother gait with heel-strike timing, natural arm counterbalance.
   * 
   * Animation details:
   *   - Legs swing in opposition (natural gait)
   *   - Arms swing opposite to legs (counterbalance)
   *   - Body bobs vertically (weight transfer)
   *   - Weapon held slightly raised while walking
   *   - Head stays stable (looking where going)
   */
  private animateTeammateWalk(inactiveChar: any, delta: number): void {
    const group = inactiveChar.group;
    const leftArm = group.userData.leftArm;
    const rightArm = group.userData.rightArm;
    const leftLeg = group.userData.leftLeg;
    const rightLeg = group.userData.rightLeg;
    const body = group.userData.body;
    const head = group.userData.head;

    if (!leftArm || !rightArm || !leftLeg || !rightLeg || !body) return;

    // Walk cycle timing — match to natural gait speed
    const t = this.inactiveAIAnimTime * 4.8;

    // ═══ LEG SWING ═══
    // Natural gait: left and right legs swing in opposition
    // Smooth sinusoidal with slight asymmetry for realism
    const swing = Math.sin(t) * 0.32;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    
    // Lateral leg adjustment (knees slightly inward during swing)
    leftLeg.rotation.z = Math.sin(t) * 0.015;
    rightLeg.rotation.z = -Math.sin(t) * 0.015;

    // ═══ ARM SWING ═══
    // Arms swing opposite to legs (counterbalance)
    leftArm.rotation.x = -swing * 0.35;
    leftArm.rotation.z = Math.sin(t + 0.5) * 0.02; // Slight lateral swing
    
    // Right arm holds weapon — minimal swing, weapon stays ready
    rightArm.rotation.x = swing * 0.15 - 0.18;
    rightArm.rotation.z = 0;

    // ═══ BODY BOB ═══
    // Vertical bob — weight transfer between legs (two bumps per cycle)
    const doubleBob = Math.abs(Math.sin(t));
    body.position.y = 1.05 + doubleBob * 0.02;
    
    // Subtle forward lean while walking
    body.rotation.x = 0.02;
    body.rotation.z = 0;

    // ═══ HEAD STABILITY ═══
    // Head stays relatively stable (looking where going)
    if (head) {
      head.rotation.y *= 0.92;
      head.rotation.x *= 0.92;
      head.rotation.z *= 0.92;
    }
  }

  /**
   * Running animation: wider leg swing, forward lean, faster arms.
   * Plays when sprinting to catch up or running to cover.
   * 
   * Polish: More natural arm pump with slight asymmetry, smoother bob.
   * 
   * Animation details:
   *   - Wide leg swing (extended stride)
   *   - Arms pump vigorously (balance and momentum)
   *   - Body leans forward (aerodynamic posture)
   *   - Higher vertical bob (more energetic movement)
   *   - Weapon held forward (ready position while running)
   */
  private animateTeammateRun(inactiveChar: any, delta: number): void {
    const group = inactiveChar.group;
    const leftArm = group.userData.leftArm;
    const rightArm = group.userData.rightArm;
    const leftLeg = group.userData.leftLeg;
    const rightLeg = group.userData.rightLeg;
    const body = group.userData.body;
    const head = group.userData.head;

    if (!leftArm || !rightArm || !leftLeg || !rightLeg || !body) return;

    // Run cycle timing — fast pace
    const t = this.inactiveAIAnimTime * 7.5;

    // ═══ LEG SWING ═══
    // Wide leg swing — extended stride for running
    const swing = Math.sin(t) * 0.48;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    
    // Knees more pronounced during run
    leftLeg.rotation.z = Math.sin(t) * 0.025;
    rightLeg.rotation.z = -Math.sin(t) * 0.025;

    // ═══ ARM PUMP ═══
    // Left arm pumps vigorously — opposite to legs
    leftArm.rotation.x = -swing * 0.55;
    leftArm.rotation.z = Math.sin(t + 0.3) * 0.03; // Slight lateral pump
    
    // Right arm holds weapon forward — weapon stays ready with minimal pump
    rightArm.rotation.x = swing * 0.3 - 0.28;
    rightArm.rotation.z = 0;

    // ═══ BODY POSTURE ═══
    // Forward lean — aerodynamic running posture
    body.rotation.x = 0.07;
    body.rotation.z = 0;
    
    // Higher vertical bob — more energetic movement
    body.position.y = 1.05 + Math.abs(Math.sin(t)) * 0.03;

    // ═══ HEAD STABILITY ═══
    // Head stays forward — looking where running
    if (head) {
      head.rotation.y *= 0.88;
      head.rotation.x *= 0.88;
      head.rotation.z *= 0.88;
    }
  }

  /**
   * Covering animation: crouched low, weapon pulled in tight.
   * Plays when teammate reaches cover and is crouching.
   * 
   * Polish: Smoother breathing motion, weapon held steady.
   */
  private animateTeammateCovering(inactiveChar: any, delta: number): void {
    const group = inactiveChar.group;
    const leftArm = group.userData.leftArm;
    const rightArm = group.userData.rightArm;
    const body = group.userData.body;
    const head = group.userData.head;

    if (!leftArm || !rightArm || !body) return;

    const t = this.inactiveAIAnimTime;

    // Weapon held close to body (tight cover stance) — very stable
    rightArm.rotation.x = -0.4 + Math.sin(t * 0.6) * 0.03;
    leftArm.rotation.x = -0.3 + Math.sin(t * 0.5 + 0.3) * 0.02;

    // Body slightly turned (hugging cover) — gentle breathing
    body.rotation.x = 0.05 + Math.sin(t * 0.4) * 0.01;
    body.rotation.z = 0;

    // Head peeks slightly (subtle side movement)
    if (head) {
      head.rotation.y = Math.sin(t * 0.45) * 0.12;
      head.rotation.x = Math.sin(t * 0.3 + 1.0) * 0.025;
      head.rotation.z = Math.sin(t * 0.25 + 2.0) * 0.01;
    }
  }

  /**
   * Peeking animation: partial rise from cover, weapon raising.
   * Shows progressive weapon raise as peek timer advances.
   */
  private animateTeammatePeeking(inactiveChar: any, delta: number, progress: number): void {
    const group = inactiveChar.group;
    const leftArm = group.userData.leftArm;
    const rightArm = group.userData.rightArm;
    const body = group.userData.body;

    if (!leftArm || !rightArm || !body) return;

    // Progressive weapon raise (0 → fully raised)
    const weaponRaise = -0.4 - progress * 0.8; // From -0.4 to -1.2
    rightArm.rotation.x = weaponRaise;
    leftArm.rotation.x = -0.3 - progress * 0.5;

    // Body rises from crouch
    body.rotation.x = 0.03;
  }

  /**
   * Shooting animation: weapon fully extended, recoil vibration.
   * Shows active engagement from cover position.
   * 
   * Polish: Realistic recoil pattern with recovery, body bracing.
   */
  private animateTeammateShooting(inactiveChar: any, delta: number): void {
    const group = inactiveChar.group;
    const leftArm = group.userData.leftArm;
    const rightArm = group.userData.rightArm;
    const body = group.userData.body;

    if (!leftArm || !rightArm || !body) return;

    const t = this.inactiveAIAnimTime;

    // Weapon fully extended and aimed
    rightArm.rotation.x = -1.3 + Math.sin(t * 18) * 0.03; // Slight recoil rhythm
    leftArm.rotation.x = -0.9 + Math.sin(t * 18 + 0.5) * 0.02;

    // Recoil kick — rapid vibration with recovery
    const recoilBurst = Math.sin(t * 22) * 0.035;
    rightArm.position.z = recoilBurst;

    // Slight body bracing — rocks back with recoil
    body.rotation.x = 0.04 + Math.sin(t * 18) * 0.015;
    body.position.y = 1.05;
  }

  // ────────────────────────────────────────────────────────
  // COVER POSITION FINDING (Collider-Aware)
  // ────────────────────────────────────────────────────────

  /**
   * Find the best cover position within 15 units that provides
   * line-of-sight blocking from the nearest enemy.
   *
   * Algorithm:
   *   1. Find all colliders within 15 units of the teammate
   *   2. For each collider, compute a "behind" position (away from enemy)
   *   3. Score by: distance from enemy (farther = safer), distance to teammate (closer = faster reach)
   *   4. Also generate perpendicular candidates as fallback
   *   5. Return the highest-scoring valid position
   */
  private findBestCoverPosition(
    fromPos: THREE.Vector3,
    enemyPos: THREE.Vector3
  ): THREE.Vector3 {
    const dirFromEnemy = new THREE.Vector3().subVectors(fromPos, enemyPos).normalize();
    const perpDir = new THREE.Vector3(-dirFromEnemy.z, 0, dirFromEnemy.x);

    const candidates: THREE.Vector3[] = [];

    // ── Phase 1: Check actual colliders as cover objects ──
    for (const collider of this.colliders) {
      const box = new THREE.Box3().setFromObject(collider);
      const boxCenter = new THREE.Vector3();
      box.getCenter(boxCenter);

      // Only consider colliders within range
      const distToFriendly = fromPos.distanceTo(boxCenter);
      if (distToFriendly > this.TEAMMATE_COVER_RANGE) continue;

      // Calculate "behind cover" position — on the far side from enemy
      const behindOffset = dirFromEnemy.clone().multiplyScalar(-this.TEAMMATE_COVER_OFFSET);

      // Position behind the collider (far side from enemy)
      const behindPos = boxCenter.clone().add(behindOffset);

      // Also try left and right of the collider for variety
      const sideOffset = perpDir.clone().multiplyScalar(0.8);
      const leftPos = behindPos.clone().add(sideOffset);
      const rightPos = behindPos.clone().sub(sideOffset);

      candidates.push(behindPos, leftPos, rightPos);
    }

    // ── Phase 2: Generate fallback perpendicular candidates ──
    // (in case no colliders are nearby, use directional cover)
    const fallbackDistances = [3, 4, 5, 2];
    const fallbackDirs = [perpDir, perpDir.clone().negate(), dirFromEnemy.clone().negate()];

    for (const fDir of fallbackDirs) {
      for (const fDist of fallbackDistances) {
        candidates.push(fromPos.clone().add(fDir.clone().multiplyScalar(fDist)));
      }
    }

    // ── Phase 3: Score and pick the best candidate ──
    const playerPos = this.characters[this.activeCharacter].position;
    let bestPos = fromPos.clone().add(dirFromEnemy.clone().multiplyScalar(-3));
    let bestScore = -Infinity;

    for (const pos of candidates) {
      // Clamp to playable area
      pos.x = Math.max(-45, Math.min(45, pos.x));
      pos.z = Math.max(42, Math.min(195, pos.z));

      // Check that position isn't blocked by a collider
      if (this.isTeammatePositionBlocked(pos.x, pos.z)) continue;

      // FIX 2: Skip cover positions occupied by the player
      // Minimum 2.5 units to prevent visual overlap with the player.
      if (pos.distanceTo(playerPos) < 2.5) continue;

      const distFromEnemy = pos.distanceTo(enemyPos);
      const distFromSelf = pos.distanceTo(fromPos);

      // Only consider positions within reasonable range
      if (distFromSelf > this.TEAMMATE_COVER_RANGE) continue;

      // Score: prioritize far from enemy, then close to self
      // Bonus for having a collider between the position and enemy (actual cover)
      const hasColliderCover = this.isColliderBetween(pos, enemyPos);
      const coverBonus = hasColliderCover ? 20 : 0;

      const score = distFromEnemy * 1.5 - distFromSelf * 0.8 + coverBonus;

      if (score > bestScore) {
        bestScore = score;
        bestPos = pos;
      }
    }

    // Set terrain height
    if (this.terrainHeightProvider) {
      bestPos.y = this.terrainHeightProvider(bestPos.x, bestPos.z);
    }

    return bestPos;
  }

  /**
   * Check if there's a collider between two points (basic LOS check).
   */
  private isColliderBetween(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const dist = from.distanceTo(to);
    const raycaster = new THREE.Raycaster(from, dir, 0.1, dist);

    for (const collider of this.colliders) {
      const hits = raycaster.intersectObject(collider, false);
      if (hits.length > 0) return true;
    }
    return false;
  }

  // ────────────────────────────────────────────────────────
  // TAKE COVER BEHAVIOR — Player-Commanded Cover Mode
  // ────────────────────────────────────────────────────────

  /**
   * FIND NEAREST COVER (Take Cover command):
   *   1. Search all colliders within 15 units of teammate position
   *   2. Filter for objects with minimum height (0.3 units) — walls, containers,
   *      HESCO barriers, rocks, etc. all qualify as cover
   *   3. Select the closest one that also has LOS to player (teammate can still see player)
   *   4. If no suitable cover found, teammate stays in place and crouches
   */
  private findTakeCoverPosition(fromPos: THREE.Vector3, playerPos: THREE.Vector3): THREE.Vector3 | null {
    const candidates: Array<{ pos: THREE.Vector3; collider: THREE.Mesh; score: number }> = [];

    for (const collider of this.colliders) {
      const box = new THREE.Box3().setFromObject(collider);
      const boxCenter = new THREE.Vector3();
      box.getCenter(boxCenter);

      // ── FILTER 1: Within 15 units of teammate ──
      const distToTeammate = fromPos.distanceTo(boxCenter);
      if (distToTeammate > this.TEAMMATE_COVER_RANGE) continue;

      // ── FILTER 2: Object must have some minimum height (0.3 units) ──
      // No upper height limit — any tall object (walls, containers, barriers)
      // provides cover by blocking line-of-sight from the player's perspective.
      const objHeight = box.max.y - box.min.y;
      if (objHeight < 0.3) continue; // Too small to provide cover

      // ── FILTER 3: Must have some horizontal extent (not a tiny object) ──
      const boxWidth = box.max.x - box.min.x;
      const boxDepth = box.max.z - box.min.z;
      if (boxWidth < 0.3 && boxDepth < 0.3) continue; // Too narrow to provide cover

      // Calculate "behind cover" position — on the far side from player
      // This ensures teammate crouches behind the object relative to the player
      const awayFromPlayer = new THREE.Vector3().subVectors(boxCenter, playerPos).normalize();
      const coverPos = boxCenter.clone().add(awayFromPlayer.multiplyScalar(this.TEAMMATE_COVER_OFFSET));

      // Also try left and right flanks of the cover object
      const perpDir = new THREE.Vector3(-awayFromPlayer.z, 0, awayFromPlayer.x);
      const leftPos = coverPos.clone().add(perpDir.clone().multiplyScalar(0.6));
      const rightPos = coverPos.clone().sub(perpDir.clone().multiplyScalar(0.6));

      for (const candidate of [coverPos, leftPos, rightPos]) {
        // Check position isn't blocked by another collider
        if (this.isTeammatePositionBlocked(candidate.x, candidate.z)) continue;

        // ── FIX 2: Skip cover positions occupied by the player ──
        // If the candidate is within 2.5 units of the player, it's too close —
        // teammate would clip through the player or block their movement.
        // Increased from 1.5 to 2.5 to prevent visual overlap and ensure the
        // teammate takes a clearly distinct position from the player.
        const distToPlayer = candidate.distanceTo(playerPos);
        if (distToPlayer < 2.5) continue;

        // ── FILTER 4: Must have LOS to player from cover position ──
        // Teammate must be able to see the player while behind cover
        const hasLOSToPlayer = !this.isColliderBetween(candidate, playerPos);
        if (!hasLOSToPlayer) continue;

        // ── Score: prefer closer to teammate, bonus for actual cover blocking ──
        const distFromTeammate = candidate.distanceTo(fromPos);
        const hasColliderCover = this.isColliderBetween(candidate, playerPos);
        const coverBonus = hasColliderCover ? 30 : 0;
        const score = -distFromTeammate * 2 + distToPlayer * 0.5 + coverBonus;

        candidates.push({ pos: candidate, collider, score });
      }
    }

    // ── No suitable cover found — return null (teammate will crouch in place) ──
    if (candidates.length === 0) return null;

    // Sort by score (highest first) and pick the best
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // Store the cover object reference (for facing direction)
    this.inactiveAICoverCollider = best.collider;

    // Set terrain height
    if (this.terrainHeightProvider) {
      best.pos.y = this.terrainHeightProvider(best.pos.x, best.pos.z);
    }

    return best.pos;
  }

  /**
   * RUN TO COVER → CROUCH AT COVER — Main Take Cover state machine.
   *
   * Phases:
   *   1. RUNNING   — Teammate runs to cover position (speed = 1.5x normal)
   *   2. CROUCHING — Reaches cover, crouches automatically, faces outward
   *   3. IDLE      — Cover idle: lean toward cover, weapon ready, occasional peek
   */
  private updateTakeCover(inactiveChar: any, delta: number, activeChar: any): void {
    // ══════════════════════════════════════════════════════════════
    // PHASE 1: Find cover position if we don't have one yet
    // ══════════════════════════════════════════════════════════════
    if (!this.inactiveAICoverPos) {
      this.inactiveAICoverPos = this.findTakeCoverPosition(
        inactiveChar.position,
        activeChar.position
      );
      this.inactiveAICrouchBlend = 0;
      this.inactiveAIIsCrouching = false;
      this.takeCoverPhase = 'running';
      this.takeCoverTimer = 0;
      this.takeCoverPeeking = false;

      // If no cover found within 15 units — crouch in place as fallback
      // Edge case: teammate uses nearby terrain/geometry as improvised cover
      if (!this.inactiveAICoverPos) {
        this.inactiveAIIsMoving = false;
        this.inactiveAIIsCrouching = true;
        this.inactiveAICrouchBlend = Math.min(1, this.inactiveAICrouchBlend + delta * this.TEAMMATE_CROUCH_SPEED);
        this.takeCoverPhase = 'idle';
        this.takeCoverTimer = 0;
        this.takeCoverPeeking = false;
        
        // Face outward from current position (away from player = toward threats)
        const awayFromPlayer = new THREE.Vector3().subVectors(inactiveChar.position, activeChar.position);
        awayFromPlayer.y = 0;
        if (awayFromPlayer.length() > 0.5) {
          const targetAngle = Math.atan2(awayFromPlayer.x, awayFromPlayer.z);
          inactiveChar.rotation.y = this.lerpAnglePlayer(
            inactiveChar.rotation.y, targetAngle, 3 * delta
          );
        }
        
        // Use cover idle animation (crouching weapon-ready pose)
        this.animateTeammateCoverIdle(inactiveChar, delta);
        return;
      }
    }

    const distToCover = inactiveChar.position.distanceTo(this.inactiveAICoverPos);

    // ══════════════════════════════════════════════════════════════
    // PHASE 1.5: COVER ENTRY DELAY — 0.2s reaction time before running
    //   POLISH: Teammate briefly pauses with alert animation before
    //   sprinting to cover — looks more natural than instant reaction.
    // ══════════════════════════════════════════════════════════════
    if (this.takeCoverPhase === 'running' && !this.coverEntryDelayDone) {
      this.coverEntryDelayTimer += delta;
      this.coverAlertTimer += delta;

      // Teammate stays in place during delay — alert pose
      this.inactiveAIIsMoving = false;
      this.inactiveAIIsCrouching = false;

      // ── Alert animation: head snaps toward nearest threat direction ──
      // Head raises slightly and looks outward (awareness cue)
      const group = inactiveChar.group;
      const head = group.userData.head;
      const body = group.userData.body;
      const rightArm = group.userData.rightArm;
      const leftArm = group.userData.leftArm;

      if (head && body) {
        const alertProgress = Math.min(this.coverAlertTimer / this.COVER_ALERT_DURATION, 1);
        // Smooth ease-out for alert snap
        const alertEase = 1 - Math.pow(1 - alertProgress, 3);

        // Head raises and turns (alert scan)
        head.rotation.y = Math.sin(alertProgress * Math.PI) * 0.3;
        head.rotation.x = -0.08 * alertEase; // Slight upward tilt (looking up/around)

        // Body tenses — slight forward lean
        body.rotation.x = 0.03 * alertEase;
      }

      // Weapon raises slightly during alert (hip to low-ready)
      if (rightArm) {
        rightArm.rotation.x = -0.18 - 0.15 * Math.min(this.coverAlertTimer / this.COVER_ALERT_DURATION, 1);
      }
      if (leftArm) {
        leftArm.rotation.x = -0.05 - 0.1 * Math.min(this.coverAlertTimer / this.COVER_ALERT_DURATION, 1);
      }

      // Once delay elapses, mark as done and proceed to running
      if (this.coverEntryDelayTimer >= this.COVER_ENTRY_DELAY) {
        this.coverEntryDelayDone = true;
        this.coverAlertTimer = 0;
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 2: RUN TO COVER — Speed = 1.5x normal, running animation
    // ══════════════════════════════════════════════════════════════
    if (distToCover > 1.0 && this.takeCoverPhase === 'running') {
      // Sprint to cover at 1.5x normal run speed (7 * 1.5 = 10.5)
      const coverRunSpeed = this.TEAMMATE_RUN_SPEED * 1.5;

      // ── POLISH: Smooth deceleration within 2.0 units of cover ──
      // Ramp speed down as teammate approaches cover instead of instant stop
      let effectiveSpeed = coverRunSpeed;
      if (distToCover < 2.0) {
        const decelFactor = Math.max(0.2, distToCover / 2.0);
        effectiveSpeed = coverRunSpeed * decelFactor;
      }

      this.moveTeammateWithPathfinding(inactiveChar, this.inactiveAICoverPos, delta, effectiveSpeed);
      this.inactiveAIIsMoving = true;
      this.inactiveAIIsCrouching = false;
      this.inactiveAICrouchBlend = 0;
      this.animateTeammateRun(inactiveChar, delta);
      this.takeCoverTimer = 0;
      this.takeCoverPeeking = false;

      // Capture speed for smooth deceleration phase
      this.coverEntryDecelStartSpeed = effectiveSpeed;
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 2.5: DECELERATION — Smooth slowdown over 0.3s before crouch
    // ══════════════════════════════════════════════════════════════
    if (this.takeCoverPhase === 'running') {
      this.takeCoverPhase = 'crouching';
      this.coverEntryDecelTimer = 0;
      this.coverEntryDecelStartSpeed = Math.max(this.coverEntryDecelStartSpeed, this.TEAMMATE_WALK_SPEED);
      this.coverEntryPauseTimer = 0;
      this.inactiveAIIsCrouching = true;
      this.takeCoverTimer = 0;
    }

    if (this.takeCoverPhase === 'crouching') {
      this.coverEntryDecelTimer += delta;
      const decelProgress = Math.min(this.coverEntryDecelTimer / this.COVER_ENTRY_DECEL_DURATION, 1);
      // Ease-out curve for natural deceleration feel
      const easeDecel = 1 - Math.pow(1 - decelProgress, 2);
      const currentDecelSpeed = this.coverEntryDecelStartSpeed * (1 - easeDecel);

      if (decelProgress < 1) {
        // Still decelerating — move at decreasing speed toward cover
        const decelDir = new THREE.Vector3().subVectors(this.inactiveAICoverPos!, inactiveChar.position);
        decelDir.y = 0;
        if (decelDir.length() > 0.1) {
          decelDir.normalize();
          inactiveChar.position.x += decelDir.x * currentDecelSpeed * delta;
          inactiveChar.position.z += decelDir.z * currentDecelSpeed * delta;
          const targetAngle = Math.atan2(decelDir.x, decelDir.z);
          inactiveChar.rotation.y = this.lerpAnglePlayer(inactiveChar.rotation.y, targetAngle, 6 * delta);
        }
        this.inactiveAIIsMoving = true;
        // Use walk animation blended with run for deceleration feel
        this.animateTeammateWalk(inactiveChar, delta);
      } else {
        // Deceleration complete — transition to pause
        this.inactiveAIIsMoving = false;
        this.inactiveAICrouchBlend = Math.min(1, this.inactiveAICrouchBlend + delta * this.TEAMMATE_CROUCH_SPEED);
      }
    }

    // Smoothly crouch down
    this.inactiveAIIsMoving = false;
    this.inactiveAIIsCrouching = true;
    this.inactiveAICrouchBlend = Math.min(1, this.inactiveAICrouchBlend + delta * this.TEAMMATE_CROUCH_SPEED);

    // ── POLISH: Brief pause (0.4s) with weapon raise before going idle ──
    // Gives visual feedback that teammate has "settled" into cover
    this.coverEntryPauseTimer += delta;

    // ═══════════════════════════════════════════════════════════════
    // FACE OUTWARD FROM COVER — always face toward threats, not inward
    // ═══════════════════════════════════════════════════════════════
    
    const distToPlayerCover = inactiveChar.position.distanceTo(activeChar.position);
    
    // Determine outward direction from cover object (away from cover = toward threats)
    let outwardTargetAngle: number | null = null;
    
    if (this.inactiveAICoverCollider) {
      const coverBox = new THREE.Box3().setFromObject(this.inactiveAICoverCollider);
      const coverCenter = new THREE.Vector3();
      coverBox.getCenter(coverCenter);

      // Direction from cover center outward (away from the cover object = toward threats)
      const outwardDir = new THREE.Vector3().subVectors(inactiveChar.position, coverCenter);
      outwardDir.y = 0;

      if (outwardDir.length() > 0.1) {
        outwardTargetAngle = Math.atan2(outwardDir.x, outwardDir.z);
      }
    } else {
      // No cover collider — face away from player (toward potential threats)
      // This handles the edge case where cover position was set but no collider was found
      const awayFromPlayer = new THREE.Vector3().subVectors(inactiveChar.position, activeChar.position);
      awayFromPlayer.y = 0;
      if (awayFromPlayer.length() > 0.5) {
        outwardTargetAngle = Math.atan2(awayFromPlayer.x, awayFromPlayer.z);
      }
    }
    
    // Always face outward from cover (body direction = toward threats)
    if (outwardTargetAngle !== null) {
      inactiveChar.rotation.y = this.lerpAnglePlayer(
        inactiveChar.rotation.y, outwardTargetAngle, 3 * delta
      );
    }
    
    // Track look-at-lerp for head animation (head can glance toward player
    // while body stays facing outward)
    if (distToPlayerCover < 5.0) {
      this.coverLookAtLerp = Math.min(1, this.coverLookAtLerp + delta * 5);
    } else {
      this.coverLookAtLerp = Math.max(0, this.coverLookAtLerp - delta * 3);
    }

    // After crouch is complete AND pause elapsed, transition to cover idle
    this.takeCoverTimer += delta;
    if (this.takeCoverTimer > 0.8 && this.inactiveAICrouchBlend >= 0.9
        && this.coverEntryPauseTimer >= this.COVER_ENTRY_PAUSE_DURATION) {
      this.takeCoverPhase = 'idle';
      this.takeCoverTimer = 0;
      this.takeCoverPeeking = false;
      this.coverEntryPauseTimer = 0;
    }

    // Show crouching animation while transitioning (with weapon raise during pause)
    this.animateTeammateCoverIdle(inactiveChar, delta);

    // POLISH #5: Update cover mode visual indicator
    this.updateCoverIndicator(inactiveChar);
  }

  /**
   * COVER IDLE ANIMATION — Teammate crouches behind cover, weapon raised,
   * occasional peek (every 3-5 seconds), body weight shifts, head turns.
   *
   * Polish:
   *   - Smoother peek curve (ease-in-out)
   *   - Head looks toward player when player is nearby (<5 units)
   *   - Weapon rock-steady in idle, smooth raise during peek
   *   - Crouching idle has gentle breathing motion
   *
   * Animation layers:
   *   1. Lean toward cover object (subtle body tilt)
   *   2. Weapon raised and ready (hip/low-ready position)
   *   3. Occasional peek (smooth ease-in-out, every 3-5 seconds)
   *   4. Body weight shifts (subtle sway)
   *   5. Head turns — looks at player when nearby, scans when not
   */
  private animateTeammateCoverIdle(inactiveChar: any, delta: number): void {
    const group = inactiveChar.group;
    const leftArm = group.userData.leftArm;
    const rightArm = group.userData.rightArm;
    const leftLeg = group.userData.leftLeg;
    const rightLeg = group.userData.rightLeg;
    const body = group.userData.body;
    const head = group.userData.head;

    if (!leftArm || !rightArm || !leftLeg || !rightLeg || !body || !head) return;

    const t = this.inactiveAIAnimTime;

    // ── Peek cycle timer ──
    if (!this.takeCoverPeeking && this.takeCoverPhase === 'idle') {
      this.takeCoverTimer += delta;

      // Peek every 3-5 seconds with randomized interval (not deterministic)
      // The next interval is pre-computed when the previous peek ends, so each
      // peek-to-peek gap has genuine variation that feels organic.
      if (this.takeCoverTimer >= this.takeCoverNextPeekInterval) {
        // Start peek
        this.takeCoverPeeking = true;
        this.takeCoverTimer = 0;
        this.takeCoverPeekDir = Math.random() > 0.5 ? 1 : -1; // Peek left or right randomly
      }
    }

    if (this.takeCoverPeeking) {
      // ═══ PEEKING — smooth lean out, look, then duck back ═══
      // POLISH: Use randomized duration (1-3 seconds) for organic feel
      const peekDuration = this.currentPeekDuration;
      this.takeCoverTimer += delta;
      const peekProgress = Math.min(this.takeCoverTimer / peekDuration, 1);

      // Smooth ease-in-out curve for peek: rise out, pause, duck back
      // Uses smoothstep for natural acceleration/deceleration
      const peekCurve = peekProgress < 0.5
        ? 4 * peekProgress * peekProgress * peekProgress
        : 1 - Math.pow(-2 * peekProgress + 2, 3) / 2;

      // ── Body leans to peek side ──
      body.rotation.z = this.takeCoverPeekDir * peekCurve * 0.18;

      // ── Rise slightly during peek ──
      const peekRise = peekCurve * 0.3;
      this.inactiveAICrouchBlend = Math.max(0.3, 1.0 - peekRise);

      // ── Head turns to look in peek direction ──
      head.rotation.y = this.takeCoverPeekDir * 0.5 * peekCurve;
      head.rotation.x = -0.05 * peekCurve; // Slight forward tilt while looking

      // ── Weapon raised during peek (smooth rise) ──
      rightArm.rotation.x = -0.5 - peekCurve * 0.8;
      leftArm.rotation.x = -0.35 - peekCurve * 0.55;

      // ── Body rises slightly ──
      body.position.y = 1.05 - this.inactiveAICrouchBlend * 0.25;

      // ── Legs adjust for peek height ──
      leftLeg.rotation.x = -0.9 + peekCurve * 0.3;
      rightLeg.rotation.x = -0.9 + peekCurve * 0.3;

      // End peek when curve completes
      if (peekProgress >= 1) {
        this.takeCoverPeeking = false;
        this.takeCoverTimer = 0;
        this.inactiveAICrouchBlend = 1.0;
        // POLISH: Randomize the next peek interval (3.0 - 7.0 seconds) for organic timing
        this.takeCoverNextPeekInterval = 3.0 + Math.random() * 4.0;
        // POLISH: Randomize the next peek duration (1.0 - 3.0 seconds)
        this.currentPeekDuration = 1.0 + Math.random() * 2.0;
      }

    } else {
      // ═══ COVER IDLE — crouched behind cover, weapon ready ═══

      // ── LAYER 1: Lean slightly toward cover ──
      // Subtle body tilt toward the cover object (shows awareness of cover)
      const leanTowardCover = Math.sin(t * 0.5) * 0.03;
      body.rotation.z = leanTowardCover;

      // Slight forward lean (combat-ready posture)
      body.rotation.x = 0.05;

      // ── LAYER 2: Weapon raised and ready ──
      // Right arm: weapon held at low-ready / hip position, rock-steady
      rightArm.rotation.x = -0.5 + Math.sin(t * 0.5) * 0.02;
      rightArm.rotation.z = 0;

      // Left arm: supporting position
      leftArm.rotation.x = -0.35 + Math.sin(t * 0.4 + 0.5) * 0.015;

      // ── LAYER 3: Body weight shifts ──
      // Slow organic sway — shifts body laterally while crouched
      const weightShift1 = Math.sin(t * 0.35);  // Primary sway
      const weightShift2 = Math.sin(t * 0.22); // Secondary harmonic

      // Body lateral sway (subtle even while crouched)
      body.rotation.z += weightShift2 * 0.015;

      // Subtle vertical shift (weight on different legs)
      body.position.y = 1.05 - this.inactiveAICrouchBlend * 0.25
        + Math.abs(weightShift1) * 0.006;

      // ── LAYER 4: Head — looks at player when nearby, scans when not ──
      if (this.coverLookAtLerp > 0.1) {
        // Player is nearby — head tracks player position
        // Smooth blend between scanning and looking at player
        const scanY = Math.sin(t * 0.5) * 0.15;
        const scanX = Math.sin(t * 0.35 + 1.0) * 0.04;
        
        head.rotation.y = scanY * (1 - this.coverLookAtLerp);
        head.rotation.x = scanX;
      } else {
        // Player far away — scan environment
        head.rotation.y = Math.sin(t * 0.55) * 0.22;
        head.rotation.x = Math.sin(t * 0.38 + 1.0) * 0.05;
        head.rotation.z = Math.sin(t * 0.28 + 2.0) * 0.015;
      }

      // ── LAYER 5: Legs crouched, subtle weight transfer ──
      const legWeight = weightShift1 * 0.025;
      leftLeg.rotation.x = -1.0 - legWeight;
      rightLeg.rotation.x = -1.0 + legWeight;

      // Slight lateral leg balance
      leftLeg.rotation.z = weightShift2 * 0.008;
      rightLeg.rotation.z = -weightShift2 * 0.008;
    }
  }

  // ────────────────────────────────────────────────────────
  // POLISH #5: COVER MODE VISUAL INDICATOR
  // ────────────────────────────────────────────────────────

  /**
   * Update the visual cover-mode indicator above the teammate.
   * Shows a small translucent blue shield icon when in cover mode,
   * positioned above the teammate's head. Fades in/out smoothly.
   */
  private updateCoverIndicator(inactiveChar: any): void {
    const isActive = this.inactiveAIState === 'takeCover';

    if (isActive) {
      // Create indicator if it doesn't exist
      if (!this.coverShieldMesh) {
        // Shield icon — small blue diamond shape
        const shieldGeo = new THREE.OctahedronGeometry(0.15, 0);
        const shieldMat = new THREE.MeshBasicMaterial({
          color: 0x4488ff,
          transparent: true,
          opacity: 0.7,
          depthTest: false,
        });
        this.coverShieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        this.coverShieldMesh.renderOrder = 999;
        this.scene.add(this.coverShieldMesh);
      }

      // Position above teammate's head with gentle bob
      const now = performance.now() * 0.001;
      const bob = Math.sin(now * 2.5) * 0.08;
      const terrainY = this.terrainHeightProvider
        ? this.terrainHeightProvider(inactiveChar.position.x, inactiveChar.position.z)
        : 0;
      this.coverShieldMesh.position.set(
        inactiveChar.position.x,
        terrainY + 2.2 + bob,
        inactiveChar.position.z
      );
      this.coverShieldMesh.visible = true;

      // Pulse opacity subtly
      (this.coverShieldMesh.material as THREE.MeshBasicMaterial).opacity =
        0.5 + Math.sin(now * 3) * 0.2;
    } else {
      // Remove indicator when not in cover mode
      if (this.coverShieldMesh) {
        this.scene.remove(this.coverShieldMesh);
        (this.coverShieldMesh.geometry as THREE.BufferGeometry).dispose();
        (this.coverShieldMesh.material as THREE.Material).dispose();
        this.coverShieldMesh = null;
      }
    }
  }

  // ────────────────────────────────────────────────────────
  // POLISH #5: TEAMMATE MINIMAP DATA
  // ────────────────────────────────────────────────────────

  /**
   * Returns minimap data for the inactive teammate character.
   * Used by the HUD/minimap system to render a green dot showing
   * the teammate's position on the minimap.
   *
   * @returns Object with position, color, and whether in cover mode,
   *          or null if the inactive character is downed.
   */
  public getTeammateMinimapData(): {
    position: THREE.Vector3;
    color: number;
    inCoverMode: boolean;
  } | null {
    const inactiveType = this.activeCharacter === 'wolf' ? 'falcon' : 'wolf';

    // Don't show if downed
    if (inactiveType === 'wolf' ? this.wolfIsDowned : this.falconIsDowned) {
      return null;
    }

    const inactiveChar = this.characters[inactiveType];
    const inCoverMode = this.inactiveAIState === 'takeCover';

    // Green dot color (brighter when in cover mode)
    const color = inCoverMode ? 0x44ddff : 0x44ff44;

    return {
      position: inactiveChar.position.clone(),
      color,
      inCoverMode,
    };
  }

  // ────────────────────────────────────────────────────────
  // PATHFINDING MOVEMENT (Multi-Direction Collision Avoidance)
  // ────────────────────────────────────────────────────────

  /**
   * Move the inactive character toward a target with multi-direction
   * collision avoidance. Tries 8 directions around the primary direction
   * to pathfind around obstacles.
   * 
   * Pathfinding algorithm:
   *   1. Try direct path to target
   *   2. If blocked, try 8 alternative directions (perpendicular, diagonal)
   *   3. If all blocked, try reduced speed in primary direction
   *   4. If still blocked, stay in place (don't walk through walls)
   * 
   * The teammate rotates to face the movement direction for natural-looking
   * pathfinding around obstacles.
   */
  private moveTeammateWithPathfinding(
    char: any,
    target: THREE.Vector3,
    delta: number,
    speed: number
  ): void {
    // Calculate direction to target (ignore Y for horizontal movement)
    const dir = new THREE.Vector3().subVectors(target, char.position);
    dir.y = 0;
    const dist = dir.length();
    
    // If very close to target, stop
    if (dist < 0.5) return;
    dir.normalize();

    // Face movement direction (smooth rotation)
    const targetAngle = Math.atan2(dir.x, dir.z);
    char.rotation.y = this.lerpAnglePlayer(char.rotation.y, targetAngle, 6 * delta);

    // Calculate proposed new position
    const newX = char.position.x + dir.x * speed * delta;
    const newZ = char.position.z + dir.z * speed * delta;

    const teammateRadius = 0.5; // Collision radius

    // Track whether pathfinding finds any valid direction
    let pathfindingBlocked = false;

    // ═══ PHASE 1: TRY DIRECT PATH ═══
    if (!this.isTeammatePositionBlocked(newX, newZ)) {
      // Direct path is clear — move forward
      char.position.x = newX;
      char.position.z = newZ;
      this.lastPathfindingBlocked = false;
    } else {
      // ═══ PHASE 2: TRY 8 ALTERNATIVE DIRECTIONS ═══
      // Generate 8 candidate directions around the primary direction
      // These represent common pathfinding alternatives
      
      const alternativeDirections = [
        // Perpendicular directions (left and right)
        { x: dir.z, z: -dir.x, label: 'perp-left' },
        { x: -dir.z, z: dir.x, label: 'perp-right' },
        
        // Diagonal directions (forward-left and forward-right)
        { x: dir.x * 0.707 + dir.z * 0.707, z: dir.z * 0.707 - dir.x * 0.707, label: 'diag-left' },
        { x: dir.x * 0.707 - dir.z * 0.707, z: dir.z * 0.707 + dir.x * 0.707, label: 'diag-right' },
        
        // Wide arc directions (further to sides)
        { x: dir.x * 0.5 + dir.z * 0.866, z: dir.z * 0.5 - dir.x * 0.866, label: 'wide-left' },
        { x: dir.x * 0.5 - dir.z * 0.866, z: dir.z * 0.5 + dir.x * 0.866, label: 'wide-right' },
        
        // Axis-only directions (sometimes works when diagonal fails)
        { x: dir.x, z: 0, label: 'x-only' },
        { x: 0, z: dir.z, label: 'z-only' },
      ];

      let foundAlternative = false;

      // Sort alternatives by how close they are to the original direction
      // (prefer directions that are closest to the target)
      alternativeDirections.sort((a, b) => {
        const dotA = a.x * dir.x + a.z * dir.z;
        const dotB = b.x * dir.x + b.z * dir.z;
        return dotB - dotA; // Higher dot product = closer to original direction
      });

      for (const altDir of alternativeDirections) {
        // Normalize alternative direction
        const len = Math.sqrt(altDir.x * altDir.x + altDir.z * altDir.z);
        if (len < 0.001) continue;
        
        const normX = altDir.x / len;
        const normZ = altDir.z / len;
        
        // Try moving in this alternative direction
        const altX = char.position.x + normX * speed * delta;
        const altZ = char.position.z + normZ * speed * delta;
        
        if (!this.isTeammatePositionBlocked(altX, altZ)) {
          // Found clear path — move in this direction
          char.position.x = altX;
          char.position.z = altZ;
          foundAlternative = true;
          break;
        }
      }

      // ═══ PHASE 3: TRY REDUCED SPEED ═══
      if (!foundAlternative) {
        // Try moving with reduced speed (sometimes helps with tight spaces)
        const reducedSpeed = speed * 0.5;
        const reducedX = char.position.x + dir.x * reducedSpeed * delta;
        const reducedZ = char.position.z + dir.z * reducedSpeed * delta;
        
        if (!this.isTeammatePositionBlocked(reducedX, reducedZ)) {
          char.position.x = reducedX;
          char.position.z = reducedZ;
          this.lastPathfindingBlocked = false;
        } else {
          // All directions blocked — mark as blocked for follow wait logic
          pathfindingBlocked = true;
          this.lastPathfindingBlocked = true;
        }
      }
    }

    // ═══ MAP BOUNDS CLAMPING ═══
    // Prevent teammate from walking off the edge of the playable area
    char.position.x = Math.max(-this.MAP_BOUND_X, Math.min(this.MAP_BOUND_X, char.position.x));
    char.position.z = Math.max(this.MAP_BOUND_Z_MIN, Math.min(this.MAP_BOUND_Z_MAX, char.position.z));

    // ═══ TERRAIN HEIGHT UPDATE ═══
    // Keep teammate on terrain surface
    if (this.terrainHeightProvider) {
      const terrainY = this.terrainHeightProvider(char.position.x, char.position.z);
      // Smoothly interpolate to terrain height (prevents snapping)
      char.position.y += (terrainY + 1.7 - char.position.y) * 8 * delta;
    }
  }

  /**
   * Check if a position is blocked by any collider (teammate collision).
   */
  private isTeammatePositionBlocked(x: number, z: number): boolean {
    const radius = 0.5;
    for (const collider of this.colliders) {
      const box = new THREE.Box3().setFromObject(collider);
      if (x >= box.min.x - radius && x <= box.max.x + radius &&
          z >= box.min.z - radius && z <= box.max.z + radius) {
        return true;
      }
    }
    return false;
  }

  // ────────────────────────────────────────────────────────
  // ANGLE LERP HELPER (Player-specific)
  // ────────────────────────────────────────────────────────

  /**
   * Smoothly interpolate between two angles (handles wraparound).
   */
  private lerpAnglePlayer(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  public dispose(): void {
    this.cleanupInput();
    this.scene.remove(this.characters.wolf.group);
    this.scene.remove(this.characters.falcon.group);

    // Clean up downed visuals
    this.removeDownedVisual('wolf');
    this.removeDownedVisual('falcon');
    this.updateRescueParticles(null, false);

    // POLISH #5: Clean up cover mode indicator
    if (this.coverShieldMesh) {
      this.scene.remove(this.coverShieldMesh);
      (this.coverShieldMesh.geometry as THREE.BufferGeometry).dispose();
      (this.coverShieldMesh.material as THREE.Material).dispose();
      this.coverShieldMesh = null;
    }

    // Clear damage feedback on dispose
    this.screenShakeIntensity = 0;
    this.recoilOffset = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.fireKickZ = 0;
    this.fireKickActive = false;
    this.currentPronePitchOffset = 0;
    if (this.damageIndicators.lowHealthVignette) {
      this.damageIndicators.lowHealthVignette.classList.remove('active');
    }
    if (this.damageIndicators.vignette) {
      this.damageIndicators.vignette.classList.remove('active');
    }
  }
}
