export const STANDALONE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shadow Echo — 2D Acoustic Puzzle Game</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="game-shell">
    <header class="hud-bar">
      <div class="brand">Shadow Echo</div>
      <div class="metrics">
        <span id="level-label">Level 1</span>
        <span class="sep">·</span>
        <span id="echo-count">Echoes: 0</span>
        <span class="sep">·</span>
        <span id="death-count">Deaths: 0</span>
      </div>
      <div class="actions">
        <button id="audio-btn" type="button">Audio & Ambient: On</button>
        <button id="restart-btn" type="button">Restart Level</button>
      </div>
    </header>

    <div class="canvas-stage">
      <canvas id="gameCanvas" width="960" height="560"></canvas>
    </div>

    <footer class="controls-bar">
      <span>Move: <strong>WASD / Arrow Keys</strong></span>
      <span class="sep">·</span>
      <span>Sonar Ping: <strong>Spacebar</strong></span>
      <span class="sep">·</span>
      <span>Goal: Reach the glowing green exit without hitting hidden walls</span>
    </footer>
  </main>

  <script src="game.js"></script>
</body>
</html>`;

export const STANDALONE_CSS = `/* style.css — Modern Dark Atmospheric Styling */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: #05070B;
  color: #F1F5F9;
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.game-shell {
  width: 100%;
  max-width: 960px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hud-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #0A0F18;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
}

.brand {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #F8FAFC;
}

.metrics {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: monospace;
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
  color: #94A3B8;
}

.sep {
  color: #475569;
}

.actions {
  display: flex;
  gap: 8px;
}

button {
  background: #1E293B;
  color: #F8FAFC;
  border: 1px solid rgba(148, 163, 184, 0.2);
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}

button:hover {
  background: #334155;
}

.canvas-stage {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(56, 189, 248, 0.18);
  background: #05070B;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75);
}

canvas {
  display: block;
  width: 100%;
  height: auto;
}

.controls-bar {
  display: flex;
  justify-content: center;
  gap: 12px;
  font-size: 0.8125rem;
  color: #64748B;
}`;

export const STANDALONE_JS = `// game.js — Pure Vanilla JS & HTML5 Canvas Engine for "Shadow Echo"
// Features: Light Particle Scatter, Progressive Multi-Level Mazes, and Dark Low-Fi Ambient + Echo SFX
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const echoLabel = document.getElementById('echo-count');
const deathLabel = document.getElementById('death-count');
const levelLabel = document.getElementById('level-label');
const restartBtn = document.getElementById('restart-btn');
const audioBtn = document.getElementById('audio-btn');

// --- Web Audio API: Dark Low-Fi Ambient Music & Feedback Delay Echo Network ---
let audioCtx = null;
let echoInput = null;
let audioEnabled = true;
let ambientStarted = false;

function initAudio() {
  if (!audioEnabled) return;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    const master = audioCtx.createGain();
    master.gain.value = 0.85;
    master.connect(audioCtx.destination);

    // Canyon Echo Feedback Delay Loop
    echoInput = audioCtx.createGain();
    const delay = audioCtx.createDelay(2.0);
    delay.delayTime.value = 0.24;
    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.52;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;

    echoInput.connect(master);
    echoInput.connect(delay);
    delay.connect(filter);
    filter.connect(feedback);
    feedback.connect(delay);
    filter.connect(master);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!ambientStarted) startAmbientMusic();
}

function startAmbientMusic() {
  if (!audioCtx || ambientStarted) return;
  ambientStarted = true;
  const now = audioCtx.currentTime;

  const padFilter = audioCtx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 210;
  padFilter.connect(audioCtx.destination);

  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const droneGain = audioCtx.createGain();
  osc1.type = 'sawtooth';
  osc2.type = 'triangle';
  osc1.frequency.value = 65.41; // C2
  osc2.frequency.value = 98.00; // G2
  droneGain.gain.value = 0.045;

  osc1.connect(droneGain);
  osc2.connect(droneGain);
  droneGain.connect(padFilter);
  osc1.start(now);
  osc2.start(now);

  // Slow low-fi echoing minor arpeggio notes
  const notes = [261.63, 311.13, 392.00, 466.16, 523.25, 349.23];
  let step = 0;
  setInterval(() => {
    if (!audioEnabled || !audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(notes[step++ % notes.length], t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.028, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.5);
    osc.connect(g);
    g.connect(echoInput);
    osc.start(t);
    osc.stop(t + 1.55);
  }, 1850);
}

function playEchoTone(startFreq, endFreq, duration = 0.24, type = 'sine', vol = 0.08) {
  if (!audioEnabled || !audioCtx || !echoInput) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, t);
  osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0008, t + duration);
  osc.connect(g);
  g.connect(echoInput);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// --- Progressive Levels + Procedural Maze Generator ---
const BOUNDARIES = [
  { x: 0, y: 0, width: 960, height: 12 },
  { x: 0, y: 548, width: 960, height: 12 },
  { x: 0, y: 0, width: 12, height: 560 },
  { x: 948, y: 0, width: 12, height: 560 }
];

const HANDCRAFTED_LEVELS = [
  {
    start: { x: 85, y: 280 },
    exit: { x: 840, y: 245, width: 64, height: 70 },
    walls: [
      ...BOUNDARIES,
      { x: 260, y: 12, width: 16, height: 360 },
      { x: 500, y: 190, width: 16, height: 358 },
      { x: 710, y: 12, width: 16, height: 340 }
    ]
  },
  {
    start: { x: 75, y: 85 },
    exit: { x: 855, y: 450, width: 60, height: 64 },
    walls: [
      ...BOUNDARIES,
      { x: 12, y: 165, width: 690, height: 14 },
      { x: 688, y: 165, width: 14, height: 220 },
      { x: 210, y: 375, width: 492, height: 14 },
      { x: 350, y: 179, width: 14, height: 110 },
      { x: 520, y: 275, width: 14, height: 100 },
      { x: 810, y: 12, width: 14, height: 390 }
    ]
  },
  {
    start: { x: 70, y: 480 },
    exit: { x: 860, y: 60, width: 58, height: 58 },
    walls: [
      ...BOUNDARIES,
      { x: 150, y: 140, width: 14, height: 408 },
      { x: 150, y: 140, width: 280, height: 14 },
      { x: 416, y: 140, width: 14, height: 290 },
      { x: 280, y: 416, width: 420, height: 14 },
      { x: 275, y: 250, width: 60, height: 60 },
      { x: 560, y: 12, width: 14, height: 310 },
      { x: 686, y: 130, width: 14, height: 300 },
      { x: 686, y: 130, width: 175, height: 14 },
      { x: 790, y: 260, width: 158, height: 14 }
    ]
  }
];

let currentLevelIndex = 0;
let activeLevel = HANDCRAFTED_LEVELS[0];
let walls = [];
let waves = [];
let particles = [];
let echoes = 0;
let deaths = 0;
let distMoved = 0;
let particleStep = 0;
let respawningTimer = 0;
const keys = {};

const player = { x: 85, y: 280, size: 16, speed: 215 };

function scatterLightParticles(x, y, count, colors) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 25 + Math.random() * 145;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1.5 + Math.random() * 2.5,
      alpha: 1,
      decay: 0.9 + Math.random() * 0.9,
      color: colors[i % colors.length]
    });
  }
}

function loadLevel(idx) {
  currentLevelIndex = idx;
  activeLevel = HANDCRAFTED_LEVELS[idx % HANDCRAFTED_LEVELS.length];
  player.x = activeLevel.start.x;
  player.y = activeLevel.start.y;
  walls = activeLevel.walls.map(w => ({ ...w, alpha: 0, hold: 0 }));
  waves = [];
  distMoved = 0;
  levelLabel.textContent = \`Level \${idx + 1}\`;
  emitWave(player.x, player.y, 240);
  scatterLightParticles(player.x, player.y, 14, ['#38BDF8', '#7DD3FC', '#E0F2FE']);
}

function emitWave(x, y, maxRadius = 265) {
  waves.push({ x, y, radius: 4, maxRadius, speed: 275, alpha: 1 });
  echoes++;
  echoLabel.textContent = \`Echoes: \${echoes}\`;
  playEchoTone(587.33, 293.66, 0.24, 'sine', 0.08);
}

window.addEventListener('keydown', e => {
  initAudio();
  keys[e.code] = true;
  if (e.code === 'Space') {
    emitWave(player.x, player.y, 320);
    scatterLightParticles(player.x, player.y, 16, ['#38BDF8', '#7DD3FC', '#E0F2FE']);
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
restartBtn.addEventListener('click', () => loadLevel(currentLevelIndex));
audioBtn.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  audioBtn.textContent = \`Audio & Ambient: \${audioEnabled ? 'On' : 'Muted'}\`;
});

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  // Update light particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.2 * dt;
    p.vy *= 1 - 2.2 * dt;
    p.alpha -= p.decay * dt;
    if (p.alpha <= 0) particles.splice(i, 1);
  }

  // Expand sound waves & reveal intersecting walls
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.radius += w.speed * dt;
    w.alpha = Math.max(0, 1 - w.radius / w.maxRadius);

    for (const wall of walls) {
      const cx = Math.max(wall.x, Math.min(w.x, wall.x + wall.width));
      const cy = Math.max(wall.y, Math.min(w.y, wall.y + wall.height));
      const dist = Math.hypot(w.x - cx, w.y - cy);
      if (Math.abs(dist - w.radius) < 18) {
        wall.alpha = Math.max(wall.alpha, w.alpha);
        wall.hold = 0.25;
      }
    }
    if (w.radius >= w.maxRadius) waves.splice(i, 1);
  }

  for (const wall of walls) {
    if (wall.hold > 0) wall.hold -= dt;
    else wall.alpha = Math.max(0, wall.alpha - dt * 0.55);
  }

  if (respawningTimer > 0) {
    respawningTimer -= dt;
    if (respawningTimer <= 0) {
      player.x = activeLevel.start.x;
      player.y = activeLevel.start.y;
      emitWave(player.x, player.y, 240);
    }
    return;
  }

  let dx = 0, dy = 0;
  if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
  if (keys['ArrowDown'] || keys['KeyS']) dy += 1;
  if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    const step = player.speed * dt;
    player.x += (dx / len) * step;
    player.y += (dy / len) * step;
    distMoved += step;
    particleStep += step;

    if (particleStep >= 7) {
      particleStep = 0;
      scatterLightParticles(player.x, player.y, 2, ['#38BDF8', '#7DD3FC', '#E0F2FE']);
    }

    if (distMoved >= 38) {
      distMoved = 0;
      emitWave(player.x, player.y, 265);
      scatterLightParticles(player.x, player.y, 6, ['#38BDF8', '#7DD3FC']);
    }
  }

  // Check player collision with hidden walls
  const r = player.size / 2;
  for (const wall of walls) {
    if (
      player.x + r > wall.x && player.x - r < wall.x + wall.width &&
      player.y + r > wall.y && player.y - r < wall.y + wall.height
    ) {
      deaths++;
      deathLabel.textContent = \`Deaths: \${deaths}\`;
      wall.alpha = 1;
      wall.hold = 0.7;
      scatterLightParticles(player.x, player.y, 50, ['#F43F5E', '#FB7185', '#38BDF8', '#E0F2FE']);
      playEchoTone(190, 48, 0.45, 'sawtooth', 0.14);
      respawningTimer = 0.65;
      return;
    }
  }

  // Check exit collision -> Advance to next harder maze
  const exit = activeLevel.exit;
  if (
    player.x + r > exit.x && player.x - r < exit.x + exit.width &&
    player.y + r > exit.y && player.y - r < exit.y + exit.height
  ) {
    playEchoTone(523.25, 1046.5, 0.55, 'sine', 0.12);
    scatterLightParticles(exit.x + exit.width / 2, exit.y + exit.height / 2, 40, ['#10B981', '#6EE7B7']);
    loadLevel(currentLevelIndex + 1);
  }
}

function draw() {
  ctx.fillStyle = '#05070B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const w of waves) {
    ctx.strokeStyle = \`rgba(125, 211, 252, \${w.alpha * 0.85})\`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const wall of walls) {
    if (wall.alpha <= 0.01) continue;
    ctx.fillStyle = \`rgba(56, 189, 248, \${wall.alpha * 0.22})\`;
    ctx.strokeStyle = \`rgba(125, 211, 252, \${wall.alpha * 0.9})\`;
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
  }

  const exit = activeLevel.exit;
  ctx.save();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
  ctx.strokeStyle = '#34D399';
  ctx.shadowColor = '#10B981';
  ctx.shadowBlur = 18;
  ctx.fillRect(exit.x, exit.y, exit.width, exit.height);
  ctx.strokeRect(exit.x, exit.y, exit.width, exit.height);
  ctx.restore();

  for (const p of particles) {
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (respawningTimer <= 0) {
    ctx.save();
    ctx.fillStyle = '#38BDF8';
    ctx.shadowColor = '#38BDF8';
    ctx.shadowBlur = 16;
    ctx.fillRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size);
    ctx.restore();
  }
}

loadLevel(0);
requestAnimationFrame(loop);`;
