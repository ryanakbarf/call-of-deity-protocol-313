/**
 * SummonSystem.ts
 * Manages drone and fire support summoning.
 * 
 * "The Swarm Radio" —召唤无人机群和火力支援
 */

import * as THREE from 'three';
import { AudioManager } from '../utils/AudioManager';

/** Minimal enemy shape needed for AoE damage from summon explosions. */
export interface DamageableEnemy {
  group: THREE.Group;
  state: string;
  health: number;
}

interface SummonAbility {
  name: string;
  type: 'drone_swarm' | 'kamikaze' | 'recon' | 'fire_support';
  cooldown: number;
  lastUsed: number;
  maxUses: number;
  currentUses: number;
  damage: number;
  radius: number;
}

export class SummonSystem {
  private scene: THREE.Scene;
  private audioManager: AudioManager;
  private abilities: SummonAbility[] = [];
  private swarmRadioCharge: number = 100;
  private maxCharge: number = 100;

  constructor(scene: THREE.Scene, audioManager: AudioManager) {
    this.scene = scene;
    this.audioManager = audioManager;
    this.initAbilities();
  }

  private initAbilities(): void {
    this.abilities = [
      {
        name: 'Swarm Angels',
        type: 'drone_swarm',
        cooldown: 45,
        lastUsed: 0,
        maxUses: 3,
        currentUses: 3,
        damage: 15,
        radius: 10,
      },
      {
        name: 'Martyr Drone',
        type: 'kamikaze',
        cooldown: 60,
        lastUsed: 0,
        maxUses: 2,
        currentUses: 2,
        damage: 100,
        radius: 8,
      },
      {
        name: 'Recon Eyes',
        type: 'recon',
        cooldown: 20,
        lastUsed: 0,
        maxUses: 5,
        currentUses: 5,
        damage: 0,
        radius: 20,
      },
      {
        name: 'Fateh Salvo',
        type: 'fire_support',
        cooldown: 90,
        lastUsed: 0,
        maxUses: 1,
        currentUses: 1,
        damage: 150,
        radius: 15,
      },
    ];
  }

  public update(delta: number): void {
    // Regenerate charge slowly
    this.swarmRadioCharge = Math.min(
      this.maxCharge,
      this.swarmRadioCharge + delta * 2
    );
  }

  public useAbility(
    index: number,
    targetPosition: THREE.Vector3,
    enemies?: DamageableEnemy[]
  ): boolean {
    if (index < 0 || index >= this.abilities.length) return false;

    const ability = this.abilities[index];
    const now = performance.now() / 1000;

    // Check cooldown
    if (now - ability.lastUsed < ability.cooldown) {
      console.log(`[SummonSystem] ${ability.name} on cooldown`);
      return false;
    }

    // Check uses
    if (ability.currentUses <= 0) {
      console.log(`[SummonSystem] ${ability.name} no uses remaining`);
      return false;
    }

    // Check charge
    const chargeCost = ability.type === 'fire_support' ? 50 : 25;
    if (this.swarmRadioCharge < chargeCost) {
      console.log(`[SummonSystem] Not enough charge`);
      return false;
    }

    // Execute ability
    this.executeAbility(ability, targetPosition, enemies);
    ability.lastUsed = now;
    ability.currentUses--;
    this.swarmRadioCharge -= chargeCost;

    console.log(`[SummonSystem] ${ability.name} activated!`);
    return true;
  }

  private executeAbility(
    ability: SummonAbility,
    target: THREE.Vector3,
    enemies?: DamageableEnemy[]
  ): void {
    switch (ability.type) {
      case 'drone_swarm':
        this.spawnDroneSwarm(target, ability.damage, ability.radius, enemies);
        break;
      case 'kamikaze':
        this.spawnKamikazeDrone(target, ability.damage, enemies);
        break;
      case 'recon':
        this.activateRecon(target, ability.radius);
        break;
      case 'fire_support':
        this.callFireSupport(target, ability.damage, ability.radius, enemies);
        break;
    }
  }

  private spawnDroneSwarm(
    target: THREE.Vector3,
    damage: number,
    radius: number,
    enemies?: DamageableEnemy[]
  ): void {
    // Create multiple small drones
    for (let i = 0; i < 8; i++) {
      const droneGeometry = new THREE.ConeGeometry(0.2, 0.5, 4);
      const droneMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7,
      });
      const drone = new THREE.Mesh(droneGeometry, droneMaterial);

      // Random position around target
      const angle = (i / 8) * Math.PI * 2;
      const offset = Math.random() * 3;
      drone.position.set(
        target.x + Math.cos(angle) * offset,
        10 + Math.random() * 5,
        target.z + Math.sin(angle) * offset
      );

      this.scene.add(drone);

      // Animate to target
      this.animateDroneToTarget(drone, target, damage, radius, enemies);
    }
  }

  private animateDroneToTarget(
    drone: THREE.Mesh,
    target: THREE.Vector3,
    damage: number,
    radius: number,
    enemies?: DamageableEnemy[]
  ): void {
    const startTime = performance.now();
    const duration = 2000; // 2 seconds

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Move towards target
      drone.position.y = 10 * (1 - progress);
      drone.position.x += (target.x - drone.position.x) * 0.05;
      drone.position.z += (target.z - drone.position.z) * 0.05;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Impact — create explosion that damages nearby enemies
        this.createExplosion(target, damage, radius, enemies);
        this.scene.remove(drone);
      }
    };

    animate();
  }

  private spawnKamikazeDrone(
    target: THREE.Vector3,
    damage: number,
    enemies?: DamageableEnemy[]
  ): void {
    const droneGeometry = new THREE.BoxGeometry(0.5, 0.2, 0.8);
    const droneMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
    });
    const drone = new THREE.Mesh(droneGeometry, droneMaterial);
    drone.position.set(target.x, 15, target.z - 30);

    this.scene.add(drone);
    this.animateDroneToTarget(drone, target, damage, 8, enemies);
  }

  private activateRecon(center: THREE.Vector3, radius: number): void {
    // Create recon effect
    const effectGeometry = new THREE.RingGeometry(0.1, radius, 32);
    const effectMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const effect = new THREE.Mesh(effectGeometry, effectMaterial);
    effect.rotation.x = -Math.PI / 2;
    effect.position.set(center.x, 0.1, center.z);

    this.scene.add(effect);

    // Remove after 15 seconds
    setTimeout(() => {
      this.scene.remove(effect);
    }, 15000);
  }

  private callFireSupport(
    target: THREE.Vector3,
    damage: number,
    radius: number,
    enemies?: DamageableEnemy[]
  ): void {
    // Create impact markers
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * radius,
          0,
          (Math.random() - 0.5) * radius
        );
        const impactPoint = target.clone().add(offset);
        this.createExplosion(impactPoint, damage / 3, radius, enemies);
      }, i * 500);
    }
  }

  /**
   * Creates a visual explosion and damages nearby enemies within the blast radius.
   * @param position - World-space center of the explosion.
   * @param damage - Damage dealt to each enemy within range.
   * @param radius - Blast radius to check for enemies (default 8).
   * @param enemies - Optional array of living enemies to damage.
   */
  private createExplosion(
    position: THREE.Vector3,
    damage: number,
    radius: number = 8,
    enemies?: DamageableEnemy[]
  ): void {
    // Explosion audio
    this.audioManager.playExplosion();

    // Visual explosion
    const explosionGeometry = new THREE.SphereGeometry(1, 16, 16);
    const explosionMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.8,
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    explosion.position.y = 1;

    this.scene.add(explosion);

    // === DAMAGE nearby enemies ===
    if (enemies && enemies.length > 0) {
      const blastCenter = position.clone();
      blastCenter.y = 1; // Match enemy body height

      for (const enemy of enemies) {
        if (enemy.state === 'dead') continue;

        const dist = enemy.group.position.distanceTo(blastCenter);
        if (dist <= radius) {
          // Damage falloff: full damage at center, 25% at edge
          const falloff = 1 - (dist / radius) * 0.75;
          const actualDamage = Math.round(damage * falloff);

          enemy.health -= actualDamage;

          if (enemy.health <= 0) {
            enemy.health = 0;
            enemy.state = 'dead';
            console.log(`[SummonSystem] Enemy killed by explosion at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
          } else {
            console.log(`[SummonSystem] Enemy damaged for ${actualDamage} (${enemy.health} HP remaining)`);
          }
        }
      }
    }

    // Animate explosion
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / 500, 1);

      explosion.scale.setScalar(1 + progress * 3);
      (explosion.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(explosion);
      }
    };

    animate();
  }

  public getCharge(): number {
    return this.swarmRadioCharge;
  }

  public getMaxCharge(): number {
    return this.maxCharge;
  }

  public getAbility(index: number): SummonAbility | null {
    return this.abilities[index] || null;
  }

  public getAbilities(): SummonAbility[] {
    return this.abilities;
  }
}
