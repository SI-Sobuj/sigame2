export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResonanceKeyConfig {
  x: number;
  y: number;
}

export interface SentinelConfig {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  speed: number;
  radius?: number;
}

export interface LevelConfig {
  id: number;
  name: string;
  subtitle: string;
  start: { x: number; y: number };
  exit: { x: number; y: number; width: number; height: number };
  parEchoes: number;
  walls: WallRect[];
  keys: ResonanceKeyConfig[];
  sentinels: SentinelConfig[];
  isProcedural?: boolean;
}

export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 560;

// Outer boundary walls shared across all levels (12px thick)
const BOUNDARY_WALLS: WallRect[] = [
  { x: 0, y: 0, width: CANVAS_WIDTH, height: 12 }, // Top
  { x: 0, y: CANVAS_HEIGHT - 12, width: CANVAS_WIDTH, height: 12 }, // Bottom
  { x: 0, y: 0, width: 12, height: CANVAS_HEIGHT }, // Left
  { x: CANVAS_WIDTH - 12, y: 0, width: 12, height: CANVAS_HEIGHT }, // Right
];

/**
 * Generates a guaranteed-solvable procedural maze using Recursive Backtracker,
 * along with cell-centered Resonance Keys and patrolling Shadow Sentinels.
 */
export function generateProceduralLevel(
  seedOffset = 0,
  difficultyTier = 1
): {
  walls: WallRect[];
  keys: ResonanceKeyConfig[];
  sentinels: SentinelConfig[];
} {
  const cols = Math.min(13, 9 + difficultyTier);
  const rows = Math.min(8, 5 + Math.floor((difficultyTier + 1) / 2));
  const margin = 12;
  const innerW = CANVAS_WIDTH - margin * 2;
  const innerH = CANVAS_HEIGHT - margin * 2;
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const wallThick = 10;

  interface Cell {
    r: number;
    c: number;
    visited: boolean;
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  }

  const grid: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        r,
        c,
        visited: false,
        top: true,
        right: true,
        bottom: true,
        left: true,
      });
    }
    grid.push(row);
  }

  let seed = Date.now() + seedOffset * 9973;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const stack: Cell[] = [];
  const startCell = grid[0][0];
  startCell.visited = true;
  stack.push(startCell);

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: { cell: Cell; dir: 'top' | 'right' | 'bottom' | 'left' }[] =
      [];

    const { r, c } = current;
    if (r > 0 && !grid[r - 1][c].visited)
      neighbors.push({ cell: grid[r - 1][c], dir: 'top' });
    if (c < cols - 1 && !grid[r][c + 1].visited)
      neighbors.push({ cell: grid[r][c + 1], dir: 'right' });
    if (r < rows - 1 && !grid[r + 1][c].visited)
      neighbors.push({ cell: grid[r + 1][c], dir: 'bottom' });
    if (c > 0 && !grid[r][c - 1].visited)
      neighbors.push({ cell: grid[r][c - 1], dir: 'left' });

    if (neighbors.length > 0) {
      const nextItem = neighbors[Math.floor(rand() * neighbors.length)];
      const next = nextItem.cell;
      if (nextItem.dir === 'top') {
        current.top = false;
        next.bottom = false;
      } else if (nextItem.dir === 'right') {
        current.right = false;
        next.left = false;
      } else if (nextItem.dir === 'bottom') {
        current.bottom = false;
        next.top = false;
      } else if (nextItem.dir === 'left') {
        current.left = false;
        next.right = false;
      }
      next.visited = true;
      stack.push(next);
    } else {
      stack.pop();
    }
  }

  // Open extra tactical loops (20% of internal walls) so the player can dodge Sentinels
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1 && grid[r][c].right && rand() < 0.22) {
        grid[r][c].right = false;
        grid[r][c + 1].left = false;
      }
      if (r < rows - 1 && grid[r][c].bottom && rand() < 0.22) {
        grid[r][c].bottom = false;
        grid[r + 1][c].top = false;
      }
    }
  }

  const walls: WallRect[] = [...BOUNDARY_WALLS];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const cx = margin + c * cellW;
      const cy = margin + r * cellH;

      if (c < cols - 1 && cell.right) {
        walls.push({
          x: Math.round(cx + cellW - wallThick / 2),
          y: Math.round(cy - wallThick / 2),
          width: wallThick,
          height: Math.round(cellH + wallThick),
        });
      }
      if (r < rows - 1 && cell.bottom) {
        walls.push({
          x: Math.round(cx - wallThick / 2),
          y: Math.round(cy + cellH - wallThick / 2),
          width: Math.round(cellW + wallThick),
          height: wallThick,
        });
      }
    }
  }

  const cellCenter = (c: number, r: number) => ({
    x: Math.round(margin + (c + 0.5) * cellW),
    y: Math.round(margin + (r + 0.5) * cellH),
  });

  // Place 3 Resonance Keys in distinct quadrants of the maze
  const keys: ResonanceKeyConfig[] = [
    cellCenter(Math.floor(cols * 0.35), rows - 1),
    cellCenter(Math.floor(cols * 0.65), 0),
    cellCenter(cols - 1, Math.floor(rows * 0.35)),
  ];

  // Place patrolling Sentinels along open adjacent cells
  const sentinels: SentinelConfig[] = [];
  const targetSentinelCount = Math.min(4, 1 + difficultyTier);
  for (let r = 1; r < rows - 1 && sentinels.length < targetSentinelCount; r++) {
    for (
      let c = 1;
      c < cols - 2 && sentinels.length < targetSentinelCount;
      c++
    ) {
      if (!grid[r][c].right) {
        const p1 = cellCenter(c, r);
        const p2 = cellCenter(c + 1, r);
        sentinels.push({
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          speed: 75 + difficultyTier * 10,
        });
        c += 2;
      } else if (!grid[r][c].bottom) {
        const p1 = cellCenter(c, r);
        const p2 = cellCenter(c, r + 1);
        sentinels.push({
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          speed: 75 + difficultyTier * 10,
        });
        c += 2;
      }
    }
  }

  return { walls, keys, sentinels };
}

export function generateProceduralWalls(
  seedOffset = 0,
  difficultyTier = 1
): WallRect[] {
  return generateProceduralLevel(seedOffset, difficultyTier).walls;
}

const initialProc = generateProceduralLevel(1, 1);

export const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: '01. The First Pulse',
    subtitle:
      'Collect the golden Resonance Key to unlock the Exit. Watch out for the patrolling Shadow Sentinel.',
    start: { x: 80, y: 280 },
    exit: { x: 850, y: 245, width: 64, height: 70 },
    parEchoes: 22,
    walls: [
      ...BOUNDARY_WALLS,
      // Left S-baffle with upper alcove
      { x: 210, y: 12, width: 16, height: 350 },
      { x: 210, y: 346, width: 140, height: 16 },
      // Central split chamber
      { x: 450, y: 185, width: 16, height: 363 },
      { x: 450, y: 185, width: 145, height: 16 },
      // Upper central baffle
      { x: 580, y: 12, width: 16, height: 105 },
      // Right gate with lower key pocket
      { x: 725, y: 12, width: 16, height: 345 },
      { x: 615, y: 430, width: 126, height: 16 },
    ],
    keys: [
      { x: 525, y: 100 }, // Upper middle resonance chamber
    ],
    sentinels: [
      // Slow sentinel patrolling the final corridor before exit
      { x1: 785, y1: 95, x2: 785, y2: 465, speed: 78 },
    ],
  },
  {
    id: 2,
    name: '02. Whispering Corridors',
    subtitle:
      'Gather 2 Resonance Keys to unlock the Exit. Sound waves reveal both hidden walls and patrolling Sentinels.',
    start: { x: 75, y: 85 },
    exit: { x: 855, y: 450, width: 60, height: 64 },
    parEchoes: 28,
    walls: [
      ...BOUNDARY_WALLS,
      // Upper horizontal channel with chicane
      { x: 12, y: 165, width: 690, height: 14 },
      { x: 310, y: 12, width: 14, height: 85 },
      // Vertical divider creating a turn
      { x: 688, y: 165, width: 14, height: 220 },
      // Middle return channel
      { x: 195, y: 375, width: 507, height: 14 },
      // Center obstacle pillars inside middle corridor
      { x: 340, y: 179, width: 14, height: 115 },
      { x: 515, y: 265, width: 14, height: 110 },
      // Lower false wall pocket
      { x: 420, y: 455, width: 14, height: 93 },
      // Final gate before exit
      { x: 810, y: 12, width: 14, height: 390 },
    ],
    keys: [
      { x: 620, y: 270 }, // Inside middle chamber
      { x: 880, y: 85 },  // Upper right alcove behind the final gate
    ],
    sentinels: [
      { x1: 430, y1: 205, x2: 430, y2: 345, speed: 88 },
      { x1: 260, y1: 465, x2: 680, y2: 465, speed: 98 },
    ],
  },
  {
    id: 3,
    name: '03. Resonance Chamber',
    subtitle:
      'Interlocking acoustic baffles with 2 Resonance Keys and twin Shadow Sentinels.',
    start: { x: 70, y: 480 },
    exit: { x: 860, y: 60, width: 58, height: 58 },
    parEchoes: 34,
    walls: [
      ...BOUNDARY_WALLS,
      // Left entry lane
      { x: 150, y: 135, width: 14, height: 413 },
      // Top cross-bar
      { x: 150, y: 135, width: 280, height: 14 },
      // Second vertical drop
      { x: 416, y: 135, width: 14, height: 295 },
      // Lower central chamber wall
      { x: 270, y: 416, width: 430, height: 14 },
      // Central floating monolith
      { x: 265, y: 245, width: 65, height: 65 },
      // Right ascent lane
      { x: 560, y: 12, width: 14, height: 310 },
      { x: 686, y: 130, width: 14, height: 300 },
      // Final baffles near exit
      { x: 686, y: 130, width: 175, height: 14 },
      { x: 790, y: 265, width: 158, height: 14 },
    ],
    keys: [
      { x: 220, y: 355 }, // Inner left pocket
      { x: 625, y: 360 }, // Right ascent chamber
    ],
    sentinels: [
      { x1: 200, y1: 75, x2: 500, y2: 75, speed: 96 },
      { x1: 745, y1: 195, x2: 745, y2: 490, speed: 102 },
    ],
  },
  {
    id: 4,
    name: '04. Blind Switchbacks',
    subtitle:
      'Start in the heart of the spiral. Recover all 3 Resonance Keys while evading faster Sentinels.',
    start: { x: 480, y: 280 },
    exit: { x: 865, y: 465, width: 56, height: 56 },
    parEchoes: 42,
    walls: [
      ...BOUNDARY_WALLS,
      // Inner sanctum box around start (open on top)
      { x: 390, y: 210, width: 14, height: 150 },
      { x: 390, y: 350, width: 180, height: 14 },
      { x: 560, y: 130, width: 14, height: 234 },
      // Top spiral cap
      { x: 270, y: 120, width: 304, height: 14 },
      // Left spiral arm
      { x: 270, y: 120, width: 14, height: 340 },
      // Bottom spiral arm
      { x: 270, y: 450, width: 430, height: 14 },
      // Right outer spiral arm
      { x: 690, y: 90, width: 14, height: 374 },
      // Outer left chicane
      { x: 130, y: 12, width: 14, height: 440 },
      // Right exit gauntlet baffles
      { x: 704, y: 210, width: 150, height: 14 },
      { x: 800, y: 340, width: 148, height: 14 },
    ],
    keys: [
      { x: 335, y: 400 }, // Inside spiral arm
      { x: 70, y: 80 },   // Far top-left dead-end behind chicane
      { x: 765, y: 150 }, // Upper-right gauntlet
    ],
    sentinels: [
      { x1: 630, y1: 145, x2: 630, y2: 405, speed: 105 },
      { x1: 200, y1: 65, x2: 630, y2: 65, speed: 112 },
      { x1: 200, y1: 505, x2: 750, y2: 505, speed: 110 },
    ],
  },
  {
    id: 5,
    name: '05. The Abyssal Vault',
    subtitle:
      'A high-security acoustic vault guarded by 3 Sentinels and 3 locked Resonance Keys.',
    start: { x: 65, y: 280 },
    exit: { x: 870, y: 252, width: 56, height: 56 },
    parEchoes: 48,
    walls: [
      ...BOUNDARY_WALLS,
      // Entry splitter
      { x: 150, y: 180, width: 14, height: 200 },
      { x: 150, y: 180, width: 160, height: 14 },
      { x: 150, y: 366, width: 160, height: 14 },

      // Upper wing obstacles
      { x: 300, y: 12, width: 14, height: 110 },
      { x: 430, y: 85, width: 14, height: 195 },
      { x: 300, y: 266, width: 144, height: 14 },

      // Lower wing obstacles
      { x: 430, y: 366, width: 14, height: 182 },
      { x: 290, y: 445, width: 70, height: 14 },

      // Central lattice
      { x: 555, y: 12, width: 14, height: 230 },
      { x: 555, y: 320, width: 14, height: 228 },
      { x: 555, y: 235, width: 130, height: 14 },
      { x: 555, y: 320, width: 130, height: 14 },

      // Right sanctum shield
      { x: 675, y: 100, width: 14, height: 149 },
      { x: 675, y: 320, width: 14, height: 145 },
      { x: 795, y: 170, width: 14, height: 220 },
      { x: 689, y: 100, width: 120, height: 14 },
      { x: 689, y: 451, width: 120, height: 14 },
    ],
    keys: [
      { x: 230, y: 275 }, // Central lockbox alcove
      { x: 365, y: 500 }, // Lower wing vault
      { x: 735, y: 175 }, // Upper right shield room
    ],
    sentinels: [
      { x1: 495, y1: 65, x2: 495, y2: 495, speed: 115 },
      { x1: 615, y1: 55, x2: 615, y2: 205, speed: 95 },
      { x1: 835, y1: 95, x2: 835, y2: 465, speed: 118 },
    ],
  },
  {
    id: 6,
    name: '06. Procedural Labyrinth',
    subtitle:
      'Algorithmically generated maze with 3 Resonance Keys and patrolling Sentinels.',
    start: { x: 58, y: 56 },
    exit: { x: 874, y: 476, width: 48, height: 48 },
    parEchoes: 54,
    isProcedural: true,
    walls: initialProc.walls,
    keys: initialProc.keys,
    sentinels: initialProc.sentinels,
  },
];
