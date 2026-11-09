/**
 * Pure Web Audio API synthesized sound & dark low-fi ambient music engine for Shadow Echo.
 * Features:
 * 1. Multi-tap Feedback Delay Echo network so every movement pulse, sonar ping, and impact echoes in the dark.
 * 2. Continuous Dark Low-Fi Ambient Background Music (warm filtered sub-pad + slow minor-key echoing notes).
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxEchoInput: GainNode | null = null;

  // Ambient music nodes & state
  private musicGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private musicIntervalId: number | null = null;
  private isMusicPlaying = false;
  private chordStep = 0;

  public sfxEnabled = true;
  public musicEnabled = true;

  private getOrCreateContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;

        const ctx = new AudioCtx();
        this.ctx = ctx;

        // Master output gain
        const master = ctx.createGain();
        master.gain.value = 0.85;
        master.connect(ctx.destination);
        this.masterGain = master;

        // Create acoustic cavern echo effect (Feedback Delay Loop + Warm Lowpass Filter)
        const echoInput = ctx.createGain();
        echoInput.gain.value = 1.0;

        const delay = ctx.createDelay(2.0);
        delay.delayTime.value = 0.24; // 240ms canyon echo tap

        const feedback = ctx.createGain();
        feedback.gain.value = 0.5; // Multi-echo decay tail

        const toneFilter = ctx.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.value = 1450; // Darken each successive echo reflection

        // Dry path
        echoInput.connect(master);

        // Wet echoing path
        echoInput.connect(delay);
        delay.connect(toneFilter);
        toneFilter.connect(feedback);
        feedback.connect(delay);
        toneFilter.connect(master);

        this.sfxEchoInput = echoInput;
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Starts the dark low-fi ambient background music loop safely without recursion
   */
  public startAmbientMusic(): void {
    if (!this.musicEnabled || this.isMusicPlaying) return;

    const ctx = this.getOrCreateContext();
    if (!ctx || !this.masterGain) return;

    try {
      this.isMusicPlaying = true;
      const now = ctx.currentTime;

      const musicGain = ctx.createGain();
      musicGain.gain.setValueAtTime(0.001, now);
      musicGain.gain.linearRampToValueAtTime(0.16, now + 1.5);
      musicGain.connect(this.masterGain);
      this.musicGain = musicGain;

      // Warm low-pass filter for the dark drone pad
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(210, now);
      padFilter.Q.value = 2.0;
      padFilter.connect(musicGain);

      // Slow breathing LFO modulating the pad filter cutoff
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.14;
      lfoGain.gain.value = 70;
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);
      lfo.start(now);
      this.lfoOsc = lfo;

      // Detuned sub-drone oscillators (C2 = 65.41Hz and G2 = 98.00Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(65.41, now);
      osc2.frequency.setValueAtTime(98.0, now);
      osc1.detune.value = -8;
      osc2.detune.value = 7;

      const droneMix = ctx.createGain();
      droneMix.gain.value = 0.26;

      osc1.connect(droneMix);
      osc2.connect(droneMix);
      droneMix.connect(padFilter);

      osc1.start(now);
      osc2.start(now);
      this.droneOsc1 = osc1;
      this.droneOsc2 = osc2;

      // Slow atmospheric minor-key low-fi echoing arpeggio notes
      const scaleNotes = [
        261.63, // C4
        311.13, // Eb4
        392.0,  // G4
        466.16, // Bb4
        523.25, // C5
        349.23, // F4
        293.66, // D4
        392.0,  // G4
      ];

      const roots = [65.41, 51.91, 58.27, 49.0]; // C2, Ab1, Bb1, G1

      this.musicIntervalId = window.setInterval(() => {
        if (!this.musicEnabled || !this.ctx || this.ctx.state !== 'running') return;
        try {
          const t = this.ctx.currentTime;

          if (this.chordStep % 4 === 0 && this.droneOsc1 && this.droneOsc2) {
            const root = roots[Math.floor(this.chordStep / 4) % roots.length];
            this.droneOsc1.frequency.setTargetAtTime(root, t, 0.4);
            this.droneOsc2.frequency.setTargetAtTime(root * 1.5, t, 0.4);
          }

          const noteFreq = scaleNotes[this.chordStep % scaleNotes.length];
          this.chordStep++;

          const noteOsc = this.ctx.createOscillator();
          const noteGain = this.ctx.createGain();
          const noteFilter = this.ctx.createBiquadFilter();

          noteOsc.type = 'sine';
          noteOsc.frequency.setValueAtTime(noteFreq, t);
          noteOsc.frequency.linearRampToValueAtTime(noteFreq * 0.996, t + 1.4);

          noteFilter.type = 'lowpass';
          noteFilter.frequency.setValueAtTime(900, t);

          noteGain.gain.setValueAtTime(0.0005, t);
          noteGain.gain.linearRampToValueAtTime(0.03, t + 0.06);
          noteGain.gain.exponentialRampToValueAtTime(0.0005, t + 1.6);

          noteOsc.connect(noteFilter);
          noteFilter.connect(noteGain);

          if (this.sfxEchoInput) {
            noteGain.connect(this.sfxEchoInput);
          } else if (this.musicGain) {
            noteGain.connect(this.musicGain);
          }

          noteOsc.start(t);
          noteOsc.stop(t + 1.65);
        } catch {
          // Ignore transient audio scheduling issues
        }
      }, 1850);
    } catch {
      this.isMusicPlaying = false;
    }
  }

  public stopAmbientMusic(): void {
    if (this.musicIntervalId !== null) {
      clearInterval(this.musicIntervalId);
      this.musicIntervalId = null;
    }
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      this.lfoOsc?.stop();
      this.musicGain?.disconnect();
    } catch {
      // Ignore if already stopped
    }
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.lfoOsc = null;
    this.musicGain = null;
    this.isMusicPlaying = false;
  }

  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (enabled) {
      this.startAmbientMusic();
    } else {
      this.stopAmbientMusic();
    }
  }

  public setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
  }

  /**
   * Echoing acoustic pulse when the player moves and emits a sound wave
   */
  public playStepWave(intensity = 0.75): void {
    const ctx = this.getOrCreateContext();
    if (this.musicEnabled && !this.isMusicPlaying) {
      this.startAmbientMusic();
    }
    if (!ctx || !this.sfxEnabled || !this.sfxEchoInput) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      subOsc.type = 'triangle';

      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(293.66, now + 0.22);

      subOsc.frequency.setValueAtTime(293.66, now);
      subOsc.frequency.exponentialRampToValueAtTime(146.83, now + 0.22);

      const peakGain = Math.min(0.11, 0.08 * intensity);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);

      osc.connect(gain);
      subOsc.connect(gain);
      gain.connect(this.sfxEchoInput);

      osc.start(now);
      subOsc.start(now);
      osc.stop(now + 0.25);
      subOsc.stop(now + 0.25);
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Deep resonant echoing sonar ping (Spacebar / Click)
   */
  public playActiveSonar(): void {
    const ctx = this.getOrCreateContext();
    if (this.musicEnabled && !this.isMusicPlaying) {
      this.startAmbientMusic();
    }
    if (!ctx || !this.sfxEnabled || !this.sfxEchoInput) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      harmonic.type = 'triangle';

      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.42);

      harmonic.frequency.setValueAtTime(1318.5, now);
      harmonic.frequency.exponentialRampToValueAtTime(659.25, now + 0.42);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.13, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.45);

      osc.connect(gain);
      harmonic.connect(gain);
      gain.connect(this.sfxEchoInput);

      osc.start(now);
      harmonic.start(now);
      osc.stop(now + 0.46);
      harmonic.stop(now + 0.46);
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Subtle high-frequency acoustic reflection shimmer when a wave hits a wall
   */
  public playWallEcho(): void {
    const ctx = this.getOrCreateContext();
    if (!ctx || !this.sfxEnabled || !this.sfxEchoInput) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const baseFreq = 960 + Math.random() * 260;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.2, now + 0.11);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.024, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.13);

      osc.connect(gain);
      gain.connect(this.sfxEchoInput);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Echoing shatter impact when hitting an invisible wall
   */
  public playDeathCollision(): void {
    const ctx = this.getOrCreateContext();
    if (!ctx || !this.sfxEnabled || !this.sfxEchoInput) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(195, now);
      osc1.frequency.exponentialRampToValueAtTime(46, now + 0.45);

      osc2.frequency.setValueAtTime(277, now);
      osc2.frequency.exponentialRampToValueAtTime(55, now + 0.45);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.48);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.sfxEchoInput);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Harmonic echoing chord when completing a level
   */
  public playLevelVictory(): void {
    const ctx = this.getOrCreateContext();
    if (!ctx || !this.sfxEnabled || !this.sfxEchoInput) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        const startTime = now + idx * 0.075;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.09, startTime + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.75);

        osc.connect(gain);
        gain.connect(this.sfxEchoInput!);

        osc.start(startTime);
        osc.stop(startTime + 0.78);
      });
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Crystalline golden chime when collecting a Resonance Key shard
   */
  public playKeyCollect(): void {
    const ctx = this.getOrCreateContext();
    if (!ctx || !this.sfxEnabled || !this.sfxEchoInput) return;

    try {
      const now = ctx.currentTime;
      const freqs = [783.99, 1174.66]; // G5 -> D6 fifth
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.06;
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.11, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);

        osc.connect(gain);
        gain.connect(this.sfxEchoInput!);
        osc.start(t);
        osc.stop(t + 0.48);
      });
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Resonant chord when all Resonance Keys are gathered and the Exit unlocks
   */
  public playExitUnlock(): void {
    const ctx = this.getOrCreateContext();
    if (!ctx || !this.sfxEnabled || !this.sfxEchoInput) return;

    try {
      const now = ctx.currentTime;
      const freqs = [440, 554.37, 659.25, 880]; // A major resonant unlock
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + idx * 0.055;
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.085, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.65);

        osc.connect(gain);
        gain.connect(this.sfxEchoInput!);
        osc.start(t);
        osc.stop(t + 0.68);
      });
    } catch {
      // Ignore audio errors
    }
  }
}

export const soundEngine = new SoundEngine();
