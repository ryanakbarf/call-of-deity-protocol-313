/**
 * GameEngine.ts
 * Core game engine for Call of Deity: Protocol 313
 * 
 * Handles Three.js scene, game loop, and all core systems.
 * Now features procedural textures, sky dome, atmospheric dust,
 * and warm dawn lighting for a visually rich desert atmosphere.
 */

import * as THREE from 'three';
import { Player } from '../entities/Player';
import { EnemyManager } from '../systems/EnemyManager';
import { WeaponSystem } from '../systems/WeaponSystem';
import { StealthSystem } from '../systems/StealthSystem';
import { SummonSystem, DamageableEnemy } from '../systems/SummonSystem';
import { DebugMode } from '../debug/DebugMode';
import { MissionManager } from '../systems/MissionManager';
import { UIManager } from '../ui/UIManager';
import { AudioManager } from '../utils/AudioManager';

// ============================================================
// TYPES
// ============================================================

interface GameConfig {
  WIDTH: number;
  HEIGHT: number;
  PIXEL_RATIO: number;
  MAX_FPS: number;
  SHADOW_ENABLED: boolean;
  SHADOW_MAP_SIZE: number;
  DIFFICULTY: 'easy' | 'normal' | 'hard';
  PLAYER_HEIGHT: number;
  PLAYER_SPEED: number;
  PLAYER_SPRINT_SPEED: number;
  PLAYER_CROUCH_SPEED: number;
  PLAYER_PRONE_SPEED: number;
}

// ============================================================
// OBJECT POOL TYPES — Reuse geometry/material to avoid GC churn
// ============================================================

interface PooledTracer {
  line: THREE.Line;
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
  active: boolean;
  startTime: number;
  duration: number;
}

interface PooledSpark {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  active: boolean;
  velocity: THREE.Vector3;
  startTime: number;
  duration: number;
}

// ============================================================
// GAME ENGINE CLASS
// ============================================================

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private config: GameConfig;
  
  // Three.js
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  
  // Clock
  private clock: THREE.Clock;
  private mixer: THREE.AnimationMixer | null = null;
  
  // Systems
  private player: Player;
  private enemyManager: EnemyManager;
  private weaponSystem: WeaponSystem;
  private stealthSystem: StealthSystem;
  private summonSystem: SummonSystem;
  private missionManager: MissionManager;
  private uiManager: UIManager;
  private audioManager: AudioManager;
  private debugMode: DebugMode;
  
  // State
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private rafId: number = 0;
  private timeScale: number = 1.0; // 0.3 when command wheel is open
  
  // Active character
  private activeCharacter: 'wolf' | 'falcon' = 'wolf';

  // Current mission ID (1 = Desert Dawn, 2 = Iron Rain)
  private currentMissionId: number = 1;

  // Score
  private score: number = 0;

  // Collision — all meshes the player must not pass through
  public colliders: THREE.Mesh[] = [];

  // Kill tracking for mission objectives
  private killCount: number = 0;
  private obj_1_2_completed: boolean = false;

  // ============================================================
  // MISSION 1 OBJECTIVE SYSTEM — Tracking Variables
  // ============================================================
  private missionPhase: number = 1;         // Current mission phase (1-5)
  private enemiesKilledInZone: number = 0;  // Phase 2 kill counter
  private c4PlantProgress: number = 0;      // Phase 3: seconds held (0-3)
  private c4Planting: boolean = false;      // Phase 3: currently planting
  private waveCount: number = 0;            // Phase 4: current wave (0-3)
  private waveSpawnTimer: number = 0;       // Phase 4: timer between waves
  private waveSpawnActive: boolean = false;  // Phase 4: waiting to spawn next wave
  private extractionTimer: number = 60;     // Phase 5: 60 second countdown
  private extractionWarningPlayed: boolean = false;
  private radarPosition: THREE.Vector3 = new THREE.Vector3(12, 0, 46); // Radar location (shifted +90)

  // Mission 1 level objects group for clean removal
  private mission1Group: THREE.Group = new THREE.Group();

  // ═══════════════════════════════════════════════════════════════
  // MISSION 2 — IRON RAIN (Urban Warfare) Tracking Variables
  // ═══════════════════════════════════════════════════════════════
  private mission2Group: THREE.Group = new THREE.Group();
  private mission2Phase: number = 1;
  private mission2MarketEnemiesKilled: number = 0;
  private mission2IntelProgress: number = 0;        // Seconds held (0–5)
  private mission2IntelDownloading: boolean = false;
  private mission2WaveCount: number = 0;
  private mission2WaveSpawnActive: boolean = false;
  private mission2WaveSpawnTimer: number = 0;
  private mission2ExtractionTimer: number = 45;
  private mission2ServerPosition: THREE.Vector3 = new THREE.Vector3(0, 6, 85); // Server on rooftop
  private mission2FountainPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 72); // Central plaza fountain
  private mission2ExtractionPoint: THREE.Vector3 = new THREE.Vector3(0, 0, 190); // Back near spawn
  private mission2IntelDownloaded: boolean = false;
  private mission2RooftopReached: boolean = false;
  private mission2MarkerGroup: THREE.Group | null = null; // Objective marker
  private mission2MarkerPulse: number = 0;
  private mission2ExtractionMarkerGroup: THREE.Group | null = null;
  private mission2ExtractionMarkerPulse: number = 0;
  private mission2Objective7Completed: boolean = false;

  // ═══════════════════════════════════════════════════════════════
  // MISSION 3 — THE NEST (Elimination) Tracking Variables
  // ═══════════════════════════════════════════════════════════════
  private mission3Group: THREE.Group = new THREE.Group();
  private mission3Phase: number = 1;                    // Current phase (1-5)
  private mission3CommanderAlphaKilled: boolean = false; // Commander Alpha status
  private mission3CommanderBetaKilled: boolean = false;  // Commander Beta status
  private mission3CommanderGammaKilled: boolean = false; // Commander Gamma status
  private mission3ExtractionTimer: number = 60;          // 60 second countdown for extraction
  private mission3ExtractionActive: boolean = false;     // Extraction phase active
  private mission3ExtractionMarkerGroup: THREE.Group | null = null;
  private mission3ExtractionMarkerPulse: number = 0;
  private mission3CommanderMarkerGroup: THREE.Group | null = null; // Objective marker for current commander
  private mission3CommanderMarkerPulse: number = 0;
  private mission3CollapseWarningPlayed: boolean = false;
  private mission3ExtractionPoint: THREE.Vector3 = new THREE.Vector3(0, 0, 190); // Back near spawn
  private mission3DoorOpenAlpha: boolean = false;  // Reinforced door state
  private mission3DoorOpenBeta: boolean = false;   // Reinforced door state

  // Audio alert state — so we only fire once when detection crosses 70
  private wasAlertTriggered: boolean = false;

  // ── Phase transition delay (2-second pause between phases) ──
  private phaseTransitionDelay: number = 0; // Countdown in seconds before next phase activates

  // ── Mission stats for end-of-mission screen ──
  private missionStartTime: number = 0;       // performance.now() when mission starts
  private totalKillCount: number = 0;          // Total kills during the entire mission
  private stealthKillCount: number = 0;        // Stealth kills (from behind)
  private alertTriggerCount: number = 0;       // Times detection crossed 70
  private extractionBeepLastMark: number = 60; // Track last 10-second mark for beep cadence

  // ============================================================
  // RADIO CHATTER SYSTEM — Text-to-speech style battlefield comms
  // ============================================================
  private firstKillTriggered: boolean = false;
  private lastKillRadioTime: number = 0;
  private lastDamageRadioTime: number = 0;
  private lastAmbientRadioTime: number = 0;
  private lastStealthRadioTime: number = 0;
  private extractionLZWarned: boolean = false;
  private waveReinforceAnnounced: boolean = false;
  private readonly RADIO_COOLDOWN: number = 5000;       // 5s between tactical radio lines
  private readonly AMBIENT_RADIO_INTERVAL: number = 30000; // 30s ambient chatter cycle
  private readonly STEALTH_RADIO_INTERVAL: number = 25000; // 25s between stealth observations

  // ============================================================
  // MISSION 1 SCRIPTED EVENT SYSTEM
  // ============================================================
  private eventFlags: Record<string, boolean> = {
    'pre_briefing': false,
    'stealth_tutorial': false,
    'falcon_position': false,
    'alarm_trigger': false,
    'summon_unlock': false,
    'wave_1': false,
    'wave_2': false,
    'wave_3': false,
    'extraction_start': false,
    'extraction_30s': false,
    'extraction_10s': false,
    'mission_complete': false,
    // Mission 2 flags
    'm2_briefing': false,
    'm2_first_kill': false,
    'm2_market_entry': false,
    'm2_rooftop_approach': false,
    'm2_intel_started': false,
    'm2_intel_complete': false,
    'm2_wave_start': false,
    'm2_extraction_start': false,
    // Mission 3 flags
    'm3_briefing': false,
    'm3_perimeter_breach': false,
    'm3_alpha_chamber': false,
    'm3_alpha_killed': false,
    'm3_beta_chamber': false,
    'm3_beta_killed': false,
    'm3_gamma_chamber': false,
    'm3_gamma_killed': false,
    'm3_extraction_start': false,
    'm3_collapse_warning': false,
  };
  private extraction30sWarningPlayed: boolean = false;
  private extraction10sWarningPlayed: boolean = false;

  // ============================================================
  // MISSION 1 — VISUAL MARKERS (C4, Extraction, Downed Arrow)
  // ============================================================
  private c4MarkerGroup: THREE.Group | null = null;   // Pulsing orange circle + floating arrow at radar
  private c4MarkerPulse: number = 0;                   // Animation timer for C4 marker
  private extractionMarkerGroup: THREE.Group | null = null; // Green beacon at extraction point
  private extractionMarkerPulse: number = 0;           // Animation timer for extraction marker
  private extractionPointPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 195); // Extraction point near spawn
  private lastWeaponName: string = '';                  // Track weapon name changes for HUD update

  // Low-health effect state
  private lowHealthActive: boolean = false;
  private criticalHealthActive: boolean = false;

  // ---- BULLET TRAIL SYSTEM ----
  private activeBulletTrails: PooledTracer[] = [];
  private lastEnemyDamage: number = 0; // Stored from enemy attack, applied only if bullet reaches player

  // ---- MUZZLE FLASH SYSTEM ----
  private muzzleFlashMesh: THREE.Mesh;
  private muzzleFlashLight: THREE.PointLight;
  private muzzleFlashActive: boolean = false;
  private muzzleFlashStartTime: number = 0;
  private readonly MUZZLE_FLASH_DURATION: number = 50;

  // ---- IMPACT SPARKS SYSTEM ----
  private sparkGeometry: THREE.BoxGeometry;
  private activeSparks: PooledSpark[] = [];
  private readonly SPARK_DURATION: number = 300;
  private readonly GRAVITY: number = -9.8;

  // ---- OBJECT POOLS — Pre-allocated reusable objects to reduce GC churn ----
  private readonly TRACER_POOL_SIZE: number = 40;
  private readonly SPARK_POOL_SIZE: number = 80;
  private tracerPool: PooledTracer[] = [];
  private sparkPool: PooledSpark[] = [];

  // ---- ATMOSPHERIC DUST PARTICLES ----
  private dustParticles: THREE.Points | null = null;
  private dustPositions: Float32Array | null = null;
  private readonly DUST_COUNT: number = 200;
  private readonly DUST_SPREAD_X: number = 40;
  private readonly DUST_SPREAD_Y: number = 12;
  private readonly DUST_SPREAD_Z: number = 40;
  private dustWindSpeed: THREE.Vector3 = new THREE.Vector3(0.3, 0.05, 0.15);

  // ---- BOUNDARY WARNING SYSTEM ----
  private boundaryOverlay: HTMLElement | null = null;
  private boundaryWarningActive: boolean = false;
  private readonly BOUNDARY_WARNING_MARGIN: number = 10;

  // ---- AMMO PICKUP SYSTEM ----
  private ammoPickups: THREE.Mesh[] = [];
  private ammoPickupLights: THREE.PointLight[] = [];
  private readonly AMMO_PICKUP_RANGE: number = 1.5;
  private readonly AMMO_PICKUP_AMOUNT: number = 30;

  // ---- NIGHT VISION SYSTEM ----
  private nightVisionOverlay: HTMLElement | null = null;
  private nightVisionLight: THREE.PointLight | null = null;
  private nightVisionActive: boolean = false;
  private originalAmbientIntensity: number = 0;
  private originalDirectionalIntensity: number = 0;
  private originalFillIntensity: number = 0;
  private originalHemiIntensity: number = 0;
  private nightVisionEmissiveMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();

  constructor(canvas: HTMLCanvasElement, config: GameConfig) {
    this.canvas = canvas;
    this.config = config;
    
    // Initialize Three.js
    this.renderer = this.createRenderer();
    this.scene = new THREE.Scene();
    this.camera = this.createCamera();
    
    // Clock
    this.clock = new THREE.Clock();
    
    // Initialize systems
    this.audioManager = new AudioManager();
    this.player = new Player(this.scene, this.config);
    this.player.setCanvas(this.canvas);
    this.player.setShootCallback(() => this.handleShoot());
    this.player.setSwitchCallback(() => this.switchCharacter());
    this.player.setAutoSwitchCallback(() => this.switchCharacter());
    this.player.setIsSniperCallback(() => this.weaponSystem.isCurrentWeaponSniper());
    this.player.setMaxZoomCallback(() => this.weaponSystem.getMaxZoom());
    this.player.setDeathCallback(() => this.onPlayerDeath());
    this.player.setFootstepCallback((surface) => this.audioManager.playFootstep(surface));
    this.player.setAudioManager(this.audioManager);
    this.player.setWeaponSlotCallback((slot) => this.handleWeaponSlotChange(slot));
    this.player.setNightVisionCallback((active) => this.toggleNightVision(active));
    this.player.setCommandWheelCallback((open) => this.handleCommandWheel(open));
    this.player.setTacticalCommandCallback((cmd) => this.handleTacticalCommand(cmd));
    this.player.setLeanCallback((dir) => this.uiManager.updateLeanIndicator(dir));
    this.enemyManager = new EnemyManager(this.scene);
    this.enemyManager.onAttackPlayer = (damage) => this.onPlayerTakeDamage(damage);
    this.enemyManager.onAttackCallback = (from, to) => {
      this.lastEnemyDamage = this.enemyManager.getLastAttackDamage();
      this.createEnemyBulletTracer(from, to);
    };
    this.weaponSystem = new WeaponSystem(this.scene);

    // Wire timed reload callbacks — update ammo HUD when reload finishes
    this.weaponSystem.onReloadComplete = () => {
      const weapon = this.weaponSystem.getCurrentWeapon();
      this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);
      this.uiManager.hideReloadIndicator();

      // ═══ RADIO CHATTER — Reload complete ═══
      // Wolf personality: short, efficient
      this.uiManager.showRadioSubtitle('Wolf: Reloaded', 1500);
    };
    this.weaponSystem.onReloadStarted = () => {
      this.uiManager.showReloadIndicator();
    };

    this.stealthSystem = new StealthSystem();
    this.summonSystem = new SummonSystem(this.scene, this.audioManager);
    this.missionManager = new MissionManager();
    this.debugMode = new DebugMode(this.scene);
    this.uiManager = new UIManager();

    // Set terrain height provider so player walks on undulating dunes
    this.player.setTerrainHeightProvider((x, z) => this.getTerrainHeight(x, z));

    // Set enemy positions provider for inactive character AI
    this.player.setEnemyPositionsProvider(() => {
      return this.enemyManager.getAliveEnemies().map(e => e.group.position);
    });
    
    // Set initial player Y positions based on terrain
    this.player.setInitialTerrainHeight();

    // ---- Pre-allocate muzzle flash ----
    this.muzzleFlashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 1.0 })
    );
    this.muzzleFlashMesh.visible = false;
    this.scene.add(this.muzzleFlashMesh);

    this.muzzleFlashLight = new THREE.PointLight(0xffaa00, 3, 10, 2);
    this.muzzleFlashLight.visible = false;
    this.scene.add(this.muzzleFlashLight);

    // ---- Pre-allocate spark geometry ----
    this.sparkGeometry = new THREE.BoxGeometry(0.02, 0.02, 0.02);

    // ---- Pre-allocate tracer pool (reusable line objects) ----
    for (let i = 0; i < this.TRACER_POOL_SIZE; i++) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(6); // 2 vertices * 3 components
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 1.0,
      });
      const line = new THREE.Line(geometry, material);
      line.visible = false;
      this.scene.add(line);
      this.tracerPool.push({
        line,
        geometry,
        material,
        active: false,
        startTime: 0,
        duration: 100,
      });
    }

    // ---- Pre-allocate spark pool (reusable mesh objects) ----
    for (let i = 0; i < this.SPARK_POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffcc00,
        transparent: true,
        opacity: 1.0,
      });
      const mesh = new THREE.Mesh(this.sparkGeometry, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparkPool.push({
        mesh,
        material,
        active: false,
        velocity: new THREE.Vector3(),
        startTime: 0,
        duration: 300,
      });
    }

    // Wire mission completion callback
    this.missionManager.onComplete = (mission) => {
      this.onMissionComplete(mission);
    };
    
    // Setup — order matters! colliders must be set BEFORE environment builds enemies
    this.setupLighting();
    this.player.setColliders(this.colliders);
    this.enemyManager.setColliders(this.colliders);
    this.enemyManager.setTerrainHeightProvider((x, z) => this.getTerrainHeight(x, z));
    this.debugMode.setColliders(this.colliders);
    this.debugMode.setTerrainHeightProvider((x, z) => this.getTerrainHeight(x, z));
    this.setupEnvironment(); // This calls spawnEnemies which needs colliders
    this.createDustParticles();
    this.createBoundaryOverlay();
    this.createNightVisionOverlay();
    this.setupEventListeners();
    this.setupGameOverListener();
  }

  // ============================================================
  // THREE.JS SETUP
  // ============================================================

  private createRenderer(): THREE.WebGLRenderer {
    this.canvas.width = window.innerWidth || 1920;
    this.canvas.height = window.innerHeight || 1080;
    
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    
    renderer.setSize(this.canvas.width, this.canvas.height);
    renderer.setPixelRatio(this.config.PIXEL_RATIO);
    renderer.shadowMap.enabled = this.config.SHADOW_ENABLED;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    return renderer;
  }

  private createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      75,
      this.config.WIDTH / this.config.HEIGHT,
      0.1,
      1000
    );
    
    camera.position.set(0, this.config.PLAYER_HEIGHT, 0);
    this.scene.add(camera);
    
    return camera;
  }

  // ============================================================
  // PROCEDURAL TEXTURES
  // ============================================================

  /**
   * Creates a sand texture on an offscreen canvas.
   * Base color #C2B280 with random grain pixels.
   */
  private createSandTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base sand color
    ctx.fillStyle = '#C2B280';
    ctx.fillRect(0, 0, size, size);

    // Add random grain dots (~500 lighter/darker specks)
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const brightness = Math.random() > 0.5 ? 255 : 0; // white or black
      const alpha = 0.1 + Math.random() * 0.1; // 10–20% opacity
      ctx.fillStyle = `rgba(${brightness},${brightness},${brightness},${alpha})`;
      ctx.fillRect(x, y, 1 + Math.floor(Math.random() * 2), 1 + Math.floor(Math.random() * 2));
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Creates a concrete texture with cracks and speckles.
   * Base #888888 with dark crack lines and random speckle.
   */
  private createConcreteTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base concrete grey
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, size, size);

    // Dark cracks (thin random lines)
    ctx.strokeStyle = 'rgba(40,40,40,0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      const startX = Math.random() * size;
      const startY = Math.random() * size;
      ctx.moveTo(startX, startY);
      // Draw 2–4 connected line segments for each crack
      const segments = 2 + Math.floor(Math.random() * 3);
      for (let s = 0; s < segments; s++) {
        ctx.lineTo(
          startX + (Math.random() - 0.5) * 80,
          startY + (Math.random() - 0.5) * 80
        );
      }
      ctx.stroke();
    }

    // Speckles
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const grey = 60 + Math.floor(Math.random() * 60);
      ctx.fillStyle = `rgba(${grey},${grey},${grey},0.3)`;
      ctx.fillRect(x, y, 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Creates a brushed metal texture with horizontal streaks.
   * Base #555555 with lighter horizontal lines.
   */
  private createMetalTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base dark grey metal
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, size, size);

    // Horizontal brushed lines (lighter streaks)
    for (let y = 0; y < size; y += 1 + Math.floor(Math.random() * 2)) {
      if (Math.random() > 0.4) {
        const lightness = 120 + Math.floor(Math.random() * 60);
        const alpha = 0.05 + Math.random() * 0.12;
        ctx.fillStyle = `rgba(${lightness},${lightness},${lightness},${alpha})`;
        ctx.fillRect(0, y, size, 1);
      }
    }

    // A few brighter scratch lines
    ctx.strokeStyle = 'rgba(180,180,180,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Creates a dirt texture with dark spots and pebbles.
   * Base #6B4226 with random circles and pebble shapes.
   */
  private createDirtTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base dirt brown
    ctx.fillStyle = '#6B4226';
    ctx.fillRect(0, 0, size, size);

    // Dark spots
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 1 + Math.random() * 3;
      ctx.fillStyle = `rgba(30,15,5,${0.15 + Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pebble-like circles (lighter)
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 2 + Math.random() * 4;
      const grey = 120 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgba(${grey},${grey - 30},${grey - 60},0.25)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * Creates the dawn sky gradient on a canvas.
   * Vertical gradient: warm orange → deep purple → dark navy.
   */
  private createSkyGradientTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Vertical gradient from bottom (orange) to top (navy)
    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0.0, '#FF6B35');  // warm orange at horizon
    gradient.addColorStop(0.15, '#FF8C42'); // lighter orange
    gradient.addColorStop(0.3, '#CC4488');  // magenta transition
    gradient.addColorStop(0.45, '#2D1B69'); // deep purple
    gradient.addColorStop(0.7, '#15103A');  // dark indigo
    gradient.addColorStop(1.0, '#0A0A2E');  // dark navy at zenith

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // ============================================================
  // SCENE SETUP
  // ============================================================

  private setupLighting(): void {
    // --- Ambient light: warm dawn tone ---
    const ambientLight = new THREE.AmbientLight(0x664433, 0.4);
    this.scene.add(ambientLight);
    this.originalAmbientIntensity = 0.4; // Store ONCE
    
    // --- Directional light (sun): warm orange, low on horizon ---
    const sunLight = new THREE.DirectionalLight(0xFFAA66, 0.4);
    sunLight.position.set(30, 20, -50);
    sunLight.castShadow = true;
    // Cap shadow map at 1024 for performance (higher = more GPU memory + slower renders)
    const shadowRes = Math.min(this.config.SHADOW_MAP_SIZE, 1024);
    sunLight.shadow.mapSize.width = shadowRes;
    sunLight.shadow.mapSize.height = shadowRes;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    this.scene.add(sunLight);
    this.originalDirectionalIntensity = 0.4; // Store ONCE

    // --- Blue fill light from opposite side (subtle cool rim) ---
    const fillLight = new THREE.DirectionalLight(0x4466AA, 0.2);
    fillLight.position.set(-30, 30, 50);
    this.scene.add(fillLight);
    this.originalFillIntensity = 0.2; // Store ONCE
    
    // --- Hemisphere light: deep sky blue / warm brown ---
    const hemiLight = new THREE.HemisphereLight(0x1a1a4e, 0x4a3520, 0.5);
    this.scene.add(hemiLight);
    this.originalHemiIntensity = 0.5; // Store ONCE
  }

  private setupEnvironment(): void {
    // No flat background — the sky dome handles it
    this.scene.background = null;

    // Exponential fog matching the dawn atmosphere (slightly denser for atmosphere)
    this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.007);
    
    // Ground-level fog layers — thicker atmosphere near terrain surface
    this.createGroundFog();
    
    // ---- Create procedural textures ----
    const sandTexture = this.createSandTexture();
    const concreteTexture = this.createConcreteTexture();
    const metalTexture = this.createMetalTexture();
    const dirtTexture = this.createDirtTexture();

    // ---- Sky dome ----
    this.createSkyDome();
    
    // ---- Ground — UNDULATING DESERT DUNES ----
    // High subdivision for smooth terrain curves
    const groundGeometry = new THREE.PlaneGeometry(500, 500, 200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
      map: sandTexture,
      color: 0xC2B280, // sand tint blended with texture
      roughness: 0.9,
      metalness: 0.1,
      flatShading: false,
    });

    // Apply terrain height to each vertex BEFORE rotation
    // PlaneGeometry lies in XY plane; after rotation.x = -PI/2:
    //   local x → world x, local y → world -z, local z → world y (height)
    const groundPos = groundGeometry.getAttribute('position');
    for (let i = 0; i < groundPos.count; i++) {
      const localX = groundPos.getX(i);
      const localY = groundPos.getY(i);
      // Convert local Y to world Z (inverted by -PI/2 rotation)
      const worldX = localX;
      const worldZ = -localY;
      const height = this.getTerrainHeight(worldX, worldZ);
      groundPos.setZ(i, height);
    }
    groundPos.needsUpdate = true;
    groundGeometry.computeVertexNormals();

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // ---- Dirt patch (dark ground near the wall) ----
    const dirtGeometry = new THREE.PlaneGeometry(60, 40);
    const dirtMaterial = new THREE.MeshStandardMaterial({
      map: dirtTexture,
      color: 0x6B4226,
      roughness: 0.95,
      metalness: 0.0,
    });
    const dirtPatch = new THREE.Mesh(dirtGeometry, dirtMaterial);
    dirtPatch.rotation.x = -Math.PI / 2;
    dirtPatch.position.set(0, 0.01, 55); // slightly above ground to avoid z-fighting
    dirtPatch.receiveShadow = true;
    this.scene.add(dirtPatch);
    
    // Add Mission 1 level — COD-style combat arena
    this.addMission1Level(concreteTexture, metalTexture);
  }

  /**
   * Creates a large inverted sphere with a dawn gradient texture.
   */
  private createSkyDome(): void {
    const skyGeometry = new THREE.SphereGeometry(250, 32, 32);
    const skyTexture = this.createSkyGradientTexture();
    const skyMaterial = new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide,
      fog: false, // Sky dome不受fog影响
    });
    const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(skyDome);
  }

  // ============================================================
  // MISSION 1 LEVEL — COD-STYLE COMBAT ARENA
  // ============================================================

  /**
   * Adds a single building: 4 walls + flat roof.
   * All meshes are added to mission1Group for clean removal.
   */
  private addBuilding(
    x: number, z: number,
    width: number, depth: number, height: number,
    concreteTexture: THREE.CanvasTexture,
    options?: { doorwayWall?: 'north' | 'south' | 'east' | 'west'; color?: number }
  ): void {
    const buildingColor = options?.color ?? 0x7B6B5A;
    const material = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: buildingColor,
      roughness: 0.85,
      metalness: 0.15,
    });

    const wallThickness = 0.4;
    const halfW = width / 2;
    const halfD = depth / 2;
    const terrainY = this.getTerrainHeight(x, z); // Terrain height at building center
    const wallY = terrainY + height / 2; // Walls sit on terrain

    // Helper to create a single wall box
    const makeWall = (wW: number, dD: number, px: number, pz: number, ry: number) => {
      const geo = new THREE.BoxGeometry(wW, height, wallThickness);
      // Share material across walls in same building — reduces draw calls via batching
      const mesh = new THREE.Mesh(geo, material);
      
      // Sample terrain along this wall's length to find lowest point
      const cosR = Math.cos(ry);
      const sinR = Math.sin(ry);
      const halfW2 = wW / 2;
      const halfD2 = dD / 2;
      const x1 = px - cosR * halfW2;
      const z1 = pz - sinR * halfW2;
      const x2 = px + cosR * halfW2;
      const z2 = pz + sinR * halfW2;
      const wallTerrainY = this.getTerrainMinAlongLine(x1, z1, x2, z2, 6);
      
      mesh.position.set(px, wallTerrainY + height / 2, pz);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.mission1Group.add(mesh);
      this.colliders.push(mesh);
    };

    // North wall (z+ side)
    if (options?.doorwayWall !== 'north') {
      makeWall(width, wallThickness, x, z + halfD, 0);
    } else {
      // Split into two halves with a doorway gap in the center (2.5 wide)
      const sideW = (width - 2.5) / 2;
      if (sideW > 0.1) {
        makeWall(sideW, wallThickness, x - halfW + sideW / 2, z + halfD, 0);
        makeWall(sideW, wallThickness, x + halfW - sideW / 2, z + halfD, 0);
      }
    }

    // South wall (z- side)
    if (options?.doorwayWall !== 'south') {
      makeWall(width, wallThickness, x, z - halfD, 0);
    } else {
      const sideW = (width - 2.5) / 2;
      if (sideW > 0.1) {
        makeWall(sideW, wallThickness, x - halfW + sideW / 2, z - halfD, 0);
        makeWall(sideW, wallThickness, x + halfW - sideW / 2, z - halfD, 0);
      }
    }

    // East wall (x+ side)
    if (options?.doorwayWall !== 'east') {
      makeWall(depth, wallThickness, x + halfW, z, Math.PI / 2);
    } else {
      const sideD = (depth - 2.5) / 2;
      if (sideD > 0.1) {
        makeWall(sideD, wallThickness, x + halfW, z - halfD + sideD / 2, Math.PI / 2);
        makeWall(sideD, wallThickness, x + halfW, z + halfD - sideD / 2, Math.PI / 2);
      }
    }

    // West wall (x- side)
    if (options?.doorwayWall !== 'west') {
      makeWall(depth, wallThickness, x - halfW, z, Math.PI / 2);
    } else {
      const sideD = (depth - 2.5) / 2;
      if (sideD > 0.1) {
        makeWall(sideD, wallThickness, x - halfW, z - halfD + sideD / 2, Math.PI / 2);
        makeWall(sideD, wallThickness, x - halfW, z + halfD - sideD / 2, Math.PI / 2);
      }
    }

    // Flat roof
    const roofGeo = new THREE.BoxGeometry(width + 0.3, 0.3, depth + 0.3);
    const roofMat = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: buildingColor,
      roughness: 0.9,
      metalness: 0.1,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(x, height + 0.15, z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.mission1Group.add(roof);
  }

  /**
   * Adds a cover object by type at the given position.
   * Types: 'hesco', 'tireStack', 'container', 'vehicleWreck', 'sandDune',
   *        'concreteWall', 'ruinedWall'
   */
  /**
   * Get the LOWEST terrain height along a wall segment.
   * Used for walls/buildings on sloped terrain — base Y = lowest point
   * so the wall sits flush with ground everywhere.
   */
  private getTerrainMinAlongLine(
    x1: number, z1: number,
    x2: number, z2: number,
    samples: number = 8
  ): number {
    let minY = Infinity;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const sx = x1 + (x2 - x1) * t;
      const sz = z1 + (z2 - z1) * t;
      const y = this.getTerrainHeight(sx, sz);
      if (y < minY) minY = y;
    }
    return minY;
  }

  private addCover(
    x: number, z: number,
    type: string,
    options?: {
      rotation?: number;
      scale?: THREE.Vector3;
      metalTexture?: THREE.CanvasTexture;
      concreteTexture?: THREE.CanvasTexture;
      rockRadius?: number;
      wallLength?: number; // for terrain min sampling
    }
  ): void {
    const rotation = options?.rotation ?? 0;
    let mesh: THREE.Mesh;
    let addCollider = true;
    let localY = 0;

    // For walls, sample terrain along the wall length to find lowest point
    const wallLen = options?.wallLength ?? 4;
    const halfLen = wallLen / 2;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const x1 = x - cosR * halfLen;
    const z1 = z - sinR * halfLen;
    const x2 = x + cosR * halfLen;
    const z2 = z + sinR * halfLen;
    const terrainY = this.getTerrainMinAlongLine(x1, z1, x2, z2, 8);

    switch (type) {
      case 'hesco': {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.9, metalness: 0.05 });
        mesh = new THREE.Mesh(geo, mat);
        localY = 0.5;
        mesh.rotation.y = rotation;
        break;
      }
      case 'tireStack': {
        const geo = new THREE.CylinderGeometry(0.5, 0.55, 1, 12);
        const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.85, metalness: 0.1 });
        mesh = new THREE.Mesh(geo, mat);
        localY = 0.5;
        mesh.rotation.y = rotation;
        break;
      }
      case 'container': {
        const geo = new THREE.BoxGeometry(3, 2.5, 2.5);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x556B2F,
          roughness: 0.75,
          metalness: 0.3,
        });
        mesh = new THREE.Mesh(geo, mat);
        localY = 1.25;
        mesh.rotation.y = rotation;
        break;
      }
      case 'vehicleWreck': {
        const geo = new THREE.BoxGeometry(3, 1.5, 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8, metalness: 0.4 });
        mesh = new THREE.Mesh(geo, mat);
        localY = 0.75;
        mesh.rotation.y = rotation;
        mesh.rotation.z = 0.05;
        mesh.rotation.x = -0.03;
        break;
      }
      case 'sandDune': {
        const geo = new THREE.SphereGeometry(2.5, 12, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0xC2B280, roughness: 0.95, metalness: 0.0 });
        mesh = new THREE.Mesh(geo, mat);
        localY = 0;
        const duneScale = options?.scale ?? new THREE.Vector3(1, 0.35, 1);
        mesh.scale.set(duneScale.x, duneScale.y * 0.35, duneScale.z);
        break;
      }
      case 'concreteWall': {
        const geo = new THREE.BoxGeometry(4, 2.5, 0.5);
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8, metalness: 0.15 });
        mesh = new THREE.Mesh(geo, mat);
        localY = 1.25;
        mesh.rotation.y = rotation;
        break;
      }
      case 'ruinedWall': {
        const geo = new THREE.BoxGeometry(4, 3, 0.5);
        const mat = new THREE.MeshStandardMaterial({ color: 0x7B6B5A, roughness: 0.85, metalness: 0.1 });
        mesh = new THREE.Mesh(geo, mat);
        localY = 1.5;
        mesh.rotation.y = rotation;
        break;
      }
      case 'rock': {
        const radius = options?.rockRadius ?? 1.0;
        const geo = new THREE.DodecahedronGeometry(radius, 0);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x6B5B4F,
          roughness: 0.9,
          metalness: 0.1,
        });
        mesh = new THREE.Mesh(geo, mat);
        localY = radius;
        mesh.rotation.set(
          (Math.random() - 0.5) * 0.5,
          rotation + Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.5
        );
        break;
      }
      default: {
        console.warn(`[addCover] Unknown cover type: ${type}`);
        return;
      }
    }

    // Place on terrain
    mesh.position.set(x, terrainY + localY, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mission1Group.add(mesh);
    if (addCollider) {
      this.colliders.push(mesh);
    }
  }

  /**
   * Creates a guard tower with a cylindrical pole and platform on top.
   */
  private addGuardTower(
    x: number, z: number,
    poleRadius: number, height: number,
    metalTexture: THREE.CanvasTexture,
    options?: { platformSize?: number }
  ): void {
    const platformSize = options?.platformSize ?? 2;
    const terrainY = this.getTerrainHeight(x, z);

    // Pole
    const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius * 1.2, height, 8);
    const poleMat = new THREE.MeshStandardMaterial({
      map: metalTexture,
      color: 0x555555,
      roughness: 0.6,
      metalness: 0.5,
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, terrainY + height / 2, z);
    pole.castShadow = true;
    pole.receiveShadow = true;
    this.mission1Group.add(pole);

    // Platform on top
    const platGeo = new THREE.BoxGeometry(platformSize, 0.2, platformSize);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.7,
      metalness: 0.4,
    });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(x, terrainY + height + 0.1, z);
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.mission1Group.add(platform);
    this.colliders.push(platform);

    // Railing (4 low walls around platform)
    const railH = 0.5;
    const railT = 0.1;
    const railPositions = [
      { px: 0, pz: platformSize / 2, w: platformSize, d: railT },      // north
      { px: 0, pz: -platformSize / 2, w: platformSize, d: railT },     // south
      { px: platformSize / 2, pz: 0, w: railT, d: platformSize },      // east
      { px: -platformSize / 2, pz: 0, w: railT, d: platformSize },     // west
    ];
    for (const rp of railPositions) {
      const railGeo = new THREE.BoxGeometry(rp.w, railH, rp.d);
      const railMesh = new THREE.Mesh(railGeo, platMat);
      railMesh.position.set(x + rp.px, height + 0.1 + railH / 2, z + rp.pz);
      railMesh.castShadow = true;
      railMesh.receiveShadow = true;
      this.mission1Group.add(railMesh);
    }
  }

  /**
   * Creates a spotlight tower (visual cone + light) at the given position.
   */
  private addSpotlightTower(
    x: number, z: number, height: number,
    poleRadius: number,
    metalTexture: THREE.CanvasTexture
  ): void {
    // Pole
    const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius * 1.2, height, 8);
    const poleMat = new THREE.MeshStandardMaterial({
      map: metalTexture,
      color: 0x444444,
      metalness: 0.5,
      roughness: 0.6,
    });
    const tower = new THREE.Mesh(poleGeo, poleMat);
    tower.position.set(x, height / 2, z);
    tower.castShadow = true;
    tower.receiveShadow = true;
    this.mission1Group.add(tower);
    this.colliders.push(tower);

    // Spotlight light
    const spotlight = new THREE.SpotLight(0xffffaa, 2, 50, Math.PI / 6, 0.5);
    spotlight.position.set(x, height, z);
    spotlight.target.position.set(x, 0, z + 10);
    spotlight.castShadow = true;
    this.mission1Group.add(spotlight);
    this.mission1Group.add(spotlight.target);

    // Visual cone
    const coneGeometry = new THREE.ConeGeometry(3, 10, 16, 1, true);
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(x, height / 2 - 1, z + 5);
    cone.rotation.x = Math.PI;
    this.mission1Group.add(cone);
  }

  /**
   * Main Mission 1 level builder — 4 zones of COD-style combat arena.
   */
  private addMission1Level(
    concreteTexture: THREE.CanvasTexture,
    metalTexture: THREE.CanvasTexture
  ): void {
    // Reset the mission group
    this.scene.add(this.mission1Group);

    // Shared materials for reuse
    const concreteMat = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: 0x888888,
      roughness: 0.8,
      metalness: 0.15,
    });

    const buildingMat = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: 0x7B6B5A,
      roughness: 0.85,
      metalness: 0.1,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      map: metalTexture,
      color: 0x555555,
      roughness: 0.6,
      metalness: 0.5,
    });

    // ──────────────────────────────────────────────────────
    // SPAWN AREA (z: 220 to 130) — Approach to mission
    // ──────────────────────────────────────────────────────
    
    // Sand dunes along the approach
    this.addCover(-10, 200, 'sandDune', { scale: new THREE.Vector3(2, 1, 1.5) });
    this.addCover(12, 190, 'sandDune', { scale: new THREE.Vector3(1.5, 0.8, 1.2) });
    this.addCover(-8, 175, 'sandDune', { scale: new THREE.Vector3(1.8, 1, 1.4) });
    this.addCover(6, 160, 'sandDune', { scale: new THREE.Vector3(2.2, 0.9, 1.6) });
    this.addCover(-15, 145, 'sandDune', { scale: new THREE.Vector3(1.6, 1, 1.3) });
    this.addCover(10, 135, 'sandDune', { scale: new THREE.Vector3(1.4, 0.8, 1.1) });

    // Rocks along the approach
    this.addCover(-5, 210, 'rock', { rockRadius: 0.8 });
    this.addCover(8, 195, 'rock', { rockRadius: 1.0 });
    this.addCover(-12, 180, 'rock', { rockRadius: 0.6 });
    this.addCover(14, 165, 'rock', { rockRadius: 1.2 });
    this.addCover(-3, 150, 'rock', { rockRadius: 0.7 });

    // ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    // ZONE 1 — OUTSKIRTS (z: 120 to 100): Stealth Tutorial
    // ══════════════════════════════════════════════════════════
    // Rich cover options to teach the player stealth approach.
    // Ruined walls, shipping containers, sand dunes, and rocks
    // give multiple approach lanes through this zone.

    // 3 ruined walls — brownish concrete (BoxGeometry 4x3x0.5)
    this.addCover(-8, 116, 'ruinedWall', { rotation: 0.3, concreteTexture });
    this.addCover(7, 110, 'ruinedWall', { rotation: Math.PI / 3, concreteTexture });
    this.addCover(-2, 103, 'ruinedWall', { rotation: -Math.PI / 4, concreteTexture });

    // 2 shipping containers — olive green (BoxGeometry 3x2.5x2.5)
    this.addCover(-13, 113, 'container', { rotation: 0.1 });
    this.addCover(11, 105, 'container', { rotation: Math.PI / 2 });

    // 6 sand dunes — SphereGeometry scaled flat, scattered throughout
    this.addCover(-5, 118, 'sandDune', { scale: new THREE.Vector3(1.6, 1, 1.2) });
    this.addCover(9, 115, 'sandDune', { scale: new THREE.Vector3(1.3, 0.8, 1.0) });
    this.addCover(-15, 108, 'sandDune', { scale: new THREE.Vector3(2.0, 1, 1.5) });
    this.addCover(14, 102, 'sandDune', { scale: new THREE.Vector3(1.8, 0.9, 1.3) });
    this.addCover(0, 107, 'sandDune', { scale: new THREE.Vector3(1.1, 0.7, 1.0) });
    this.addCover(-10, 101, 'sandDune', { scale: new THREE.Vector3(1.5, 0.9, 1.1) });

    // 8 rocks of various sizes — DodecahedronGeometry
    this.addCover(-11, 119, 'rock', { rockRadius: 0.5 });
    this.addCover(4, 117, 'rock', { rockRadius: 0.8 });
    this.addCover(-17, 111, 'rock', { rockRadius: 1.2 });
    this.addCover(13, 113, 'rock', { rockRadius: 0.6 });
    this.addCover(-6, 106, 'rock', { rockRadius: 1.0 });
    this.addCover(16, 108, 'rock', { rockRadius: 0.4 });
    this.addCover(-14, 103, 'rock', { rockRadius: 0.7 });
    this.addCover(2, 101, 'rock', { rockRadius: 0.9 });

    // Ammo pickup — Zone 1 at z=110
    this.addAmmoPickup(-4, 110);

    // ══════════════════════════════════════════════════════════
    // ZONE 2 — INNER PERIMETER (z: 100 to 75): Mixed Combat
    // ══════════════════════════════════════════════════════════
    // Transition zone — buildings with doorways, guard towers,
    // HESCO barriers, tire stacks, and vehicle wrecks create
    // a mix of close-quarters and mid-range engagement spaces.

    // 4 buildings with doorways (6x4x5) — 4 walls with gap for door
    this.addBuilding(-12, 96, 6, 4, 5, concreteTexture, { doorwayWall: 'east' });
    this.addBuilding(10, 93, 6, 4, 5, concreteTexture, { doorwayWall: 'west' });
    this.addBuilding(-8, 83, 6, 4, 5, concreteTexture, { doorwayWall: 'north' });
    this.addBuilding(12, 80, 6, 4, 5, concreteTexture, { doorwayWall: 'south' });

    // 2 guard towers — CylinderGeometry 0.3 radius, 8 height + platform
    this.addGuardTower(-18, 92, 0.3, 8, metalTexture);
    this.addGuardTower(18, 87, 0.3, 8, metalTexture);

    // 15 HESCO barriers — BoxGeometry 1x1x1, waist height
    const hescoPositions = [
      { x: -3, z: 99 },  { x: 4, z: 97 },   { x: -6, z: 96 },
      { x: 5, z: 94 },   { x: 0, z: 91 },    { x: -4, z: 89 },
      { x: 8, z: 90 },   { x: -2, z: 86 },   { x: 7, z: 87 },
      { x: -11, z: 88 }, { x: 3, z: 84 },    { x: -5, z: 81 },
      { x: 6, z: 82 },   { x: 1, z: 79 },    { x: -9, z: 77 },
    ];
    for (const hp of hescoPositions) {
      this.addCover(hp.x, hp.z, 'hesco');
    }

    // 6 tire stacks — CylinderGeometry 0.5 radius
    this.addCover(-2, 98, 'tireStack');
    this.addCover(7, 95, 'tireStack');
    this.addCover(-9, 91, 'tireStack');
    this.addCover(4, 87, 'tireStack');
    this.addCover(-1, 83, 'tireStack');
    this.addCover(10, 80, 'tireStack');

    // 4 concrete walls — BoxGeometry 4x2.5x0.5, forming corridors
    this.addCover(0, 95, 'concreteWall', { rotation: 0 });
    this.addCover(-14, 88, 'concreteWall', { rotation: Math.PI / 2 });
    this.addCover(14, 83, 'concreteWall', { rotation: Math.PI / 2 });
    this.addCover(-6, 76, 'concreteWall', { rotation: 0.4 });

    // 2 vehicle wrecks — BoxGeometry 3x1.5x2, dark grey
    this.addCover(-5, 93, 'vehicleWreck', { rotation: 0.4 });
    this.addCover(9, 85, 'vehicleWreck', { rotation: -0.6 });

    // 4 rocks scattered
    this.addCover(-1, 97, 'rock', { rockRadius: 0.6 });
    this.addCover(15, 98, 'rock', { rockRadius: 1.3 });
    this.addCover(-8, 86, 'rock', { rockRadius: 0.8 });
    this.addCover(3, 78, 'rock', { rockRadius: 1.0 });

    // 3 sand dunes
    this.addCover(-18, 99, 'sandDune', { scale: new THREE.Vector3(1.3, 0.9, 1.1) });
    this.addCover(17, 91, 'sandDune', { scale: new THREE.Vector3(1.6, 1, 1.4) });
    this.addCover(0, 80, 'sandDune', { scale: new THREE.Vector3(1.1, 0.8, 1.2) });

    // Ammo pickup — Zone 2 at z=80
    this.addAmmoPickup(5, 80);

    // ══════════════════════════════════════════════════════════
    // ZONE 3 — COMPOUND (z: 75 to 50): Full Combat
    // ══════════════════════════════════════════════════════════
    // The heart of the compound — two large buildings with
    // doorways on different sides, tire stack cover pockets,
    // corridor walls, and a central road for dramatic firefights.

    // Central road — darker ground strip running through Zone 3
    const roadGeo = new THREE.PlaneGeometry(5, 30);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.9,
      metalness: 0.05,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, 63);
    road.receiveShadow = true;
    this.mission1Group.add(road);

    // 2 large buildings (8x8x5) with doorways on different sides
    // Building 1: west side — doorway faces east (toward road)
    this.addBuilding(-15, 70, 8, 8, 5, concreteTexture, { doorwayWall: 'east' });
    // Internal dividing wall inside building 1
    const divWall1Geo = new THREE.BoxGeometry(0.3, 5, 6);
    const divWall1 = new THREE.Mesh(divWall1Geo, concreteMat);
    divWall1.position.set(-15, 2.5, 71);
    divWall1.castShadow = true;
    divWall1.receiveShadow = true;
    this.mission1Group.add(divWall1);
    this.colliders.push(divWall1);

    // Building 2: east side — doorway faces west (toward road)
    this.addBuilding(13, 68, 8, 8, 5, concreteTexture, { doorwayWall: 'west' });
    // Internal dividing wall inside building 2
    const divWall2Geo = new THREE.BoxGeometry(0.3, 5, 6);
    const divWall2 = new THREE.Mesh(divWall2Geo, concreteMat);
    divWall2.position.set(13, 2.5, 67);
    divWall2.castShadow = true;
    divWall2.receiveShadow = true;
    this.mission1Group.add(divWall2);
    this.colliders.push(divWall2);

    // 8 tire stacks forming cover pockets along the road
    const tirePositions = [
      { x: -4, z: 73 },  { x: 4, z: 71 },  { x: -2, z: 66 },
      { x: 6, z: 67 },   { x: -8, z: 63 },  { x: 5, z: 60 },
      { x: -3, z: 57 },  { x: 3, z: 55 },
    ];
    for (const tp of tirePositions) {
      this.addCover(tp.x, tp.z, 'tireStack');
    }

    // 6 concrete walls forming corridors along the road
    this.addCover(-4, 73, 'concreteWall', { rotation: 0 });
    this.addCover(4, 73, 'concreteWall', { rotation: 0 });
    this.addCover(-4, 66, 'concreteWall', { rotation: 0 });
    this.addCover(4, 66, 'concreteWall', { rotation: 0 });
    this.addCover(-4, 59, 'concreteWall', { rotation: 0 });
    this.addCover(4, 59, 'concreteWall', { rotation: 0 });

    // 4 rocks scattered
    this.addCover(-11, 68, 'rock', { rockRadius: 0.9 });
    this.addCover(9, 74, 'rock', { rockRadius: 0.5 });
    this.addCover(-1, 63, 'rock', { rockRadius: 1.4 });
    this.addCover(7, 57, 'rock', { rockRadius: 0.7 });

    // 3 sand dunes
    this.addCover(-17, 57, 'sandDune', { scale: new THREE.Vector3(1.4, 1, 1.3) });
    this.addCover(15, 59, 'sandDune', { scale: new THREE.Vector3(1.2, 0.9, 1.1) });
    this.addCover(-9, 53, 'sandDune', { scale: new THREE.Vector3(1.0, 0.8, 1.0) });

    // Ammo pickup — Zone 3 at z=60
    this.addAmmoPickup(0, 60);

    // ══════════════════════════════════════════════════════════
    // ZONE 4 — BORDER WALL (z: 50 to 40): Objective
    // ══════════════════════════════════════════════════════════
    // The primary objective zone — a massive border wall with
    // gate opening, tall guard towers, radar dish installation,
    // and protective HESCO/concrete cover for the final push.

    // ── Main border wall (60x7x1.5, concrete) at z=45 ──
    const borderWallGeo = new THREE.BoxGeometry(60, 7, 1.5);
    const borderWallMat = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: 0x696969,
      roughness: 0.7,
      metalness: 0.3,
    });
    const borderWall = new THREE.Mesh(borderWallGeo, borderWallMat);
    const borderTerrainY = this.getTerrainMinAlongLine(-30, 45, 30, 45, 12);
    borderWall.position.set(0, borderTerrainY + 3.5, 45);
    borderWall.castShadow = true;
    borderWall.receiveShadow = true;
    this.mission1Group.add(borderWall);
    // Full visual wall NOT a collider — only the two halves are colliders
    // so the gate opening remains passable.

    // ── Gate opening — 8 units wide in center ──
    // Left half: x from -30 to -4 (width = 26)
    const leftWallGeo = new THREE.BoxGeometry(26, 7, 1.5);
    const leftWall = new THREE.Mesh(leftWallGeo, borderWallMat);
    const leftWallTerrainY = this.getTerrainMinAlongLine(-30, 45, -4, 45, 8);
    leftWall.position.set(-17, leftWallTerrainY + 3.5, 45);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    this.mission1Group.add(leftWall);
    this.colliders.push(leftWall);

    // Right half: x from 4 to 30 (width = 26)
    const rightWallGeo = new THREE.BoxGeometry(26, 7, 1.5);
    const rightWall = new THREE.Mesh(rightWallGeo, borderWallMat);
    const rightWallTerrainY = this.getTerrainMinAlongLine(4, 45, 30, 45, 8);
    rightWall.position.set(17, rightWallTerrainY + 3.5, 45);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    this.mission1Group.add(rightWall);
    this.colliders.push(rightWall);

    // ── 2 gate doors (BoxGeometry 3x6x0.2, metal, slightly ajar) ──
    const gateDoorGeo = new THREE.BoxGeometry(3, 6, 0.2);
    const gateDoorMat = new THREE.MeshStandardMaterial({
      map: metalTexture,
      color: 0x555555,
      roughness: 0.5,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85,
    });
    // Left gate — swung slightly outward (positive Y rotation = open toward player)
    const leftGate = new THREE.Mesh(gateDoorGeo, gateDoorMat);
    const leftGateTerrainY = this.getTerrainMinAlongLine(-5, 45, -2, 45, 4);
    leftGate.position.set(-3.5, leftGateTerrainY + 3.0, 45);
    leftGate.rotation.y = 0.25;
    leftGate.castShadow = true;
    this.mission1Group.add(leftGate);
    this.colliders.push(leftGate);

    // Right gate — swung slightly outward (negative Y rotation)
    const rightGate = new THREE.Mesh(gateDoorGeo, gateDoorMat);
    const rightGateTerrainY = this.getTerrainMinAlongLine(2, 45, 5, 45, 4);
    rightGate.position.set(3.5, rightGateTerrainY + 3.0, 45);
    rightGate.rotation.y = -0.25;
    rightGate.castShadow = true;
    this.mission1Group.add(rightGate);
    this.colliders.push(rightGate);

    // ── Gate frame — top horizontal bar ──
    const gateFrameGeo = new THREE.BoxGeometry(9, 0.3, 0.3);
    const gateFrameMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.5,
      metalness: 0.7,
    });
    const gateFrame = new THREE.Mesh(gateFrameGeo, gateFrameMat);
    gateFrame.position.set(0, borderTerrainY + 6.65, 45);
    gateFrame.castShadow = true;
    gateFrame.receiveShadow = true;
    this.mission1Group.add(gateFrame);

    // ── 2 tall guard towers flanking gate (CylinderGeometry 0.4, height 10) ──
    this.addGuardTower(-9, 45, 0.4, 10, metalTexture, { platformSize: 2.5 });
    this.addGuardTower(9, 45, 0.4, 10, metalTexture, { platformSize: 2.5 });

    // ── Radar dish near gate (CylinderGeometry pole + SphereGeometry dish) ──
    const radarPoleGeo = new THREE.CylinderGeometry(0.1, 0.15, 3, 6);
    const radarPoleMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.5,
      metalness: 0.6,
    });
    const radarPole = new THREE.Mesh(radarPoleGeo, radarPoleMat);
    const radarTerrainY = this.getTerrainHeight(12, 46);
    radarPole.position.set(12, radarTerrainY + 1.5, 46);
    radarPole.castShadow = true;
    radarPole.receiveShadow = true;
    this.mission1Group.add(radarPole);

    // Dish — SphereGeometry 0.8 radius, tilted upward
    const dishGeo = new THREE.SphereGeometry(0.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dishMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.4,
      metalness: 0.7,
      side: THREE.DoubleSide,
    });
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.set(12, radarTerrainY + 3.2, 46);
    dish.rotation.x = Math.PI / 4;
    dish.castShadow = true;
    dish.receiveShadow = true;
    this.mission1Group.add(dish);

    // ── HESCO barriers around radar installation ──
    this.addCover(9, 47, 'hesco');
    this.addCover(15, 47, 'hesco');
    this.addCover(9, 44, 'hesco');
    this.addCover(15, 44, 'hesco');
    this.addCover(12, 48, 'hesco');

    // ── Concrete walls near radar for additional cover ──
    this.addCover(10, 43, 'concreteWall', { rotation: Math.PI / 2 });
    this.addCover(14, 49, 'concreteWall', { rotation: Math.PI / 2 });

    // ── Searchlight spotlights on guard towers ──
    this.addSpotlightTower(-9, 45, 10, 0.15, metalTexture);
    this.addSpotlightTower(9, 45, 10, 0.15, metalTexture);

    // ── Additional cover near gate for final approach ──
    this.addCover(-6, 50, 'hesco');
    this.addCover(6, 50, 'hesco');
    this.addCover(-12, 49, 'concreteWall', { rotation: Math.PI / 2 });
    this.addCover(12, 49, 'concreteWall', { rotation: Math.PI / 2 });
    this.addCover(-4, 48, 'tireStack');
    this.addCover(4, 48, 'tireStack');

    // ── Dirt patch near the border wall (darker ground) ──
    const dirtGeo = new THREE.PlaneGeometry(60, 15);
    const dirtMat = new THREE.MeshStandardMaterial({
      color: 0x6B4226,
      roughness: 0.95,
      metalness: 0.0,
    });
    const dirtPatch = new THREE.Mesh(dirtGeo, dirtMat);
    dirtPatch.rotation.x = -Math.PI / 2;
    dirtPatch.position.set(0, 0.015, 48);
    dirtPatch.receiveShadow = true;
    this.mission1Group.add(dirtPatch);

    // ══════════════════════════════════════════════════════════
    // SPAWN ENEMIES
    // ══════════════════════════════════════════════════════════
    this.enemyManager.spawnEnemies(this.scene);

    // ──────────────────────────────────────────────────────
    // WORLD BOUNDARIES — Natural barriers at play area edges
    // ──────────────────────────────────────────────────────
    this.addWorldBoundaries();
  }

  // ============================================================
  // WORLD BOUNDARIES — Natural environmental barriers
  // ============================================================

  /**
   * Creates a dead tree at the given position.
   * Trunk is a tall CylinderGeometry; 2-4 branch stubs stick out at angles.
   * The trunk mesh is added as a collider; branches are visual only.
   */
  private addDeadTree(x: number, z: number, height: number): void {
    const trunkColor = 0x3D2B1F;
    const trunkMat = new THREE.MeshStandardMaterial({
      color: trunkColor,
      roughness: 0.9,
      metalness: 0.05,
    });

    // Main trunk — wider at base, thinner at top
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.25, height, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, height / 2, z);
    trunk.rotation.y = Math.random() * Math.PI;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    this.mission1Group.add(trunk);
    this.colliders.push(trunk);

    // Branch stubs — small cylinders at random angles
    const branchCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < branchCount; i++) {
      const branchLength = 0.8 + Math.random() * 1.8;
      const branchGeo = new THREE.CylinderGeometry(0.03, 0.08, branchLength, 4);
      const branch = new THREE.Mesh(branchGeo, trunkMat.clone());
      const yPos = height * (0.35 + Math.random() * 0.55);
      const angle = Math.random() * Math.PI * 2;
      branch.position.set(
        x + Math.cos(angle) * 0.4,
        yPos,
        z + Math.sin(angle) * 0.4,
      );
      branch.rotation.z = (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.8);
      branch.rotation.y = angle;
      branch.castShadow = true;
      branch.receiveShadow = true;
      this.mission1Group.add(branch);
    }
  }

  /**
   * Creates a chain of natural barrier objects along one side of the map.
   * Tall rock formations, dead trees, and cliff blocks form a
   * mountain/rock wall that prevents the player from strafing out.
   *
   * @param x       - The X coordinate of the boundary line (-50 or 50)
   * @param zStart  - Start of the boundary span (40)
   * @param zEnd    - End of the boundary span (200)
   */
  private addSideBoundary(x: number, zStart: number, zEnd: number): void {
    // --- Tall rock formations ---
    for (let z = zStart; z <= zEnd; z += 5 + Math.random() * 5) {
      const radius = 1.5 + Math.random() * 2.0;
      const stretchY = 1.2 + Math.random() * 1.0; // taller than wide
      const rockGeo = new THREE.DodecahedronGeometry(radius, 0);
      const rockMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.30 + Math.random() * 0.12, 0.24 + Math.random() * 0.1, 0.18 + Math.random() * 0.08),
        roughness: 0.92,
        metalness: 0.08,
      });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(
        x + (Math.random() - 0.5) * 5,
        radius * stretchY * 0.5,
        z + (Math.random() - 0.5) * 3,
      );
      rock.scale.set(0.8, stretchY, 0.8);
      rock.rotation.set(
        (Math.random() - 0.5) * 0.2,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.15,
      );
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.mission1Group.add(rock);
      this.colliders.push(rock);
    }

    // --- Dead trees ---
    for (let z = zStart + 8; z <= zEnd - 8; z += 14 + Math.random() * 12) {
      this.addDeadTree(x + (Math.random() - 0.5) * 7, z, 3 + Math.random() * 3);
    }

    // --- Cliff blocks (large boxes) ---
    for (let z = zStart + 2; z <= zEnd - 2; z += 10 + Math.random() * 8) {
      const w = 2 + Math.random() * 3;
      const h = 2.5 + Math.random() * 4;
      const d = 2 + Math.random() * 3;
      const cliffGeo = new THREE.BoxGeometry(w, h, d);
      const cliffMat = new THREE.MeshStandardMaterial({
        color: 0x5B4B3F,
        roughness: 0.9,
        metalness: 0.05,
      });
      const cliff = new THREE.Mesh(cliffGeo, cliffMat);
      cliff.position.set(
        x + (Math.random() - 0.5) * 4,
        h / 2,
        z + (Math.random() - 0.5) * 3,
      );
      cliff.rotation.y = Math.random() * 0.3;
      cliff.castShadow = true;
      cliff.receiveShadow = true;
      this.mission1Group.add(cliff);
      this.colliders.push(cliff);
    }
  }

  /**
   * Creates all four world boundaries using natural environmental
   * objects (rocks, fallen trees, rubble, bushes, cliffs) so the
   * player cannot walk past the edges of the linear play area.
   *
   * Boundaries:
   *   Z-axis: z = 40  (forward, destroyed road block)
   *            z = 200 (backward, natural terrain end)
   *   X-axis: x = -50  (left cliff wall)
   *            x = 50   (right cliff wall)
   */
  private addWorldBoundaries(): void {
    // ──────────────────────────────────────────────────────────
    // FORWARD BOUNDARY (z = 40) — Destroyed road block
    // Dense rocks, fallen trees, rubble — looks like a bombed-out barrier
    // ──────────────────────────────────────────────────────────
    const forwardZ = 40;

    // Dense rocks spanning the full width (x = -48 to 48)
    for (let x = -48; x <= 48; x += 2.2 + Math.random() * 2.0) {
      const radius = 1.0 + Math.random() * 1.5;
      const rockGeo = new THREE.DodecahedronGeometry(radius, 0);
      const rockMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.28 + Math.random() * 0.12, 0.23 + Math.random() * 0.1, 0.18 + Math.random() * 0.06),
        roughness: 0.92,
        metalness: 0.08,
      });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(
        x + (Math.random() - 0.5) * 3,
        radius * 0.55,
        forwardZ + (Math.random() - 0.5) * 3,
      );
      rock.rotation.set(
        (Math.random() - 0.5) * 0.4,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.3,
      );
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.mission1Group.add(rock);
      this.colliders.push(rock);
    }

    // Fallen tree trunks (horizontal cylinders)
    for (let x = -40; x <= 40; x += 9 + Math.random() * 7) {
      const length = 5 + Math.random() * 5;
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.35, length, 6);
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x4A3728,
        roughness: 0.92,
        metalness: 0.05,
      });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(
        x + (Math.random() - 0.5) * 2,
        0.35,
        forwardZ + (Math.random() - 0.5) * 2,
      );
      // Lay on its side with slight random tilt
      trunk.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      trunk.rotation.y = Math.random() * 0.3;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      this.mission1Group.add(trunk);
      this.colliders.push(trunk);
    }

    // Rubble debris (small scattered boxes)
    for (let x = -48; x <= 48; x += 1.8 + Math.random() * 2.0) {
      const w = 0.3 + Math.random() * 0.7;
      const h = 0.2 + Math.random() * 0.5;
      const d = 0.3 + Math.random() * 0.7;
      const rubbleGeo = new THREE.BoxGeometry(w, h, d);
      const rubbleMat = new THREE.MeshStandardMaterial({
        color: 0x7B6B5A,
        roughness: 0.88,
        metalness: 0.08,
      });
      const rubble = new THREE.Mesh(rubbleGeo, rubbleMat);
      rubble.position.set(
        x + (Math.random() - 0.5) * 2,
        h / 2,
        forwardZ + (Math.random() - 0.5) * 4,
      );
      rubble.rotation.y = Math.random() * Math.PI;
      rubble.castShadow = true;
      rubble.receiveShadow = true;
      this.mission1Group.add(rubble);
      this.colliders.push(rubble);
    }

    // Broken/leaning dead trees at the road block
    for (let x = -38; x <= 38; x += 15 + Math.random() * 10) {
      const h = 2.5 + Math.random() * 2.5;
      this.addDeadTree(x + (Math.random() - 0.5) * 4, forwardZ + (Math.random() - 0.5) * 2, h);
    }

    // ──────────────────────────────────────────────────────────
    // BACKWARD BOUNDARY (z = 200) — Natural terrain end
    // Rocks and thorny bushes — the wilderness runs out here
    // ──────────────────────────────────────────────────────────
    const backwardZ = 200;

    // Rocks spanning the full width
    for (let x = -48; x <= 48; x += 2.8 + Math.random() * 2.5) {
      const radius = 0.6 + Math.random() * 1.0;
      const rockGeo = new THREE.DodecahedronGeometry(radius, 0);
      const rockMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.34 + Math.random() * 0.1, 0.28 + Math.random() * 0.08, 0.22 + Math.random() * 0.06),
        roughness: 0.92,
        metalness: 0.08,
      });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(
        x + (Math.random() - 0.5) * 2,
        radius * 0.5,
        backwardZ + (Math.random() - 0.5) * 3,
      );
      rock.rotation.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.3,
      );
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.mission1Group.add(rock);
      this.colliders.push(rock);
    }

    // Thorny bushes (low-poly icosahedrons, dark green)
    for (let x = -46; x <= 46; x += 3.5 + Math.random() * 3.5) {
      const radius = 0.5 + Math.random() * 0.65;
      const bushGeo = new THREE.IcosahedronGeometry(radius, 0);
      const bushMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.12 + Math.random() * 0.1, 0.26 + Math.random() * 0.1, 0.06 + Math.random() * 0.05),
        roughness: 0.92,
        metalness: 0.0,
      });
      const bush = new THREE.Mesh(bushGeo, bushMat);
      bush.position.set(
        x + (Math.random() - 0.5) * 3,
        radius * 0.45,
        backwardZ + (Math.random() - 0.5) * 2,
      );
      bush.scale.set(1, 0.65, 1);
      bush.rotation.y = Math.random() * Math.PI;
      bush.castShadow = true;
      bush.receiveShadow = true;
      this.mission1Group.add(bush);
      this.colliders.push(bush);
    }

    // Standing dead trees at the terrain edge
    for (let x = -42; x <= 42; x += 12 + Math.random() * 10) {
      this.addDeadTree(x + (Math.random() - 0.5) * 5, backwardZ + (Math.random() - 0.5) * 2, 2.5 + Math.random() * 2.5);
    }

    // ──────────────────────────────────────────────────────────
    // SIDE BOUNDARIES (x = -50 and x = 50) — Mountain/rock walls
    // Tall rock formations, dead trees, and cliff blocks
    // ──────────────────────────────────────────────────────────
    this.addSideBoundary(-50, 40, 200);
    this.addSideBoundary(50, 40, 200);
  }

  /**
   * Removes all Mission 1 level objects from the scene and clears colliders.
   * Used for clean restart/reload.
   */
  public removeMission1Level(): void {
    // Dispose all geometries and materials in the mission group
    this.mission1Group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    // Remove the group from the scene
    this.scene.remove(this.mission1Group);

    // Clear colliders array (remove references that belonged to mission objects)
    this.colliders = [];

    // Clean up ammo pickups
    for (const pickup of this.ammoPickups) {
      this.scene.remove(pickup);
      pickup.geometry.dispose();
      (pickup.material as THREE.Material).dispose();
    }
    for (const light of this.ammoPickupLights) {
      this.scene.remove(light);
    }
    this.ammoPickups = [];
    this.ammoPickupLights = [];

    // Reset the group for next use
    this.mission1Group = new THREE.Group();
  }

  // ============================================================
  // MISSION 2 LEVEL — IRON RAIN: Urban Warfare
  // ============================================================

  /**
   * Helper: add a building to mission2Group with 4 walls and flat roof.
   * Alley-style buildings — narrower, taller than Mission 1 compounds.
   */
  private addM2Building(
    x: number, z: number,
    width: number, depth: number, height: number,
    concreteTexture: THREE.CanvasTexture,
    options?: { doorwayWall?: 'north' | 'south' | 'east' | 'west'; color?: number }
  ): void {
    const buildingColor = options?.color ?? 0x6B5D4F;
    const material = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: buildingColor,
      roughness: 0.85,
      metalness: 0.1,
    });

    const wallThickness = 0.4;
    const halfW = width / 2;
    const halfD = depth / 2;

    const makeWall = (wW: number, dD: number, px: number, pz: number, ry: number) => {
      const geo = new THREE.BoxGeometry(wW, height, wallThickness);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(px, height / 2, pz);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.mission2Group.add(mesh);
      this.colliders.push(mesh);
    };

    // North wall
    if (options?.doorwayWall !== 'north') {
      makeWall(width, wallThickness, x, z + halfD, 0);
    } else {
      const sideW = (width - 2.5) / 2;
      if (sideW > 0.1) {
        makeWall(sideW, wallThickness, x - halfW + sideW / 2, z + halfD, 0);
        makeWall(sideW, wallThickness, x + halfW - sideW / 2, z + halfD, 0);
      }
    }

    // South wall
    if (options?.doorwayWall !== 'south') {
      makeWall(width, wallThickness, x, z - halfD, 0);
    } else {
      const sideW = (width - 2.5) / 2;
      if (sideW > 0.1) {
        makeWall(sideW, wallThickness, x - halfW + sideW / 2, z - halfD, 0);
        makeWall(sideW, wallThickness, x + halfW - sideW / 2, z - halfD, 0);
      }
    }

    // East wall
    if (options?.doorwayWall !== 'east') {
      makeWall(depth, wallThickness, x + halfW, z, Math.PI / 2);
    } else {
      const sideD = (depth - 2.5) / 2;
      if (sideD > 0.1) {
        makeWall(sideD, wallThickness, x + halfW, z - halfD + sideD / 2, Math.PI / 2);
        makeWall(sideD, wallThickness, x + halfW, z + halfD - sideD / 2, Math.PI / 2);
      }
    }

    // West wall
    if (options?.doorwayWall !== 'west') {
      makeWall(depth, wallThickness, x - halfW, z, Math.PI / 2);
    } else {
      const sideD = (depth - 2.5) / 2;
      if (sideD > 0.1) {
        makeWall(sideD, wallThickness, x - halfW, z - halfD + sideD / 2, Math.PI / 2);
        makeWall(sideD, wallThickness, x - halfW, z + halfD - sideD / 2, Math.PI / 2);
      }
    }

    // Flat roof
    const roofGeo = new THREE.BoxGeometry(width + 0.3, 0.3, depth + 0.3);
    const roofMat = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: buildingColor,
      roughness: 0.9,
      metalness: 0.1,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(x, height + 0.15, z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.mission2Group.add(roof);
    // Roof is walkable — NOT a collider for player, but enemies can be on it
  }

  /**
   * Helper: add a cover object to mission2Group.
   */
  private addM2Cover(
    x: number, z: number,
    type: string,
    options?: { rotation?: number; scale?: THREE.Vector3; color?: number }
  ): void {
    const rotation = options?.rotation ?? 0;
    let mesh: THREE.Mesh;

    switch (type) {
      case 'marketStall': {
        // Wooden market stall: 2.5 x 2 x 2 box (goods/crates)
        const geo = new THREE.BoxGeometry(2.5, 2, 2);
        const mat = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x8B6914,
          roughness: 0.85,
          metalness: 0.1,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      case 'crate': {
        // Supply crate
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x6B4226,
          roughness: 0.9,
          metalness: 0.05,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      case 'concreteBarrier': {
        // Jersey barrier / concrete wall segment
        const geo = new THREE.BoxGeometry(4, 2.5, 0.5);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x888888,
          roughness: 0.8,
          metalness: 0.15,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      case 'tireStack': {
        const geo = new THREE.CylinderGeometry(0.5, 0.55, 1, 12);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a,
          roughness: 0.85,
          metalness: 0.1,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      case 'trashDumpster': {
        const geo = new THREE.BoxGeometry(1.5, 1.2, 2);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x3B5323,
          roughness: 0.75,
          metalness: 0.3,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      case 'vehicleWreck': {
        const geo = new THREE.BoxGeometry(3, 1.5, 2);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x444444,
          roughness: 0.8,
          metalness: 0.4,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        mesh.rotation.z = 0.05;
        break;
      }
      case 'fountain': {
        // Central fountain — circular base with water spout
        const baseGeo = new THREE.CylinderGeometry(3, 3.5, 1.2, 16);
        const baseMat = new THREE.MeshStandardMaterial({
          color: 0x7B7B7B,
          roughness: 0.6,
          metalness: 0.3,
        });
        mesh = new THREE.Mesh(baseGeo, baseMat);
        // Add water inside
        const waterGeo = new THREE.CylinderGeometry(2.8, 2.8, 0.3, 16);
        const waterMat = new THREE.MeshStandardMaterial({
          color: 0x2266AA,
          roughness: 0.2,
          metalness: 0.5,
          transparent: true,
          opacity: 0.7,
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.y = 0.5;
        mesh.add(water);
        // Central spout pillar
        const spoutGeo = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
        const spoutMat = new THREE.MeshStandardMaterial({
          color: 0x888888,
          roughness: 0.4,
          metalness: 0.6,
        });
        const spout = new THREE.Mesh(spoutGeo, spoutMat);
        spout.position.y = 1.5;
        mesh.add(spout);
        break;
      }
      case 'stairway': {
        // External stairway to rooftop — stepped boxes
        const stepCount = 8;
        const stepW = 2;
        const stepH = 0.35;
        const stepD = 0.6;
        const stairMat = new THREE.MeshStandardMaterial({
          color: 0x777777,
          roughness: 0.8,
          metalness: 0.2,
        });

        // Calculate rotation offset
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);

        for (let i = 0; i < stepCount; i++) {
          const stepGeo = new THREE.BoxGeometry(stepW, stepH, stepD);
          const step = new THREE.Mesh(stepGeo, stairMat);

          // Calculate local position then rotate
          const localZ = -i * stepD;
          const worldX = x + localZ * sinR;
          const worldZ = z + localZ * cosR;

          step.position.set(worldX, i * stepH + stepH / 2, worldZ);
          step.castShadow = true;
          step.receiveShadow = true;
          this.mission2Group.add(step);
          this.colliders.push(step);
        }
        return; // Already added — skip generic mesh add
      }
      default: {
        console.warn(`[addM2Cover] Unknown cover type: ${type}`);
        return;
      }
    }

    // Position based on geometry height — get bounding box for accurate centering
    const bbox = new THREE.Box3().setFromObject(mesh);
    const height = bbox.max.y - bbox.min.y;
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mission2Group.add(mesh);
    this.colliders.push(mesh);
  }

  /**
   * Helper: add a server rack (objective object) to mission2Group.
   * Tall glowing server rack with blinking lights.
   */
  private addServerRack(x: number, y: number, z: number): void {
    // Main rack body
    const rackGeo = new THREE.BoxGeometry(1.2, 2.5, 0.8);
    const rackMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.5,
      metalness: 0.6,
    });
    const rack = new THREE.Mesh(rackGeo, rackMat);
    rack.position.set(x, y + 1.25, z);
    rack.castShadow = true;
    rack.receiveShadow = true;
    this.mission2Group.add(rack);

    // Blinking status lights (small emissive boxes on the front)
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    for (let i = 0; i < 4; i++) {
      const lightGeo = new THREE.BoxGeometry(0.08, 0.08, 0.02);
      const light = new THREE.Mesh(lightGeo, lightMat.clone());
      light.position.set(x - 0.3 + i * 0.2, y + 0.5 + i * 0.5, z + 0.41);
      this.mission2Group.add(light);
    }

    // Glow light
    const glow = new THREE.PointLight(0x00ff44, 1.5, 6);
    glow.position.set(x, y + 1.5, z);
    this.mission2Group.add(glow);
  }

  /**
   * Main Mission 2 level builder — Urban Warfare arena.
   * Layout: Streets running north-south, buildings on both sides,
   * alleyways for flanking, market stalls for cover, rooftops,
   * central plaza with fountain, and a server room objective.
   */
  private addMission2Level(
    concreteTexture: THREE.CanvasTexture,
    metalTexture: THREE.CanvasTexture
  ): void {
    this.scene.add(this.mission2Group);

    // ══════════════════════════════════════════════════════════
    // ZONE 1 — EASTERN DISTRICT ALLEYS (z: 170 to 140)
    // Stealth introduction — narrow passages, limited sight lines
    // ══════════════════════════════════════════════════════════

    // ── Tall buildings flanking the entry street ──
    // West side buildings
    this.addM2Building(-15, 165, 5, 6, 7, concreteTexture, { doorwayWall: 'east' });
    this.addM2Building(-15, 155, 5, 6, 6, concreteTexture, { doorwayWall: 'east' });

    // East side buildings
    this.addM2Building(15, 165, 5, 6, 7, concreteTexture, { doorwayWall: 'west' });
    this.addM2Building(15, 155, 5, 6, 6, concreteTexture, { doorwayWall: 'west' });

    // ── Narrow alley walls (create tight passages) ──
    // Left alley wall
    this.addM2Cover(-4, 162, 'concreteBarrier', { rotation: 0 });
    this.addM2Cover(-4, 156, 'concreteBarrier', { rotation: 0 });

    // Right alley wall
    this.addM2Cover(4, 162, 'concreteBarrier', { rotation: 0 });
    this.addM2Cover(4, 156, 'concreteBarrier', { rotation: 0 });

    // ── Cover in alleys ──
    this.addM2Cover(-8, 160, 'crate', { rotation: 0.3 });
    this.addM2Cover(8, 158, 'crate', { rotation: -0.2 });
    this.addM2Cover(-2, 150, 'trashDumpster', { rotation: 0.1 });
    this.addM2Cover(6, 148, 'trashDumpster', { rotation: -0.4 });
    this.addM2Cover(-10, 152, 'tireStack');
    this.addM2Cover(10, 154, 'tireStack');

    // ── Ammo pickup — Alley entry ──
    this.addAmmoPickup(-6, 165);

    // ══════════════════════════════════════════════════════════
    // ZONE 2 — MARKET AREA (z: 140 to 110)
    // Open plaza with market stalls, wider sight lines, combat ramp
    // ══════════════════════════════════════════════════════════

    // ── Market stall rows (3 rows of 2 stalls each) ──
    // Row 1 — western market
    this.addM2Cover(-12, 135, 'marketStall', { rotation: 0, color: 0x8B6914 });
    this.addM2Cover(-12, 130, 'marketStall', { rotation: 0, color: 0xA0522D });

    // Row 2 — central market
    this.addM2Cover(-2, 133, 'marketStall', { rotation: Math.PI / 2, color: 0x6B4226 });
    this.addM2Cover(2, 127, 'marketStall', { rotation: Math.PI / 2, color: 0x8B4513 });

    // Row 3 — eastern market
    this.addM2Cover(12, 135, 'marketStall', { rotation: 0, color: 0x8B6914 });
    this.addM2Cover(12, 130, 'marketStall', { rotation: 0, color: 0xA0522D });

    // ── Additional market cover ──
    this.addM2Cover(-8, 128, 'crate', { rotation: 0.4 });
    this.addM2Cover(8, 125, 'crate', { rotation: -0.3 });
    this.addM2Cover(-5, 122, 'trashDumpster');
    this.addM2Cover(5, 118, 'trashDumpster', { rotation: Math.PI / 3 });

    // ── Vehicle wreck in market (blocking road) ──
    this.addM2Cover(0, 120, 'vehicleWreck', { rotation: 0.3 });

    // ── Flanking walls on market edges ──
    this.addM2Cover(-18, 130, 'concreteBarrier', { rotation: Math.PI / 2 });
    this.addM2Cover(18, 130, 'concreteBarrier', { rotation: Math.PI / 2 });
    this.addM2Cover(-18, 118, 'concreteBarrier', { rotation: Math.PI / 2 });
    this.addM2Cover(18, 118, 'concreteBarrier', { rotation: Math.PI / 2 });

    // ── Tire stacks scattered ──
    this.addM2Cover(-6, 138, 'tireStack');
    this.addM2Cover(7, 136, 'tireStack');
    this.addM2Cover(-3, 124, 'tireStack');
    this.addM2Cover(9, 115, 'tireStack');

    // ── Buildings overlooking market (elevated positions) ──
    this.addM2Building(-18, 125, 6, 5, 6, concreteTexture, { doorwayWall: 'east' });
    this.addM2Building(18, 125, 6, 5, 6, concreteTexture, { doorwayWall: 'west' });

    // ── Ammo pickup — Market center ──
    this.addAmmoPickup(0, 130);

    // ══════════════════════════════════════════════════════════
    // ZONE 3 — ROOFTOP COMPLEX (z: 110 to 85)
    // Vertical combat — stairways, elevated positions, scanning elites
    // ══════════════════════════════════════════════════════════

    // ── Tall buildings with accessible rooftops ──
    // West tower — stairway on south side
    this.addM2Building(-14, 105, 7, 7, 9, concreteTexture, { doorwayWall: 'south' });
    this.addM2Cover(-14, 108, 'stairway', { rotation: 0 }); // External stairs

    // East tower — stairway on north side
    this.addM2Building(14, 100, 7, 7, 9, concreteTexture, { doorwayWall: 'north' });
    this.addM2Cover(14, 97, 'stairway', { rotation: Math.PI }); // Stairs face north

    // Center building (server building) — tall with doorway
    this.addM2Building(0, 95, 6, 8, 10, concreteTexture, { doorwayWall: 'south' });
    // Server rack inside (on the rooftop level, y=10)
    this.addServerRack(0, 10, 95);

    // ── Corridor walls between buildings ──
    this.addM2Cover(-7, 102, 'concreteBarrier', { rotation: Math.PI / 2 });
    this.addM2Cover(7, 102, 'concreteBarrier', { rotation: Math.PI / 2 });
    this.addM2Cover(-7, 92, 'concreteBarrier', { rotation: Math.PI / 2 });
    this.addM2Cover(7, 92, 'concreteBarrier', { rotation: Math.PI / 2 });

    // ── Cover at ground level between buildings ──
    this.addM2Cover(-3, 108, 'crate');
    this.addM2Cover(3, 106, 'crate', { rotation: 0.5 });
    this.addM2Cover(-10, 100, 'trashDumpster', { rotation: Math.PI / 4 });
    this.addM2Cover(10, 98, 'trashDumpster');
    this.addM2Cover(0, 100, 'tireStack');
    this.addM2Cover(-5, 96, 'tireStack');
    this.addM2Cover(5, 94, 'tireStack');

    // ── Vehicle wreck in the street ──
    this.addM2Cover(-2, 104, 'vehicleWreck', { rotation: -0.2 });

    // ── Ammo pickup — Rooftop base ──
    this.addAmmoPickup(-12, 105);

    // ══════════════════════════════════════════════════════════
    // ZONE 4 — WEAPONS CACHE / CENTRAL PLAZA (z: 85 to 50)
    // Defense holdout — central fountain, server objective, hardest enemies
    // ══════════════════════════════════════════════════════════

    // ── Central fountain (objective landmark) ──
    this.addM2Cover(0, 72, 'fountain');

    // ── Buildings surrounding the plaza ──
    // NW building
    this.addM2Building(-16, 80, 6, 5, 7, concreteTexture, { doorwayWall: 'east' });
    // NE building
    this.addM2Building(16, 80, 6, 5, 7, concreteTexture, { doorwayWall: 'west' });
    // SW building
    this.addM2Building(-16, 60, 6, 5, 7, concreteTexture, { doorwayWall: 'east' });
    // SE building
    this.addM2Building(16, 60, 6, 5, 7, concreteTexture, { doorwayWall: 'west' });
    // South building (blocks southern exit)
    this.addM2Building(0, 52, 10, 5, 8, concreteTexture, { doorwayWall: 'north' });

    // ── Plaza cover (for wave defense) ──
    this.addM2Cover(-8, 75, 'concreteBarrier', { rotation: 0 });
    this.addM2Cover(8, 75, 'concreteBarrier', { rotation: 0 });
    this.addM2Cover(-8, 68, 'concreteBarrier', { rotation: 0 });
    this.addM2Cover(8, 68, 'concreteBarrier', { rotation: 0 });
    this.addM2Cover(-4, 65, 'concreteBarrier', { rotation: Math.PI / 2 });
    this.addM2Cover(4, 65, 'concreteBarrier', { rotation: Math.PI / 2 });

    // ── Crate clusters ──
    this.addM2Cover(-10, 70, 'crate', { rotation: 0.3 });
    this.addM2Cover(10, 70, 'crate', { rotation: -0.2 });
    this.addM2Cover(-6, 58, 'crate', { rotation: 0.7 });
    this.addM2Cover(6, 58, 'crate', { rotation: -0.5 });

    // ── Tire stacks ──
    this.addM2Cover(-3, 78, 'tireStack');
    this.addM2Cover(3, 76, 'tireStack');
    this.addM2Cover(-5, 62, 'tireStack');
    this.addM2Cover(5, 60, 'tireStack');

    // ── Vehicle wreck (blocks alley escape) ──
    this.addM2Cover(0, 58, 'vehicleWreck', { rotation: Math.PI / 2 });

    // ── Ammo pickups — Plaza edges ──
    this.addAmmoPickup(-14, 72);
    this.addAmmoPickup(14, 68);

    // ── Spawn area building (extraction landmark) ──
    this.addM2Building(0, 185, 8, 4, 5, concreteTexture, { doorwayWall: 'south' });

    // ══════════════════════════════════════════════════════════
    // SPAWN ENEMIES
    // ══════════════════════════════════════════════════════════
    this.enemyManager.spawnMission2Enemies(this.scene);

    // ──────────────────────────────────────────────────────
    // WORLD BOUNDARIES — Urban district edges
    // ──────────────────────────────────────────────────────
    this.addM2WorldBoundaries();
  }

  /**
   * Creates urban-style world boundaries for Mission 2.
   * Tall buildings and rubble block the edges of the play area.
   */
  private addM2WorldBoundaries(): void {
    const boundaryMat = new THREE.MeshStandardMaterial({
      color: 0x5B4B3F,
      roughness: 0.9,
      metalness: 0.05,
    });

    // ── Forward boundary (z = 45) — rubble wall ──
    for (let x = -25; x <= 25; x += 3) {
      const h = 3 + Math.random() * 4;
      const w = 2 + Math.random() * 2;
      const geo = new THREE.BoxGeometry(w, h, 2);
      const wall = new THREE.Mesh(geo, boundaryMat);
      wall.position.set(x + (Math.random() - 0.5) * 2, h / 2, 45 + (Math.random() - 0.5) * 2);
      wall.rotation.y = Math.random() * 0.3;
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.mission2Group.add(wall);
      this.colliders.push(wall);
    }

    // ── Backward boundary (z = 195) — buildings blocking retreat ──
    for (let x = -25; x <= 25; x += 6) {
      const h = 4 + Math.random() * 3;
      const geo = new THREE.BoxGeometry(5, h, 3);
      const wall = new THREE.Mesh(geo, boundaryMat);
      wall.position.set(x, h / 2, 195);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.mission2Group.add(wall);
      this.colliders.push(wall);
    }

    // ── Side boundaries (x = -28 and x = 28) ──
    for (const xSide of [-28, 28]) {
      for (let z = 50; z <= 195; z += 5 + Math.random() * 4) {
        const h = 3 + Math.random() * 5;
        const geo = new THREE.BoxGeometry(3, h, 3 + Math.random() * 2);
        const wall = new THREE.Mesh(geo, boundaryMat);
        wall.position.set(xSide + (Math.random() - 0.5) * 2, h / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        this.mission2Group.add(wall);
        this.colliders.push(wall);
      }
    }
  }

  /**
   * Removes all Mission 2 level objects from the scene and clears colliders.
   */
  public removeMission2Level(): void {
    this.mission2Group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    this.scene.remove(this.mission2Group);

    this.colliders = [];

    for (const pickup of this.ammoPickups) {
      this.scene.remove(pickup);
      pickup.geometry.dispose();
      (pickup.material as THREE.Material).dispose();
    }
    for (const light of this.ammoPickupLights) {
      this.scene.remove(light);
    }
    this.ammoPickups = [];
    this.ammoPickupLights = [];

    this.mission2Group = new THREE.Group();
  }

  // ============================================================
  // MISSION 3 LEVEL — THE NEST: Underground Bunker Complex
  // ============================================================

  /**
   * Helper: add a building to mission3Group with 4 walls and flat roof.
   * Bunker-style buildings — reinforced concrete, dark grey.
   */
  private addM3Building(
    x: number, z: number,
    width: number, depth: number, height: number,
    concreteTexture: THREE.CanvasTexture,
    options?: { doorwayWall?: 'north' | 'south' | 'east' | 'west'; color?: number }
  ): void {
    const buildingColor = options?.color ?? 0x5A5A5A; // Darker concrete for bunker
    const material = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: buildingColor,
      roughness: 0.7,
      metalness: 0.2,
    });

    const wallThickness = 0.5; // Thicker walls for bunker feel
    const halfW = width / 2;
    const halfD = depth / 2;

    const makeWall = (wW: number, dD: number, px: number, pz: number, ry: number) => {
      const geo = new THREE.BoxGeometry(wW, height, wallThickness);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(px, height / 2, pz);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.mission3Group.add(mesh);
      this.colliders.push(mesh);
    };

    // North wall
    if (options?.doorwayWall !== 'north') {
      makeWall(width, wallThickness, x, z + halfD, 0);
    } else {
      const sideW = (width - 2.5) / 2;
      if (sideW > 0.1) {
        makeWall(sideW, wallThickness, x - halfW + sideW / 2, z + halfD, 0);
        makeWall(sideW, wallThickness, x + halfW - sideW / 2, z + halfD, 0);
      }
    }

    // South wall
    if (options?.doorwayWall !== 'south') {
      makeWall(width, wallThickness, x, z - halfD, 0);
    } else {
      const sideW = (width - 2.5) / 2;
      if (sideW > 0.1) {
        makeWall(sideW, wallThickness, x - halfW + sideW / 2, z - halfD, 0);
        makeWall(sideW, wallThickness, x + halfW - sideW / 2, z - halfD, 0);
      }
    }

    // East wall
    if (options?.doorwayWall !== 'east') {
      makeWall(depth, wallThickness, x + halfW, z, Math.PI / 2);
    } else {
      const sideD = (depth - 2.5) / 2;
      if (sideD > 0.1) {
        makeWall(sideD, wallThickness, x + halfW, z - halfD + sideD / 2, Math.PI / 2);
        makeWall(sideD, wallThickness, x + halfW, z + halfD - sideD / 2, Math.PI / 2);
      }
    }

    // West wall
    if (options?.doorwayWall !== 'west') {
      makeWall(depth, wallThickness, x - halfW, z, Math.PI / 2);
    } else {
      const sideD = (depth - 2.5) / 2;
      if (sideD > 0.1) {
        makeWall(sideD, wallThickness, x - halfW, z - halfD + sideD / 2, Math.PI / 2);
        makeWall(sideD, wallThickness, x - halfW, z + halfD - sideD / 2, Math.PI / 2);
      }
    }

    // Flat roof (reinforced concrete ceiling)
    const roofGeo = new THREE.BoxGeometry(width + 0.3, 0.4, depth + 0.3);
    const roofMat = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: buildingColor,
      roughness: 0.75,
      metalness: 0.15,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(x, height + 0.2, z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.mission3Group.add(roof);
    // Roof is NOT a collider — enemies can be inside chambers
  }

  /**
   * Helper: add a cover object to mission3Group.
   * Bunker-specific types: crate, serverRack, barricade, concreteBarrier, barrel
   */
  private addM3Cover(
    x: number, z: number,
    type: string,
    options?: { rotation?: number; scale?: THREE.Vector3; color?: number; metalTexture?: THREE.CanvasTexture; concreteTexture?: THREE.CanvasTexture }
  ): void {
    const rotation = options?.rotation ?? 0;
    let mesh: THREE.Mesh;

    switch (type) {
      case 'crate': {
        const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const mat = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x6B4226,
          roughness: 0.85,
          metalness: 0.05,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      case 'barricade': {
        // Sandbag barricade — waist-height cover
        const geo = new THREE.BoxGeometry(3, 1.2, 1);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x8B7355,
          roughness: 0.9,
          metalness: 0.0,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      case 'concreteBarrier': {
        const geo = new THREE.BoxGeometry(4, 2.5, 0.5);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x777777,
          roughness: 0.75,
          metalness: 0.15,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      case 'barrel': {
        const geo = new THREE.CylinderGeometry(0.4, 0.45, 1.2, 10);
        const mat = new THREE.MeshStandardMaterial({
          color: options?.color ?? 0x3B5323,
          roughness: 0.7,
          metalness: 0.4,
        });
        mesh = new THREE.Mesh(geo, mat);
        break;
      }
      case 'serverRack': {
        // Tall dark server rack
        const geo = new THREE.BoxGeometry(1.0, 2.2, 0.7);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x2a2a2a,
          roughness: 0.5,
          metalness: 0.6,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        // Add blinking lights
        const lightMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
        for (let i = 0; i < 3; i++) {
          const lightGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
          const light = new THREE.Mesh(lightGeo, lightMat.clone());
          light.position.set(x - 0.2 + i * 0.15, 0.6 + i * 0.5, z + 0.36);
          this.mission3Group.add(light);
        }
        break;
      }
      case 'metalCrate': {
        const geo = new THREE.BoxGeometry(1.5, 1, 1.5);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x555555,
          roughness: 0.5,
          metalness: 0.5,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = rotation;
        break;
      }
      default: {
        console.warn(`[addM3Cover] Unknown cover type: ${type}`);
        return;
      }
    }

    const bbox = new THREE.Box3().setFromObject(mesh);
    const height = bbox.max.y - bbox.min.y;
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mission3Group.add(mesh);
    this.colliders.push(mesh);
  }

  /**
   * Helper: add a reinforced door (visual + collider) to mission3Group.
   * Metal door that blocks corridor between chambers.
   */
  private addM3ReinforcedDoor(x: number, z: number, rotation: number, name: string): THREE.Mesh {
    const geo = new THREE.BoxGeometry(4, 3.5, 0.3);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.4,
      metalness: 0.7,
    });
    const door = new THREE.Mesh(geo, mat);
    door.position.set(x, 1.75, z);
    door.rotation.y = rotation;
    door.castShadow = true;
    door.receiveShadow = true;
    door.name = name;
    this.mission3Group.add(door);
    this.colliders.push(door);
    return door;
  }

  /**
   * Helper: add a corridor segment (walls + floor) to mission3Group.
   */
  private addM3Corridor(
    x: number, z: number,
    length: number,  // z-axis length
    width: number,   // x-axis width
    height: number,
    concreteTexture: THREE.CanvasTexture
  ): void {
    const wallMat = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: 0x5A5A5A,
      roughness: 0.7,
      metalness: 0.2,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.8,
      metalness: 0.1,
    });

    // Left wall (x-)
    const leftGeo = new THREE.BoxGeometry(0.5, height, length);
    const leftWall = new THREE.Mesh(leftGeo, wallMat);
    leftWall.position.set(x - width / 2, height / 2, z);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    this.mission3Group.add(leftWall);
    this.colliders.push(leftWall);

    // Right wall (x+)
    const rightGeo = new THREE.BoxGeometry(0.5, height, length);
    const rightWall = new THREE.Mesh(rightGeo, wallMat);
    rightWall.position.set(x + width / 2, height / 2, z);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    this.mission3Group.add(rightWall);
    this.colliders.push(rightWall);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(width, length);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.01, z);
    floor.receiveShadow = true;
    this.mission3Group.add(floor);
  }

  /**
   * Main Mission 3 level builder — Underground Bunker Complex.
   *
   * LAYOUT (z-axis, player moves south from z=190):
   *   z: 190-170 — Spawn area / bunker exterior approach
   *   z: 170-140 — Outer perimeter corridor (6 guards)
   *   z: 140-105 — Chamber Alpha (Commander Alpha + 5 guards)
   *   z: 105-65  — Corridor + Chamber Beta (Commander Beta + 5 guards)
   *   z: 65-25   — Corridor + Chamber Gamma (Commander Gamma + 5 guards)
   *   z: 25-190  — Extraction route back through bunker (3 ambush enemies)
   */
  private addMission3Level(
    concreteTexture: THREE.CanvasTexture,
    metalTexture: THREE.CanvasTexture
  ): void {
    this.scene.add(this.mission3Group);

    // Shared materials
    const bunkerWallMat = new THREE.MeshStandardMaterial({
      map: concreteTexture,
      color: 0x5A5A5A,
      roughness: 0.7,
      metalness: 0.2,
    });

    const darkFloorMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.85,
      metalness: 0.1,
    });

    // ══════════════════════════════════════════════════════════
    // SPAWN AREA (z: 190 to 170) — Exterior approach to bunker
    // ══════════════════════════════════════════════════════════

    // Approach corridor walls — narrow path leading to bunker entrance
    this.addM3Corridor(0, 180, 20, 8, 4, concreteTexture);

    // Bunker entrance gate — metal frame
    const entranceGeo = new THREE.BoxGeometry(8, 4, 0.4);
    const entranceMat = new THREE.MeshStandardMaterial({
      map: metalTexture,
      color: 0x444444,
      roughness: 0.4,
      metalness: 0.7,
    });
    const entrance = new THREE.Mesh(entranceGeo, entranceMat);
    entrance.position.set(0, 2, 170);
    entrance.castShadow = true;
    entrance.receiveShadow = true;
    this.mission3Group.add(entrance);
    this.colliders.push(entrance);

    // Sandbag cover at entrance
    this.addM3Cover(-3, 175, 'barricade');
    this.addM3Cover(3, 175, 'barricade');

    // Ammo pickup at spawn
    this.addAmmoPickup(5, 185);

    // ══════════════════════════════════════════════════════════
    // ZONE 1 — OUTER PERIMETER (z: 170 to 140)
    // Bunker entrance corridor with guard positions
    // ══════════════════════════════════════════════════════════

    // Main corridor — 6 wide, 30 long
    this.addM3Corridor(0, 155, 30, 6, 3.5, concreteTexture);

    // Side rooms (guard posts) — small 4x4 chambers
    this.addM3Building(-8, 165, 4, 4, 3.5, concreteTexture, { doorwayWall: 'east' });
    this.addM3Building(8, 160, 4, 4, 3.5, concreteTexture, { doorwayWall: 'west' });

    // Cover in corridor
    this.addM3Cover(-2, 168, 'crate');
    this.addM3Cover(2, 162, 'metalCrate');
    this.addM3Cover(-1, 155, 'barrel');
    this.addM3Cover(3, 150, 'barrel');
    this.addM3Cover(-3, 145, 'crate', { rotation: 0.3 });

    // Ammo pickup at perimeter
    this.addAmmoPickup(-2, 148);

    // ══════════════════════════════════════════════════════════
    // REINFORCED DOOR 1 — Blocks access to Chamber Alpha
    // ══════════════════════════════════════════════════════════
    const doorAlpha = this.addM3ReinforcedDoor(0, 140, 0, 'door-alpha');
    doorAlpha.visible = true; // Door visible until Alpha is killed

    // ══════════════════════════════════════════════════════════
    // ZONE 2 — CHAMBER ALPHA (z: 140 to 105)
    // First commander — medium difficulty
    // ══════════════════════════════════════════════════════════

    // Chamber Alpha — large room 16x30
    this.addM3Building(0, 122, 16, 30, 4, concreteTexture);

    // Internal structures — command desk, server racks
    this.addM3Cover(-5, 128, 'serverRack');
    this.addM3Cover(5, 128, 'serverRack');
    this.addM3Cover(0, 130, 'crate'); // Command desk area

    // Cover for guards
    this.addM3Cover(-4, 122, 'barricade', { rotation: Math.PI / 2 });
    this.addM3Cover(4, 122, 'barricade', { rotation: Math.PI / 2 });
    this.addM3Cover(-2, 115, 'metalCrate');
    this.addM3Cover(2, 115, 'metalCrate');
    this.addM3Cover(0, 118, 'barrel');
    this.addM3Cover(-6, 120, 'crate');
    this.addM3Cover(6, 120, 'crate');

    // Side alcoves with cover
    this.addM3Cover(-6, 110, 'barricade');
    this.addM3Cover(6, 110, 'barricade');

    // Ammo pickup in Alpha chamber
    this.addAmmoPickup(-5, 112);

    // ══════════════════════════════════════════════════════════
    // CORRIDOR ALPHA→BETA (z: 105 to 100)
    // ══════════════════════════════════════════════════════════
    this.addM3Corridor(0, 102.5, 5, 5, 3.5, concreteTexture);

    // ══════════════════════════════════════════════════════════
    // REINFORCED DOOR 2 — Blocks access to Chamber Beta
    // ══════════════════════════════════════════════════════════
    const doorBeta = this.addM3ReinforcedDoor(0, 100, 0, 'door-beta');
    doorBeta.visible = true;

    // ══════════════════════════════════════════════════════════
    // ZONE 3 — CHAMBER BETA (z: 100 to 65)
    // Second commander — harder, elite guards
    // ══════════════════════════════════════════════════════════

    // Chamber Beta — slightly larger room 18x30
    this.addM3Building(0, 82, 18, 30, 4, concreteTexture);

    // Central command platform (raised area)
    const platformGeo = new THREE.BoxGeometry(6, 0.5, 6);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.6,
      metalness: 0.3,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(0, 0.25, 82);
    platform.receiveShadow = true;
    this.mission3Group.add(platform);

    // Cover for guards — scattered throughout
    this.addM3Cover(-6, 88, 'barricade', { rotation: Math.PI / 3 });
    this.addM3Cover(6, 88, 'barricade', { rotation: -Math.PI / 3 });
    this.addM3Cover(-3, 82, 'metalCrate');
    this.addM3Cover(3, 82, 'metalCrate');
    this.addM3Cover(-7, 76, 'barrel');
    this.addM3Cover(7, 76, 'barrel');
    this.addM3Cover(0, 78, 'crate');
    this.addM3Cover(-4, 73, 'barricade');
    this.addM3Cover(4, 73, 'barricade');
    this.addM3Cover(-6, 70, 'serverRack');
    this.addM3Cover(6, 70, 'serverRack');

    // Ammo pickup in Beta chamber
    this.addAmmoPickup(0, 75);

    // ══════════════════════════════════════════════════════════
    // CORRIDOR BETA→GAMMA (z: 65 to 60)
    // ══════════════════════════════════════════════════════════
    this.addM3Corridor(0, 62.5, 5, 5, 3.5, concreteTexture);

    // ══════════════════════════════════════════════════════════
    // ZONE 4 — CHAMBER GAMMA (z: 60 to 25)
    // Third commander — hardest, final boss
    // ══════════════════════════════════════════════════════════

    // Chamber Gamma — largest room 20x30
    this.addM3Building(0, 42, 20, 30, 4.5, concreteTexture);

    // Commander's podium (center, elevated)
    const podiumGeo = new THREE.BoxGeometry(3, 1, 3);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.5,
      metalness: 0.4,
    });
    const podium = new THREE.Mesh(podiumGeo, podiumMat);
    podium.position.set(0, 0.5, 42);
    podium.castShadow = true;
    podium.receiveShadow = true;
    this.mission3Group.add(podium);
    this.colliders.push(podium);

    // Heavy cover — defense positions
    this.addM3Cover(-7, 50, 'barricade', { rotation: Math.PI / 4 });
    this.addM3Cover(7, 50, 'barricade', { rotation: -Math.PI / 4 });
    this.addM3Cover(-4, 45, 'metalCrate');
    this.addM3Cover(4, 45, 'metalCrate');
    this.addM3Cover(-8, 38, 'barrel');
    this.addM3Cover(8, 38, 'barrel');
    this.addM3Cover(0, 40, 'crate');
    this.addM3Cover(-5, 35, 'barricade');
    this.addM3Cover(5, 35, 'barricade');
    this.addM3Cover(-7, 32, 'serverRack');
    this.addM3Cover(7, 32, 'serverRack');
    this.addM3Cover(-3, 28, 'metalCrate');
    this.addM3Cover(3, 28, 'metalCrate');

    // Ammo pickup in Gamma chamber
    this.addAmmoPickup(-6, 35);
    this.addAmmoPickup(6, 45);

    // ══════════════════════════════════════════════════════════
    // EXTRACTION CORRIDOR (z: 25 to 190)
    // Return route through bunker — ambush enemies spawn here
    // ══════════════════════════════════════════════════════════

    // Exit corridor from Gamma chamber
    this.addM3Corridor(0, 22.5, 5, 5, 3.5, concreteTexture);

    // Wider extraction corridor
    this.addM3Corridor(0, 90, 130, 7, 3.5, concreteTexture);

    // Cover along extraction route (reinforced positions)
    this.addM3Cover(-2, 135, 'barrel');
    this.addM3Cover(2, 135, 'barrel');
    this.addM3Cover(-3, 100, 'metalCrate');
    this.addM3Cover(3, 100, 'metalCrate');

    // ══════════════════════════════════════════════════════════
    // WORLD BOUNDARIES — Bunker walls at edges
    // ══════════════════════════════════════════════════════════
    this.addM3WorldBoundaries();

    // ══════════════════════════════════════════════════════════
    // SPAWN ENEMIES
    // ══════════════════════════════════════════════════════════
    this.enemyManager.spawnMission3Enemies(this.scene);
  }

  /**
   * Creates bunker-style world boundaries for Mission 3.
   * Solid concrete walls along the edges of the bunker complex.
   */
  private addM3WorldBoundaries(): void {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x4A4A4A,
      roughness: 0.8,
      metalness: 0.1,
    });

    // Left boundary (x = -16)
    for (let z = 25; z <= 190; z += 8) {
      const h = 4 + Math.random() * 2;
      const geo = new THREE.BoxGeometry(2, h, 8);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(-16, h / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.mission3Group.add(wall);
      this.colliders.push(wall);
    }

    // Right boundary (x = 16)
    for (let z = 25; z <= 190; z += 8) {
      const h = 4 + Math.random() * 2;
      const geo = new THREE.BoxGeometry(2, h, 8);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(16, h / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.mission3Group.add(wall);
      this.colliders.push(wall);
    }

    // Forward boundary (z = 20) — bunker back wall
    for (let x = -15; x <= 15; x += 5) {
      const h = 4 + Math.random();
      const geo = new THREE.BoxGeometry(5, h, 2);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(x, h / 2, 20);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.mission3Group.add(wall);
      this.colliders.push(wall);
    }

    // Back boundary (z = 195) — spawn area barrier
    for (let x = -15; x <= 15; x += 5) {
      const h = 4 + Math.random();
      const geo = new THREE.BoxGeometry(5, h, 2);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(x, h / 2, 195);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.mission3Group.add(wall);
      this.colliders.push(wall);
    }
  }

  /**
   * Removes all Mission 3 level objects from the scene and clears colliders.
   */
  public removeMission3Level(): void {
    this.mission3Group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });

    this.scene.remove(this.mission3Group);

    this.colliders = [];

    for (const pickup of this.ammoPickups) {
      this.scene.remove(pickup);
      pickup.geometry.dispose();
      (pickup.material as THREE.Material).dispose();
    }
    for (const light of this.ammoPickupLights) {
      this.scene.remove(light);
    }
    this.ammoPickups = [];
    this.ammoPickupLights = [];

    this.mission3Group = new THREE.Group();
  }

  // ============================================================
  // GROUND-LEVEL FOG (ambient density variation)
  // ============================================================

  /**
   * Creates layered semi-transparent fog planes just above the terrain
   * to simulate thicker atmospheric density near the ground. Each layer
   * sits at a different height with decreasing opacity, producing a
   * subtle volumetric haze that blends with the scene's exponential fog.
   */
  private createGroundFog(): void {
    const fogColor = new THREE.Color(0x1a1a2e);
    const layers = [
      { y: 0.2, opacity: 0.10, size: 220 },
      { y: 0.7, opacity: 0.05, size: 180 },
      { y: 1.4, opacity: 0.02, size: 140 },
    ];

    for (const layer of layers) {
      const geo = new THREE.PlaneGeometry(layer.size, layer.size);
      const mat = new THREE.MeshBasicMaterial({
        color: fogColor,
        transparent: true,
        opacity: layer.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false, // Avoid double-fogging; these planes ARE the ground fog
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(0, layer.y, 120); // Centred over the play area (z 40-200)
      this.scene.add(plane);
    }
  }

  // ============================================================
  // ATMOSPHERIC DUST PARTICLES
  // ============================================================

  /**
   * Creates a particle system of ~200 tiny white dust motes
   * distributed in a volume around the player's initial position.
   */
  private createDustParticles(): void {
    const count = this.DUST_COUNT;
    this.dustPositions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.dustPositions[i * 3 + 0] = (Math.random() - 0.5) * this.DUST_SPREAD_X;
      this.dustPositions[i * 3 + 1] = Math.random() * this.DUST_SPREAD_Y;
      this.dustPositions[i * 3 + 2] = (Math.random() - 0.5) * this.DUST_SPREAD_Z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.05,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.dustParticles = new THREE.Points(geometry, material);
    this.scene.add(this.dustParticles);
  }

  /**
   * Drifts dust particles in the wind direction, wrapping them
   * around the player's current position so they stay in view.
   */
  // Debug: highlight AND fix enemies stuck inside colliders
  private stuckDebugMeshes: THREE.Mesh[] = [];
  
  private updateStuckEnemyDebug(): void {
    // Remove old debug meshes (dispose geometry + material to prevent memory leak)
    for (const mesh of this.stuckDebugMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.stuckDebugMeshes = [];
    
    const aliveEnemies = this.enemyManager.getAliveEnemies();
    for (const enemy of aliveEnemies) {
      const pos = enemy.group.position;
      const enemyBox = new THREE.Box3(
        new THREE.Vector3(pos.x - 0.5, pos.y, pos.z - 0.5),
        new THREE.Vector3(pos.x + 0.5, pos.y + 2, pos.z + 0.5)
      );
      
      for (const collider of this.colliders) {
        const box = new THREE.Box3().setFromObject(collider);
        if (enemyBox.intersectsBox(box)) {
          // Enemy is inside a collider — show red box AND push out
          const debugGeo = new THREE.BoxGeometry(1.2, 2.2, 1.2);
          const debugMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.4,
            wireframe: true 
          });
          const debugMesh = new THREE.Mesh(debugGeo, debugMat);
          debugMesh.position.copy(pos);
          debugMesh.position.y += 1;
          this.scene.add(debugMesh);
          this.stuckDebugMeshes.push(debugMesh);
          
          // AUTO-PUSH: Move enemy out of collider
          const center = new THREE.Vector3();
          box.getCenter(center);
          const pushDir = new THREE.Vector3(pos.x - center.x, 0, pos.z - center.z);
          if (pushDir.length() < 0.001) pushDir.set(1, 0, 0);
          pushDir.normalize();
          enemy.group.position.x += pushDir.x * 2;
          enemy.group.position.z += pushDir.z * 2;
          
          // Update terrain height
          if (this.enemyManager['terrainHeightProvider']) {
            enemy.group.position.y = this.enemyManager['terrainHeightProvider'](
              enemy.group.position.x, enemy.group.position.z
            );
          }
          
          break;
        }
      }
    }
  }

  private updateDustParticles(delta: number): void {
    if (!this.dustParticles || !this.dustPositions) return;

    const playerPos = this.player.getPosition();
    const halfX = this.DUST_SPREAD_X / 2;
    const halfZ = this.DUST_SPREAD_Z / 2;

    for (let i = 0; i < this.DUST_COUNT; i++) {
      const idx = i * 3;

      // Apply wind drift
      this.dustPositions[idx + 0] += this.dustWindSpeed.x * delta;
      this.dustPositions[idx + 1] += this.dustWindSpeed.y * delta;
      this.dustPositions[idx + 2] += this.dustWindSpeed.z * delta;

      // Add slight per-particle sine bob for organic movement
      this.dustPositions[idx + 1] += Math.sin(performance.now() * 0.001 + i * 1.7) * 0.002;

      // Wrap around player
      const worldX = this.dustPositions[idx + 0];
      const worldY = this.dustPositions[idx + 1];
      const worldZ = this.dustPositions[idx + 2];

      if (worldX - playerPos.x > halfX) this.dustPositions[idx + 0] = playerPos.x - halfX;
      else if (worldX - playerPos.x < -halfX) this.dustPositions[idx + 0] = playerPos.x + halfX;

      if (worldY > this.DUST_SPREAD_Y) this.dustPositions[idx + 1] = 0;
      else if (worldY < 0) this.dustPositions[idx + 1] = this.DUST_SPREAD_Y;

      if (worldZ - playerPos.z > halfZ) this.dustPositions[idx + 2] = playerPos.z - halfZ;
      else if (worldZ - playerPos.z < -halfZ) this.dustPositions[idx + 2] = playerPos.z + halfZ;
    }

    // Upload updated positions to GPU
    const posAttr = this.dustParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  // ============================================================
  // BOUNDARY WARNING SYSTEM
  // ============================================================

  /**
   * Creates a full-screen overlay used to tint the screen edges
   * when the player approaches a boundary. Uses a radial gradient
   * vignette for a subtle, immersive warning effect.
   */
  private createBoundaryOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'boundary-warning-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 50;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(180, 50, 20, 0.55) 100%);
      opacity: 0; transition: opacity 0.35s ease-in-out;
    `;
    document.body.appendChild(overlay);
    this.boundaryOverlay = overlay;
  }

  /**
   * Checks the player's position against all world boundaries.
   * When the player is within BOUNDARY_WARNING_MARGIN units of any edge,
   * the boundary overlay fades in with increasing opacity proportional
   * to proximity. This provides a subtle visual cue that the player
   * is heading the wrong way.
   */
  private checkBoundaryWarning(): void {
    if (!this.isRunning || this.isPaused) return;

    const pos = this.player.getPosition();
    const margin = this.BOUNDARY_WARNING_MARGIN;

    // Calculate how close the player is to each boundary (0 = at boundary, 1 = safe)
    const distForward  = Math.max(0, Math.min(1, (pos.z - 40) / margin));
    const distBackward = Math.max(0, Math.min(1, (200 - pos.z) / margin));
    const distLeft     = Math.max(0, Math.min(1, (pos.x - (-50)) / margin));
    const distRight    = Math.max(0, Math.min(1, (50 - pos.x) / margin));

    // Worst-case proximity across all boundaries
    const minDist = Math.min(distForward, distBackward, distLeft, distRight);

    // Map to opacity: 0 at safe distance, up to 0.75 at the hard boundary
    const opacity = minDist < 1 ? (1 - minDist) * 0.75 : 0;

    if (this.boundaryOverlay) {
      this.boundaryOverlay.style.opacity = String(opacity);
    }

    this.boundaryWarningActive = opacity > 0;
  }

  // ============================================================
  // NIGHT VISION SYSTEM
  // ============================================================

  /**
   * Creates the night vision overlay DOM element (green tint).
   * Called once during setup.
   */
  private createNightVisionOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'night-vision-overlay';
    document.body.appendChild(overlay);
    this.nightVisionOverlay = overlay;
  }

  /**
   * Toggles the night vision mode on/off.
   * When active:
   *   - Green tint overlay appears
   *   - Scene ambient light dims to 0.1
   *   - A point light is added at the player position (NVG glow)
   *   - Enemy meshes get slight emissive glow (bright outlines)
   * When deactivated, all settings are restored to normal.
   */
  public toggleNightVision(active: boolean): void {
    this.nightVisionActive = active;

    // ═══ RADIO CHATTER — NVG toggle ═══
    if (active) {
      // Wolf personality: concise tactical update
      this.uiManager.showRadioSubtitle('Wolf: Switching to NVG', 2000);
    } else {
      this.uiManager.showRadioSubtitle('Wolf: NVG off', 1500);
    }

    // 1. Show/hide the green overlay
    if (this.nightVisionOverlay) {
      if (active) {
        this.nightVisionOverlay.classList.add('active');
      } else {
        this.nightVisionOverlay.classList.remove('active');
      }
    }

    // 2. Adjust scene lighting — restore to ORIGINAL values (not stored-on-toggle)
    this.scene.traverse((child) => {
      if (child instanceof THREE.AmbientLight) {
        child.intensity = active ? 0.1 : this.originalAmbientIntensity;
      }
      if (child instanceof THREE.DirectionalLight) {
        // Sun light
        if (child.color.getHex() === 0xFFAA66) {
          child.intensity = active ? 0.15 : this.originalDirectionalIntensity;
        }
        // Fill light
        if (child.color.getHex() === 0x4466AA) {
          child.intensity = active ? 0.05 : this.originalFillIntensity;
        }
      }
      if (child instanceof THREE.HemisphereLight) {
        child.intensity = active ? 0.1 : this.originalHemiIntensity;
      }
    });

    // 3. Add/remove night vision glow light at player position
    if (active) {
      if (!this.nightVisionLight) {
        this.nightVisionLight = new THREE.PointLight(0x00ff00, 1.5, 25, 1.5);
        this.scene.add(this.nightVisionLight);
      }
      const playerPos = this.player.getPosition();
      this.nightVisionLight.position.copy(playerPos);
      this.nightVisionLight.visible = true;
    } else {
      if (this.nightVisionLight) {
        this.nightVisionLight.visible = false;
      }
    }

    // 4. Make enemy meshes emissive when night vision is on
    const aliveEnemies = this.enemyManager.getEnemies().filter(e => e.state !== 'dead');
    for (const enemy of aliveEnemies) {
      enemy.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (active) {
            // Store original material if not already stored
            if (!this.nightVisionEmissiveMaterials.has(child)) {
              this.nightVisionEmissiveMaterials.set(child, child.material);
            }
            // Create emissive version
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            const emissiveMats = mats.map((m: THREE.Material) => {
              if (m instanceof THREE.MeshStandardMaterial) {
                const clone = m.clone();
                clone.emissive = new THREE.Color(0x00ff00);
                clone.emissiveIntensity = 0.4;
                return clone;
              }
              return m;
            });
            child.material = emissiveMats.length === 1 ? emissiveMats[0] : emissiveMats;
          } else {
            // Restore original material
            const original = this.nightVisionEmissiveMaterials.get(child);
            if (original) {
              child.material = original;
            }
          }
        }
      });
    }
  }

  /**
   * Updates the night vision light position to follow the player each frame.
   */
  private updateNightVision(delta: number): void {
    if (!this.nightVisionActive || !this.nightVisionLight) return;

    // Follow the player
    const playerPos = this.player.getPosition();
    this.nightVisionLight.position.lerp(
      new THREE.Vector3(playerPos.x, playerPos.y + 0.5, playerPos.z),
      10 * delta
    );

    // Pulse the light intensity slightly for NVG flicker effect
    this.nightVisionLight.intensity = 1.5 + Math.sin(performance.now() * 0.008) * 0.2;
  }

  /**
   * Deactivates night vision on reset/dispose.
   */
  private deactivateNightVision(): void {
    if (this.nightVisionActive) {
      this.toggleNightVision(false);
    }
    // Clean up the overlay
    if (this.nightVisionOverlay) {
      this.nightVisionOverlay.remove();
      this.nightVisionOverlay = null;
    }
    // Remove the NV light
    if (this.nightVisionLight) {
      this.scene.remove(this.nightVisionLight);
      this.nightVisionLight = null;
    }
    this.nightVisionEmissiveMaterials.clear();
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  private setupEventListeners(): void {
    // F1 = Toggle debug mode
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') {
        e.preventDefault();
        this.debugMode.toggle();
        this.toggleDebugPanel();
      }
    });
  }

  private toggleDebugPanel(): void {
    const panel = document.getElementById('debug-panel');
    if (panel) {
      panel.style.display = this.debugMode.enabled ? 'block' : 'none';
    }
  }

  private setupGameOverListener(): void {
    const respawnBtn = document.getElementById('btn-respawn');
    if (respawnBtn) {
      respawnBtn.addEventListener('click', () => this.respawnPlayer());
    }
  }

  // ============================================================
  // SHOOTING
  // ============================================================

  private handleShoot(): void {
    const weapon = this.weaponSystem.getCurrentWeapon();
    
    if (!this.isRunning || this.isPaused) {
      return;
    }
    
    // Use weapon system — try to fire
    const fired = this.weaponSystem.tryFire();
    if (!fired) {
      // Show OUT OF AMMO when gun is empty (mag + reserve both depleted)
      if (!this.weaponSystem.isMeleeWeapon() && weapon.ammo === 0 && weapon.reserve === 0) {
        this.uiManager.showMessage('OUT OF AMMO', 1500);
      }
      return;
    }

    // === MELEE WEAPONS — distance-based hit check ===
    if (this.weaponSystem.isMeleeWeapon()) {
      this.handleMeleeAttack(weapon);
      return;
    }

    // === GUN WEAPONS — raycast from camera center ===
    this.handleGunshot(weapon);
  }

  /**
   * Melee attack: check distance to nearest enemy and apply damage directly.
   * Bare hands have lower damage; knives/daggers are stronger.
   */
  private handleMeleeAttack(weapon: any): void {
    const playerPos = this.player.getPosition();
    const meleeRange = this.weaponSystem.getMeleeRange();
    const damage = this.weaponSystem.getMeleeDamage();

    // Find the closest alive enemy within melee range
    const aliveEnemies = this.enemyManager.getEnemies().filter(e => e.state !== 'dead');
    let closestEnemy: any = null;
    let closestDist = Infinity;

    for (const enemy of aliveEnemies) {
      const dist = playerPos.distanceTo(enemy.group.position);
      if (dist < meleeRange && dist < closestDist) {
        closestDist = dist;
        closestEnemy = enemy;
      }
    }

    if (!closestEnemy) {
      // Swing with no hit — play a miss sound or do nothing
      this.audioManager.playGunshot(false, weapon.name);
      return;
    }

    // Hit! Determine if stealth kill (from behind)
    const enemyDir = new THREE.Vector3()
      .subVectors(closestEnemy.group.position, playerPos)
      .normalize();
    const playerForward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion);
    playerForward.y = 0;
    playerForward.normalize();
    const dotProduct = enemyDir.dot(playerForward);
    const isStealthKill = dotProduct > 0.7; // attacking from behind

    const hitPoint = closestEnemy.group.position.clone();
    hitPoint.y = 1.2; // torso height

    // Calculate hit direction for knockback
    const hitDirection = new THREE.Vector3()
      .subVectors(closestEnemy.group.position, playerPos)
      .normalize();

    // Play melee sound
    this.audioManager.playGunshot(false, weapon.name);

    const actualDamage = isStealthKill ? damage * 3 : damage;
    const isHeadshot = false; // Melee always targets torso

    const killed = this.enemyManager.damageEnemy(
      closestEnemy, actualDamage, isHeadshot, hitPoint, hitDirection, isStealthKill
    );

    // Project hit point to screen coordinates for floating numbers
    const projectedPoint = hitPoint.clone().project(this.camera);
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const screenX = projectedPoint.x * halfW + halfW;
    const screenY = -(projectedPoint.y * halfH) + halfH;

    if (killed) {
      this.audioManager.playKillConfirm();
      const killScore = isStealthKill ? 200 : 100;
      this.addScore(killScore);
      this.uiManager.addKillFeedEntry(
        isStealthKill ? '🗡️ STEALTH KILL! +200' : `👊 ${weapon.name} KILL +${killScore}`
      );
      this.uiManager.registerKill();
      this.uiManager.showKillConfirm();
      this.uiManager.showGoldKillVignette(200);
      this.showHitMarker(false);

      const killText = isStealthKill ? '🗡 STEALTH KILL' : '✓ KILL';
      this.uiManager.showDamageNumber(killText, screenX, screenY, false, true);

      this.uiManager.addXPPopup(isStealthKill ? 'STEALTH KILL +200' : `${weapon.name} KILL +${killScore}`, screenX, screenY, false);

      this.killCount++;
      this.totalKillCount++;
      if (isStealthKill) this.stealthKillCount++;
      this.checkMissionKillObjectives();

      // ═══ RADIO CHATTER — Melee kill reactions ═══
      const now = performance.now();
      if (!this.firstKillTriggered) {
        this.firstKillTriggered = true;
        this.uiManager.showRadioSubtitle('Falcon: Target eliminated', 2500);
        this.lastKillRadioTime = now;
      } else if (now - this.lastKillRadioTime > this.RADIO_COOLDOWN) {
        this.lastKillRadioTime = now;
        if (isStealthKill) {
          this.uiManager.showRadioSubtitle('Wolf: Silent drop', 2000);
        } else {
          this.uiManager.showRadioSubtitle('Wolf: Tango down', 2000);
        }
      }
    } else {
      this.audioManager.playHitConfirm();
      this.addScore(10);
      this.showHitMarker(false);
      this.uiManager.showDamageNumber(String(actualDamage), screenX, screenY, false, false);
      this.uiManager.addXPPopup('+10', screenX, screenY, false);
    }
  }

  /**
   * Gunshot: raycast from camera center, check for enemy/wall hits.
   */
  private handleGunshot(weapon: any): void {
    // Muzzle flash
    this.createMuzzleFlash();

    // Gunshot audio — pass weapon name for layered per-weapon sound
    this.audioManager.playGunshot(weapon.isSuppressed, weapon.name);

    // ═══ SOUND-BASED DETECTION ═══
    // Unsuppressed gunfire alerts enemies within 50 units (sound blocked by walls).
    // Suppressed weapons use a much smaller radius (30% = 15 units).
    this.enemyManager.alertAtGunfire(this.player.getPosition(), weapon.isSuppressed);
    
    // === COMBAT FEEL — camera recoil + weapon kick + shoot shake ===
    this.player.addRecoil();
    this.player.triggerFireKick();
    this.player.triggerShootShake();
    
    // Update ammo UI (mag + reserve)
    this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);
    
    // === RAYCAST from camera center ===
    const raycaster = new THREE.Raycaster();
    raycaster.far = weapon.range || 100;
    raycaster.near = 0.1;
    
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    
    const aliveEnemies = this.enemyManager.getEnemies().filter(e => e.state !== 'dead');
    const enemyMeshes = aliveEnemies.map(e => e.group);
    
    // Raycast against BOTH enemies AND walls — first hit determines result
    const allTargets = [...enemyMeshes, ...this.colliders];
    const intersects = raycaster.intersectObjects(allTargets, true);
    
    if (intersects.length > 0) {
      const firstHit = intersects[0];
      const hitPoint = firstHit.point;
      
      // Check if first hit was a wall or an enemy
      const isWallHit = this.colliders.some(c => {
        let obj: THREE.Object3D | null = firstHit.object;
        while (obj) {
          if (obj === c) return true;
          obj = obj.parent;
        }
        return false;
      });
      
      if (isWallHit) {
        // BULLET HIT A WALL — show wall impact effects, do NOT damage enemy
        this.createPlayerBulletTracer(hitPoint);
        this.spawnWallImpact(hitPoint);
        this.audioManager.playWallImpact ? this.audioManager.playWallImpact() : null;
        return; // Bullet stops here
      }
      
      // BULLET HIT AN ENEMY — normal damage logic
      this.createPlayerBulletTracer(hitPoint);
      
      let hitObject: THREE.Object3D = firstHit.object;
      
      let foundEnemy: any = null;
      let current: THREE.Object3D | null = hitObject;
      while (current) {
        foundEnemy = aliveEnemies.find(e => e.group === current);
        if (foundEnemy) break;
        current = current.parent;
      }
      
      if (foundEnemy) {
        const hitPoint = intersects[0].point;
        // Headshot: compare hit Y relative to enemy's feet (world Y), not absolute
        const enemyFeetY = foundEnemy.group.position.y;
        const relativeHitY = hitPoint.y - enemyFeetY;
        const isHeadshot = relativeHitY > 1.4; // Head is ~1.55 above feet

        // Calculate hit direction for knockback (from camera toward enemy)
        const hitDirection = new THREE.Vector3()
          .subVectors(foundEnemy.group.position, this.camera.position)
          .normalize();

        this.spawnImpactSparks(hitPoint);

        const killed = this.enemyManager.damageEnemy(
          foundEnemy, weapon.damage, isHeadshot, hitPoint, hitDirection
        );

        // Project hit point to screen coordinates for floating numbers
        const projectedPoint = hitPoint.clone().project(this.camera);
        const halfW = window.innerWidth / 2;
        const halfH = window.innerHeight / 2;
        const screenX = projectedPoint.x * halfW + halfW;
        const screenY = -(projectedPoint.y * halfH) + halfH;

        if (killed) {
          // === KILL FEEDBACK LAYERS ===
          
          // 1. Kill confirm sound
          this.audioManager.playKillConfirm();
          
          // 2. Score
          this.addScore(isHeadshot ? 150 : 100);
          
          // 3. Kill feed entry
          this.uiManager.addKillFeedEntry(
            isHeadshot ? '💀 HEADSHOT! +150' : '🔫 ENEMY KILLED +100'
          );
          
          // 4. Kill streak tracking (auto-shows streak notifications at milestones)
          this.uiManager.registerKill();
          
          // 5. Kill confirm skull icon at center screen (300ms flash)
          this.uiManager.showKillConfirm();
          
          // 6. Gold screen-edge vignette flash (200ms)
          this.uiManager.showGoldKillVignette(200);
          
          // 7. Hit marker (RED for headshot, WHITE for body)
          this.showHitMarker(isHeadshot);
          
          // 8. Floating damage number at hit position (gold/kill styled)
          const killText = isHeadshot ? '☠ HEADSHOT' : '✓ KILL';
          this.uiManager.showDamageNumber(killText, screenX, screenY, false, true);
          
          // 9. XP popup
          const xpText = isHeadshot ? 'HEADSHOT +150' : 'ENEMY KILLED +100';
          this.uiManager.addXPPopup(xpText, screenX, screenY, isHeadshot);

          // 10. Mission tracking
          this.killCount++;
          this.totalKillCount++;
          if (isHeadshot) this.stealthKillCount++; // Headshots count toward stealth skill
          this.checkMissionKillObjectives();

          // ═══ RADIO CHATTER — Kill reactions ═══
          const now = performance.now();
          if (!this.firstKillTriggered) {
            // First kill in the mission — always announce
            this.firstKillTriggered = true;
            this.uiManager.showRadioSubtitle('Falcon: Target eliminated', 2500);
            this.lastKillRadioTime = now;
          } else if (now - this.lastKillRadioTime > this.RADIO_COOLDOWN) {
            // Subsequent kills — Wolf personality lines with cooldown
            this.lastKillRadioTime = now;
            if (isHeadshot) {
              this.uiManager.showRadioSubtitle('Wolf: Tango down', 2000);
            } else {
              // Rotate through Wolf's professional one-liners
              const wolfKillLines = [
                'Wolf: Target down',
                'Wolf: He\'s down',
                'Wolf: Clear',
                'Wolf: Neutralized',
                'Wolf: Good hit',
              ];
              const line = wolfKillLines[Math.floor(Math.random() * wolfKillLines.length)];
              this.uiManager.showRadioSubtitle(line, 2000);
            }
          }
        } else {
          // === HIT FEEDBACK ===
          
          // Hit confirm sound
          this.audioManager.playHitConfirm();
          this.addScore(10);
          
          // Hit marker
          this.showHitMarker(isHeadshot);
          
          // Floating damage number at hit position
          const damageText = String(Math.round(isHeadshot ? weapon.damage * 2.5 : weapon.damage));
          this.uiManager.showDamageNumber(damageText, screenX, screenY, isHeadshot, false);
          
          // XP popup
          this.uiManager.addXPPopup('+10', screenX, screenY, false);
        }
      }
    } else {
      this.createPlayerBulletTracer(null);
    }
  }

  // ============================================================
  // MISSION 1 — OBJECTIVE PROGRESSION SYSTEM
  // ============================================================

  /**
   * Called every frame from gameLoop(). Evaluates the current
   * mission phase and advances when conditions are met.
   */
  private checkMissionProgression(delta: number): void {
    // ── Phase transition delay gate ──
    // When set > 0, mission progression is paused so the player can read the objective update
    if (this.phaseTransitionDelay > 0) {
      this.phaseTransitionDelay -= delta;
      return;
    }

    // Dispatch to the correct mission's progression system
    if (this.currentMissionId === 2) {
      this.checkMission2Progression(delta);
      this.updateM2Markers(delta);
      return;
    }

    // ═══ MISSION 3 ═══
    if (this.currentMissionId === 3) {
      this.checkMission3Progression(delta);
      this.updateM3Markers(delta);
      return;
    }

    // ═══ MISSION 1 (default) ═══
    const playerPos = this.player.getPosition();

    switch (this.missionPhase) {
      case 1:
        this.checkPhase1_ReachPerimeter(playerPos);
        break;
      case 2:
        this.checkPhase2_EliminateGuards(playerPos, delta);
        break;
      case 3:
        this.checkPhase3_PlantC4(playerPos, delta);
        break;
      case 4:
        this.checkPhase4_SurviveCounterAttack(delta);
        break;
      case 5:
        this.checkPhase5_Extraction(delta);
        break;
    }
  }

  // ──────────────────────────────────────────────
  // PHASE 1: Reach the compound perimeter (z < 100)
  // ──────────────────────────────────────────────

  private checkPhase1_ReachPerimeter(playerPos: THREE.Vector3): void {
    if (playerPos.z < 100) {
      this.missionManager.completeObjective('obj_1_1');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Reach the compound perimeter — COMPLETE');
      this.uiManager.showMessage('COMPOUND PERIMETER REACHED', 2000);

      this.missionPhase = 2;

      // ── 2-second transition pause so player can read the objective update ──
      this.phaseTransitionDelay = 2.0;

      this.missionManager.updateObjectiveDescription(
        'obj_1_2',
        'Eliminate perimeter guards (0/5)'
      );
      this.uiManager.updateMissionObjective('Eliminate perimeter guards (0/5)');
      this.uiManager.showRadioSubtitle('Command: You\'re at the perimeter. Eliminate the guards before planting.');

      // === EVENT 3: Falcon spots hostiles in Zone 2 (delayed after pause) ===
      setTimeout(() => this.triggerEvent3_FalconPosition(), 5000);
    }
  }

  // ──────────────────────────────────────────────
  // PHASE 2: Eliminate 5 enemies in Zone 2
  // ──────────────────────────────────────────────

  private checkPhase2_EliminateGuards(_playerPos: THREE.Vector3, _delta: number): void {
    // Kill tracking is handled by checkMissionKillObjectives() on enemy kill
    // This just checks the threshold for advancement
    if (this.enemiesKilledInZone >= 5 && !this.obj_1_2_completed) {
      this.obj_1_2_completed = true;
      this.missionManager.completeObjective('obj_1_2');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Eliminate perimeter guards — COMPLETE');
      this.uiManager.showMessage('PERIMETER CLEARED', 2000);

      this.missionPhase = 3;

      // ── 2-second transition pause so player can read the objective update ──
      this.phaseTransitionDelay = 2.0;

      this.uiManager.updateMissionObjective('Plant C4 on border radar — look for the MARKER');
      this.uiManager.showRadioSubtitle('Command: Perimeter clear! Plant C4 on the border radar — follow the orange marker.');

      // === Create C4 placement marker at radar position ===
      this.createC4Marker();
    }
  }

  // ──────────────────────────────────────────────
  // PHASE 3: Plant C4 on the border radar
  //   - Player near radar (z≈46, x near 0-12)
  //   - Hold E for 3 seconds
  // ──────────────────────────────────────────────

  private checkPhase3_PlantC4(playerPos: THREE.Vector3, delta: number): void {
    const distToRadar = playerPos.distanceTo(this.radarPosition);
    const isNearRadar = distToRadar < 5;
    const holdingE = this.player.isKeyDown('KeyE');

    if (isNearRadar && holdingE) {
      // Progress the planting timer
      this.c4Planting = true;
      this.c4PlantProgress += delta;

      // Show C4 planting progress bar
      this.uiManager.showMessage(
        `💣 PLANTING C4... ${Math.min(100, Math.floor((this.c4PlantProgress / 3) * 100))}%`,
        100
      );

      if (this.c4PlantProgress >= 3) {
        // C4 planted!
        this.c4Planting = false;
        this.missionManager.completeObjective('obj_1_3');
        this.uiManager.addKillFeedEntry('✅ OBJECTIVE: C4 PLANTED ON RADAR — COMPLETE');
        this.uiManager.showMessage('💣 C4 PLANTED! Get to extraction!', 3000);
        this.uiManager.triggerScreenShake(5, 200);

        // === Remove C4 marker (no longer needed) ===
        this.removeC4Marker();

        this.missionPhase = 4;
        this.waveCount = 0;
        this.waveSpawnActive = true;
        this.waveSpawnTimer = 2; // 2 second delay before first wave
        this.missionManager.updateObjectiveDescription(
          'obj_1_4',
          'Survive enemy counter-attack (Wave 0/3)'
        );
        this.uiManager.updateMissionObjective('Survive enemy counter-attack (Wave 0/3)');
        this.uiManager.showRadioSubtitle('Command: C4 is set! They\'re calling reinforcements — hold your positions!');

        // === SCRIPTED EVENT 4: Alarm trigger ===
        this.triggerEvent4_AlarmTrigger();

        // === SCRIPTED EVENT 5: Summon unlock (delayed after alarm) ===
        setTimeout(() => this.triggerEvent5_SummonUnlock(), 2000);
      }
    } else if (!holdingE || !isNearRadar) {
      // Reset progress if player stops holding E or walks away
      if (this.c4PlantProgress > 0) {
        this.uiManager.showMessage('⚠ Planting interrupted!', 1000);
      }
      this.c4PlantProgress = 0;
      this.c4Planting = false;
    }

    // Show "Hold E to plant C4" prompt when near radar
    if (isNearRadar && !this.c4Planting) {
      this.uiManager.showMessage('Hold [E] to plant C4', 100);
    }
  }

  // ──────────────────────────────────────────────
  // PHASE 4: Survive 3 waves of counter-attack
  //   - 5 enemies per wave
  //   - 10 second gap between waves
  //   - Advance when all 3 waves cleared
  // ──────────────────────────────────────────────

  private checkPhase4_SurviveCounterAttack(delta: number): void {
    if (this.waveCount >= 3) {
      // All waves cleared — advance
      this.missionManager.completeObjective('obj_1_4');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Counter-attack SURVIVED — COMPLETE');
      this.uiManager.showMessage('EXTRACTION POINT AHEAD — GO!', 3000);

      this.missionPhase = 5;
      this.extractionTimer = 60;
      this.extraction30sWarningPlayed = false;
      this.extraction10sWarningPlayed = false;
      this.uiManager.updateMissionObjective('Reach extraction point — follow the GREEN ARROW');

      // === Create extraction point marker ===
      this.createExtractionMarker();

      // === SCRIPTED EVENT 7: Extraction start ===
      this.triggerEvent7_ExtractionStart();
      return;
    }

    // Wait before spawning next wave
    if (this.waveSpawnActive) {
      this.waveSpawnTimer -= delta;

      if (this.waveSpawnTimer <= 0) {
        this.waveCount++;
        this.waveSpawnActive = false;

        // === DIRECTIONAL WAVE SPAWNING (flanking, never frontal) ===
        // Calculate the player's forward direction on the XZ plane
        const playerPos = this.player.getPosition();
        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        camForward.y = 0;
        camForward.normalize();

        // Compute the player's forward angle in radians (0 = +Z, PI/2 = +X)
        const playerForwardAngle = Math.atan2(camForward.x, camForward.z);

        // Candidate spawn angles: right flank, left flank, rear, rear-right, rear-left
        // These are all at least 90° from the player's facing direction
        const flankAngles = [
          playerForwardAngle + Math.PI / 2,          // Right flank (90°)
          playerForwardAngle - Math.PI / 2,          // Left flank (270° / -90°)
          playerForwardAngle + Math.PI,              // Directly behind (180°)
          playerForwardAngle + (2 * Math.PI) / 3,   // Rear-right (120°)
          playerForwardAngle - (2 * Math.PI) / 3,   // Rear-left (240°)
        ];

        // Pick the best angle for this wave — rotate through flanks then rear
        const angleIndex = (this.waveCount - 1) % flankAngles.length;
        const spawnAngle = flankAngles[angleIndex];

        // Convert angle back to a direction vector for spawnWaveDirectional
        const spawnDirX = Math.sin(spawnAngle);
        const spawnDirZ = Math.cos(spawnAngle);

        // Map computed angle to closest valid direction for EnemyManager
        // EnemyManager only supports 'south', 'west', 'east' — never 'north'
        // (north = behind the player toward the compound boundary; enemies should approach
        // from the open desert flanks, never through the wall)
        const absX = Math.abs(spawnDirX);
        const absZ = Math.abs(spawnDirZ);
        let waveDirection: 'south' | 'west' | 'east';
        if (absZ > absX) {
          // Primarily Z-aligned: south or remap north → east (flank approach)
          waveDirection = spawnDirZ > 0 ? 'south' : 'east';
        } else {
          // Primarily X-aligned
          waveDirection = spawnDirX > 0 ? 'east' : 'west';
        }

        this.enemyManager.spawnWaveDirectional(this.scene, 5, playerPos, waveDirection);

        this.uiManager.addKillFeedEntry(
          `⚠ WAVE ${this.waveCount}/3 INCOMING from the ${waveDirection.toUpperCase()}!`
        );
        this.missionManager.updateObjectiveDescription(
          'obj_1_4',
          `Survive enemy counter-attack (Wave ${this.waveCount}/3)`
        );
        this.uiManager.updateMissionObjective(
          `Survive enemy counter-attack (Wave ${this.waveCount}/3)`
        );

        // Audio alert for wave
        this.audioManager.playAlert();

        // ═══ RADIO CHATTER — Wave start: Command announces reinforcements ═══
        this.uiManager.showRadioSubtitle('Command: Reinforcements inbound!', 3000);

        // === Direction-specific radio chatter ===
        switch (waveDirection) {
          case 'south':
            this.uiManager.showRadioSubtitle('Command: Contact! Enemies approaching from the south!', 4000);
            break;
          case 'west':
            this.uiManager.showRadioSubtitle('Command: Contact! Enemies on the left flank!', 3500);
            break;
          case 'east':
            this.uiManager.showRadioSubtitle('Command: Contact! Enemies on the right flank!', 3500);
            break;
        }

        // === SCRIPTED EVENT 6: Wave announcements ===
        this.triggerEvent6_WaveAnnouncement(this.waveCount);

        console.log(`[GameEngine] Wave ${this.waveCount}/3 spawned from ${waveDirection}`);
      }
    }

    // Check if current wave's enemies are all dead to spawn next wave
    if (!this.waveSpawnActive && this.waveCount < 3) {
      const aliveCount = this.enemyManager.getAliveEnemies().length;
      if (aliveCount <= 2) {
        // Give a brief pause before next wave
        this.waveSpawnActive = true;
        this.waveSpawnTimer = 10; // 10 second gap
      }
    }
  }

  // ──────────────────────────────────────────────
  // PHASE 5: Reach extraction point (z > 115)
  //   - 60 second countdown with warning beeps
  // ──────────────────────────────────────────────

  private checkPhase5_Extraction(delta: number): void {
    const playerPos = this.player.getPosition();

    // Countdown timer
    this.extractionTimer -= delta;

    // ═══ RADIO CHATTER — LZ is hot (one-shot when extraction begins) ═══
    if (!this.extractionLZWarned && this.extractionTimer > 50) {
      this.extractionLZWarned = true;
      this.uiManager.showRadioSubtitle('Command: LZ is hot! Get there fast!', 3500);
      // Falcon — cautious personality — adds situational awareness
      setTimeout(() => {
        this.uiManager.showRadioSubtitle('Falcon: Watch your six on the way back', 3000);
      }, 4000);
    }

    if (this.extractionTimer <= 0) {
      // Time's up — mission failed
      this.uiManager.showMessage('⏰ EXTRACTION FAILED — TIME UP!', 5000);
      this.uiManager.addKillFeedEntry('💀 MISSION FAILED — Extraction window expired');
      this.uiManager.hideCountdownTimer();
      this.audioManager.playAlert();
      this.audioManager.stopAlarmSound();
      this.stop();
      this.onPlayerDeath();
      return;
    }

    // ── DRAMATIC COUNTDOWN BEEPS ──
    // Every 10 seconds: alert beep + radio chatter at key moments
    // Under 10 seconds: beep every second with increasing urgency
    const prev = Math.ceil(this.extractionTimer + delta);
    const curr = Math.ceil(this.extractionTimer);

    // Beep at every 10-second boundary (60, 50, 40, 30, 20, 10)
    const prevMark = Math.floor(prev / 10);
    const currMark = Math.floor(curr / 10);
    if (prevMark !== currMark && curr > 10) {
      this.audioManager.playAlert();

      // Radio chatter at specific milestones
      if (!this.extraction30sWarningPlayed && curr <= 30) {
        this.extraction30sWarningPlayed = true;
        this.uiManager.showRadioSubtitle('Command: 30 seconds!');
      }
    }

    // At exactly 30s still play alert (first time we cross from >30 to <=30)
    if (prev > 30 && curr <= 30 && !this.extraction30sWarningPlayed) {
      this.audioManager.playAlert();
      this.extraction30sWarningPlayed = true;
      this.uiManager.showRadioSubtitle('Command: 30 seconds!');
    }

    // 10 seconds warning — dramatic escalation
    if (prev > 10 && curr <= 10) {
      this.audioManager.playAlert();
      this.audioManager.playAlert(); // Double beep
      if (!this.extraction10sWarningPlayed) {
        this.extraction10sWarningPlayed = true;
        this.uiManager.showRadioSubtitle('Command: 10 seconds! They\'re sending air support!', 3500);
      }
    }

    // Under 10 seconds — beep EVERY second with increasing urgency
    if (curr <= 10 && curr > 0) {
      if (prev !== curr) {
        this.audioManager.playAlert();
        // Double beep under 5 seconds
        if (curr <= 5) {
          this.audioManager.playAlert();
        }
      }
    }

    // === ALL-NEW: At 0 remaining, triple alarm burst ===
    if (prev > 0 && curr <= 0) {
      this.audioManager.playAlert();
      this.audioManager.playAlert();
      this.audioManager.playAlert();
    }

    // Update objective text with timer and distance
    const distToExtraction = playerPos.distanceTo(this.extractionPointPosition);
    if (distToExtraction > 5) {
      this.uiManager.updateMissionObjective(
        `Reach extraction point — ${Math.floor(distToExtraction)}m away (${Math.ceil(this.extractionTimer)}s)`
      );
    } else {
      this.uiManager.updateMissionObjective('EXTRACTION ZONE — Hold to evac');
    }

    // Show countdown timer on screen
    this.uiManager.showCountdownTimer(this.extractionTimer);

    // Critical flash when under 10 seconds
    if (this.extractionTimer <= 10 && this.extractionTimer > 0) {
      if (Math.floor(this.extractionTimer * 2) !== Math.floor((this.extractionTimer + delta) * 2)) {
        this.uiManager.showDamageVignette('red', 100);
      }
    }

    // Check if player reached extraction zone (z > 195 — just past spawn)
    if (playerPos.z > 195) {
      this.missionManager.completeObjective('obj_1_5');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Extraction — COMPLETE');
      this.uiManager.showMessage('🏆 MISSION COMPLETE!', 5000);

      // Remove extraction marker
      this.removeExtractionMarker();
      // Mission complete is triggered by MissionManager.onComplete callback
    }
  }

  // ============================================================
  // KILL TRACKING — Hook into mission phases
  // ============================================================

  private checkMissionKillObjectives(): void {
    if (this.missionPhase === 2 && !this.obj_1_2_completed) {
      this.enemiesKilledInZone++;
      this.uiManager.addKillFeedEntry(
        `🎯 Guards eliminated: ${this.enemiesKilledInZone}/5`
      );
    }

    // ═══ MISSION 2 — MARKET CLEAR OBJECTIVE ═══
    if (this.mission2Phase === 2 && this.currentMissionId === 2) {
      this.mission2MarketEnemiesKilled++;
      this.missionManager.updateObjectiveDescription(
        'obj_2_2',
        `Clear market enemies (${Math.min(this.mission2MarketEnemiesKilled, 8)}/8)`
      );
      this.uiManager.updateMissionObjective(
        `Clear market enemies (${Math.min(this.mission2MarketEnemiesKilled, 8)}/8)`
      );
      this.uiManager.addKillFeedEntry(
        `🎯 Market enemies: ${Math.min(this.mission2MarketEnemiesKilled, 8)}/8`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MISSION 2 — IRON RAIN: Phase Progression System
  // ═══════════════════════════════════════════════════════════════

  /**
   * Called every frame from gameLoop(). Evaluates Mission 2 phases
   * and advances when conditions are met. Only runs when Mission 2
   * is active (currentMissionId === 2).
   */
  private checkMission2Progression(delta: number): void {
    if (this.currentMissionId !== 2) return;

    // Phase transition delay gate
    if (this.phaseTransitionDelay > 0) {
      this.phaseTransitionDelay -= delta;
      return;
    }

    const playerPos = this.player.getPosition();

    switch (this.mission2Phase) {
      case 1:
        this.m2CheckPhase1_Infiltrate(playerPos);
        break;
      case 2:
        this.m2CheckPhase2_ClearMarket(playerPos, delta);
        break;
      case 3:
        this.m2CheckPhase3_SecureRooftop(playerPos, delta);
        break;
      case 4:
        this.m2CheckPhase4_IntelDownload(playerPos, delta);
        break;
      case 5:
        this.m2CheckPhase5_DefendCache(delta);
        break;
      case 6:
        this.m2CheckPhase6_Extract(delta);
        break;
    }
  }

  // ──────────────────────────────────────────────
  // M2 PHASE 1: Infiltrate the eastern district
  //   Triggered by reaching z < 140 (entering the alleys)
  // ──────────────────────────────────────────────

  private m2CheckPhase1_Infiltrate(playerPos: THREE.Vector3): void {
    if (playerPos.z < 140) {
      this.missionManager.completeObjective('obj_2_1');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Infiltrate eastern district — COMPLETE');
      this.uiManager.showMessage('EASTERN DISTRICT INFILTRATED', 2000);

      this.mission2Phase = 2;
      this.phaseTransitionDelay = 2.0;

      this.uiManager.updateMissionObjective('Clear market enemies (0/8)');
      this.uiManager.showRadioSubtitle('Falcon: Eyes on the market. Clear hostiles before pushing deeper.', 3500);
    }
  }

  // ──────────────────────────────────────────────
  // M2 PHASE 2: Clear market enemies (kill 8 in Zone 2)
  //   Kill tracking handled by checkMissionKillObjectives()
  // ──────────────────────────────────────────────

  private m2CheckPhase2_ClearMarket(_playerPos: THREE.Vector3, _delta: number): void {
    if (this.mission2MarketEnemiesKilled >= 8 && !this.mission2Objective7Completed) {
      this.mission2Objective7Completed = true;
      this.missionManager.completeObjective('obj_2_2');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Market cleared — COMPLETE');
      this.uiManager.showMessage('MARKET AREA SECURED', 2000);

      this.mission2Phase = 3;
      this.phaseTransitionDelay = 2.0;

      this.uiManager.updateMissionObjective('Secure the rooftop & reach server — follow the objective marker');
      this.uiManager.showRadioSubtitle('Wolf: Market clear. Pushing to the rooftop. Server should be up there.', 3500);

      // Create objective marker at the server building (center building, z=95)
      this.createM2ObjectiveMarker(new THREE.Vector3(0, 6, 95));
    }
  }

  // ──────────────────────────────────────────────
  // M2 PHASE 3: Secure the rooftop & reach server
  //   Player must reach the server rack on the rooftop (y > 8 near x=0, z=95)
  // ──────────────────────────────────────────────

  private m2CheckPhase3_SecureRooftop(playerPos: THREE.Vector3, _delta: number): void {
    // Check if player is on the rooftop level (y > 8) near the server building
    const isOnRooftop = playerPos.y > 7 && Math.abs(playerPos.x) < 5 && playerPos.z > 90 && playerPos.z < 100;

    if (isOnRooftop && !this.mission2RooftopReached) {
      this.mission2RooftopReached = true;
      this.missionManager.completeObjective('obj_2_3');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Rooftop secured — COMPLETE');
      this.uiManager.showMessage('ROOFTOP SECURED — SERVER LOCATED', 2000);

      this.mission2Phase = 4; // Next: download intel
      this.phaseTransitionDelay = 1.5;

      this.uiManager.updateMissionObjective('Download intel from server — hold [E] (5 seconds)');
      this.uiManager.showRadioSubtitle('Wolf: Found the server. Downloading intel now.', 3000);

      // Remove objective marker
      this.removeM2ObjectiveMarker();
    }
  }

  // ──────────────────────────────────────────────
  // M2 PHASE 4: Download intel from server
  //   Hold E for 5 seconds near the server rack
  // ──────────────────────────────────────────────

  private m2CheckPhase4_IntelDownload(playerPos: THREE.Vector3, delta: number): void {
    // Must be on rooftop near server
    const isNearServer = playerPos.y > 7 && Math.abs(playerPos.x) < 3 && playerPos.z > 92 && playerPos.z < 98;
    const holdingE = this.player.isKeyDown('KeyE');

    if (isNearServer && holdingE) {
      this.mission2IntelDownloading = true;
      this.mission2IntelProgress += delta;

      this.uiManager.showMessage(
        `💻 DOWNLOADING INTEL... ${Math.min(100, Math.floor((this.mission2IntelProgress / 5) * 100))}%`,
        100
      );

      if (this.mission2IntelProgress >= 5) {
        // Download complete!
        this.mission2IntelDownloading = false;
        this.mission2IntelDownloaded = true;
        this.missionManager.completeObjective('obj_2_4');
        this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Intel DOWNLOADED — COMPLETE');
        this.uiManager.showMessage('💾 INTEL DOWNLOADED! Defend the cache!', 3000);
        this.uiManager.triggerScreenShake(5, 200);

        this.mission2Phase = 5;
        this.mission2WaveCount = 0;
        this.mission2WaveSpawnActive = true;
        this.mission2WaveSpawnTimer = 2.0;

        this.uiManager.updateMissionObjective('Defend the cache (Wave 0/3)');
        this.uiManager.showRadioSubtitle('Command: They know we\'re here! Reinforcements inbound — hold that position!', 4000);
      }
    } else if (!holdingE || !isNearServer) {
      if (this.mission2IntelProgress > 0) {
        this.uiManager.showMessage('⚠ Download interrupted!', 1000);
      }
      this.mission2IntelProgress = 0;
      this.mission2IntelDownloading = false;
    }

    // Show prompt when near server
    if (isNearServer && !this.mission2IntelDownloading) {
      this.uiManager.showMessage('Hold [E] to download intel', 100);
    }
  }

  // ──────────────────────────────────────────────
  // M2 PHASE 5 (was 4): Defend the cache (3 waves)
  //   Same wave system as Mission 1 Phase 4
  // ──────────────────────────────────────────────

  private m2CheckPhase5_DefendCache(delta: number): void {
    if (this.mission2WaveCount >= 3) {
      // All waves cleared — advance to extraction
      this.missionManager.completeObjective('obj_2_5');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Cache DEFENDED — COMPLETE');
      this.uiManager.showMessage('CACHE SECURED — EXTRACT NOW!', 3000);

      this.mission2Phase = 6; // Extraction phase
      this.mission2ExtractionTimer = 45;
      this.uiManager.updateMissionObjective('Extract with intel — follow the GREEN ARROW');
      this.uiManager.showRadioSubtitle('Command: Intel secured! Get to extraction — 45 seconds!', 3500);

      this.createM2ExtractionMarker();
      return;
    }

    // Wait before spawning next wave
    if (this.mission2WaveSpawnActive) {
      this.mission2WaveSpawnTimer -= delta;

      if (this.mission2WaveSpawnTimer <= 0) {
        this.mission2WaveCount++;
        this.mission2WaveSpawnActive = false;

        // Directional wave spawning
        const playerPos = this.player.getPosition();
        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        camForward.y = 0;
        camForward.normalize();

        const playerForwardAngle = Math.atan2(camForward.x, camForward.z);

        const flankAngles = [
          playerForwardAngle + Math.PI / 2,
          playerForwardAngle - Math.PI / 2,
          playerForwardAngle + Math.PI,
          playerForwardAngle + (2 * Math.PI) / 3,
          playerForwardAngle - (2 * Math.PI) / 3,
        ];

        const angleIndex = (this.mission2WaveCount - 1) % flankAngles.length;
        const spawnAngle = flankAngles[angleIndex];

        const spawnDirX = Math.sin(spawnAngle);
        const spawnDirZ = Math.cos(spawnAngle);

        const absX = Math.abs(spawnDirX);
        const absZ = Math.abs(spawnDirZ);
        let waveDirection: 'south' | 'west' | 'east';
        if (absZ > absX) {
          waveDirection = spawnDirZ > 0 ? 'south' : 'east';
        } else {
          waveDirection = spawnDirX > 0 ? 'east' : 'west';
        }

        this.enemyManager.spawnWaveDirectional(this.scene, 5, playerPos, waveDirection);

        this.uiManager.addKillFeedEntry(
          `⚠ WAVE ${this.mission2WaveCount}/3 INCOMING from the ${waveDirection.toUpperCase()}!`
        );
        this.missionManager.updateObjectiveDescription(
          'obj_2_5',
          `Defend the cache (Wave ${this.mission2WaveCount}/3)`
        );
        this.uiManager.updateMissionObjective(
          `Defend the cache (Wave ${this.mission2WaveCount}/3)`
        );

        this.audioManager.playAlert();
        this.uiManager.showRadioSubtitle('Command: Reinforcements inbound!', 3000);
      }
    }

    // Check if current wave enemies are dead
    if (!this.mission2WaveSpawnActive && this.mission2WaveCount < 3) {
      const aliveCount = this.enemyManager.getAliveEnemies().length;
      if (aliveCount <= 2) {
        this.mission2WaveSpawnActive = true;
        this.mission2WaveSpawnTimer = 10;
      }
    }
  }

  // ──────────────────────────────────────────────
  // M2 PHASE 6 (was 5): Extract with intel
  //   Reach z > 185 within 45 seconds
  // ──────────────────────────────────────────────

  private m2CheckPhase6_Extract(delta: number): void {
    const playerPos = this.player.getPosition();

    this.mission2ExtractionTimer -= delta;

    // Countdown beeps (same system as Mission 1)
    const curr = Math.ceil(this.mission2ExtractionTimer);
    const prev = Math.ceil(this.mission2ExtractionTimer + delta);

    if (prev > 10 && curr <= 10) {
      this.audioManager.playAlert();
      this.audioManager.playAlert();
      this.uiManager.showRadioSubtitle('Command: 10 seconds! Move it!', 3000);
    }

    if (curr <= 10 && curr > 0 && prev !== curr) {
      this.audioManager.playAlert();
      if (curr <= 5) this.audioManager.playAlert();
    }

    if (prev > 0 && curr <= 0) {
      this.audioManager.playAlert();
      this.uiManager.showMessage('⏰ EXTRACTION FAILED — TIME UP!', 5000);
      this.uiManager.addKillFeedEntry('💀 MISSION FAILED — Extraction window expired');
      this.uiManager.hideCountdownTimer();
      this.audioManager.playAlert();
      this.stop();
      this.onPlayerDeath();
      return;
    }

    // Update objective text
    const distToExtraction = playerPos.distanceTo(this.mission2ExtractionPoint);
    if (distToExtraction > 5) {
      this.uiManager.updateMissionObjective(
        `Extract with intel — ${Math.floor(distToExtraction)}m away (${Math.ceil(this.mission2ExtractionTimer)}s)`
      );
    } else {
      this.uiManager.updateMissionObjective('EXTRACTION ZONE — Hold to evac');
    }

    this.uiManager.showCountdownTimer(this.mission2ExtractionTimer);

    // Critical flash under 10 seconds
    if (this.mission2ExtractionTimer <= 10 && this.mission2ExtractionTimer > 0) {
      if (Math.floor(this.mission2ExtractionTimer * 2) !== Math.floor((this.mission2ExtractionTimer + delta) * 2)) {
        this.uiManager.showDamageVignette('red', 100);
      }
    }

    // Check if player reached extraction
    if (playerPos.z > 185) {
      this.missionManager.completeObjective('obj_2_6');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Extraction — COMPLETE');
      this.uiManager.showMessage('🏆 MISSION COMPLETE!', 5000);
      this.removeM2ExtractionMarker();
      // Mission complete triggers via MissionManager.onComplete callback
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MISSION 2 — OBJECTIVE MARKERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Creates a pulsing objective marker at the given position.
   */
  private createM2ObjectiveMarker(position: THREE.Vector3): void {
    this.removeM2ObjectiveMarker();

    const group = new THREE.Group();

    // Orange pulsing circle on ground
    const circleGeo = new THREE.RingGeometry(1.2, 1.8, 24);
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.05;
    group.add(circle);

    // Floating arrow above
    const arrowGeo = new THREE.ConeGeometry(0.4, 0.8, 4);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.y = 3;
    arrow.rotation.x = Math.PI; // Point down
    group.add(arrow);

    // Glow light
    const light = new THREE.PointLight(0xff8800, 2, 8);
    light.position.y = 2;
    group.add(light);

    group.position.copy(position);
    this.scene.add(group);
    this.mission2MarkerGroup = group;
    this.mission2MarkerPulse = 0;
  }

  private removeM2ObjectiveMarker(): void {
    if (this.mission2MarkerGroup) {
      this.scene.remove(this.mission2MarkerGroup);
      this.mission2MarkerGroup = null;
    }
  }

  /**
   * Creates the green extraction marker.
   */
  private createM2ExtractionMarker(): void {
    this.removeM2ExtractionMarker();

    const group = new THREE.Group();

    const circleGeo = new THREE.RingGeometry(1.5, 2.2, 24);
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.05;
    group.add(circle);

    const arrowGeo = new THREE.ConeGeometry(0.5, 1, 4);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.y = 4;
    arrow.rotation.x = Math.PI;
    group.add(arrow);

    const light = new THREE.PointLight(0x00ff44, 2, 10);
    light.position.y = 2;
    group.add(light);

    group.position.copy(this.mission2ExtractionPoint);
    this.scene.add(group);
    this.mission2ExtractionMarkerGroup = group;
    this.mission2ExtractionMarkerPulse = 0;
  }

  private removeM2ExtractionMarker(): void {
    if (this.mission2ExtractionMarkerGroup) {
      this.scene.remove(this.mission2ExtractionMarkerGroup);
      this.mission2ExtractionMarkerGroup = null;
    }
  }

  /**
   * Updates Mission 2 markers (pulse animation).
   * Called from gameLoop.
   */
  private updateM2Markers(delta: number): void {
    const time = performance.now() * 0.001;

    if (this.mission2MarkerGroup) {
      const arrow = this.mission2MarkerGroup.children[1]; // Floating arrow
      if (arrow) {
        arrow.position.y = 3 + Math.sin(time * 3) * 0.5;
      }
      const circle = this.mission2MarkerGroup.children[0]; // Ground ring
      if (circle instanceof THREE.Mesh && circle.material instanceof THREE.MeshBasicMaterial) {
        circle.material.opacity = 0.5 + Math.sin(time * 4) * 0.3;
      }
    }

    if (this.mission2ExtractionMarkerGroup) {
      const arrow = this.mission2ExtractionMarkerGroup.children[1];
      if (arrow) {
        arrow.position.y = 4 + Math.sin(time * 3) * 0.5;
      }
      const circle = this.mission2ExtractionMarkerGroup.children[0];
      if (circle instanceof THREE.Mesh && circle.material instanceof THREE.MeshBasicMaterial) {
        circle.material.opacity = 0.5 + Math.sin(time * 4) * 0.3;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MISSION 3 — THE NEST: Phase Progression System
  // ═══════════════════════════════════════════════════════════════

  /**
   * Called every frame from gameLoop(). Evaluates Mission 3 phases
   * and advances when conditions are met. Only runs when Mission 3
   * is active (currentMissionId === 3).
   */
  private checkMission3Progression(delta: number): void {
    if (this.currentMissionId !== 3) return;

    // Phase transition delay gate
    if (this.phaseTransitionDelay > 0) {
      this.phaseTransitionDelay -= delta;
      return;
    }

    const playerPos = this.player.getPosition();

    switch (this.mission3Phase) {
      case 1:
        this.m3CheckPhase1_BreachPerimeter(playerPos);
        break;
      case 2:
        this.m3CheckPhase2_EliminateAlpha(playerPos, delta);
        break;
      case 3:
        this.m3CheckPhase3_EliminateBeta(playerPos, delta);
        break;
      case 4:
        this.m3CheckPhase4_EliminateGamma(playerPos, delta);
        break;
      case 5:
        this.m3CheckPhase5_Extract(delta);
        break;
    }
  }

  // ──────────────────────────────────────────────
  // M3 PHASE 1: Breach the outer perimeter
  //   Triggered by reaching z < 170 (entering the bunker)
  // ──────────────────────────────────────────────

  private m3CheckPhase1_BreachPerimeter(playerPos: THREE.Vector3): void {
    if (playerPos.z < 170) {
      this.missionManager.completeObjective('obj_3_1');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Outer perimeter BREACHED — COMPLETE');
      this.uiManager.showMessage('PERIMETER BREACHED', 2000);

      this.mission3Phase = 2;
      this.phaseTransitionDelay = 2.0;

      this.uiManager.updateMissionObjective('Eliminate Commander Alpha — follow the marker');
      this.uiManager.showRadioSubtitle('Command: Bunker breached! Intelligence confirms Commander Alpha is in the first chamber. Take him out.', 4000);

      // Create objective marker at Alpha's position (center of Chamber Alpha)
      this.createM3CommanderMarker(new THREE.Vector3(0, 0, 120));
    }
  }

  // ──────────────────────────────────────────────
  // M3 PHASE 2: Eliminate Commander Alpha
  //   Commander Alpha is the enemy tagged 'M3_ALPHA' at z=120
  // ──────────────────────────────────────────────

  private m3CheckPhase2_EliminateAlpha(_playerPos: THREE.Vector3, _delta: number): void {
    if (this.mission3CommanderAlphaKilled) return;

    // Check if Commander Alpha is dead
    const alphaEnemy = this.enemyManager.getEnemies().find(e => e.tag === 'M3_ALPHA');
    if (alphaEnemy && alphaEnemy.state === 'dead') {
      this.mission3CommanderAlphaKilled = true;
      this.missionManager.completeObjective('obj_3_2');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Commander Alpha ELIMINATED — COMPLETE');
      this.uiManager.showMessage('⭐ COMMANDER ALPHA ELIMINATED', 3000);
      this.uiManager.triggerScreenShake(8, 300);
      this.uiManager.showRadioSubtitle('Wolf: Alpha is down. Nice shot.', 3000);

      // Open reinforced door to Beta's chamber
      this.mission3DoorOpenAlpha = true;
      const doorAlpha = this.mission3Group.getObjectByName('door-alpha') as THREE.Mesh;
      if (doorAlpha) {
        doorAlpha.visible = false;
        // Remove from colliders
        const idx = this.colliders.indexOf(doorAlpha);
        if (idx >= 0) this.colliders.splice(idx, 1);
      }

      // Remove Alpha marker
      this.removeM3CommanderMarker();

      this.mission3Phase = 3;
      this.phaseTransitionDelay = 2.5;

      this.uiManager.updateMissionObjective('Eliminate Commander Beta — door unlocked, follow the marker');
      this.uiManager.showRadioSubtitle('Falcon: Door to the second chamber is open. Commander Beta is in there — heavily guarded.', 4000);

      // Create marker at Beta's position
      this.createM3CommanderMarker(new THREE.Vector3(0, 0, 80));
    }
  }

  // ──────────────────────────────────────────────
  // M3 PHASE 3: Eliminate Commander Beta
  //   Commander Beta is the enemy tagged 'M3_BETA' at z=80
  // ──────────────────────────────────────────────

  private m3CheckPhase3_EliminateBeta(_playerPos: THREE.Vector3, _delta: number): void {
    if (this.mission3CommanderBetaKilled) return;

    const betaEnemy = this.enemyManager.getEnemies().find(e => e.tag === 'M3_BETA');
    if (betaEnemy && betaEnemy.state === 'dead') {
      this.mission3CommanderBetaKilled = true;
      this.missionManager.completeObjective('obj_3_3');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Commander Beta ELIMINATED — COMPLETE');
      this.uiManager.showMessage('⭐ COMMANDER BETA ELIMINATED', 3000);
      this.uiManager.triggerScreenShake(8, 300);
      this.uiManager.showRadioSubtitle('Falcon: Beta is eliminated. One more to go. Commander Gamma is the deepest in — proceed to the final chamber.', 4000);

      // Open reinforced door to Gamma's chamber
      this.mission3DoorOpenBeta = true;
      const doorBeta = this.mission3Group.getObjectByName('door-beta') as THREE.Mesh;
      if (doorBeta) {
        doorBeta.visible = false;
        const idx = this.colliders.indexOf(doorBeta);
        if (idx >= 0) this.colliders.splice(idx, 1);
      }

      // Remove Beta marker
      this.removeM3CommanderMarker();

      this.mission3Phase = 4;
      this.phaseTransitionDelay = 2.5;

      this.uiManager.updateMissionObjective('Eliminate Commander Gamma — final target, follow the marker');
      this.uiManager.showRadioSubtitle('Command: Gamma is the last one. He\'s responsible for the school bombing. End this.', 4000);

      // Create marker at Gamma's position
      this.createM3CommanderMarker(new THREE.Vector3(0, 0, 40));
    }
  }

  // ──────────────────────────────────────────────
  // M3 PHASE 4: Eliminate Commander Gamma
  //   Commander Gamma is the enemy tagged 'M3_GAMMA' at z=40
  // ──────────────────────────────────────────────

  private m3CheckPhase4_EliminateGamma(_playerPos: THREE.Vector3, _delta: number): void {
    if (this.mission3CommanderGammaKilled) return;

    const gammaEnemy = this.enemyManager.getEnemies().find(e => e.tag === 'M3_GAMMA');
    if (gammaEnemy && gammaEnemy.state === 'dead') {
      this.mission3CommanderGammaKilled = true;
      this.missionManager.completeObjective('obj_3_4');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Commander Gamma ELIMINATED — COMPLETE');
      this.uiManager.showMessage('⭐ COMMANDER GAMMA ELIMINATED', 3000);
      this.uiManager.triggerScreenShake(10, 400);
      this.uiManager.showRadioSubtitle('Wolf: Gamma is down. All targets eliminated.', 3000);

      // Remove Gamma marker
      this.removeM3CommanderMarker();

      this.mission3Phase = 5;
      this.mission3ExtractionTimer = 60;
      this.mission3ExtractionActive = true;
      this.mission3CollapseWarningPlayed = false;

      this.uiManager.updateMissionObjective('Extract before bunker collapse — follow the GREEN ARROW');
      this.uiManager.showRadioSubtitle('Command: TARGETS DOWN! But they\'ve triggered the bunker\'s self-destruct! Get out of there — 60 seconds!', 4500);

      // Create extraction marker at spawn area
      this.createM3ExtractionMarker();

      // Start alarm
      this.audioManager.playAlarmSound();
    }
  }

  // ──────────────────────────────────────────────
  // M3 PHASE 5: Extract before bunker collapse
  //   60 second timer — player must reach z > 185
  // ──────────────────────────────────────────────

  private m3CheckPhase5_Extract(delta: number): void {
    if (!this.mission3ExtractionActive) return;

    const playerPos = this.player.getPosition();

    this.mission3ExtractionTimer -= delta;

    // Countdown beeps
    const curr = Math.ceil(this.mission3ExtractionTimer);
    const prev = Math.ceil(this.mission3ExtractionTimer + delta);

    if (prev > 30 && curr <= 30 && !this.mission3CollapseWarningPlayed) {
      this.mission3CollapseWarningPlayed = true;
      this.audioManager.playAlert();
      this.uiManager.showRadioSubtitle('Command: 30 seconds! The structure is collapsing!', 3000);
    }

    if (prev > 10 && curr <= 10) {
      this.audioManager.playAlert();
      this.audioManager.playAlert();
      this.uiManager.showRadioSubtitle('Command: 10 seconds! Move it!', 3000);
    }

    if (curr <= 10 && curr > 0 && prev !== curr) {
      this.audioManager.playAlert();
      if (curr <= 5) this.audioManager.playAlert();
    }

    if (prev > 0 && curr <= 0) {
      this.audioManager.playAlert();
      this.uiManager.showMessage('⏰ BUNKER COLLAPSED — MISSION FAILED!', 5000);
      this.uiManager.addKillFeedEntry('💀 MISSION FAILED — Bunker collapsed');
      this.uiManager.hideCountdownTimer();
      this.audioManager.stopAlarmSound();
      this.stop();
      this.onPlayerDeath();
      return;
    }

    // Update objective text
    const distToExtraction = playerPos.distanceTo(this.mission3ExtractionPoint);
    if (distToExtraction > 5) {
      this.uiManager.updateMissionObjective(
        `Extract before bunker collapse — ${Math.floor(distToExtraction)}m away (${Math.ceil(this.mission3ExtractionTimer)}s)`
      );
    } else {
      this.uiManager.updateMissionObjective('EXTRACTION ZONE — Get to safety!');
    }

    this.uiManager.showCountdownTimer(this.mission3ExtractionTimer);

    // Critical flash under 10 seconds
    if (this.mission3ExtractionTimer <= 10 && this.mission3ExtractionTimer > 0) {
      if (Math.floor(this.mission3ExtractionTimer * 2) !== Math.floor((this.mission3ExtractionTimer + delta) * 2)) {
        this.uiManager.showDamageVignette('red', 100);
      }
    }

    // Update extraction marker
    this.updateM3ExtractionMarker(delta);

    // Check if player reached extraction zone (z > 185 — near spawn)
    if (playerPos.z > 185) {
      this.mission3ExtractionActive = false;
      this.missionManager.completeObjective('obj_3_5');
      this.uiManager.addKillFeedEntry('✅ OBJECTIVE: Extraction — COMPLETE');
      this.uiManager.showMessage('🏆 MISSION COMPLETE — THE NEST', 5000);
      this.removeM3ExtractionMarker();
      this.audioManager.stopAlarmSound();
      this.uiManager.hideCountdownTimer();
      // Mission complete triggers via MissionManager.onComplete callback
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MISSION 3 — OBJECTIVE MARKERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Creates a pulsing commander objective marker at the given position.
   * Orange diamond with floating arrow — points to the current commander target.
   */
  private createM3CommanderMarker(position: THREE.Vector3): void {
    this.removeM3CommanderMarker();

    const group = new THREE.Group();

    // Orange pulsing circle on ground
    const circleGeo = new THREE.RingGeometry(1.2, 1.8, 24);
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.05;
    group.add(circle);

    // Floating diamond above (target indicator)
    const diamondGeo = new THREE.OctahedronGeometry(0.5, 0);
    const diamondMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.y = 4;
    diamond.name = 'm3-commander-diamond';
    group.add(diamond);

    // Glow light
    const light = new THREE.PointLight(0xff4444, 2, 10);
    light.position.y = 2;
    group.add(light);

    group.position.copy(position);
    group.name = 'm3-commander-marker';
    this.scene.add(group);
    this.mission3CommanderMarkerGroup = group;
    this.mission3CommanderMarkerPulse = 0;
  }

  /**
   * Removes the commander marker from the scene.
   */
  private removeM3CommanderMarker(): void {
    if (this.mission3CommanderMarkerGroup) {
      this.scene.remove(this.mission3CommanderMarkerGroup);
      this.mission3CommanderMarkerGroup = null;
    }
  }

  /**
   * Creates the green extraction marker at the extraction point.
   */
  private createM3ExtractionMarker(): void {
    this.removeM3ExtractionMarker();

    const group = new THREE.Group();
    const extPos = this.mission3ExtractionPoint;

    // Green pulsing circle on ground
    const circleGeo = new THREE.RingGeometry(1.5, 2.2, 24);
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.05;
    group.add(circle);

    // Inner circle
    const innerGeo = new THREE.CircleGeometry(1.2, 24);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.06;
    group.add(inner);

    // Vertical light column
    const columnGeo = new THREE.CylinderGeometry(0.05, 0.3, 8, 8);
    const columnMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.3,
    });
    const column = new THREE.Mesh(columnGeo, columnMat);
    column.position.y = 4;
    column.name = 'm3-ext-column';
    group.add(column);

    // Floating arrow
    const arrowGroup = new THREE.Group();
    const arrowGeo = new THREE.ConeGeometry(0.5, 1, 4);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = Math.PI;
    arrowGroup.add(arrow);
    arrowGroup.position.y = 10;
    arrowGroup.name = 'm3-ext-arrow';
    group.add(arrowGroup);

    // Glow light
    const light = new THREE.PointLight(0x00ff44, 2.5, 12);
    light.position.y = 2;
    group.add(light);

    group.position.copy(extPos);
    this.scene.add(group);
    this.mission3ExtractionMarkerGroup = group;
    this.mission3ExtractionMarkerPulse = 0;
  }

  /**
   * Updates Mission 3 extraction marker animation.
   * Pulsing green beacon + countdown urgency.
   */
  private updateM3ExtractionMarker(delta: number): void {
    if (!this.mission3ExtractionMarkerGroup) return;

    this.mission3ExtractionMarkerPulse += delta * 2.5;
    const time = performance.now() * 0.001;

    // Arrow bob
    const arrow = this.mission3ExtractionMarkerGroup.getObjectByName('m3-ext-arrow');
    if (arrow) {
      arrow.position.y = 10 + Math.sin(time * 3) * 0.6;
    }

    // Column pulse
    const column = this.mission3ExtractionMarkerGroup.getObjectByName('m3-ext-column');
    if (column instanceof THREE.Mesh && column.material instanceof THREE.MeshBasicMaterial) {
      column.material.opacity = 0.2 + Math.sin(time * 2) * 0.15;
    }

    // Ground circle pulse
    const circle = this.mission3ExtractionMarkerGroup.children[0];
    if (circle instanceof THREE.Mesh && circle.material instanceof THREE.MeshBasicMaterial) {
      circle.material.opacity = 0.5 + Math.sin(time * 3) * 0.3;
      const scale = 1.0 + Math.sin(time * 2) * 0.12;
      circle.scale.set(scale, scale, scale);
    }
  }

  /**
   * Removes the extraction marker from the scene.
   */
  private removeM3ExtractionMarker(): void {
    if (this.mission3ExtractionMarkerGroup) {
      this.scene.remove(this.mission3ExtractionMarkerGroup);
      this.mission3ExtractionMarkerGroup = null;
    }
  }

  /**
   * Updates Mission 3 marker animations (pulse, bob).
   * Called from gameLoop.
   */
  private updateM3Markers(delta: number): void {
    const time = performance.now() * 0.001;

    // Commander marker animation
    if (this.mission3CommanderMarkerGroup) {
      const diamond = this.mission3CommanderMarkerGroup.getObjectByName('m3-commander-diamond');
      if (diamond) {
        diamond.position.y = 4 + Math.sin(time * 3) * 0.5;
        diamond.rotation.y = time * 2;
      }
      const circle = this.mission3CommanderMarkerGroup.children[0];
      if (circle instanceof THREE.Mesh && circle.material instanceof THREE.MeshBasicMaterial) {
        circle.material.opacity = 0.5 + Math.sin(time * 4) * 0.3;
      }
    }

    // Extraction marker animation
    if (this.mission3ExtractionMarkerGroup) {
      const arrow = this.mission3ExtractionMarkerGroup.getObjectByName('m3-ext-arrow');
      if (arrow) {
        arrow.position.y = 10 + Math.sin(time * 3) * 0.6;
      }
      const column = this.mission3ExtractionMarkerGroup.getObjectByName('m3-ext-column');
      if (column instanceof THREE.Mesh && column.material instanceof THREE.MeshBasicMaterial) {
        column.material.opacity = 0.2 + Math.sin(time * 2) * 0.15;
      }
      const circle = this.mission3ExtractionMarkerGroup.children[0];
      if (circle instanceof THREE.Mesh && circle.material instanceof THREE.MeshBasicMaterial) {
        circle.material.opacity = 0.5 + Math.sin(time * 3) * 0.3;
      }
    }
  }

  // ============================================================
  // MISSION COMPLETION
  // ============================================================

  private onMissionComplete(mission: { title: string; subtitle: string }): void {
    console.log(`[GameEngine] 🎉 MISSION COMPLETE: ${mission.title} — ${mission.subtitle}`);
    this.uiManager.addKillFeedEntry(`🏆 MISSION COMPLETE: ${mission.title}!`);

    // === SCRIPTED EVENT 8: Mission complete ===
    this.triggerEvent8_MissionComplete(mission.title, mission.subtitle);

    // Stop alarm siren if still playing
    this.audioManager.stopAlarmSound();

    // Hide countdown timer
    this.uiManager.hideCountdownTimer();

    // ── Calculate mission stats ──
    const missionElapsedMs = performance.now() - this.missionStartTime;
    const missionMinutes = Math.floor(missionElapsedMs / 60000);
    const missionSeconds = Math.floor((missionElapsedMs % 60000) / 1000);
    const timeString = `${missionMinutes}:${String(missionSeconds).padStart(2, '0')}`;

    // Stealth rating: based on stealth kills vs total kills and alert triggers
    let stealthRating = 'SILVER';
    let stealthColor = '#C0C0C0';
    const stealthRatio = this.totalKillCount > 0 ? this.stealthKillCount / this.totalKillCount : 0;
    if (this.alertTriggerCount === 0 && stealthRatio > 0.5) {
      stealthRating = 'GOLD ★';
      stealthColor = '#FFD700';
    } else if (this.alertTriggerCount <= 1 && stealthRatio > 0.3) {
      stealthRating = 'SILVER';
      stealthColor = '#C0C0C0';
    } else if (this.alertTriggerCount <= 3) {
      stealthRating = 'BRONZE';
      stealthColor = '#CD7F32';
    } else {
      stealthRating = 'COMBAT';
      stealthColor = '#FF4444';
    }

    const missionCompleteEl = document.getElementById('mission-complete');
    if (missionCompleteEl) {
      missionCompleteEl.style.display = 'flex';
      missionCompleteEl.innerHTML = this.buildMissionCompleteHTML(mission.title, mission.subtitle, timeString, stealthRating, stealthColor);
    } else {
      const overlay = document.createElement('div');
      overlay.id = 'mission-complete';
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.8); z-index: 1000; pointer-events: none;
        animation: fadeIn 0.5s ease-in;
      `;
      overlay.innerHTML = this.buildMissionCompleteHTML(mission.title, mission.subtitle, timeString, stealthRating, stealthColor);
      document.body.appendChild(overlay);
      setTimeout(() => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 1s ease-out';
        setTimeout(() => overlay.remove(), 1000);
      }, 8000);
    }
  }

  /**
   * Builds the HTML for the mission complete stats overlay.
   */
  private buildMissionCompleteHTML(
    title: string, subtitle: string,
    timeString: string, stealthRating: string, stealthColor: string
  ): string {
    return `
      <div style="text-align:center;">
        <div style="font-size:52px; color:#ffd700; font-weight:bold; text-shadow:0 0 30px #ffd700, 0 0 60px #ff8c00; letter-spacing:4px; margin-bottom:8px;">
          🏆 MISSION COMPLETE
        </div>
        <div style="font-size:28px; color:#ffffff; font-weight:600; margin-bottom:4px;">
          ${title}
        </div>
        <div style="font-size:18px; color:#aaaaaa; margin-bottom:36px;">
          ${subtitle}
        </div>

        <div style="display:inline-flex; gap:40px; margin-bottom:36px;">
          <div style="text-align:center; min-width:120px;">
            <div style="font-size:14px; color:#888; text-transform:uppercase; letter-spacing:2px; margin-bottom:6px;">Total Kills</div>
            <div style="font-size:42px; color:#ff4444; font-weight:bold; text-shadow:0 0 12px #ff4444;">${this.totalKillCount}</div>
          </div>
          <div style="text-align:center; min-width:120px;">
            <div style="font-size:14px; color:#888; text-transform:uppercase; letter-spacing:2px; margin-bottom:6px;">Stealth Kills</div>
            <div style="font-size:42px; color:#00ccff; font-weight:bold; text-shadow:0 0 12px #00ccff;">${this.stealthKillCount}</div>
          </div>
          <div style="text-align:center; min-width:120px;">
            <div style="font-size:14px; color:#888; text-transform:uppercase; letter-spacing:2px; margin-bottom:6px;">Mission Time</div>
            <div style="font-size:42px; color:#ffffff; font-weight:bold;">${timeString}</div>
          </div>
          <div style="text-align:center; min-width:120px;">
            <div style="font-size:14px; color:#888; text-transform:uppercase; letter-spacing:2px; margin-bottom:6px;">Score</div>
            <div style="font-size:42px; color:#ffd700; font-weight:bold; text-shadow:0 0 12px #ffd700;">${this.score}</div>
          </div>
        </div>

        <div style="display:inline-block; padding:12px 36px; border:2px solid ${stealthColor}; border-radius:8px; background:rgba(0,0,0,0.5);">
          <div style="font-size:14px; color:#888; text-transform:uppercase; letter-spacing:3px; margin-bottom:4px;">Stealth Rating</div>
          <div style="font-size:36px; color:${stealthColor}; font-weight:bold; text-shadow:0 0 16px ${stealthColor};">${stealthRating}</div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // MISSION 1 — SCRIPTED EVENT TRIGGERS
  // ============================================================

  /**
   * EVENT 1 — Pre-mission briefing + squad conversation
   * Shown on screen before gameplay starts.
   * Uses subtitle queue for sequential display.
   */
  private triggerEvent1_PreBriefing(): void {
    if (this.eventFlags['pre_briefing']) return;
    this.eventFlags['pre_briefing'] = true;

    // ── PHASE 1 RADIO SEQUENCE ──
    // Spec: 4 sequential radio messages during infiltration
    //   1. Command: Wolf, Falcon. Protocol 313 is a go. Infiltrate Sector 313.  (4s)
    //   2. Command: The target is the border radar. Plant C4 and get out.       (3.5s)
    //   3. Wolf: Copy that, Command. Moving to position.                        (2.5s)
    //   4. Falcon: I have eyes on the compound. Deploying recon.               (3s)
    // Start after a 1-second cinematic pause so the player can orient.
    // The subtitle queue processes items sequentially with a built-in gap.

    // Clear any stale subtitles from a previous attempt
    this.uiManager.clearSubtitleQueue();

    setTimeout(() => {
      this.uiManager.showRadioSubtitle('Command: Wolf, Falcon. Protocol 313 is a go. Infiltrate Sector 313.', 4000);
      this.uiManager.showRadioSubtitle('Command: The target is the border radar. Plant C4 and get out.', 3500);
      this.uiManager.showRadioSubtitle('Wolf: Copy that, Command. Moving to position.', 2500);
      this.uiManager.showRadioSubtitle('Falcon: I have eyes on the compound. Deploying recon.', 3000);
    }, 1000); // 1s opening pause before first line
  }

  /**
   * Checks proximity to enemies during Phase 1 to trigger
   * the stealth kill tutorial (Event 2).
   */
  private checkStealthTutorialProximity(): void {
    if (this.eventFlags['stealth_tutorial']) return;
    if (this.missionPhase > 2) return; // Too late for tutorial

    const playerPos = this.player.getPosition();
    const aliveEnemies = this.enemyManager.getEnemies().filter(e => e.state !== 'dead');

    for (const enemy of aliveEnemies) {
      const dist = playerPos.distanceTo(enemy.group.position);
      if (dist < 12) {
        this.triggerEvent2_StealthTutorial();
        return;
      }
    }
  }

  /**
   * EVENT 2 — First contact
   * When player approaches the first enemy.
   * Falcon warns Wolf about contacts ahead.
   */
  private triggerEvent2_StealthTutorial(): void {
    if (this.eventFlags['stealth_tutorial']) return;
    this.eventFlags['stealth_tutorial'] = true;

    this.uiManager.showRadioSubtitle('Falcon: Wolf, you\'ve got contacts ahead. Take them out silently.', 3500);
    this.uiManager.showPrompt('Approach from behind + F for silent kill');

    // Auto-hide prompt after 10 seconds
    setTimeout(() => this.uiManager.hidePrompt(), 10000);
  }

  /**
   * EVENT 3 — Zone 2 entry
   * Triggered at Phase 2 start (perimeter reached).
   * Falcon spots more hostiles in the compound.
   */
  private triggerEvent3_FalconPosition(): void {
    if (this.eventFlags['falcon_position']) return;
    this.eventFlags['falcon_position'] = true;

    this.uiManager.showRadioSubtitle('Falcon: I\'m seeing more hostiles in the compound. Stay sharp.', 3500);
  }

  /**
   * EVENT 4 — Alarm trigger
   * Triggered when C4 is planted (Phase 3 → Phase 4).
   */
  private triggerEvent4_AlarmTrigger(): void {
    if (this.eventFlags['alarm_trigger']) return;
    this.eventFlags['alarm_trigger'] = true;

    // Alarm dialogue — enemy and Command reaction
    this.uiManager.showRadioSubtitle('ALARM! All units to battle stations!', 3000);
    this.uiManager.showRadioSubtitle('Command: They know you\'re there! Brace for contact!', 3000);

    // Show alarm subtitle overlay
    this.uiManager.showMessage('ALARM! All units to battle stations!', 3000);

    // Play alternating siren alarm
    this.audioManager.playAlarmSound();

    // ── 1-second screen flash red with 3 rapid pulses for dramatic alarm feel ──
    this.uiManager.flashScreenRed(1000);
    setTimeout(() => this.uiManager.flashScreenRed(300), 200);
    setTimeout(() => this.uiManager.flashScreenRed(200), 500);

    // Heavy screen shake for C4 detonation feel
    this.uiManager.triggerScreenShake(10, 600);
  }

  /**
   * EVENT 5 — Summon unlock
   * Triggered at start of Phase 4 (after alarm).
   */
  private triggerEvent5_SummonUnlock(): void {
    if (this.eventFlags['summon_unlock']) return;
    this.eventFlags['summon_unlock'] = true;

    this.uiManager.showRadioSubtitle('Command: Swarm Radio is online! Call the angels!');

    // Show summon tutorial prompt
    this.uiManager.showPrompt('Press 1 for Drone Swarm | 2 for Kamikaze | 3 for Recon');

    // Auto-hide prompt after 12 seconds (longer for tutorial)
    setTimeout(() => this.uiManager.hidePrompt(), 12000);
  }

  /**
   * EVENT 6 — Wave announcements
   * Radio chatter for each enemy wave in Phase 4.
   */
  private triggerEvent6_WaveAnnouncement(waveNumber: number): void {
    const waveFlag = `wave_${waveNumber}` as string;
    if (this.eventFlags[waveFlag]) return;
    this.eventFlags[waveFlag] = true;

    switch (waveNumber) {
      case 1:
        this.uiManager.showRadioSubtitle('Command: Contact front! Multiple tangos approaching from the south!', 4000);
        break;
      case 2:
        this.uiManager.showRadioSubtitle('Command: Reinforcements from the west! Hold your position!', 3500);
        break;
      case 3:
        this.uiManager.showRadioSubtitle('Command: Final wave! Give them everything you\'ve got!', 3500);
        // Hide stealth prompt if still showing during final wave
        this.uiManager.hidePrompt();
        break;
    }
  }

  /**
   * EVENT 7 — Extraction start
   * Triggered when Phase 5 begins.
   */
  private triggerEvent7_ExtractionStart(): void {
    if (this.eventFlags['extraction_start']) return;
    this.eventFlags['extraction_start'] = true;

    this.uiManager.showRadioSubtitle('Command: Extraction inbound! Get to the LZ!');

    // Hide summon prompt
    this.uiManager.hidePrompt();
  }

  /**
   * EVENT 8 — Mission complete
   * Triggered when all objectives are complete.
   */
  private triggerEvent8_MissionComplete(title: string, subtitle: string): void {
    if (this.eventFlags['mission_complete']) return;
    this.eventFlags['mission_complete'] = true;

    // Show radio subtitle
    this.uiManager.showRadioSubtitle('Command: Protocol 313 is a success. The storm has begun.', 6000);

    // Show mission complete overlay with score
    this.uiManager.showMissionCompleteOverlay(title, subtitle, this.score);

    // Hide countdown timer
    this.uiManager.hideCountdownTimer();

    // Hide any remaining prompt
    this.uiManager.hidePrompt();
  }

  /**
   * Resets all event flags for respawn/restart.
   */
  private resetEventFlags(): void {
    for (const key of Object.keys(this.eventFlags)) {
      this.eventFlags[key] = false;
    }
    this.extraction30sWarningPlayed = false;
    this.extraction10sWarningPlayed = false;

    // Stop alarm if still playing
    this.audioManager.stopAlarmSound();

    // Clean up UI elements
    this.uiManager.hidePrompt();
    this.uiManager.hideCountdownTimer();
  }

  // ============================================================
  // MISSION 2 — IRON RAIN: Scripted Events
  // ============================================================

  /**
   * EVENT M2-1 — Pre-mission briefing (Mission 2)
   * Called when Mission 2 starts.
   */
  private triggerM2Event1_Briefing(): void {
    this.uiManager.clearSubtitleQueue();

    setTimeout(() => {
      this.uiManager.showRadioSubtitle('Command: Wolf, Falcon. Intel shows a weapons cache in the eastern district.', 4000);
      this.uiManager.showRadioSubtitle('Command: We need to clear it before dawn.', 3000);
      this.uiManager.showRadioSubtitle('Wolf: Copy. Moving to position.', 2500);
      this.uiManager.showRadioSubtitle('Falcon: I have visual on the district. Alleyways to the north.', 3000);
    }, 1000);
  }

  /**
   * EVENT M2-2 — First kill in Mission 2
   * Called when the player gets their first kill during Mission 2.
   */
  private triggerM2Event2_FirstKill(): void {
    if (this.eventFlags['m2_first_kill']) return;
    this.eventFlags['m2_first_kill'] = true;

    this.uiManager.showRadioSubtitle('Wolf: First contact. Moving deeper.', 2500);
  }

  /**
   * EVENT M2-3 — Market entry (Phase 2 start)
   * When player enters the market area.
   */
  private triggerM2Event3_MarketEntry(): void {
    if (this.eventFlags['m2_market_entry']) return;
    this.eventFlags['m2_market_entry'] = true;

    this.uiManager.showRadioSubtitle('Falcon: Market ahead. Multiple contacts — stay sharp.', 3000);
  }

  /**
   * EVENT M2-4 — Rooftop approach (Phase 3 start)
   * When player nears the stairway buildings.
   */
  private triggerM2Event4_RooftopApproach(): void {
    if (this.eventFlags['m2_rooftop_approach']) return;
    this.eventFlags['m2_rooftop_approach'] = true;

    this.uiManager.showRadioSubtitle('Wolf: Server building spotted. Finding a way up.', 3000);
  }

  /**
   * EVENT M2-5 — Intel download started
   * When player begins downloading from the server.
   */
  private triggerM2Event5_IntelStarted(): void {
    if (this.eventFlags['m2_intel_started']) return;
    this.eventFlags['m2_intel_started'] = true;

    this.uiManager.showRadioSubtitle('Falcon: Download initiated. Hold position.', 2500);
  }

  /**
   * EVENT M2-6 — Intel download complete
   * When download finishes.
   */
  private triggerM2Event6_IntelComplete(): void {
    if (this.eventFlags['m2_intel_complete']) return;
    this.eventFlags['m2_intel_complete'] = true;

    this.uiManager.showRadioSubtitle('Wolf: Intel secured. They won\'t like this.', 3000);
  }

  /**
   * EVENT M2-7 — Wave defense start
   * When the first wave begins.
   */
  private triggerM2Event7_WaveStart(): void {
    if (this.eventFlags['m2_wave_start']) return;
    this.eventFlags['m2_wave_start'] = true;

    this.uiManager.showRadioSubtitle('Command: Enemy reinforcements inbound! Prepare for contact!', 3500);
  }

  /**
   * EVENT M2-8 — Extraction start
   * When extraction phase begins.
   */
  private triggerM2Event8_ExtractionStart(): void {
    if (this.eventFlags['m2_extraction_start']) return;
    this.eventFlags['m2_extraction_start'] = true;

    this.uiManager.showRadioSubtitle('Command: Intel secured! Get to extraction NOW!', 3000);
    setTimeout(() => {
      this.uiManager.showRadioSubtitle('Falcon: LZ is 45 seconds out. Move!', 3000);
    }, 3500);
  }

  // ============================================================
  // RADIO CHATTER — AMBIENT COMBAT & STEALTH OBSERVATIONS
  // ============================================================

  /**
   * Ambient battlefield radio chatter — fires every 30 seconds during combat phases.
   * Creates the feeling of a living military operation beyond the player's sight.
   * Uses Command's authoritative voice for strategic updates.
   */
  private updateAmbientRadioChatter(elapsedMs: number): void {
    if (!this.isRunning || this.isPaused) return;
    if (this.missionPhase < 2) return; // No ambient chatter during infiltration

    if (elapsedMs - this.lastAmbientRadioTime > this.AMBIENT_RADIO_INTERVAL) {
      this.lastAmbientRadioTime = elapsedMs;

      // Phase-specific ambient chatter
      if (this.missionPhase === 2) {
        const ambientPhase2 = [
          'Command: All units, maintain pressure',
          'Command: Sweep and clear, team by team',
          'Command: Keep those angles tight',
        ];
        const line = ambientPhase2[Math.floor(Math.random() * ambientPhase2.length)];
        this.uiManager.showRadioSubtitle(line, 3500);
      } else if (this.missionPhase === 3) {
        const ambientPhase3 = [
          'Command: All units, maintain pressure',
          'Command: Watch the perimeter — they\'ll try to flank',
          'Falcon: I\'ve got overwatch. Move when ready',
        ];
        const line = ambientPhase3[Math.floor(Math.random() * ambientPhase3.length)];
        this.uiManager.showRadioSubtitle(line, 3500);
      } else if (this.missionPhase === 4) {
        const ambientPhase4 = [
          'Command: All units, maintain pressure',
          'Command: Hold the line! No retreat!',
          'Command: Reinforcements are spread thin — hold on',
          'Falcon: I\'m tracking movement on the flanks',
        ];
        const line = ambientPhase4[Math.floor(Math.random() * ambientPhase4.length)];
        this.uiManager.showRadioSubtitle(line, 3500);
      } else if (this.missionPhase === 5) {
        const ambientPhase5 = [
          'Command: Get to the LZ now!',
          'Command: Chopper\'s burning fuel — move it!',
          'Falcon: Extraction window is closing',
        ];
        const line = ambientPhase5[Math.floor(Math.random() * ambientPhase5.length)];
        this.uiManager.showRadioSubtitle(line, 3000);
      }
    }
  }

  /**
   * Stealth observation chatter — Falcon reports when the player is undetected.
   * Fires periodically during stealth phases (before alarm).
   * Falcon's cautious personality: watches, reports, worries.
   */
  private updateStealthRadioChatter(elapsedMs: number): void {
    if (!this.isRunning || this.isPaused) return;
    if (this.missionPhase > 2) return; // Only during stealth phases
    if (elapsedMs - this.lastStealthRadioTime < this.STEALTH_RADIO_INTERVAL) return;

    const detectionProgress = this.stealthSystem.getDetectionProgress();
    if (detectionProgress < 20) {
      // Player is well-hidden — Falcon observes
      this.lastStealthRadioTime = elapsedMs;
      const stealthLines = [
        'Falcon: No visual on hostiles',
        'Falcon: You\'re clear — keep moving',
        'Falcon: They haven\'t spotted you. Stay low',
        'Falcon: Eyes clear. Good positioning',
      ];
      const line = stealthLines[Math.floor(Math.random() * stealthLines.length)];
      this.uiManager.showRadioSubtitle(line, 3000);
    } else if (detectionProgress >= 20 && detectionProgress < 50) {
      // Player is partially detected — Falcon warns
      this.lastStealthRadioTime = elapsedMs;
      const warnLines = [
        'Falcon: Be careful — they\'re getting suspicious',
        'Falcon: Ease up. You\'re drawing attention',
        'Falcon: Slow down. They might have heard something',
      ];
      const line = warnLines[Math.floor(Math.random() * warnLines.length)];
      this.uiManager.showRadioSubtitle(line, 3000);
    }
  }

  // ============================================================
  // SUMMON HELPERS
  // ============================================================

  private getDamageableEnemies(): DamageableEnemy[] {
    return this.enemyManager.getEnemies().filter(e => e.state !== 'dead');
  }

  public useSummonAbility(index: number, targetPosition: THREE.Vector3): boolean {
    return this.summonSystem.useAbility(index, targetPosition, this.getDamageableEnemies());
  }

  // ============================================================
  // HIT EFFECTS
  // ============================================================

  private showHitMarker(isHeadshot: boolean): void {
    this.uiManager.showHitMarker(isHeadshot);
  }

  // ============================================================
  // OBJECT POOL HELPERS
  // ============================================================

  /**
   * Acquire an inactive tracer from the pool. Returns null if pool is exhausted.
   */
  private acquireTracer(): PooledTracer | null {
    for (const t of this.tracerPool) {
      if (!t.active) return t;
    }
    return null; // Pool exhausted — skip this tracer rather than allocate
  }

  /**
   * Acquire an inactive spark from the pool. Returns null if pool is exhausted.
   */
  private acquireSpark(): PooledSpark | null {
    for (const s of this.sparkPool) {
      if (!s.active) return s;
    }
    return null;
  }

  /**
   * Return all pool items to inactive state.
   */
  private resetPools(): void {
    for (const t of this.tracerPool) {
      t.active = false;
      t.line.visible = false;
    }
    for (const s of this.sparkPool) {
      s.active = false;
      s.mesh.visible = false;
    }
  }

  // ============================================================
  // MUZZLE FLASH
  // ============================================================

  private createMuzzleFlash(): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

    const flashPosition = this.camera.position.clone()
      .add(forward.multiplyScalar(1.0))
      .add(right.multiplyScalar(0.3))
      .add(new THREE.Vector3(0, -0.15, 0));

    this.muzzleFlashMesh.position.copy(flashPosition);
    this.muzzleFlashMesh.scale.set(1, 1, 1);
    (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
    this.muzzleFlashMesh.visible = true;

    this.muzzleFlashLight.position.copy(flashPosition);
    this.muzzleFlashLight.intensity = 3.0;
    this.muzzleFlashLight.visible = true;

    this.muzzleFlashActive = true;
    this.muzzleFlashStartTime = performance.now();
  }

  // ============================================================
  // BULLET TRAIL (player) — Uses pre-allocated tracer pool
  // ============================================================

  private createPlayerBulletTracer(hitPoint: THREE.Vector3 | null): void {
    const tracer = this.acquireTracer();
    if (!tracer) return; // Pool exhausted — skip visual, no GC hit

    const start = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const end = hitPoint || start.clone().add(dir.clone().multiplyScalar(100));

    // Update buffer geometry positions in-place (no allocation)
    const posAttr = tracer.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, start.x, start.y, start.z);
    posAttr.setXYZ(1, end.x, end.y, end.z);
    posAttr.needsUpdate = true;

    tracer.material.color.setHex(0xffaa00);
    tracer.material.opacity = 1.0;
    tracer.material.needsUpdate = true;
    tracer.line.visible = true;

    tracer.active = true;
    tracer.startTime = performance.now();
    tracer.duration = 100;

    this.activeBulletTrails.push(tracer);
  }

  // ============================================================
  // BULLET TRAIL (enemy)
  // ============================================================

  public createEnemyBulletTracer(fromPosition: THREE.Vector3, toPosition: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(toPosition, fromPosition);
    const dist = dir.length();
    if (dist < 0.1) return;
    dir.normalize();
    
    // Offset start to avoid raycast-inside-object issue
    const rayStart = fromPosition.clone().add(dir.clone().multiplyScalar(0.5));
    const remainingDist = dist - 0.5;
    if (remainingDist <= 0) return;
    
    const raycaster = new THREE.Raycaster(rayStart, dir, 0.1, remainingDist);
    const wallHits = raycaster.intersectObjects(this.colliders, true);
    
    if (wallHits.length > 0) {
      // Bullet hits a wall — NO DAMAGE, show impact only
      const hitPoint = wallHits[0].point.clone();
      this.spawnWallImpact(hitPoint);
      this.createTracerLine(fromPosition, hitPoint, 0xff4400);
      return; // Blocked — player SAFE
    }
    
    // Bullet reaches player — apply damage AND show tracer
    this.onPlayerTakeDamage(this.lastEnemyDamage);
    this.audioManager.playBulletWhiz();

    const end = toPosition.clone().add(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
      )
    );

    this.createTracerLine(fromPosition, end, 0xff4400);
  }

  private createTracerLine(from: THREE.Vector3, to: THREE.Vector3, color: number): void {
    const tracer = this.acquireTracer();
    if (!tracer) return;

    // Update buffer geometry positions in-place
    const posAttr = tracer.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, from.x, from.y, from.z);
    posAttr.setXYZ(1, to.x, to.y, to.z);
    posAttr.needsUpdate = true;

    tracer.material.color.setHex(color);
    tracer.material.opacity = 1.0;
    tracer.material.needsUpdate = true;
    tracer.line.visible = true;

    tracer.active = true;
    tracer.startTime = performance.now();
    tracer.duration = 100;

    this.activeBulletTrails.push(tracer);
  }

  // ============================================================
  // WALL IMPACT EFFECTS
  // ============================================================

  private spawnWallImpact(hitPoint: THREE.Vector3): void {
    // Bright impact flash (reuse pool spark with larger scale)
    const flashSpark = this.acquireSpark();
    if (flashSpark) {
      flashSpark.mesh.position.copy(hitPoint);
      flashSpark.mesh.scale.setScalar(15); // larger = flash
      flashSpark.material.color.setHex(0xffaa44);
      flashSpark.material.opacity = 1.0;
      flashSpark.material.needsUpdate = true;
      flashSpark.mesh.visible = true;
      flashSpark.velocity.set(0, 0, 0);
      flashSpark.active = true;
      flashSpark.startTime = performance.now();
      flashSpark.duration = 60;
      this.activeSparks.push(flashSpark);
    }

    // Sparks — bright orange/yellow
    for (let i = 0; i < 8; i++) {
      const spark = this.acquireSpark();
      if (!spark) break;

      spark.mesh.position.copy(hitPoint);
      spark.mesh.scale.setScalar(1.0);
      spark.material.color.setHex(Math.random() > 0.5 ? 0xffcc00 : 0xff8800);
      spark.material.opacity = 1.0;
      spark.material.needsUpdate = true;
      spark.mesh.visible = true;
      spark.velocity.set(
        (Math.random() - 0.5) * 5,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 5,
      );
      spark.active = true;
      spark.startTime = performance.now();
      spark.duration = 300;
      this.activeSparks.push(spark);
    }

    // Dust cloud — larger grey particles
    for (let i = 0; i < 6; i++) {
      const dust = this.acquireSpark();
      if (!dust) break;

      dust.mesh.position.copy(hitPoint);
      dust.mesh.scale.setScalar(2.0);
      dust.material.color.setHex(0x888888);
      dust.material.opacity = 0.7;
      dust.material.needsUpdate = true;
      dust.mesh.visible = true;
      dust.velocity.set(
        (Math.random() - 0.5) * 3,
        Math.random() * 2 + 0.5,
        (Math.random() - 0.5) * 3,
      );
      dust.active = true;
      dust.startTime = performance.now();
      dust.duration = 500;
      this.activeSparks.push(dust);
    }

    // Sound
    this.audioManager.playWallImpact();
  }

  // ============================================================
  // IMPACT SPARKS
  // ============================================================

  private spawnImpactSparks(hitPoint: THREE.Vector3): void {
    const sparkCount = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < sparkCount; i++) {
      const spark = this.acquireSpark();
      if (!spark) break;

      spark.mesh.position.copy(hitPoint);
      spark.mesh.scale.setScalar(1.0);
      spark.material.color.setHex(Math.random() > 0.5 ? 0xffcc00 : 0xff8800);
      spark.material.opacity = 1.0;
      spark.material.needsUpdate = true;
      spark.mesh.visible = true;

      spark.velocity.set(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 4,
      );

      spark.active = true;
      spark.startTime = performance.now();
      spark.duration = this.SPARK_DURATION;
      this.activeSparks.push(spark);
    }
  }

  // ============================================================
  // BULLET EFFECTS UPDATE
  // ============================================================

  private updateBulletEffects(elapsedMs: number, deltaSec: number): void {
    // Muzzle flash decay
    if (this.muzzleFlashActive) {
      const flashAge = elapsedMs - this.muzzleFlashStartTime;
      if (flashAge >= this.MUZZLE_FLASH_DURATION) {
        this.muzzleFlashMesh.visible = false;
        this.muzzleFlashLight.visible = false;
        this.muzzleFlashActive = false;
      } else {
        const t = 1 - flashAge / this.MUZZLE_FLASH_DURATION;
        (this.muzzleFlashMesh.material as THREE.MeshBasicMaterial).opacity = t;
        this.muzzleFlashLight.intensity = 3.0 * t;
      }
    }

    // Bullet trail fade-out — return to pool instead of disposing
    for (let i = this.activeBulletTrails.length - 1; i >= 0; i--) {
      const trail = this.activeBulletTrails[i];
      const age = elapsedMs - trail.startTime;
      const t = 1 - age / trail.duration;

      if (t <= 0) {
        // Return to pool (don't dispose — reuse on next shot)
        trail.active = false;
        trail.line.visible = false;
        this.activeBulletTrails.splice(i, 1);
      } else {
        trail.material.opacity = t;
      }
    }

    // Impact sparks update — return to pool instead of disposing
    for (let i = this.activeSparks.length - 1; i >= 0; i--) {
      const spark = this.activeSparks[i];
      const ageMs = elapsedMs - spark.startTime;

      if (ageMs >= spark.duration) {
        // Return to pool (don't dispose — reuse on next impact)
        spark.active = false;
        spark.mesh.visible = false;
        this.activeSparks.splice(i, 1);
        continue;
      }

      spark.mesh.position.x += spark.velocity.x * deltaSec;
      spark.mesh.position.y += spark.velocity.y * deltaSec;
      spark.mesh.position.z += spark.velocity.z * deltaSec;

      spark.velocity.y += this.GRAVITY * deltaSec;

      const sparkT = 1 - ageMs / spark.duration;
      spark.material.opacity = sparkT;
      spark.mesh.scale.setScalar(sparkT);
    }
  }

  // ============================================================
  // AMMO PICKUP SYSTEM
  // ============================================================

  /**
   * Places a glowing ammo box at the given world position.
   * When the player walks over it (distance < AMMO_PICKUP_RANGE),
   * 30 rounds are added to the current weapon's reserve.
   *
   * @param x - World X coordinate
   * @param z - World Z coordinate
   */
  public addAmmoPickup(x: number, z: number): void {
    // Ammo box geometry — small rectangular crate
    const geo = new THREE.BoxGeometry(0.5, 0.4, 0.5);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x22aa22,
      emissive: 0x00ff00,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.85,
      roughness: 0.3,
      metalness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Glow light
    const light = new THREE.PointLight(0x00ff00, 1.5, 4);
    light.position.set(x, 1.0, z);
    this.scene.add(light);

    this.ammoPickups.push(mesh);
    this.ammoPickupLights.push(light);
  }

  /**
   * Checks player distance to all ammo pickups.
   * Collects the pickup when within range.
   */
  private checkAmmoPickups(): void {
    const playerPos = this.player.getPosition();

    for (let i = this.ammoPickups.length - 1; i >= 0; i--) {
      const pickup = this.ammoPickups[i];
      const dist = playerPos.distanceTo(pickup.position);

      if (dist < this.AMMO_PICKUP_RANGE) {
        const weapon = this.weaponSystem.getCurrentWeapon();

        if (weapon.reserve === Infinity) {
          // Melee weapon — pickup not useful
          this.uiManager.showMessage('MELEE WEAPON — NO AMMO NEEDED', 1500);
        } else if (weapon.reserve >= weapon.maxReserve) {
          this.uiManager.showMessage('RESERVE AMMO FULL', 1500);
        } else {
          // Add reserve ammo
          this.weaponSystem.addReserve(this.AMMO_PICKUP_AMOUNT);
          this.uiManager.showMessage(`+${this.AMMO_PICKUP_AMOUNT} AMMO PICKED UP`, 1500);
          this.audioManager.playPickup();

          // Update ammo UI immediately
          const w = this.weaponSystem.getCurrentWeapon();
          this.uiManager.updateAmmo(w.ammo, w.maxAmmo, w.reserve, w.maxReserve);
        }

        // Remove pickup mesh and light
        this.scene.remove(pickup);
        const light = this.ammoPickupLights[i];
        if (light) this.scene.remove(light);
        pickup.geometry.dispose();
        (pickup.material as THREE.Material).dispose();
        this.ammoPickups.splice(i, 1);
        this.ammoPickupLights.splice(i, 1);
      }
    }
  }

  /**
   * Animates ammo pickups: bob up/down and rotate for visual appeal.
   */
  private updateAmmoPickups(delta: number): void {
    const now = performance.now();
    for (let i = 0; i < this.ammoPickups.length; i++) {
      const pickup = this.ammoPickups[i];
      // Gentle floating bob
      pickup.position.y = 0.5 + Math.sin(now * 0.003 + pickup.position.x * 2) * 0.12;
      // Slow rotation
      pickup.rotation.y += delta * 1.5;

      // Pulse the glow light
      const light = this.ammoPickupLights[i];
      if (light) {
        light.intensity = 1.0 + Math.sin(now * 0.004 + pickup.position.z) * 0.5;
      }
    }
  }

  // ============================================================
  // MISSION MARKERS — C4 RADAR MARKER
  // ============================================================

  /**
   * Creates the C4 placement marker at the radar dish position.
   * Visible only during Phase 3.
   * Features: pulsing orange/yellow ground circle + floating arrow above radar.
   */
  private createC4Marker(): void {
    if (this.c4MarkerGroup) return; // Already exists

    this.c4MarkerGroup = new THREE.Group();
    const radarPos = this.radarPosition;
    const terrainY = this.getTerrainHeight(radarPos.x, radarPos.z);

    // --- Ground circle (pulsing orange/yellow) ---
    const circleGeo = new THREE.RingGeometry(1.5, 2.5, 32);
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(radarPos.x, terrainY + 0.05, radarPos.z);
    circle.name = 'c4-circle';
    this.c4MarkerGroup.add(circle);

    // --- Inner circle (solid yellow center) ---
    const innerGeo = new THREE.CircleGeometry(1.5, 32);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(radarPos.x, terrainY + 0.06, radarPos.z);
    inner.name = 'c4-inner';
    this.c4MarkerGroup.add(inner);

    // --- Floating arrow above radar dish ---
    const arrowGroup = new THREE.Group();

    // Arrow shaft
    const shaftGeo = new THREE.BoxGeometry(0.3, 2.0, 0.3);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.9,
    });
    const shaft = new THREE.Mesh(shaftGeo, arrowMat);
    shaft.position.y = 1.0;
    arrowGroup.add(shaft);

    // Arrow head (cone pointing down)
    const headGeo = new THREE.ConeGeometry(0.6, 1.0, 4);
    const headMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.9,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.x = Math.PI; // Point downward
    head.position.y = -0.3;
    arrowGroup.add(head);

    // Position above radar dish
    arrowGroup.position.set(radarPos.x, terrainY + 6, radarPos.z);
    arrowGroup.name = 'c4-arrow';
    this.c4MarkerGroup.add(arrowGroup);

    // --- Point light for glow ---
    const glow = new THREE.PointLight(0xff8800, 2, 8, 2);
    glow.position.set(radarPos.x, terrainY + 3, radarPos.z);
    glow.name = 'c4-glow';
    this.c4MarkerGroup.add(glow);

    this.scene.add(this.c4MarkerGroup);
  }

  /**
   * Removes the C4 placement marker from the scene.
   */
  private removeC4Marker(): void {
    if (this.c4MarkerGroup) {
      this.scene.remove(this.c4MarkerGroup);
      this.c4MarkerGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.c4MarkerGroup = null;
    }
  }

  /**
   * Updates the C4 marker animation (pulsing, bobbing).
   * Called every frame during Phase 3.
   */
  private updateC4Marker(delta: number): void {
    if (!this.c4MarkerGroup) return;

    this.c4MarkerPulse += delta * 3;

    // Pulse the ground circle opacity and scale
    const circle = this.c4MarkerGroup.getObjectByName('c4-circle') as THREE.Mesh;
    if (circle) {
      const pulse = 0.4 + Math.sin(this.c4MarkerPulse) * 0.3;
      (circle.material as THREE.MeshBasicMaterial).opacity = pulse;
      const scale = 1.0 + Math.sin(this.c4MarkerPulse * 0.7) * 0.15;
      circle.scale.set(scale, scale, 1);
    }

    // Pulse the inner circle
    const inner = this.c4MarkerGroup.getObjectByName('c4-inner') as THREE.Mesh;
    if (inner) {
      (inner.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(this.c4MarkerPulse * 1.5) * 0.15;
    }

    // Bob the floating arrow up and down
    const arrow = this.c4MarkerGroup.getObjectByName('c4-arrow') as THREE.Group;
    if (arrow) {
      const radarPos = this.radarPosition;
      const terrainY = this.getTerrainHeight(radarPos.x, radarPos.z);
      arrow.position.y = terrainY + 6 + Math.sin(this.c4MarkerPulse * 1.2) * 0.5;
      arrow.rotation.y += delta * 2; // Slowly rotate
    }

    // Pulse the glow light
    const glow = this.c4MarkerGroup.getObjectByName('c4-glow') as THREE.PointLight;
    if (glow) {
      glow.intensity = 1.5 + Math.sin(this.c4MarkerPulse * 2) * 1.0;
    }

    // Show distance to radar in objective text
    const playerPos = this.player.getPosition();
    const distToRadar = playerPos.distanceTo(this.radarPosition);
    if (distToRadar > 5) {
      this.uiManager.updateMissionObjective(
        `Plant C4 on border radar — ${Math.floor(distToRadar)}m away`
      );
    } else {
      this.uiManager.updateMissionObjective('Press [E] to plant C4 on radar');
    }
  }

  // ============================================================
  // MISSION MARKERS — EXTRACTION POINT MARKER
  // ============================================================

  /**
   * Creates the extraction point marker (green beacon).
   * Visible only during Phase 5.
   * Features: pulsing green ground circle + light column + floating arrow.
   */
  private createExtractionMarker(): void {
    if (this.extractionMarkerGroup) return;

    this.extractionMarkerGroup = new THREE.Group();
    const extPos = this.extractionPointPosition;
    const terrainY = this.getTerrainHeight(extPos.x, extPos.z);

    // --- Ground circle (pulsing green) ---
    const circleGeo = new THREE.RingGeometry(2.0, 3.0, 32);
    const circleMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(extPos.x, terrainY + 0.05, extPos.z);
    circle.name = 'ext-circle';
    this.extractionMarkerGroup.add(circle);

    // --- Inner circle ---
    const innerGeo = new THREE.CircleGeometry(2.0, 32);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(extPos.x, terrainY + 0.06, extPos.z);
    inner.name = 'ext-inner';
    this.extractionMarkerGroup.add(inner);

    // --- Light column (vertical beam) ---
    const columnGeo = new THREE.CylinderGeometry(0.15, 0.15, 12, 8);
    const columnMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.3,
    });
    const column = new THREE.Mesh(columnGeo, columnMat);
    column.position.set(extPos.x, terrainY + 6, extPos.z);
    column.name = 'ext-column';
    this.extractionMarkerGroup.add(column);

    // --- Floating arrow above ---
    const arrowGroup = new THREE.Group();
    const shaftGeo = new THREE.BoxGeometry(0.4, 2.5, 0.4);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.9,
    });
    const shaft = new THREE.Mesh(shaftGeo, arrowMat);
    shaft.position.y = 1.25;
    arrowGroup.add(shaft);

    const headGeo = new THREE.ConeGeometry(0.8, 1.2, 4);
    const headMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.9,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.x = Math.PI; // Point downward
    head.position.y = -0.3;
    arrowGroup.add(head);

    arrowGroup.position.set(extPos.x, terrainY + 10, extPos.z);
    arrowGroup.name = 'ext-arrow';
    this.extractionMarkerGroup.add(arrowGroup);

    // --- Green point light ---
    const light = new THREE.PointLight(0x00ff44, 3, 15, 2);
    light.position.set(extPos.x, terrainY + 2, extPos.z);
    light.name = 'ext-light';
    this.extractionMarkerGroup.add(light);

    this.scene.add(this.extractionMarkerGroup);
  }

  /**
   * Removes the extraction marker from the scene.
   */
  private removeExtractionMarker(): void {
    if (this.extractionMarkerGroup) {
      this.scene.remove(this.extractionMarkerGroup);
      this.extractionMarkerGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.extractionMarkerGroup = null;
    }
  }

  /**
   * Updates extraction marker animation.
   * Called every frame during Phase 5.
   */
  private updateExtractionMarker(delta: number): void {
    if (!this.extractionMarkerGroup) return;

    this.extractionMarkerPulse += delta * 2.5;
    const extPos = this.extractionPointPosition;
    const terrainY = this.getTerrainHeight(extPos.x, extPos.z);

    // Pulse ground circle
    const circle = this.extractionMarkerGroup.getObjectByName('ext-circle') as THREE.Mesh;
    if (circle) {
      const pulse = 0.4 + Math.sin(this.extractionMarkerPulse) * 0.3;
      (circle.material as THREE.MeshBasicMaterial).opacity = pulse;
      const scale = 1.0 + Math.sin(this.extractionMarkerPulse * 0.8) * 0.12;
      circle.scale.set(scale, scale, 1);
    }

    // Pulse inner circle
    const inner = this.extractionMarkerGroup.getObjectByName('ext-inner') as THREE.Mesh;
    if (inner) {
      (inner.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(this.extractionMarkerPulse * 1.8) * 0.1;
    }

    // Pulse column opacity
    const column = this.extractionMarkerGroup.getObjectByName('ext-column') as THREE.Mesh;
    if (column) {
      (column.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(this.extractionMarkerPulse * 2) * 0.15;
    }

    // Bob the arrow
    const arrow = this.extractionMarkerGroup.getObjectByName('ext-arrow') as THREE.Group;
    if (arrow) {
      arrow.position.y = terrainY + 10 + Math.sin(this.extractionMarkerPulse * 1.5) * 0.6;
      arrow.rotation.y += delta * 1.5;
    }

    // Pulse light
    const light = this.extractionMarkerGroup.getObjectByName('ext-light') as THREE.PointLight;
    if (light) {
      light.intensity = 2.0 + Math.sin(this.extractionMarkerPulse * 3) * 1.5;
    }

    // Show distance to extraction in objective
    const playerPos = this.player.getPosition();
    const distToExt = playerPos.distanceTo(this.extractionPointPosition);
    if (distToExt > 5) {
      this.uiManager.updateMissionObjective(
        `Reach extraction point — ${Math.floor(distToExt)}m away`
      );
    } else {
      this.uiManager.updateMissionObjective('EXTRACTION ZONE — Hold to evac');
    }
  }

  // ============================================================
  // GAME LOOP
  // ============================================================

  /**
   * Starts the game with the specified mission.
   * @param missionId - Mission to start (defaults to 1). Builds the correct
   *                    level, spawns the correct enemies, and wires progression.
   */
  public start(missionId: number = 1): void {
    this.isRunning = true;
    this.isPaused = false;
    this.clock.start();

    // Clear any lingering subtitle queue from previous run
    this.uiManager.clearSubtitleQueue();

    // Start ambient desert wind atmosphere
    this.audioManager.startAmbientWind();

    // ── Reset common tracking state ──
    this.killCount = 0;
    this.missionStartTime = performance.now();
    this.totalKillCount = 0;
    this.stealthKillCount = 0;
    this.alertTriggerCount = 0;
    this.extractionBeepLastMark = 60;
    this.phaseTransitionDelay = 0;

    // Reset radio chatter state
    this.firstKillTriggered = false;
    this.lastKillRadioTime = 0;
    this.lastDamageRadioTime = 0;
    this.lastAmbientRadioTime = 0;
    this.lastStealthRadioTime = 0;
    this.extractionLZWarned = false;
    this.waveReinforceAnnounced = false;

    // Clear downed/rescue UI state
    this.uiManager.showDownedWarning(false);
    this.uiManager.updateRescueProgress(false);

    // Initialize weapon slot HUD
    const weapon = this.weaponSystem.getCurrentWeapon();
    this.uiManager.updateWeaponSlots(this.weaponSystem.getAllWeapons(), weapon.slot);
    this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);

    // Initialize character indicator
    this.uiManager.updateCharacter(this.activeCharacter);

    // ── Dispatch to the correct mission starter ──
    switch (missionId) {
      case 2:
        this.startMission2Level();
        break;
      case 3:
        this.startMission3Level();
        break;
      case 1:
      default:
        this.startMission1Level();
        break;
    }

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(this.gameLoop);
    }
  }

  /**
   * Initializes Mission 1: Desert Dawn — Border Sabotage.
   * Builds the desert compound level and starts Phase 1.
   */
  private startMission1Level(): void {
    // Reset mission 1 specific tracking
    this.missionPhase = 1;
    this.enemiesKilledInZone = 0;
    this.c4PlantProgress = 0;
    this.c4Planting = false;
    this.waveCount = 0;
    this.waveSpawnTimer = 0;
    this.waveSpawnActive = false;
    this.extractionTimer = 60;
    this.extractionWarningPlayed = false;
    this.obj_1_2_completed = false;

    this.currentMissionId = 1;
    this.missionManager.startMission(1);
    this.uiManager.updateMissionObjective('Move to compound perimeter');

    // === SCRIPTED EVENT 1: Pre-mission briefing ===
    this.triggerEvent1_PreBriefing();
  }

  /**
   * Initializes Mission 2: Iron Rain — Urban Warfare.
   * Builds the urban district level and starts Phase 1.
   */
  private startMission2Level(): void {
    // Stop any running game loop
    this.stop();

    // Remove other mission levels if present
    this.removeMission1Level();
    this.removeMission3Level();

    // Set current mission
    this.currentMissionId = 2;

    // Reset Mission 2 tracking variables
    this.mission2Phase = 1;
    this.mission2MarketEnemiesKilled = 0;
    this.mission2IntelProgress = 0;
    this.mission2IntelDownloading = false;
    this.mission2WaveCount = 0;
    this.mission2WaveSpawnActive = false;
    this.mission2WaveSpawnTimer = 0;
    this.mission2ExtractionTimer = 45;
    this.mission2IntelDownloaded = false;
    this.mission2RooftopReached = false;
    this.mission2Objective7Completed = false;

    // Reset mission stats tracking
    this.missionStartTime = performance.now();
    this.totalKillCount = 0;
    this.stealthKillCount = 0;
    this.alertTriggerCount = 0;
    this.extractionBeepLastMark = 60;
    this.phaseTransitionDelay = 0;

    // Reset radio chatter state
    this.firstKillTriggered = false;
    this.lastKillRadioTime = 0;
    this.lastDamageRadioTime = 0;
    this.lastAmbientRadioTime = 0;
    this.lastStealthRadioTime = 0;
    this.extractionLZWarned = false;
    this.waveReinforceAnnounced = false;

    // Reset event flags for Mission 2
    this.resetEventFlags();

    // Reset player position to spawn
    this.player.resetAll(0, 190, 0);
    this.activeCharacter = 'wolf';

    // Reset weapon system
    this.weaponSystem.setActiveCharacter(this.activeCharacter);
    this.weaponSystem.restoreSlot(4);

    // Build Mission 2 level (urban district + enemies)
    this.colliders = [];
    const concreteTexture = this.createConcreteTexture();
    const metalTexture = this.createMetalTexture();
    this.addMission2Level(concreteTexture, metalTexture);
    this.player.setColliders(this.colliders);
    this.enemyManager.setColliders(this.colliders);

    // Update UI
    const weapon = this.weaponSystem.getCurrentWeapon();
    this.uiManager.updateWeaponSlots(this.weaponSystem.getAllWeapons(), weapon.slot);
    this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);
    this.uiManager.updateCharacter('wolf');
    this.uiManager.updateMissionObjective('Infiltrate the eastern district');

    // Start the game loop
    this.isRunning = true;
    this.isPaused = false;
    this.clock.start();

    // Start mission in MissionManager
    this.missionManager.startMission(2);

    // Clear subtitle queue and show briefing
    this.uiManager.clearSubtitleQueue();
    this.triggerM2Event1_Briefing();

    // Start ambient wind
    this.audioManager.startAmbientWind();

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(this.gameLoop);
    }
  }

  public stop(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.timeScale = 1.0; // Reset time scale
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    // Stop ambient wind when game stops
    this.audioManager.stopAmbientWind();
    // Stop alarm siren if playing
    this.audioManager.stopAlarmSound();
    // Hide countdown timer
    this.uiManager.hideCountdownTimer();
    // Hide prompt
    this.uiManager.hidePrompt();
    // Hide command wheel if open
    this.uiManager.showCommandWheel(false);
    // Hide boundary warning
    this.boundaryWarningActive = false;
    if (this.boundaryOverlay) this.boundaryOverlay.style.opacity = '0';
    // Deactivate night vision
    this.deactivateNightVision();
    // Clean up mission markers
    this.removeC4Marker();
    this.removeExtractionMarker();
    this.removeM3CommanderMarker();
    this.removeM3ExtractionMarker();
    this.lastWeaponName = '';
    // Clear subtitle queue
    this.uiManager.clearSubtitleQueue();
  }

  /**
   * Complete mission reset — tears down and rebuilds everything.
   * Used by the Restart button to fully reset the mission.
   */
  public reset(): void {
    // 1. Stop the RAF loop
    this.stop();

    // 2. Remove all mission objects from scene
    this.removeMission1Level();
    this.removeMission2Level();
    this.removeMission3Level();

    // 3. Clear all bullet trails and sparks (return to pool, don't dispose)
    this.activeBulletTrails = [];
    this.activeSparks = [];
    this.resetPools();

    // 4. Reset muzzle flash
    this.muzzleFlashMesh.visible = false;
    this.muzzleFlashLight.visible = false;
    this.muzzleFlashActive = false;

    // 5. Reset player fully (health, position, stance, weapon, character)
    this.player.resetAll(-2, 190, 2);
    this.activeCharacter = 'wolf';

    // 6. Reset score
    this.score = 0;
    this.uiManager.updateScore(0);

    // 7. Reset mission tracking (mission-specific state)
    this.killCount = 0;

    // Mission 1 tracking
    this.missionPhase = 1;
    this.enemiesKilledInZone = 0;
    this.c4PlantProgress = 0;
    this.c4Planting = false;
    this.waveCount = 0;
    this.waveSpawnTimer = 0;
    this.waveSpawnActive = false;
    this.extractionTimer = 60;
    this.extractionWarningPlayed = false;
    this.obj_1_2_completed = false;

    // Mission 2 tracking
    this.mission2Phase = 1;
    this.mission2MarketEnemiesKilled = 0;
    this.mission2IntelProgress = 0;
    this.mission2IntelDownloading = false;
    this.mission2WaveCount = 0;
    this.mission2WaveSpawnActive = false;
    this.mission2WaveSpawnTimer = 0;
    this.mission2ExtractionTimer = 45;
    this.mission2IntelDownloaded = false;
    this.mission2RooftopReached = false;
    this.mission2Objective7Completed = false;
    this.removeM2ObjectiveMarker();
    this.removeM2ExtractionMarker();

    // Mission 3 tracking
    this.mission3Phase = 1;
    this.mission3CommanderAlphaKilled = false;
    this.mission3CommanderBetaKilled = false;
    this.mission3CommanderGammaKilled = false;
    this.mission3ExtractionTimer = 60;
    this.mission3ExtractionActive = false;
    this.mission3CollapseWarningPlayed = false;
    this.mission3DoorOpenAlpha = false;
    this.mission3DoorOpenBeta = false;
    this.removeM3CommanderMarker();
    this.removeM3ExtractionMarker();

    // Reset mission stats tracking
    this.missionStartTime = performance.now();
    this.totalKillCount = 0;
    this.stealthKillCount = 0;
    this.alertTriggerCount = 0;
    this.extractionBeepLastMark = 60;
    this.phaseTransitionDelay = 0;

    // Reset radio chatter state
    this.firstKillTriggered = false;
    this.lastKillRadioTime = 0;
    this.lastDamageRadioTime = 0;
    this.lastAmbientRadioTime = 0;
    this.lastStealthRadioTime = 0;
    this.extractionLZWarned = false;
    this.waveReinforceAnnounced = false;

    // 8. Reset scripted event flags
    this.resetEventFlags();

    // 8b. Clean up mission markers
    this.removeC4Marker();
    this.removeExtractionMarker();
    this.removeM3CommanderMarker();
    this.removeM3ExtractionMarker();
    this.lastWeaponName = '';

    // 9. Reset time scale and low-health state
    this.timeScale = 1.0;
    this.lowHealthActive = false;
    this.criticalHealthActive = false;
    this.uiManager.showLowHealthVignette(false);
    this.uiManager.showFilmGrain(false);

    // 10. Reset kill streak
    this.uiManager.resetKillStreak();

    // 11. Clear all UI
    this.uiManager.hideCountdownTimer();
    this.uiManager.hidePrompt();
    this.uiManager.clearSubtitleQueue();

    // 12. Re-create the level for the current mission (rebuilds colliders, spawns enemies, places ammo)
    this.colliders = [];
    const concreteTexture = this.createConcreteTexture();
    const metalTexture = this.createMetalTexture();
    switch (this.currentMissionId) {
      case 2:
        this.addMission2Level(concreteTexture, metalTexture);
        break;
      case 3:
        this.addMission3Level(concreteTexture, metalTexture);
        break;
      case 1:
      default:
        this.addMission1Level(concreteTexture, metalTexture);
        break;
    }
    this.player.setColliders(this.colliders);
    this.enemyManager.setColliders(this.colliders);

    // 13. Reset weapon system to full ammo
    this.weaponSystem.setActiveCharacter(this.activeCharacter);
    this.weaponSystem.restoreSlot(4);
    const weapon = this.weaponSystem.getCurrentWeapon();
    this.uiManager.updateWeaponSlots(this.weaponSystem.getAllWeapons(), weapon.slot);
    this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);

    // 14. Initialize UI based on current mission
    this.uiManager.updateCharacter('wolf');
    switch (this.currentMissionId) {
      case 2:
        this.missionManager.startMission(2);
        this.uiManager.updateMissionObjective('Infiltrate the eastern district');
        break;
      case 3:
        this.missionManager.startMission(3);
        this.uiManager.updateMissionObjective('Breach the outer perimeter');
        break;
      case 1:
      default:
        this.missionManager.startMission(1);
        this.uiManager.updateMissionObjective('Move to compound perimeter');
        break;
    }

    // 15. Clear downed/rescue UI
    this.uiManager.showDownedWarning(false);
    this.uiManager.updateRescueProgress(false);

    // 16. Hide boundary warning overlay
    this.boundaryWarningActive = false;
    if (this.boundaryOverlay) this.boundaryOverlay.style.opacity = '0';

    // 17. Deactivate night vision
    this.deactivateNightVision();

    // 18. Restart the game loop
    this.isRunning = true;
    this.isPaused = false;
    this.clock.start();

    // Show briefing for current mission
    this.uiManager.clearSubtitleQueue();
    switch (this.currentMissionId) {
      case 1:
        this.triggerEvent1_PreBriefing();
        break;
      case 2:
        this.triggerM2Event1_Briefing();
        break;
      case 3:
        setTimeout(() => {
          this.uiManager.showRadioSubtitle('Command: Wolf, Falcon. We have located 3 high-value targets in a fortified bunker.', 4500);
          this.uiManager.showRadioSubtitle('Command: Your mission: eliminate all 3 commanders. They are responsible for the school bombing.', 4500);
          this.uiManager.showRadioSubtitle('Wolf: Copy, Command. Moving to breach point.', 3000);
          this.uiManager.showRadioSubtitle('Falcon: I have recon on the bunker entrance. Multiple hostiles on perimeter.', 3000);
        }, 1000);
        break;
    }

    // Start ambient wind
    this.audioManager.startAmbientWind();

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(this.gameLoop);
    }
  }

  /**
   * Full disposal — destroys the engine instance entirely.
   * Used when quitting to menu so a NEW engine is created on next play.
   */
  public dispose(): void {
    // Stop everything
    this.stop();

    // Remove mission levels
    this.removeMission1Level();
    this.removeMission2Level();
    this.removeMission3Level();

    // Clean up night vision
    this.deactivateNightVision();

    // Clean up player
    this.player.dispose();

    // Clean up bullet trails (dispose pool objects)
    this.activeBulletTrails = [];
    for (const t of this.tracerPool) {
      this.scene.remove(t.line);
      t.geometry.dispose();
      t.material.dispose();
    }
    this.tracerPool = [];

    // Clean up sparks (dispose pool objects)
    this.activeSparks = [];
    for (const s of this.sparkPool) {
      this.scene.remove(s.mesh);
      s.material.dispose();
    }
    this.sparkPool = [];

    // Clean up dust particles
    if (this.dustParticles) {
      this.scene.remove(this.dustParticles);
      this.dustParticles.geometry.dispose();
      (this.dustParticles.material as THREE.Material).dispose();
      this.dustParticles = null;
    }

    // Clean up muzzle flash
    this.scene.remove(this.muzzleFlashMesh);
    this.scene.remove(this.muzzleFlashLight);

    // Dispose renderer
    this.renderer.dispose();

    // Clear subtitle queue
    this.uiManager.clearSubtitleQueue();

    // Hide all UI
    this.uiManager.hideCountdownTimer();
    this.uiManager.hidePrompt();
    this.uiManager.showLowHealthVignette(false);
    this.uiManager.showFilmGrain(false);
    this.uiManager.showDownedWarning(false);
    this.uiManager.updateRescueProgress(false);

    // Remove boundary warning overlay
    if (this.boundaryOverlay) {
      this.boundaryOverlay.remove();
      this.boundaryOverlay = null;
    }

    // Clean up mission markers
    this.removeC4Marker();
    this.removeExtractionMarker();
  }

  public pause(): void {
    this.isPaused = true;
    this.audioManager.pauseAll();
  }

  public resume(): void {
    this.isPaused = false;
    this.clock.start();
    this.audioManager.resumeAll();
  }

  /**
   * Initializes Mission 3: The Nest — Elimination.
   * Builds the bunker complex level and starts Phase 1.
   */
  private startMission3Level(): void {
    // Stop any running game loop
    this.stop();

    // Remove other mission levels if present
    this.removeMission1Level();
    this.removeMission2Level();

    // Set current mission
    this.currentMissionId = 3;

    // Reset Mission 3 tracking variables
    this.mission3Phase = 1;
    this.mission3CommanderAlphaKilled = false;
    this.mission3CommanderBetaKilled = false;
    this.mission3CommanderGammaKilled = false;
    this.mission3ExtractionTimer = 60;
    this.mission3ExtractionActive = false;
    this.mission3CollapseWarningPlayed = false;
    this.mission3DoorOpenAlpha = false;
    this.mission3DoorOpenBeta = false;

    // Reset mission stats tracking
    this.missionStartTime = performance.now();
    this.totalKillCount = 0;
    this.stealthKillCount = 0;
    this.alertTriggerCount = 0;
    this.extractionBeepLastMark = 60;
    this.phaseTransitionDelay = 0;

    // Reset radio chatter state
    this.firstKillTriggered = false;
    this.lastKillRadioTime = 0;
    this.lastDamageRadioTime = 0;
    this.lastAmbientRadioTime = 0;
    this.lastStealthRadioTime = 0;
    this.extractionLZWarned = false;
    this.waveReinforceAnnounced = false;

    // Reset event flags for Mission 3
    this.resetEventFlags();

    // Reset player position to bunker entrance
    this.player.resetAll(0, 190, 0);
    this.activeCharacter = 'wolf';

    // Reset weapon system
    this.weaponSystem.setActiveCharacter(this.activeCharacter);
    this.weaponSystem.restoreSlot(4);

    // Build Mission 3 level (bunker complex + enemies)
    this.colliders = [];
    const concreteTexture = this.createConcreteTexture();
    const metalTexture = this.createMetalTexture();
    this.addMission3Level(concreteTexture, metalTexture);
    this.player.setColliders(this.colliders);
    this.enemyManager.setColliders(this.colliders);

    // Update UI
    const weapon = this.weaponSystem.getCurrentWeapon();
    this.uiManager.updateWeaponSlots(this.weaponSystem.getAllWeapons(), weapon.slot);
    this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);
    this.uiManager.updateCharacter('wolf');
    this.uiManager.updateMissionObjective('Breach the outer perimeter');

    // Start the game loop
    this.isRunning = true;
    this.isPaused = false;
    this.clock.start();

    // Start mission in MissionManager
    this.missionManager.startMission(3);

    // Clear subtitle queue and show briefing
    this.uiManager.clearSubtitleQueue();
    setTimeout(() => {
      this.uiManager.showRadioSubtitle('Command: Wolf, Falcon. We have located 3 high-value targets in a fortified bunker.', 4500);
      this.uiManager.showRadioSubtitle('Command: Your mission: eliminate all 3 commanders. They are responsible for the school bombing.', 4500);
      this.uiManager.showRadioSubtitle('Wolf: Copy, Command. Moving to breach point.', 3000);
      this.uiManager.showRadioSubtitle('Falcon: I have recon on the bunker entrance. Multiple hostiles on perimeter.', 3000);
    }, 1000);

    // Start ambient wind
    this.audioManager.startAmbientWind();

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(this.gameLoop);
    }
  }

  private gameLoop = (): void => {
    if (!this.isRunning) {
      this.rafId = 0;
      return;
    }

    if (this.isPaused) {
      this.rafId = requestAnimationFrame(this.gameLoop);
      return;
    }
    
    const rawDelta = Math.max(0, Math.min(this.clock.getDelta(), 0.05)); // Clamp: no negative, no >50ms spikes
    const delta = rawDelta * this.timeScale; // Apply command wheel time scale
    const elapsedMs = performance.now();
    
    // Update systems
    this.player.update(delta, this.camera);

    // Update inactive character AI (cover + follow behavior)
    this.player.updateInactiveAI(delta);

    this.enemyManager.update(delta, this.player.getPosition(), this.player.isProneState() ? 'prone' : this.player.isCrouchingState() ? 'crouching' : 'standing');
    this.weaponSystem.update(delta);
    this.stealthSystem.update(delta, this.player.getPosition(), this.enemyManager.getEnemies(), this.colliders);
    this.summonSystem.update(delta);

    // Update bullet effects
    this.updateBulletEffects(elapsedMs, delta);

    // Update night vision light position
    this.updateNightVision(delta);

    // Update atmospheric dust particles
    this.updateDustParticles(delta);

    // Debug: highlight stuck enemies
    this.updateStuckEnemyDebug();
    
    // Debug mode visuals (env colliders, hitboxes, labels)
    if (this.debugMode.enabled) {
      this.debugMode.setEnemies(this.enemyManager.getAliveEnemies());
      this.debugMode.update();
    }

    // Update ammo pickup animations and collection checks
    this.updateAmmoPickups(delta);
    this.checkAmmoPickups();

    // === BOUNDARY WARNING — screen edge tint near play area edges ===
    this.checkBoundaryWarning();

    // ═══ RADIO CHATTER — Ambient combat chatter (30-second cycle) ═══
    this.updateAmbientRadioChatter(elapsedMs);

    // ═══ RADIO CHATTER — Stealth observations ═══
    this.updateStealthRadioChatter(elapsedMs);

    // === MISSION 1 OBJECTIVE SYSTEM ===
    this.checkMissionProgression(delta);

    // === MISSION MARKERS — animate active markers ===
    if (this.missionPhase === 3) {
      this.updateC4Marker(delta);
    }
    if (this.missionPhase === 5) {
      this.updateExtractionMarker(delta);
    }

    // === Update weapon name in HUD ===
    const currentWeapon = this.weaponSystem.getCurrentWeapon();
    if (currentWeapon && currentWeapon.name !== this.lastWeaponName) {
      this.lastWeaponName = currentWeapon.name;
      this.uiManager.updateWeaponName(currentWeapon.name);
    }

    // === SCRIPTED EVENT 2: Stealth kill tutorial (near first enemy) ===
    this.checkStealthTutorialProximity();

    // Detection alert
    const detectionProgress = this.stealthSystem.getDetectionProgress();
    if (detectionProgress >= 70 && !this.wasAlertTriggered) {
      this.audioManager.playAlert();
      this.wasAlertTriggered = true;
      this.alertTriggerCount++; // Track for stealth rating
    } else if (detectionProgress < 70) {
      this.wasAlertTriggered = false;
    }
    
    // Update UI
    this.uiManager.updateDualHealthBars(
      this.player.getWolfHealth(), this.player.getWolfMaxHealth(),
      this.player.getFalconHealth(), this.player.getFalconMaxHealth(),
      this.activeCharacter,
      this.player.isWolfDowned(), this.player.isFalconDowned()
    );
    this.uiManager.updateDualArmorBars(
      this.player.getWolfArmor(), this.player.getWolfMaxArmor(),
      this.player.getFalconArmor(), this.player.getFalconMaxArmor(),
      this.activeCharacter
    );
    this.uiManager.updateDetection(
      this.stealthSystem.getDetectionLevel(),
      this.stealthSystem.getStealthStatusText(),
      this.stealthSystem.getStealthStatusColor()
    );

    // Update NV battery UI
    this.uiManager.updateNVBattery(
      this.player.getNVBattery(),
      this.player.isNightVisionActive()
    );

    // Debug panel
    const playerPos = this.player.getPosition();
    const aliveEnemies = this.enemyManager.getAliveEnemies().length;
    const stuckCount = this.enemyManager.getAliveEnemies().filter(e => (e.stuckTimer || 0) > 1).length;
    this.uiManager.updateDebug(
      { x: playerPos.x, y: playerPos.y, z: playerPos.z },
      this.player.getWolfHealth() + this.player.getFalconHealth(),
      aliveEnemies,
      stuckCount,
      this.activeBulletTrails.length
    );

    // Update stance indicator
    this.uiManager.updateStanceIndicator(
      this.player.isCrouchingState(),
      this.player.isProneState()
    );

    // Update crosshair spread based on player state
    this.uiManager.updateCrosshairSpread(
      this.player.isMovingState(),
      this.player.isCrouchingState() || this.player.isProneState(),
      this.player.isADSState()
    );

    // Update reload progress bar (0–1) on HUD
    if (this.weaponSystem.isReloading()) {
      this.uiManager.updateReloadProgress(this.weaponSystem.getReloadProgress());
    }

    // Update sniper scope UI
    if (this.weaponSystem.isCurrentWeaponSniper()) {
      const isScoped = this.player.isADSState();
      this.uiManager.showScope(isScoped);
      if (isScoped) {
        this.uiManager.updateScopeZoom(this.player.getScopeZoom());
        this.uiManager.updateBreathBar(
          this.player.getBreathHoldTime(),
          this.player.getMaxBreathHold(),
          this.player.isBreathHolding(),
          true // sniper is scoped
        );
      } else {
        this.uiManager.updateBreathBar(0, 5, false, false);
      }
    } else {
      this.uiManager.showScope(false);
      this.uiManager.updateBreathBar(0, 5, false, false);
    }

    // === DOWNEC TIMER MANAGEMENT ===
    const downedChar = this.player.getDownedCharacter();
    if (downedChar) {
      // Update downed timers
      const expiredChar = this.player.updateDownedTimers(delta);
      if (expiredChar) {
        // Timer ran out — mission failed
        console.log(`[GameEngine] ${expiredChar.toUpperCase()} rescue timer expired — MISSION FAILED`);
        this.uiManager.showMessage('⏰ TEAMMATE LOST — MISSION FAILED!', 5000);
        this.uiManager.addKillFeedEntry(`💀 ${expiredChar.toUpperCase()} was not rescued in time!`);
        this.uiManager.showDownedWarning(false);
        this.stop();
        this.onPlayerDeath();
        return;
      }

      // Show/update downed warning UI
      const remainingTime = this.player.getDownedTimer(downedChar);
      this.uiManager.showDownedWarning(true, remainingTime);

      // Update downed character visual positions
      this.player.updateDownedVisuals();

      // === RESCUE MECHANICS ===
      this.player.updateRescue(delta);

      // Show/hide rescue progress bar
      if (this.player.getIsRescuing()) {
        this.uiManager.updateRescueProgress(true, this.player.getRescueProgress());
      } else {
        // Check if near downed character for prompt
        const activePos = this.player.getPosition();
        const downedPos = this.player.getCharacterPosition(downedChar);
        const distance = activePos.distanceTo(downedPos);
        if (distance <= this.player.getRescueDistance() && !this.player.isCharacterDowned(this.activeCharacter)) {
          // Near downed teammate — show rescue hint
          this.uiManager.updateRescueProgress(false);
          this.uiManager.showPrompt(`Hold [E] to rescue ${downedChar.toUpperCase()}`);
        } else {
          this.uiManager.updateRescueProgress(false);
          this.uiManager.hidePrompt();
        }
      }
    } else {
      // No one downed — clear downed UI
      this.uiManager.showDownedWarning(false);
      this.uiManager.updateRescueProgress(false);
    }
    
    // Update screen shake
    const shakeOffset = this.uiManager.updateScreenShake();
    if (shakeOffset.x !== 0 || shakeOffset.y !== 0) {
      this.renderer.domElement.style.transform = `translate(${shakeOffset.x}px, ${shakeOffset.y}px)`;
    } else {
      this.renderer.domElement.style.transform = '';
    }

    // Render
    this.renderer.render(this.scene, this.camera);
    
    this.rafId = requestAnimationFrame(this.gameLoop);
  };

  // ============================================================
  // CHARACTER SWITCHING
  // ============================================================

  public switchCharacter(): void {
    // Don't switch if trying to switch to a downed character
    const targetChar = this.activeCharacter === 'wolf' ? 'falcon' : 'wolf';
    if (this.player.isCharacterDowned(targetChar)) {
      this.uiManager.showMessage(`${targetChar.toUpperCase()} IS DOWNED — CANNOT SWITCH`, 1500);
      return;
    }

    // Save current weapon slot for the outgoing character
    const savedSlot = this.weaponSystem.saveSlot();
    
    this.activeCharacter = targetChar;
    this.player.switchCharacter(this.activeCharacter);
    this.weaponSystem.setActiveCharacter(this.activeCharacter);
    
    // Restore the incoming character's persisted weapon slot
    const restoredSlot = this.player.getWeaponSlot();
    this.weaponSystem.restoreSlot(restoredSlot);
    
    this.uiManager.updateCharacter(this.activeCharacter);
    const weapon = this.weaponSystem.getCurrentWeapon();
    this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);
    this.uiManager.updateWeaponSlots(this.weaponSystem.getAllWeapons(), weapon.slot);

    // ═══ RADIO CHATTER — Character switch personality lines ═══
    // Wolf: Professional, concise. Falcon: Cautious, watchful.
    if (targetChar === 'wolf') {
      // Switching TO Wolf
      this.uiManager.showRadioSubtitle('Wolf: Moving in', 2000);
    } else {
      // Switching TO Falcon
      this.uiManager.showRadioSubtitle('Falcon: I\'ve got eyes on', 2000);
    }
  }

  // ============================================================
  // TACTICAL COMMAND WHEEL
  // ============================================================

  /**
   * Called when the player opens/closes the tactical command wheel.
   * Slows game to 0.3x speed when open, resumes to 1.0x when closed.
   */
  private handleCommandWheel(open: boolean): void {
    this.timeScale = open ? 0.3 : 1.0;
    const inactiveName = this.activeCharacter === 'wolf' ? 'FALCON' : 'WOLF';
    this.uiManager.showCommandWheel(open, inactiveName);

    // ═══ RADIO CHATTER — Command wheel open ═══
    if (open) {
      // Falcon personality: cautious, alert — always the eyes in the sky
      this.uiManager.showRadioSubtitle('Falcon: Standing by for orders', 2500);
    }
  }

  /**
   * Handles a tactical command selection from the command wheel.
   *   1 = TAKE OVER — Switch to Falcon
   *   2 = TAKE COVER — Set inactive AI to cover mode
   *   3 = FOLLOW ME — Set inactive AI to follow mode
   *   4 = HOLD POSITION — Set inactive AI to hold position
   */
  private handleTacticalCommand(command: 1 | 2 | 3 | 4): void {
    // Dynamic names based on who's active
    const speaker = this.activeCharacter === 'wolf' ? 'Wolf' : 'Falcon';
    const partner = this.activeCharacter === 'wolf' ? 'Falcon' : 'Wolf';

    switch (command) {
      case 1: // TAKE OVER — Switch character
        this.uiManager.showRadioSubtitle(`${speaker}: ${partner}, take point!`);
        this.switchCharacter();
        break;
      case 2: // TAKE COVER
        this.uiManager.showRadioSubtitle(`${speaker}: ${partner}, take cover!`);
        this.player.setInactiveAICommand('cover');
        break;
      case 3: // FOLLOW ME
        this.uiManager.showRadioSubtitle(`${speaker}: ${partner}, on me!`);
        this.player.setInactiveAICommand('follow');
        break;
      case 4: // HOLD POSITION
        this.uiManager.showRadioSubtitle(`${speaker}: ${partner}, hold position!`);
        this.player.setInactiveAICommand('hold');
        break;
    }
  }

  /**
   * Called when the player switches weapon slots via number keys or scroll wheel.
   * Syncs the weapon system and updates the HUD.
   */
  private handleWeaponSlotChange(slot: number): void {
    const weapon = this.weaponSystem.switchWeapon(slot);
    if (!weapon) return;

    // Update ammo display (melee shows ∞/∞)
    if (weapon.ammo === Infinity) {
      this.uiManager.updateAmmo(Infinity, Infinity);
    } else {
      this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);
    }

    // Update weapon slot HUD
    this.uiManager.updateWeaponSlots(this.weaponSystem.getAllWeapons(), slot);

    // ═══ RADIO CHATTER — Weapon switch personality ═══
    // Only announce significant switches (not every scroll tick)
    const speaker = this.activeCharacter === 'wolf' ? 'Wolf' : 'Falcon';
    if (weapon.ammo === Infinity) {
      // Melee — Wolf is terse, Falcon is cautious
      const meleeLines: Record<string, string> = {
        'wolf': 'Wolf: Switching to knife',
        'falcon': 'Falcon: Going close-range',
      };
      this.uiManager.showRadioSubtitle(meleeLines[this.activeCharacter] || `${speaker}: Switching weapons`, 2000);
    } else if (weapon.isSuppressed) {
      this.uiManager.showRadioSubtitle(`${speaker}: Suppressed`, 1500);
    }
  }

  public reloadWeapon(): void {
    if (!this.isRunning || this.isPaused) return;
    const weapon = this.weaponSystem.getCurrentWeapon();
    // Melee weapons can't be reloaded
    if (weapon.ammo === Infinity) return;

    // Check if already reloading (ignore key repeat)
    if (this.weaponSystem.isReloading()) return;

    const started = this.weaponSystem.reload();
    if (started) {
      // Start the weapon model reload animation
      this.player.startReloadAnimation();
    } else {
      // Show reason why reload failed
      if (weapon.ammo >= weapon.maxAmmo) {
        this.uiManager.showMessage('MAGAZINE FULL', 1200);
      } else if (weapon.reserve <= 0) {
        this.uiManager.showMessage('NO RESERVE AMMO', 1500);
      }
    }
  }

  // ============================================================
  // SCORE
  // ============================================================

  public addScore(points: number): void {
    this.score += points;
    this.uiManager.updateScore(this.score);
  }

  // ============================================================
  // PLAYER DAMAGE FEEDBACK
  // ============================================================

  /**
   * Called when the player takes damage from an enemy.
   * Triggers multiple feedback layers:
   * - Screen shake proportional to damage
   * - Red damage vignette flash
   * - Damage direction indicator
   * - Low-health vignette at <30% HP
   * - Film grain effect at <10% HP
   */
  private onPlayerTakeDamage(damage: number): void {
    // Don't damage a downed character
    if (this.player.isCharacterDowned(this.activeCharacter)) return;

    this.player.takeDamage(damage);

    const health = this.player.getHealth();
    const maxHealth = this.player.getMaxHealth();
    const healthPercent = health / maxHealth;

    // 1. Screen shake: intensity proportional to damage (capped at 8)
    const shakeIntensity = Math.min(8, damage * 0.6);
    this.uiManager.triggerScreenShake(shakeIntensity, 150);

    // 2. Red damage vignette flash
    this.uiManager.showDamageVignette('red', 200);

    // 3. Damage direction indicator (find nearest enemy for direction)
    this.showDamageDirectionIndicator();

    // ═══ RADIO CHATTER — Taking fire ═══
    const now = performance.now();
    if (now - this.lastDamageRadioTime > this.RADIO_COOLDOWN) {
      this.lastDamageRadioTime = now;
      // Wolf personality: concise, professional under fire
      const damageLines = [
        'Wolf: Taking fire!',
        'Wolf: Hit!',
        'Wolf: Under fire!',
        'Wolf: I\'m hit!',
        'Wolf: Contact!',
      ];
      const line = damageLines[Math.floor(Math.random() * damageLines.length)];
      this.uiManager.showRadioSubtitle(line, 2000);

      // Falcon reacts at low health — cautious personality
      if (healthPercent < 0.3) {
        this.uiManager.showRadioSubtitle('Falcon: Be careful! You\'re wounded!', 3000);
      }
    }

    // 4. Low-health vignette (pulsing red) when health < 30%
    if (healthPercent < 0.3 && !this.lowHealthActive) {
      this.lowHealthActive = true;
      this.uiManager.showLowHealthVignette(true);
    } else if (healthPercent >= 0.3 && this.lowHealthActive) {
      this.lowHealthActive = false;
      this.uiManager.showLowHealthVignette(false);
    }

    // 5. Film grain effect (subtle red-tinted) when health < 10%
    if (healthPercent < 0.1 && !this.criticalHealthActive) {
      this.criticalHealthActive = true;
      this.uiManager.showFilmGrain(true);
    } else if (healthPercent >= 0.1 && this.criticalHealthActive) {
      this.criticalHealthActive = false;
      this.uiManager.showFilmGrain(false);
    }
  }

  /**
   * Shows a damage direction indicator from the nearest enemy's angle.
   * Activates the appropriate directional arrow.
   */
  private showDamageDirectionIndicator(): void {
    const aliveEnemies = this.enemyManager.getEnemies().filter(e => e.state !== 'dead');
    if (aliveEnemies.length === 0) return;

    // Find the closest attacking enemy
    const playerPos = this.player.getPosition();
    let closestEnemy: any = null;
    let closestDist = Infinity;

    for (const enemy of aliveEnemies) {
      const dist = enemy.group.position.distanceTo(playerPos);
      if (dist < closestDist) {
        closestDist = dist;
        closestEnemy = enemy;
      }
    }

    if (!closestEnemy) return;

    // Calculate angle from player to enemy
    const dir = new THREE.Vector3()
      .subVectors(closestEnemy.group.position, playerPos)
      .normalize();

    // Get camera forward vector (on xz plane)
    const camForward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion);
    camForward.y = 0;
    camForward.normalize();

    // Calculate angle between camera forward and direction to enemy
    const angle = Math.atan2(dir.x, dir.z) - Math.atan2(camForward.x, camForward.z);

    // Determine which indicator to show based on angle
    let indicatorId: string;
    const normalizedAngle = ((angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

    if (normalizedAngle > -Math.PI / 4 && normalizedAngle <= Math.PI / 4) {
      indicatorId = 'damage-top'; // Enemy in front
    } else if (normalizedAngle > Math.PI / 4 && normalizedAngle <= (3 * Math.PI) / 4) {
      indicatorId = 'damage-right'; // Enemy to the right
    } else if (normalizedAngle > (-3 * Math.PI) / 4 && normalizedAngle <= -Math.PI / 4) {
      indicatorId = 'damage-left'; // Enemy to the left
    } else {
      indicatorId = 'damage-bottom'; // Enemy behind
    }

    const indicator = document.getElementById(indicatorId);
    if (indicator) {
      indicator.classList.add('active');
      setTimeout(() => {
        indicator.classList.remove('active');
      }, 400);
    }
  }

  // ============================================================
  // PLAYER DEATH & RESPAWN
  // ============================================================

  private onPlayerDeath(): void {
    this.stop();
    const finalScore = document.getElementById('final-score');
    if (finalScore) finalScore.textContent = String(this.score);
    const overlay = document.getElementById('game-over');
    if (overlay) overlay.style.display = 'flex';
    if (document.pointerLockElement) document.exitPointerLock();
    console.log('[GameEngine] Player killed — game over');
  }

  private respawnPlayer(): void {
    this.player.resetHealth();
    const overlay = document.getElementById('game-over');
    if (overlay) overlay.style.display = 'none';
    this.score = 0;
    this.uiManager.updateScore(this.score);

    // Reset all damage feedback effects
    this.lowHealthActive = false;
    this.criticalHealthActive = false;
    this.uiManager.showLowHealthVignette(false);
    this.uiManager.showFilmGrain(false);
    this.uiManager.resetKillStreak();

    // Clear downed/rescue UI
    this.uiManager.showDownedWarning(false);
    this.uiManager.updateRescueProgress(false);
    this.uiManager.hidePrompt();

    // Reset mission tracking (mission-specific state)
    this.killCount = 0;

    // Mission 1 tracking
    this.missionPhase = 1;
    this.enemiesKilledInZone = 0;
    this.c4PlantProgress = 0;
    this.c4Planting = false;
    this.waveCount = 0;
    this.waveSpawnTimer = 0;
    this.waveSpawnActive = false;
    this.extractionTimer = 60;
    this.extractionWarningPlayed = false;
    this.obj_1_2_completed = false;

    // Mission 2 tracking
    this.mission2Phase = 1;
    this.mission2MarketEnemiesKilled = 0;
    this.mission2IntelProgress = 0;
    this.mission2IntelDownloading = false;
    this.mission2WaveCount = 0;
    this.mission2WaveSpawnActive = false;
    this.mission2WaveSpawnTimer = 0;
    this.mission2ExtractionTimer = 45;
    this.mission2IntelDownloaded = false;
    this.mission2RooftopReached = false;
    this.mission2Objective7Completed = false;

    // Mission 3 tracking
    this.mission3Phase = 1;
    this.mission3CommanderAlphaKilled = false;
    this.mission3CommanderBetaKilled = false;
    this.mission3CommanderGammaKilled = false;
    this.mission3ExtractionTimer = 60;
    this.mission3ExtractionActive = false;
    this.mission3CollapseWarningPlayed = false;
    this.mission3DoorOpenAlpha = false;
    this.mission3DoorOpenBeta = false;

    // Reset mission stats tracking
    this.missionStartTime = performance.now();
    this.totalKillCount = 0;
    this.stealthKillCount = 0;
    this.alertTriggerCount = 0;
    this.extractionBeepLastMark = 60;
    this.phaseTransitionDelay = 0;

    // Reset radio chatter state
    this.firstKillTriggered = false;
    this.lastKillRadioTime = 0;
    this.lastDamageRadioTime = 0;
    this.lastAmbientRadioTime = 0;
    this.lastStealthRadioTime = 0;
    this.extractionLZWarned = false;
    this.waveReinforceAnnounced = false;

    // Reset all scripted event flags
    this.resetEventFlags();

    // Reset active character to wolf
    this.activeCharacter = 'wolf';
    this.uiManager.updateCharacter('wolf');

    // Reset weapon to slot 4
    this.weaponSystem.setActiveCharacter(this.activeCharacter);
    this.weaponSystem.restoreSlot(4);
    const weapon = this.weaponSystem.getCurrentWeapon();
    this.uiManager.updateWeaponSlots(this.weaponSystem.getAllWeapons(), weapon.slot);
    this.uiManager.updateAmmo(weapon.ammo, weapon.maxAmmo, weapon.reserve, weapon.maxReserve);

    // Restart with the current mission
    this.start(this.currentMissionId);
    console.log('[GameEngine] Player respawned');
  }

  // ============================================================
  // COLLISION
  // ============================================================

  public getColliders(): THREE.Mesh[] {
    return this.colliders;
  }

  // ============================================================
  // TERRAIN HEIGHT
  // ============================================================

  /**
   * Returns the terrain height at the given world XZ position.
   * Used by Player to walk on undulating dunes.
   *
   * Formula creates rolling desert dunes using multiple sine waves
   * at different frequencies, with a z-gradient making the spawn
   * area (z:190) elevated and the compound (z:50) a valley.
   */
  public getTerrainHeight(x: number, z: number): number {
    // === UNDULATING DESERT DUNES ===
    // Multiple sine waves at different frequencies for organic look
    
    // Large rolling dunes (slow frequency, high amplitude)
    const dune1 = Math.sin(x * 0.02) * Math.cos(z * 0.015) * 3.0;
    
    // Medium dunes (medium frequency)
    const dune2 = Math.sin(x * 0.05 + 1.3) * Math.sin(z * 0.04 + 0.7) * 1.8;
    
    // Small ripples (high frequency, low amplitude) — wind-blown sand
    const ripple = Math.sin(x * 0.15) * Math.sin(z * 0.12) * 0.4;
    
    // === Z-GRADIENT: Hill at spawn, Valley at compound ===
    // z:190 = spawn (high), z:50 = compound (low)
    // Normalize z from compound (0) to spawn (1)
    const zNorm = Math.max(0, Math.min(1, (z - 40) / 150));
    
    // Smooth gradient: low at compound, high at spawn
    const gradient = Math.pow(zNorm, 0.7) * 8.0; // 0 at z=40, ~8 at z=190
    
    // === COMBINE ===
    // Gradient provides hill/valley shape
    // Dunes add surface detail ON TOP of the gradient
    // Dampen dunes near compound (z:40-65) to keep enemies above ground
    const duneDampening = zNorm < 0.2 ? zNorm / 0.2 : 1.0; // Fade dunes near compound
    
    const totalDunes = (dune1 + dune2 + ripple) * duneDampening;
    
    return gradient + totalDunes;
  }

  // ============================================================
  // DEBUG
  // ============================================================

  public getDebugMode(): DebugMode {
    return this.debugMode;
  }

  // ============================================================
  // MOBILE CONTROLS API — forwarded to Player
  // ============================================================

  /**
   * Simulate a key press/release from mobile touch controls.
   */
  public setMobileKey(code: string, pressed: boolean): void {
    this.player.setMobileKey(code, pressed);
  }

  /**
   * Apply camera look delta from mobile touch drag.
   */
  public applyMobileLook(movementX: number, movementY: number): void {
    this.player.applyMobileLook(movementX, movementY);
  }

  /**
   * Trigger a shot from the mobile fire button.
   */
  public triggerMobileFire(): void {
    if (!this.isRunning || this.isPaused) return;
    this.player.triggerMobileFire();
  }

  /**
   * Set ADS state from the mobile ADS button.
   */
  public setMobileADS(active: boolean): void {
    this.player.setMobileADS(active);
  }

  /**
   * Trigger melee attack from mobile melee button.
   */
  public triggerMobileMelee(): void {
    if (!this.isRunning || this.isPaused) return;
    this.player.triggerMobileMelee();
  }

  /**
   * Switch weapon slot from mobile weapon switch button.
   */
  public switchWeaponSlot(slot: number): void {
    this.player.switchWeaponSlot(slot);
  }

  // ============================================================
  // MISSION SELECTION — Public API for main menu
  // ============================================================

  /**
   * Returns the MissionManager so the main menu can query
   * mission completion and unlock state.
   */
  public getMissionManager(): MissionManager {
    return this.missionManager;
  }

  /**
   * Returns the current mission ID.
   */
  public getCurrentMissionId(): number {
    return this.currentMissionId;
  }

  // ============================================================
  // RESIZE
  // ============================================================

  public resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
