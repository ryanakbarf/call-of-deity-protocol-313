/**
 * AudioManager.ts — Complete Dynamic Music System
 *
 * Procedurally generates ALL game sounds + dynamic adaptive music using
 * Web Audio API oscillators, noise buffers, and composite techniques.
 *
 * MUSIC ZONES:
 *   Zone 1 (Stealth)   — Low sine 80Hz drone + sparse percussion every ~3s
 *   Zone 2-3 (Combat)  — 140 BPM bass pulse + noise layers + escalation
 *   Phase 4 (Wave)     — Aggressive rhythm + rising intensity per wave
 *   Phase 5 (Extract)  — Fast-paced urgency + rising pitch + countdown beeps
 *
 * All music crossfades smoothly (2s), stays very quiet (0.03-0.06),
 * and uses Web Audio API oscillators + noise buffers exclusively.
 *
 * No external audio files required — every sound is synthesized at runtime.
 */

export type WeaponName = 'zulfiqar-47' | 'shahin-sr' | 'makara-9' | 'qasim-17';
export type FootstepSurface = 'sand' | 'concrete' | 'metal';
export type MusicZone = 'none' | 'stealth' | 'combat' | 'wave' | 'extraction';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterVolume: number = 0.7;
  private sfxVolume: number = 0.7;
  private musicVolume: number = 0.5;

  // Pre-generated noise buffers (created once on init)
  private noiseBufferShort: AudioBuffer | null = null;   // 0.1s
  private noiseBufferMedium: AudioBuffer | null = null;   // 0.5s
  private noiseBufferLong: AudioBuffer | null = null;     // 1.0s

  // Ambient wind nodes — kept alive for the loop
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windRunning: boolean = false;

  // ============================================================
  // DYNAMIC MUSIC SYSTEM — State Machine
  // ============================================================

  private musicState: MusicZone = 'none';
  private musicCrossfadeTime: number = 2.0;

  // Shared master music gain — all music routes through this
  private musicMasterGain: GainNode | null = null;

  // ---- STEALTH ----
  private stealthNodes: AudioNode[] = [];
  private stealthTimers: ReturnType<typeof setTimeout>[] = [];
  private stealthRunning: boolean = false;

  // ---- COMBAT ----
  private combatNodes: AudioNode[] = [];
  private combatOscillators: OscillatorNode[] = [];
  private combatTimers: ReturnType<typeof setTimeout>[] = [];
  private combatRunning: boolean = false;
  private combatEscalation: number = 0; // 0-1, increases over time

  // ---- WAVE ----
  private waveNodes: AudioNode[] = [];
  private waveOscillators: OscillatorNode[] = [];
  private waveTimers: ReturnType<typeof setTimeout>[] = [];
  private waveRunning: boolean = false;
  private waveNumber: number = 1;
  private waveIntensity: number = 0.5;

  // ---- EXTRACTION ----
  private extractionNodes: AudioNode[] = [];
  private extractionOscillators: OscillatorNode[] = [];
  private extractionTimers: ReturnType<typeof setTimeout>[] = [];
  private extractionRunning: boolean = false;
  private extractionRisingOsc: OscillatorNode | null = null;
  private extractionRisingGain: GainNode | null = null;
  private extractionCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private extractionTimeRemaining: number = 60; // seconds
  private extractionTotalTime: number = 60;

  constructor() {
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  private initAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.preGenerateNoiseBuffers();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  // ============================================================
  // NOISE BUFFER GENERATION
  // ============================================================

  private createNoiseBuffer(duration: number, sampleRate: number = 44100): AudioBuffer {
    const ctx = this.audioContext!;
    const length = Math.floor(duration * sampleRate);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private preGenerateNoiseBuffers(): void {
    this.noiseBufferShort = this.createNoiseBuffer(0.1);
    this.noiseBufferMedium = this.createNoiseBuffer(0.5);
    this.noiseBufferLong = this.createNoiseBuffer(1.0);
  }

  private getNoiseBuffer(duration: number): AudioBuffer {
    this.initAudioContext();
    if (duration <= 0.1 && this.noiseBufferShort) return this.noiseBufferShort;
    if (duration <= 0.5 && this.noiseBufferMedium) return this.noiseBufferMedium;
    if (duration <= 1.0 && this.noiseBufferLong) return this.noiseBufferLong;
    return this.createNoiseBuffer(duration);
  }

  // ============================================================
  // CORE SOUND PLAYBACK
  // ============================================================

  public playSound(frequency: number, duration: number, type: OscillatorType = 'sine'): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    const volume = this.masterVolume * this.sfxVolume * 0.3;
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  private playFilteredNoise(
    duration: number,
    filterFreq: number,
    filterType: BiquadFilterType = 'bandpass',
    gain: number = 0.3,
    attack: number = 0.001,
    decay: number = 0.05
  ): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const noiseBuffer = this.getNoiseBuffer(duration + decay);

    const source = this.audioContext.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = this.audioContext.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.0;

    const gainNode = this.audioContext.createGain();
    const finalGain = this.masterVolume * this.sfxVolume * gain;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(finalGain, now + attack);
    gainNode.gain.setValueAtTime(finalGain, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration + decay);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    source.start(now);
    source.stop(now + duration + decay + 0.01);
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain: number = 0.3,
    attack: number = 0.001,
    decay: number = 0.05
  ): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    osc.type = type;
    osc.frequency.value = frequency;

    const finalGain = this.masterVolume * this.sfxVolume * gain;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(finalGain, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration + decay);

    osc.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    osc.start(now);
    osc.stop(now + duration + decay + 0.01);
  }

  // ============================================================
  // GUNSHOT SYSTEM — Layered Military Sounds
  // ============================================================

  public playGunshot(isSuppressed: boolean, weaponName?: string): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const volMult = isSuppressed ? 0.4 : 1.0;
    const weapon = weaponName?.toLowerCase().replace(/\s+/g, '-') || 'zulfiqar-47';

    if (weapon.includes('shahin') || weapon.includes('sr') || weapon.includes('sniper')) {
      this.playSniperShot(volMult, isSuppressed);
    } else if (weapon.includes('makara') || weapon.includes('pistol') || weapon.includes('9')) {
      this.playPistolShot(volMult, isSuppressed);
    } else if (weapon.includes('qasim') || weapon.includes('17')) {
      this.playPistolShot(volMult * 0.9, isSuppressed);
    } else {
      this.playAssaultRifleShot(volMult, isSuppressed);
    }
  }

  private playAssaultRifleShot(volMult: number, isSuppressed: boolean): void {
    const filterShift = isSuppressed ? 0.4 : 1.0;
    this.playFilteredNoise(0.05, 2000 * filterShift, 'bandpass', 0.5 * volMult, 0.0005, 0.02);
    this.playTone(80, 0.1, 'sine', 0.4 * volMult, 0.001, 0.06);
    this.playTone(4000, 0.03, 'sine', 0.15 * volMult, 0.0005, 0.01);
    if (isSuppressed) {
      this.playFilteredNoise(0.08, 800, 'lowpass', 0.15, 0.001, 0.04);
    }
  }

  private playSniperShot(volMult: number, isSuppressed: boolean): void {
    const filterShift = isSuppressed ? 0.35 : 1.0;
    this.playFilteredNoise(0.08, 3000 * filterShift, 'bandpass', 0.7 * volMult, 0.0003, 0.03);
    this.playTone(50, 0.2, 'sine', 0.6 * volMult, 0.001, 0.15);
    this.playFilteredNoise(0.3, 1000 * filterShift, 'bandpass', 0.1 * volMult, 0.01, 0.25);
    this.playTone(30, 0.15, 'sine', 0.3 * volMult, 0.002, 0.1);
    if (isSuppressed) {
      this.playFilteredNoise(0.12, 600, 'lowpass', 0.12, 0.001, 0.06);
    }
  }

  private playPistolShot(volMult: number, isSuppressed: boolean): void {
    const filterShift = isSuppressed ? 0.5 : 1.0;
    this.playFilteredNoise(0.03, 2500 * filterShift, 'bandpass', 0.4 * volMult, 0.0003, 0.01);
    this.playTone(600, 0.02, 'sine', 0.25 * volMult, 0.0003, 0.008);
    this.playTone(120, 0.06, 'sine', 0.2 * volMult, 0.001, 0.03);
    if (isSuppressed) {
      this.playFilteredNoise(0.05, 1200, 'lowpass', 0.12, 0.001, 0.02);
    }
  }

  // ============================================================
  // EXPLOSION SYSTEM
  // ============================================================

  public playExplosion(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    this.playTone(30, 0.4, 'sine', 0.8, 0.001, 0.3);
    this.playFilteredNoise(0.3, 500, 'bandpass', 0.6, 0.0005, 0.2);

    const debrisPitches = [2000, 3500, 1200, 4500, 800];
    const debrisDelays = [0, 0.03, 0.06, 0.09, 0.12];
    const debrisGains = [0.15, 0.12, 0.1, 0.08, 0.06];

    for (let i = 0; i < debrisPitches.length; i++) {
      setTimeout(() => {
        this.playFilteredNoise(
          0.15 + Math.random() * 0.1,
          debrisPitches[i],
          'bandpass',
          debrisGains[i],
          0.001,
          0.1 + Math.random() * 0.15
        );
      }, debrisDelays[i] * 1000);
    }

    this.playTone(25, 0.6, 'sine', 0.25, 0.05, 0.4);
  }

  // ============================================================
  // FOOTSTEP SYSTEM
  // ============================================================

  public playFootstep(surface: FootstepSurface = 'sand'): void {
    this.playFootstepWithStance(surface, 'stand');
  }

  public playFootstepWithStance(surface: FootstepSurface = 'sand', stance: 'stand' | 'crouch' | 'prone' = 'stand'): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const stanceMultiplier = stance === 'prone' ? 0.15 : stance === 'crouch' ? 0.2 : 1.0;

    switch (surface) {
      case 'sand':
        this.playFilteredNoise(0.06, 3000, 'highpass', 0.08 * stanceMultiplier, 0.001, 0.04);
        this.playTone(100, 0.04, 'sine', 0.06 * stanceMultiplier, 0.001, 0.03);
        break;
      case 'concrete':
        this.playFilteredNoise(0.04, 1500, 'bandpass', 0.1 * stanceMultiplier, 0.0005, 0.025);
        this.playTone(800, 0.02, 'sine', 0.06 * stanceMultiplier, 0.0003, 0.01);
        break;
      case 'metal':
        this.playFilteredNoise(0.05, 2000, 'bandpass', 0.07 * stanceMultiplier, 0.0005, 0.03);
        this.playTone(2000, 0.08, 'sine', 0.05 * stanceMultiplier, 0.0003, 0.06);
        this.playTone(4000, 0.04, 'sine', 0.025 * stanceMultiplier, 0.001, 0.03);
        break;
    }
  }

  // ============================================================
  // BULLET WHIZ
  // ============================================================

  public playBulletWhiz(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const duration = 0.1;

    const osc = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(3000, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + duration);

    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 2.0;

    const vol = this.masterVolume * this.sfxVolume * 0.2;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(vol, now + 0.01);
    gainNode.gain.setValueAtTime(vol, now + 0.06);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  // ============================================================
  // HIT & KILL CONFIRMATION
  // ============================================================

  public playHitConfirm(): void {
    this.playTone(800, 0.03, 'sine', 0.2, 0.0003, 0.01);
  }

  public playKillConfirm(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const vol = this.masterVolume * this.sfxVolume * 0.25;

    const osc1 = this.audioContext.createOscillator();
    const gain1 = this.audioContext.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 600;
    gain1.gain.setValueAtTime(vol, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc1.connect(gain1);
    gain1.connect(this.audioContext.destination);
    osc1.start(now);
    osc1.stop(now + 0.06);

    const osc2 = this.audioContext.createOscillator();
    const gain2 = this.audioContext.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 900;
    gain2.gain.setValueAtTime(0, now + 0.05);
    gain2.gain.linearRampToValueAtTime(vol, now + 0.055);
    gain2.gain.setValueAtTime(vol, now + 0.055);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc2.connect(gain2);
    gain2.connect(this.audioContext.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.11);
  }

  // ============================================================
  // WALL IMPACT
  // ============================================================

  public playWallImpact(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const vol = this.masterVolume * this.sfxVolume * 0.3;
    this.playFilteredNoise(0.03, 2000, 'bandpass', vol * 0.8, 0, 0.5);

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.value = 100;
    gain.gain.setValueAtTime(vol * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // ============================================================
  // AMBIENT WIND
  // ============================================================

  public startAmbientWind(): void {
    this.initAudioContext();
    if (!this.audioContext || this.windRunning) return;

    const now = this.audioContext.currentTime;
    const windBuffer = this.createNoiseBuffer(10.0);

    const source = this.audioContext.createBufferSource();
    source.buffer = windBuffer;
    source.loop = true;

    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.5;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = this.masterVolume * 0.04;

    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(gainNode.gain);
    lfo.start(now);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    source.start(now);

    this.windSource = source;
    this.windGain = gainNode;
    this.windFilter = filter;
    this.windRunning = true;
  }

  public stopAmbientWind(): void {
    if (this.windSource) {
      try { this.windSource.stop(); } catch (e) { /* already stopped */ }
      this.windSource = null;
      this.windGain = null;
      this.windFilter = null;
      this.windRunning = false;
    }
  }

  public pauseAmbientWind(): void {
    if (this.windGain) {
      this.windGain.gain.value = 0;
    }
  }

  public resumeAmbientWind(): void {
    if (this.windGain) {
      this.windGain.gain.value = this.masterVolume * 0.04;
    }
  }

  public pauseAll(): void {
    this.pauseAmbientWind();
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend();
    }
  }

  public resumeAll(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.resumeAmbientWind();
  }

  // ============================================================
  // DYNAMIC MUSIC SYSTEM — Shared Infrastructure
  // ============================================================

  private ensureMusicMasterGain(): GainNode {
    if (!this.audioContext) throw new Error('AudioContext not initialized');
    if (!this.musicMasterGain) {
      this.musicMasterGain = this.audioContext.createGain();
      this.musicMasterGain.gain.value = 0;
      this.musicMasterGain.connect(this.audioContext.destination);
    }
    return this.musicMasterGain;
  }

  private crossfadeMasterGain(targetVolume: number): void {
    if (!this.audioContext || !this.musicMasterGain) return;
    const now = this.audioContext.currentTime;
    const vol = targetVolume * this.masterVolume * this.musicVolume;
    this.musicMasterGain.gain.cancelScheduledValues(now);
    this.musicMasterGain.gain.setValueAtTime(this.musicMasterGain.gain.value, now);
    this.musicMasterGain.gain.linearRampToValueAtTime(vol, now + this.musicCrossfadeTime);
  }

  private createMusicNoiseLoop(
    duration: number,
    filterFreq: number,
    filterType: BiquadFilterType = 'bandpass',
    q: number = 0.5,
    gainValue: number = 0.05
  ): { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; nodes: AudioNode[] } {
    this.initAudioContext();
    if (!this.audioContext) throw new Error('AudioContext not initialized');

    const buffer = this.createNoiseBuffer(duration);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.audioContext.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = q;

    const gain = this.audioContext.createGain();
    gain.gain.value = gainValue;

    const masterGain = this.ensureMusicMasterGain();

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    return { source, gain, filter, nodes: [source, filter, gain] };
  }

  private createMusicOscillator(
    frequency: number,
    type: OscillatorType = 'sine',
    gainValue: number = 0.04
  ): { osc: OscillatorNode; gain: GainNode; nodes: AudioNode[] } {
    this.initAudioContext();
    if (!this.audioContext) throw new Error('AudioContext not initialized');

    const osc = this.audioContext.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;

    const gain = this.audioContext.createGain();
    gain.gain.value = gainValue;

    const masterGain = this.ensureMusicMasterGain();
    osc.connect(gain);
    gain.connect(masterGain);

    return { osc, gain, nodes: [osc, gain] };
  }

  // ============================================================
  // ZONE 1: STEALTH MUSIC — Low Tension + Sparse Percussion
  // ============================================================
  //
  // Creates tension without being intrusive:
  //   Layer 1: Pure sine 80Hz drone — deep, menacing hum
  //   Layer 2: Filtered noise texture at 120Hz — organic warmth
  //   Layer 3: Sparse percussion hits every ~3 seconds — tension punctuation
  //

  public startStealthMusic(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    if (this.musicState === 'stealth' && this.stealthRunning) return;

    if (this.musicState !== 'none') {
      this.fadeOutCurrentMusic();
    }

    this.musicState = 'stealth';
    this.stealthRunning = true;

    // ---- Layer 1: Pure sine 80Hz drone ----
    // The core tension element — a deep, barely audible hum
    const droneOsc = this.audioContext.createOscillator();
    droneOsc.type = 'sine';
    droneOsc.frequency.value = 80; // 80Hz — felt more than heard

    const droneGain = this.audioContext.createGain();
    droneGain.gain.value = 0; // start silent, fade in

    const masterGain = this.ensureMusicMasterGain();
    droneOsc.connect(droneGain);
    droneGain.connect(masterGain);

    const now = this.audioContext.currentTime;
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(0.04, now + 3.0); // very quiet fade-in

    // Subtle frequency drift — makes it feel alive
    droneOsc.frequency.setValueAtTime(80, now);
    droneOsc.frequency.linearRampToValueAtTime(82, now + 8);
    droneOsc.frequency.linearRampToValueAtTime(78, now + 16);
    droneOsc.frequency.linearRampToValueAtTime(80, now + 24);

    droneOsc.start(now);
    this.stealthOscillators.push(droneOsc);
    this.stealthNodes.push(droneGain);

    // ---- Layer 2: Filtered noise texture at 120Hz ----
    // Adds organic warmth to the pure sine, prevents it from feeling sterile
    const noiseTexture = this.createMusicNoiseLoop(
      10.0,     // 10 second loop
      120,      // 120Hz — just above the sine drone
      'bandpass',
      0.4,      // moderate Q
      0.015     // very quiet — just texture
    );
    noiseTexture.source.start();
    this.stealthNodes.push(...noiseTexture.nodes);

    // ---- Layer 3: Sparse percussion hits every ~3 seconds ----
    // Short, muted thuds that punctuate the silence with tension
    const percussionLoop = () => {
      if (!this.stealthRunning || !this.audioContext) return;
      const percNow = this.audioContext.currentTime;

      // Low muted thud — bandpass noise at 200Hz
      const buffer = this.getNoiseBuffer(0.12);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;

      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 200;
      filter.Q.value = 1.5;

      const gain = this.audioContext.createGain();
      const vol = this.masterVolume * this.musicVolume * 0.03;
      gain.gain.setValueAtTime(vol, percNow);
      gain.gain.exponentialRampToValueAtTime(0.001, percNow + 0.12);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(percNow);
      source.stop(percNow + 0.15);

      // Occasional secondary high click — adds variety (every 3rd hit)
      if (Math.random() < 0.33) {
        const clickOsc = this.audioContext.createOscillator();
        const clickGain = this.audioContext.createGain();
        clickOsc.type = 'sine';
        clickOsc.frequency.value = 600 + Math.random() * 200;

        clickGain.gain.setValueAtTime(vol * 0.5, percNow + 0.05);
        clickGain.gain.exponentialRampToValueAtTime(0.001, percNow + 0.1);

        clickOsc.connect(clickGain);
        clickGain.connect(masterGain);
        clickOsc.start(percNow + 0.05);
        clickOsc.stop(percNow + 0.12);
      }

      // Next hit in 2.5-3.5 seconds — irregular for organic feel
      const nextDelay = 2500 + Math.random() * 1000;
      const timerId = setTimeout(percussionLoop, nextDelay);
      this.stealthTimers.push(timerId);
    };

    // Start percussion after a short delay
    const startTimer = setTimeout(percussionLoop, 1500);
    this.stealthTimers.push(startTimer);

    // Crossfade in
    this.crossfadeMasterGain(1.0);

    console.log('[AudioManager] Stealth music — sine 80Hz drone + sparse percussion');
  }

  // ============================================================
  // ZONE 2-3: COMBAT MUSIC — 140 BPM Pulse + Noise Layers
  // ============================================================
  //
  // Faster tempo feel with escalation:
  //   Layer 1: Bass pulse at 80Hz — every beat, 4/4 pattern
  //   Layer 2: Noise layer — snare/hi-hat on off-beats
  //   Layer 3: Mid-frequency drone — sustained urgency
  //   Layer 4: Escalation layer — grows over time, adds intensity
  //

  public startCombatMusic(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    if (this.musicState === 'combat' && this.combatRunning) return;

    if (this.musicState !== 'none') {
      this.fadeOutCurrentMusic();
    }

    this.musicState = 'combat';
    this.combatRunning = true;
    this.combatEscalation = 0;

    const bpm = 140;
    const beatInterval = 60 / bpm; // ~0.4286 seconds per beat
    const masterGain = this.ensureMusicMasterGain();
    const now = this.audioContext.currentTime;

    // ---- Layer 1: Bass pulse at 80Hz — every beat ----
    // The driving force of combat music
    const pulseOsc = this.audioContext.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = 80;

    const pulseGain = this.audioContext.createGain();
    pulseGain.gain.value = 0;

    pulseOsc.connect(pulseGain);
    pulseGain.connect(masterGain);

    // Pre-schedule 128 beats (~36 seconds at 140 BPM)
    const totalBeats = 128;
    const vol = this.masterVolume * this.musicVolume * 0.05;

    for (let i = 0; i < totalBeats; i++) {
      const beatTime = now + i * beatInterval;
      // 4/4 groove: beats 1 and 3 accented, 2 and 4 softer
      const accent = (i % 4 === 0 || i % 4 === 2) ? 1.0 : 0.5;
      pulseGain.gain.setValueAtTime(0, beatTime);
      pulseGain.gain.linearRampToValueAtTime(vol * accent, beatTime + 0.01);
      pulseGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.12);
    }

    pulseOsc.start(now);
    this.combatOscillators.push(pulseOsc);
    this.combatNodes.push(pulseGain);

    // ---- Layer 2: Noise layer — snare/hi-hat ----
    const scheduleNoiseHits = () => {
      if (!this.combatRunning || !this.audioContext) return;

      const batchNow = this.audioContext.currentTime;
      const hitVol = this.masterVolume * this.musicVolume * 0.03;

      for (let i = 0; i < 32; i++) {
        const beatTime = batchNow + i * beatInterval;

        // Off-beat hi-hats (every odd beat)
        if (i % 2 === 1) {
          const buffer = this.getNoiseBuffer(0.03);
          const source = this.audioContext.createBufferSource();
          source.buffer = buffer;

          const filter = this.audioContext.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.value = 3000;

          const gain = this.audioContext.createGain();
          gain.gain.setValueAtTime(hitVol * 0.4, beatTime);
          gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.03);

          source.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);

          source.start(beatTime);
          source.stop(beatTime + 0.05);
        }

        // Snare on beats 2 and 4
        if (i % 4 === 1 || i % 4 === 3) {
          const buffer = this.getNoiseBuffer(0.06);
          const source = this.audioContext.createBufferSource();
          source.buffer = buffer;

          const filter = this.audioContext.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 1500;

          const gain = this.audioContext.createGain();
          gain.gain.setValueAtTime(hitVol * 0.6, beatTime);
          gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.06);

          source.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);

          source.start(beatTime);
          source.stop(beatTime + 0.08);
        }
      }

      const timerId = setTimeout(scheduleNoiseHits, 14000);
      this.combatTimers.push(timerId);
    };

    // ---- Layer 3: Mid-frequency drone at 400Hz ----
    const midDrone = this.createMusicNoiseLoop(10.0, 400, 'bandpass', 0.4, 0.04);
    midDrone.source.start();
    this.combatNodes.push(...midDrone.nodes);

    // ---- Layer 4: Sub-bass rumble ----
    const subRumble = this.createMusicNoiseLoop(15.0, 60, 'lowpass', 1.0, 0.03);
    subRumble.source.start();
    this.combatNodes.push(...subRumble.nodes);

    this.combatRunning = true;
    scheduleNoiseHits();

    // Start escalation — adds intensity every 15 seconds
    this.startCombatEscalation(masterGain);

    this.crossfadeMasterGain(1.0);

    console.log('[AudioManager] Combat music — 140 BPM pulse + noise layers + escalation');
  }

  /**
   * Escalation system: every 15 seconds, combat music gets slightly more intense.
   * Adds higher-frequency noise layers and subtle additional oscillators.
   */
  private startCombatEscalation(masterGain: GainNode): void {
    const escalate = () => {
      if (!this.combatRunning || !this.audioContext) return;

      this.combatEscalation = Math.min(1.0, this.combatEscalation + 0.15);

      // Add escalation noise layer — gets louder and higher-pitched
      const escFreq = 800 + this.combatEscalation * 1200; // 800Hz → 2000Hz
      const escVol = 0.01 + this.combatEscalation * 0.02;  // 0.01 → 0.03

      const escNoise = this.createMusicNoiseLoop(
        6.0,
        escFreq,
        'bandpass',
        0.3 + this.combatEscalation * 0.3, // Gets more focused
        escVol
      );
      escNoise.source.start();
      this.combatNodes.push(...escNoise.nodes);

      // At high escalation, add a warning oscillator
      if (this.combatEscalation >= 0.6) {
        const warnOsc = this.audioContext.createOscillator();
        warnOsc.type = 'sawtooth';
        warnOsc.frequency.value = 150 + this.combatEscalation * 100;

        const warnGain = this.audioContext.createGain();
        warnGain.gain.value = 0.008 * this.combatEscalation;

        warnOsc.connect(warnGain);
        warnGain.connect(masterGain);
        warnOsc.start();
        this.combatOscillators.push(warnOsc);
        this.combatNodes.push(warnGain);
      }

      const timerId = setTimeout(escalate, 15000);
      this.combatTimers.push(timerId);
    };

    const timerId = setTimeout(escalate, 15000);
    this.combatTimers.push(timerId);
  }

  // ============================================================
  // PHASE 4: WAVE MUSIC — Aggressive + Rising Intensity
  // ============================================================
  //
  // Aggressive rhythm that escalates with each wave:
  //   Layer 1: Double-time bass pulse at 80Hz
  //   Layer 2: Aggressive noise hits on every beat
  //   Layer 3: Rising synth line per wave number
  //   Layer 4: Distorted noise bed — controlled chaos
  //   Layer 5: Wave transition stabs — mark wave changes
  //

  /**
   * Start wave music for a specific wave number.
   * Higher wave numbers = more intensity.
   */
  public startWaveMusic(waveNumber: number = 1): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    if (this.musicState === 'wave' && this.waveRunning) return;

    if (this.musicState !== 'none') {
      this.fadeOutCurrentMusic();
    }

    this.musicState = 'wave';
    this.waveRunning = true;
    this.waveNumber = waveNumber;
    this.waveIntensity = Math.min(1.0, 0.4 + (waveNumber - 1) * 0.12); // 0.4 → ~1.0

    const masterGain = this.ensureMusicMasterGain();
    const now = this.audioContext.currentTime;

    // Wave music is slightly faster: 150 BPM
    const bpm = 150;
    const beatInterval = 60 / bpm;
    const intensity = this.waveIntensity;

    // ---- Layer 1: Double-time bass pulse ----
    const bassOsc = this.audioContext.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = 80;

    const bassGain = this.audioContext.createGain();
    bassGain.gain.value = 0;

    bassOsc.connect(bassGain);
    bassGain.connect(masterGain);

    const totalBeats = 256;
    const vol = this.masterVolume * this.musicVolume * (0.04 + intensity * 0.02);

    for (let i = 0; i < totalBeats; i++) {
      const beatTime = now + i * beatInterval;
      // Driving pattern: every beat gets hit, with accents
      const accent = (i % 4 === 0) ? 1.2 : (i % 2 === 0) ? 0.9 : 0.5;
      bassGain.gain.setValueAtTime(0, beatTime);
      bassGain.gain.linearRampToValueAtTime(vol * accent, beatTime + 0.008);
      bassGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1);
    }

    bassOsc.start(now);
    this.waveOscillators.push(bassOsc);
    this.waveNodes.push(bassGain);

    // ---- Layer 2: Aggressive noise hits on every beat ----
    const scheduleWaveHits = () => {
      if (!this.waveRunning || !this.audioContext) return;

      const batchNow = this.audioContext.currentTime;
      const hitVol = this.masterVolume * this.musicVolume * (0.03 + intensity * 0.015);

      for (let i = 0; i < 32; i++) {
        const beatTime = batchNow + i * beatInterval;

        // Every beat gets a noise hit — more aggressive than combat
        const buffer = this.getNoiseBuffer(0.04);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        // Alternate between body and snare frequencies
        filter.frequency.value = (i % 2 === 0) ? 1200 + intensity * 300 : 2500;
        filter.Q.value = 1.5;

        const gain = this.audioContext.createGain();
        const hitAccent = (i % 4 === 0) ? 1.0 : (i % 2 === 0) ? 0.8 : 0.6;
        gain.gain.setValueAtTime(hitVol * hitAccent, beatTime);
        gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.04);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        source.start(beatTime);
        source.stop(beatTime + 0.06);

        // Off-beat hi-hat shimmer at high intensity
        if (intensity >= 0.7 && i % 2 === 1) {
          const hhBuffer = this.getNoiseBuffer(0.02);
          const hhSource = this.audioContext.createBufferSource();
          hhSource.buffer = hhBuffer;

          const hhFilter = this.audioContext.createBiquadFilter();
          hhFilter.type = 'highpass';
          hhFilter.frequency.value = 4000;

          const hhGain = this.audioContext.createGain();
          hhGain.gain.setValueAtTime(hitVol * 0.3, beatTime);
          hhGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.02);

          hhSource.connect(hhFilter);
          hhFilter.connect(hhGain);
          hhGain.connect(masterGain);
          hhSource.start(beatTime);
          hhSource.stop(beatTime + 0.03);
        }
      }

      const timerId = setTimeout(scheduleWaveHits, 13500);
      this.waveTimers.push(timerId);
    };

    // ---- Layer 3: Rising synth line per wave number ----
    // Each wave has a slightly different pitch center
    const synthFreq = 200 + waveNumber * 40; // 240Hz for wave 1, 280 for wave 2, etc.
    const synthOsc = this.audioContext.createOscillator();
    synthOsc.type = 'sawtooth';
    synthOsc.frequency.value = synthFreq;

    // Slow LFO to make it waver
    const lfo = this.audioContext.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 2 + intensity * 2; // Faster wobble at higher waves
    const lfoGain = this.audioContext.createGain();
    lfoGain.gain.value = 10 + intensity * 15;
    lfo.connect(lfoGain);
    lfoGain.connect(synthOsc.frequency);
    lfo.start(now);

    const synthGain = this.audioContext.createGain();
    synthGain.gain.value = this.masterVolume * this.musicVolume * 0.015 * intensity;

    synthOsc.connect(synthGain);
    synthGain.connect(masterGain);
    synthOsc.start(now);

    this.waveOscillators.push(synthOsc, lfo);
    this.waveNodes.push(synthGain, lfoGain);

    // ---- Layer 4: Distorted noise bed ----
    const noiseBed = this.createMusicNoiseLoop(
      8.0,
      300 + intensity * 400, // Higher freq at higher waves
      'bandpass',
      0.2,                   // Wide Q — messy, aggressive
      0.02 + intensity * 0.015
    );
    noiseBed.source.start();
    this.waveNodes.push(...noiseBed.nodes);

    // ---- Layer 5: Wave transition stab (one-shot at start) ----
    const stabOsc = this.audioContext.createOscillator();
    stabOsc.type = 'square';
    stabOsc.frequency.setValueAtTime(400 + waveNumber * 50, now);
    stabOsc.frequency.exponentialRampToValueAtTime(100, now + 0.3);

    const stabGain = this.audioContext.createGain();
    stabGain.gain.setValueAtTime(this.masterVolume * this.musicVolume * 0.06, now);
    stabGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    stabOsc.connect(stabGain);
    stabGain.connect(masterGain);
    stabOsc.start(now);
    stabOsc.stop(now + 0.35);
    this.waveOscillators.push(stabOsc);
    this.waveNodes.push(stabGain);

    this.waveRunning = true;
    scheduleWaveHits();

    this.crossfadeMasterGain(1.0);

    console.log(`[AudioManager] Wave music — wave ${waveNumber} | intensity ${intensity.toFixed(2)}`);
  }

  /**
   * Update wave music when transitioning between waves.
   * Smoothly increases intensity without restarting everything.
   */
  public updateWave(newWaveNumber: number): void {
    this.waveNumber = newWaveNumber;
    this.waveIntensity = Math.min(1.0, 0.4 + (newWaveNumber - 1) * 0.12);
    console.log(`[AudioManager] Wave updated → ${newWaveNumber} | intensity ${this.waveIntensity.toFixed(2)}`);
  }

  // ============================================================
  // PHASE 5: EXTRACTION MUSIC — Fast + Rising Pitch + Countdown
  // ============================================================
  //
  // Maximum urgency:
  //   Layer 1: Fast bass pulse at 80Hz — 150 BPM, every beat
  //   Layer 2: Noise hits on every beat — relentless
  //   Layer 3: Rising pitch oscillator — 200Hz → 800Hz over total time
  //   Layer 4: Countdown beeps — synced to remaining timer
  //   Layer 5: Heartbeat oscillator — dual sine pulses
  //

  /**
   * Start extraction music with a countdown timer.
   * @param totalSeconds Total extraction time in seconds (default 60)
   */
  public startExtractionMusic(totalSeconds: number = 60): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    if (this.musicState === 'extraction' && this.extractionRunning) return;

    if (this.musicState !== 'none') {
      this.fadeOutCurrentMusic();
    }

    this.musicState = 'extraction';
    this.extractionRunning = true;
    this.extractionTimeRemaining = totalSeconds;
    this.extractionTotalTime = totalSeconds;

    const masterGain = this.ensureMusicMasterGain();
    const now = this.audioContext.currentTime;

    // Extraction is 150 BPM — feels urgent
    const bpm = 150;
    const beatInterval = 60 / bpm;
    const vol = this.masterVolume * this.musicVolume * 0.06; // Loudest music tier

    // ---- Layer 1: Fast bass pulse ----
    const bassOsc = this.audioContext.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = 80;

    const bassGain = this.audioContext.createGain();
    bassGain.gain.value = 0;

    bassOsc.connect(bassGain);
    bassGain.connect(masterGain);

    const totalBeats = 384; // Enough for ~2.5 minutes at 150 BPM
    for (let i = 0; i < totalBeats; i++) {
      const beatTime = now + i * beatInterval;
      const accent = (i % 4 === 0) ? 1.2 : (i % 2 === 0) ? 0.9 : 0.6;
      bassGain.gain.setValueAtTime(0, beatTime);
      bassGain.gain.linearRampToValueAtTime(vol * accent, beatTime + 0.008);
      bassGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1);
    }

    bassOsc.start(now);
    this.extractionOscillators.push(bassOsc);
    this.extractionNodes.push(bassGain);

    // ---- Layer 2: Noise hits — relentless ----
    const scheduleExtractionHits = () => {
      if (!this.extractionRunning || !this.audioContext) return;

      const batchNow = this.audioContext.currentTime;
      const hitVol = this.masterVolume * this.musicVolume * 0.04;

      for (let i = 0; i < 32; i++) {
        const beatTime = batchNow + i * beatInterval;

        const buffer = this.getNoiseBuffer(0.04);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = (i % 2 === 0) ? 1500 : 2500;
        filter.Q.value = 1.5;

        const gain = this.audioContext.createGain();
        const hitAccent = (i % 4 === 0) ? 1.0 : 0.7;
        gain.gain.setValueAtTime(hitVol * hitAccent, beatTime);
        gain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.04);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        source.start(beatTime);
        source.stop(beatTime + 0.06);
      }

      const timerId = setTimeout(scheduleExtractionHits, 13500);
      this.extractionTimers.push(timerId);
    };

    // ---- Layer 3: Rising pitch — urgency indicator ----
    // Sine oscillator that rises from 200Hz to 800Hz over the total time
    this.extractionRisingOsc = this.audioContext.createOscillator();
    this.extractionRisingOsc.type = 'sine';
    this.extractionRisingOsc.frequency.value = 200;

    this.extractionRisingGain = this.audioContext.createGain();
    this.extractionRisingGain.gain.value = this.masterVolume * this.musicVolume * 0.02;

    this.extractionRisingOsc.connect(this.extractionRisingGain);
    this.extractionRisingGain.connect(masterGain);

    // Schedule the frequency rise
    this.extractionRisingOsc.frequency.setValueAtTime(200, now);
    this.extractionRisingOsc.frequency.linearRampToValueAtTime(800, now + totalSeconds);

    this.extractionRisingOsc.start(now);
    this.extractionOscillators.push(this.extractionRisingOsc);
    this.extractionNodes.push(this.extractionRisingGain);

    // ---- Layer 4: Countdown beeps ----
    // Beeps that sync with the extraction timer
    this.startCountdownBeeps(masterGain);

    // ---- Layer 5: Heartbeat oscillator ----
    // Dual sine pulses at ~70 BPM (resting heartbeat → increases urgency)
    const heartbeatLoop = () => {
      if (!this.extractionRunning || !this.audioContext) return;

      const hbNow = this.audioContext.currentTime;
      const timeRatio = 1 - (this.extractionTimeRemaining / this.extractionTotalTime);
      const hbBpm = 80 + timeRatio * 40; // 80 → 120 BPM as time runs out
      const hbInterval = 60 / hbBpm;

      // Double pulse (lub-dub)
      for (let beat = 0; beat < 2; beat++) {
        const beatTime = hbNow + beat * hbInterval * 0.3;

        const hbOsc = this.audioContext.createOscillator();
        hbOsc.type = 'sine';
        hbOsc.frequency.value = 50 - beat * 5; // First beat slightly higher

        const hbGain = this.audioContext.createGain();
        const hbVol = this.masterVolume * this.musicVolume * 0.025;
        hbGain.gain.setValueAtTime(hbVol * (beat === 0 ? 1.0 : 0.7), beatTime);
        hbGain.gain.exponentialRampToValueAtTime(0.001, beatTime + 0.1);

        hbOsc.connect(hbGain);
        hbGain.connect(masterGain);
        hbOsc.start(beatTime);
        hbOsc.stop(beatTime + 0.12);
      }

      const nextHb = setTimeout(heartbeatLoop, (60 / hbBpm) * 1000);
      this.extractionTimers.push(nextHb);
    };

    this.extractionRunning = true;
    scheduleExtractionHits();
    heartbeatLoop();

    // Fade in faster for extraction — urgency
    if (this.musicMasterGain) {
      const fadeInNow = this.audioContext.currentTime;
      this.musicMasterGain.gain.cancelScheduledValues(fadeInNow);
      this.musicMasterGain.gain.setValueAtTime(0, fadeInNow);
      this.musicMasterGain.gain.linearRampToValueAtTime(
        this.masterVolume * this.musicVolume,
        fadeInNow + 0.5 // 0.5s fade-in instead of 2s for extraction
      );
    }

    console.log(`[AudioManager] Extraction music — ${totalSeconds}s countdown + rising pitch + beeps`);
  }

  /**
   * Start countdown beeps that sync with the extraction timer.
   * Beeps get faster and more frequent as time runs out.
   */
  private startCountdownBeeps(masterGain: GainNode): void {
    const scheduleBeeps = () => {
      if (!this.extractionRunning || !this.audioContext || this.extractionTimeRemaining <= 0) return;

      const timeRatio = this.extractionTimeRemaining / this.extractionTotalTime;

      // Beep frequency: slow when plenty of time, rapid as deadline approaches
      let beepInterval: number;
      if (timeRatio > 0.5) {
        beepInterval = 3000; // Every 3 seconds when >50% time left
      } else if (timeRatio > 0.25) {
        beepInterval = 2000; // Every 2 seconds when 25-50%
      } else if (timeRatio > 0.1) {
        beepInterval = 1000; // Every 1 second when 10-25%
      } else {
        beepInterval = 500;  // Every 0.5 seconds when <10%
      }

      // Play the countdown beep
      const now = this.audioContext.currentTime;
      const beepFreq = 1000 + (1 - timeRatio) * 800; // 1000Hz → 1800Hz as time runs out
      const beepVol = this.masterVolume * this.musicVolume * (0.03 + (1 - timeRatio) * 0.03);

      // Main beep
      const osc = this.audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = beepFreq;

      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(beepVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.1);

      // When less than 10 seconds, double-beep pattern
      if (this.extractionTimeRemaining <= 10) {
        const osc2 = this.audioContext.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = beepFreq * 1.2;

        const gain2 = this.audioContext.createGain();
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(beepVol, now + 0.11);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.22);
      }

      // When less than 5 seconds, triple-beep
      if (this.extractionTimeRemaining <= 5) {
        const osc3 = this.audioContext.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = beepFreq * 1.5;

        const gain3 = this.audioContext.createGain();
        gain3.gain.setValueAtTime(0, now + 0.2);
        gain3.gain.linearRampToValueAtTime(beepVol * 1.2, now + 0.21);
        gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        osc3.connect(gain3);
        gain3.connect(masterGain);
        osc3.start(now + 0.2);
        osc3.stop(now + 0.32);
      }

      const timerId = setTimeout(scheduleBeeps, beepInterval);
      this.extractionTimers.push(timerId);
    };

    // Start the countdown beep loop
    const initialTimer = setTimeout(scheduleBeeps, 500);
    this.extractionTimers.push(initialTimer);

    // Timer tick — decrements remaining time
    this.extractionCountdownTimer = setInterval(() => {
      if (this.extractionTimeRemaining > 0) {
        this.extractionTimeRemaining--;
      }
    }, 1000);
  }

  /**
   * Stop extraction countdown (called when extraction succeeds or fails).
   */
  public stopExtractionCountdown(): void {
    if (this.extractionCountdownTimer) {
      clearInterval(this.extractionCountdownTimer);
      this.extractionCountdownTimer = null;
    }
  }

  // ============================================================
  // MUSIC CONTROL — Crossfade & Stop
  // ============================================================

  private fadeOutCurrentMusic(): void {
    if (!this.audioContext || !this.musicMasterGain) return;

    const now = this.audioContext.currentTime;
    const currentVol = this.musicMasterGain.gain.value;
    this.musicMasterGain.gain.cancelScheduledValues(now);
    this.musicMasterGain.gain.setValueAtTime(currentVol, now);
    this.musicMasterGain.gain.linearRampToValueAtTime(0, now + this.musicCrossfadeTime);

    setTimeout(() => {
      this.stopStealthMusicNodes();
      this.stopCombatMusicNodes();
      this.stopWaveMusicNodes();
      this.stopExtractionMusicNodes();
    }, this.musicCrossfadeTime * 1000);
  }

  // ---- Stealth cleanup ----

  private stealthOscillators: OscillatorNode[] = [];

  private stopStealthMusicNodes(): void {
    this.stealthTimers.forEach(id => clearTimeout(id));
    this.stealthTimers = [];

    this.stealthOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) { /* already stopped */ }
      try { osc.disconnect(); } catch (e) { /* already disconnected */ }
    });
    this.stealthOscillators = [];

    this.stealthNodes.forEach(node => {
      try {
        if (node instanceof AudioBufferSourceNode) node.stop();
      } catch (e) { /* already stopped */ }
      try { node.disconnect(); } catch (e) { /* already disconnected */ }
    });
    this.stealthNodes = [];
    this.stealthRunning = false;
  }

  // ---- Combat cleanup ----

  private stopCombatMusicNodes(): void {
    this.combatTimers.forEach(id => clearTimeout(id));
    this.combatTimers = [];

    this.combatOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) { /* already stopped */ }
      try { osc.disconnect(); } catch (e) { /* already disconnected */ }
    });
    this.combatOscillators = [];

    this.combatNodes.forEach(node => {
      try { node.disconnect(); } catch (e) { /* already disconnected */ }
    });
    this.combatNodes = [];
    this.combatRunning = false;
    this.combatEscalation = 0;
  }

  // ---- Wave cleanup ----

  private stopWaveMusicNodes(): void {
    this.waveTimers.forEach(id => clearTimeout(id));
    this.waveTimers = [];

    this.waveOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) { /* already stopped */ }
      try { osc.disconnect(); } catch (e) { /* already disconnected */ }
    });
    this.waveOscillators = [];

    this.waveNodes.forEach(node => {
      try { node.disconnect(); } catch (e) { /* already disconnected */ }
    });
    this.waveNodes = [];
    this.waveRunning = false;
  }

  // ---- Extraction cleanup ----

  private stopExtractionMusicNodes(): void {
    this.stopExtractionCountdown();

    this.extractionTimers.forEach(id => clearTimeout(id));
    this.extractionTimers = [];

    this.extractionOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) { /* already stopped */ }
      try { osc.disconnect(); } catch (e) { /* already disconnected */ }
    });
    this.extractionOscillators = [];

    if (this.extractionRisingOsc) {
      try { this.extractionRisingOsc.stop(); } catch (e) { /* already stopped */ }
      try { this.extractionRisingOsc.disconnect(); } catch (e) { /* already disconnected */ }
      this.extractionRisingOsc = null;
    }
    if (this.extractionRisingGain) {
      try { this.extractionRisingGain.disconnect(); } catch (e) { /* already disconnected */ }
      this.extractionRisingGain = null;
    }

    this.extractionNodes.forEach(node => {
      try { node.disconnect(); } catch (e) { /* already disconnected */ }
    });
    this.extractionNodes = [];
    this.extractionRunning = false;
  }

  public stopMusic(): void {
    if (this.musicState === 'none') return;

    this.initAudioContext();
    if (!this.audioContext || !this.musicMasterGain) return;

    const now = this.audioContext.currentTime;

    this.musicMasterGain.gain.cancelScheduledValues(now);
    this.musicMasterGain.gain.setValueAtTime(this.musicMasterGain.gain.value, now);
    this.musicMasterGain.gain.linearRampToValueAtTime(0, now + 1.0);

    setTimeout(() => {
      this.stopStealthMusicNodes();
      this.stopCombatMusicNodes();
      this.stopWaveMusicNodes();
      this.stopExtractionMusicNodes();
      this.musicState = 'none';
      console.log('[AudioManager] Music stopped');
    }, 1100);
  }

  public getMusicState(): MusicZone {
    return this.musicState;
  }

  // ============================================================
  // COMPATIBILITY — Legacy API Methods
  // ============================================================

  public playHit(): void {
    this.playHitConfirm();
  }

  public playKill(): void {
    this.playKillConfirm();
  }

  public playDroneBuzz(): void {
    this.playFilteredNoise(0.3, 1200, 'bandpass', 0.25, 0.001, 0.15);
    this.playTone(1200, 0.15, 'sawtooth', 0.15, 0.001, 0.1);
  }

  public playAlert(): void {
    this.playSound(880, 0.15, 'square');
    setTimeout(() => this.playSound(880, 0.15, 'square'), 200);
    setTimeout(() => this.playSound(1100, 0.15, 'square'), 400);
  }

  // ============================================================
  // ALARM SIREN
  // ============================================================

  private alarmOsc1: OscillatorNode | null = null;
  private alarmOsc2: OscillatorNode | null = null;
  private alarmGain: GainNode | null = null;
  private alarmLfo: OscillatorNode | null = null;
  private alarmLfoGain: GainNode | null = null;
  private alarmRunning: boolean = false;

  public playAlarmSound(): void {
    this.initAudioContext();
    if (!this.audioContext || this.alarmRunning) return;

    const now = this.audioContext.currentTime;
    const vol = this.masterVolume * this.sfxVolume * 0.25;

    this.alarmOsc1 = this.audioContext.createOscillator();
    this.alarmOsc1.type = 'sine';
    this.alarmOsc1.frequency.value = 600;

    this.alarmOsc2 = this.audioContext.createOscillator();
    this.alarmOsc2.type = 'sine';
    this.alarmOsc2.frequency.value = 800;

    const gain1 = this.audioContext.createGain();
    gain1.gain.value = vol;
    const gain2 = this.audioContext.createGain();
    gain2.gain.value = 0;

    this.alarmLfo = this.audioContext.createOscillator();
    this.alarmLfo.type = 'sine';
    this.alarmLfo.frequency.value = 1.5;

    this.alarmLfoGain = this.audioContext.createGain();
    this.alarmLfoGain.gain.value = vol;

    this.alarmGain = this.audioContext.createGain();
    this.alarmGain.gain.value = 1.0;

    this.alarmLfo.connect(this.alarmLfoGain);
    this.alarmLfoGain.connect(gain1.gain);

    const lfoInvert = this.audioContext.createGain();
    lfoInvert.gain.value = -1;
    const lfoOffset2 = this.audioContext.createGain();
    lfoOffset2.gain.value = vol;
    this.alarmLfo.connect(lfoInvert);
    lfoInvert.connect(lfoOffset2.gain);
    lfoOffset2.connect(gain2.gain);

    this.alarmOsc1.connect(gain1);
    this.alarmOsc2.connect(gain2);
    gain1.connect(this.alarmGain);
    gain2.connect(this.alarmGain);
    this.alarmGain.connect(this.audioContext.destination);

    this.alarmOsc1.start(now);
    this.alarmOsc2.start(now);
    this.alarmLfo.start(now);

    this.alarmRunning = true;
  }

  public stopAlarmSound(): void {
    if (!this.alarmRunning) return;

    try {
      if (this.alarmGain && this.audioContext) {
        this.alarmGain.gain.exponentialRampToValueAtTime(
          0.001, this.audioContext.currentTime + 0.3
        );
      }
      setTimeout(() => {
        try { this.alarmOsc1?.stop(); } catch (e) { /* already stopped */ }
        try { this.alarmOsc2?.stop(); } catch (e) { /* already stopped */ }
        try { this.alarmLfo?.stop(); } catch (e) { /* already stopped */ }
        this.alarmOsc1 = null;
        this.alarmOsc2 = null;
        this.alarmLfo = null;
        this.alarmLfoGain = null;
        this.alarmGain = null;
        this.alarmRunning = false;
      }, 350);
    } catch (e) {
      this.alarmRunning = false;
    }
  }

  // ============================================================
  // VOLUME CONTROLS
  // ============================================================

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.windGain) {
      this.windGain.gain.value = this.masterVolume * 0.04;
    }
    if (this.musicMasterGain && this.musicState !== 'none') {
      const targetVol = this.masterVolume * this.musicVolume;
      this.musicMasterGain.gain.setValueAtTime(targetVol, this.audioContext?.currentTime || 0);
    }
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicMasterGain && this.musicState !== 'none') {
      const targetVol = this.masterVolume * this.musicVolume;
      this.musicMasterGain.gain.setValueAtTime(targetVol, this.audioContext?.currentTime || 0);
    }
  }

  public setSFXVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  // ============================================================
  // RESCUE SOUND
  // ============================================================

  public playRescue(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const vol = this.masterVolume * this.sfxVolume * 0.15;

    const notes = [
      { freq: 400, time: 0, dur: 0.15 },
      { freq: 550, time: 0.18, dur: 0.15 },
      { freq: 700, time: 0.36, dur: 0.2 },
    ];

    for (const note of notes) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.value = note.freq;

      const startTime = now + note.time;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
      gain.gain.setValueAtTime(vol, startTime + note.dur - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.dur);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(startTime);
      osc.stop(startTime + note.dur + 0.01);
    }
  }

  // ============================================================
  // AMMO PICKUP
  // ============================================================

  public playPickup(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const vol = this.masterVolume * this.sfxVolume * 0.2;

    const notes = [
      { freq: 880, time: 0, dur: 0.06 },
      { freq: 1320, time: 0.06, dur: 0.1 },
    ];

    for (const note of notes) {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.value = note.freq;

      const startTime = now + note.time;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.005);
      gain.gain.setValueAtTime(vol, startTime + note.dur - 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.dur);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(startTime);
      osc.stop(startTime + note.dur + 0.01);
    }
  }

  // ============================================================
  // TACTICAL SOUND EFFECTS
  // ============================================================

  public playAlarm(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const vol = this.masterVolume * this.sfxVolume * 0.3;
    const cycleDuration = 0.5;
    const halfCycle = cycleDuration / 2;
    const totalCycles = 4;

    for (let i = 0; i < totalCycles; i++) {
      const offset = now + i * cycleDuration;
      const freq = i % 2 === 0 ? 600 : 800;

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, offset);
      gain.gain.linearRampToValueAtTime(vol, offset + 0.01);
      gain.gain.setValueAtTime(vol, offset + halfCycle - 0.02);
      gain.gain.linearRampToValueAtTime(0, offset + halfCycle);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(offset);
      osc.stop(offset + halfCycle + 0.01);
    }

    const noiseDuration = totalCycles * cycleDuration;
    const noiseBuffer = this.getNoiseBuffer(noiseDuration);
    const noiseSource = this.audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = this.audioContext.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.Q.value = 2.0;

    noiseFilter.frequency.setValueAtTime(600, now);
    noiseFilter.frequency.linearRampToValueAtTime(800, now + halfCycle);
    noiseFilter.frequency.linearRampToValueAtTime(600, now + cycleDuration);
    noiseFilter.frequency.linearRampToValueAtTime(800, now + cycleDuration + halfCycle);
    noiseFilter.frequency.linearRampToValueAtTime(600, now + totalCycles * cycleDuration);

    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.value = vol * 0.15;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.audioContext.destination);

    noiseSource.start(now);
    noiseSource.stop(now + noiseDuration + 0.01);
  }

  public playC4Plant(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const vol = this.masterVolume * this.sfxVolume * 0.25;

    const beeps = [
      { freq: 1000, time: 0.0,  dur: 0.12 },
      { freq: 1200, time: 1.0,  dur: 0.12 },
      { freq: 1500, time: 2.0,  dur: 0.25 },
    ];

    for (const beep of beeps) {
      const startTime = now + beep.time;

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'square';
      osc.frequency.value = beep.freq;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.005);
      gain.gain.setValueAtTime(vol, startTime + beep.dur - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + beep.dur);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(startTime);
      osc.stop(startTime + beep.dur + 0.01);

      const clickOsc = this.audioContext.createOscillator();
      const clickGain = this.audioContext.createGain();

      clickOsc.type = 'sine';
      clickOsc.frequency.value = beep.freq * 0.5;

      clickGain.gain.setValueAtTime(vol * 0.3, startTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.02);

      clickOsc.connect(clickGain);
      clickGain.connect(this.audioContext.destination);

      clickOsc.start(startTime);
      clickOsc.stop(startTime + 0.03);
    }

    const confirmTime = now + 3.0;
    const confirmOsc = this.audioContext.createOscillator();
    const confirmGain = this.audioContext.createGain();

    confirmOsc.type = 'square';
    confirmOsc.frequency.value = 1800;

    confirmGain.gain.setValueAtTime(0, confirmTime);
    confirmGain.gain.linearRampToValueAtTime(vol * 1.2, confirmTime + 0.01);
    confirmGain.gain.setValueAtTime(vol * 1.2, confirmTime + 0.3);
    confirmGain.gain.exponentialRampToValueAtTime(0.001, confirmTime + 0.4);

    confirmOsc.connect(confirmGain);
    confirmGain.connect(this.audioContext.destination);

    confirmOsc.start(confirmTime);
    confirmOsc.stop(confirmTime + 0.41);
  }

  public playExtractionBeacon(): void {
    this.initAudioContext();
    if (!this.audioContext) return;

    const now = this.audioContext.currentTime;
    const vol = this.masterVolume * this.sfxVolume * 0.3;
    const pulseDuration = 0.2;
    const silenceDuration = 0.2;
    const totalPulses = 5;

    for (let i = 0; i < totalPulses; i++) {
      const startTime = now + i * (pulseDuration + silenceDuration);

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.value = 1000;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
      gain.gain.setValueAtTime(vol, startTime + pulseDuration - 0.03);
      gain.gain.linearRampToValueAtTime(0, startTime + pulseDuration);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(startTime);
      osc.stop(startTime + pulseDuration + 0.01);

      const harmonicOsc = this.audioContext.createOscillator();
      const harmonicGain = this.audioContext.createGain();

      harmonicOsc.type = 'sine';
      harmonicOsc.frequency.value = 2000;

      harmonicGain.gain.setValueAtTime(0, startTime);
      harmonicGain.gain.linearRampToValueAtTime(vol * 0.15, startTime + 0.01);
      harmonicGain.gain.setValueAtTime(vol * 0.15, startTime + pulseDuration - 0.03);
      harmonicGain.gain.linearRampToValueAtTime(0, startTime + pulseDuration);

      harmonicOsc.connect(harmonicGain);
      harmonicGain.connect(this.audioContext.destination);

      harmonicOsc.start(startTime);
      harmonicOsc.stop(startTime + pulseDuration + 0.01);

      const clickOsc = this.audioContext.createOscillator();
      const clickGain = this.audioContext.createGain();

      clickOsc.type = 'sine';
      clickOsc.frequency.value = 3000;

      clickGain.gain.setValueAtTime(vol * 0.2, startTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.015);

      clickOsc.connect(clickGain);
      clickGain.connect(this.audioContext.destination);

      clickOsc.start(startTime);
      clickOsc.stop(startTime + 0.02);
    }
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  public dispose(): void {
    this.stopAmbientWind();
    this.stopMusic();
    this.stopAlarmSound();
    if (this.musicMasterGain) {
      try { this.musicMasterGain.disconnect(); } catch (e) { /* already disconnected */ }
      this.musicMasterGain = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    console.log('[AudioManager] Disposed');
  }
}
