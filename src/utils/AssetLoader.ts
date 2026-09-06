/**
 * AssetLoader.ts
 * Handles loading of game assets (models, textures, sounds).
 */

import * as THREE from 'three';

export class AssetLoader {
  private textureLoader: THREE.TextureLoader;
  private loadedTextures: Map<string, THREE.Texture> = new Map();

  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    console.log('[AssetLoader] Initialized');
  }

  public async loadTexture(key: string, url: string): Promise<THREE.Texture> {
    if (this.loadedTextures.has(key)) {
      return this.loadedTextures.get(key)!;
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          this.loadedTextures.set(key, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(`[AssetLoader] Failed to load texture: ${url}`, error);
          reject(error);
        }
      );
    });
  }

  public getTexture(key: string): THREE.Texture | null {
    return this.loadedTextures.get(key) || null;
  }

  public createPlaceholderTexture(color: string = '#8B7355'): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);
    
    // Add some noise
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      ctx.fillRect(
        Math.random() * 64,
        Math.random() * 64,
        2,
        2
      );
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }
}
