/**
 * UIManager.ts
 * Manages all HUD and UI elements.
 * Now includes comprehensive kill feedback: kill confirm icon,
 * kill streak notifications, floating damage numbers, damage vignettes,
 * screen shake, low-health effects, film grain overlay, and weapon slot HUD.
 */

/** Minimal weapon info needed by UIManager for HUD display. */
interface WeaponSlotInfo {
  name: string;
  type: string;
  slot: number;
  icon: string;
}

export class UIManager {
  // Dual health bars
  private wolfHealthFill: HTMLElement;
  private falconHealthFill: HTMLElement;
  private wolfHealthBar: HTMLElement;
  private falconHealthBar: HTMLElement;
  private wolfArmorFill: HTMLElement;
  private falconArmorFill: HTMLElement;
  private wolfArmorBar: HTMLElement;
  private falconArmorBar: HTMLElement;
  private wolfArmorLabel: HTMLElement;
  private falconArmorLabel: HTMLElement;
  private ammoCount: HTMLElement;
  private scoreValue: HTMLElement;
  private objectiveText: HTMLElement;
  private characterName: HTMLElement;
  private characterRole: HTMLElement;
  private killFeed: HTMLElement;
  private detectionDots: HTMLElement[];
  private stealthStatusText: HTMLElement;
  private hitMarker: HTMLElement;
  private crosshair: HTMLElement;

  // Kill feedback elements
  private killConfirmIcon: HTMLElement;
  private damageVignette: HTMLElement;
  private goldVignette: HTMLElement;
  private lowHealthVignette: HTMLElement;
  private filmGrainCanvas: HTMLCanvasElement;

  // Film grain state
  private filmGrainCtx: CanvasRenderingContext2D | null = null;
  private filmGrainActive: boolean = false;
  private filmGrainAnimFrame: number = 0;

  // Screen shake state
  private shakeActive: boolean = false;
  private shakeIntensity: number = 0;
  private shakeStartTime: number = 0;
  private shakeDuration: number = 0;

  // Kill streak state
  private consecutiveKills: number = 0;
  private lastKillTime: number = 0;
  private readonly KILL_STREAK_TIMEOUT: number = 5000; // 5s resets streak

  // Downed warning elements
  private downedWarning: HTMLElement;
  private downedTimer: HTMLElement;

  // Rescue progress elements
  private rescueProgress: HTMLElement;
  private rescueProgressFill: HTMLElement;

  // ---- SUBTITLE QUEUE SYSTEM ----
  private subtitleQueue: Array<{ text: string; duration: number; isRadio: boolean }> = [];
  private subtitleQueueActive: boolean = false;
  private subtitleQueueTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSubtitleElement: HTMLElement | null = null;
  private readonly SUBTITLE_GAP_MS: number = 500; // 0.5s gap between subtitles

  constructor() {
    // Dual health bars
    this.wolfHealthFill = document.getElementById('wolf-health-fill')!;
    this.falconHealthFill = document.getElementById('falcon-health-fill')!;
    this.wolfHealthBar = document.getElementById('wolf-health-bar')!;
    this.falconHealthBar = document.getElementById('falcon-health-bar')!;
    // Dual armor bars
    this.wolfArmorFill = document.getElementById('wolf-armor-fill')!;
    this.falconArmorFill = document.getElementById('falcon-armor-fill')!;
    this.wolfArmorBar = document.getElementById('wolf-armor-bar')!;
    this.falconArmorBar = document.getElementById('falcon-armor-bar')!;
    this.wolfArmorLabel = document.getElementById('wolf-armor-label')!;
    this.falconArmorLabel = document.getElementById('falcon-armor-label')!;
    this.ammoCount = document.getElementById('ammo-count')!;
    this.scoreValue = document.getElementById('score-value')!;
    this.objectiveText = document.getElementById('objective-text')!;
    this.characterName = document.getElementById('character-name')!;
    this.characterRole = document.getElementById('character-role')!;
    this.killFeed = document.getElementById('kill-feed')!;

    // Detection dots
    this.detectionDots = [];
    for (let i = 1; i <= 5; i++) {
      this.detectionDots.push(document.getElementById(`det-${i}`)!);
    }

    // Stealth status text
    this.stealthStatusText = document.getElementById('stealth-status-text')!;

    // Hit marker element
    this.hitMarker = document.getElementById('hit-marker')!;

    // Crosshair element
    this.crosshair = document.getElementById('crosshair')!;

    // Kill feedback elements
    this.killConfirmIcon = document.getElementById('kill-confirm')!;
    this.damageVignette = document.getElementById('damage-vignette')!;
    this.goldVignette = document.getElementById('gold-vignette')!;
    this.lowHealthVignette = document.getElementById('low-health-vignette')!;
    this.filmGrainCanvas = document.getElementById('film-grain') as HTMLCanvasElement;

    // Downed warning
    this.downedWarning = document.getElementById('downed-warning')!;
    this.downedTimer = document.getElementById('downed-timer')!;

    // Rescue progress
    this.rescueProgress = document.getElementById('rescue-progress')!;
    this.rescueProgressFill = document.getElementById('rescue-progress-fill')!;

    // Initialize film grain canvas
    this.initFilmGrain();
  }

  /**
   * Updates the dual health bars for both Wolf and Falcon.
   * Active character's bar gets gold border, inactive gets grey.
   * Downed character's bar gets red pulsing border.
   */
  public updateDualHealthBars(
    wolfHp: number, wolfMax: number,
    falconHp: number, falconMax: number,
    activeChar: 'wolf' | 'falcon',
    wolfDowned: boolean, falconDowned: boolean
  ): void {
    // Wolf health bar
    const wolfPercent = Math.max(0, (wolfHp / wolfMax) * 100);
    this.wolfHealthFill.style.width = `${wolfPercent}%`;
    this.setHealthBarColor(this.wolfHealthFill, wolfPercent);

    // Falcon health bar
    const falconPercent = Math.max(0, (falconHp / falconMax) * 100);
    this.falconHealthFill.style.width = `${falconPercent}%`;
    this.setHealthBarColor(this.falconHealthFill, falconPercent);

    // Active/inactive border states
    this.wolfHealthBar.className = 'char-health-bar';
    this.falconHealthBar.className = 'char-health-bar';

    if (wolfDowned) {
      this.wolfHealthBar.classList.add('downed');
    } else if (activeChar === 'wolf') {
      this.wolfHealthBar.classList.add('active');
    } else {
      this.wolfHealthBar.classList.add('inactive');
    }

    if (falconDowned) {
      this.falconHealthBar.classList.add('downed');
    } else if (activeChar === 'falcon') {
      this.falconHealthBar.classList.add('active');
    } else {
      this.falconHealthBar.classList.add('inactive');
    }
  }

  /**
   * Sets the health bar fill color based on percentage.
   */
  private setHealthBarColor(fill: HTMLElement, percent: number): void {
    if (percent > 60) {
      fill.style.backgroundColor = '';
    } else if (percent > 30) {
      fill.style.backgroundColor = '#f39c12';
    } else {
      fill.style.backgroundColor = '#c0392b';
    }
  }

  /**
   * Updates the dual armor bars for both Wolf and Falcon.
   * Active character's armor bar is brighter.
   */
  public updateDualArmorBars(
    wolfArmor: number, wolfMaxArmor: number,
    falconArmor: number, falconMaxArmor: number,
    activeChar: 'wolf' | 'falcon'
  ): void {
    // Wolf armor bar
    const wolfPercent = Math.max(0, (wolfArmor / wolfMaxArmor) * 100);
    const wolfFill = document.getElementById('wolf-armor-fill');
    if (wolfFill) {
      (wolfFill as HTMLElement).style.width = `${wolfPercent}%`;
    }

    // Falcon armor bar
    const falconPercent = Math.max(0, (falconArmor / falconMaxArmor) * 100);
    const falconFill = document.getElementById('falcon-armor-fill');
    if (falconFill) {
      (falconFill as HTMLElement).style.width = `${falconPercent}%`;
    }
  }

  /**
   * Legacy armor update — kept for compatibility, delegates to dual bars.
   */
  public updateArmor(armor: number, maxArmor: number): void {
    // No-op — dual armor bars are used instead
  }

  /**
   * Updates the ammo display with magazine count and reserve ammo.
   * Format: "24/30 | 90" (current/mag | reserve)
   * Reserve shows in red when < 30% of maxReserve.
   *
   * @param current   - Current rounds in magazine
   * @param max       - Magazine capacity
   * @param reserve   - Reserve ammo count (optional; omit for melee weapons)
   * @param maxReserve - Maximum reserve capacity (optional; used for low warning)
   */
  public updateAmmo(current: number, max: number, reserve?: number, maxReserve?: number): void {
    // Melee weapons show ∞ symbol
    if (current === Infinity || max === Infinity) {
      this.ammoCount.textContent = '∞ / ∞';
      this.ammoCount.style.color = '#88ff88';
      return;
    }

    // Build display: "24/30 | 90"
    let reserveHtml = '';
    if (reserve !== undefined && reserve !== Infinity) {
      const isLow = maxReserve !== undefined && maxReserve > 0 && reserve < maxReserve * 0.3;
      const reserveColor = isLow ? '#e74c3c' : '#cccccc';
      reserveHtml = ` | <span style="color:${reserveColor}">${reserve}</span>`;
    }

    this.ammoCount.innerHTML = `${current}/${max}${reserveHtml}`;

    // Color the magazine count based on ammo level
    if (current > max * 0.5) {
      this.ammoCount.style.color = '#FFD700';
    } else if (current > max * 0.2) {
      this.ammoCount.style.color = '#f39c12';
    } else {
      this.ammoCount.style.color = '#e74c3c';
    }
  }

  /**
   * Updates the weapon name label above the ammo count.
   */
  public updateWeaponName(name: string): void {
    const el = document.getElementById('weapon-name-hud');
    if (el) el.textContent = name;
  }

  public updateScore(score: number): void {
    const newValue = score.toLocaleString();
    const oldValue = this.scoreValue.textContent;

    this.scoreValue.textContent = newValue;

    // Trigger pop animation only when score actually increases
    if (oldValue !== newValue) {
      this.scoreValue.classList.remove('pop');
      void this.scoreValue.offsetHeight; // Force reflow to replay animation
      this.scoreValue.classList.add('pop');
    }
  }

  public updateMissionObjective(text: string): void {
    this.objectiveText.textContent = text;
  }

  public updateCharacter(character: 'wolf' | 'falcon'): void {
    if (character === 'wolf') {
      this.characterName.textContent = 'WOLF';
      this.characterRole.textContent = 'THE OPERATOR';
      this.characterName.style.color = '#FFD700';
    } else {
      this.characterName.textContent = 'FALCON';
      this.characterRole.textContent = 'THE OVERWATCH';
      this.characterName.style.color = '#00BFFF';
    }
  }

  public updateDetection(level: number, statusText?: string, statusColor?: string): void {
    this.detectionDots.forEach((dot, index) => {
      if (index < level) {
        dot.classList.add('active');
        // Color based on level
        if (level >= 4) {
          dot.style.background = '#e74c3c';
        } else if (level >= 2) {
          dot.style.background = '#f39c12';
        } else {
          dot.style.background = '#FFD700';
        }
      } else {
        dot.classList.remove('active');
        dot.style.background = '#333';
      }
    });

    // Update stealth status text (e.g., "(STEALTHY)", "(DETECTED)")
    if (this.stealthStatusText && statusText !== undefined) {
      this.stealthStatusText.textContent = statusText;
      if (statusColor) {
        this.stealthStatusText.style.color = statusColor;
        this.stealthStatusText.style.textShadow = `0 0 6px ${statusColor}80`;
      }
    }
  }

  public addKillFeedEntry(message: string): void {
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.textContent = message;
    this.killFeed.appendChild(entry);

    // Smooth fade-out after 3.3s (lets CSS animation complete), then remove
    setTimeout(() => {
      entry.classList.add('removing');
      setTimeout(() => {
        if (entry.parentNode) entry.remove();
      }, 400); // Wait for the removing transition to finish
    }, 3300);

    // Keep only last 5 entries — smooth-fade the oldest if over limit
    while (this.killFeed.children.length > 5) {
      const oldest = this.killFeed.firstChild as HTMLElement;
      if (oldest) {
        oldest.classList.add('removing');
        setTimeout(() => {
          if (oldest.parentNode) oldest.remove();
        }, 400);
      }
    }
  }

  public showMessage(text: string, duration: number = 3000): void {
    // Create temporary message element
    const msg = document.createElement('div');
    msg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 1rem 2rem;
      background: rgba(0, 0, 0, 0.8);
      color: #FFD700;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.2em;
      z-index: 200;
      pointer-events: none;
      text-align: center;
    `;
    msg.textContent = text;
    document.body.appendChild(msg);

    setTimeout(() => {
      msg.remove();
    }, duration);
  }

  // ============================================================
  // SUBTITLE QUEUE SYSTEM
  // ============================================================

  /**
   * Calculates display duration for a subtitle based on word count.
   * Average reading speed: ~3 words/second, minimum 3 seconds.
   */
  private calculateSubtitleDuration(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return Math.max(3000, (wordCount / 3) * 1000);
  }

  /**
   * Shows a subtitle, queued behind any currently-displayed subtitle.
   * Duration defaults to (wordCount / 3) seconds, minimum 3s.
   * Subtitles appear below the character name indicator at bottom-center.
   */
  public showSubtitle(text: string, duration?: number): void {
    if (duration === undefined) {
      duration = this.calculateSubtitleDuration(text);
    }
    this.subtitleQueue.push({ text, duration, isRadio: false });
    this.processSubtitleQueue();
  }

  /**
   * Shows a radio-style subtitle, queued like regular subtitles.
   * Uses green-tinted border to distinguish from regular subtitles.
   */
  public showRadioSubtitle(text: string, duration?: number): void {
    if (duration === undefined) {
      duration = this.calculateSubtitleDuration(text);
    }
    this.subtitleQueue.push({ text, duration, isRadio: true });
    this.processSubtitleQueue();
  }

  /**
   * Enqueues multiple subtitles to display sequentially.
   * @param subtitles - Array of subtitle strings
   * @param startDelay - Seconds to wait before showing first subtitle (default 0)
   */
  public showSubtitleQueue(subtitles: string[], startDelay: number = 0): void {
    for (const text of subtitles) {
      const duration = this.calculateSubtitleDuration(text);
      this.subtitleQueue.push({ text, duration, isRadio: false });
    }
    if (startDelay > 0) {
      setTimeout(() => this.processSubtitleQueue(), startDelay * 1000);
    } else {
      this.processSubtitleQueue();
    }
  }

  /**
   * Clears all pending subtitles and removes the current one.
   * Call when mission changes or game resets.
   */
  public clearSubtitleQueue(): void {
    this.subtitleQueue = [];
    this.subtitleQueueActive = false;
    if (this.subtitleQueueTimer) {
      clearTimeout(this.subtitleQueueTimer);
      this.subtitleQueueTimer = null;
    }
    if (this.currentSubtitleElement) {
      this.currentSubtitleElement.remove();
      this.currentSubtitleElement = null;
    }
  }

  /**
   * Internal: processes the next subtitle in the queue.
   * Shows one at a time; when it finishes, waits 0.5s gap then shows next.
   */
  private processSubtitleQueue(): void {
    if (this.subtitleQueueActive) return;
    if (this.subtitleQueue.length === 0) return;

    this.subtitleQueueActive = true;
    const item = this.subtitleQueue.shift()!;

    // Remove any lingering subtitle element
    if (this.currentSubtitleElement) {
      this.currentSubtitleElement.remove();
      this.currentSubtitleElement = null;
    }

    // Create subtitle element — positioned below the character name indicator
    const sub = document.createElement('div');
    sub.style.cssText = `
      position: fixed;
      bottom: 6%;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.75rem 1.5rem;
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      font-size: 1.05rem;
      font-style: italic;
      z-index: 200;
      pointer-events: none;
      text-align: center;
      max-width: 80%;
      border-left: 3px solid ${item.isRadio ? '#44ff44' : '#FFD700'};
      transition: opacity 0.3s ease-in;
    `;
    sub.textContent = item.isRadio ? `📻 ${item.text}` : item.text;
    document.body.appendChild(sub);
    this.currentSubtitleElement = sub;

    // After duration, fade out then process next
    this.subtitleQueueTimer = setTimeout(() => {
      // Fade out current subtitle
      sub.style.opacity = '0';

      setTimeout(() => {
        if (this.currentSubtitleElement === sub) {
          sub.remove();
          this.currentSubtitleElement = null;
        }
        this.subtitleQueueActive = false;

        // Process next in queue after gap
        if (this.subtitleQueue.length > 0) {
          this.subtitleQueueTimer = setTimeout(() => {
            this.processSubtitleQueue();
          }, this.SUBTITLE_GAP_MS);
        }
      }, 300);
    }, item.duration);
  }

  // ============================================================
  // COD-STYLE HIT MARKER
  // ============================================================

  /**
   * Triggers the X-shaped hit marker animation at screen center.
   * @param isHeadshot - If true, the marker flashes RED instead of white.
   */
  public showHitMarker(isHeadshot: boolean): void {
    if (!this.hitMarker) return;

    // Remove existing classes to reset animation
    this.hitMarker.classList.remove('active', 'headshot');

    // Force browser reflow so removing then re-adding 'active' replays the animation
    void this.hitMarker.offsetHeight;

    // Apply classes
    if (isHeadshot) {
      this.hitMarker.classList.add('headshot');
    }
    this.hitMarker.classList.add('active');

    // Remove after animation completes (200ms)
    setTimeout(() => {
      this.hitMarker.classList.remove('active', 'headshot');
    }, 200);
  }

  // ============================================================
  // SNIPER SCOPE
  // ============================================================

  public showScope(visible: boolean): void {
    const vignette = document.getElementById('scope-vignette');
    const crosshair = document.getElementById('scope-crosshair');
    const hint = document.getElementById('scope-zoom-hint');
    const level = document.getElementById('scope-zoom-level');

    if (vignette) vignette.classList.toggle('active', visible);
    if (crosshair) crosshair.classList.toggle('active', visible);
    if (hint) hint.classList.toggle('active', visible);
    if (level) level.classList.toggle('active', visible);

    // Hide normal crosshair when scope is active
    const crosshairEl = document.getElementById('crosshair');
    if (crosshairEl) {
      crosshairEl.style.display = visible ? 'none' : 'block';
    }
  }

  public updateScopeZoom(zoom: number): void {
    const level = document.getElementById('scope-zoom-level');
    if (level) {
      level.textContent = `${zoom.toFixed(1)}x`;
    }
  }

  public updateBreathBar(holdTime: number, maxTime: number, isHolding: boolean, isSniperScoped: boolean): void {
    const hint = document.getElementById('breath-hint');
    const bar = document.getElementById('breath-bar');
    if (!hint || !bar) return;

    if (!isSniperScoped) {
      hint.classList.remove('active');
      return;
    }
    
    hint.classList.add('active');
    
    if (isHolding) {
      const remaining = holdTime / maxTime;
      bar.style.width = `${remaining * 100}%`;
      bar.style.background = remaining < 0.3 ? '#FF5252' : '#4FC3F7';
    } else if (holdTime >= maxTime) {
      bar.style.width = '100%';
      bar.style.background = '#4FC3F7';
    } else {
      const remaining = holdTime / maxTime;
      bar.style.width = `${remaining * 100}%`;
      bar.style.background = '#FFA726';
    }
  }

  // ============================================================
  // NIGHT VISION BATTERY
  // ============================================================

  public updateNVBattery(battery: number, isActive: boolean): void {
    const nvEl = document.getElementById('nv-battery');
    if (!nvEl) return;

    if (isActive) {
      nvEl.classList.add('active');
      const fill = nvEl.querySelector('.nv-fill') as HTMLElement;
      if (fill) {
        fill.style.width = `${battery}%`;
        fill.style.background = battery < 20 ? '#FF5252' : battery < 50 ? '#FFA726' : '#4FC3F7';
      }
      const text = nvEl.querySelector('.nv-text') as HTMLElement;
      if (text) text.textContent = `${battery.toFixed(0)}%`;
    } else {
      nvEl.classList.remove('active');
    }
  }

  // ============================================================
  // FLOATING XP POPUP
  // ============================================================

  /**
   * Spawns a floating XP text at the given screen coordinates that
   * drifts upward and fades out over 1.5 seconds.
   * @param text   - The text to display (e.g. '+100', 'HEADSHOT +150')
   * @param screenX - X position in CSS pixels from the left edge
   * @param screenY - Y position in CSS pixels from the top edge
   * @param isHeadshot - If true, uses red styling instead of gold
   */
  public addXPPopup(text: string, screenX: number, screenY: number, isHeadshot: boolean = false): void {
    const el = document.createElement('div');
    el.className = 'xp-popup' + (isHeadshot ? ' headshot-popup' : '');
    el.textContent = text;

    // Position so the text is centered horizontally on the screen point
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    el.style.transform = 'translate(-50%, -50%)';

    document.body.appendChild(el);

    // Remove after animation finishes (1.5s = 1500ms)
    setTimeout(() => {
      el.remove();
    }, 1500);
  }

  // ============================================================
  // KILL CONFIRM ICON (skull/X at center screen)
  // ============================================================

  /**
   * Flashes a skull icon at center screen for 300ms.
   * The skull appears with a scale-in pop and fades out.
   */
  public showKillConfirm(): void {
    if (!this.killConfirmIcon) return;

    // Remove existing class to reset animation
    this.killConfirmIcon.classList.remove('active');
    void this.killConfirmIcon.offsetHeight;

    // Activate animation
    this.killConfirmIcon.classList.add('active');

    // Remove after animation completes (300ms)
    setTimeout(() => {
      this.killConfirmIcon.classList.remove('active');
    }, 300);
  }

  // ============================================================
  // KILL STREAK NOTIFICATION
  // ============================================================

  /**
   * Shows a kill streak notification text at the top-center of the screen.
   * Different sizes and colors for different streak tiers:
   *   - 3 kills: "KILLSTREAK x3!" (gold, normal size)
   *   - 5 kills: "UNSTOPPABLE x5!" (orange, larger)
   *   - 7 kills: "RAMPAGE x7!" (red, large)
   *   - 10+ kills: "GODLIKE x10!" (purple, massive)
   * @param count - Current kill streak count
   */
  public showKillStreak(count: number): void {
    // Determine streak tier and text
    let text: string;
    let tierClass: string;

    if (count >= 10) {
      text = `⚡ GODLIKE x${count}! ⚡`;
      tierClass = 'tier-10';
    } else if (count >= 7) {
      text = `🔥 RAMPAGE x${count}! 🔥`;
      tierClass = 'tier-7';
    } else if (count >= 5) {
      text = `💀 UNSTOPPABLE x${count}! 💀`;
      tierClass = 'tier-5';
    } else {
      text = `⚔ KILLSTREAK x${count}! ⚔`;
      tierClass = 'tier-3';
    }

    const el = document.createElement('div');
    el.className = `kill-streak-notification ${tierClass}`;
    el.textContent = text;

    document.body.appendChild(el);

    // Remove after animation finishes (2s)
    setTimeout(() => {
      el.remove();
    }, 2000);
  }

  // ============================================================
  // FLOATING DAMAGE NUMBER
  // ============================================================

  /**
   * Spawns a floating damage number at the given screen coordinates.
   * The number drifts upward and fades out over 1 second.
   * @param text    - The damage text to display (e.g. '25', '150', 'CRITICAL')
   * @param screenX - X position in CSS pixels from the left edge
   * @param screenY - Y position in CSS pixels from the top edge
   * @param isCritical - If true, uses larger red styling
   * @param isKill     - If true, uses gold kill styling
   */
  public showDamageNumber(
    text: string,
    screenX: number,
    screenY: number,
    isCritical: boolean = false,
    isKill: boolean = false
  ): void {
    const el = document.createElement('div');
    el.className = 'damage-number';

    if (isKill) {
      el.classList.add('kill');
    } else if (isCritical) {
      el.classList.add('critical');
    }

    el.textContent = text;

    // Position with slight random X offset to prevent stacking
    const offsetX = (Math.random() - 0.5) * 20;
    el.style.left = `${screenX + offsetX}px`;
    el.style.top = `${screenY}px`;
    el.style.transform = 'translate(-50%, 0)';

    document.body.appendChild(el);

    // Remove after animation finishes (1s = 1000ms)
    setTimeout(() => {
      el.remove();
    }, 1000);
  }

  // ============================================================
  // DAMAGE VIGNETTE
  // ============================================================

  /**
   * Shows a screen-edge vignette flash.
   * @param color    - 'red' for damage, 'gold' for kill confirmation
   * @param duration - How long the flash lasts in ms (default 200)
   */
  public showDamageVignette(color: 'red' | 'gold' = 'red', duration: number = 200): void {
    if (!this.damageVignette) return;

    // Reset
    this.damageVignette.classList.remove('active', 'red', 'gold');
    void this.damageVignette.offsetHeight;

    // Set the color class
    this.damageVignette.classList.add(color);
    this.damageVignette.classList.add('active');

    setTimeout(() => {
      this.damageVignette.classList.remove('active');
    }, duration);
  }

  /**
   * Shows a gold vignette flash for kill confirmation (uses separate element
   * so it doesn't conflict with damage vignette).
   * @param duration - How long the flash lasts in ms (default 200)
   */
  public showGoldKillVignette(duration: number = 200): void {
    if (!this.goldVignette) return;

    this.goldVignette.classList.remove('active');
    void this.goldVignette.offsetHeight;

    this.goldVignette.classList.add('active');

    setTimeout(() => {
      this.goldVignette.classList.remove('active');
    }, duration);
  }

  // ============================================================
  // SCREEN SHAKE
  // ============================================================

  /**
   * Triggers a camera screen shake effect.
   * @param intensity - Shake intensity in pixels (1-10 recommended)
   * @param duration  - Shake duration in ms (default 150)
   */
  public triggerScreenShake(intensity: number, duration: number = 150): void {
    this.shakeActive = true;
    this.shakeIntensity = Math.min(10, Math.max(1, intensity));
    this.shakeStartTime = performance.now();
    this.shakeDuration = duration;
  }

  /**
   * Updates the screen shake effect. Call this every frame.
   * Returns the current offset {x, y} to apply to the canvas.
   */
  public updateScreenShake(): { x: number; y: number } {
    if (!this.shakeActive) return { x: 0, y: 0 };

    const elapsed = performance.now() - this.shakeStartTime;
    if (elapsed >= this.shakeDuration) {
      this.shakeActive = false;
      return { x: 0, y: 0 };
    }

    // Decay the intensity over the duration
    const t = 1 - elapsed / this.shakeDuration;
    const currentIntensity = this.shakeIntensity * t;

    const x = (Math.random() - 0.5) * 2 * currentIntensity;
    const y = (Math.random() - 0.5) * 2 * currentIntensity;

    return { x, y };
  }

  // ============================================================
  // LOW HEALTH VIGNETTE
  // ============================================================

  /**
   * Activates or deactivates the low-health pulsing vignette.
   * @param active - Whether the low health vignette should be shown
   */
  public showLowHealthVignette(active: boolean): void {
    if (!this.lowHealthVignette) return;

    if (active) {
      this.lowHealthVignette.classList.add('active');
    } else {
      this.lowHealthVignette.classList.remove('active');
    }
  }

  // ============================================================
  // FILM GRAIN EFFECT (red-tinted for critical HP)
  // ============================================================

  /**
   * Initializes the film grain canvas with a static noise pattern.
   */
  private initFilmGrain(): void {
    if (!this.filmGrainCanvas) return;

    // Set canvas to full viewport size
    this.filmGrainCanvas.width = 256;
    this.filmGrainCanvas.height = 256;

    this.filmGrainCtx = this.filmGrainCanvas.getContext('2d');
  }

  /**
   * Renders one frame of film grain noise onto the canvas.
   */
  private renderFilmGrainFrame(): void {
    if (!this.filmGrainCtx) return;

    const ctx = this.filmGrainCtx;
    const w = this.filmGrainCanvas.width;
    const h = this.filmGrainCanvas.height;

    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random() * 255;
      // Red-tinted grain
      data[i] = noise;           // R
      data[i + 1] = noise * 0.3; // G (suppressed)
      data[i + 2] = noise * 0.3; // B (suppressed)
      data[i + 3] = 60 + Math.random() * 40; // A (subtle)
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Animates the film grain by re-rendering noise at ~10fps.
   */
  private animateFilmGrain(): void {
    if (!this.filmGrainActive) return;

    this.renderFilmGrainFrame();
    this.filmGrainAnimFrame = setTimeout(() => {
      requestAnimationFrame(() => this.animateFilmGrain());
    }, 100) as unknown as number;
  }

  /**
   * Activates or deactivates the red-tinted film grain overlay.
   * Used when health drops below 10%.
   * @param active - Whether film grain should be shown
   */
  public showFilmGrain(active: boolean): void {
    if (!this.filmGrainCanvas) return;

    this.filmGrainActive = active;

    if (active) {
      this.filmGrainCanvas.classList.add('active');
      this.animateFilmGrain();
    } else {
      this.filmGrainCanvas.classList.remove('active');
      clearTimeout(this.filmGrainAnimFrame);
    }
  }

  // ============================================================
  // KILL STREAK TRACKING
  // ============================================================

  /**
   * Registers a kill and tracks the streak. Automatically resets
   * if more than KILL_STREAK_TIMEOUT ms have passed since last kill.
   * @returns The current consecutive kill count after this kill.
   */
  public registerKill(): number {
    const now = performance.now();

    if (now - this.lastKillTime > this.KILL_STREAK_TIMEOUT) {
      this.consecutiveKills = 0; // Reset streak
    }

    this.consecutiveKills++;
    this.lastKillTime = now;

    // Show streak notification at milestones: 3, 5, 7, 10, and every 5 after
    if (this.consecutiveKills >= 3) {
      if (
        this.consecutiveKills === 3 ||
        this.consecutiveKills === 5 ||
        this.consecutiveKills === 7 ||
        this.consecutiveKills === 10 ||
        (this.consecutiveKills > 10 && this.consecutiveKills % 5 === 0)
      ) {
        this.showKillStreak(this.consecutiveKills);
      }
    }

    return this.consecutiveKills;
  }

  /**
   * Returns the current kill streak count.
   */
  public getKillStreak(): number {
    return this.consecutiveKills;
  }

  /**
   * Resets the kill streak counter.
   */
  public resetKillStreak(): void {
    this.consecutiveKills = 0;
    this.lastKillTime = 0;
  }

  // ============================================================
  // CROSSHAIR SPREAD
  // ============================================================

  /**
   * Updates the crosshair spread based on player movement state.
   * When moving, the crosshair widens. When crouching/prone, it tightens.
   * When ADS, it contracts to minimal size for precision.
   *
   * @param isMoving    - Whether the player is currently moving
   * @param isCrouched  - Whether the player is crouching or prone
   * @param isADS       - Whether the player is aiming down sights
   */
  public updateCrosshairSpread(isMoving: boolean, isCrouched: boolean, isADS: boolean): void {
    if (!this.crosshair) return;

    // Base crosshair size (CSS width/height of the .crosshair element)
    let spreadSize: number;

    if (isADS) {
      // ADS: minimal spread — precision aiming
      spreadSize = 10;
    } else if (isCrouched) {
      // Crouched/prone: tight spread
      spreadSize = isMoving ? 16 : 14;
    } else {
      // Standing: normal spread, wider when moving
      spreadSize = isMoving ? 28 : 24;
    }

    this.crosshair.style.width = `${spreadSize}px`;
    this.crosshair.style.height = `${spreadSize}px`;
  }

  // ============================================================
  // TUTORIAL PROMPT — Approach/Action Prompts
  // ============================================================

  private promptElement: HTMLElement | null = null;

  /**
   * Shows a persistent tutorial prompt at the bottom-center of the screen.
   * Used for contextual action hints (e.g., "Approach from behind + F for silent kill").
   * @param text - The prompt text to display
   */
  public showPrompt(text: string): void {
    // Remove existing prompt if any
    this.hidePrompt();

    const el = document.createElement('div');
    el.id = 'game-prompt';
    el.style.cssText = `
      position: fixed;
      bottom: 22%;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.6rem 1.5rem;
      background: rgba(0, 0, 0, 0.75);
      color: #FFD700;
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      z-index: 200;
      pointer-events: none;
      text-align: center;
      border: 1px solid rgba(255, 215, 0, 0.4);
      border-radius: 4px;
      animation: fadeIn 0.3s ease-in;
    `;
    el.textContent = text;
    document.body.appendChild(el);
    this.promptElement = el;
  }

  /**
   * Hides the current tutorial prompt.
   */
  public hidePrompt(): void {
    if (this.promptElement) {
      this.promptElement.remove();
      this.promptElement = null;
    }
    const existing = document.getElementById('game-prompt');
    if (existing) existing.remove();
  }

  // ============================================================
  // EXTRACTION COUNTDOWN TIMER
  // ============================================================

  private countdownElement: HTMLElement | null = null;

  /**
   * Shows or updates the extraction countdown timer at the top-center.
   * @param seconds - Remaining seconds (floored to integer)
   */
  public showCountdownTimer(seconds: number): void {
    if (!this.countdownElement) {
      const el = document.createElement('div');
      el.id = 'countdown-timer';
      el.style.cssText = `
        position: fixed;
        top: 8%;
        left: 50%;
        transform: translateX(-50%);
        padding: 0.5rem 1.5rem;
        background: rgba(0, 0, 0, 0.7);
        color: #FFD700;
        font-size: 1.8rem;
        font-weight: 800;
        letter-spacing: 0.1em;
        z-index: 200;
        pointer-events: none;
        text-align: center;
        font-family: monospace;
        border: 1px solid rgba(255, 215, 0, 0.3);
      `;
      el.textContent = `⏰ ${Math.ceil(seconds)}`;
      document.body.appendChild(el);
      this.countdownElement = el;
    }

    const remaining = Math.ceil(seconds);
    this.countdownElement.textContent = `⏰ ${remaining}s`;

    // Color warning states
    if (remaining <= 10) {
      this.countdownElement.style.color = '#e74c3c';
      this.countdownElement.style.textShadow = '0 0 10px #e74c3c';
    } else if (remaining <= 30) {
      this.countdownElement.style.color = '#f39c12';
      this.countdownElement.style.textShadow = '0 0 8px #f39c12';
    } else {
      this.countdownElement.style.color = '#FFD700';
      this.countdownElement.style.textShadow = 'none';
    }
  }

  /**
   * Hides the countdown timer.
   */
  public hideCountdownTimer(): void {
    if (this.countdownElement) {
      this.countdownElement.remove();
      this.countdownElement = null;
    }
  }

  // ============================================================
  // RED SCREEN FLASH — Alarm / Alert Visual
  // ============================================================

  /**
   * Brief full-screen red flash for alarm triggers and alerts.
   * @param duration - Flash duration in ms (default 300)
   */
  public flashScreenRed(duration: number = 300): void {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(255, 0, 0, 0.35);
      z-index: 250;
      pointer-events: none;
      animation: fadeIn 0.05s ease-in;
    `;
    document.body.appendChild(flash);

    setTimeout(() => {
      flash.style.opacity = '0';
      flash.style.transition = `opacity ${duration}ms ease-out`;
      setTimeout(() => flash.remove(), duration);
    }, 50);
  }

  // ============================================================
  // RADIO SUBTITLE — now uses the queue system (see above)
  // ============================================================

  // ============================================================
  // MISSION COMPLETE OVERLAY
  // ============================================================

  /**
   * Shows a full-screen MISSION COMPLETE overlay with score.
   * @param title - Mission title (e.g. "Protocol 313")
   * @param subtitle - Mission outcome text
   * @param score - Final score to display
   */
  public showMissionCompleteOverlay(title: string, subtitle: string, score: number): void {
    const overlay = document.createElement('div');
    overlay.id = 'scripted-mission-complete';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.75);
      z-index: 1000;
      pointer-events: none;
      animation: fadeIn 0.8s ease-in;
    `;
    overlay.innerHTML = `
      <div style="
        font-size: 56px; color: #ffd700; font-weight: 900;
        text-shadow: 0 0 30px #ffd700, 0 0 60px rgba(255,215,0,0.5);
        letter-spacing: 0.15em;
        font-family: 'Courier New', monospace;
      ">MISSION COMPLETE</div>
      <div style="
        font-size: 28px; color: #ffffff; margin-top: 12px;
        font-weight: 700;
        letter-spacing: 0.1em;
      ">${title}</div>
      <div style="
        font-size: 18px; color: #aaaaaa; margin-top: 8px;
        font-style: italic;
      ">${subtitle}</div>
      <div style="
        font-size: 36px; color: #FFD700; margin-top: 24px;
        font-weight: 800;
        text-shadow: 0 0 15px #FFD700;
      ">SCORE: ${score.toLocaleString()}</div>
      <div style="
        font-size: 14px; color: #666; margin-top: 32px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      ">Protocol 313 — Call of Deity</div>
    `;
    document.body.appendChild(overlay);

    // Fade out after 8 seconds
    setTimeout(() => {
      overlay.style.transition = 'opacity 2s ease-out';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 2000);
    }, 8000);
  }

  // ============================================================
  // SCREEN FLASH — Generic colored flash (used for alarm red, etc.)
  // ============================================================

  /**
   * Full-screen colored overlay that fades out.
   * @param color - CSS color string
   * @param opacity - Max opacity (0-1)
   * @param duration - Fade-out duration in ms
   */
  public flashScreen(color: string, opacity: number, duration: number): void {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: ${color};
      opacity: ${opacity};
      z-index: 250;
      pointer-events: none;
    `;
    document.body.appendChild(flash);

    requestAnimationFrame(() => {
      flash.style.transition = `opacity ${duration}ms ease-out`;
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), duration);
    });
  }

  // ============================================================
  // WEAPON SLOT HUD — Compact Horizontal (bottom-right)
  // ============================================================

  /**
   * Updates the weapon slot indicators in the bottom-right.
   * Highlights the active slot with gold border and brighter background.
   *
   * @param weapons - Array of weapon info from WeaponSystem.getAllWeapons()
   * @param activeSlot - The currently active slot number (1-4)
   */
  public updateWeaponSlots(weapons: WeaponSlotInfo[], activeSlot: number): void {
    for (let i = 1; i <= 4; i++) {
      const slotEl = document.getElementById(`wslot-${i}`);
      if (!slotEl) continue;

      const weapon = weapons.find(w => w.slot === i);
      const isActive = i === activeSlot;

      // Update slot content with icon and name
      if (weapon) {
        const numEl = slotEl.querySelector('.slot-num');
        const iconEl = slotEl.querySelector('.slot-icon');
        const nameEl = slotEl.querySelector('.slot-name');
        if (numEl) numEl.textContent = `${i}`;
        if (iconEl) iconEl.textContent = weapon.icon || '';
        if (nameEl) nameEl.textContent = weapon.name || '';
      }

      // Apply active/inactive styles
      if (isActive) {
        slotEl.classList.add('active-slot');
      } else {
        slotEl.classList.remove('active-slot');
      }
    }
  }

  // ============================================================
  // DOWNEC WARNING
  // ============================================================

  /**
   * Shows or hides the downed teammate warning with countdown timer.
   * @param visible - Whether to show the warning
   * @param timer - Seconds remaining on the rescue timer
   */
  public showDownedWarning(visible: boolean, timer: number = 0): void {
    if (!this.downedWarning) return;

    if (visible) {
      this.downedWarning.classList.add('visible');
      this.downedTimer.textContent = Math.ceil(Math.max(0, timer)).toString();

      // Color the timer based on urgency
      if (timer <= 15) {
        this.downedTimer.style.color = '#ff0000';
        this.downedTimer.style.textShadow = '0 0 15px rgba(255,0,0,0.9)';
      } else if (timer <= 30) {
        this.downedTimer.style.color = '#ff4444';
        this.downedTimer.style.textShadow = '0 0 12px rgba(255,68,68,0.7)';
      } else {
        this.downedTimer.style.color = '#ff6666';
        this.downedTimer.style.textShadow = '0 0 10px rgba(255,102,102,0.5)';
      }
    } else {
      this.downedWarning.classList.remove('visible');
    }
  }

  // ============================================================
  // RESCUE PROGRESS BAR
  // ============================================================

  /**
   * Shows or updates the rescue progress bar.
   * @param visible - Whether to show the progress bar
   * @param progress - Progress from 0 to 1
   */
  public updateRescueProgress(visible: boolean, progress: number = 0): void {
    if (!this.rescueProgress) return;

    if (visible) {
      this.rescueProgress.classList.add('visible');
      this.rescueProgressFill.style.width = `${Math.min(100, progress * 100)}%`;
    } else {
      this.rescueProgress.classList.remove('visible');
      this.rescueProgressFill.style.width = '0%';
    }
  }

  // ============================================================
  // TACTICAL COMMAND WHEEL
  // ============================================================

  /**
   * Shows or hides the tactical command wheel overlay.
   * @param open - Whether the command wheel should be shown
   */
  public showCommandWheel(open: boolean, inactiveName: string = 'FALCON'): void {
    const overlay = document.getElementById('command-wheel-overlay');
    if (!overlay) return;

    if (open) {
      // Update all character references
      const nameEl = overlay.querySelector('.cmd-char-name');
      if (nameEl) nameEl.textContent = inactiveName;
      
      const takeoverNameEl = overlay.querySelector('.cmd-takeover-name');
      if (takeoverNameEl) takeoverNameEl.textContent = inactiveName;
      
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
    }
  }

  // ============================================================
  // STANCE INDICATOR
  // ============================================================

  public updateStanceIndicator(isCrouching: boolean, isProne: boolean): void {
    const el = document.getElementById('stance-indicator');
    if (!el) return;

    el.classList.remove('standing', 'crouching', 'prone');
    if (isProne) {
      el.textContent = 'PRONE';
      el.classList.add('prone');
    } else if (isCrouching) {
      el.textContent = 'CROUCHING';
      el.classList.add('crouching');
    } else {
      el.textContent = 'STANDING';
      el.classList.add('standing');
    }
  }

  // ============================================================
  // LEAN INDICATOR
  // ============================================================

  public updateLeanIndicator(direction: 'left' | 'right' | 'none'): void {
    const indicator = document.getElementById('lean-indicator');
    if (!indicator) return;

    indicator.classList.remove('active', 'left', 'right');

    if (direction === 'left') {
      indicator.classList.add('active', 'left');
      indicator.textContent = '◄';
    } else if (direction === 'right') {
      indicator.classList.add('active', 'right');
      indicator.textContent = '►';
    }
    // 'none' = hidden (default)
  }

  // ============================================================
  // RELOAD INDICATOR
  // ============================================================

  private reloadIndicator: HTMLElement | null = null;
  private reloadText: HTMLElement | null = null;
  private reloadProgressBar: HTMLElement | null = null;
  private reloadProgressFill: HTMLElement | null = null;

  /**
   * Create the reload indicator DOM elements dynamically.
   * Called once on first show. Styles are inline to avoid needing HTML changes.
   */
  private ensureReloadElements(): void {
    if (this.reloadIndicator) return;

    // Outer container — centred below crosshair
    this.reloadIndicator = document.createElement('div');
    this.reloadIndicator.id = 'reload-indicator';
    this.reloadIndicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, 30px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      pointer-events: none;
      z-index: 100;
      opacity: 0;
      transition: opacity 0.15s ease;
    `;

    // "RELOADING..." text
    this.reloadText = document.createElement('div');
    this.reloadText.textContent = 'RELOADING...';
    this.reloadText.style.cssText = `
      color: #e0d4b8;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 2px;
      text-shadow: 0 0 6px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.9);
      white-space: nowrap;
    `;
    this.reloadIndicator.appendChild(this.reloadText);

    // Progress bar track
    this.reloadProgressBar = document.createElement('div');
    this.reloadProgressBar.style.cssText = `
      width: 100px;
      height: 3px;
      background: rgba(255,255,255,0.15);
      border-radius: 2px;
      overflow: hidden;
    `;

    // Progress bar fill
    this.reloadProgressFill = document.createElement('div');
    this.reloadProgressFill.style.cssText = `
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #c0a060, #e0d0a0);
      border-radius: 2px;
      transition: width 0.05s linear;
    `;
    this.reloadProgressBar.appendChild(this.reloadProgressFill);
    this.reloadIndicator.appendChild(this.reloadProgressBar);

    // Crosshair reload ring (replaces crosshair during reload)
    const reloadCrosshair = document.createElement('div');
    reloadCrosshair.id = 'reload-crosshair';
    reloadCrosshair.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      border: 2px solid rgba(224, 208, 160, 0.7);
      border-radius: 50%;
      border-top-color: transparent;
      animation: reload-spin 0.8s linear infinite;
      pointer-events: none;
      z-index: 99;
    `;

    // Inject keyframes if not already present
    if (!document.getElementById('reload-spin-keyframes')) {
      const style = document.createElement('style');
      style.id = 'reload-spin-keyframes';
      style.textContent = `
        @keyframes reload-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(reloadCrosshair);
    document.body.appendChild(this.reloadIndicator);
  }

  /**
   * Show the reload indicator HUD element.
   */
  public showReloadIndicator(): void {
    this.ensureReloadElements();
    if (this.reloadIndicator) {
      this.reloadIndicator.style.opacity = '1';
    }
    // Show spinning crosshair ring
    const rc = document.getElementById('reload-crosshair');
    if (rc) rc.style.display = 'block';
    // Hide normal crosshair during reload
    if (this.crosshair) this.crosshair.style.display = 'none';
  }

  /**
   * Update the reload progress bar and text.
   * @param progress 0–1 (0 = just started, 1 = done)
   */
  public updateReloadProgress(progress: number): void {
    if (this.reloadProgressFill) {
      this.reloadProgressFill.style.width = `${Math.min(progress, 1) * 100}%`;
    }
  }

  /**
   * Hide the reload indicator HUD element.
   */
  public hideReloadIndicator(): void {
    if (this.reloadIndicator) {
      this.reloadIndicator.style.opacity = '0';
    }
    // Hide spinning crosshair ring
    const rc = document.getElementById('reload-crosshair');
    if (rc) rc.style.display = 'none';
    // Restore normal crosshair
    if (this.crosshair) this.crosshair.style.display = '';
  }

  // ============================================================
  // DEBUG PANEL
  // ============================================================

  public updateDebug(
    playerPos: { x: number; y: number; z: number },
    hp: number,
    aliveEnemies: number,
    stuckCount: number,
    tracerCount: number
  ): void {
    const posEl = document.getElementById('dbg-pos');
    const hpEl = document.getElementById('dbg-hp');
    const enemiesEl = document.getElementById('dbg-enemies');
    const stuckEl = document.getElementById('dbg-stuck');
    const tracersEl = document.getElementById('dbg-tracers');

    if (posEl) posEl.textContent = `${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}, ${playerPos.z.toFixed(1)}`;
    if (hpEl) hpEl.textContent = `${hp}`;
    if (enemiesEl) enemiesEl.textContent = `${aliveEnemies} alive`;
    if (stuckEl) stuckEl.textContent = `${stuckCount}`;
    if (tracersEl) tracersEl.textContent = `${tracerCount}`;
  }
}
