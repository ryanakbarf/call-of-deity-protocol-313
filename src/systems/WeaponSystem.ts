/**
 * WeaponSystem.ts
 * Manages weapons, ammunition, shooting mechanics, and weapon slot switching.
 *
 * Each character (Wolf / Falcon) has a 4-slot loadout:
 *   Slot 1: Bare Hands (melee, infinite ammo)
 *   Slot 2: Knife/Dagger (melee, infinite ammo, higher damage)
 *   Slot 3: Makara-9 Pistol (sidearm)
 *   Slot 4: Primary Weapon (Rifle / Sniper)
 *
 * Melee weapons use distance checks instead of raycasting.
 * Firearms have a reserve ammo system — reload draws from reserves.
 */

import * as THREE from 'three';

// ============================================================
// TYPES
// ============================================================

export type WeaponType = 'melee' | 'pistol' | 'rifle' | 'sniper';

export interface Weapon {
  name: string;
  type: WeaponType;
  damage: number;
  fireRate: number;        // shots per second (melee = swings per second)
  ammo: number;
  maxAmmo: number;
  reserve: number;         // reserve ammo pool (Infinity for melee)
  maxReserve: number;      // maximum reserve capacity (Infinity for melee)
  range: number;           // units — melee uses this for distance check, guns for raycast
  slot: number;            // 1-4
  isSuppressed: boolean;
  icon: string;            // emoji icon for HUD
  lastFireTime: number;
}

// ============================================================
// WEAPON DEFINITIONS — per character
// ============================================================

const WOLF_WEAPONS: Weapon[] = [
  {
    name: 'Bare Hands',
    type: 'melee',
    damage: 15,
    fireRate: 4,
    ammo: Infinity,
    maxAmmo: Infinity,
    reserve: Infinity,
    maxReserve: Infinity,
    range: 2.0,
    slot: 1,
    isSuppressed: true,
    icon: '👊',
    lastFireTime: 0,
  },
  {
    name: 'Combat Knife',
    type: 'melee',
    damage: 50,
    fireRate: 5,
    ammo: Infinity,
    maxAmmo: Infinity,
    reserve: Infinity,
    maxReserve: Infinity,
    range: 2.5,
    slot: 2,
    isSuppressed: true,
    icon: '🔪',
    lastFireTime: 0,
  },
  {
    name: 'Makara-9',
    type: 'pistol',
    damage: 35,
    fireRate: 5,
    ammo: 12,
    maxAmmo: 12,
    reserve: 48,
    maxReserve: 48,
    range: 50,
    slot: 3,
    isSuppressed: false,
    icon: '🔫',
    lastFireTime: 0,
  },
  {
    name: 'Zulfiqar-47',
    type: 'rifle',
    damage: 25,
    fireRate: 8,
    ammo: 30,
    maxAmmo: 30,
    reserve: 120,
    maxReserve: 120,
    range: 100,
    slot: 4,
    isSuppressed: false,
    icon: '🔫',
    lastFireTime: 0,
  },
];

const FALCON_WEAPONS: Weapon[] = [
  {
    name: 'Bare Hands',
    type: 'melee',
    damage: 15,
    fireRate: 4,
    ammo: Infinity,
    maxAmmo: Infinity,
    reserve: Infinity,
    maxReserve: Infinity,
    range: 2.0,
    slot: 1,
    isSuppressed: true,
    icon: '👊',
    lastFireTime: 0,
  },
  {
    name: 'Crescent Dagger',
    type: 'melee',
    damage: 50,
    fireRate: 3.5,
    ammo: Infinity,
    maxAmmo: Infinity,
    reserve: Infinity,
    maxReserve: Infinity,
    range: 2.5,
    slot: 2,
    isSuppressed: true,
    icon: '🗡️',
    lastFireTime: 0,
  },
  {
    name: 'Makara-9',
    type: 'pistol',
    damage: 35,
    fireRate: 5,
    ammo: 12,
    maxAmmo: 12,
    reserve: 48,
    maxReserve: 48,
    range: 50,
    slot: 3,
    isSuppressed: false,
    icon: '🔫',
    lastFireTime: 0,
  },
  {
    name: 'Shahin-SR',
    type: 'sniper',
    damage: 85,
    fireRate: 1.5,
    ammo: 10,
    maxAmmo: 10,
    reserve: 30,
    maxReserve: 30,
    range: 200,
    slot: 4,
    isSuppressed: true,
    icon: '🎯',
    lastFireTime: 0,
  },
];

// ============================================================
// WEAPON SYSTEM CLASS
// ============================================================

export class WeaponSystem {
  private scene: THREE.Scene;
  private weapons: Weapon[] = [];
  private currentSlot: number = 4; // Start with primary (rifle/sniper)
  private isFiring: boolean = false;
  private lastReloadTime: number = 0;
  private readonly RELOAD_COOLDOWN: number = 2.0;

  // ============================================================
  // TIMED RELOAD STATE
  // ============================================================

  /** Whether a reload is currently in progress. */
  private isReloadingState: boolean = false;

  /** Timestamp (seconds) when the reload started. */
  private reloadStartTime: number = 0;

  /** Duration of the reload animation in seconds. */
  private readonly RELOAD_DURATION: number = 2.0;

  /** Ammo snapshot taken at reload start (for partial-reload math). */
  private reloadAmmoSnapshot: number = 0;

  /** Callback fired when reload timer starts. */
  public onReloadStarted: (() => void) | null = null;

  /** Callback fired when reload timer completes and ammo is transferred. */
  public onReloadComplete: (() => void) | null = null;

  /** Callback fired when weapon slot changes — receives new weapon. */
  public onWeaponSwitch: ((weapon: Weapon) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.setActiveCharacter('wolf');
  }

  // ============================================================
  // CHARACTER / LOADOUT SWITCHING
  // ============================================================

  /**
   * Swap the active weapon set for the given character.
   * Resets to slot 4 (Primary) on character switch.
   */
  public setActiveCharacter(type: 'wolf' | 'falcon'): void {
    this.weapons = type === 'wolf'
      ? WOLF_WEAPONS.map(w => ({ ...w })) // deep copy
      : FALCON_WEAPONS.map(w => ({ ...w }));

    this.currentSlot = 4;
    this.lastReloadTime = 0;
    this.isReloadingState = false;
  }

  // ============================================================
  // SLOT SWITCHING
  // ============================================================

  /**
   * Switch to the given weapon slot (1-4).
   * Returns the weapon if the slot is valid, null otherwise.
   */
  public switchWeapon(slot: number): Weapon | null {
    if (slot < 1 || slot > 4) return null;

    const weapon = this.weapons.find(w => w.slot === slot);
    if (!weapon) return null;

    this.currentSlot = slot;

    if (this.onWeaponSwitch) {
      this.onWeaponSwitch(weapon);
    }

    return weapon;
  }

  /**
   * Cycle to the next weapon slot (wraps around 4 → 1).
   */
  public cycleNext(): void {
    const nextSlot = this.currentSlot >= 4 ? 1 : this.currentSlot + 1;
    this.switchWeapon(nextSlot);
  }

  /**
   * Cycle to the previous weapon slot (wraps around 1 → 4).
   */
  public cyclePrev(): void {
    const prevSlot = this.currentSlot <= 1 ? 4 : this.currentSlot - 1;
    this.switchWeapon(prevSlot);
  }

  /**
   * Returns the current active weapon.
   */
  public getCurrentWeapon(): Weapon {
    const weapon = this.weapons.find(w => w.slot === this.currentSlot);
    return weapon || this.weapons[0];
  }

  /**
   * Returns the current slot number (1-4).
   */
  public getCurrentSlot(): number {
    return this.currentSlot;
  }

  /**
   * Returns all 4 weapons for HUD display.
   */
  public getAllWeapons(): Weapon[] {
    return this.weapons;
  }

  /**
   * Returns the current slot number — used for persistence across character switches.
   */
  public saveSlot(): number {
    return this.currentSlot;
  }

  /**
   * Restores a previously saved weapon slot (for character-switch persistence).
   */
  public restoreSlot(slot: number): void {
    if (slot >= 1 && slot <= 4) {
      this.currentSlot = slot;
      const weapon = this.getCurrentWeapon();
      if (this.onWeaponSwitch) {
        this.onWeaponSwitch(weapon);
      }
    }
  }

  /**
   * Whether the current weapon is a melee weapon (bare hands or knife/dagger).
   * Melee weapons use distance checks instead of raycasting.
   */
  public isMeleeWeapon(): boolean {
    return this.getCurrentWeapon().type === 'melee';
  }

  /**
   * Returns the melee range of the current weapon.
   * Only valid when isMeleeWeapon() is true.
   */
  public getMeleeRange(): number {
    return this.getCurrentWeapon().range;
  }

  /**
   * Returns the melee damage of the current weapon.
   * Only valid when isMeleeWeapon() is true.
   */
  public getMeleeDamage(): number {
    return this.getCurrentWeapon().damage;
  }

  /**
   * Whether the current weapon is a sniper rifle.
   * Snipers have toggle-to-scope and scroll zoom.
   */
  public isCurrentWeaponSniper(): boolean {
    return this.getCurrentWeapon().type === 'sniper';
  }

  /**
   * Returns the maximum zoom level for the current sniper.
   * Based on weapon range (longer range = higher max zoom).
   */
  public getMaxZoom(): number {
    return 15; // Max zoom 15x
  }

  public getMinZoom(): number {
    return 5; // Min zoom 5x
  }

  // ============================================================
  // FIRING
  // ============================================================

  public update(delta: number): void {
    if (this.isFiring) {
      this.tryFire();
    }

    // --- Timed reload completion ---
    if (this.isReloadingState) {
      const now = performance.now() / 1000;
      if (now - this.reloadStartTime >= this.RELOAD_DURATION) {
        this.completeReload();
      }
    }
  }

  public startFiring(): void {
    this.isFiring = true;
  }

  public stopFiring(): void {
    this.isFiring = false;
  }

  public getIsFiring(): boolean {
    return this.isFiring;
  }

  /**
   * Attempt to fire the current weapon.
   * Melee weapons never "run out" of ammo — they have infinite.
   * Guns consume ammo and respect fire rate.
   * Cannot fire while a reload is in progress.
   */
  public tryFire(): boolean {
    // Can't fire while reloading
    if (this.isReloadingState) {
      return false;
    }

    const weapon = this.getCurrentWeapon();
    const now = performance.now() / 1000;
    const timeBetweenShots = 1 / weapon.fireRate;
    const timeSinceLastShot = now - weapon.lastFireTime;

    if (timeSinceLastShot < timeBetweenShots) {
      return false;
    }

    // Melee weapons have infinite ammo — skip ammo check
    if (weapon.ammo !== Infinity) {
      if (weapon.ammo <= 0) {
        return false;
      }
      weapon.ammo--;
    }

    weapon.lastFireTime = now;
    return true;
  }

  // ============================================================
  // RELOAD (with reserve ammo system)
  // ============================================================

  /**
   * Start a timed reload of the current weapon from the reserve pool.
   *
   * Rules:
   *   - Melee weapons cannot be reloaded.
   *   - If magazine is already full, nothing happens.
   *   - If reserve is 0, cannot reload (player must find ammo).
   *   - Already reloading? Ignore.
   *
   * The reload now takes RELOAD_DURATION seconds to complete.
   * During this time the weapon view model plays an animation
   * and no shots can be fired.
   *
   * @returns true if reload was started, false otherwise.
   */
  public reload(): boolean {
    const weapon = this.getCurrentWeapon();

    // Melee weapons can't be reloaded
    if (weapon.ammo === Infinity) {
      return false;
    }

    // Already full magazine
    if (weapon.ammo >= weapon.maxAmmo) {
      return false;
    }

    // No reserve ammo available
    if (weapon.reserve <= 0) {
      return false;
    }

    // Already reloading
    if (this.isReloadingState) {
      return false;
    }

    // Start timed reload
    this.isReloadingState = true;
    this.reloadStartTime = performance.now() / 1000;
    this.reloadAmmoSnapshot = weapon.ammo;

    if (this.onReloadStarted) {
      this.onReloadStarted();
    }

    return true;
  }

  /**
   * Complete the reload — transfer ammo from reserve to magazine.
   * Called automatically when the reload timer expires.
   */
  private completeReload(): void {
    this.isReloadingState = false;
    const weapon = this.getCurrentWeapon();

    // Calculate how many rounds to load (may have changed if player fired mid-reload)
    const needed = weapon.maxAmmo - this.reloadAmmoSnapshot;
    const toLoad = Math.min(needed, weapon.reserve);

    weapon.ammo = this.reloadAmmoSnapshot + toLoad;
    weapon.reserve -= toLoad;
    this.lastReloadTime = performance.now() / 1000;

    if (this.onReloadComplete) {
      this.onReloadComplete();
    }
  }

  /**
   * Whether a reload is currently in progress.
   */
  public isReloading(): boolean {
    return this.isReloadingState;
  }

  /**
   * Returns 0–1 reload progress (0 = just started, 1 = done).
   * Returns 0 when no reload is active.
   */
  public getReloadProgress(): number {
    if (!this.isReloadingState) return 0;
    const now = performance.now() / 1000;
    return Math.min((now - this.reloadStartTime) / this.RELOAD_DURATION, 1);
  }

  // ============================================================
  // RESERVE AMMO PICKUP
  // ============================================================

  /**
   * Add reserve ammo to the current weapon (from ammo box pickups).
   * Caps at maxReserve. Melee weapons are unaffected.
   *
   * @param amount - Number of rounds to add to reserve
   */
  public addReserve(amount: number): boolean {
    const weapon = this.getCurrentWeapon();

    // Melee weapons have unlimited ammo — pickup is useless
    if (weapon.reserve === Infinity) {
      return false;
    }

    // Already at max reserve
    if (weapon.reserve >= weapon.maxReserve) {
      return false;
    }

    weapon.reserve = Math.min(weapon.reserve + amount, weapon.maxReserve);
    return true;
  }

  /**
   * Check if the current weapon is completely out of ammo
   * (both magazine and reserve are depleted).
   */
  public isOutOfAmmo(): boolean {
    const weapon = this.getCurrentWeapon();
    if (weapon.ammo === Infinity) return false;
    return weapon.ammo <= 0 && weapon.reserve <= 0;
  }

  /**
   * Check if the current weapon is low on reserve ammo
   * (less than 30% of maxReserve remaining).
   */
  public isLowOnReserve(): boolean {
    const weapon = this.getCurrentWeapon();
    if (weapon.maxReserve === Infinity) return false;
    return weapon.reserve < weapon.maxReserve * 0.3;
  }

  // ============================================================
  // UTILITY
  // ============================================================

  public toggleSuppressor(): void {
    const weapon = this.getCurrentWeapon();
    weapon.isSuppressed = !weapon.isSuppressed;
  }

  public getNoiseRadius(): number {
    const weapon = this.getCurrentWeapon();
    if (weapon.type === 'melee') return 5;  // Melee = very quiet
    return weapon.isSuppressed ? 10 : 50;
  }
}
