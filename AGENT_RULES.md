# 🤖 Agent Collaboration Rules

## CRITICAL: Cross-Check Protocol

Setiap agent yang mengerjakan task HARUS:

### 1. READ BEFORE WRITE
- Baca SEMUA file yang terpengaruh SEBELUM menulis code
- Jangan asumsi interface/structure — baca langsung

### 2. CHECK CONSISTENCY
Sebelum submit, pastikan:
- Tidak ada hardcoded values yang conflict dengan sistem lain
- Interface yang dipakai sesuai dengan yang didefinisikan
- Tidak ada duplicasi logic

### 3. INTEGRATION POINTS
File yang sering berinteraksi:
```
Player.ts ↔ GameEngine.ts (callbacks, state)
EnemyManager.ts ↔ GameEngine.ts (spawn, terrain, colliders)
WeaponSystem.ts ↔ GameEngine.ts (shoot, ammo)
UIManager.ts ↔ GameEngine.ts (HUD updates)
AudioManager.ts ↔ GameEngine.ts (sound triggers)
```

### 4. COMMON BUGS TO AVOID
- ❌ Hardcoded Y position (use terrainHeightProvider)
- ❌ Hardcoded Z coordinates (use zone constants)
- ❌ Duplicate event listeners (only one per event)
- ❌ RAF loops outside main game loop
- ❌ DOM manipulation without null checks
- ❌ Geometry/material allocation per-frame (pool them)

### 5. FINAL VERIFICATION
Agent terakhir harus:
- Run TypeScript check (npx tsc --noEmit)
- Verify no runtime errors in code paths
- Check that all referenced methods/properties exist
