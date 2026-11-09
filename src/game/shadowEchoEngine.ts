import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  LevelConfig,
  ResonanceKeyConfig,
  SentinelConfig,
  WallRect,
} from './levels';
import { soundEngine } from './soundEngine';

export type PlayerShape = 'square' | 'circle';

export interface SoundWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  alpha: number;
  lineWidth: number;
  color: string;
  isSonarPing?: boolean;
  isEchoReply?: boolean;
}

export interface WallState extends WallRect {
  revealAlpha: number;
  holdTimer: number;
  collisionAlpha: number;
  lastWaveX: number;
  lastWaveY: number;
  lastWaveRadius: number;
  activeSliceAlpha: number;
}

export interface KeyState extends ResonanceKeyConfig {
  collected: boolean;
  discovered: boolean;
  revealAlpha: number;
  replyCooldown: number;
}

export interface SentinelState extends SentinelConfig {
  x: number;
  y: number;
  progress: number; // 0..1 along (x1,y1) -> (x2,y2)
  direction: 1 | -1;
  radius: number;
  revealAlpha: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  size: number;
  alpha: number;
  decay: number;
  color: string;
  glowBlur: number;
}

export interface DeathMarker {
  x: number;
  y: number;
  alpha: number;
}

export interface GameStatsSnapshot {
  levelId: number;
  levelName: string;
  levelSubtitle: string;
  echoesUsed: number;
  parEchoes: number;
  deaths: number;
  elapsedSeconds: number;
  keysCollected: number;
  keysTotal: number;
  sonarCharges: number;
  maxSonarCharges: number;
  status: 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'RESPAWNING' | 'LEVEL_COMPLETE';
  deathMessage: string | null;
  autoAdvanceRemaining: number;
}

export class ShadowEchoEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private level: LevelConfig;
  private walls: WallState[] = [];
  private resonanceKeys: KeyState[] = [];
  private sentinels: SentinelState[] = [];
  private waves: SoundWave[] = [];
  private particles: Particle[] = [];
  private deathMarkers: DeathMarker[] = [];

  // Player state
  private player = {
    x: 80,
    y: 280,
    size: 16,
    speed: 215,
    vx: 0,
    vy: 0,
    shape: 'square' as PlayerShape,
    trail: [] as { x: number; y: number; alpha: number }[],
  };

  // Input state
  private keys: Record<string, boolean> = {};
  private virtualInput = { dx: 0, dy: 0 };
  private touchJoystick = {
    active: false,
    identifier: -1,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
  };

  // Wave & particle emission cadence
  private distanceSinceLastWave = 0;
  private timeSinceLastWave = 0;
  private moveParticleAccumulator = 0;

  // Tactical Sonar Charge system (3 max, recharges over time)
  private sonarCooldown = 0;
  private sonarCharges = 3;
  private readonly maxSonarCharges = 3;
  private sonarRechargeTimer = 0;

  // Game loop & state
  private status: GameStatsSnapshot['status'] = 'PLAYING';
  private echoesUsed = 0;
  private deaths = 0;
  private elapsedSeconds = 0;
  private respawnTimer = 0;
  private levelCompleteTimer = 0;
  private statusBannerMessage: string | null = null;
  private statusBannerTimer = 0;
  private animationFrameId: number | null = null;
  private lastTimestamp = 0;
  private pulsePhase = 0;

  private onStatsUpdate: (stats: GameStatsSnapshot) => void;
  private onAutoAdvanceLevel?: () => void;
  private lastHudBroadcast = 0;

  constructor(
    canvas: HTMLCanvasElement,
    initialLevel: LevelConfig,
    onStatsUpdate: (stats: GameStatsSnapshot) => void,
    onAutoAdvanceLevel?: () => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.level = initialLevel;
    this.onStatsUpdate = onStatsUpdate;
    this.onAutoAdvanceLevel = onAutoAdvanceLevel;

    this.setupHighDPI();
    this.loadLevel(initialLevel, 'PLAYING');
    this.bindEvents();
  }

  private setupHighDPI(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = CANVAS_WIDTH * dpr;
    this.canvas.height = CANVAS_HEIGHT * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public setAutoAdvanceHandler(handler: () => void): void {
    this.onAutoAdvanceLevel = handler;
  }

  public loadLevel(
    levelConfig: LevelConfig,
    initialStatus: GameStatsSnapshot['status'] = 'PLAYING'
  ): void {
    this.level = levelConfig;
    this.walls = levelConfig.walls.map((w) => ({
      ...w,
      revealAlpha: 0,
      holdTimer: 0,
      collisionAlpha: 0,
      lastWaveX: 0,
      lastWaveY: 0,
      lastWaveRadius: 0,
      activeSliceAlpha: 0,
    }));

    this.resonanceKeys = (levelConfig.keys || []).map((k) => ({
      ...k,
      collected: false,
      discovered: false,
      revealAlpha: 0,
      replyCooldown: 0,
    }));

    this.sentinels = (levelConfig.sentinels || []).map((s) => ({
      ...s,
      x: s.x1,
      y: s.y1,
      progress: 0,
      direction: 1,
      radius: s.radius || 10,
      revealAlpha: 0,
    }));

    this.waves = [];
    this.particles = [];
    this.deathMarkers = [];
    this.echoesUsed = 0;
    this.deaths = 0;
    this.elapsedSeconds = 0;
    this.levelCompleteTimer = 0;
    this.sonarCharges = this.maxSonarCharges;
    this.sonarRechargeTimer = 0;
    this.statusBannerMessage = null;
    this.statusBannerTimer = 0;
    this.status = initialStatus;

    this.resetPlayerPosition(true);
    this.broadcastStats(true);
  }

  private resetPlayerPosition(emitSpawnWave: boolean): void {
    this.player.x = this.level.start.x;
    this.player.y = this.level.start.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.trail = [];
    this.distanceSinceLastWave = 0;
    this.timeSinceLastWave = 0;
    this.moveParticleAccumulator = 0;

    if (emitSpawnWave) {
      this.spawnSoundWave(this.player.x, this.player.y, 250, false, true);
      this.spawnMovementLightScatter(this.player.x, this.player.y, 0, 0, 14);
    }
  }

  public setPlayerShape(shape: PlayerShape): void {
    this.player.shape = shape;
  }

  public getPlayerShape(): PlayerShape {
    return this.player.shape;
  }

  public setStatus(newStatus: GameStatsSnapshot['status']): void {
    this.status = newStatus;
    this.broadcastStats(true);
  }

  public getStatus(): GameStatsSnapshot['status'] {
    return this.status;
  }

  public setVirtualDirection(dx: number, dy: number): void {
    if (dx !== 0 || dy !== 0) {
      soundEngine.startAmbientMusic();
    }
    this.virtualInput.dx = dx;
    this.virtualInput.dy = dy;
  }

  public triggerManualSonar(): void {
    soundEngine.startAmbientMusic();
    if (this.status !== 'PLAYING' || this.sonarCooldown > 0) return;

    if (this.sonarCharges <= 0) {
      this.statusBannerMessage = 'Sonar Recharging — Move to emit step waves';
      this.statusBannerTimer = 1.2;
      this.broadcastStats(true);
      return;
    }

    this.sonarCharges -= 1;
    this.sonarCooldown = 0.3;
    this.spawnSoundWave(this.player.x, this.player.y, 390, true, false);
    this.spawnMovementLightScatter(this.player.x, this.player.y, 0, 0, 18);
    soundEngine.playActiveSonar();
    this.broadcastStats(true);
  }

  private spawnMovementLightScatter(
    x: number,
    y: number,
    moveDx: number,
    moveDy: number,
    count = 3,
    customPalette?: string[]
  ): void {
    const palette = customPalette || ['#38BDF8', '#7DD3FC', '#E0F2FE', '#0EA5E9'];
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 280) {
        this.particles.shift();
      }
      const randomAngle = Math.random() * Math.PI * 2;
      const spreadSpeed = 18 + Math.random() * 68;
      const vx =
        Math.cos(randomAngle) * spreadSpeed -
        moveDx * (22 + Math.random() * 28);
      const vy =
        Math.sin(randomAngle) * spreadSpeed -
        moveDy * (22 + Math.random() * 28);

      const offsetDist = Math.random() * 7;
      this.particles.push({
        x: x + Math.cos(randomAngle) * offsetDist,
        y: y + Math.sin(randomAngle) * offsetDist,
        vx,
        vy,
        drag: 2.2,
        size: 1.3 + Math.random() * 2.1,
        alpha: 0.75 + Math.random() * 0.25,
        decay: 1.15 + Math.random() * 0.9,
        color: palette[Math.floor(Math.random() * palette.length)],
        glowBlur: 8,
      });
    }
  }

  private spawnSoundWave(
    x: number,
    y: number,
    maxRadius = 265,
    isSonarPing = false,
    isFreeSpawnWave = false,
    customColor?: string,
    isEchoReply = false
  ): void {
    this.waves.push({
      x,
      y,
      radius: 4,
      maxRadius,
      speed: isSonarPing ? 340 : isEchoReply ? 220 : 275,
      alpha: 1,
      lineWidth: isSonarPing ? 2.6 : isEchoReply ? 1.6 : 1.8,
      color: customColor || (isSonarPing ? '#7DD3FC' : '#38BDF8'),
      isSonarPing,
      isEchoReply,
    });

    if (!isFreeSpawnWave && !isEchoReply) {
      this.echoesUsed += 1;
      this.broadcastStats(true);
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'Space',
      ].includes(code)
    ) {
      if (document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
      }
      soundEngine.startAmbientMusic();
    }

    if (code === 'Space') {
      this.triggerManualSonar();
      return;
    }

    const wasMoving = this.isAnyDirectionPressed();
    this.keys[code] = true;

    if (
      !wasMoving &&
      this.isAnyDirectionPressed() &&
      this.status === 'PLAYING' &&
      this.timeSinceLastWave > 0.12
    ) {
      this.spawnSoundWave(this.player.x, this.player.y, 260, false, false);
      this.spawnMovementLightScatter(this.player.x, this.player.y, 0, 0, 8);
      soundEngine.playStepWave(0.8);
      this.timeSinceLastWave = 0;
      this.distanceSinceLastWave = 0;
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private isAnyDirectionPressed(): boolean {
    return Boolean(
      this.keys['ArrowUp'] ||
        this.keys['KeyW'] ||
        this.keys['ArrowDown'] ||
        this.keys['KeyS'] ||
        this.keys['ArrowLeft'] ||
        this.keys['KeyA'] ||
        this.keys['ArrowRight'] ||
        this.keys['KeyD'] ||
        this.virtualInput.dx !== 0 ||
        this.virtualInput.dy !== 0
    );
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  public start(): void {
    this.lastTimestamp = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - this.lastTimestamp) / 1000;
      const dt = Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, 0.05)) : 0.016;
      this.lastTimestamp = now;

      this.update(dt, now);
      this.render();

      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private isExitUnlocked(): boolean {
    return this.resonanceKeys.every((k) => k.collected);
  }

  private update(dt: number, now: number): void {
    this.pulsePhase += dt * 3.4;

    if (this.sonarCooldown > 0) {
      this.sonarCooldown = Math.max(0, this.sonarCooldown - dt);
    }

    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer = Math.max(0, this.statusBannerTimer - dt);
      if (this.statusBannerTimer <= 0 && this.status === 'PLAYING') {
        this.statusBannerMessage = null;
        this.broadcastStats(true);
      }
    }

    // Recharge Sonar Charges over time (1 charge every 3.5 seconds)
    if (this.status === 'PLAYING' && this.sonarCharges < this.maxSonarCharges) {
      this.sonarRechargeTimer += dt;
      if (this.sonarRechargeTimer >= 3.5) {
        this.sonarRechargeTimer = 0;
        this.sonarCharges += 1;
        this.broadcastStats(true);
      }
    }

    // Update light particles
    this.updateParticles(dt);

    // Update death markers
    for (let i = this.deathMarkers.length - 1; i >= 0; i--) {
      this.deathMarkers[i].alpha = Math.max(
        0,
        this.deathMarkers[i].alpha - dt * 0.12
      );
      if (this.deathMarkers[i].alpha <= 0.01) {
        this.deathMarkers.splice(i, 1);
      }
    }

    // Update patrolling Shadow Sentinels
    this.updateSentinels(dt);

    // Update expanding sound waves & wall/key/sentinel illumination
    this.updateWavesAndObjects(dt);

    if (this.status === 'RESPAWNING') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.status = 'PLAYING';
        this.statusBannerMessage = null;
        this.resetPlayerPosition(true);
        this.broadcastStats(true);
      }
      return;
    }

    if (this.status === 'LEVEL_COMPLETE') {
      if (this.levelCompleteTimer > 0) {
        this.levelCompleteTimer = Math.max(0, this.levelCompleteTimer - dt);
        if (now - this.lastHudBroadcast > 100) {
          this.broadcastStats(false, now);
        }
        if (this.levelCompleteTimer <= 0 && this.onAutoAdvanceLevel) {
          this.onAutoAdvanceLevel();
        }
      }
      return;
    }

    if (this.status !== 'PLAYING') {
      return;
    }

    this.elapsedSeconds += dt;
    this.timeSinceLastWave += dt;

    // Compute input movement vector
    let dx = this.virtualInput.dx;
    let dy = this.virtualInput.dy;

    if (this.keys['ArrowUp'] || this.keys['KeyW']) dy -= 1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) dy += 1;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;

      const moveStep = this.player.speed * dt;
      this.player.vx = dx * this.player.speed;
      this.player.vy = dy * this.player.speed;

      this.player.x += dx * moveStep;
      this.player.y += dy * moveStep;

      // Record player luminous core trail
      this.player.trail.push({
        x: this.player.x,
        y: this.player.y,
        alpha: 0.55,
      });
      if (this.player.trail.length > 16) {
        this.player.trail.shift();
      }

      // Scatter small particles of light continuously while moving
      this.moveParticleAccumulator += moveStep;
      if (this.moveParticleAccumulator >= 6) {
        this.moveParticleAccumulator = 0;
        this.spawnMovementLightScatter(
          this.player.x,
          this.player.y,
          dx,
          dy,
          2
        );
      }

      this.distanceSinceLastWave += moveStep;

      // Trigger circular sound wave while moving
      if (this.distanceSinceLastWave >= 38 && this.timeSinceLastWave >= 0.17) {
        this.distanceSinceLastWave = 0;
        this.timeSinceLastWave = 0;
        this.spawnSoundWave(this.player.x, this.player.y, 265, false, false);
        this.spawnMovementLightScatter(
          this.player.x,
          this.player.y,
          dx,
          dy,
          7
        );
        soundEngine.playStepWave(0.75);
      }
    } else {
      this.player.vx = 0;
      this.player.vy = 0;
    }

    // Decay player trail
    for (let i = this.player.trail.length - 1; i >= 0; i--) {
      this.player.trail[i].alpha -= dt * 2.4;
      if (this.player.trail[i].alpha <= 0) {
        this.player.trail.splice(i, 1);
      }
    }

    // Check Resonance Key collection
    const halfSize = this.player.size / 2;
    for (const keyItem of this.resonanceKeys) {
      if (!keyItem.collected) {
        const dist = Math.hypot(
          this.player.x - keyItem.x,
          this.player.y - keyItem.y
        );
        if (dist < halfSize + 13) {
          keyItem.collected = true;
          keyItem.discovered = true;

          // Emit golden celebration wave & light particles
          this.spawnSoundWave(
            keyItem.x,
            keyItem.y,
            240,
            false,
            true,
            '#F59E0B',
            true
          );
          this.spawnMovementLightScatter(
            keyItem.x,
            keyItem.y,
            0,
            0,
            32,
            ['#FBBF24', '#F59E0B', '#FEF3C7']
          );

          if (this.isExitUnlocked()) {
            soundEngine.playExitUnlock();
            this.statusBannerMessage =
              'All Resonance Keys Gathered — Exit Portal Unlocked!';
            this.statusBannerTimer = 2.4;
          } else {
            soundEngine.playKeyCollect();
            const remaining = this.resonanceKeys.filter(
              (k) => !k.collected
            ).length;
            this.statusBannerMessage = `Resonance Key Collected — ${remaining} more needed to unlock Exit`;
            this.statusBannerTimer = 1.8;
          }
          this.broadcastStats(true);
        }
      }
    }

    // Check patrolling Shadow Sentinel collisions
    for (const sentinel of this.sentinels) {
      const dist = Math.hypot(
        this.player.x - sentinel.x,
        this.player.y - sentinel.y
      );
      if (dist < halfSize + sentinel.radius - 1) {
        sentinel.revealAlpha = 1.0;
        this.handlePlayerDeath(null, 'Shadow Sentinel impact — Keys reset, respawning at start');
        return;
      }
    }

    // Check hidden wall collisions
    for (const wall of this.walls) {
      if (
        this.checkPlayerWallCollision(
          this.player.x,
          this.player.y,
          halfSize,
          wall
        )
      ) {
        this.handlePlayerDeath(
          wall,
          'Hidden wall impact — Keys reset, respawning at start'
        );
        return;
      }
    }

    // Check exit zone collision
    const exit = this.level.exit;
    if (
      this.player.x + halfSize > exit.x &&
      this.player.x - halfSize < exit.x + exit.width &&
      this.player.y + halfSize > exit.y &&
      this.player.y - halfSize < exit.y + exit.height
    ) {
      if (this.isExitUnlocked()) {
        this.handleLevelComplete();
        return;
      } else if (this.statusBannerTimer <= 0) {
        const remaining = this.resonanceKeys.filter((k) => !k.collected).length;
        this.statusBannerMessage = `Exit Locked — Collect ${remaining} golden Resonance ${
          remaining === 1 ? 'Key' : 'Keys'
        } first!`;
        this.statusBannerTimer = 1.5;
        this.broadcastStats(true);
      }
    }

    // Throttled HUD timer update
    if (now - this.lastHudBroadcast > 120) {
      this.broadcastStats(false, now);
    }
  }

  private updateSentinels(dt: number): void {
    for (const s of this.sentinels) {
      const pathLen = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      if (pathLen > 1) {
        const progressDelta = (s.speed * dt) / pathLen;
        s.progress += progressDelta * s.direction;
        if (s.progress >= 1) {
          s.progress = 1;
          s.direction = -1;
        } else if (s.progress <= 0) {
          s.progress = 0;
          s.direction = 1;
        }
        s.x = s.x1 + (s.x2 - s.x1) * s.progress;
        s.y = s.y1 + (s.y2 - s.y1) * s.progress;
      }

      // Decay sentinel illumination slowly
      if (s.revealAlpha > 0) {
        s.revealAlpha = Math.max(0, s.revealAlpha - dt * 0.42);
      }

      // Subtle dark crimson trail sparks when revealed
      if (s.revealAlpha > 0.2 && Math.random() < 0.25 && this.particles.length < 260) {
        this.particles.push({
          x: s.x + (Math.random() - 0.5) * 8,
          y: s.y + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 18,
          vy: (Math.random() - 0.5) * 18,
          drag: 1.8,
          size: 1.5 + Math.random() * 1.5,
          alpha: s.revealAlpha * 0.75,
          decay: 1.5,
          color: '#F43F5E',
          glowBlur: 6,
        });
      }
    }
  }

  private updateWavesAndObjects(dt: number): void {
    const waveBandWidth = 18;
    let triggeredWallSoundThisFrame = false;

    for (const wall of this.walls) {
      wall.activeSliceAlpha = Math.max(0, wall.activeSliceAlpha - dt * 3.5);
    }

    for (const k of this.resonanceKeys) {
      if (k.replyCooldown > 0) {
        k.replyCooldown = Math.max(0, k.replyCooldown - dt);
      }
      if (k.revealAlpha > 0) {
        k.revealAlpha = Math.max(0, k.revealAlpha - dt * 0.35);
      }
    }

    // Expand sound waves
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      wave.radius += wave.speed * dt;
      const progress = wave.radius / wave.maxRadius;
      wave.alpha = Math.max(0, 1 - Math.pow(progress, 1.35));

      // 1. Illuminate intersecting hidden walls
      for (const wall of this.walls) {
        const closestX = Math.max(
          wall.x,
          Math.min(wave.x, wall.x + wall.width)
        );
        const closestY = Math.max(
          wall.y,
          Math.min(wave.y, wall.y + wall.height)
        );
        const distToClosest = Math.hypot(wave.x - closestX, wave.y - closestY);

        const farX =
          Math.abs(wave.x - wall.x) > Math.abs(wave.x - (wall.x + wall.width))
            ? wall.x
            : wall.x + wall.width;
        const farY =
          Math.abs(wave.y - wall.y) > Math.abs(wave.y - (wall.y + wall.height))
            ? wall.y
            : wall.y + wall.height;
        const distToFarthest = Math.hypot(wave.x - farX, wave.y - farY);

        if (
          wave.radius + waveBandWidth >= distToClosest &&
          wave.radius - waveBandWidth <= distToFarthest
        ) {
          const distanceFactor = Math.max(
            0.25,
            1 - distToClosest / wave.maxRadius
          );
          const targetAlpha = Math.min(1, wave.alpha * distanceFactor * 1.35);

          if (
            wall.revealAlpha < 0.15 &&
            targetAlpha > 0.35 &&
            !triggeredWallSoundThisFrame &&
            !wave.isEchoReply
          ) {
            triggeredWallSoundThisFrame = true;
            soundEngine.playWallEcho();
          }

          if (targetAlpha > wall.revealAlpha) {
            wall.revealAlpha = targetAlpha;
            wall.holdTimer = 0.28;
          }

          wall.lastWaveX = wave.x;
          wall.lastWaveY = wave.y;
          wall.lastWaveRadius = wave.radius;
          wall.activeSliceAlpha = Math.max(wall.activeSliceAlpha, wave.alpha);

          if (Math.random() < 0.22 && this.particles.length < 250) {
            const angle = Math.atan2(closestY - wave.y, closestX - wave.x);
            const px = wave.x + Math.cos(angle) * wave.radius;
            const py = wave.y + Math.sin(angle) * wave.radius;
            if (
              px >= wall.x - 4 &&
              px <= wall.x + wall.width + 4 &&
              py >= wall.y - 4 &&
              py <= wall.y + wall.height + 4
            ) {
              this.particles.push({
                x: px,
                y: py,
                vx: (Math.random() - 0.5) * 24,
                vy: (Math.random() - 0.5) * 24,
                drag: 1.5,
                size: 1.4 + Math.random() * 1.6,
                alpha: wave.alpha * 0.85,
                decay: 1.5 + Math.random() * 0.8,
                color: '#7DD3FC',
                glowBlur: 6,
              });
            }
          }
        }
      }

      // 2. Illuminate & trigger acoustic answer-ping from Resonance Keys
      if (!wave.isEchoReply) {
        for (const k of this.resonanceKeys) {
          if (k.collected) continue;
          const distToKey = Math.hypot(wave.x - k.x, wave.y - k.y);
          if (Math.abs(distToKey - wave.radius) <= waveBandWidth) {
            k.discovered = true;
            k.revealAlpha = 1.0;
            if (k.replyCooldown <= 0) {
              k.replyCooldown = 1.2;
              // Emit a golden harmonic answer ripple from the key so the player can pinpoint it!
              this.spawnSoundWave(k.x, k.y, 130, false, true, '#F59E0B', true);
            }
          }
        }

        // 3. Illuminate patrolling Shadow Sentinels when wave intersects them
        for (const s of this.sentinels) {
          const distToSentinel = Math.hypot(wave.x - s.x, wave.y - s.y);
          if (Math.abs(distToSentinel - wave.radius) <= waveBandWidth + 6) {
            s.revealAlpha = 1.0;
          }
        }
      }

      if (wave.radius >= wave.maxRadius || wave.alpha <= 0.01) {
        this.waves.splice(i, 1);
      }
    }

    // Fade out wall visibility over time
    for (const wall of this.walls) {
      if (wall.holdTimer > 0) {
        wall.holdTimer -= dt;
      } else if (wall.revealAlpha > 0) {
        wall.revealAlpha = Math.max(0, wall.revealAlpha - dt * 0.52);
      }

      if (wall.collisionAlpha > 0) {
        wall.collisionAlpha = Math.max(0, wall.collisionAlpha - dt * 0.45);
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const damping = Math.max(0, 1 - p.drag * dt);
      p.vx *= damping;
      p.vy *= damping;
      p.alpha -= p.decay * dt;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private checkPlayerWallCollision(
    px: number,
    py: number,
    halfSize: number,
    wall: WallRect
  ): boolean {
    if (this.player.shape === 'circle') {
      const closestX = Math.max(wall.x, Math.min(px, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(py, wall.y + wall.height));
      return Math.hypot(px - closestX, py - closestY) < halfSize;
    }
    const r = halfSize - 1;
    return (
      px + r > wall.x &&
      px - r < wall.x + wall.width &&
      py + r > wall.y &&
      py - r < wall.y + wall.height
    );
  }

  private handlePlayerDeath(
    collidedWall: WallState | null,
    reasonMessage: string
  ): void {
    this.deaths += 1;
    this.status = 'RESPAWNING';
    this.respawnTimer = 0.72;
    this.statusBannerMessage = reasonMessage;
    this.statusBannerTimer = 1.6;

    // Reset collected keys on death for mid-level challenge (keeping discovered=true so memory helps!)
    for (const k of this.resonanceKeys) {
      k.collected = false;
    }

    // Refill sonar charges on respawn
    this.sonarCharges = this.maxSonarCharges;
    this.sonarRechargeTimer = 0;

    if (collidedWall) {
      collidedWall.collisionAlpha = 1.0;
      collidedWall.revealAlpha = 1.0;
      collidedWall.holdTimer = 0.75;
    }

    this.deathMarkers.push({
      x: this.player.x,
      y: this.player.y,
      alpha: 0.75,
    });

    // Emit crimson shockwave
    this.waves.push({
      x: this.player.x,
      y: this.player.y,
      radius: 4,
      maxRadius: 210,
      speed: 270,
      alpha: 0.95,
      lineWidth: 2.4,
      color: '#F43F5E',
    });

    // Scatter 60 luminous light particles in all directions on death
    const deathColors = ['#F43F5E', '#FB7185', '#38BDF8', '#7DD3FC', '#E0F2FE'];
    for (let i = 0; i < 60; i++) {
      const angle = (Math.PI * 2 * i) / 60 + (Math.random() - 0.5) * 0.25;
      const speed = 35 + Math.random() * 210;
      this.particles.push({
        x: this.player.x,
        y: this.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 2.4,
        size: 1.6 + Math.random() * 3.0,
        alpha: 1,
        decay: 0.95 + Math.random() * 0.85,
        color: deathColors[i % deathColors.length],
        glowBlur: 12,
      });
    }

    soundEngine.playDeathCollision();
    this.broadcastStats(true);
  }

  private handleLevelComplete(): void {
    this.status = 'LEVEL_COMPLETE';
    this.levelCompleteTimer = 2.0;
    soundEngine.playLevelVictory();

    const exitCenterX = this.level.exit.x + this.level.exit.width / 2;
    const exitCenterY = this.level.exit.y + this.level.exit.height / 2;

    for (const wall of this.walls) {
      wall.revealAlpha = Math.max(wall.revealAlpha, 0.55);
      wall.holdTimer = 10;
    }

    for (let i = 0; i < 52; i++) {
      const angle = (Math.PI * 2 * i) / 52 + (Math.random() - 0.5) * 0.2;
      const speed = 45 + Math.random() * 175;
      this.particles.push({
        x: exitCenterX,
        y: exitCenterY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        drag: 1.9,
        size: 1.8 + Math.random() * 2.8,
        alpha: 1,
        decay: 0.75 + Math.random() * 0.55,
        color: i % 3 === 0 ? '#6EE7B7' : i % 3 === 1 ? '#10B981' : '#38BDF8',
        glowBlur: 10,
      });
    }

    this.broadcastStats(true);
  }

  private broadcastStats(force: boolean, now = performance.now()): void {
    if (force) {
      this.lastHudBroadcast = now;
    }
    const keysCollected = this.resonanceKeys.filter((k) => k.collected).length;
    this.onStatsUpdate({
      levelId: this.level.id,
      levelName: this.level.name,
      levelSubtitle: this.level.subtitle,
      echoesUsed: this.echoesUsed,
      parEchoes: this.level.parEchoes,
      deaths: this.deaths,
      elapsedSeconds: this.elapsedSeconds,
      keysCollected,
      keysTotal: this.resonanceKeys.length,
      sonarCharges: this.sonarCharges,
      maxSonarCharges: this.maxSonarCharges,
      status: this.status,
      deathMessage: this.statusBannerMessage,
      autoAdvanceRemaining: Math.ceil(this.levelCompleteTimer),
    });
  }

  private render(): void {
    const ctx = this.ctx;

    // 1. Pitch dark background canvas
    ctx.fillStyle = '#05070B';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Subtle start sanctuary marker
    this.renderStartMarker(ctx);

    // 3. Faint ghost markers at previous impact sites
    this.renderDeathMarkers(ctx);

    // 4. Expanding sound waves (light ripples)
    this.renderSoundWaves(ctx);

    // 5. Hidden walls temporarily illuminated by sound waves
    this.renderWalls(ctx);

    // 6. Resonance Keys (Acoustic Shards)
    this.renderResonanceKeys(ctx);

    // 7. Patrolling Shadow Sentinels
    this.renderSentinels(ctx);

    // 8. Exit Zone (Locked Amber vs Unlocked Emerald)
    this.renderExitZone(ctx);

    // 9. Scattered light particles
    this.renderParticles(ctx);

    // 10. Glowing blue player
    if (this.status !== 'RESPAWNING') {
      this.renderPlayer(ctx);
    }

    // 11. Floating touch joystick indicator when dragging on canvas
    if (this.touchJoystick.active) {
      this.renderTouchJoystick(ctx);
    }
  }

  private renderTouchJoystick(ctx: CanvasRenderingContext2D): void {
    const { originX, originY, currentX, currentY } = this.touchJoystick;
    const dx = currentX - originX;
    const dy = currentY - originY;
    const dist = Math.hypot(dx, dy);
    const maxR = 48;
    const clampedDist = Math.min(dist, maxR);
    const knobX = dist > 0 ? originX + (dx / dist) * clampedDist : originX;
    const knobY = dist > 0 ? originY + (dy / dist) * clampedDist : originY;

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(originX, originY, maxR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(knobX, knobY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.strokeStyle = '#E0F2FE';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#38BDF8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(knobX, knobY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private renderStartMarker(ctx: CanvasRenderingContext2D): void {
    const { x, y } = this.level.start;
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.fill();
    ctx.restore();
  }

  private renderDeathMarkers(ctx: CanvasRenderingContext2D): void {
    for (const marker of this.deathMarkers) {
      ctx.save();
      ctx.strokeStyle = `rgba(244, 63, 94, ${marker.alpha * 0.45})`;
      ctx.lineWidth = 1.25;
      const r = 7;
      ctx.beginPath();
      ctx.moveTo(marker.x - r, marker.y - r);
      ctx.lineTo(marker.x + r, marker.y + r);
      ctx.moveTo(marker.x + r, marker.y - r);
      ctx.lineTo(marker.x - r, marker.y + r);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderSoundWaves(ctx: CanvasRenderingContext2D): void {
    for (const wave of this.waves) {
      const alpha = Number.isFinite(wave.alpha)
        ? Math.max(0, Math.min(1, wave.alpha))
        : 0;
      const radius = Number.isFinite(wave.radius) ? Math.max(1, wave.radius) : 1;
      if (alpha <= 0.005) continue;

      ctx.save();

      const grad = ctx.createRadialGradient(
        wave.x,
        wave.y,
        Math.max(0, radius - 28),
        wave.x,
        wave.y,
        radius + 6
      );
      const isCrimson = wave.color === '#F43F5E';
      const isGold = wave.color === '#F59E0B';
      const rgb = isCrimson
        ? '244, 63, 94'
        : isGold
        ? '245, 158, 11'
        : '56, 189, 248';

      grad.addColorStop(0, `rgba(${rgb}, 0)`);
      grad.addColorStop(0.75, `rgba(${rgb}, ${(alpha * 0.09).toFixed(4)})`);
      grad.addColorStop(0.96, `rgba(${rgb}, ${(alpha * 0.28).toFixed(4)})`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius + 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isCrimson
        ? `rgba(244, 63, 94, ${(alpha * 0.9).toFixed(4)})`
        : isGold
        ? `rgba(251, 191, 36, ${(alpha * 0.9).toFixed(4)})`
        : `rgba(125, 211, 252, ${(alpha * 0.85).toFixed(4)})`;
      ctx.lineWidth = wave.lineWidth;
      ctx.shadowColor = wave.color;
      ctx.shadowBlur = 12 * alpha;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  private renderWalls(ctx: CanvasRenderingContext2D): void {
    for (const wall of this.walls) {
      const alpha = Math.max(wall.revealAlpha, wall.collisionAlpha);
      if (alpha <= 0.008) continue;

      ctx.save();

      const isColliding = wall.collisionAlpha > 0.15;
      const baseRgb = isColliding ? '244, 63, 94' : '56, 189, 248';
      const edgeRgb = isColliding ? '251, 113, 133' : '125, 211, 252';

      ctx.fillStyle = `rgba(${baseRgb}, ${alpha * 0.22})`;
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);

      ctx.strokeStyle = `rgba(${edgeRgb}, ${alpha * 0.88})`;
      ctx.lineWidth = 1.4;
      ctx.shadowColor = isColliding ? '#F43F5E' : '#38BDF8';
      ctx.shadowBlur = 10 * alpha;
      ctx.strokeRect(
        wall.x + 0.5,
        wall.y + 0.5,
        wall.width - 1,
        wall.height - 1
      );

      if (wall.activeSliceAlpha > 0.05 && wall.lastWaveRadius > 0) {
        ctx.beginPath();
        ctx.rect(wall.x, wall.y, wall.width, wall.height);
        ctx.clip();

        ctx.strokeStyle = `rgba(224, 242, 254, ${wall.activeSliceAlpha * 0.95})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(
          wall.lastWaveX,
          wall.lastWaveY,
          wall.lastWaveRadius,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private renderResonanceKeys(ctx: CanvasRenderingContext2D): void {
    const pulse = (Math.sin(this.pulsePhase * 1.3) + 1) * 0.5;

    for (const k of this.resonanceKeys) {
      if (k.collected) continue;

      // Subtle ambient shimmer in darkness (0.18), brighter once discovered (0.42), full bright when hit by wave
      const baseVisibility = k.discovered ? 0.42 : 0.18;
      const alpha = Math.min(1, Math.max(baseVisibility, k.revealAlpha));

      ctx.save();
      ctx.translate(k.x, k.y);

      // Soft golden halo
      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 26 + pulse * 6);
      halo.addColorStop(0, `rgba(245, 158, 11, ${alpha * 0.45})`);
      halo.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 26 + pulse * 6, 0, Math.PI * 2);
      ctx.fill();

      // Rotating diamond shard
      ctx.rotate(this.pulsePhase * 0.4);
      const r = 8 + pulse * 1.5;
      ctx.fillStyle = `rgba(251, 191, 36, ${alpha * 0.85})`;
      ctx.strokeStyle = `rgba(254, 243, 199, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 14 * alpha;

      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  private renderSentinels(ctx: CanvasRenderingContext2D): void {
    const pulse = (Math.sin(this.pulsePhase * 2.2) + 1) * 0.5;

    for (const s of this.sentinels) {
      // Faint crimson glint in darkness (0.24), full bright when illuminated by wave
      const alpha = Math.max(0.24, s.revealAlpha);

      ctx.save();

      // When illuminated by a sound wave, reveal the Sentinel's patrol track line
      if (s.revealAlpha > 0.05) {
        ctx.strokeStyle = `rgba(244, 63, 94, ${s.revealAlpha * 0.35})`;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Danger aura
      const aura = ctx.createRadialGradient(
        s.x,
        s.y,
        2,
        s.x,
        s.y,
        24 + pulse * 5
      );
      aura.addColorStop(0, `rgba(244, 63, 94, ${alpha * 0.48})`);
      aura.addColorStop(1, 'rgba(244, 63, 94, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 24 + pulse * 5, 0, Math.PI * 2);
      ctx.fill();

      // Sentinel core
      ctx.fillStyle = `rgba(244, 63, 94, ${alpha * 0.9})`;
      ctx.strokeStyle = `rgba(254, 205, 211, ${alpha})`;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = '#F43F5E';
      ctx.shadowBlur = 14 * alpha;

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner dark eye
      ctx.fillStyle = '#05070B';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private renderExitZone(ctx: CanvasRenderingContext2D): void {
    const exit = this.level.exit;
    const cx = exit.x + exit.width / 2;
    const cy = exit.y + exit.height / 2;
    const pulse = (Math.sin(this.pulsePhase) + 1) * 0.5;
    const unlocked = this.isExitUnlocked();

    ctx.save();

    const primaryRgb = unlocked ? '16, 185, 129' : '245, 158, 11';
    const strokeRgb = unlocked ? '52, 211, 153' : '251, 191, 36';
    const innerRgb = unlocked ? '167, 243, 208' : '253, 230, 138';
    const glowHex = unlocked ? '#10B981' : '#F59E0B';

    const grad = ctx.createRadialGradient(
      cx,
      cy,
      4,
      cx,
      cy,
      exit.width * 0.95 + pulse * 10
    );
    grad.addColorStop(0, `rgba(${primaryRgb}, 0.42)`);
    grad.addColorStop(0.5, `rgba(${primaryRgb}, 0.14)`);
    grad.addColorStop(1, `rgba(${primaryRgb}, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, exit.width * 0.95 + pulse * 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${primaryRgb}, ${0.16 + pulse * 0.1})`;
    ctx.strokeStyle = `rgba(${strokeRgb}, ${0.75 + pulse * 0.25})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = glowHex;
    ctx.shadowBlur = 16 + pulse * 8;

    ctx.beginPath();
    ctx.roundRect(exit.x, exit.y, exit.width, exit.height, 8);
    ctx.fill();
    ctx.stroke();

    const inset = 10;
    ctx.strokeStyle = `rgba(${innerRgb}, ${0.4 + pulse * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(
      exit.x + inset,
      exit.y + inset,
      exit.width - inset * 2,
      exit.height - inset * 2,
      4
    );
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = unlocked ? '#A7F3D0' : '#FDE68A';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unlocked ? 'EXIT' : 'LOCKED', cx, cy);

    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.glowBlur;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D): void {
    const { x, y, size, shape, trail } = this.player;
    const half = size / 2;

    ctx.save();

    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const ratio = (i + 1) / trail.length;
      const trailSize = size * (0.4 + 0.45 * ratio);
      ctx.fillStyle = `rgba(56, 189, 248, ${Math.max(0, t.alpha * 0.25)})`;
      ctx.beginPath();
      if (shape === 'circle') {
        ctx.arc(t.x, t.y, trailSize / 2, 0, Math.PI * 2);
      } else {
        ctx.roundRect(
          t.x - trailSize / 2,
          t.y - trailSize / 2,
          trailSize,
          trailSize,
          2
        );
      }
      ctx.fill();
    }

    const aura = ctx.createRadialGradient(x, y, 2, x, y, 36);
    aura.addColorStop(0, 'rgba(56, 189, 248, 0.38)');
    aura.addColorStop(0.5, 'rgba(56, 189, 248, 0.10)');
    aura.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, 36, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#38BDF8';
    ctx.strokeStyle = '#E0F2FE';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#38BDF8';
    ctx.shadowBlur = 18;

    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, half, 0, Math.PI * 2);
    } else {
      ctx.roundRect(x - half, y - half, size, size, 3);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#F0F9FF';
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, 3, 0, Math.PI * 2);
    } else {
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    ctx.fill();

    ctx.restore();
  }
}
