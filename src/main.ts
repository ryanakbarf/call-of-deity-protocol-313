/**
 * CALL OF DEITY: PROTOCOL 313
 * Main Entry Point
 * 
 * A tactical stealth FPS web game — parodi dari Call of Duty
 * yang membalikkan narasi konflik global.
 */

import { GameEngine } from './engine/GameEngine';
import { AssetLoader } from './utils/AssetLoader';
import { AudioManager } from './utils/AudioManager';
import { MobileControls } from './ui/MobileControls';

// ============================================================
// GAME CONFIGURATION
// ============================================================

const CONFIG = {
  // Display
  WIDTH: window.innerWidth,
  HEIGHT: window.innerHeight,
  PIXEL_RATIO: Math.min(window.devicePixelRatio, 2),
  
  // Performance
  MAX_FPS: 60,
  SHADOW_ENABLED: true,
  SHADOW_MAP_SIZE: 1024,
  
  // Game Settings
  DIFFICULTY: 'normal' as 'easy' | 'normal' | 'hard',
  MUSIC_VOLUME: 0.5,
  SFX_VOLUME: 0.7,
  
  // Player
  PLAYER_HEIGHT: 1.7,
  PLAYER_SPEED: 5,
  PLAYER_SPRINT_SPEED: 8,
  PLAYER_CROUCH_SPEED: 2.5,
  PLAYER_PRONE_SPEED: 1.5,
  
  // Combat
  HEADSHOT_MULTIPLIER: 2.5,
  STEALTH_KILL_RANGE: 2.5,
  SUPPRESSOR_NOISE_RADIUS: 10,
  UNSUPPRESSED_NOISE_RADIUS: 50,
};

// ============================================================
// DOM ELEMENTS
// ============================================================

const loadingScreen = document.getElementById('loading-screen')!;
const loadingBar = document.getElementById('loading-bar')!;
const loadingText = document.querySelector('.loading-text')!;
const mainMenu = document.getElementById('main-menu')!;
const hud = document.getElementById('hud')!;
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const pauseMenu = document.getElementById('pause-menu')!;
const mobileControlsEl = document.getElementById('mobile-controls')!;

// Menu buttons
const btnCampaign = document.getElementById('btn-campaign')!;
const btnMultiplayer = document.getElementById('btn-multiplayer')!;
const btnSettings = document.getElementById('btn-settings')!;
const btnResume = document.getElementById('btn-resume')!;
const btnRestart = document.getElementById('btn-restart')!;
const btnQuit = document.getElementById('btn-quit')!;

// ============================================================
// GAME STATE
// ============================================================

type GameState = 'loading' | 'menu' | 'mission-select' | 'playing' | 'paused';

let currentState: GameState = 'loading';
let gameEngine: GameEngine | null = null;
let mobileControls: MobileControls | null = null;
let selectedMissionId: number = 1;

// ============================================================
// INITIALIZATION
// ============================================================

async function init(): Promise<void> {
  // Simulate loading progress first (fast)
  await simulateLoading();
  
  try {
    // Setup event listeners
    setupEventListeners();
    
    // Check for mobile
    checkMobile();
  } catch (error) {
    console.error('[COD:P313] Init error:', error);
  }
  
  // Always show menu
  showMenu();
}

// ============================================================
// LOADING SIMULATION
// ============================================================

async function simulateLoading(): Promise<void> {
  const loadingMessages = [
    'ESTABLISHING COMMS...',
    'DECRYPTING SATELLITE UPLINK...',
    'CALIBRATING DRONE SWARM...',
    'SYNCING SQUAD 313...',
    'LOADING COMBAT PROTOCOLS...',
    'DEPLOYING TO SECTOR 313...',
    'ACTUALIZING THREAT MATRIX...',
    'READY FOR DEPLOYMENT',
  ];
  
  for (let i = 0; i <= 100; i += 4) {
    loadingBar.style.width = `${i}%`;
    
    if (i % 12 === 0) {
      const msgIndex = Math.min(Math.floor(i / 12), loadingMessages.length - 1);
      loadingText.textContent = loadingMessages[msgIndex];
    }
    
    await delay(15);
  }
  
  loadingText.textContent = loadingMessages[loadingMessages.length - 1];
  await delay(300);
}

// ============================================================
// UI TRANSITIONS
// ============================================================

function showMenu(): void {
  currentState = 'menu';
  
  // Force hide loading screen immediately
  loadingScreen.style.opacity = '0';
  loadingScreen.style.pointerEvents = 'none';
  loadingScreen.style.visibility = 'hidden';
  loadingScreen.style.zIndex = '-1';
  
  // Hide mission selection screen if open
  hideMissionSelect();
  
  mainMenu.style.display = 'flex';
  hud.style.display = 'none';
  pauseMenu.style.display = 'none';
  canvas.style.display = 'none';
  if (mobileControls) {
    mobileControls.disable();
  }
  mobileControlsEl.style.display = 'none';
}

// ============================================================
// MISSION SELECTION SCREEN
// ============================================================

/**
 * Mission data for the selection screen.
 * Status is computed from localStorage progress.
 */
interface MissionSelectEntry {
  id: number;
  title: string;
  subtitle: string;
  setting: string;
  isPremium: boolean;
  isCompleted: boolean;
  isUnlocked: boolean;
}

function getMissionEntries(): MissionSelectEntry[] {
  // Load saved completion state from localStorage
  let completedIds: number[] = [];
  try {
    const raw = localStorage.getItem('cod313_mission_progress');
    if (raw) {
      const data = JSON.parse(raw);
      completedIds = data.completedMissions || [];
    }
  } catch { /* ignore */ }

  const missions: { id: number; title: string; subtitle: string; setting: string; isPremium: boolean }[] = [
    { id: 1, title: 'Desert Dawn', subtitle: 'Operation: Border Sabotage', setting: 'Sector 313 — Zion Border Wall, 04:45 AM', isPremium: false },
    { id: 2, title: 'Iron Rain', subtitle: 'Urban Warfare', setting: 'Eastern district — border town weapons cache, pre-dawn', isPremium: false },
    { id: 3, title: 'The Nest', subtitle: 'Elimination', setting: 'Underground bunker complex — enemy command nexus', isPremium: false },
    { id: 4, title: 'Silent Thunder', subtitle: 'Airbase Sabotage', setting: 'Zion Air Force Base', isPremium: true },
    { id: 5, title: 'The Command Center', subtitle: 'Cyber Warfare', setting: 'Celestial Shield Headquarters', isPremium: true },
    { id: 6, title: 'Justice Protocol', subtitle: 'The Finale', setting: 'The Ivory Tower — Colossus Command', isPremium: true },
  ];

  return missions.map(m => ({
    ...m,
    isCompleted: completedIds.includes(m.id),
    isUnlocked: m.id === 1 || completedIds.includes(m.id - 1),
  }));
}

function showMissionSelect(): void {
  currentState = 'mission-select';
  mainMenu.style.display = 'none';

  // Remove any existing mission select overlay
  hideMissionSelect();

  const entries = getMissionEntries();
  const freeMissions = entries.filter(m => !m.isPremium);
  const premiumMissions = entries.filter(m => m.isPremium);

  const overlay = document.createElement('div');
  overlay.id = 'mission-select-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    padding-top: 4vh;
    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
    z-index: 1500;
    overflow-y: auto;
    animation: fadeIn 0.3s ease-in;
  `;

  // ── Title ──
  overlay.innerHTML = `
    <div style="
      font-size: 36px; color: #ffd700; font-weight: 900;
      text-shadow: 0 0 20px #ffd700;
      letter-spacing: 0.15em; margin-bottom: 6px;
      font-family: 'Courier New', monospace;
    ">SELECT MISSION</div>
    <div style="
      font-size: 14px; color: #888; margin-bottom: 24px;
      letter-spacing: 0.2em; text-transform: uppercase;
    ">Protocol 313 — Campaign Operations</div>
  `;

  // ── Free Missions Section ──
  const freeSection = document.createElement('div');
  freeSection.style.cssText = `
    width: 90%; max-width: 700px; margin-bottom: 20px;
  `;
  freeSection.innerHTML = `
    <div style="
      font-size: 13px; color: #ffd700; letter-spacing: 0.3em;
      text-transform: uppercase; margin-bottom: 12px;
      border-bottom: 1px solid rgba(255,215,0,0.2); padding-bottom: 6px;
    ">Operations</div>
  `;

  for (const entry of freeMissions) {
    freeSection.appendChild(createMissionCard(entry));
  }
  overlay.appendChild(freeSection);

  // ── Premium Missions Section ──
  const premSection = document.createElement('div');
  premSection.style.cssText = `
    width: 90%; max-width: 700px; margin-bottom: 24px;
  `;
  premSection.innerHTML = `
    <div style="
      font-size: 13px; color: #aaa; letter-spacing: 0.3em;
      text-transform: uppercase; margin-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;
    ">Premium Operations <span style="color:#f39c12;">(Coming Soon)</span></div>
  `;

  for (const entry of premiumMissions) {
    premSection.appendChild(createMissionCard(entry));
  }
  overlay.appendChild(premSection);

  // ── Back Button ──
  const backBtn = document.createElement('button');
  backBtn.textContent = '← BACK TO MENU';
  backBtn.style.cssText = `
    margin-top: 10px; margin-bottom: 30px;
    padding: 12px 36px;
    background: transparent; border: 1px solid #555;
    color: #aaa; font-size: 14px; font-weight: 600;
    letter-spacing: 0.15em; cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'Courier New', monospace;
  `;
  backBtn.addEventListener('mouseenter', () => {
    backBtn.style.borderColor = '#ffd700';
    backBtn.style.color = '#ffd700';
  });
  backBtn.addEventListener('mouseleave', () => {
    backBtn.style.borderColor = '#555';
    backBtn.style.color = '#aaa';
  });
  backBtn.addEventListener('click', () => {
    hideMissionSelect();
    showMenu();
  });
  overlay.appendChild(backBtn);

  document.body.appendChild(overlay);
}

function createMissionCard(entry: MissionSelectEntry): HTMLElement {
  const card = document.createElement('div');
  const isLocked = !entry.isUnlocked;
  const isCompleted = entry.isCompleted;

  card.style.cssText = `
    display: flex; align-items: center; gap: 16px;
    padding: 14px 20px;
    margin-bottom: 8px;
    border: 1px solid ${isLocked ? 'rgba(255,255,255,0.08)' : isCompleted ? 'rgba(0,255,68,0.3)' : 'rgba(255,215,0,0.25)'};
    background: ${isLocked ? 'rgba(255,255,255,0.02)' : isCompleted ? 'rgba(0,255,68,0.05)' : 'rgba(255,215,0,0.05)'};
    border-radius: 6px;
    cursor: ${isLocked ? 'not-allowed' : 'pointer'};
    opacity: ${isLocked ? '0.45' : '1'};
    transition: all 0.2s ease;
    position: relative;
  `;

  if (isLocked) {
    card.style.cursor = 'not-allowed';
  }

  // Mission number badge
  const badge = document.createElement('div');
  badge.style.cssText = `
    width: 40px; height: 40px; min-width: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    font-size: 18px; font-weight: 900;
    background: ${isLocked ? '#333' : isCompleted ? 'rgba(0,255,68,0.15)' : 'rgba(255,215,0,0.15)'};
    color: ${isLocked ? '#666' : isCompleted ? '#00ff44' : '#ffd700'};
    border: 2px solid ${isLocked ? '#444' : isCompleted ? '#00ff44' : '#ffd700'};
  `;
  badge.textContent = isLocked ? '🔒' : String(entry.id);
  card.appendChild(badge);

  // Mission info
  const info = document.createElement('div');
  info.style.cssText = 'flex: 1; min-width: 0;';
  info.innerHTML = `
    <div style="
      font-size: 16px; font-weight: 700; margin-bottom: 2px;
      color: ${isLocked ? '#666' : isCompleted ? '#00ff44' : '#fff'};
    ">${entry.title}</div>
    <div style="
      font-size: 12px; color: ${isLocked ? '#555' : '#aaa'};
      letter-spacing: 0.05em;
    ">${entry.subtitle}</div>
    <div style="
      font-size: 11px; color: ${isLocked ? '#444' : '#666'};
      margin-top: 2px; font-style: italic;
    ">${entry.setting}</div>
  `;
  card.appendChild(info);

  // Status badge
  const status = document.createElement('div');
  status.style.cssText = `
    font-size: 11px; font-weight: 700;
    padding: 4px 10px; border-radius: 4px;
    letter-spacing: 0.1em; white-space: nowrap;
    ${isCompleted
      ? 'background: rgba(0,255,68,0.15); color: #00ff44; border: 1px solid rgba(0,255,68,0.3);'
      : isLocked
        ? 'background: rgba(255,255,255,0.05); color: #555; border: 1px solid #333;'
        : 'background: rgba(255,215,0,0.1); color: #ffd700; border: 1px solid rgba(255,215,0,0.3);'
    }
  `;
  status.textContent = isCompleted ? '✓ COMPLETE' : isLocked ? 'LOCKED' : 'READY';
  card.appendChild(status);

  // Click handler (only if unlocked)
  if (!isLocked && !entry.isPremium) {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#ffd700';
      card.style.background = 'rgba(255,215,0,0.1)';
      card.style.transform = 'translateX(4px)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = isCompleted ? 'rgba(0,255,68,0.3)' : 'rgba(255,215,0,0.25)';
      card.style.background = isCompleted ? 'rgba(0,255,68,0.05)' : 'rgba(255,215,0,0.05)';
      card.style.transform = 'translateX(0)';
    });
    card.addEventListener('click', () => {
      selectedMissionId = entry.id;
      hideMissionSelect();
      startGame(entry.id);
    });
  }

  return card;
}

function hideMissionSelect(): void {
  const existing = document.getElementById('mission-select-overlay');
  if (existing) existing.remove();
}

// ============================================================
// GAME START / PAUSE / RESUME
// ============================================================

function startGame(missionId: number = 1): void {
  currentState = 'loading';
  mainMenu.style.display = 'none';
  hideMissionSelect();
  
  // Show loading screen — reset ALL inline styles first
  loadingScreen.style.cssText = ''; // Clear all inline styles
  loadingScreen.style.display = 'flex';
  loadingScreen.style.position = 'fixed';
  loadingScreen.style.top = '0';
  loadingScreen.style.left = '0';
  loadingScreen.style.width = '100%';
  loadingScreen.style.height = '100%';
  loadingScreen.style.zIndex = '2000';
  loadingScreen.style.opacity = '1';
  loadingScreen.style.background = 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)';
  loadingScreen.style.flexDirection = 'column';
  loadingScreen.style.justifyContent = 'center';
  loadingScreen.style.alignItems = 'center';
  loadingScreen.classList.remove('hidden');
  
  // Mission-specific loading messages
  const missionLoadSteps: Record<number, { msg: string; pct: number }[]> = {
    1: [
      { msg: 'Decrypting satellite uplink...', pct: 8 },
      { msg: 'Scanning Sector 313 terrain...', pct: 16 },
      { msg: 'Generating desert dunes...', pct: 24 },
      { msg: 'Placing border wall structures...', pct: 32 },
      { msg: 'Mapping enemy patrol routes...', pct: 40 },
      { msg: 'Positioning radar installation...', pct: 48 },
      { msg: 'Calibrating weapon systems...', pct: 56 },
      { msg: 'Loading combat protocols...', pct: 64 },
      { msg: 'Deploying Wolf to staging area...', pct: 72 },
      { msg: 'Deploying Falcon to overwatch...', pct: 80 },
      { msg: 'Syncing Squad 313 radios...', pct: 88 },
      { msg: 'Initiating Protocol 313...', pct: 96 },
      { msg: 'Ready for deployment.', pct: 100 },
    ],
    2: [
      { msg: 'Decrypting urban district intel...', pct: 8 },
      { msg: 'Loading city block geometry...', pct: 16 },
      { msg: 'Generating alleyway layouts...', pct: 24 },
      { msg: 'Placing market stalls and cover...', pct: 32 },
      { msg: 'Mapping rooftop positions...', pct: 40 },
      { msg: 'Locating weapons cache...', pct: 48 },
      { msg: 'Scanning server room signatures...', pct: 56 },
      { msg: 'Loading Iron Rain protocols...', pct: 64 },
      { msg: 'Deploying Wolf to eastern district...', pct: 72 },
      { msg: 'Positioning Falcon overwatch...', pct: 80 },
      { msg: 'Syncing squad communications...', pct: 88 },
      { msg: 'Initiating urban warfare...', pct: 96 },
      { msg: 'Ready for deployment.', pct: 100 },
    ],
    3: [
      { msg: 'Decrypting bunker blueprints...', pct: 8 },
      { msg: 'Scanning underground complex...', pct: 16 },
      { msg: 'Generating chamber layouts...', pct: 24 },
      { msg: 'Placing reinforced doors...', pct: 32 },
      { msg: 'Mapping commander positions...', pct: 40 },
      { msg: 'Identifying high-value targets...', pct: 48 },
      { msg: 'Calibrating breach charges...', pct: 56 },
      { msg: 'Loading elimination protocols...', pct: 64 },
      { msg: 'Deploying Wolf to breach point...', pct: 72 },
      { msg: 'Positioning Falcon recon...', pct: 80 },
      { msg: 'Syncing target intelligence...', pct: 88 },
      { msg: 'Initiating The Nest...', pct: 96 },
      { msg: 'Ready for deployment.', pct: 100 },
    ],
  };

  const loadSteps = missionLoadSteps[missionId] || missionLoadSteps[1];
  const loadingTextEl = document.querySelector('.loading-text') as HTMLElement;
  const loadingBarEl = document.getElementById('loading-bar') as HTMLElement;
  
  async function processLoading() {
    for (const step of loadSteps) {
      if (loadingTextEl) loadingTextEl.textContent = step.msg;
      if (loadingBarEl) loadingBarEl.style.width = `${step.pct}%`;
      await new Promise(r => setTimeout(r, 80));
    }
    
    // Now create the game engine
    canvas.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    if (!gameEngine) {
      try {
        gameEngine = new GameEngine(canvas, CONFIG);
      } catch (e) {
        console.error('[COD:P313] Engine create error:', e);
      }
    }
    
    if (gameEngine) {
      gameEngine.resize(window.innerWidth, window.innerHeight);
    }
    
    // Small delay to ensure first render is complete
    await new Promise(r => setTimeout(r, 200));
    
    // Hide loading, show game
    loadingScreen.style.opacity = '0';
    await new Promise(r => setTimeout(r, 500));
    loadingScreen.style.display = 'none';
    
    currentState = 'playing';
    hud.style.display = 'block';
    canvas.style.display = 'block';
    pauseMenu.style.display = 'none';
    
    if (isMobile()) {
      // Create MobileControls instance (passes the DOM container)
      if (!mobileControls) {
        mobileControls = new MobileControls(mobileControlsEl, gameEngine!);
      }
      mobileControls.enable();
    }
    
    // Start game with selected mission
    if (gameEngine) {
      gameEngine.start(missionId);
      
      // Apply any pending debug features that were set before engine creation
      const pending = (window as any).__debugPendingFeatures;
      if (pending) {
        const debug = gameEngine.getDebugMode();
        for (const [feature, enabled] of Object.entries(pending)) {
          if (enabled) debug.toggleFeature(feature as any);
        }
        // Auto-enable debug panel if any features were set
        if (Object.values(pending).some(v => v)) {
          debug.enabled = true;
          document.getElementById('debug-panel')!.style.display = 'block';
        }
      }
    }
    
    // Request pointer lock (skip on mobile — uses touch controls)
    if (!isMobile()) {
      setTimeout(() => {
        canvas.requestPointerLock();
      }, 200);
    }
  }
  
  processLoading();
}

function pauseGame(): void {
  if (currentState !== 'playing') return;
  
  currentState = 'paused';
  pauseMenu.style.display = 'flex';
  
  if (gameEngine) {
    gameEngine.pause();
  }
}

function resumeGame(): void {
  if (currentState !== 'paused') return;
  
  currentState = 'playing';
  pauseMenu.style.display = 'none';
  
  if (gameEngine) {
    gameEngine.resume();
  }
}

function quitToMenu(): void {
  if (mobileControls) {
    mobileControls.dispose();
    mobileControls = null;
  }
  if (gameEngine) {
    gameEngine.dispose();
    gameEngine = null; // Force new engine creation on next play
  }
  
  showMenu();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners(): void {
  // Menu buttons — Campaign opens mission selection
  btnCampaign.addEventListener('click', showMissionSelect);
  btnMultiplayer.addEventListener('click', () => {
    alert('Multiplayer coming soon!');
  });
  btnSettings.addEventListener('click', () => {
    alert('Settings coming soon!');
  });
  
  // Pause menu buttons
  btnResume.addEventListener('click', resumeGame);
  btnRestart.addEventListener('click', () => {
    if (gameEngine) {
      // Hide pause menu
      pauseMenu.style.display = 'none';
      currentState = 'playing';

      // Reset with the current mission (rebuilds level, resets tracking, restarts loop)
      gameEngine.reset();

      // Re-request pointer lock
      setTimeout(() => {
        canvas.requestPointerLock();
      }, 200);
    }
  });
  btnQuit.addEventListener('click', quitToMenu);
  
  // Keyboard events
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (currentState === 'playing') {
        pauseGame();
      } else if (currentState === 'paused') {
        resumeGame();
      } else if (currentState === 'mission-select') {
        hideMissionSelect();
        showMenu();
      }
    }
    
    if (e.code === 'KeyR' && currentState === 'playing') {
      // Reload weapon
      if (gameEngine) {
        gameEngine.reloadWeapon();
      }
    }
  });

  // Debug panel checkbox handlers — store state, apply when engine ready
  const debugCheckboxes = document.querySelectorAll('[id^="dbg-chk-"]');
  debugCheckboxes.forEach((el) => {
    el.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const feature = target.id.replace('dbg-chk-', '') as any;
      if (gameEngine) {
        gameEngine.getDebugMode().toggleFeature(feature);
      } else {
        // Store for later — apply when engine starts
        (window as any).__debugPendingFeatures = (window as any).__debugPendingFeatures || {};
        (window as any).__debugPendingFeatures[feature] = target.checked;
      }
    });
  });
  
  // Window resize
  window.addEventListener('resize', () => {
    if (gameEngine) {
      gameEngine.resize(window.innerWidth, window.innerHeight);
    }
  });
  
  // Prevent context menu
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  
  // Pointer lock (skip on mobile)
  canvas.addEventListener('click', () => {
    if (currentState === 'playing' && !isMobile()) {
      canvas.requestPointerLock();
    }
  });
}

// ============================================================
// MOBILE DETECTION
// ============================================================

function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

function checkMobile(): void {
  if (isMobile()) {
    CONFIG.PIXEL_RATIO = Math.min(window.devicePixelRatio, 1.5);
  }
}

// ============================================================
// UTILITIES
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// START
// ============================================================

init();
