/**
 * EnemyManager.ts
 * Manages enemies with full body models, animations, and AI behaviors.
 *
 * States:
 *   patrol  → walking with weapon down
 *   alert   → weapon raised, scanning
 *   search  → taking cover, peeking to shoot
 *   attack  → firing at player
 *
 * Behavior Types:
 *   patrol   — walks a route (standard)
 *   chatting — two enemies face each other, social; reduced detection
 *             When partner dies: alert to 50 + enter search (heard something)
 *   idle     — stands still, zone-out; reduced detection + subtle weight shift
 *   smoking  — resting with hand to face; very slow reactions (+0.5s cooldown)
 *   scanning — actively watching; increased detection, faster alert
 *             Periodically pauses 2s every 10s to scan more carefully
 *
 * Suppressed Weapon Support:
 *   When player uses suppressed weapon (playerUsingSuppressed = true):
 *   - Enemy detection range halved (50% reduction)
 *   - Alert noise radius halved (10 vs 20 units)
 *
 * Mission 1 Layout (17 enemies across 4 zones):
 *   ZONE 1 — OUTSKIRTS   (z  8  to 20)  : 3 stealth-focus enemies
 *   ZONE 2 — INNER PERIMETER (z -5 to 5) : 5 mixed enemies
 *   ZONE 3 — COMPOUND    (z -18 to -38)  : 5 enemies including elite
 *   ZONE 4 — BORDER WALL (z -40 to -48)  : 4 tower / perimeter guards
 */

import * as THREE from 'three';

type EnemyState = 'patrol' | 'alert' | 'search' | 'attack' | 'dead';

/** Behavior variety — what the enemy is doing while in patrol/alert states. */
type BehaviorType = 'patrol' | 'chatting' | 'idle' | 'smoking' | 'scanning';

/** Describes an active blood particle for lifetime management. */
interface ActiveBloodParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  startTime: number;
  duration: number;
}

/** Identifies which mission zone an enemy belongs to. */
type MissionZone = 'outskirts' | 'inner_perimeter' | 'compound' | 'border_wall';

/** Optional overrides when creating a non-default enemy. */
interface EnemySpawnConfig {
  zone: MissionZone;
  position: [number, number, number];
  patrolRadius?: number;
  speed?: number;
  health?: number;
  maxHealth?: number;
  detectionRange?: number;
  attackRange?: number;
  attackDamage?: number;
  attackCooldown?: number;
  alertLevel?: number;
  /** Patrol pattern: circular (default), linear_z, linear_x, or stationary */
  patrolPattern?: 'circular' | 'linear_z' | 'linear_x' | 'stationary';
  /** Linear patrol half-extent when using a linear pattern */
  patrolExtent?: number;
  /** Optional label for debugging */
  tag?: string;
  /** Behavior variety — determines idle animation and detection modifiers */
  behavior?: BehaviorType;
}

interface Enemy {
  group: THREE.Group;
  state: EnemyState;
  health: number;
  maxHealth: number;
  speed: number;
  detectionRange: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  lastAttackTime: number;
  attackTimer: number;
  patrolPoints: THREE.Vector3[];
  currentPatrolIndex: number;
  alertLevel: number;
  zone: MissionZone;
  // Body parts for animation
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  // Cover
  coverPosition: THREE.Vector3 | null;
  peekTimer: number;
  isPeeking: boolean;
  // Animation
  animTime: number;
  // Stuck detection
  stuckTimer: number;
  // UI
  indicatorMesh: THREE.Mesh;
  // Hit reaction: original materials for flash restoration
  originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  hitFlashEndTime: number;
  // Tag for respawn system
  tag: string;
  // ── Behavior variety ──
  behavior: BehaviorType;
  /** For chatting: reference to the partner enemy they face */
  behaviorTarget: Enemy | null;
  /** Internal timer for behavior-specific animations (look-dir changes, smoking puffs, etc.) */
  behaviorTimer: number;
  /** Original detection range before behavior modifiers are applied */
  baseDetectionRange: number;
  /** Original attack cooldown before behavior modifiers are applied */
  baseAttackCooldown: number;
  /** Scanning enemies: whether currently paused (looking around, not moving) */
  scanningPaused: boolean;
  // ── Detection delay: 0.5s reaction time ──
  /** Accumulates continuous visibility time (seconds). Reset when player leaves cone/LOS. */
  detectionDelayTimer: number;
  /** Whether the delay has been satisfied — alert only rises after this is true. */
  detectionDelaySatisfied: boolean;
}

// ================================================================
// ZONE DEFINITIONS
// ================================================================

/** Zone boundaries: zMin/zMax define the depth slice each zone covers. */
const ZONE_BOUNDS: Record<MissionZone, { zMin: number; zMax: number; minEnemies: number }> = {
  outskirts:        { zMin: 100, zMax: 120, minEnemies: 2 },
  inner_perimeter:  { zMin:  75, zMax: 100, minEnemies: 3 },
  compound:         { zMin:  50, zMax:  75, minEnemies: 3 },
  border_wall:      { zMin:  40, zMax:  50, minEnemies: 2 },
};

/**
 * All 17 mission-1 spawn definitions — BALANCED for gradual difficulty ramp.
 *
 * Difficulty progression:
 *   Zone 1 (Stealth):  3 enemies — easy to sneak past, low detection, slow
 *   Zone 2 (Combat):   5 enemies — moderate, mix of behaviors
 *   Zone 3 (Compound): 5 enemies — hard, all scanning
 *   Zone 4 (Border):   4 enemies — hardest, all scanning, high damage
 */
const MISSION_1_SPAWNS: EnemySpawnConfig[] = [
  // ════════════════════════════════════════════════════════
  // ZONE 1 — OUTSKIRTS (3 enemies)
  // Easy stealth intro — slow, low detection, alert starts at 0
  // ════════════════════════════════════════════════════════
  {
    zone: 'outskirts',
    tag: 'A',
    position: [-8, 0, 106],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 20,
    attackRange: 18,
    attackDamage: 6,
    attackCooldown: 2.0,
    alertLevel: 0,
    behavior: 'idle', // Bored, zone-out — easiest stealth target
  },
  {
    zone: 'outskirts',
    tag: 'B',
    position: [5, 0, 108],
    patrolPattern: 'linear_z',
    patrolExtent: 4,
    speed: 1.2,
    detectionRange: 20,
    attackRange: 18,
    attackDamage: 6,
    attackCooldown: 1.8,
    alertLevel: 0,
    behavior: 'patrol', // Slow patrol — easy to track and avoid
  },
  {
    zone: 'outskirts',
    tag: 'C',
    position: [0, 0, 103],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 20,
    attackRange: 18,
    attackDamage: 8,
    attackCooldown: 2.2,
    alertLevel: 0,
    behavior: 'smoking', // Taking a smoke break — very slow reactions
  },

  // ════════════════════════════════════════════════════════
  // ZONE 2 — INNER PERIMETER (5 enemies)
  // Moderate difficulty — mix of patrol, chatting, and scanning
  // Detection 24-28, alert starts at 10-15
  // ════════════════════════════════════════════════════════
  {
    zone: 'inner_perimeter',
    tag: 'D',
    position: [-12, 0, 92],
    patrolPattern: 'stationary',
    speed: 0,
    health: 80,
    maxHealth: 80,
    detectionRange: 24,
    attackRange: 22,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 10,
    behavior: 'chatting', // Paired with 'E' — social, backs turned
  },
  {
    zone: 'inner_perimeter',
    tag: 'E',
    position: [-14, 0, 92],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 24,
    attackRange: 22,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 10,
    behavior: 'chatting', // Paired with 'D' — social, backs turned
  },
  {
    zone: 'inner_perimeter',
    tag: 'F',
    position: [-5, 0, 80],
    patrolPattern: 'linear_z',
    patrolExtent: 3,
    speed: 1.4,
    detectionRange: 26,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 12,
    behavior: 'scanning', // Actively watching — first scanner encounter
  },
  {
    zone: 'inner_perimeter',
    tag: 'G',
    position: [8, 0, 88],
    patrolPattern: 'linear_z',
    patrolExtent: 4,
    speed: 1.6,
    detectionRange: 26,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 10,
    behavior: 'patrol', // Standard patrol — predictable route
  },
  {
    zone: 'inner_perimeter',
    tag: 'H',
    position: [0, 0, 82],
    patrolPattern: 'circular',
    patrolRadius: 3,
    speed: 1.0,
    health: 120,
    maxHealth: 120,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 1.5,
    alertLevel: 15,
    behavior: 'scanning', // Watchful scanner — wider detection
  },

  // ════════════════════════════════════════════════════════
  // ZONE 3 — COMPOUND (5 enemies)
  // Hard — ALL scanning behavior, detection 28-30, alert 20-30
  // ════════════════════════════════════════════════════════
  {
    zone: 'compound',
    tag: 'I',
    position: [-10, 0, 65],
    patrolPattern: 'linear_x',
    patrolExtent: 4,
    speed: 1.8,
    health: 120,
    maxHealth: 120,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 25,
    behavior: 'scanning', // Actively watching — hard to sneak on
  },
  {
    zone: 'compound',
    tag: 'J',
    position: [10, 0, 57],
    patrolPattern: 'circular',
    patrolRadius: 2,
    speed: 1.4,
    detectionRange: 28,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.0,
    alertLevel: 20,
    behavior: 'scanning', // Scanning guard — covers east side
  },
  {
    zone: 'compound',
    tag: 'K',
    position: [12, 0, 58],
    patrolPattern: 'circular',
    patrolRadius: 2,
    speed: 1.4,
    detectionRange: 28,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.0,
    alertLevel: 20,
    behavior: 'scanning', // Scanning guard — covers east approach
  },
  {
    zone: 'compound',
    tag: 'L',
    position: [0, 0, 55],
    patrolPattern: 'linear_z',
    patrolExtent: 8,
    speed: 1.6,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 30,
    behavior: 'scanning', // Central scanner — longest patrol route
  },
  {
    zone: 'compound',
    tag: 'M',
    position: [-15, 0, 52],
    patrolPattern: 'stationary',
    speed: 0,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 25,
    attackDamage: 14,
    attackCooldown: 1.0,
    alertLevel: 25,
    behavior: 'scanning', // Stationary scanner covering west compound
  },

  // ════════════════════════════════════════════════════════
  // ZONE 4 — BORDER WALL (4 enemies)
  // Hardest — ALL scanning, high damage, detection 30, alert 30
  // ════════════════════════════════════════════════════════
  {
    zone: 'border_wall',
    tag: 'N',
    position: [-3, 0, 46],
    patrolPattern: 'stationary',
    speed: 0,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 25,
    attackDamage: 14,
    attackCooldown: 0.9,
    alertLevel: 30,
    behavior: 'scanning', // Highly alert perimeter guard — gate left
  },
  {
    zone: 'border_wall',
    tag: 'O',
    position: [3, 0, 46],
    patrolPattern: 'stationary',
    speed: 0,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 25,
    attackDamage: 14,
    attackCooldown: 0.9,
    alertLevel: 30,
    behavior: 'scanning', // Highly alert perimeter guard — gate right
  },
  {
    zone: 'border_wall',
    tag: 'P',
    position: [-10, 0, 43],
    patrolPattern: 'linear_x',
    patrolExtent: 5,
    speed: 1.5,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 1.0,
    alertLevel: 30,
    behavior: 'scanning', // Scanning patrol — west perimeter
  },
  {
    zone: 'border_wall',
    tag: 'Q',
    position: [10, 0, 43],
    patrolPattern: 'linear_x',
    patrolExtent: 5,
    speed: 1.5,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 1.0,
    alertLevel: 30,
    behavior: 'scanning', // Scanning patrol — east perimeter
  },
];

// ═══════════════════════════════════════════════════════════════
// MISSION 2 — IRON RAIN: Urban Warfare (20 enemies across 4 zones)
// ═══════════════════════════════════════════════════════════════
// Layout: Tight urban streets, alleys, market stalls, rooftops,
//         central plaza with fountain (objective).
//
// Difficulty progression:
//   Zone 1 (Alleys):    4 enemies — patrol/idle, low detection, stealth intro
//   Zone 2 (Market):    6 enemies — patrol/chatting, moderate, combat ramp
//   Zone 3 (Rooftops):  5 enemies — scanning/elite, high detection, vertical
//   Zone 4 (Cache):     5 enemies — all scanning, hardest, defense holdout
// ═══════════════════════════════════════════════════════════════

/** Zone boundaries for Mission 2. */
const MISSION_2_ZONE_BOUNDS: Record<MissionZone, { zMin: number; zMax: number; minEnemies: number }> = {
  outskirts:        { zMin: 140, zMax: 170, minEnemies: 3 },  // Eastern district alleys
  inner_perimeter:  { zMin: 110, zMax: 140, minEnemies: 4 },  // Market area
  compound:         { zMin:  85, zMax: 110, minEnemies: 3 },  // Rooftop complex
  border_wall:      { zMin:  50, zMax:  85, minEnemies: 3 },  // Weapons cache / plaza
};

const MISSION_2_SPAWNS: EnemySpawnConfig[] = [
  // ════════════════════════════════════════════════════════
  // ZONE 1 — EASTERN DISTRICT ALLEYS (4 enemies)
  // Stealth introduction — slow, low detection, easy targets
  // ════════════════════════════════════════════════════════
  {
    zone: 'outskirts',
    tag: 'M2_A',
    position: [-8, 0, 162],
    patrolPattern: 'linear_z',
    patrolExtent: 3,
    speed: 1.0,
    detectionRange: 18,
    attackRange: 16,
    attackDamage: 6,
    attackCooldown: 2.2,
    alertLevel: 0,
    behavior: 'idle', // Bored sentry — easiest stealth target
  },
  {
    zone: 'outskirts',
    tag: 'M2_B',
    position: [6, 0, 158],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 18,
    attackRange: 16,
    attackDamage: 6,
    attackCooldown: 2.0,
    alertLevel: 0,
    behavior: 'smoking', // Taking a smoke break — very slow reactions
  },
  {
    zone: 'outskirts',
    tag: 'M2_C',
    position: [-3, 0, 152],
    patrolPattern: 'linear_x',
    patrolExtent: 4,
    speed: 1.2,
    detectionRange: 20,
    attackRange: 18,
    attackDamage: 8,
    attackCooldown: 1.8,
    alertLevel: 0,
    behavior: 'patrol', // Walking patrol through alley — trackable
  },
  {
    zone: 'outskirts',
    tag: 'M2_D',
    position: [10, 0, 148],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 20,
    attackRange: 18,
    attackDamage: 8,
    attackCooldown: 2.0,
    alertLevel: 0,
    behavior: 'idle', // Watching an alley entrance
  },

  // ════════════════════════════════════════════════════════
  // ZONE 2 — MARKET AREA (6 enemies)
  // Moderate difficulty — mixed patrol and chatting pairs
  // ════════════════════════════════════════════════════════
  {
    zone: 'inner_perimeter',
    tag: 'M2_E',
    position: [-6, 0, 135],
    patrolPattern: 'linear_z',
    patrolExtent: 4,
    speed: 1.4,
    detectionRange: 24,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 10,
    behavior: 'patrol', // Market patrol — predictable route
  },
  {
    zone: 'inner_perimeter',
    tag: 'M2_F',
    position: [8, 0, 130],
    patrolPattern: 'linear_z',
    patrolExtent: 3,
    speed: 1.2,
    health: 80,
    maxHealth: 80,
    detectionRange: 24,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 10,
    behavior: 'chatting', // Paired with M2_G
  },
  {
    zone: 'inner_perimeter',
    tag: 'M2_G',
    position: [10, 0, 130],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 24,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 10,
    behavior: 'chatting', // Paired with M2_F
  },
  {
    zone: 'inner_perimeter',
    tag: 'M2_H',
    position: [-10, 0, 125],
    patrolPattern: 'circular',
    patrolRadius: 3,
    speed: 1.2,
    health: 80,
    maxHealth: 80,
    detectionRange: 26,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 12,
    behavior: 'patrol', // Central market patrol
  },
  {
    zone: 'inner_perimeter',
    tag: 'M2_I',
    position: [3, 0, 120],
    patrolPattern: 'linear_x',
    patrolExtent: 5,
    speed: 1.4,
    detectionRange: 26,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.0,
    alertLevel: 15,
    behavior: 'scanning', // Market lookout — first scanner
  },
  {
    zone: 'inner_perimeter',
    tag: 'M2_J',
    position: [-4, 0, 118],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 26,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.2,
    alertLevel: 12,
    behavior: 'chatting', // Paired with M2_K in rooftop zone
  },

  // ════════════════════════════════════════════════════════
  // ZONE 3 — ROOFTOP COMPLEX (5 enemies)
  // Hard — ALL scanning, high detection, elite stats
  // ════════════════════════════════════════════════════════
  {
    zone: 'compound',
    tag: 'M2_K',
    position: [-8, 0, 105],
    patrolPattern: 'linear_x',
    patrolExtent: 4,
    speed: 1.6,
    health: 120,
    maxHealth: 120,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 25,
    behavior: 'scanning', // Rooftop overwatch — elite
  },
  {
    zone: 'compound',
    tag: 'M2_L',
    position: [7, 0, 100],
    patrolPattern: 'circular',
    patrolRadius: 2,
    speed: 1.4,
    health: 100,
    maxHealth: 100,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 10,
    attackCooldown: 1.0,
    alertLevel: 20,
    behavior: 'scanning', // Stairway guard
  },
  {
    zone: 'compound',
    tag: 'M2_M',
    position: [0, 0, 95],
    patrolPattern: 'linear_z',
    patrolExtent: 5,
    speed: 1.6,
    health: 120,
    maxHealth: 120,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 25,
    behavior: 'scanning', // Corridor patrol — elite
  },
  {
    zone: 'compound',
    tag: 'M2_N',
    position: [-12, 0, 92],
    patrolPattern: 'stationary',
    speed: 0,
    health: 100,
    maxHealth: 100,
    detectionRange: 28,
    attackRange: 25,
    attackDamage: 14,
    attackCooldown: 1.0,
    alertLevel: 25,
    behavior: 'scanning', // Stationary elite — west flank
  },
  {
    zone: 'compound',
    tag: 'M2_O',
    position: [10, 0, 88],
    patrolPattern: 'linear_x',
    patrolExtent: 3,
    speed: 1.8,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.8,
    alertLevel: 28,
    behavior: 'scanning', // Fast scanner — east approach
  },

  // ════════════════════════════════════════════════════════
  // ZONE 4 — WEAPONS CACHE / CENTRAL PLAZA (5 enemies)
  // Hardest — ALL scanning, elite-tier, defense holdout
  // ════════════════════════════════════════════════════════
  {
    zone: 'border_wall',
    tag: 'M2_P',
    position: [-5, 0, 80],
    patrolPattern: 'stationary',
    speed: 0,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 25,
    attackDamage: 14,
    attackCooldown: 0.9,
    alertLevel: 30,
    behavior: 'scanning', // Plaza guard — north
  },
  {
    zone: 'border_wall',
    tag: 'M2_Q',
    position: [5, 0, 75],
    patrolPattern: 'linear_x',
    patrolExtent: 4,
    speed: 1.5,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 30,
    behavior: 'scanning', // Fountain patrol
  },
  {
    zone: 'border_wall',
    tag: 'M2_R',
    position: [-8, 0, 70],
    patrolPattern: 'circular',
    patrolRadius: 2,
    speed: 1.4,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 30,
    behavior: 'scanning', // Cache perimeter — west
  },
  {
    zone: 'border_wall',
    tag: 'M2_S',
    position: [8, 0, 68],
    patrolPattern: 'circular',
    patrolRadius: 2,
    speed: 1.4,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 30,
    behavior: 'scanning', // Cache perimeter — east
  },
  {
    zone: 'border_wall',
    tag: 'M2_T',
    position: [0, 0, 62],
    patrolPattern: 'stationary',
    speed: 0,
    health: 150,
    maxHealth: 150,
    detectionRange: 32,
    attackRange: 25,
    attackDamage: 16,
    attackCooldown: 0.8,
    alertLevel: 30,
    behavior: 'scanning', // Cache room elite — final defender
  },
];

// ═══════════════════════════════════════════════════════════════
// MISSION 3 — THE NEST: Elimination (24 enemies across 5 zones)
// ═══════════════════════════════════════════════════════════════
// Layout: Underground bunker complex — narrow corridors, 3 chambers
//         each holding a commander + guards, reinforced doors.
//
// Difficulty progression:
//   Zone 1 (Perimeter):  6 enemies — patrol/idle, stealth intro
//   Zone 2 (Alpha):      5 + Commander Alpha — scanning, combat ramp
//   Zone 3 (Beta):       5 + Commander Beta  — scanning, elite guards
//   Zone 4 (Gamma):      5 + Commander Gamma — hardest, commanders buffed
//   Zone 5 (Extraction): 3 enemies — reinforcements, fast reactions
//
// Commander stats: 200 HP, 18 damage, 0.7s cooldown, scanning, all-alert
// ═══════════════════════════════════════════════════════════════

/** Zone boundaries for Mission 3. */
const MISSION_3_ZONE_BOUNDS: Record<MissionZone, { zMin: number; zMax: number; minEnemies: number }> = {
  outskirts:        { zMin: 140, zMax: 190, minEnemies: 4 },  // Outer perimeter / entrance
  inner_perimeter:  { zMin: 100, zMax: 140, minEnemies: 4 },  // Chamber Alpha
  compound:         { zMin:  60, zMax: 100, minEnemies: 4 },  // Chamber Beta
  border_wall:      { zMin:  20, zMax:  60, minEnemies: 3 },  // Chamber Gamma + Extraction
};

const MISSION_3_SPAWNS: EnemySpawnConfig[] = [
  // ════════════════════════════════════════════════════════
  // ZONE 1 — OUTER PERIMETER (6 enemies)
  // Bunker entrance approach — mixed patrol/idle, low-medium detection
  // ════════════════════════════════════════════════════════
  {
    zone: 'outskirts',
    tag: 'M3_A',
    position: [-3, 0, 185],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 22,
    attackRange: 20,
    attackDamage: 8,
    attackCooldown: 2.0,
    alertLevel: 0,
    behavior: 'idle', // Sentry at outer checkpoint — bored
  },
  {
    zone: 'outskirts',
    tag: 'M3_B',
    position: [4, 0, 178],
    patrolPattern: 'linear_z',
    patrolExtent: 4,
    speed: 1.2,
    detectionRange: 22,
    attackRange: 20,
    attackDamage: 8,
    attackCooldown: 1.8,
    alertLevel: 0,
    behavior: 'patrol', // Walking patrol along perimeter wall
  },
  {
    zone: 'outskirts',
    tag: 'M3_C',
    position: [-8, 0, 170],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 20,
    attackRange: 18,
    attackDamage: 8,
    attackCooldown: 2.2,
    alertLevel: 0,
    behavior: 'smoking', // Smoke break by the entrance — slow reactions
  },
  {
    zone: 'outskirts',
    tag: 'M3_D',
    position: [6, 0, 165],
    patrolPattern: 'linear_x',
    patrolExtent: 5,
    speed: 1.4,
    detectionRange: 24,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.5,
    alertLevel: 5,
    behavior: 'patrol', // Corridor patrol — covers entry approach
  },
  {
    zone: 'outskirts',
    tag: 'M3_E',
    position: [-5, 0, 155],
    patrolPattern: 'stationary',
    speed: 0,
    health: 80,
    maxHealth: 80,
    detectionRange: 24,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.5,
    alertLevel: 5,
    behavior: 'chatting', // Paired with M3_F — talking at checkpoint
  },
  {
    zone: 'outskirts',
    tag: 'M3_F',
    position: [-3, 0, 155],
    patrolPattern: 'stationary',
    speed: 0,
    detectionRange: 24,
    attackRange: 20,
    attackDamage: 10,
    attackCooldown: 1.5,
    alertLevel: 5,
    behavior: 'chatting', // Paired with M3_E — backs turned
  },

  // ════════════════════════════════════════════════════════
  // ZONE 2 — CHAMBER ALPHA (5 guards + Commander Alpha)
  // First combat zone — scanning guards, commander in center
  // ════════════════════════════════════════════════════════
  {
    zone: 'inner_perimeter',
    tag: 'M3_ALPHA',
    position: [0, 0, 120],
    patrolPattern: 'stationary',
    speed: 0,
    health: 200,
    maxHealth: 200,
    detectionRange: 32,
    attackRange: 25,
    attackDamage: 18,
    attackCooldown: 0.7,
    alertLevel: 30,
    behavior: 'scanning', // COMMANDER ALPHA — heavily armored, fast reactions
  },
  {
    zone: 'inner_perimeter',
    tag: 'M3_G',
    position: [-8, 0, 125],
    patrolPattern: 'linear_x',
    patrolExtent: 4,
    speed: 1.6,
    health: 100,
    maxHealth: 100,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 1.0,
    alertLevel: 20,
    behavior: 'scanning', // Alpha's bodyguard — west side
  },
  {
    zone: 'inner_perimeter',
    tag: 'M3_H',
    position: [8, 0, 125],
    patrolPattern: 'linear_x',
    patrolExtent: 4,
    speed: 1.6,
    health: 100,
    maxHealth: 100,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 1.0,
    alertLevel: 20,
    behavior: 'scanning', // Alpha's bodyguard — east side
  },
  {
    zone: 'inner_perimeter',
    tag: 'M3_I',
    position: [-5, 0, 115],
    patrolPattern: 'circular',
    patrolRadius: 3,
    speed: 1.4,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 1.0,
    alertLevel: 20,
    behavior: 'scanning', // Chamber patrol — north entrance
  },
  {
    zone: 'inner_perimeter',
    tag: 'M3_J',
    position: [5, 0, 115],
    patrolPattern: 'circular',
    patrolRadius: 3,
    speed: 1.4,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 1.0,
    alertLevel: 20,
    behavior: 'scanning', // Chamber patrol — south exit
  },
  {
    zone: 'inner_perimeter',
    tag: 'M3_K',
    position: [0, 0, 112],
    patrolPattern: 'stationary',
    speed: 0,
    health: 100,
    maxHealth: 100,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 14,
    attackCooldown: 0.9,
    alertLevel: 25,
    behavior: 'scanning', // Door guard — blocks path to Beta
  },

  // ════════════════════════════════════════════════════════
  // ZONE 3 — CHAMBER BETA (5 guards + Commander Beta)
  // Mid-bunker — elite scanning, higher detection
  // ════════════════════════════════════════════════════════
  {
    zone: 'compound',
    tag: 'M3_BETA',
    position: [0, 0, 80],
    patrolPattern: 'stationary',
    speed: 0,
    health: 200,
    maxHealth: 200,
    detectionRange: 34,
    attackRange: 25,
    attackDamage: 18,
    attackCooldown: 0.7,
    alertLevel: 35,
    behavior: 'scanning', // COMMANDER BETA — elite officer, enhanced awareness
  },
  {
    zone: 'compound',
    tag: 'M3_L',
    position: [-7, 0, 85],
    patrolPattern: 'linear_x',
    patrolExtent: 5,
    speed: 1.8,
    health: 120,
    maxHealth: 120,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 14,
    attackCooldown: 0.9,
    alertLevel: 25,
    behavior: 'scanning', // Beta's bodyguard — fast, elite
  },
  {
    zone: 'compound',
    tag: 'M3_M',
    position: [7, 0, 85],
    patrolPattern: 'linear_x',
    patrolExtent: 5,
    speed: 1.8,
    health: 120,
    maxHealth: 120,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 14,
    attackCooldown: 0.9,
    alertLevel: 25,
    behavior: 'scanning', // Beta's bodyguard — fast, elite
  },
  {
    zone: 'compound',
    tag: 'M3_N',
    position: [-4, 0, 75],
    patrolPattern: 'circular',
    patrolRadius: 3,
    speed: 1.6,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 25,
    behavior: 'scanning', // Corridor patrol — covers Beta's flanks
  },
  {
    zone: 'compound',
    tag: 'M3_O',
    position: [4, 0, 75],
    patrolPattern: 'circular',
    patrolRadius: 3,
    speed: 1.6,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.9,
    alertLevel: 25,
    behavior: 'scanning', // Corridor patrol — covers Beta's flanks
  },
  {
    zone: 'compound',
    tag: 'M3_P',
    position: [0, 0, 72],
    patrolPattern: 'stationary',
    speed: 0,
    health: 120,
    maxHealth: 120,
    detectionRange: 32,
    attackRange: 25,
    attackDamage: 16,
    attackCooldown: 0.8,
    alertLevel: 30,
    behavior: 'scanning', // Door guard — blocks path to Gamma
  },

  // ════════════════════════════════════════════════════════
  // ZONE 4 — CHAMBER GAMMA (5 guards + Commander Gamma)
  // Deepest bunker — hardest enemies, highest stats
  // ════════════════════════════════════════════════════════
  {
    zone: 'border_wall',
    tag: 'M3_GAMMA',
    position: [0, 0, 40],
    patrolPattern: 'stationary',
    speed: 0,
    health: 200,
    maxHealth: 200,
    detectionRange: 36,
    attackRange: 28,
    attackDamage: 20,
    attackCooldown: 0.6,
    alertLevel: 40,
    behavior: 'scanning', // COMMANDER GAMMA — final boss, max stats
  },
  {
    zone: 'border_wall',
    tag: 'M3_Q',
    position: [-8, 0, 45],
    patrolPattern: 'linear_x',
    patrolExtent: 5,
    speed: 2.0,
    health: 150,
    maxHealth: 150,
    detectionRange: 32,
    attackRange: 25,
    attackDamage: 16,
    attackCooldown: 0.8,
    alertLevel: 30,
    behavior: 'scanning', // Gamma's elite guard — west, fast
  },
  {
    zone: 'border_wall',
    tag: 'M3_R',
    position: [8, 0, 45],
    patrolPattern: 'linear_x',
    patrolExtent: 5,
    speed: 2.0,
    health: 150,
    maxHealth: 150,
    detectionRange: 32,
    attackRange: 25,
    attackDamage: 16,
    attackCooldown: 0.8,
    alertLevel: 30,
    behavior: 'scanning', // Gamma's elite guard — east, fast
  },
  {
    zone: 'border_wall',
    tag: 'M3_S',
    position: [-5, 0, 35],
    patrolPattern: 'circular',
    patrolRadius: 3,
    speed: 1.8,
    health: 120,
    maxHealth: 120,
    detectionRange: 32,
    attackRange: 25,
    attackDamage: 14,
    attackCooldown: 0.8,
    alertLevel: 30,
    behavior: 'scanning', // Rear guard — covers escape routes
  },
  {
    zone: 'border_wall',
    tag: 'M3_T',
    position: [5, 0, 35],
    patrolPattern: 'circular',
    patrolRadius: 3,
    speed: 1.8,
    health: 120,
    maxHealth: 120,
    detectionRange: 32,
    attackRange: 25,
    attackDamage: 14,
    attackCooldown: 0.8,
    alertLevel: 30,
    behavior: 'scanning', // Rear guard — covers escape routes
  },
  {
    zone: 'border_wall',
    tag: 'M3_U',
    position: [0, 0, 32],
    patrolPattern: 'stationary',
    speed: 0,
    health: 150,
    maxHealth: 150,
    detectionRange: 34,
    attackRange: 25,
    attackDamage: 18,
    attackCooldown: 0.7,
    alertLevel: 35,
    behavior: 'scanning', // Final sentinel — last line of defense
  },

  // ════════════════════════════════════════════════════════
  // ZONE 5 — EXTRACTION CORRIDOR (3 enemies)
  // Reinforcements during extraction escape — fast, aggressive
  // ════════════════════════════════════════════════════════
  {
    zone: 'outskirts',
    tag: 'M3_V',
    position: [-4, 0, 130],
    patrolPattern: 'stationary',
    speed: 0,
    health: 80,
    maxHealth: 80,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.8,
    alertLevel: 40,
    behavior: 'scanning', // Extraction reinforcement — corridor ambush
  },
  {
    zone: 'outskirts',
    tag: 'M3_W',
    position: [4, 0, 145],
    patrolPattern: 'stationary',
    speed: 0,
    health: 80,
    maxHealth: 80,
    detectionRange: 28,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.8,
    alertLevel: 40,
    behavior: 'scanning', // Extraction reinforcement — mid-corridor
  },
  {
    zone: 'outskirts',
    tag: 'M3_X',
    position: [0, 0, 160],
    patrolPattern: 'stationary',
    speed: 0,
    health: 80,
    maxHealth: 80,
    detectionRange: 30,
    attackRange: 22,
    attackDamage: 12,
    attackCooldown: 0.8,
    alertLevel: 40,
    behavior: 'scanning', // Extraction reinforcement — near exit
  },
];

// ================================================================
// BEHAVIOR MODIFIERS
// ================================================================

/** Detection range multiplier applied per behavior type. */
const BEHAVIOR_DETECTION_MULT: Record<BehaviorType, number> = {
  patrol:   1.0,   // Standard
  chatting: 0.5,   // 50% reduced — distracted by conversation
  idle:     0.7,   // 30% reduced — bored / zone-out
  smoking:  0.6,   // 40% reduced — one hand occupied, slow
  scanning: 1.2,   // 20% increased — actively watching
};

/** Attack cooldown multiplier per behavior (higher = slower reactions). */
const BEHAVIOR_REACTION_MULT: Record<BehaviorType, number> = {
  patrol:   1.0,
  chatting: 0.7,   // Faster reaction when alerted from chatting (shock factor)
  idle:     1.3,   // Slightly slower waking up
  smoking:  2.0,   // Doubled reaction time — fumbling with weapon
  scanning: 0.6,   // Fastest reactions — already weapon ready
};

// ═══════════════════════════════════════════════════════════════
// STEALTH CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Time (seconds) an enemy must continuously see the player before alerting (reaction delay). */
const DETECTION_DELAY: number = 0.5;

/** Half-angle of the enemy detection cone in radians (90° total = ±45°). */
const DETECTION_CONE_HALF_ANGLE: number = Math.PI / 4; // 45°

/** Noise radius for unsuppressed gunfire — enemies within this range hear it. */
const GUNFIRE_NOISE_RADIUS: number = 50;

/** Alert level applied at point-blank range from gunfire. Scales down with distance. */
const GUNFIRE_ALERT_AMOUNT: number = 60;

// ================================================================
// ENEMY MANAGER
// ================================================================

export class EnemyManager {
  private scene: THREE.Scene;
  private enemies: Enemy[] = [];
  private currentTime: number = 0;
  private colliders: THREE.Mesh[] = [];
  private lastAttackDamage: number = 0;
  private terrainHeightProvider: ((x: number, z: number) => number) | null = null;
  private lastPlayerZone: MissionZone | null = null;

  public onAttackPlayer: (damage: number) => void = () => {};
  public onAttackCallback: ((fromPos: THREE.Vector3, toPos: THREE.Vector3) => void) | null = null;
  public playerPosition: THREE.Vector3 = new THREE.Vector3();

  /** When true, player is using a suppressed weapon — enemies detect at 50% range. */
  public playerUsingSuppressed: boolean = false;

  // Blood particle system
  private activeBloodParticles: ActiveBloodParticle[] = [];
  private readonly BLOOD_DURATION: number = 500;
  private readonly BLOOD_GRAVITY: number = -8;
  private readonly BLOOD_PARTICLE_COUNT: number = 5;
  private readonly KNOCKBACK_FORCE: number = 0.3;
  private readonly HIT_FLASH_DURATION: number = 50; // 50ms white flash

  // ── Wave counter for Phase 4 difficulty scaling ──
  private waveCounter: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // ============================================================
  // SPAWNING — MISSION 1
  // ============================================================

  /**
   * Spawn all 17 enemies for Mission 1 across four tactical zones.
   * Links chatting pairs after all enemies are created.
   */
  public spawnMission1Enemies(scene: THREE.Scene): void {
    for (const spawn of MISSION_1_SPAWNS) {
      const enemy = this.createEnemy(spawn);
      this.enemies.push(enemy);
      this.scene.add(enemy.group);
    }

    // Link chatting pairs — after all enemies exist so references are stable
    this.linkChattingPairs();

    console.log(
      `[EnemyManager] Mission 1 spawned ${this.enemies.length} enemies across 4 zones`
    );
  }

  /**
   * Links chatting enemies to their partner based on proximity / tag pairing.
   * For each pair, they face each other at a slight angle (social distance ~2.5 units).
   */
  private linkChattingPairs(): void {
    // Gather all alive chatting enemies and pair them up
    const chatEnemies = this.enemies.filter(
      (e) => e.behavior === 'chatting' && e.state !== 'dead'
    );

    // Find pairs that are close to each other (within 8 units)
    const paired = new Set<Enemy>();

    for (let i = 0; i < chatEnemies.length; i++) {
      if (paired.has(chatEnemies[i])) continue;

      let bestPartner: Enemy | null = null;
      let bestDist = Infinity;

      for (let j = i + 1; j < chatEnemies.length; j++) {
        if (paired.has(chatEnemies[j])) continue;
        const dist = chatEnemies[i].group.position.distanceTo(chatEnemies[j].group.position);
        if (dist < bestDist) {
          bestDist = dist;
          bestPartner = chatEnemies[j];
        }
      }

      if (bestPartner) {
        chatEnemies[i].behaviorTarget = bestPartner;
        bestPartner.behaviorTarget = chatEnemies[i];
        paired.add(chatEnemies[i]);
        paired.add(bestPartner);

        // Position them facing each other at ~2.5 units apart
        this.positionChattingPair(chatEnemies[i], bestPartner);
      }
    }
  }

  /**
   * Positions two chatting enemies facing each other at social distance.
   */
  private positionChattingPair(a: Enemy, b: Enemy): void {
    const mid = new THREE.Vector3()
      .addVectors(a.group.position, b.group.position)
      .multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(b.group.position, a.group.position).normalize();
    const separation = 2.5;

    // Place them at separation distance from center, facing each other
    a.group.position.copy(mid).add(dir.clone().multiplyScalar(-separation / 2));
    b.group.position.copy(mid).add(dir.clone().multiplyScalar(separation / 2));

    // Face each other
    const angleToB = Math.atan2(dir.x, dir.z);
    const angleToA = Math.atan2(-dir.x, -dir.z);
    a.group.rotation.y = angleToB;
    b.group.rotation.y = angleToA;
  }

  /**
   * Backward-compatible alias. Delegates to spawnMission1Enemies.
   */
  public spawnEnemies(scene: THREE.Scene): void {
    this.spawnMission1Enemies(scene);
  }

  // ============================================================
  // SPAWNING — MISSION 2: IRON RAIN (Urban Warfare)
  // ============================================================

  /**
   * Spawn all 20 enemies for Mission 2 across four urban zones.
   * Links chatting pairs after all enemies are created.
   */
  public spawnMission2Enemies(scene: THREE.Scene): void {
    for (const spawn of MISSION_2_SPAWNS) {
      const enemy = this.createEnemy(spawn);
      this.enemies.push(enemy);
      this.scene.add(enemy.group);
    }

    // Link chatting pairs — after all enemies exist so references are stable
    this.linkChattingPairs();

    console.log(
      `[EnemyManager] Mission 2 spawned ${this.enemies.length} enemies across 4 zones`
    );
  }

  // ============================================================
  // SPAWNING — MISSION 3: THE NEST (Elimination)
  // ============================================================

  /**
   * Spawn all 24 enemies for Mission 3 across five tactical zones.
   * Underground bunker complex: perimeter, 3 commander chambers, extraction.
   * Links chatting pairs after all enemies are created.
   */
  public spawnMission3Enemies(scene: THREE.Scene): void {
    for (const spawn of MISSION_3_SPAWNS) {
      const enemy = this.createEnemy(spawn);
      this.enemies.push(enemy);
      this.scene.add(enemy.group);
    }

    // Link chatting pairs — after all enemies exist so references are stable
    this.linkChattingPairs();

    console.log(
      `[EnemyManager] Mission 3 spawned ${this.enemies.length} enemies across 5 zones`
    );
  }

  /**
   * Spawns a wave of enemies at the given positions.
   * Used during phase 4 counter-attack waves (non-directional fallback).
   * Applies wave-based scaling matching spawnWaveDirectional.
   */
  public spawnWave(
    scene: THREE.Scene,
    count: number,
    centerZ: number,
    spreadX: number = 12,
    spreadZ: number = 6,
  ): void {
    this.waveCounter++;
    const waveNum = Math.min(this.waveCounter, 3);

    // Wave stats (matches spawnWaveDirectional)
    const WAVE_STATS: Record<number, { health: number; speed: number; damage: number; detection: number; cooldown: number }> = {
      1: { health: 80,  speed: 5, damage: 8,  detection: 28, cooldown: 1.0 },
      2: { health: 80,  speed: 5, damage: 10, detection: 30, cooldown: 0.9 },
      3: { health: 150, speed: 7, damage: 12, detection: 32, cooldown: 0.7 },
    };

    const stats = WAVE_STATS[waveNum] ?? WAVE_STATS[1];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * spreadX;
      const z = centerZ + (Math.random() - 0.5) * spreadZ;

      // Wave 2: alternate standard/fast
      let enemySpeed = stats.speed;
      let enemyHealth = stats.health;
      if (waveNum === 2 && i % 2 === 0) {
        enemySpeed += 2; // Fast variant
      }

      const cfg: EnemySpawnConfig = {
        zone: 'compound',
        position: [x, 0, z],
        health: enemyHealth,
        maxHealth: stats.health,
        speed: enemySpeed,
        detectionRange: stats.detection,
        attackRange: 18,
        attackDamage: stats.damage,
        attackCooldown: stats.cooldown,
        alertLevel: 100,
        patrolPattern: 'circular',
        patrolRadius: 3,
        behavior: 'scanning',
      };
      const enemy = this.createEnemy(cfg);
      // Start in alert state so counter-attack enemies are immediately hostile
      enemy.state = 'alert';
      enemy.alertLevel = 100;
      this.enemies.push(enemy);
      scene.add(enemy.group);
    }
    console.log(`[EnemyManager] Spawned wave ${this.waveCounter}/3 (${count} enemies) at z=${centerZ}`);
  }

  /**
   * Spawns a wave of enemies from a specific DIRECTION relative to the player.
   * Enemies spawn behind buildings/walls, at least 30 units away, then run
   * toward the player's position.
   *
   * Wave-based difficulty scaling (3 waves total):
   *   Wave 1: Standard enemies — HP 80, speed 5, damage 8
   *   Wave 2: Mix of standard + fast — half at speed 7, detection 30
   *   Wave 3: Elite enemies — HP 150, speed 7, damage 12, faster reactions
   *
   * @param scene - The Three.js scene
   * @param count - Number of enemies to spawn
   * @param playerPos - Current player position (spawn direction is calculated from this)
   * @param direction - Cardinal direction: 'south', 'west', 'east' (enemies approach FROM this direction)
   */
  public spawnWaveDirectional(
    scene: THREE.Scene,
    count: number,
    playerPos: THREE.Vector3,
    direction: 'south' | 'west' | 'east'
  ): void {
    this.waveCounter++;

    // Calculate spawn center based on direction
    let spawnCenterX = playerPos.x;
    let spawnCenterZ = playerPos.z;

    const SPAWN_DISTANCE = 35; // At least 30 units away from player

    switch (direction) {
      case 'south':
        spawnCenterZ = playerPos.z + SPAWN_DISTANCE;
        spawnCenterX = playerPos.x + (Math.random() - 0.5) * 16;
        break;
      case 'west':
        spawnCenterX = playerPos.x - SPAWN_DISTANCE;
        spawnCenterZ = playerPos.z + (Math.random() - 0.5) * 12;
        break;
      case 'east':
        spawnCenterX = playerPos.x + SPAWN_DISTANCE;
        spawnCenterZ = playerPos.z + (Math.random() - 0.5) * 12;
        break;
    }

    // Clamp to playable area
    spawnCenterX = Math.max(-40, Math.min(40, spawnCenterX));
    spawnCenterZ = Math.max(44, Math.min(190, spawnCenterZ));

    // ═══ WAVE-BASED DIFFICULTY SCALING ═══
    // Each wave increases stats: HP, speed, damage, detection
    const waveNum = Math.min(this.waveCounter, 3); // Cap at 3

    // Per-wave stat tables
    const WAVE_STATS: Record<number, {
      health: number; maxHealth: number; speed: number;
      detectionRange: number; attackRange: number;
      attackDamage: number; attackCooldown: number;
    }> = {
      1: { // Wave 1 — Standard
        health: 80,
        maxHealth: 80,
        speed: 5,
        detectionRange: 28,
        attackRange: 18,
        attackDamage: 8,
        attackCooldown: 1.0,
      },
      2: { // Wave 2 — Mix (fast variants mixed in)
        health: 80,
        maxHealth: 80,
        speed: 5,       // Base speed (fast variants get +2)
        detectionRange: 30,
        attackRange: 18,
        attackDamage: 10,
        attackCooldown: 0.9,
      },
      3: { // Wave 3 — Elite
        health: 150,
        maxHealth: 150,
        speed: 7,
        detectionRange: 32,
        attackRange: 20,
        attackDamage: 12,
        attackCooldown: 0.7,
      },
    };

    const stats = WAVE_STATS[waveNum] ?? WAVE_STATS[1];

    // Spread enemies in a line perpendicular to the approach direction
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 4; // 4 units apart
      let x = spawnCenterX;
      let z = spawnCenterZ;

      if (direction === 'south') {
        x += spread;
      } else {
        z += spread;
      }

      // Add some randomness
      x += (Math.random() - 0.5) * 3;
      z += (Math.random() - 0.5) * 3;

      // Ensure within playable bounds
      x = Math.max(-40, Math.min(40, x));
      z = Math.max(44, Math.min(190, z));

      // ═══ WAVE 2 VARIANTS: alternate between standard and fast ═══
      let waveSpeed = stats.speed;
      let waveHealth = stats.health;
      let waveMaxHealth = stats.maxHealth;
      let waveBehavior: BehaviorType = 'scanning';

      if (waveNum === 2) {
        // Even-indexed enemies are fast flankers, odd-indexed are standard
        if (i % 2 === 0) {
          waveSpeed = stats.speed + 2; // Fast variant: speed 7
          waveBehavior = 'scanning';
        } else {
          waveSpeed = stats.speed; // Standard: speed 5
          waveBehavior = 'patrol';
        }
      } else if (waveNum === 3) {
        // All elite — scanning, fast, tough
        waveBehavior = 'scanning';
      }

      const cfg: EnemySpawnConfig = {
        zone: 'compound',
        position: [x, 0, z],
        health: waveHealth,
        maxHealth: waveMaxHealth,
        speed: waveSpeed,
        detectionRange: stats.detectionRange,
        attackRange: stats.attackRange,
        attackDamage: stats.attackDamage,
        attackCooldown: stats.attackCooldown,
        alertLevel: 100,
        patrolPattern: 'stationary',
        patrolRadius: 0,
        behavior: waveBehavior,
      };
      const enemy = this.createEnemy(cfg);
      // Start in alert state so counter-attack enemies are immediately hostile
      enemy.state = 'alert';
      enemy.alertLevel = 100;

      // Set their patrol point to run TOWARD the player
      const runTarget = new THREE.Vector3(
        playerPos.x + (Math.random() - 0.5) * 8,
        0,
        playerPos.z + (Math.random() - 0.5) * 8
      );
      enemy.patrolPoints = [
        enemy.group.position.clone(),
        runTarget,
      ];
      enemy.currentPatrolIndex = 1; // Start moving toward player

      this.enemies.push(enemy);
      scene.add(enemy.group);
    }

    console.log(
      `[EnemyManager] Spawned wave ${this.waveCounter}/3 (${count} enemies) from ${direction}` +
      ` — HP:${stats.health} SPD:${stats.speed} DMG:${stats.attackDamage} DET:${stats.detectionRange}`
    );
  }

  /**
   * Checks if a spawn position overlaps any collider and pushes the
   * enemy outward until clear. This prevents enemies from spawning
   * inside buildings, walls, or other solid objects.
   */
  public checkSpawnClearance(position: THREE.Vector3): THREE.Vector3 {
    const adjusted = position.clone();
    const enemyRadius = 0.6;
    const enemyHeight = 2.0;
    const pushDistance = 2.0; // Fixed push distance, not based on collider size

    for (let attempt = 0; attempt < 15; attempt++) {
      const checkBox = new THREE.Box3(
        new THREE.Vector3(adjusted.x - enemyRadius, adjusted.y, adjusted.z - enemyRadius),
        new THREE.Vector3(adjusted.x + enemyRadius, adjusted.y + enemyHeight, adjusted.z + enemyRadius)
      );

      let collided = false;
      for (const collider of this.colliders) {
        const box = new THREE.Box3().setFromObject(collider);
        if (checkBox.intersectsBox(box)) {
          const center = new THREE.Vector3();
          box.getCenter(center);
          const pushDir = new THREE.Vector3(adjusted.x - center.x, 0, adjusted.z - center.z);

          if (pushDir.length() < 0.001) {
            pushDir.set(1, 0, 0);
          }
          pushDir.normalize();

          // Fixed push distance — always push out by a consistent amount
          adjusted.x += pushDir.x * pushDistance;
          adjusted.z += pushDir.z * pushDistance;
          collided = true;
          break;
        }
      }

      if (!collided) break;
    }

    // Clamp to playable area
    adjusted.x = Math.max(-45, Math.min(45, adjusted.x));
    adjusted.z = Math.max(42, Math.min(195, adjusted.z));

    if (this.terrainHeightProvider) {
      adjusted.y = this.terrainHeightProvider(adjusted.x, adjusted.z);
    }

    return adjusted;
  }

  /**
   * Creates a single enemy from an EnemySpawnConfig.
   * Generates patrol points according to the chosen pattern.
   */
  private createEnemy(cfg: EnemySpawnConfig): Enemy {
    const group = new THREE.Group();

    const bodyColor = 0x5a5a5a;
    const skinColor = 0xc9a882;
    const darkColor = 0x333333;

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.6 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });

    // === BODY ===
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.35), bodyMat);
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);

    // Vest
    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.3, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.7 })
    );
    vest.position.set(0, 1.15, 0.03);
    vest.castShadow = true;
    group.add(vest);

    // === HEAD ===
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), skinMat);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    // Helmet
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.28), darkMat);
    helmet.position.y = 1.65;
    helmet.castShadow = true;
    group.add(helmet);

    // Face covering
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.1, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    );
    face.position.set(0, 1.52, 0.12);
    group.add(face);

    // === LEFT ARM ===
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.38, 1.2, 0);

    const leftUpper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), bodyMat);
    leftUpper.position.y = -0.15;
    leftUpper.castShadow = true;
    leftArm.add(leftUpper);

    const leftLower = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.11), skinMat);
    leftLower.position.y = -0.45;
    leftLower.castShadow = true;
    leftArm.add(leftLower);

    const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), skinMat);
    leftHand.position.y = -0.6;
    leftArm.add(leftHand);

    group.add(leftArm);

    // === RIGHT ARM (with weapon) ===
    const rightArm = new THREE.Group();
    rightArm.position.set(0.38, 1.2, 0);

    const rightUpper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), bodyMat);
    rightUpper.position.y = -0.15;
    rightUpper.castShadow = true;
    rightArm.add(rightUpper);

    const rightLower = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.11), skinMat);
    rightLower.position.y = -0.45;
    rightLower.position.z = -0.1;
    rightLower.castShadow = true;
    rightArm.add(rightLower);

    const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), skinMat);
    rightHand.position.set(0, -0.6, -0.1);
    rightArm.add(rightHand);

    // Weapon
    const weapon = this.createEnemyWeapon();
    weapon.position.set(0, -0.5, -0.3);
    rightArm.add(weapon);

    group.add(rightArm);

    // === LEFT LEG ===
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.13, 0.7, 0);

    const leftThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), darkMat);
    leftThigh.position.y = -0.2;
    leftThigh.castShadow = true;
    leftLeg.add(leftThigh);

    const leftShin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), darkMat);
    leftShin.position.y = -0.5;
    leftShin.castShadow = true;
    leftLeg.add(leftShin);

    const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.22), bootMat);
    leftBoot.position.set(0, -0.7, 0.02);
    leftBoot.castShadow = true;
    leftLeg.add(leftBoot);

    group.add(leftLeg);

    // === RIGHT LEG ===
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.13, 0.7, 0);

    const rightThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), darkMat);
    rightThigh.position.y = -0.2;
    rightThigh.castShadow = true;
    rightLeg.add(rightThigh);

    const rightShin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), darkMat);
    rightShin.position.y = -0.5;
    rightShin.castShadow = true;
    rightLeg.add(rightShin);

    const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.22), bootMat);
    rightBoot.position.set(0, -0.7, 0.02);
    rightBoot.castShadow = true;
    rightLeg.add(rightBoot);

    group.add(rightLeg);

    // === DETECTION INDICATOR (above head) ===
    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0 })
    );
    indicator.position.y = 1.9;
    group.add(indicator);

    // === SHIELD/COVER INDICATOR (hidden by default) ===
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.2, 0.1),
      new THREE.MeshStandardMaterial({
        color: 0x555555,
        transparent: true,
        opacity: 0,
        roughness: 0.7,
        metalness: 0.3
      })
    );
    shield.position.set(0.5, 0.6, -0.2);
    group.add(shield);

    // Position the group at the spawn location (on terrain)
    // Check for clearance — push out of colliders if spawning inside one
    const [px, py, pz] = cfg.position;
    const rawPos = new THREE.Vector3(px, py, pz);
    const clearedPos = this.checkSpawnClearance(rawPos);
    group.position.set(clearedPos.x, clearedPos.y + py, clearedPos.z);

    // --- Generate patrol points based on the CLEARED position ---
    // Shift patrol waypoints by the clearance offset so they don't
    // overlap with colliders either.
    const clearanceOffset = new THREE.Vector3(
      clearedPos.x - px, 0, clearedPos.z - pz
    );
    const patrolPoints = this.generatePatrolPoints(cfg);
    for (const pt of patrolPoints) {
      pt.add(clearanceOffset);
    }

    // Store original materials of all meshes for hit flash restoration
    const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        originalMaterials.set(child, child.material);
      }
    });

    const behavior: BehaviorType = cfg.behavior ?? 'patrol';
    const baseDetection = cfg.detectionRange ?? 28;
    const baseCooldown = cfg.attackCooldown ?? 1.2;

    return {
      group,
      state: 'patrol',
      health: cfg.health ?? 100,
      maxHealth: cfg.maxHealth ?? 100,
      speed: cfg.speed ?? 1.5,
      detectionRange: baseDetection * BEHAVIOR_DETECTION_MULT[behavior],
      attackRange: cfg.attackRange ?? 22,
      attackDamage: cfg.attackDamage ?? 8,
      attackCooldown: baseCooldown * BEHAVIOR_REACTION_MULT[behavior] + (behavior === 'smoking' ? 0.5 : 0),
      lastAttackTime: 0,
      attackTimer: 0,
      patrolPoints,
      currentPatrolIndex: 0,
      alertLevel: cfg.alertLevel ?? 0,
      zone: cfg.zone,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      body,
      head,
      coverPosition: null,
      peekTimer: 0,
      isPeeking: false,
      animTime: Math.random() * Math.PI * 2,
      stuckTimer: 0,
      indicatorMesh: indicator,
      originalMaterials,
      hitFlashEndTime: 0,
      tag: cfg.tag || 'unknown',
      // Behavior variety
      behavior,
      behaviorTarget: null,
      behaviorTimer: Math.random() * 10, // Randomize start phase
      baseDetectionRange: baseDetection,
      baseAttackCooldown: baseCooldown,
      scanningPaused: false,
      // Detection delay
      detectionDelayTimer: 0,
      detectionDelaySatisfied: false,
    };
  }

  /**
   * Generates patrol waypoints according to the chosen pattern.
   */
  private generatePatrolPoints(cfg: EnemySpawnConfig): THREE.Vector3[] {
    const [x, , z] = cfg.position;
    const pattern = cfg.patrolPattern ?? 'circular';
    const radius = cfg.patrolRadius ?? 3;
    const extent = cfg.patrolExtent ?? 4;

    // Get terrain height at each point
    const getY = (px: number, pz: number) => {
      return this.terrainHeightProvider ? this.terrainHeightProvider(px, pz) : 0;
    };

    switch (pattern) {
      case 'stationary':
        return [new THREE.Vector3(x, getY(x, z), z)];

      case 'circular': {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const px = x + Math.cos(angle) * radius;
          const pz = z + Math.sin(angle) * radius;
          pts.push(new THREE.Vector3(px, getY(px, pz), pz));
        }
        return pts;
      }

      case 'linear_z': {
        const z1 = z + extent;
        const z2 = z - extent;
        return [
          new THREE.Vector3(x, getY(x, z1), z1),
          new THREE.Vector3(x, getY(x, z2), z2),
        ];
      }

      case 'linear_x': {
        const x1 = x + extent;
        const x2 = x - extent;
        return [
          new THREE.Vector3(x1, getY(x1, z), z),
          new THREE.Vector3(x2, getY(x2, z), z),
        ];
      }

      default:
        return [new THREE.Vector3(x, getY(x, z), z)];
    }
  }

  private createEnemyWeapon(): THREE.Group {
    const weaponGroup = new THREE.Group();
    const weaponMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.6,
      roughness: 0.4
    });

    // Gun body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.55), weaponMat);
    weaponGroup.add(body);

    // Barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.35;
    weaponGroup.add(barrel);

    // Magazine
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.1, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x3a3a2a, roughness: 0.8 })
    );
    mag.position.set(0, -0.08, -0.02);
    weaponGroup.add(mag);

    return weaponGroup;
  }

  // ============================================================
  // UPDATE
  // ============================================================

  public update(delta: number, playerPosition: THREE.Vector3, playerStance: 'standing' | 'crouching' | 'prone' = 'standing'): void {
    this.currentTime += delta;
    this.playerPosition.copy(playerPosition);

    // --- Zone-aware respawn check ---
    const currentZone = this.getPlayerZone(playerPosition);
    if (currentZone !== this.lastPlayerZone) {
      this.checkAndRespawn(currentZone);
      this.lastPlayerZone = currentZone;
    }

    this.enemies.forEach((enemy) => {
      if (enemy.state === 'dead') return;

      const distToPlayer = enemy.group.position.distanceTo(playerPosition);

      // Update behavior timer
      enemy.behaviorTimer += delta;

      // Behavior-specific update (idle look direction, smoking animation, etc.)
      this.updateBehavior(enemy, delta);

      // Detection (behavior modifiers applied inside)
      this.updateDetection(enemy, distToPlayer, delta, playerStance);

      // State machine
      this.updateState(enemy, distToPlayer, playerPosition, delta);

      // Attack player if in attack state, within range, AND has line of sight
      const canSeePlayer = this.hasLineOfSight(enemy.group.position, playerPosition);

      if (enemy.state === 'attack' && distToPlayer <= enemy.attackRange && canSeePlayer) {
        enemy.attackTimer += delta;
        if (enemy.attackTimer >= enemy.attackCooldown) {
          enemy.attackTimer = 0;
          this.lastAttackDamage = enemy.attackDamage;
          
          // Fire attack visual callback FIRST (tracer checks wall collision)
          if (this.onAttackCallback) {
            const enemyPos = enemy.group.position.clone();
            enemyPos.y += 1.2;
            this.onAttackCallback(enemyPos, playerPosition.clone());
          }
          
          // Damage is applied via onAttackCallback ONLY if bullet reaches player
          // The callback now handles both tracer AND damage
        }
      } else {
        // Reset attack timer when not actively attacking or can't see player
        enemy.attackTimer = 0;

        // If was attacking but LOS blocked, switch to search
        if (enemy.state === 'attack' && !canSeePlayer) {
          enemy.state = 'search';
          enemy.coverPosition = null;
        }
      }

      // Movement & animation
      this.updateMovement(enemy, delta, playerPosition);

      // Visual indicator
      this.updateIndicator(enemy);
    });

    // Update hit flash restoration
    this.updateHitFlashes();

    // Update blood particles
    this.updateBloodParticles(delta);
  }

  // ============================================================
  // BEHAVIOR-SPECIFIC UPDATE
  // ============================================================

  /**
   * Runs behavior-specific logic each frame:
   * - chatting: face partner, oscillate gesture animation
   * - idle: random look direction changes every 3-5 seconds
   * - smoking: arm raised/lowered animation, occasional puff
   * - scanning: wide weapon-ready sweeps
   * - patrol: standard (no extra logic)
   */
  private updateBehavior(enemy: Enemy, delta: number): void {
    switch (enemy.behavior) {
      case 'chatting':
        this.updateChattingBehavior(enemy, delta);
        break;
      case 'idle':
        this.updateIdleBehavior(enemy, delta);
        break;
      case 'smoking':
        this.updateSmokingBehavior(enemy, delta);
        break;
      case 'scanning':
        this.updateScanningBehavior(enemy, delta);
        break;
      // 'patrol' — no extra behavior logic needed
    }
  }

  /**
   * CHATTING: Face partner, gentle body sway, occasional arm gesture.
   */
  private updateChattingBehavior(enemy: Enemy, delta: number): void {
    // Only animate chatting visuals when in patrol (not alerted/attacking)
    if (enemy.state !== 'patrol') return;

    const partner = enemy.behaviorTarget;
    if (!partner || partner.state === 'dead') return;

    // Face partner
    const dirToPartner = new THREE.Vector3()
      .subVectors(partner.group.position, enemy.group.position);
    dirToPartner.y = 0;
    const targetAngle = Math.atan2(dirToPartner.x, dirToPartner.z);
    enemy.group.rotation.y = this.lerpAngle(enemy.group.rotation.y, targetAngle, 2 * delta);

    // Gentle body sway (social animation)
    const t = enemy.animTime * 1.5;
    enemy.body.rotation.z = Math.sin(t) * 0.03;
    enemy.head.rotation.y = Math.sin(t * 0.7) * 0.15;

    // Occasional arm gesture (every ~3 seconds)
    const gesturePhase = (enemy.behaviorTimer % 3.0);
    if (gesturePhase < 0.4) {
      // Gesture up
      enemy.leftArm.rotation.x = -0.3 * (gesturePhase / 0.4);
    } else if (gesturePhase < 0.8) {
      // Hold
      enemy.leftArm.rotation.x = -0.3;
    } else {
      // Lower
      enemy.leftArm.rotation.x = -0.3 * (1 - (gesturePhase - 0.8) / 0.2);
    }

    // Legs still
    enemy.leftLeg.rotation.x *= 0.95;
    enemy.rightLeg.rotation.x *= 0.95;
    enemy.body.position.y = 1.05;
  }

  /**
   * IDLE: Stand still, occasionally change facing direction (every 3-5 seconds),
   * subtle weight shift — body sways from one leg to the other on a slow rhythm,
   * head looks around occasionally.
   */
  private updateIdleBehavior(enemy: Enemy, delta: number): void {
    if (enemy.state !== 'patrol') return;

    // Randomly change facing direction every 3-5 seconds
    if (enemy.behaviorTimer > 3.0 + Math.random() * 2.0) {
      enemy.behaviorTimer = 0;
      // Pick a random facing direction
      const randomAngle = Math.random() * Math.PI * 2;
      // Smoothly rotate (applied in animation below)
      (enemy as any)._idleTargetAngle = randomAngle;
    }

    // Smoothly rotate toward idle target angle
    const targetAngle = (enemy as any)._idleTargetAngle ?? enemy.group.rotation.y;
    enemy.group.rotation.y = this.lerpAngle(enemy.group.rotation.y, targetAngle, 1.5 * delta);

    // ── Weight shift animation ──
    // Slow, organic sway cycle (period ~6 seconds)
    // Shifts body laterally and rotates hips slightly, simulating
    // someone shifting weight from one foot to the other.
    const t = enemy.animTime;
    const swayCycle = Math.sin(t * 0.5);  // Slow oscillation
    const swayCycle2 = Math.sin(t * 0.35); // Secondary harmonic for organic feel

    // Body lateral sway (shifts torso slightly left/right)
    enemy.body.rotation.z = swayCycle * 0.04;

    // Subtle vertical shift — weight on one leg is slightly taller
    enemy.body.position.y = 1.05 + Math.abs(swayCycle) * 0.015;

    // Lean very slightly in the sway direction
    enemy.body.rotation.x = swayCycle2 * 0.02;

    // Head natural movement — looks around slowly, separate from body sway
    enemy.head.rotation.y = Math.sin(t * 0.8) * 0.3;
    enemy.head.rotation.x = Math.sin(t * 0.6) * 0.05;

    // Legs: slight counter-balance — the "free" leg moves minimally
    // When swayCycle > 0, left leg bears weight (right leg relaxed)
    // When swayCycle < 0, right leg bears weight (left leg relaxed)
    const weightShift = swayCycle * 0.04;
    enemy.leftLeg.rotation.x = -weightShift;  // Left leg extends slightly when bearing weight
    enemy.rightLeg.rotation.x = weightShift;  // Right leg does the opposite

    // Arms relaxed at sides — gentle sway matching body
    enemy.leftArm.rotation.x = swayCycle2 * 0.03;
    enemy.rightArm.rotation.x = -swayCycle2 * 0.02;
  }

  /**
   * SMOKING: One arm raised to face (simulating smoking), very slow reactions.
   * Occasionally lowers arm, then brings it back up.
   */
  private updateSmokingBehavior(enemy: Enemy, delta: number): void {
    if (enemy.state !== 'patrol') return;

    const t = enemy.animTime * 0.6;
    const cycleTime = enemy.behaviorTimer % 6.0; // 6-second cycle

    // Left arm raised to face (simulating holding cigarette)
    if (cycleTime < 4.0) {
      // Arm up near mouth
      enemy.leftArm.rotation.x = -1.0;
      enemy.leftArm.rotation.z = 0.3; // Slightly angled toward face
    } else if (cycleTime < 4.5) {
      // Lower arm briefly (exhale)
      const blend = (cycleTime - 4.0) / 0.5;
      enemy.leftArm.rotation.x = -1.0 + blend * 0.7;
      enemy.leftArm.rotation.z = 0.3 * (1 - blend);
    } else {
      // Raise back up
      const blend = (cycleTime - 4.5) / 1.5;
      enemy.leftArm.rotation.x = -0.3 - blend * 0.7;
      enemy.leftArm.rotation.z = 0.3 * blend;
    }

    // Right arm relaxed (weapon hanging)
    enemy.rightArm.rotation.x = Math.sin(t) * 0.05;

    // Subtle head tilt (looking down at hand / exhaling)
    enemy.head.rotation.x = Math.sin(t * 0.5) * 0.1;
    enemy.head.rotation.y = Math.sin(t * 0.3) * 0.08;

    // Legs still, slight weight shift
    enemy.leftLeg.rotation.x *= 0.95;
    enemy.rightLeg.rotation.x *= 0.95;
    enemy.body.position.y = 1.05;
    enemy.body.rotation.x = 0;
    enemy.body.rotation.z = Math.sin(t * 0.4) * 0.015;
  }

  /**
   * SCANNING: Weapon raised, wider head sweeps, actively looking around.
   * Occasionally pauses (2s every 10s) to stand still and look around —
   * simulates stopping to scan the area more carefully.
   */
  private updateScanningBehavior(enemy: Enemy, delta: number): void {
    if (enemy.state !== 'patrol') {
      enemy.scanningPaused = false;
      return;
    }

    const t = enemy.animTime * 2.5;

    // Pause logic: every 10 seconds, pause for 2 seconds
    const cyclePos = enemy.behaviorTimer % 10.0;
    enemy.scanningPaused = cyclePos >= 8.0; // Paused from 8s to 10s in each cycle

    if (enemy.scanningPaused) {
      // Stopped — look around slowly, head on a swivel
      enemy.head.rotation.y = Math.sin(t * 0.6) * 0.8; // Wide, slow sweeps
      enemy.head.rotation.x = Math.sin(t * 0.3) * 0.15; // Look up/down slightly

      // Weapon held at ready but not raised high
      enemy.rightArm.rotation.x = -0.5 + Math.sin(t * 0.4) * 0.1;
      enemy.leftArm.rotation.x = -0.3;

      // Upright posture
      enemy.body.rotation.x = 0;
      enemy.body.position.y = 1.05;
      enemy.body.rotation.z = 0;

      // Legs still — no movement
      enemy.leftLeg.rotation.x *= 0.95;
      enemy.rightLeg.rotation.x *= 0.95;
      return;
    }

    // Normal scanning (moving) — weapon raised and ready
    enemy.rightArm.rotation.x = -0.7 + Math.sin(t * 0.8) * 0.15;
    enemy.leftArm.rotation.x = -0.4;

    // Wider, faster head sweeps than standard alert
    enemy.head.rotation.y = Math.sin(t) * 0.6;
    enemy.head.rotation.x = Math.sin(t * 0.5) * 0.1;

    // Alert posture — slightly forward lean
    enemy.body.rotation.x = 0.05;
    enemy.body.position.y = 1.05;

    // Legs still
    enemy.leftLeg.rotation.x *= 0.95;
    enemy.rightLeg.rotation.x *= 0.95;
  }

  // ============================================================
  // ZONE SYSTEM & RESPAWN
  // ============================================================

  /**
   * Determines which zone the player is currently in based on Z position.
   */
  private getPlayerZone(pos: THREE.Vector3): MissionZone {
    const z = pos.z;

    if (z >= ZONE_BOUNDS.outskirts.zMin) return 'outskirts';
    if (z >= ZONE_BOUNDS.inner_perimeter.zMin) return 'inner_perimeter';
    if (z >= ZONE_BOUNDS.compound.zMin) return 'compound';
    return 'border_wall';
  }

  /**
   * Counts alive enemies in a given zone.
   */
  private countAliveInZone(zone: MissionZone): number {
    return this.enemies.filter(
      (e) => e.zone === zone && e.state !== 'dead'
    ).length;
  }

  /**
   * When the player enters a new zone, ensure minimum enemy presence.
   * Respawns dead enemies from that zone back at their original position
   * with half health (representing reinforcements).
   */
  private checkAndRespawn(zone: MissionZone): void {
    const bounds = ZONE_BOUNDS[zone];
    const alive = this.countAliveInZone(zone);

    if (alive < bounds.minEnemies) {
      const needed = bounds.minEnemies - alive;

      // Find the dead enemies belonging to this zone that can respawn
      const deadInZone = MISSION_1_SPAWNS.filter((spawn) => {
        if (spawn.zone !== zone) return false;
        // Check if this spawn's tag still exists as a dead enemy
        return this.enemies.some(
          (e) => e.tag === spawn.tag && e.state === 'dead'
        );
      });

      // Respawn up to the needed count
      for (let i = 0; i < Math.min(needed, deadInZone.length); i++) {
        const spawn = deadInZone[i];
        this.respawnEnemy(spawn);
      }

      console.log(
        `[EnemyManager] Zone "${zone}": ${alive} alive < ${bounds.minEnemies} min — respawned ${Math.min(needed, deadInZone.length)} enemies`
      );
    }
  }

  /**
   * Respawns a previously-killed enemy with reduced HP (reinforcement).
   * Removes the dead body and creates a fresh instance.
   */
  private respawnEnemy(spawn: EnemySpawnConfig): void {
    // Remove the old dead enemy from the list (already removed from scene after 5s timeout)
    const deadIdx = this.enemies.findIndex(
      (e) => e.tag === spawn.tag && e.state === 'dead'
    );
    if (deadIdx > -1) {
      // The old group may already have been removed from scene,
      // but ensure cleanup just in case
      const old = this.enemies[deadIdx];
      this.scene.remove(old.group);
      this.enemies.splice(deadIdx, 1);
    }

    // Create new enemy at the same spawn point with reduced HP
    const respawned = this.createEnemy({
      ...spawn,
      health: Math.floor((spawn.health ?? 100) * 0.5),
      maxHealth: spawn.health ?? 100,
    });
    this.enemies.push(respawned);
    this.scene.add(respawned.group);

    // If respawned enemy was a chatting type, re-link their partner
    if (respawned.behavior === 'chatting') {
      this.relinkChattingPartner(respawned);
    }

    console.log(
      `[EnemyManager] Respawned enemy "${spawn.tag}" in zone "${spawn.zone}" at (${spawn.position.join(', ')})`
    );
  }

  /**
   * Re-links a respawned chatting enemy to their partner (if partner still alive).
   */
  private relinkChattingPartner(enemy: Enemy): void {
    // Find another alive chatting enemy in the same zone that doesn't have a target
    const partner = this.enemies.find(
      (e) =>
        e !== enemy &&
        e.behavior === 'chatting' &&
        e.state !== 'dead' &&
        e.zone === enemy.zone &&
        e.behaviorTarget === null
    );

    if (partner) {
      enemy.behaviorTarget = partner;
      partner.behaviorTarget = enemy;
      this.positionChattingPair(enemy, partner);
    }
  }

  // ============================================================
  // DETECTION & STATE
  // ============================================================

  private updateDetection(enemy: Enemy, dist: number, delta: number, playerStance: 'standing' | 'crouching' | 'prone' = 'standing'): void {
    // ═══ VISUAL DETECTION CONE CHECK ═══
    // Enemies only detect the player within a 90° forward cone (not behind them).
    // Enemy forward direction is derived from group.rotation.y.
    const enemyRotationY = enemy.group.rotation.y;
    const forwardX = -Math.sin(enemyRotationY);
    const forwardZ = -Math.cos(enemyRotationY);

    const toPlayerX = this.playerPosition.x - enemy.group.position.x;
    const toPlayerZ = this.playerPosition.z - enemy.group.position.z;
    const toPlayerLen = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);

    let isInCone = true; // Default: assume in cone if too close to calculate
    if (toPlayerLen > 0.1) {
      const dot = (forwardX * toPlayerX + forwardZ * toPlayerZ) / toPlayerLen;
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const angleFromForward = Math.acos(clampedDot);
      isInCone = angleFromForward <= DETECTION_CONE_HALF_ANGLE;
    }

    // Check line of sight — can't detect through walls
    const hasLOS = this.hasLineOfSight(enemy.group.position, this.playerPosition);

    // Use the behavior-modified detection range
    let effectiveRange = enemy.detectionRange;

    // Suppressed weapon: reduce detection range by 50%
    // Simulates the reduced sound profile — enemies can't hear as well
    if (this.playerUsingSuppressed) {
      effectiveRange *= 0.5;
    }

    // Stance modifier: standing = normal, crouching = harder, prone = almost invisible
    const STANCE_DETECTION_MULT: Record<string, number> = {
      standing: 1.0,
      crouching: 0.3,
      prone: 0.1,
    };
    const stanceMult = STANCE_DETECTION_MULT[playerStance] ?? 1.0;

    const canSeePlayer = dist < effectiveRange * 0.7 && hasLOS && isInCone;

    // ═══ DETECTION DELAY ═══
    // Even when spotted, there's a 0.5s delay before alert (reaction time).
    if (canSeePlayer) {
      enemy.detectionDelayTimer += delta;
      if (enemy.detectionDelayTimer >= DETECTION_DELAY) {
        enemy.detectionDelaySatisfied = true;
      }
    } else {
      // Reset delay when player is no longer visible/in cone
      enemy.detectionDelayTimer = 0;
      enemy.detectionDelaySatisfied = false;
    }

    // Only raise alert if the delay has been satisfied
    if (canSeePlayer && enemy.detectionDelaySatisfied) {
      const rate = (1 - dist / effectiveRange) * 35 * stanceMult;
      enemy.alertLevel = Math.min(100, enemy.alertLevel + rate * delta);
    } else {
      // Decay alert when out of range / not in cone / can't see player
      enemy.alertLevel = Math.max(0, enemy.alertLevel - 12 * delta);
    }
  }

  private updateState(
    enemy: Enemy,
    dist: number,
    playerPos: THREE.Vector3,
    delta: number
  ): void {
    const prevState = enemy.state;

    // Scanning enemies transition to alert/search faster
    const alertThreshold = enemy.behavior === 'scanning' ? 60 : 75;
    const attackThreshold = enemy.behavior === 'scanning' ? 70 : 80;

    if (enemy.alertLevel > alertThreshold) {
      // Find cover if not already in cover
      if (enemy.state !== 'search' && enemy.state !== 'attack') {
        enemy.state = 'search';
        enemy.coverPosition = this.findCoverPosition(enemy, playerPos);
        enemy.peekTimer = 0;
        enemy.isPeeking = false;
      }

      if (dist < enemy.attackRange && enemy.alertLevel > attackThreshold) {
        // Check line of sight before transitioning to attack state
        const canSeePlayer = this.hasLineOfSight(enemy.group.position, this.playerPosition);
        if (!canSeePlayer) {
          // No LOS — stay in search state instead of attacking
          if (enemy.state !== 'search') {
            enemy.state = 'search';
            enemy.coverPosition = this.findCoverPosition(enemy, playerPos);
            enemy.peekTimer = 0;
            enemy.isPeeking = false;
          }
        } else {
          // Peek and shoot
          enemy.peekTimer += delta;
          if (enemy.peekTimer > 1.5) {
            enemy.state = 'attack';
            enemy.isPeeking = true;
          }
        }
      }
    } else if (enemy.alertLevel > 25) {
      enemy.state = 'alert';
    } else {
      enemy.state = 'patrol';
      enemy.coverPosition = null;
      enemy.isPeeking = false;
    }
  }

  private findCoverPosition(enemy: Enemy, playerPos: THREE.Vector3): THREE.Vector3 {
    // Simple: move to a position perpendicular to player
    const dir = new THREE.Vector3()
      .subVectors(enemy.group.position, playerPos)
      .normalize();
    const perpDir = new THREE.Vector3(-dir.z, 0, dir.x);

    // Try both perpendicular directions
    const option1 = enemy.group.position
      .clone()
      .add(perpDir.clone().multiplyScalar(3));
    const option2 = enemy.group.position
      .clone()
      .add(perpDir.clone().multiplyScalar(-3));

    // Pick the one further from player
    return option1.distanceTo(playerPos) > option2.distanceTo(playerPos)
      ? option1
      : option2;
  }

  // ============================================================
  // MOVEMENT
  // ============================================================

  private updateMovement(
    enemy: Enemy,
    delta: number,
    playerPos: THREE.Vector3
  ): void {
    enemy.animTime += delta;

    let targetPoint: THREE.Vector3;
    let moveSpeed = enemy.speed;

    switch (enemy.state) {
      case 'patrol':
        // Chatting enemies don't walk — they stay in place facing partner
        if (enemy.behavior === 'chatting' && enemy.behaviorTarget && enemy.behaviorTarget.state !== 'dead') {
          // Stay in place — chatting animation handles visuals
          this.animateChattingIdle(enemy, delta);
          return;
        }

        // Scanning enemies pause periodically to look around
        if (enemy.behavior === 'scanning' && enemy.scanningPaused) {
          // Stay in place — scanning pause animation handles visuals
          return;
        }

        targetPoint = enemy.patrolPoints[enemy.currentPatrolIndex];
        // Use 2D distance (ignore Y) for waypoint check
        const dx = enemy.group.position.x - targetPoint.x;
        const dz = enemy.group.position.z - targetPoint.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.5) {
          enemy.currentPatrolIndex =
            (enemy.currentPatrolIndex + 1) % enemy.patrolPoints.length;
        }
        this.animateWalking(enemy, delta);
        break;

      case 'alert': {
        // Turn to face player but don't move
        const lookDir = new THREE.Vector3().subVectors(
          playerPos,
          enemy.group.position
        );
        lookDir.y = 0;
        const targetAngle = Math.atan2(lookDir.x, lookDir.z);
        enemy.group.rotation.y = this.lerpAngle(
          enemy.group.rotation.y,
          targetAngle,
          3 * delta
        );
        this.animateAlert(enemy, delta);
        return;
      }

      case 'search':
        if (enemy.coverPosition) {
          targetPoint = enemy.coverPosition;
          moveSpeed = enemy.speed * 1.8; // Run to cover

          const distToCover = enemy.group.position.distanceTo(targetPoint);
          if (distToCover < 1) {
            // At cover — peek behavior
            this.animateAtCover(enemy, delta, playerPos);
            return;
          }
          this.animateRunning(enemy, delta);
        } else {
          this.animateAlert(enemy, delta);
          return;
        }
        break;

      case 'attack':
        // At cover, peeking to shoot
        this.animateShooting(enemy, delta, playerPos);
        return;

      default:
        return;
    }

    // Move towards target
    const dir = new THREE.Vector3().subVectors(targetPoint, enemy.group.position);
    dir.y = 0;
    dir.normalize();

    // Calculate new position
    const newX = enemy.group.position.x + dir.x * moveSpeed * delta;
    const newZ = enemy.group.position.z + dir.z * moveSpeed * delta;
    
    // Check collision — try multiple directions to find path
    const enemyRadius = 0.6;
    let finalX = newX;
    let finalZ = newZ;
    let canMove = false;
    
    // Try direct path first
    if (!this.isPositionBlocked(newX, newZ, enemyRadius)) {
      canMove = true;
    } else {
      // Try 8 directions around the enemy
      const tryDirs = [
        { x: dir.z, z: -dir.x },           // perpendicular left
        { x: -dir.z, z: dir.x },           // perpendicular right
        { x: dir.x + dir.z, z: dir.z - dir.x }, // diagonal forward-left
        { x: dir.x - dir.z, z: dir.z + dir.x }, // diagonal forward-right
        { x: -dir.x, z: -dir.z },          // backward
        { x: dir.x, z: 0 },                // x only
        { x: 0, z: dir.z },                // z only
        { x: 0, z: 0 },                    // stay in place
      ];
      
      for (const tryDir of tryDirs) {
        const len = Math.sqrt(tryDir.x * tryDir.x + tryDir.z * tryDir.z);
        if (len < 0.001) continue;
        const tryX = enemy.group.position.x + (tryDir.x / len) * moveSpeed * delta;
        const tryZ = enemy.group.position.z + (tryDir.z / len) * moveSpeed * delta;
        if (!this.isPositionBlocked(tryX, tryZ, enemyRadius)) {
          finalX = tryX;
          finalZ = tryZ;
          canMove = true;
          break;
        }
      }
    }
    
    // Stuck detection — skip waypoint faster (1.5s)
    if (!canMove) {
      if (!enemy.stuckTimer) enemy.stuckTimer = 0;
      enemy.stuckTimer += delta;
      if (enemy.stuckTimer > 1.5) {
        enemy.currentPatrolIndex = (enemy.currentPatrolIndex + 1) % enemy.patrolPoints.length;
        enemy.stuckTimer = 0;
      }
    } else {
      enemy.stuckTimer = 0;
      enemy.group.position.x = finalX;
      enemy.group.position.z = finalZ;
    }
    
    // Keep enemy on terrain
    if (this.terrainHeightProvider) {
      enemy.group.position.y = this.terrainHeightProvider(enemy.group.position.x, enemy.group.position.z);
    }

    // Face movement direction
    if (canMove) {
      enemy.group.rotation.y = Math.atan2(finalX - enemy.group.position.x, finalZ - enemy.group.position.z);
    }
  }

  /**
   * Check if a position is blocked by any collider
   */
  private isPositionBlocked(x: number, z: number, radius: number): boolean {
    for (const collider of this.colliders) {
      const box = new THREE.Box3().setFromObject(collider);
      // Expand by enemy radius
      if (x >= box.min.x - radius && x <= box.max.x + radius &&
          z >= box.min.z - radius && z <= box.max.z + radius) {
        return true;
      }
    }
    return false;
  }

  // ============================================================
  // ANIMATIONS
  // ============================================================

  private animateWalking(enemy: Enemy, _delta: number): void {
    const t = enemy.animTime * 4;
    const swing = Math.sin(t) * 0.35;

    enemy.leftLeg.rotation.x = swing;
    enemy.rightLeg.rotation.x = -swing;
    enemy.leftArm.rotation.x = -swing * 0.4;
    enemy.rightArm.rotation.x = swing * 0.3;

    // Slight body bob
    enemy.body.position.y = 1.05 + Math.abs(Math.sin(t)) * 0.02;
  }

  private animateRunning(enemy: Enemy, _delta: number): void {
    const t = enemy.animTime * 7;
    const swing = Math.sin(t) * 0.5;

    enemy.leftLeg.rotation.x = swing;
    enemy.rightLeg.rotation.x = -swing;
    enemy.leftArm.rotation.x = -swing * 0.6;
    enemy.rightArm.rotation.x = swing * 0.5;

    enemy.body.position.y = 1.05 + Math.abs(Math.sin(t)) * 0.03;

    // Lean forward slightly
    enemy.body.rotation.x = 0.1;
  }

  private animateAlert(enemy: Enemy, _delta: number): void {
    // Reset legs
    enemy.leftLeg.rotation.x *= 0.9;
    enemy.rightLeg.rotation.x *= 0.9;

    // Weapon raised, scanning
    const scan = Math.sin(enemy.animTime * 2) * 0.3;
    enemy.rightArm.rotation.x = -0.8 + scan; // Weapon up
    enemy.leftArm.rotation.x = -0.5; // Supporting

    // Head looks around
    enemy.head.rotation.y = Math.sin(enemy.animTime * 1.5) * 0.4;

    enemy.body.position.y = 1.05;
    enemy.body.rotation.x = 0;
  }

  /**
   * Chatting idle: standing in place facing partner, subtle animations.
   * Used when chatting enemies are in patrol state and near their partner.
   */
  private animateChattingIdle(enemy: Enemy, _delta: number): void {
    // Legs still
    enemy.leftLeg.rotation.x *= 0.95;
    enemy.rightLeg.rotation.x *= 0.95;

    // Body upright, slight rotation handled by updateChattingBehavior
    enemy.body.position.y = 1.05;
    enemy.body.rotation.x = 0;

    // Weapon lowered (not in combat)
    enemy.rightArm.rotation.x *= 0.9;

    // Reset body rotation.z (updateChattingBehavior will re-set it)
    // Reset head (updateChattingBehavior will re-set it)
  }

  private animateAtCover(enemy: Enemy, delta: number, playerPos: THREE.Vector3): void {
    // Get terrain height for crouching positions
    const terrainY = this.terrainHeightProvider 
      ? this.terrainHeightProvider(enemy.group.position.x, enemy.group.position.z) 
      : 0;
    
    // Crouching at cover — lower than standing but above terrain
    enemy.group.position.y = terrainY - 0.3; // Duck down 0.3 below terrain surface

    // Weapon ready, close to body
    enemy.rightArm.rotation.x = -0.5;
    enemy.leftArm.rotation.x = -0.4;

    // Peek periodically
    enemy.peekTimer += delta;
    const peekCycle = enemy.peekTimer % 3; // Every 3 seconds

    if (peekCycle < 0.8) {
      // Peek out
      const peekDir = new THREE.Vector3()
        .subVectors(playerPos, enemy.group.position)
        .normalize();
      enemy.group.rotation.y = Math.atan2(peekDir.x, peekDir.z);

      // Rise up slightly
      enemy.group.position.y = terrainY;

      // Weapon fully raised
      enemy.rightArm.rotation.x = -1.2;
    } else {
      // Duck back
      enemy.group.position.y = terrainY - 0.4;
      enemy.rightArm.rotation.x = -0.3;
    }

    // Legs crouched
    enemy.leftLeg.rotation.x = -0.8;
    enemy.rightLeg.rotation.x = -0.8;
  }

  private animateShooting(enemy: Enemy, _delta: number, playerPos: THREE.Vector3): void {
    // Peek out and shoot
    const peekDir = new THREE.Vector3()
      .subVectors(playerPos, enemy.group.position)
      .normalize();
    enemy.group.rotation.y = Math.atan2(peekDir.x, peekDir.z);

    // Get terrain height for shooting position
    const terrainY = this.terrainHeightProvider 
      ? this.terrainHeightProvider(enemy.group.position.x, enemy.group.position.z) 
      : 0;
    
    // Rise up to terrain level (standing to shoot)
    enemy.group.position.y = terrainY;

    // Weapon fully extended
    enemy.rightArm.rotation.x = -1.4;
    enemy.leftArm.rotation.x = -1.0;

    // Legs braced
    enemy.leftLeg.rotation.x = -0.6;
    enemy.rightLeg.rotation.x = -0.4;

    // Recoil animation
    const recoil = Math.sin(enemy.animTime * 15) * 0.05;
    enemy.rightArm.position.z = recoil;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  private updateIndicator(enemy: Enemy): void {
    const mat = enemy.indicatorMesh.material as THREE.MeshBasicMaterial;

    if (enemy.alertLevel > 30) {
      mat.opacity = Math.min(1, (enemy.alertLevel - 30) / 50);

      if (enemy.state === 'attack' || enemy.state === 'search') {
        mat.color.setHex(0xff0000); // Red
      } else {
        mat.color.setHex(0xffff00); // Yellow
      }
    } else {
      mat.opacity = 0;
    }
  }

  // ============================================================
  // COMBAT
  // ============================================================

  public damageEnemy(
    enemy: Enemy,
    damage: number,
    isHeadshot: boolean,
    hitPoint?: THREE.Vector3,
    hitDirection?: THREE.Vector3,
    isSilent: boolean = false
  ): boolean {
    if (enemy.state === 'dead') return false;

    const actualDamage = isHeadshot ? damage * 2.5 : damage;
    enemy.health -= actualDamage;
    enemy.alertLevel = 100;

    // === HIT REACTIONS ===

    // 1. Hit flash: briefly turn all meshes white for 50ms
    this.applyHitFlash(enemy);

    // 2. Knockback: push enemy away from hit direction
    if (hitDirection) {
      this.applyKnockback(enemy, hitDirection);
    }

    // 3. Blood particle burst from hit point
    if (hitPoint) {
      this.spawnBloodParticles(hitPoint, hitDirection);
    }

    if (enemy.health <= 0) {
      this.killEnemy(enemy);
      return true;
    }

    // Alert nearby enemies — suppressed weapons have quieter sound signature
    // Stealth kills (silent): skip alerting nearby enemies entirely
    if (!isSilent) {
      const alertRadius = this.playerUsingSuppressed ? 10 : 20;
      this.alertNearby(enemy.group.position, alertRadius);
    }
    return false;
  }

  // ============================================================
  // HIT REACTIONS
  // ============================================================

  private applyHitFlash(enemy: Enemy): void {
    const now = performance.now();
    enemy.hitFlashEndTime = now + this.HIT_FLASH_DURATION;

    const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

    enemy.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child !== enemy.indicatorMesh) {
        child.material = flashMaterial;
      }
    });
  }

  private updateHitFlashes(): void {
    const now = performance.now();

    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      if (enemy.hitFlashEndTime <= 0) continue;
      if (now >= enemy.hitFlashEndTime) {
        enemy.group.traverse((child) => {
          if (child instanceof THREE.Mesh && child !== enemy.indicatorMesh) {
            const original = enemy.originalMaterials.get(child);
            if (original) {
              child.material = original;
            }
          }
        });
        enemy.hitFlashEndTime = 0;
      }
    }
  }

  private applyKnockback(enemy: Enemy, direction: THREE.Vector3): void {
    const knockback = direction
      .clone()
      .normalize()
      .multiplyScalar(this.KNOCKBACK_FORCE);
    enemy.group.position.add(knockback);
  }

  private spawnBloodParticles(
    hitPoint: THREE.Vector3,
    hitDirection?: THREE.Vector3
  ): void {
    for (let i = 0; i < this.BLOOD_PARTICLE_COUNT; i++) {
      const geometry = new THREE.SphereGeometry(0.015, 4, 4);
      const material = new THREE.MeshBasicMaterial({
        color: 0xcc0000,
        transparent: true,
        opacity: 1.0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(hitPoint);
      this.scene.add(mesh);

      const baseAngle = Math.random() * Math.PI * 2;
      const baseSpeed = 1.5 + Math.random() * 2.5;
      const velocity = new THREE.Vector3(
        Math.cos(baseAngle) * baseSpeed,
        1 + Math.random() * 2,
        Math.sin(baseAngle) * baseSpeed
      );

      if (hitDirection) {
        velocity.add(hitDirection.clone().normalize().multiplyScalar(1.5));
      }

      this.activeBloodParticles.push({
        mesh,
        velocity,
        startTime: performance.now(),
        duration: this.BLOOD_DURATION,
      });
    }
  }

  private updateBloodParticles(delta: number): void {
    for (let i = this.activeBloodParticles.length - 1; i >= 0; i--) {
      const particle = this.activeBloodParticles[i];
      const ageMs = performance.now() - particle.startTime;

      if (ageMs >= particle.duration) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        (particle.mesh.material as THREE.Material).dispose();
        this.activeBloodParticles.splice(i, 1);
        continue;
      }

      particle.velocity.y += this.BLOOD_GRAVITY * delta;

      particle.mesh.position.x += particle.velocity.x * delta;
      particle.mesh.position.y += particle.velocity.y * delta;
      particle.mesh.position.z += particle.velocity.z * delta;

      const t = 1 - ageMs / particle.duration;
      (particle.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      particle.mesh.scale.setScalar(t);
    }
  }

  private killEnemy(enemy: Enemy): void {
    enemy.state = 'dead';

    // ── When a chatting enemy's partner is killed, they hear the commotion ──
    // More realistic: alert to 50 (not full) and enter search state (investigating)
    for (const other of this.enemies) {
      if (other.state === 'dead') continue;
      if (other.behaviorTarget === enemy) {
        // This enemy was chatting with the one that just died
        other.behaviorTarget = null;
        other.alertLevel = 50; // Heard something — not full alert yet
        other.state = 'search'; // Enter search to investigate
        other.coverPosition = null;
        other.peekTimer = 0;
        other.isPeeking = false;
        console.log(
          `[Enemy:${other.tag}] (${other.behavior}) Partner "${enemy.tag}" killed — heard the noise, entering search!`
        );
      }
    }

    // Dispose original materials before replacing with death materials
    enemy.originalMaterials.forEach((mat) => {
      if (Array.isArray(mat)) {
        mat.forEach(m => m.dispose());
      } else {
        mat.dispose();
      }
    });
    enemy.originalMaterials.clear();

    // Death animation — fall over
    enemy.group.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0x8b0000,
          roughness: 0.9,
        });
      }
    });

    // Fall to ground — use terrain height
    enemy.group.rotation.x = Math.PI / 2;
    const terrainY = this.terrainHeightProvider 
      ? this.terrainHeightProvider(enemy.group.position.x, enemy.group.position.z) 
      : 0;
    enemy.group.position.y = terrainY + 0.3;

    setTimeout(() => {
      // Dispose all child geometries and materials before removing from scene
      enemy.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(enemy.group);
      // Do NOT splice from enemies array — keep the dead entry
      // so the respawn system can reference it by tag.
    }, 5000);
  }

  private alertNearby(pos: THREE.Vector3, radius: number): void {
    this.enemies.forEach((e) => {
      if (e.state === 'dead') return;
      if (e.group.position.distanceTo(pos) < radius) {
        // Only alert enemies that have line of sight to the noise source
        if (this.hasLineOfSight(e.group.position, pos)) {
          e.alertLevel = Math.min(100, e.alertLevel + 40);
        }
      }
    });
  }

  // ============================================================
  // GUNFIRE NOISE SYSTEM
  // ============================================================

  /**
   * Alerts all enemies within the gunfire noise radius.
   * Called by GameEngine when the player fires an unsuppressed weapon.
   * Suppressed weapons use a much smaller radius (passed by caller).
   *
   * Sound is blocked by walls — enemies behind walls don't hear the shot.
   * Alert scales with proximity: closer enemies are alerted more.
   *
   * @param gunshotPosition - World position where the shot was fired
   * @param isSuppressed - Whether the weapon was suppressed (reduces radius by 70%)
   */
  public alertAtGunfire(gunshotPosition: THREE.Vector3, isSuppressed: boolean): void {
    const radius = isSuppressed ? GUNFIRE_NOISE_RADIUS * 0.3 : GUNFIRE_NOISE_RADIUS;
    const alertAmount = isSuppressed ? GUNFIRE_ALERT_AMOUNT * 0.4 : GUNFIRE_ALERT_AMOUNT;

    this.enemies.forEach((enemy) => {
      if (enemy.state === 'dead') return;

      const distance = enemy.group.position.distanceTo(gunshotPosition);
      if (distance >= radius) return;

      // Sound is blocked by walls
      if (!this.hasLineOfSight(enemy.group.position, gunshotPosition)) {
        return;
      }

      // Alert scales with proximity — closer = louder
      const proximityScale = 1 - (distance / radius);
      const scaledAlert = alertAmount * proximityScale;
      enemy.alertLevel = Math.min(100, enemy.alertLevel + scaledAlert);
    });
  }

  // ============================================================
  // LINE OF SIGHT & COLLISION
  // ============================================================

  public setColliders(colliders: THREE.Mesh[]): void {
    this.colliders = colliders;
  }

  public setTerrainHeightProvider(provider: (x: number, z: number) => number): void {
    this.terrainHeightProvider = provider;
  }

  public hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const eyeFrom = from.clone();
    eyeFrom.y = 1.6;
    const eyeTo = to.clone();
    // Use the actual player position Y (terrain + stance height) instead of hardcoding 1.6

    const dir = new THREE.Vector3().subVectors(eyeTo, eyeFrom);
    const dist = dir.length();
    if (dist < 0.1) return true;
    dir.normalize();

    // Offset start position slightly forward to avoid raycast-inside-object issue
    const rayStart = eyeFrom.clone().add(dir.clone().multiplyScalar(0.5));
    const remainingDist = dist - 0.5;
    if (remainingDist <= 0) return true;

    const raycaster = new THREE.Raycaster(rayStart, dir, 0.1, remainingDist);
    const hits = raycaster.intersectObjects(this.colliders, false);

    // If any wall is hit before the target, LOS is blocked
    return hits.length === 0;
  }

  // ============================================================
  // GETTERS
  // ============================================================

  public getEnemies(): Enemy[] {
    return this.enemies;
  }

  public getLastAttackDamage(): number {
    return this.lastAttackDamage;
  }

  public getAliveEnemies(): Enemy[] {
    return this.enemies.filter((e) => e.state !== 'dead');
  }

  public getEnemyCount(): number {
    return this.enemies.length;
  }

  /**
   * Returns the current wave counter (1-3) for Phase 4.
   */
  public getWaveCounter(): number {
    return this.waveCounter;
  }

  /**
   * Resets the wave counter. Call on mission restart.
   */
  public resetWaveCounter(): void {
    this.waveCounter = 0;
  }

  /**
   * Returns count of alive enemies in a specific zone.
   */
  public getAliveCountInZone(zone: MissionZone): number {
    return this.countAliveInZone(zone);
  }

  /**
   * Returns the player's current zone based on position.
   */
  public getCurrentZone(pos: THREE.Vector3): MissionZone {
    return this.getPlayerZone(pos);
  }
}
