/**
 * InputManager.ts
 * Handles all user input (keyboard, mouse, touch).
 */

export class InputManager {
  private keys: Map<string, boolean> = new Map();
  private mouseButtons: Map<number, boolean> = new Map();
  private mousePosition: { x: number; y: number } = { x: 0, y: 0 };
  private mouseDelta: { x: number; y: number } = { x: 0, y: 0 };

  constructor() {
    this.setupKeyboardListeners();
    this.setupMouseListeners();
    console.log('[InputManager] Initialized');
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.set(e.code, true);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.set(e.code, false);
    });
  }

  private setupMouseListeners(): void {
    window.addEventListener('mousemove', (e) => {
      this.mousePosition.x = e.clientX;
      this.mousePosition.y = e.clientY;
      this.mouseDelta.x = e.movementX || 0;
      this.mouseDelta.y = e.movementY || 0;
    });

    window.addEventListener('mousedown', (e) => {
      this.mouseButtons.set(e.button, true);
    });

    window.addEventListener('mouseup', (e) => {
      this.mouseButtons.set(e.button, false);
    });
  }

  public isKeyPressed(code: string): boolean {
    return this.keys.get(code) || false;
  }

  public isMouseButtonPressed(button: number): boolean {
    return this.mouseButtons.get(button) || false;
  }

  public getMouseDelta(): { x: number; y: number } {
    const delta = { ...this.mouseDelta };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }

  public getMousePosition(): { x: number; y: number } {
    return { ...this.mousePosition };
  }
}
