# Mixamo Integration Guide — Call of Deity: Protocol 313

## Table of Contents

1. [Free Humanoid Models](#1-free-humanoid-models)
2. [Required Animations](#2-required-animations)
3. [Downloading from Mixamo](#3-downloading-from-mixamo)
4. [FBX to GLB Conversion](#4-fbx-to-glb-conversion)
5. [Loading in Three.js](#5-loading-in-threejs)
6. [Playing Animations with AnimationMixer](#6-playing-animations-with-animationmixer)
7. [Animation State Machine](#7-animation-state-machine)
8. [Asset Pipeline Summary](#8-asset-pipeline-summary)

---

## 1. Free Humanoid Models

### Requirements
- **Skeleton**: Humanoid (65-bone Mixamo skeleton)
- **Pose**: T-Pose or A-Pose (Mixamo auto-rigging works with both)
- **Format**: FBX preferred, GLB/GLTF acceptable
- **License**: Free for non-commercial and commercial use under [Mixamo Terms](https://www.mixamo.com)

### Recommended Sources

#### A) Mixamo Character Library (FREE — Best Option)
- **URL**: https://www.mixamo.com/#/?page=1&type=Character
- **Why**: Pre-rigged for Mixamo skeleton, zero setup needed
- **Top picks for military/tactical game**:
  | Character | Style | Notes |
  |-----------|-------|-------|
  | **Y Bot** | Default mannequin | Clean mesh, great for prototyping |
  | **X Bot** | Female mannequin | Clean mesh, alternate gender |
  | **Soldier** | Military gear | Tactical outfit, ready to go |
  | **Riot Police** | SWAT/tactical | Armored, fits combat theme |
  | **Police** | Law enforcement | Urban tactical look |
  | **Catch** | Casual male | Good base for customization |
  | **Michelle** | Female civilian | For NPC/non-combat characters |

#### B) Sketchfab (FREE — CC License Models)
- **URL**: https://sketchfab.com/search?type=models&downloadable=true&sort_by=-likeCount
- **Search terms**: "humanoid", "character", "soldier", "military", "rigged"
- **Filter**: "Downloadable" → "Animated" → "Rigged"
- **License**: Check CC-BY or CC0 for commercial use
- **Note**: Must re-upload to Mixamo for rigging if not already Mixamo-compatible

#### C) ReadyPlayerMe
- **URL**: https://readyplayer.me/
- **Why**: Generate custom avatars, export as GLB
- **Note**: Requires Mixamo re-rigging after export
- **Good for**: Unique character appearances, diverse NPCs

#### D) Other Free Sources
| Source | URL | Notes |
|--------|-----|-------|
| **CGTrader Free** | https://www.cgtrader.com/free-3d-models | Filter by "rigged" + "humanoid" |
| **Turbosquid Free** | https://www.turbosquid.com/Search/3D-Models/free | Filter "animated" + "FBX" |
| **Quaternius** | https://quaternius.com | CC0 low-poly characters |
| **Kenney Assets** | https://kenney.nl/assets | CC0 game-ready characters |
| **Mixamo Auto-Rigger** | https://www.mixamo.com/#/upload | Upload your own character mesh |

### Model Selection Criteria for This Game
```
MUST HAVE:
  ✓ Humanoid skeleton (head, spine, 2 arms, 2 legs, fingers optional)
  ✓ T-pose or A-pose (for Mixamo rigging)
  ✓ Single mesh or reasonable poly count (<15k triangles ideal)
  ✓ FBX or GLB format

NICE TO HAVE:
  ✓ Military/tactical appearance
  ✓ Gloves or hand detail (visible in first-person)
  ✓ Helmet or headgear
  ✓ Boots
```

---

## 2. Required Animations

### Core Locomotion Set

| State | Mixamo Search Terms | File Name | Priority |
|-------|-------------------|-----------|----------|
| **Idle** | "Standing Idle", "Breathing Idle" | `idle.fbx` | ★★★ |
| **Walk** | "Walking", "Walk Forward" | `walk.fbx` | ★★★ |
| **Run** | "Running", "Sprint Forward" | `run.fbx` | ★★★ |
| **Crouch Idle** | "Crouching Idle" | `crouch_idle.fbx` | ★★☆ |
| **Crouch Walk** | "Crouch Walk", "Crouching Walk" | `crouch_walk.fbx` | ★★☆ |
| **Prone Idle** | "Prone Idle", "Lying Down Idle" | `prone_idle.fbx` | ★★☆ |
| **Prone Crawl** | "Prone Crawl" | `prone_crawl.fbx` | ★☆☆ |

### Combat Animations

| State | Mixamo Search Terms | File Name | Priority |
|-------|-------------------|-----------|----------|
| **Rifle Aim (Idle)** | "Rifle Aiming Idle" | `rifle_idle.fbx` | ★★★ |
| **Rifle Walk** | "Rifle Walk Forward" | `rifle_walk.fbx` | ★★☆ |
| **Rifle Run** | "Rifle Run Forward" | `rifle_run.fbx` | ★★☆ |
| **Shoot** | "Rifle Shooting" | `rifle_shoot.fbx` | ★★☆ |
| **Reload** | "Rifle Reload" | `rifle_reload.fbx` | ★★☆ |
| **Throw Grenade** | "Grenade Throw" | `grenade_throw.fbx` | ★☆☆ |

### Social / Ambient Animations

| State | Mixamo Search Terms | File Name | Priority |
|-------|-------------------|-----------|----------|
| **Smoking** | "Smoking", "Smoke Cigarette" | `smoking.fbx` | ★☆☆ |
| **Talking** | "Talking", "Conversation" | `talking.fbx` | ★☆☆ |
| **Sitting** | "Sitting Idle" | `sitting.fbx` | ★☆☆ |
| **Radio** | "Use Radio" | `radio.fbx` | ★☆☆ |

### Death / Hit Reactions

| State | Mixamo Search Terms | File Name | Priority |
|-------|-------------------|-----------|----------|
| **Death** | "Dying", "Death Fall Forward" | `death.fbx` | ★★★ |
| **Hit Front** | "Hit Reaction Front" | `hit_front.fbx` | ★★☆ |
| **Hit Back** | "Hit Reaction Back" | `hit_back.fbx` | ★☆☆ |
| **Knockdown** | "Knockdown" | `knockdown.fbx` | ★☆☆ |

---

## 3. Downloading from Mixamo

### Step-by-Step Process

#### Step 1: Create Mixamo Account
1. Go to https://www.mixamo.com
2. Sign in with Adobe account (free)
3. No credit card required for free tier

#### Step 2: Select a Character
1. Click **Characters** tab
2. Browse the library or upload your own (click **UPLOAD CHARACTER**)
3. Click a character to select it — it appears in the preview pane

#### Step 3: Download Animations (One at a Time)
1. Click **Animations** tab
2. Search for the animation name (e.g., "Standing Idle")
3. Click an animation to preview it on your character
4. **IMPORTANT SETTINGS** (left sidebar):
   - **Format**: `FBX Binary` (recommended) or `FBX for Unity`
   - **Skin**: `With Skin` (includes the mesh) or `Without Skin` (animation only)
   - **Frames per Second**: `30` (default is fine)
   - **Keyframe Reduction**: `none`
5. Click **DOWNLOAD**

#### Step 4: Download Settings Per Animation Type

| Animation | Skin | Format | Notes |
|-----------|------|--------|-------|
| **First use** (idle) | With Skin | FBX Binary | Gets you the rigged mesh |
| **All others** | Without Skin | FBX Binary | Smaller file, shares skeleton |
| **Character mesh** | With Skin | FBX Binary | Standalone mesh download |

#### Step 5: Batch Download (Workaround)
Mixamo doesn't have a native batch download. Workarounds:
1. **Manual**: Queue animations in browser, download one by one
2. **mixamo-dl** (Python): https://github.com/topics/mixamo-downloader
   ```bash
   pip install mixamo-dl
   mixamo-dl --char "Y Bot" --anims "Standing Idle,Walking,Running"
   ```
3. **Browser Extension**: "Mixamo Batch Download" extensions exist for Chrome

### Recommended Download Order
```
1. Download CHARACTER with "Standing Idle" animation (gets mesh + first anim)
2. Download remaining animations WITHOUT skin (skeleton-only)
3. All files use the same skeleton — animations are interchangeable
```

---

## 4. FBX to GLB Conversion

### Why Convert?
- Three.js GLTFLoader is faster and more reliable than FBXLoader
- GLB is a single binary file (no texture dependencies)
- Better browser support, smaller file sizes

### Method 1: Blender (Recommended)

```bash
# Install Blender (free): https://www.blender.org/download/

# Batch convert FBX to GLB via command line:
blender --background --python-expr "
import bpy, sys, os

input_dir = sys.argv[sys.argv.index('--') + 1]
output_dir = sys.argv[sys.argv.index('--') + 2]

for f in os.listdir(input_dir):
    if f.endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=os.path.join(input_dir, f))
        out_name = os.path.splitext(f)[0] + '.glb'
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(output_dir, out_name),
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

### Method 2: FBX2glTF (Command Line)

```bash
# Install: https://github.com/facebookincubator/FBX2glTF
# Or use npx:
npx FBX2glTF --input character.fbx --output character.glb

# Batch conversion (bash):
for f in *.fbx; do
  npx FBX2glTF --input "$f" --output "${f%.fbx}.glb"
done
```

### Method 3: Three.js fbx2gltf (Node.js)

```bash
npm install --save-dev fbx2gltf

# Single file:
npx fbx2gltf -i character.fbx -o character.glb

# Or use programmatically:
```

```javascript
// convert.mjs
import { convertFBX } from 'fbx2gltf';
import { readFileSync, writeFileSync } from 'fs';

const fbxBuffer = readFileSync('character.fbx');
const glbBuffer = await convertFBX(fbxBuffer);
writeFileSync('character.glb', glbBuffer);
```

### Method 4: Online Converter
- **FBX to GLB**: https://products.aspose.app/3d/conversion/fbx-to-glb
- **Automated-3D-pipeline**: https://github.com/nickyvanurk/automated-3d-pipeline

### Conversion Checklist
```
□ Skeleton bones preserved (65 Mixamo bones)
□ Animations included (if FBX has them)
□ Textures embedded (GLB) or referenced (GLTF)
□ Y-up coordinate system (Three.js standard)
□ Scale factor: Mixamo uses cm, Three.js uses meters → scale 0.01
```

### Important: Mixamo Scale Factor
Mixamo exports in **centimeters**. Three.js uses **meters**.
When loading, apply scale: `model.scale.set(0.01, 0.01, 0.01)` or set `loader.setResourcePath()` accordingly.

---

## 5. Loading in Three.js

### Basic GLB Loading

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Load character with animation
loader.load(
  'assets/characters/wolf_idle.glb',
  (gltf) => {
    const model = gltf.scene;

    // Fix Mixamo scale (cm → m)
    model.scale.set(0.01, 0.01, 0.01);

    // Enable shadows on all meshes
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(model);

    // Access animations
    const mixer = new THREE.AnimationMixer(model);
    const clip = gltf.animations[0]; // First animation clip
    const action = mixer.clipAction(clip);
    action.play();
  },
  (progress) => {
    console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
  },
  (error) => {
    console.error('Error loading model:', error);
  }
);
```

### Loading Multiple Animations (Separate Files)

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationClip } from 'three';

interface LoadedAnimations {
  idle: AnimationClip;
  walk: AnimationClip;
  run: AnimationClip;
  crouchIdle: AnimationClip;
  crouchWalk: AnimationClip;
  proneIdle: AnimationClip;
  death: AnimationClip;
  rifleIdle: AnimationClip;
}

class MixamoLoader {
  private loader = new GLTFLoader();
  private cache = new Map<string, AnimationClip>();

  async loadAnimation(url: string, name: string): Promise<AnimationClip> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    return new Promise((resolve, reject) => {
      this.loader.load(url, (gltf) => {
        if (gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          clip.name = name;
          this.cache.set(name, clip);
          resolve(clip);
        } else {
          reject(new Error(`No animations in ${url}`));
        }
      }, undefined, reject);
    });
  }

  async loadAllAnimations(basePath: string): Promise<LoadedAnimations> {
    const [idle, walk, run, crouchIdle, crouchWalk, proneIdle, death, rifleIdle] =
      await Promise.all([
        this.loadAnimation(`${basePath}/idle.glb`, 'idle'),
        this.loadAnimation(`${basePath}/walk.glb`, 'walk'),
        this.loadAnimation(`${basePath}/run.glb`, 'run'),
        this.loadAnimation(`${basePath}/crouch_idle.glb`, 'crouchIdle'),
        this.loadAnimation(`${basePath}/crouch_walk.glb`, 'crouchWalk'),
        this.loadAnimation(`${basePath}/prone_idle.glb`, 'proneIdle'),
        this.loadAnimation(`${basePath}/death.glb`, 'death'),
        this.loadAnimation(`${basePath}/rifle_idle.glb`, 'rifleIdle'),
      ]);

    return { idle, walk, run, crouchIdle, crouchWalk, proneIdle, death, rifleIdle };
  }
}
```

### Loading Character Mesh (Without Animations)

```typescript
// Load the character model separately from animations
async function loadCharacterModel(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      model.scale.set(0.01, 0.01, 0.01);

      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      resolve(model);
    }, undefined, reject);
  });
}
```

---

## 6. Playing Animations with AnimationMixer

### AnimationMixer Basics

```typescript
import * as THREE from 'three';

// Create mixer (one per model)
const mixer = new THREE.AnimationMixer(characterModel);

// Load and play an animation
loader.load('idle.glb', (gltf) => {
  const clip = gltf.animations[0];
  const action = mixer.clipAction(clip);

  action.play();
});

// Update mixer every frame (in your game loop)
function animate() {
  const delta = clock.getDelta();
  mixer.update(delta);
  requestAnimationFrame(animate);
}
```

### Crossfading Between Animations

```typescript
// Create actions for each animation
const idleAction = mixer.clipAction(idleClip);
const walkAction = mixer.clipAction(walkClip);
const runAction = mixer.clipAction(runClip);

// Configure looping
idleAction.loop = THREE.LoopRepeat;
walkAction.loop = THREE.LoopRepeat;
runAction.loop = THREE.LoopRepeat;

// Set timescale (play speed)
walkAction.timeScale = 1.0;
runAction.timeScale = 1.2;

// Crossfade: idle → walk
function transitionToWalk() {
  idleAction.fadeOut(0.3);      // Fade out idle over 0.3s
  walkAction.reset()
    .fadeIn(0.3)                // Fade in walk over 0.3s
    .play();
}

// Crossfade: walk → run
function transitionToRun() {
  walkAction.fadeOut(0.2);
  runAction.reset()
    .fadeIn(0.2)
    .play();
}

// Crossfade: walk → idle (stop walking)
function transitionToIdle() {
  walkAction.fadeOut(0.4);
  idleAction.reset()
    .fadeIn(0.4)
    .play();
}
```

### Weight-Based Blending (Simultaneous Animations)

```typescript
// Blend idle + upper body rifle aim
const idleAction = mixer.clipAction(idleClip);
const rifleAimAction = mixer.clipAction(rifleAimClip);

// Use AnimationActionMixer for bone-level blending
// Or set weights for additive blending:
idleAction.weight = 0.7;
rifleAimAction.weight = 0.3;

// With Three.js you can use `.setEffectiveWeight()`
idleAction.setEffectiveWeight(0.7).play();
rifleAimAction.setEffectiveWeight(0.3).play();
```

### Animation Events (for Footsteps, etc.)

```typescript
const walkAction = mixer.clipAction(walkClip);

// Listen for animation finished
mixer.addEventListener('finished', (e) => {
  if (e.action === walkAction) {
    console.log('Walk cycle completed');
  }
});

// Use custom tracked events with time-based checking
let lastFootstepPhase = 0;
mixer.addEventListener('loop', (e) => {
  // footstep sync with walk cycle
});
```

### Handling Multiple Characters

```typescript
// Each character needs its own mixer
class Character {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;

  constructor(model: THREE.Group, animations: AnimationClip[]) {
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = new Map();

    for (const clip of animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
  }

  update(delta: number) {
    this.mixer.update(delta);
  }

  play(name: string) {
    const action = this.actions.get(name);
    if (action) action.play();
  }
}
```

---

## 7. Animation State Machine

The game uses an `AnimationStateMachine` that manages animation states and transitions.
See `src/systems/AnimationStateMachine.ts` for the full implementation.

### State Diagram
```
                    ┌─────────┐
            ┌──────│  IDLE   │──────┐
            │      └────┬────┘      │
            │           │           │
        walk/run    crouch       prone
            │           │           │
            ▼           ▼           ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │   WALK   │ │ CROUCH   │ │  PRONE   │
     └────┬─────┘ │  WALK    │ └──────────┘
          │       └──────────┘
       sprint
          │
          ▼
     ┌──────────┐
     │   RUN    │
     └──────────┘
```

### Usage

```typescript
const stateMachine = new AnimationStateMachine(mixer);

// Register animations
stateMachine.addAnimation('idle', idleClip);
stateMachine.addAnimation('walk', walkClip);
stateMachine.addAnimation('run', runClip);

// Set initial state
stateMachine.setState('idle');

// Update each frame
stateMachine.update(delta);

// Transition based on player input
if (isMoving && isSprinting) {
  stateMachine.setState('run');
} else if (isMoving) {
  stateMachine.setState('walk');
} else {
  stateMachine.setState('idle');
}
```

---

## 8. Asset Pipeline Summary

### Directory Structure
```
assets/
  characters/
    wolf/
      wolf.glb           ← Character mesh (with skin)
      wolf_idle.glb      ← Idle animation
      wolf_walk.glb      ← Walk animation
      wolf_run.glb       ← Run animation
      wolf_crouch_idle.glb
      wolf_crouch_walk.glb
      wolf_prone_idle.glb
      wolf_death.glb
      wolf_rifle_idle.glb
    falcon/
      falcon.glb
      falcon_idle.glb
      falcon_walk.glb
      ...
```

### Quick Start Checklist
```
1. ☐ Create Mixamo account
2. ☐ Download "Y Bot" or "Soldier" with "Standing Idle" (With Skin, FBX)
3. ☐ Download remaining animations (Without Skin, FBX):
      - Walking, Running, Crouching Idle, Crouch Walk
      - Prone Idle, Rifle Aiming Idle, Dying
4. ☐ Convert all FBX to GLB using Blender or FBX2glTF
5. ☐ Place GLB files in assets/characters/wolf/
6. ☐ Add MixamoLoader to src/utils/
7. ☐ Add AnimationStateMachine to src/systems/
8. ☐ Update Player.ts to use real models instead of box placeholders
9. ☐ Test animations in browser
10. ☐ Tune crossfade durations for smooth transitions
```

### Performance Tips
- **Cache animations**: Load once, reuse across all instances
- **Reuse skeleton**: All Mixamo characters with same skeleton share animations
- **Compress textures**: Use KTX2/Basis for GPU-compressed textures
- **LOD**: Use simplified meshes for distant characters
- **Instancing**: For many identical characters, use THREE.InstancedMesh
- **Animation compression**: Three.js supports `AnimationUtils.subclip()` to trim unused keyframes

### Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| Model appears tiny | Apply `model.scale.set(0.01, 0.01, 0.01)` for Mixamo cm→m |
| Model faces wrong direction | Rotate model: `model.rotation.y = Math.PI` |
| Animations don't play | Check `gltf.animations.length > 0` |
| Bones missing | Ensure FBX was exported with Armature |
| Animation jittery | Check frame rate matches (30fps default) |
| Textures missing | Re-export with embedded textures |
| Wrong bone mapping | Use Mixamo's "With Skin" option for first download |
