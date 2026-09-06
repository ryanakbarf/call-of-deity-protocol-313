/**
 * StealthSystem.ts
 * Manages detection and stealth mechanics.
 *
 * Features:
 *   - Visual detection cone: enemies only detect within a 90° forward cone
 *   - Detection delay: 0.5s reaction time before alert triggers
 *   - Sound-based detection: unsuppressed gunfire alerts within noise radius (50 units)
 *   - Stealth kill bonus: silent kills don't alert nearby enemies
 *   - Detection level display: '(STEALTHY)' / '(DETECTED)' based on detection meter
 */

import * as THREE from 'three';

export type DetectionLevel = 0 | 1 | 2 | 3 | 4 | 5;

interface DetectionState {
  level: DetectionLevel;
  progress: number; // 0-100
  isDetected: boolean;
}

export class StealthSystem {
  private detection: DetectionState;
  private decayRate: number = 5; // per second when hidden
  private increaseRate: number = 20; // per second when visible

  // ── Detection Delay ──
  /** Time (seconds) the player must be continuously visible before detection starts rising. */
  private readonly DETECTION_DELAY: number = 0.5;
  /** Accumulates continuous visibility time; resets when LOS or cone check fails. */
  private visibilityTimer: number = 0;
  /** Whether the delay has been satisfied — detection only rises after this is true. */
  private delaySatisfied: boolean = false;

  // ── Sound-based Detection ──
  /** Noise radius for unsuppressed gunfire (world units). */
  private readonly GUNFIRE_NOISE_RADIUS: number = 50;
  /** Alert level applied to enemies within noise radius. */
  private readonly GUNFIRE_ALERT_AMOUNT: number = 60;

  // ── Visual Cone ──
  /** Half-angle of the enemy detection cone in radians (90° total = 45° each side). */
  private readonly DETECTION_CONE_HALF_ANGLE: number = Math.PI / 4; // 45°

  constructor() {
    this.detection = {
      level: 0,
      progress: 0,
      isDetected: false,
    };
  }

  /**
   * Main update — called every frame.
   *
   * @param delta - Frame delta time in seconds
   * @param playerPosition - World position of the player
   * @param enemies - Array of enemy objects (must have .group, .state, .detectionRange, .group.rotation.y)
   * @param colliders - Optional wall meshes for line-of-sight raycasting
   */
  public update(
    delta: number,
    playerPosition: THREE.Vector3,
    enemies: any[],
    colliders?: THREE.Mesh[]
  ): void {
    let isPlayerVisible = false;
    let closestEnemyDistance = Infinity;

    // Pre-build a raycaster for LOS checks (reused per enemy)
    const raycaster = new THREE.Raycaster();

    enemies.forEach((enemy) => {
      if (enemy.state === 'dead') return;

      // Enemy uses .group (THREE.Group) not .mesh
      const enemyPos = enemy.group ? enemy.group.position : enemy.position;
      if (!enemyPos) return;

      const distance = enemyPos.distanceTo(playerPosition);

      if (distance < enemy.detectionRange) {
        closestEnemyDistance = Math.min(closestEnemyDistance, distance);

        // ═══ VISUAL DETECTION CONE CHECK ═══
        // Enemies only detect within a 90° forward cone (not behind them).
        // Enemy forward direction is derived from group.rotation.y.
        // In Three.js, default forward is -Z, so:
        //   forward.x = -sin(rotation.y)
        //   forward.z = -cos(rotation.y)
        const enemyRotationY = enemy.group.rotation.y;
        const forwardX = -Math.sin(enemyRotationY);
        const forwardZ = -Math.cos(enemyRotationY);

        // Direction from enemy to player (XZ plane only)
        const toPlayerX = playerPosition.x - enemyPos.x;
        const toPlayerZ = playerPosition.z - enemyPos.z;
        const toPlayerLen = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);

        if (toPlayerLen < 0.1) {
          // Too close — always detected (in personal space)
        } else {
          // Dot product gives cosine of angle between forward and player direction
          const dot = (forwardX * toPlayerX + forwardZ * toPlayerZ) / toPlayerLen;
          // Clamp to [-1, 1] to avoid floating-point issues
          const clampedDot = Math.max(-1, Math.min(1, dot));
          const angleFromForward = Math.acos(clampedDot);

          // If player is outside the 90° cone (±45°), skip detection for this enemy
          if (angleFromForward > this.DETECTION_CONE_HALF_ANGLE) {
            return;
          }
        }

        // Line of sight check — if colliders provided, raycast to verify no wall blocks view
        let hasLOS = true;
        if (colliders && colliders.length > 0) {
          const dir = new THREE.Vector3().subVectors(playerPosition, enemyPos);
          const losDist = dir.length();
          if (losDist > 0.1) {
            dir.normalize();
            // Offset start slightly forward to avoid raycast-inside-object issue
            const rayStart = enemyPos.clone().add(dir.clone().multiplyScalar(0.5));
            const remainingDist = losDist - 0.5;
            if (remainingDist > 0) {
              raycaster.set(rayStart, dir);
              raycaster.near = 0.1;
              raycaster.far = remainingDist;
              const hits = raycaster.intersectObjects(colliders, false);
              if (hits.length > 0) {
                hasLOS = false; // Wall between enemy and player
              }
            }
          }
        }

        // Only count as visible if within 70% of detection range AND has LOS
        if (distance < enemy.detectionRange * 0.7 && hasLOS) {
          isPlayerVisible = true;
        }
      }
    });

    // ═══ DETECTION DELAY ═══
    // Even when spotted, there's a 0.5s delay before alert (simulates reaction time).
    if (isPlayerVisible) {
      this.visibilityTimer += delta;
      if (this.visibilityTimer >= this.DETECTION_DELAY) {
        this.delaySatisfied = true;
      }
    } else {
      // Reset the delay when player is no longer visible
      this.visibilityTimer = 0;
      this.delaySatisfied = false;
    }

    // Update detection — only if delay has been satisfied
    if (isPlayerVisible && this.delaySatisfied) {
      this.detection.progress = Math.min(
        100,
        this.detection.progress + this.increaseRate * delta
      );
    } else {
      this.detection.progress = Math.max(
        0,
        this.detection.progress - this.decayRate * delta
      );
    }

    // Update level
    this.detection.level = this.calculateLevel(this.detection.progress);
    this.detection.isDetected = this.detection.level >= 4;
  }

  /**
   * Report a gunshot at the given position. Alerts all enemies within the
   * noise radius (50 units for unsuppressed, already halved by caller for suppressed).
   *
   * @param gunshotPosition - World position where the shot was fired
   * @param enemies - Array of enemy objects
   * @param isSuppressed - Whether the weapon was suppressed (smaller noise radius)
   * @param colliders - Optional wall meshes — noise is blocked by walls
   */
  public reportGunshot(
    gunshotPosition: THREE.Vector3,
    enemies: any[],
    isSuppressed: boolean,
    colliders?: THREE.Mesh[]
  ): void {
    // Suppressed weapons have a much smaller noise radius (already halved by caller)
    const radius = isSuppressed ? this.GUNFIRE_NOISE_RADIUS * 0.3 : this.GUNFIRE_NOISE_RADIUS;
    const alertAmount = isSuppressed ? this.GUNFIRE_ALERT_AMOUNT * 0.4 : this.GUNFIRE_ALERT_AMOUNT;

    const raycaster = new THREE.Raycaster();

    enemies.forEach((enemy) => {
      if (enemy.state === 'dead') return;

      const enemyPos = enemy.group ? enemy.group.position : enemy.position;
      if (!enemyPos) return;

      const distance = enemyPos.distanceTo(gunshotPosition);
      if (distance >= radius) return;

      // Sound is blocked by walls — raycast to check
      if (colliders && colliders.length > 0) {
        const dir = new THREE.Vector3().subVectors(enemyPos, gunshotPosition);
        const losDist = dir.length();
        if (losDist > 0.1) {
          dir.normalize();
          const rayStart = gunshotPosition.clone().add(dir.clone().multiplyScalar(0.5));
          const remainingDist = losDist - 0.5;
          if (remainingDist > 0) {
            raycaster.set(rayStart, dir);
            raycaster.near = 0.1;
            raycaster.far = remainingDist;
            const hits = raycaster.intersectObjects(colliders, false);
            if (hits.length > 0) {
              return; // Wall blocks sound — enemy doesn't hear it
            }
          }
        }
      }

      // Alert scales with proximity — closer = louder
      const proximityScale = 1 - (distance / radius);
      const scaledAlert = alertAmount * proximityScale;
      enemy.alertLevel = Math.min(100, enemy.alertLevel + scaledAlert);
    });
  }

  private calculateLevel(progress: number): DetectionLevel {
    if (progress < 10) return 0;
    if (progress < 30) return 1;
    if (progress < 50) return 2;
    if (progress < 70) return 3;
    if (progress < 90) return 4;
    return 5;
  }

  public getDetectionLevel(): DetectionLevel {
    return this.detection.level;
  }

  public getDetectionProgress(): number {
    return this.detection.progress;
  }

  public isDetected(): boolean {
    return this.detection.isDetected;
  }

  /**
   * Returns a human-readable stealth status label based on current detection.
   * Used by the HUD to display "(STEALTHY)" or "(DETECTED)".
   */
  public getStealthStatusText(): string {
    if (this.detection.progress < 10) return '(STEALTHY)';
    if (this.detection.progress < 30) return '(CAUTIOUS)';
    if (this.detection.progress < 70) return '(SUSPICIOUS)';
    if (this.detection.progress < 90) return '(ALERTED)';
    return '(DETECTED)';
  }

  /**
   * Returns the stealth status color (hex string) for HUD display.
   */
  public getStealthStatusColor(): string {
    if (this.detection.progress < 10) return '#00ff88';   // Green — stealthy
    if (this.detection.progress < 30) return '#FFD700';   // Gold — cautious
    if (this.detection.progress < 70) return '#f39c12';   // Orange — suspicious
    if (this.detection.progress < 90) return '#ff6600';   // Dark orange — alerted
    return '#e74c3c';                                      // Red — detected
  }

  public reset(): void {
    this.detection = {
      level: 0,
      progress: 0,
      isDetected: false,
    };
    this.visibilityTimer = 0;
    this.delaySatisfied = false;
  }
}
