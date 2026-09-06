/**
 * DebugMode.ts
 * Toggleable debug overlay for Call of Deity: Protocol 313
 * 
 * Press F1 to toggle debug mode on/off.
 */

import * as THREE from 'three';

export interface DebugConfig {
  gui: boolean;           // Debug panel (top-right)
  health100x: boolean;    // Player health multiplier
  enemyCollision: boolean; // Red wireframe around enemies in walls
  envCollision: boolean;   // Green wireframe on all environment colliders
  enemyHitbox: boolean;    // Yellow wireframe showing enemy head/body hitboxes
  playerPosition: boolean; // Show player X,Y,Z
  enemyPositions: boolean; // Show enemy positions with labels
  bulletTrails: boolean;   // Highlight active bullet trails
  terrainNormals: boolean; // Show terrain height at cursor
}

export class DebugMode {
  public enabled: boolean = false;
  public config: DebugConfig = {
    gui: true,
    health100x: true,
    enemyCollision: true,
    envCollision: false,    // Off by default (too many objects)
    enemyHitbox: true,
    playerPosition: true,
    enemyPositions: true,
    bulletTrails: false,
    terrainNormals: false,
  };
  
  // Debug meshes
  private envDebugMeshes: THREE.Mesh[] = [];
  private enemyDebugMeshes: THREE.Mesh[] = [];
  private hitboxMeshes: THREE.Mesh[] = [];
  private positionLabels: THREE.Sprite[] = [];
  
  private scene: THREE.Scene;
  private colliders: THREE.Mesh[] = [];
  private enemies: any[] = [];
  private terrainHeightProvider: ((x: number, z: number) => number) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public setColliders(colliders: THREE.Mesh[]): void {
    this.colliders = colliders;
  }

  public setEnemies(enemies: any[]): void {
    this.enemies = enemies;
  }

  public setTerrainHeightProvider(provider: (x: number, z: number) => number): void {
    this.terrainHeightProvider = provider;
  }

  // ============================================================
  // TOGGLE
  // ============================================================

  public toggle(): void {
    this.enabled = !this.enabled;
    console.log(`[DebugMode] ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (!this.enabled) {
      this.clearAllDebug();
    }
  }

  public toggleFeature(feature: keyof DebugConfig): void {
    this.config[feature] = !this.config[feature];
    console.log(`[Debug] ${feature}: ${this.config[feature] ? 'ON' : 'OFF'}`);
    
    if (!this.config[feature]) {
      this.clearFeature(feature);
    }
  }

  // ============================================================
  // UPDATE (called every frame)
  // ============================================================

  public update(): void {
    if (!this.enabled) return;
    
    if (this.config.envCollision) {
      this.drawEnvironmentColliders();
    }
    if (this.config.enemyCollision) {
      this.drawEnemyCollision();
    }
    if (this.config.enemyHitbox) {
      this.drawEnemyHitboxes();
    }
    if (this.config.enemyPositions) {
      this.drawEnemyLabels();
    }
  }

  // ============================================================
  // ENVIRONMENT COLLIDERS (Green wireframe)
  // ============================================================

  private drawEnvironmentColliders(): void {
    // Rebuild every frame when toggled on
    if (this.envDebugMeshes.length === 0 && this.colliders.length > 0) {
      for (const collider of this.colliders) {
        const box = new THREE.Box3().setFromObject(collider);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        if (size.x < 0.01 || size.y < 0.01 || size.z < 0.01) continue;
        
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.2,
          wireframe: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        
        const center = new THREE.Vector3();
        box.getCenter(center);
        mesh.position.copy(center);
        
        this.scene.add(mesh);
        this.envDebugMeshes.push(mesh);
      }
    }
  }

  // ============================================================
  // ENEMY COLLISION (Red wireframe — stuck detection)
  // ============================================================

  private drawEnemyCollision(): void {
    this.clearEnemyDebug();
    
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      
      const pos = enemy.group.position;
      const enemyBox = new THREE.Box3(
        new THREE.Vector3(pos.x - 0.5, pos.y, pos.z - 0.5),
        new THREE.Vector3(pos.x + 0.5, pos.y + 2, pos.z + 0.5)
      );
      
      // Check if stuck in any collider
      let isStuck = false;
      for (const collider of this.colliders) {
        const box = new THREE.Box3().setFromObject(collider);
        if (enemyBox.intersectsBox(box)) {
          isStuck = true;
          break;
        }
      }
      
      if (isStuck) {
        const geo = new THREE.BoxGeometry(1.2, 2.2, 1.2);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0.5,
          wireframe: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, pos.y + 1, pos.z);
        this.scene.add(mesh);
        this.enemyDebugMeshes.push(mesh);
      }
    }
  }

  // ============================================================
  // ENEMY HITBOXES (Yellow wireframe for headshot detection)
  // ============================================================

  private drawEnemyHitboxes(): void {
    this.clearHitboxes();
    
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      
      const pos = enemy.group.position;
      
      // Body hitbox (y: 0.5 to 1.4)
      const bodyGeo = new THREE.BoxGeometry(0.5, 0.9, 0.35);
      const bodyMat = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.2,
        wireframe: true,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.set(pos.x, pos.y + 0.95, pos.z);
      this.scene.add(bodyMesh);
      this.hitboxMeshes.push(bodyMesh);
      
      // Head hitbox (y: 1.4 to 1.7) — HEADSHOT zone
      const headGeo = new THREE.BoxGeometry(0.28, 0.3, 0.28);
      const headMat = new THREE.MeshBasicMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: 0.3,
        wireframe: true,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.set(pos.x, pos.y + 1.55, pos.z);
      this.scene.add(headMesh);
      this.hitboxMeshes.push(headMesh);
    }
  }

  // ============================================================
  // ENEMY POSITION LABELS
  // ============================================================

  private drawEnemyLabels(): void {
    this.clearLabels();
    
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      
      const pos = enemy.group.position;
      
      // State color
      const stateColors: Record<string, string> = {
        patrol: '#44ff44',
        idle: '#88ff88',
        smoking: '#88ff88',
        chatting: '#88ff88',
        scanning: '#ffaa00',
        alert: '#ffaa00',
        search: '#ff6600',
        attack: '#ff4444',
      };
      
      // Detection status
      const alertPct = Math.round(enemy.alertLevel || 0);
      const stateText = (enemy.state || 'unknown').toUpperCase();
      const behaviorText = enemy.behavior || 'patrol';
      
      // Create text sprite
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext('2d')!;
      
      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, 512, 96);
      
      // Border
      ctx.strokeStyle = stateColors[enemy.state] || '#44ff44';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 510, 94);
      
      // Enemy name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px monospace';
      ctx.fillText(`#${enemy.tag || '?'} [${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}]`, 10, 30);
      
      // State + behavior
      ctx.fillStyle = stateColors[enemy.state] || '#44ff44';
      ctx.font = '22px monospace';
      ctx.fillText(`${stateText} (${behaviorText})`, 10, 58);
      
      // Alert level bar
      ctx.fillStyle = '#333';
      ctx.fillRect(10, 70, 200, 12);
      ctx.fillStyle = alertPct > 70 ? '#ff4444' : alertPct > 30 ? '#ffaa00' : '#44ff44';
      ctx.fillRect(10, 70, alertPct * 2, 12);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(`Alert: ${alertPct}%`, 220, 80);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(pos.x, pos.y + 2.8, pos.z);
      sprite.scale.set(3, 0.56, 1);
      this.scene.add(sprite);
      this.positionLabels.push(sprite);
    }
  }

  // ============================================================
  // CLEAR METHODS
  // ============================================================

  private clearEnvDebug(): void {
    for (const mesh of this.envDebugMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.envDebugMeshes = [];
  }

  private clearEnemyDebug(): void {
    for (const mesh of this.enemyDebugMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.enemyDebugMeshes = [];
  }

  private clearHitboxes(): void {
    for (const mesh of this.hitboxMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.hitboxMeshes = [];
  }

  private clearLabels(): void {
    for (const sprite of this.positionLabels) {
      this.scene.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      sprite.material.dispose();
    }
    this.positionLabels = [];
  }

  private clearFeature(feature: keyof DebugConfig): void {
    switch (feature) {
      case 'envCollision': this.clearEnvDebug(); break;
      case 'enemyCollision': this.clearEnemyDebug(); break;
      case 'enemyHitbox': this.clearHitboxes(); break;
      case 'enemyPositions': this.clearLabels(); break;
    }
  }

  private clearAllDebug(): void {
    this.clearEnvDebug();
    this.clearEnemyDebug();
    this.clearHitboxes();
    this.clearLabels();
  }

  // ============================================================
  // GETTERS
  // ============================================================

  public isHealth100x(): boolean {
    return this.enabled && this.config.health100x;
  }
}
