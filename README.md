# CALL OF DEITY: PROTOCOL 313

> *"When negotiations fail, the Deity calls."*

A tactical stealth FPS web game — parodi dari Call of Duty yang membalikkan narasi konflik global.

## 🎮 Features

- **Character Switching**: Play as Wolf (Operator) and Falcon (Overwatch)
- **Stealth System**: Detection meter, silent kills, tactical gameplay
- **Drone Swarm**: Summon drones and fire support
- **Low-Poly Aesthetic**: Optimized for web and mobile
- **6 Mission Campaign**: 3 free + 3 premium missions

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## 📁 Project Structure

```
call-of-deity/
├── public/
│   └── favicon.svg
├── src/
│   ├── engine/
│   │   └── GameEngine.ts
│   ├── entities/
│   │   └── Player.ts
│   ├── systems/
│   │   ├── EnemyManager.ts
│   │   ├── WeaponSystem.ts
│   │   ├── StealthSystem.ts
│   │   ├── SummonSystem.ts
│   │   └── MissionManager.ts
│   ├── ui/
│   │   └── UIManager.ts
│   ├── utils/
│   │   ├── InputManager.ts
│   │   ├── AudioManager.ts
│   │   └── AssetLoader.ts
│   ├── types/
│   │   └── index.ts
│   └── main.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🎯 Controls

### Desktop
| Action | Key |
|--------|-----|
| Move | WASD |
| Look | Mouse |
| Sprint | Shift |
| Crouch | C / Ctrl |
| Prone | X |
| ADS | Right Click |
| Fire | Left Click |
| Switch Character | Q |
| Melee | F |
| Reload | R |

### Mobile
- Virtual joystick for movement
- Touch buttons for actions

## 🎨 Art Style

Low-poly stylized graphics optimized for web performance:
- 60 FPS on desktop
- 30+ FPS on mobile
- < 15MB initial download

## 📝 Lore

In an alternate timeline, the Federation of Fars (Farsia) fights back against the Zion State after they violated peace negotiations and bombed a school. Lead Squad 313 as Wolf and Falcon to deliver justice.

**Disclaimer**: This is a work of fiction. All names, characters, and events are entirely fictional.

## 🛠️ Tech Stack

- Three.js (WebGL)
- TypeScript
- Vite
- Zustand (State Management)

## 📄 License

MIT
