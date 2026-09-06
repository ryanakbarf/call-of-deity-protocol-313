# Mixamo Integration Guide — Call of Deity: Protocol 313

> **Purpose:** Step-by-step guide for downloading, converting, and integrating Mixamo characters and animations
> **Models Used:** Gas Mask (Hero) + SWAT Guy (Enemy)
> **Format:** GLB (binary GLTF) for Three.js

---

## Table of Contents

1. [Overview](#1-overview)
2. [Account Setup](#2-account-setup)
3. [Character Selection](#3-character-selection)
4. [Step-by-Step Download Instructions](#4-step-by-step-download-instructions)
5. [Model Placement in assets/models/](#5-model-placement-in-assetsmodels)
6. [Animation Download List](#6-animation-download-list)
7. [FBX to GLB Conversion](#7-fbx-to-glb-conversion)
8. [GLB Conversion Instructions](#8-glb-conversion-instructions)
9. [Loading in Three.js](#9-loading-in-threejs)
10. [Troubleshooting Common Issues](#10-troubleshooting-common-issues)
11. [Performance Optimization](#11-performance-optimization)
12. [Quick Reference](#12-quick-reference)

---

## 1. Overview

Call of Deity uses **Mixamo** for character models and animations. Mixamo provides free, pre-rigged humanoid characters with a standardized skeleton that works seamlessly with Three.js via the `GLTFLoader`.

### What We Use from Mixamo

| Asset Type | Source | Format | Purpose |
|------------|--------|--------|---------|
| Character Models | Mixamo Character Library | FBX → GLB | Wolf (Gas Mask) & enemies (SWAT) |
| Animations | Mixamo Animation Library | FBX → GLB | Idle, walk, run, crouch, prone, combat, death, social |
| Skeleton | Mixamo Auto-Rigger | Standard 65-bone | Shared across all characters |

### Why Mixamo?

- **Free** for commercial and non-commercial use
- **Pre-rigged** — no manual skeleton setup needed
- **Standard skeleton** — animations work across different characters
- **High quality** — motion-captured animations
- **Web-friendly** — GLB format is compact and fast to load

---

## 2. Account Setup

### Create a Mixamo Account

1. Go to **https://www.mixamo.com**
2. Click **Sign In** (top right)
3. Sign in with an **Adobe account** (free)
   - If you don't have one, click **Create Account**
   - No credit card required for the free tier
4. You now have access to the full Mixamo library

### Account Limitations (Free Tier)

- Unlimited animation downloads
- Unlimited character downloads
- No batch download (must download one at a time)
- Maximum 2 active characters in your library at once

---

## 3. Character Selection

### Hero Characters: Gas Mask

**Source:** https://www.mixamo.com/#/search?type=Character&query=gas%20mask

The Gas Mask character is used for **Wolf** (the Operator) and **Falcon** (the Overwatch).

| Property | Value |
|----------|-------|
| Name | Gas Mask |
| Type | Hero character |
| Used for | Wolf, Falcon |
| Model path | `public/assets/models/gas-mask/model.glb` |
| Scale | 1.0 (already in meters after conversion) |
| Eye height | 1.6 units |
| Character height | 1.8 units |

**Why Gas Mask?**
- Military/tactical appearance fits the game's theme
- Gas mask lenses can be tinted (green glow for heroes)
- Clean mesh with good poly count
- Standard Mixamo skeleton

### Enemy Characters: SWAT Guy

**Source:** https://www.mixamo.com/#/search?type=Character&query=swat

The SWAT Guy character is used for **AI enemy combatants**.

| Property | Value |
|----------|-------|
| Name | SWAT |
| Type | Enemy character |
| Used for | All enemy combatants |
| Model path | `public/assets/models/swat-guy/model.glb` |
| Scale | 1.0 |
| Eye height | 1.6 units |
| Character height | 1.8 units |

**Why SWAT?**
- Distinct silhouette from heroes
- Visor can be tinted red (enemy indicator)
- Fits the urban/combat setting
- Good animation compatibility

### Other Recommended Characters

For prototyping or alternate skins:

| Character | Style | Good For |
|-----------|-------|----------|
| Y Bot | Default mannequin | Clean prototyping |
| X Bot | Female mannequin | Alternate gender |
| Soldier | Military gear | Direct replacement |
| Riot Police | SWAT/tactical | Heavily armored enemies |

---

## 4. Step-by-Step Download Instructions

### Phase 1: Download Character Model

1. Go to https://www.mixamo.com
2. Click **Characters** tab
3. Search for **"Gas Mask"** (or "SWAT" for enemies)
4. Click the character to select it — it appears in the preview pane
5. Click **Animations** tab (to download with the first animation)
6. Search for **"Standing Idle"**
7. Click the animation to preview it on your character
8. **Download Settings** (left sidebar):
   - **Format:** `FBX Binary`
   - **Skin:** `With Skin` ← **IMPORTANT: This downloads the character mesh**
   - **Frames per Second:** `30`
   - **Keyframe Reduction:** `none`
9. Click **DOWNLOAD**
10. Save as `gas-mask-with-idle.fbx`

### Phase 2: Download Animations (Without Skin)

For each animation you need:

1. Stay on the **Animations** tab
2. Search for the animation name (see Animation Download List below)
3. Click to preview
4. **Download Settings:**
   - **Format:** `FBX Binary`
   - **Skin:** `Without Skin` ← **IMPORTANT: Smaller file, shares skeleton**
   - **Frames per Second:** `30`
   - **Keyframe Reduction:** `none`
5. Click **DOWNLOAD**
6. Save with the appropriate filename

### Phase 3: Repeat for All Animations

Download each animation one at a time using the naming convention in the Animation Download List below.

### Download Order (Recommended)

```
1. "Standing Idle" (WITH SKIN) — Gets you the rigged mesh + first animation
2. All remaining animations (WITHOUT SKIN) — Skeleton-only, smaller files
```

---

## 5. Model Placement in assets/models/

### Directory Structure

After downloading and converting all files, place them in this structure:

```
public/
└── assets/
    └── models/
        ├── gas-mask/
        │   ├── model.glb              ← Character mesh + skeleton
        │   ├── idle.glb               ← Standing Idle
        │   ├── walk.glb               ← Walking
        │   ├── run.glb                ← Running
        │   ├── crouch_idle.glb        ← Crouching Idle
        │   ├── crouch_walk.glb        ← Crouching Walk
        │   ├── prone_idle.glb         ← Prone Idle
        │   ├── prone_crawl.glb        ← Prone Crawl
        │   ├── rifle_idle.glb         ← Rifle Aiming
        │   ├── rifle_walk.glb         ← Rifle Walking
        │   ├── rifle_run.glb          ← Rifle Running
        │   ├── rifle_shoot.glb        ← Rifle Shooting
        │   ├── rifle_reload.glb       ← Rifle Reloading
        │   ├── death.glb              ← Death Fall
        │   ├── hit_front.glb          ← Hit Front
        │   ├── hit_back.glb           ← Hit Back
        │   ├── smoking.glb            ← Smoking
        │   ├── talking.glb            ← Talking
        │   ├── sitting.glb            ← Sitting
        │   └── radio.glb              ← Using Radio
        │
        └── swat-guy/
            ├── model.glb              ← Character mesh + skeleton
            ├── idle.glb               ← (same animation set)
            ├── walk.glb
            ├── run.glb
            ├── crouch_idle.glb
            ├── crouch_walk.glb
            ├── prone_idle.glb
            ├── prone_crawl.glb
            ├── rifle_idle.glb
            ├── rifle_walk.glb
            ├── rifle_run.glb
            ├── rifle_shoot.glb
            ├── rifle_reload.glb
            ├── death.glb
            ├── hit_front.glb
            ├── hit_back.glb
            ├── smoking.glb
            ├── talking.glb
            ├── sitting.glb
            └── radio.glb
```

### File Naming Convention

| Mixamo Animation Name | File Name in Project |
|----------------------|---------------------|
| Standing Idle | `idle.glb` |
| Walking | `walk.glb` |
| Running | `run.glb` |
| Crouching Idle | `crouch_idle.glb` |
| Crouching Walk | `crouch_walk.glb` |
| Prone Idle | `prone_idle.glb` |
| Prone Crawl | `prone_crawl.glb` |
| Rifle Aiming | `rifle_idle.glb` |
| Rifle Walking | `rifle_walk.glb` |
| Rifle Running | `rifle_run.glb` |
| Rifle Shooting | `rifle_shoot.glb` |
| Rifle Reloading | `rifle_reload.glb` |
| Death Fall | `death.glb` |
| Hit Front | `hit_front.glb` |
| Hit Back | `hit_back.glb` |
| Smoking | `smoking.glb` |
| Talking | `talking.glb` |
| Sitting | `sitting.glb` |
| Using Radio | `radio.glb` |

### Why This Structure?

- Each character has its own directory
- Model and animations live together
- Simple flat structure (no subdirectories)
- Easy to swap characters (just change the directory)

---

## 6. Animation Download List

### Core Locomotion (Priority: ★★★)

| Animation | Mixamo Search | File Name | Loop | Notes |
|-----------|--------------|-----------|------|-------|
| Idle | "Standing Idle" | `idle.glb` | Yes | First download (with skin) |
| Walk | "Walking" | `walk.glb` | Yes | Forward walking |
| Run | "Running" | `run.glb` | Yes | Sprinting forward |

### Crouch Animations (Priority: ★★☆)

| Animation | Mixamo Search | File Name | Loop | Notes |
|-----------|--------------|-----------|------|-------|
| Crouch Idle | "Crouching Idle" | `crouch_idle.glb` | Yes | Stationary crouch |
| Crouch Walk | "Crouching Walk" | `crouch_walk.glb` | Yes | Moving while crouched |

### Prone Animations (Priority: ★★☆)

| Animation | Mixamo Search | File Name | Loop | Notes |
|-----------|--------------|-----------|------|-------|
| Prone Idle | "Prone Idle" | `prone_idle.glb` | Yes | Lying down stationary |
| Prone Crawl | "Prone Crawl" | `prone_crawl.glb` | Yes | Crawling forward |

### Combat Animations (Priority: ★★★)

| Animation | Mixamo Search | File Name | Loop | Notes |
|-----------|--------------|-----------|------|-------|
| Rifle Aim Idle | "Rifle Aiming" | `rifle_idle.glb` | Yes | Aiming down sights |
| Rifle Walk | "Rifle Walking" | `rifle_walk.glb` | Yes | Walking while aiming |
| Rifle Run | "Rifle Running" | `rifle_run.glb` | Yes | Running while aiming |
| Rifle Shoot | "Rifle Shooting" | `rifle_shoot.glb` | No | Firing animation (one-shot) |
| Rifle Reload | "Rifle Reloading" | `rifle_reload.glb` | No | Reload animation (one-shot) |

### Reaction Animations (Priority: ★★★)

| Animation | Mixamo Search | File Name | Loop | Notes |
|-----------|--------------|-----------|------|-------|
| Death | "Death Fall" | `death.glb` | No | Death animation (clamp at end) |
| Hit Front | "Hit Front" | `hit_front.glb` | No | Flinch from front hit |
| Hit Back | "Hit Back" | `hit_back.glb` | No | Flinch from back hit |

### Social / Ambient Animations (Priority: ★☆☆)

| Animation | Mixamo Search | File Name | Loop | Notes |
|-----------|--------------|-----------|------|-------|
| Smoking | "Smoking" | `smoking.glb` | Yes | Idle smoking animation |
| Talking | "Talking" | `talking.glb` | Yes | Conversation gesture |
| Sitting | "Sitting" | `sitting.glb` | Yes | Seated idle |
| Radio | "Using Radio" | `radio.glb` | Yes | Radio communication |

### Total Downloads Per Character

- **1 model** (with skin)
- **19 animations** (without skin)
- **Total:** 20 FBX files per character × 2 characters = **40 files**

---

## 7. FBX to GLB Conversion

### Why Convert?

- Three.js `GLTFLoader` is faster and more reliable than `FBXLoader`
- GLB is a single binary file (no external texture dependencies)
- Better browser support and smaller file sizes
- WebGL optimization built into the format

### Method 1: Blender (Recommended)

**Install Blender:** https://www.blender.org/download/

#### Single File Conversion

1. Open Blender
2. File → Import → FBX (.fbx)
3. Select your FBX file
4. File → Export → glTF 2.0 (.glb/.gltf)
5. Choose **glTF Binary (.glb)**
6. Export Settings:
   - Format: `glTF Binary (.glb)`
   - Include: ✓ Selected Objects / ✓ Visible Objects
   - Transform: +Y Up (default)
   - Geometry: ✓ Apply Modifiers
   - Animation: ✓ Export Animations
   - Armature: ✓ Export Armature
7. Click **Export glTF 2.0**

#### Batch Conversion (Command Line)

```bash
blender --background --python-expr "
import bpy, sys, os

input_dir = sys.argv[sys.argv.index('--') + 1]
output_dir = sys.argv[sys.argv.index('--') + 2]

for f in os.listdir(input_dir):
    if f.endswith('.fbx'):
        filepath = os.path.join(input_dir, f)
        bpy.ops.import_scene.fbx(filepath=filepath)
        
        out_name = os.path.splitext(f)[0] + '.glb'
        out_path = os.path.join(output_dir, out_name)
        
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format='GLB',
            use_selection=False,
            export_animations=True,
            export_skins=True,
            export_yup=True
        )
        
        # Clear scene for next import
        bpy.ops.wm.read_factory_settings(use_empty=True)
" -- ./fbx_input ./glb_output
```

#### Python Script (Programmatic)

```python
import bpy
import os
import sys

def convert_fbx_to_glb(fbx_path, glb_path):
    """Convert a single FBX file to GLB format."""
    # Clear the scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # Import FBX
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    
    # Export as GLB
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        use_selection=False,
        export_animations=True,
        export_skins=True,
        export_yup=True
    )
    
    print(f"Converted: {fbx_path} → {glb_path}")

# Usage
input_dir = "./fbx_files"
output_dir = "./glb_output"
os.makedirs(output_dir, exist_ok=True)

for filename in os.listdir(input_dir):
    if filename.endswith(".fbx"):
        fbx_path = os.path.join(input_dir, filename)
        glb_name = os.path.splitext(filename)[0] + ".glb"
        glb_path = os.path.join(output_dir, glb_name)
        convert_fbx_to_glb(fbx_path, glb_path)
```

### Method 2: FBX2glTF (Command Line)

**Install:** https://github.com/facebookincubator/FBX2glTF

```bash
# Single file
FBX2glTF --input character.fbx --output character.glb

# Or use npx (no install needed)
npx FBX2glTF --input character.fbx --output character.glb

# Batch conversion (bash)
for f in *.fbx; do
  FBX2glTF --input "$f" --output "${f%.fbx}.glb"
done
```

### Method 3: Three.js fbx2gltf (Node.js)

```bash
# Install
npm install --save-dev fbx2gltf

# Single file
npx fbx2gltf -i character.fbx -o character.glb
```

```javascript
// convert.mjs
import { convertFBX } from 'fbx2gltf';
import { readFileSync, writeFileSync } from 'fs';

const fbxBuffer = readFileSync('character.fbx');
const glbBuffer = await convertFBX(fbxBuffer);
writeFileSync('character.glb', glbBuffer);
```

### Method 4: Online Converters

- **Aspose 3D:** https://products.aspose.app/3d/conversion/fbx-to-glb
- **Convertio:** https://convertio.co/fbx-glb/

> ⚠️ Online converters may not preserve all animation data. Use Blender for best results.

---

## 8. GLB Conversion Instructions

### Pre-Conversion Checklist

Before converting, verify your FBX files:

```
□ File opens correctly in Blender (or another 3D viewer)
□ Skeleton/armature is present (visible bone hierarchy)
□ Animations play correctly in the preview
□ Mesh is visible and textured
□ No error messages during import
```

### Post-Conversion Verification

After converting to GLB, verify the output:

```
□ File size is reasonable (typically 1-10 MB per animation)
□ GLB loads in Three.js without errors
□ Skeleton bones are preserved (65 Mixamo bones)
□ Animations play correctly when loaded
□ Mesh renders with correct materials
□ Scale is correct (model should be ~1.8 meters tall)
```

### Verification Script (Node.js)

```javascript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const loader = new GLTFLoader();

// Test loading the model
loader.load('assets/models/gas-mask/model.glb', (gltf) => {
    console.log('Model loaded successfully');
    console.log('Animations:', gltf.animations.length);
    console.log('Scene children:', gltf.scene.children.length);
    
    // Check skeleton
    gltf.scene.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh) {
            console.log('Skeleton bones:', child.skeleton.bones.length);
            console.log('Bone names:', child.skeleton.bones.map(b => b.name));
        }
    });
}, undefined, (error) => {
    console.error('Failed to load model:', error);
});
```

### Common Conversion Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| No animations in GLB | FBX had no animation data | Re-download from Mixamo with animation |
| Skeleton missing | Armature not exported | Ensure "Export Armature" is checked |
| Textures missing | Textures not embedded | Re-export with embedded textures |
| Wrong scale | Unit conversion issue | Apply 0.01 scale in Three.js (cm→m) |
| Model facing wrong way | Axis mismatch | Rotate 180° in Blender before export |

---

## 9. Loading in Three.js

### Basic Model Loading

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

loader.load(
  'assets/models/gas-mask/model.glb',
  (gltf) => {
    const model = gltf.scene;
    
    // Fix Mixamo scale (cm → m)
    model.scale.set(0.01, 0.01, 0.01);
    
    // Enable shadows
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    scene.add(model);
  },
  (progress) => {
    const pct = (progress.loaded / progress.total * 100).toFixed(1);
    console.log(`Loading: ${pct}%`);
  },
  (error) => {
    console.error('Error loading model:', error);
  }
);
```

### Loading Animations (Separate Files)

```typescript
async function loadAnimations(
  basePath: string,
  names: string[]
): Promise<Map<string, THREE.AnimationClip>> {
  const loader = new GLTFLoader();
  const animations = new Map<string, THREE.AnimationClip>();
  
  const promises = names.map(async (name) => {
    const url = `${basePath}/${name}.glb`;
    
    return new Promise<void>((resolve, reject) => {
      loader.load(url, (gltf) => {
        if (gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          clip.name = name;
          animations.set(name, clip);
        }
        resolve();
      }, undefined, reject);
    });
  });
  
  await Promise.allSettled(promises);
  return animations;
}

// Usage
const anims = await loadAnimations('assets/models/gas-mask', [
  'idle', 'walk', 'run', 'crouch_idle', 'crouch_walk',
  'rifle_idle', 'rifle_walk', 'rifle_shoot', 'death'
]);
```

### Using the MixamoLoader Utility

The project includes a `MixamoLoader` class (`src/utils/MixamoLoader.ts`) that handles:

- Loading models with correct scale
- Loading animations from separate GLB files
- Caching loaded assets
- Procedural animation fallback
- Mixamo bone name fixing

```typescript
import { MixamoLoader, CHARACTER_ANIMATIONS } from '../utils/MixamoLoader';

const loader = new MixamoLoader();

// Load complete character with all animations
const { model, animations, skeleton } = await loader.loadCharacter(
  'gas-mask',           // character name
  'assets/models/gas-mask',  // base path
  'model.glb',          // model file
  CHARACTER_ANIMATIONS  // animation definitions
);

scene.add(model);

// Create animation mixer
const mixer = new THREE.AnimationMixer(model);
const idleAction = mixer.clipAction(animations.get('idle'));
idleAction.play();

// Update in game loop
function animate() {
  const delta = clock.getDelta();
  mixer.update(delta);
  requestAnimationFrame(animate);
}
```

### Loading with Procedural Fallback

If Mixamo files aren't available yet, use procedural animations:

```typescript
const { model, animations } = await loader.loadCharacterWithProceduralFallback(
  'gas-mask',
  'assets/models/gas-mask'
);

// Procedural animations are generated automatically
// Replace with real Mixamo files when available
```

---

## 10. Troubleshooting Common Issues

### Model Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Model appears tiny | Mixamo exports in cm, Three.js uses meters | Apply `model.scale.set(0.01, 0.01, 0.01)` |
| Model faces wrong direction | Z-forward vs -Z-forward mismatch | Rotate: `model.rotation.y = Math.PI` |
| Model is invisible | Backface culling or wrong material | Check material side: `THREE.DoubleSide` |
| Model has no textures | Textures not embedded in GLB | Re-export from Blender with embedded textures |
| Model is black | No lights in scene | Add `THREE.AmbientLight` and `THREE.DirectionalLight` |

### Skeleton Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Bones missing | Armature not exported | Re-export FBX with armature included |
| Wrong bone names | Different Mixamo version | MixamoLoader strips `mixamorig:` prefix automatically |
| Animations don't match skeleton | Different character rigs | Use same character for all animations |
| Mesh deforms weirdly | Weight painting issues | Re-download from Mixamo (auto-rigged) |

### Animation Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Animations don't play | `gltf.animations.length === 0` | Verify FBX has animation data |
| Animation is jittery | Frame rate mismatch | Ensure 30fps export from Mixamo |
| Animation is too fast/slow | Time scale issue | Adjust `action.timeScale` |
| Animation loops when it shouldn't | Loop mode wrong | Set `action.loop = THREE.LoopOnce` |
| Animation snaps at loop point | Bad loop point | Use Mixamo's loop-friendly animations |
| Crossfade looks bad | Duration too short | Increase crossfade duration to 0.3+ seconds |

### Performance Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Slow loading | Large GLB files | Compress textures, reduce poly count |
| Low FPS with many characters | Too many draw calls | Use `THREE.InstancedMesh` |
| Memory leaks | Not disposing resources | Call `mixer.stopAllAction()` and dispose geometry |
| Stuttering during animation | GC pressure | Cache animations, reuse `AnimationAction` objects |

### Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome 90+ | ✅ Full support | Best performance |
| Firefox 90+ | ✅ Full support | Good performance |
| Safari 15+ | ✅ Full support | May need WebGL 2 prefix |
| Edge 90+ | ✅ Full support | Same as Chrome |
| Mobile Safari | ⚠️ Limited | Reduce poly count, lower resolution |
| Mobile Chrome | ⚠️ Limited | Test on target devices |

---

## 11. Performance Optimization

### Asset Optimization

```typescript
// 1. Cache animations (load once, reuse everywhere)
const animationCache = new Map<string, THREE.AnimationClip>();

// 2. Reuse skeleton (all Mixamo characters share skeleton)
// No need to reload skeleton for each character instance

// 3. Compress textures (use KTX2/Basis format)
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// 4. Use LOD (Level of Detail) for distant characters
const lod = new THREE.LOD();
lod.addLevel(highDetailModel, 0);    // Close: full detail
lod.addLevel(medDetailModel, 20);   // Medium: reduced
lod.addLevel(lowDetailModel, 50);   // Far: minimal
```

### Runtime Optimization

```typescript
// 1. Animation compression (trim unused keyframes)
import { AnimationUtils } from 'three';
const trimmedClip = AnimationUtils.subclip(originalClip, 'idle', 0, 60);

// 2. Animation resampling (reduce keyframe count)
// Done automatically by Three.js when loading

// 3. Frustum culling (skip invisible characters)
model.frustumCulled = true; // Default: true

// 4. Shared materials
const sharedMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
// Apply to all character meshes of same type
```

### Memory Management

```typescript
// Dispose when done
function disposeCharacter(model: THREE.Group, mixer: THREE.AnimationMixer) {
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
  });
}
```

---

## 12. Quick Reference

### Download Checklist

```
Phase 1: Character Model
  □ Go to Mixamo.com
  □ Select "Gas Mask" character
  □ Download "Standing Idle" WITH SKIN (FBX Binary)
  □ Save as gas-mask-with-idle.fbx

Phase 2: Animations (Without Skin)
  □ Download "Walking" → walk.fbx
  □ Download "Running" → run.fbx
  □ Download "Crouching Idle" → crouch_idle.fbx
  □ Download "Crouching Walk" → crouch_walk.fbx
  □ Download "Prone Idle" → prone_idle.fbx
  □ Download "Prone Crawl" → prone_crawl.fbx
  □ Download "Rifle Aiming" → rifle_idle.fbx
  □ Download "Rifle Walking" → rifle_walk.fbx
  □ Download "Rifle Running" → rifle_run.fbx
  □ Download "Rifle Shooting" → rifle_shoot.fbx
  □ Download "Rifle Reloading" → rifle_reload.fbx
  □ Download "Death Fall" → death.fbx
  □ Download "Hit Front" → hit_front.fbx
  □ Download "Hit Back" → hit_back.fbx
  □ Download "Smoking" → smoking.fbx
  □ Download "Talking" → talking.fbx
  □ Download "Sitting" → sitting.fbx
  □ Download "Using Radio" → radio.fbx

Phase 3: Convert
  □ Convert all FBX to GLB using Blender
  □ Place in public/assets/models/gas-mask/
  □ Repeat for SWAT character (public/assets/models/swat-guy/)

Phase 4: Verify
  □ Test loading in browser
  □ Check all animations play
  □ Verify scale is correct (1.8m tall)
  □ Test on mobile devices
```

### File Naming Quick Reference

| Mixamo Name | Project File |
|-------------|-------------|
| Standing Idle | `idle.glb` |
| Walking | `walk.glb` |
| Running | `run.glb` |
| Crouching Idle | `crouch_idle.glb` |
| Crouching Walk | `crouch_walk.glb` |
| Prone Idle | `prone_idle.glb` |
| Prone Crawl | `prone_crawl.glb` |
| Rifle Aiming | `rifle_idle.glb` |
| Rifle Walking | `rifle_walk.glb` |
| Rifle Running | `rifle_run.glb` |
| Rifle Shooting | `rifle_shoot.glb` |
| Rifle Reloading | `rifle_reload.glb` |
| Death Fall | `death.glb` |
| Hit Front | `hit_front.glb` |
| Hit Back | `hit_back.glb` |
| Smoking | `smoking.glb` |
| Talking | `talking.glb` |
| Sitting | `sitting.glb` |
| Using Radio | `radio.glb` |

### Scale Reference

```
Mixamo export: 180 cm = 180 units
Three.js:      1.8 m  = 1.8 units

Conversion: model.scale.set(0.01, 0.01, 0.01)
Or:         MixamoLoader.SCALE_FACTOR = 0.01
```

### Skeleton Bone Count

```
Standard Mixamo skeleton: 65 bones
Core bones: Hips, Spine, Spine1, Spine2, Neck, Head
Arms: LeftArm, LeftForeArm, LeftHand (×2)
Legs: LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase (×2)
Fingers: 15 per hand (optional)
```

---

## See Also

- [TEAMMATE_AI.md](./TEAMMATE_AI.md) — Teammate AI behavior system
- `src/utils/MixamoLoader.ts` — Mixamo loading utility
- `src/config/modelConfig.ts` — Character model configurations
- `src/config/AnimationConfig.ts` — Animation state definitions
- `src/systems/AnimationStateMachine.ts` — Animation state machine
