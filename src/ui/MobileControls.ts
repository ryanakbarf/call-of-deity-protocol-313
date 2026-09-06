/**
 * MobileControls.ts
 * Full mobile touch control system for Call of Deity: Protocol 313.
 *
 * Layout:
 *   LEFT SIDE:
 *     - Virtual joystick (movement, 120px diameter)
 *     - Lean buttons (small, above joystick)
 *   RIGHT SIDE:
 *     - Look area (entire right half for camera drag)
 *     - Fire button (large, red, bottom-right)
 *     - ADS button (medium, above fire)
 *     - Reload button (small, above ADS)
 *   BOTTOM CENTER:
 *     - Weapon switch buttons (1-4)
 *   BOTTOM LEFT (near joystick):
 *     - Crouch/Prone toggle
 *     - Sprint
 *     - Jump
 */

import { GameEngine } from '../engine/GameEngine';

// ============================================================
// CONSTANTS
// ============================================================

const JOYSTICK_SIZE = 120;
const JOYSTICK_KNOB_SIZE = 48;
const JOYSTICK_DEAD_ZONE = 0.15;
const JOYSTICK_MAX_DIST = (JOYSTICK_SIZE - JOYSTICK_KNOB_SIZE) / 2;

const FIRE_BTN_SIZE = 80;
const ADS_BTN_SIZE = 56;
const RELOAD_BTN_SIZE = 44;
const MELEE_BTN_SIZE = 44;

const LEAN_BTN_SIZE = 48;

const WEAPON_BTN_WIDTH = 52;
const WEAPON_BTN_HEIGHT = 36;

const UTILITY_BTN_SIZE = 44;

// ============================================================
// MOBILE CONTROLS CLASS
// ============================================================

export class MobileControls {
  private container: HTMLElement;
  private gameEngine: GameEngine;
  private enabled: boolean = false;

  // Joystick state
  private joystickArea!: HTMLElement;
  private joystickKnob!: HTMLElement;
  private joystickTouchId: number | null = null;
  private joystickCenter: { x: number; y: number } = { x: 0, y: 0 };
  private joystickDelta: { x: number; y: number } = { x: 0, y: 0 };

  // Look-drag state
  private lookTouchId: number | null = null;
  private lookLastPos: { x: number; y: number } = { x: 0, y: 0 };

  // Fire auto-fire
  private fireTouchId: number | null = null;
  private fireAutoInterval: number | null = null;
  private isFireHeld: boolean = false;

  // ADS state
  private adsActive: boolean = false;

  // Lean state
  private leanLeftActive: boolean = false;
  private leanRightActive: boolean = false;

  // Animation frame for joystick movement application
  private animFrameId: number | null = null;

  constructor(container: HTMLElement, gameEngine: GameEngine) {
    this.container = container;
    this.gameEngine = gameEngine;
    this.buildDOM();
    this.setupTouchHandlers();
  }

  // ============================================================
  // DOM CONSTRUCTION
  // ============================================================

  private buildDOM(): void {
    this.container.innerHTML = '';
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 200;
      display: flex;
    `;

    // ---- LEFT SIDE: Joystick + utilities ----
    const leftPanel = document.createElement('div');
    leftPanel.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    `;

    // Utility row (crouch, sprint, jump)
    const utilRow = document.createElement('div');
    utilRow.style.cssText = `
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
    `;

    const btnCrouch = this.createSmallButton('🧎', 'Crouch', () => {
      this.gameEngine.setMobileKey('KeyC', true);
    }, () => {
      this.gameEngine.setMobileKey('KeyC', false);
    });
    const btnProne = this.createSmallButton('🛌', 'Prone', () => {
      this.gameEngine.setMobileKey('KeyX', true);
    }, () => {
      this.gameEngine.setMobileKey('KeyX', false);
    });
    const btnSprint = this.createSmallButton('🏃', 'Sprint', () => {
      this.gameEngine.setMobileKey('ShiftLeft', true);
    }, () => {
      this.gameEngine.setMobileKey('ShiftLeft', false);
    });
    const btnJump = this.createSmallButton('⬆️', 'Jump', () => {
      this.gameEngine.setMobileKey('Space', true);
    }, () => {
      this.gameEngine.setMobileKey('Space', false);
    });

    utilRow.appendChild(btnCrouch);
    utilRow.appendChild(btnProne);
    utilRow.appendChild(btnSprint);
    utilRow.appendChild(btnJump);
    leftPanel.appendChild(utilRow);

    // Lean buttons row
    const leanRow = document.createElement('div');
    leanRow.style.cssText = `
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
    `;

    const btnLeanL = this.createLeanButton('◁', 'Lean L', 'left');
    const btnLeanR = this.createLeanButton('▷', 'Lean R', 'right');

    leanRow.appendChild(btnLeanL);
    leanRow.appendChild(btnLeanR);
    leftPanel.appendChild(leanRow);

    // Joystick area
    this.joystickArea = document.createElement('div');
    this.joystickArea.style.cssText = `
      width: ${JOYSTICK_SIZE}px;
      height: ${JOYSTICK_SIZE}px;
      border-radius: 50%;
      border: 2px solid rgba(255, 215, 0, 0.35);
      background: rgba(0, 0, 0, 0.3);
      position: relative;
      touch-action: none;
    `;

    this.joystickKnob = document.createElement('div');
    this.joystickKnob.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: ${JOYSTICK_KNOB_SIZE}px;
      height: ${JOYSTICK_KNOB_SIZE}px;
      border-radius: 50%;
      background: rgba(255, 215, 0, 0.45);
      border: 1px solid rgba(255, 215, 0, 0.6);
      transition: background 0.1s;
    `;

    this.joystickArea.appendChild(this.joystickKnob);
    leftPanel.appendChild(this.joystickArea);

    this.container.appendChild(leftPanel);

    // ---- RIGHT SIDE: Fire, ADS, Reload, Melee ----
    const rightPanel = document.createElement('div');
    rightPanel.style.cssText = `
      position: absolute;
      bottom: 24px;
      right: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    `;

    // Reload (top)
    const btnReload = this.createActionButton('🔄', 'Reload', RELOAD_BTN_SIZE, 'rgba(100, 149, 237, 0.4)', '#6495ED', () => {
      this.gameEngine.reloadWeapon();
    });
    rightPanel.appendChild(btnReload);

    // ADS (middle)
    const btnADS = this.createToggleButton('🎯', 'ADS', ADS_BTN_SIZE, 'rgba(50, 205, 50, 0.4)', '#32CD32', (active) => {
      this.adsActive = active;
      this.gameEngine.setMobileADS(active);
    });
    rightPanel.appendChild(btnADS);

    // Melee (below ADS)
    const btnMelee = this.createActionButton('🔪', 'Melee', MELEE_BTN_SIZE, 'rgba(255, 165, 0, 0.35)', '#FFA500', () => {
      this.gameEngine.triggerMobileMelee();
    });
    rightPanel.appendChild(btnMelee);

    // Fire (bottom, large)
    const btnFire = this.createFireButton();
    rightPanel.appendChild(btnFire);

    this.container.appendChild(rightPanel);

    // ---- BOTTOM CENTER: Weapon switch ----
    const weaponBar = document.createElement('div');
    weaponBar.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 4px;
      pointer-events: auto;
    `;

    const weapons = [
      { slot: 1, icon: '👊', name: 'Hands' },
      { slot: 2, icon: '🔪', name: 'Knife' },
      { slot: 3, icon: '🔫', name: 'Makara' },
      { slot: 4, icon: '🔫', name: 'Zulfiqar' },
    ];

    weapons.forEach((w) => {
      const btn = document.createElement('div');
      btn.style.cssText = `
        width: ${WEAPON_BTN_WIDTH}px;
        height: ${WEAPON_BTN_HEIGHT}px;
        border-radius: 4px;
        border: 1px solid rgba(255, 215, 0, 0.3);
        background: rgba(0, 0, 0, 0.45);
        color: rgba(255, 255, 255, 0.7);
        font-size: 10px;
        font-weight: 700;
        font-family: 'Courier New', monospace;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      `;
      btn.innerHTML = `<span style="font-size:9px;color:rgba(255,255,255,0.4)">${w.slot}</span><span>${w.icon}</span>`;
      btn.setAttribute('data-slot', String(w.slot));

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.gameEngine.switchWeaponSlot(w.slot);
        this.highlightWeaponSlot(w.slot);
        btn.style.borderColor = '#FFD700';
        btn.style.background = 'rgba(255, 215, 0, 0.15)';
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.style.borderColor = 'rgba(255, 215, 0, 0.3)';
        btn.style.background = 'rgba(0, 0, 0, 0.45)';
      }, { passive: false });

      weaponBar.appendChild(btn);
    });

    this.container.appendChild(weaponBar);
  }

  // ============================================================
  // BUTTON HELPERS
  // ============================================================

  private createSmallButton(icon: string, label: string, onPress: () => void, onRelease: () => void): HTMLElement {
    const btn = document.createElement('div');
    btn.style.cssText = `
      width: ${UTILITY_BTN_SIZE}px;
      height: ${UTILITY_BTN_SIZE}px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.25);
      background: rgba(0, 0, 0, 0.4);
      color: #fff;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    `;
    btn.textContent = icon;
    btn.setAttribute('aria-label', label);

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255, 255, 255, 0.15)';
      btn.style.borderColor = 'rgba(255, 215, 0, 0.6)';
      onPress();
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(0, 0, 0, 0.4)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
      onRelease();
    }, { passive: false });

    btn.addEventListener('touchcancel', (e) => {
      btn.style.background = 'rgba(0, 0, 0, 0.4)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.25)';
      onRelease();
    });

    return btn;
  }

  private createLeanButton(icon: string, label: string, direction: 'left' | 'right'): HTMLElement {
    const btn = document.createElement('div');
    btn.style.cssText = `
      width: ${LEAN_BTN_SIZE}px;
      height: ${LEAN_BTN_SIZE}px;
      border-radius: 50%;
      border: 1px solid rgba(255, 165, 0, 0.35);
      background: rgba(0, 0, 0, 0.4);
      color: #FFA500;
      font-size: 18px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    `;
    btn.textContent = icon;
    btn.setAttribute('aria-label', label);

    const key = direction === 'left' ? 'KeyQ' : 'KeyE';

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255, 165, 0, 0.2)';
      btn.style.borderColor = '#FFA500';
      this.gameEngine.setMobileKey(key, true);
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(0, 0, 0, 0.4)';
      btn.style.borderColor = 'rgba(255, 165, 0, 0.35)';
      this.gameEngine.setMobileKey(key, false);
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
      btn.style.background = 'rgba(0, 0, 0, 0.4)';
      btn.style.borderColor = 'rgba(255, 165, 0, 0.35)';
      this.gameEngine.setMobileKey(key, false);
    });

    return btn;
  }

  private createActionButton(
    icon: string,
    label: string,
    size: number,
    bgColor: string,
    borderColor: string,
    onPress: () => void,
  ): HTMLElement {
    const btn = document.createElement('div');
    btn.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      border: 2px solid ${borderColor};
      background: ${bgColor};
      color: #fff;
      font-size: ${size > 50 ? 22 : 18}px;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    `;
    btn.textContent = icon;
    btn.setAttribute('aria-label', label);

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.transform = 'scale(0.9)';
      btn.style.filter = 'brightness(1.3)';
      onPress();
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.transform = 'scale(1)';
      btn.style.filter = 'brightness(1)';
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
      btn.style.transform = 'scale(1)';
      btn.style.filter = 'brightness(1)';
    });

    return btn;
  }

  private createToggleButton(
    icon: string,
    label: string,
    size: number,
    bgColor: string,
    borderColor: string,
    onToggle: (active: boolean) => void,
  ): HTMLElement {
    const btn = document.createElement('div');
    let active = false;
    btn.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      border: 2px solid ${borderColor};
      background: ${bgColor};
      color: #fff;
      font-size: ${size > 50 ? 22 : 18}px;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      transition: background 0.15s, border-color 0.15s;
    `;
    btn.textContent = icon;
    btn.setAttribute('aria-label', label);

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      active = !active;
      if (active) {
        btn.style.background = bgColor.replace('0.4', '0.7').replace('0.35', '0.7');
        btn.style.borderColor = '#fff';
        btn.style.boxShadow = `0 0 12px ${borderColor}`;
      } else {
        btn.style.background = bgColor;
        btn.style.borderColor = borderColor;
        btn.style.boxShadow = 'none';
      }
      onToggle(active);
    }, { passive: false });

    return btn;
  }

  private createFireButton(): HTMLElement {
    const btn = document.createElement('div');
    btn.style.cssText = `
      width: ${FIRE_BTN_SIZE}px;
      height: ${FIRE_BTN_SIZE}px;
      border-radius: 50%;
      border: 3px solid #e74c3c;
      background: rgba(231, 76, 60, 0.4);
      color: #fff;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.1em;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      box-shadow: 0 0 15px rgba(231, 76, 60, 0.3);
    `;
    btn.textContent = '🔥';
    btn.setAttribute('aria-label', 'Fire');

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isFireHeld = true;
      btn.style.background = 'rgba(231, 76, 60, 0.8)';
      btn.style.boxShadow = '0 0 25px rgba(231, 76, 60, 0.7)';
      btn.style.transform = 'scale(0.92)';

      // Fire immediately
      this.gameEngine.triggerMobileFire();

      // Auto-fire for automatic weapons
      this.fireAutoInterval = window.setInterval(() => {
        if (this.isFireHeld) {
          this.gameEngine.triggerMobileFire();
        }
      }, 80);
    }, { passive: false });

    const stopFire = (e: Event) => {
      e.preventDefault();
      this.isFireHeld = false;
      btn.style.background = 'rgba(231, 76, 60, 0.4)';
      btn.style.boxShadow = '0 0 15px rgba(231, 76, 60, 0.3)';
      btn.style.transform = 'scale(1)';
      if (this.fireAutoInterval) {
        clearInterval(this.fireAutoInterval);
        this.fireAutoInterval = null;
      }
    };

    btn.addEventListener('touchend', stopFire, { passive: false });
    btn.addEventListener('touchcancel', stopFire);

    return btn;
  }

  // ============================================================
  // TOUCH HANDLERS
  // ============================================================

  private setupTouchHandlers(): void {
    // Joystick touch
    this.joystickArea.addEventListener('touchstart', (e) => this.onJoystickStart(e), { passive: false });
    this.joystickArea.addEventListener('touchmove', (e) => this.onJoystickMove(e), { passive: false });
    this.joystickArea.addEventListener('touchend', (e) => this.onJoystickEnd(e), { passive: false });
    this.joystickArea.addEventListener('touchcancel', (e) => this.onJoystickEnd(e));

    // Look drag on the entire container (right half)
    this.container.addEventListener('touchstart', (e) => this.onLookStart(e), { passive: false });
    this.container.addEventListener('touchmove', (e) => this.onLookMove(e), { passive: false });
    this.container.addEventListener('touchend', (e) => this.onLookEnd(e), { passive: false });
    this.container.addEventListener('touchcancel', (e) => this.onLookEnd(e));

    // Prevent default browser gestures on the game area
    this.container.addEventListener('gesturestart', (e) => e.preventDefault());
    this.container.addEventListener('gesturechange', (e) => e.preventDefault());
    this.container.addEventListener('gestureend', (e) => e.preventDefault());

    // Start movement application loop
    this.startMovementLoop();
  }

  // ============================================================
  // JOYSTICK HANDLING
  // ============================================================

  private getTouchPos(touch: Touch): { x: number; y: number } {
    const rect = this.joystickArea.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }

  private onJoystickStart(e: TouchEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.joystickTouchId !== null) return;

    const touch = e.changedTouches[0];
    this.joystickTouchId = touch.identifier;
    const pos = this.getTouchPos(touch);
    this.joystickCenter = { x: pos.x, y: pos.y };
    this.joystickKnob.style.background = 'rgba(255, 215, 0, 0.7)';
  }

  private onJoystickMove(e: TouchEvent): void {
    e.preventDefault();
    e.stopPropagation();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.joystickTouchId) {
        const pos = this.getTouchPos(touch);
        let dx = pos.x - this.joystickCenter.x;
        let dy = pos.y - this.joystickCenter.y;

        // Clamp to joystick radius
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > JOYSTICK_MAX_DIST) {
          dx = (dx / dist) * JOYSTICK_MAX_DIST;
          dy = (dy / dist) * JOYSTICK_MAX_DIST;
        }

        // Move the knob visually
        this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        // Normalize to -1..1 for input
        const normX = dx / JOYSTICK_MAX_DIST;
        const normY = dy / JOYSTICK_MAX_DIST;
        const normDist = Math.sqrt(normX * normX + normY * normY);

        if (normDist < JOYSTICK_DEAD_ZONE) {
          this.joystickDelta = { x: 0, y: 0 };
        } else {
          this.joystickDelta = { x: normX, y: normY };
        }

        break;
      }
    }
  }

  private onJoystickEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.joystickTouchId) {
        this.joystickTouchId = null;
        this.joystickDelta = { x: 0, y: 0 };
        this.joystickKnob.style.transform = 'translate(-50%, -50%)';
        this.joystickKnob.style.background = 'rgba(255, 215, 0, 0.45)';
        break;
      }
    }
  }

  // ============================================================
  // LOOK DRAG HANDLING (right side of screen)
  // ============================================================

  private onLookStart(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      // Only capture touches on the right 60% of screen
      // AND not already captured by another control
      if (touch.clientX > window.innerWidth * 0.4 && this.lookTouchId === null) {
        // Check this touch is not already used by another element
        const target = touch.target as HTMLElement;
        if (target.closest('[aria-label]') || target.closest('.action-btn')) continue;
        this.lookTouchId = touch.identifier;
        this.lookLastPos = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  private onLookMove(e: TouchEvent): void {
    if (this.lookTouchId === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.lookTouchId) {
        const dx = touch.clientX - this.lookLastPos.x;
        const dy = touch.clientY - this.lookLastPos.y;
        this.lookLastPos = { x: touch.clientX, y: touch.clientY };

        if (dx !== 0 || dy !== 0) {
          this.gameEngine.applyMobileLook(-dx, -dy);
        }
        break;
      }
    }
  }

  private onLookEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.lookTouchId) {
        this.lookTouchId = null;
        break;
      }
    }
  }

  // ============================================================
  // MOVEMENT LOOP — converts joystick delta to WASD keys
  // ============================================================

  private startMovementLoop(): void {
    const loop = () => {
      if (!this.enabled) {
        this.animFrameId = requestAnimationFrame(loop);
        return;
      }

      const dx = this.joystickDelta.x;
      const dy = this.joystickDelta.y;

      // Convert joystick (dx, dy) to key states
      // dy > 0 = pushed up = forward (W)
      // dy < 0 = pushed down = backward (S)
      // dx > 0 = pushed right = strafe right (D)
      // dx < 0 = pushed left = strafe left (A)
      const forward = dy < -JOYSTICK_DEAD_ZONE;
      const backward = dy > JOYSTICK_DEAD_ZONE;
      const left = dx < -JOYSTICK_DEAD_ZONE;
      const right = dx > JOYSTICK_DEAD_ZONE;

      this.gameEngine.setMobileKey('KeyW', forward);
      this.gameEngine.setMobileKey('KeyS', backward);
      this.gameEngine.setMobileKey('KeyA', left);
      this.gameEngine.setMobileKey('KeyD', right);

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  // ============================================================
  // WEAPON SLOT HIGHLIGHT
  // ============================================================

  private highlightWeaponSlot(slot: number): void {
    const weaponBar = this.container.querySelector('[data-slot]')?.parentElement;
    if (!weaponBar) return;
    const btns = weaponBar.querySelectorAll('[data-slot]');
    btns.forEach((b) => {
      const el = b as HTMLElement;
      const s = parseInt(el.getAttribute('data-slot') || '0');
      if (s === slot) {
        el.style.borderColor = '#FFD700';
        el.style.background = 'rgba(255, 215, 0, 0.15)';
        el.style.color = '#FFD700';
      } else {
        el.style.borderColor = 'rgba(255, 215, 0, 0.3)';
        el.style.background = 'rgba(0, 0, 0, 0.45)';
        el.style.color = 'rgba(255, 255, 255, 0.7)';
      }
    });
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  public enable(): void {
    this.enabled = true;
    this.container.style.display = 'flex';
  }

  public disable(): void {
    this.enabled = false;
    this.container.style.display = 'none';
    // Release all keys when disabled
    this.gameEngine.setMobileKey('KeyW', false);
    this.gameEngine.setMobileKey('KeyS', false);
    this.gameEngine.setMobileKey('KeyA', false);
    this.gameEngine.setMobileKey('KeyD', false);
    this.gameEngine.setMobileKey('ShiftLeft', false);
    this.gameEngine.setMobileKey('KeyQ', false);
    this.gameEngine.setMobileKey('KeyE', false);
  }

  public dispose(): void {
    this.disable();
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.fireAutoInterval) {
      clearInterval(this.fireAutoInterval);
      this.fireAutoInterval = null;
    }
    this.container.innerHTML = '';
  }
}
