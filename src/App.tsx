              /**
               * @license
               * SPDX-License-Identifier: Apache-2.0
               */

              import React, { useCallback, useEffect, useRef, useState } from 'react';
              import {
                ArrowDown,
                ArrowLeft,
                ArrowRight,
                ArrowUp,
                Check,
                Code2,
                Copy,
                HelpCircle,
                Monitor,
                Music,
                Play,
                Radio,
                RotateCcw,
                Shuffle,
                Smartphone,
                Volume2,
                VolumeX,
                X,
              } from 'lucide-react';
              import {
                CANVAS_HEIGHT,
                CANVAS_WIDTH,
                generateProceduralLevel,
                LEVELS,
                LevelConfig,
              } from './game/levels';
              import {
                GameStatsSnapshot,
                PlayerShape,
                ShadowEchoEngine,
              } from './game/shadowEchoEngine';
              import { soundEngine } from './game/soundEngine';
              import {
                STANDALONE_CSS,
                STANDALONE_HTML,
                STANDALONE_JS,
              } from './game/standaloneCode';

              type DeviceMode = 'auto' | 'pc' | 'mobile';

              export default function App() {
                const canvasRef = useRef<HTMLCanvasElement | null>(null);
                const engineRef = useRef<ShadowEchoEngine | null>(null);
                const stickBaseRef = useRef<HTMLDivElement | null>(null);

                const [currentLevelIdx, setCurrentLevelIdx] = useState<number>(0);
                const [playerShape, setPlayerShape] = useState<PlayerShape>('square');
                const [sfxEnabled, setSfxEnabled] = useState<boolean>(true);
                const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
                const [completedLevels, setCompletedLevels] = useState<number[]>([]);
                const [proceduralSeed, setProceduralSeed] = useState<number>(1);
                const [proceduralTier, setProceduralTier] = useState<number>(1);

                // Responsive PC + Mobile Mode state
                const [deviceMode, setDeviceMode] = useState<DeviceMode>('auto');
                const [isNarrowOrTouch, setIsNarrowOrTouch] = useState<boolean>(false);

                // On-screen Analog Thumbstick state for Mobile Control Deck
                const [stickOffset, setStickOffset] = useState<{ x: number; y: number }>({
                  x: 0,
                  y: 0,
                });
                const [isDraggingStick, setIsDraggingStick] = useState<boolean>(false);
                const [activeDpadDir, setActiveDpadDir] = useState<
                  'up' | 'down' | 'left' | 'right' | null
                >(null);

                // Modals / Overlays
                const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
                const [showCodeModal, setShowCodeModal] = useState<boolean>(false);
                const [copiedBlock, setCopiedBlock] = useState<'html' | 'css' | 'js' | null>(
                  null
                );

                const [stats, setStats] = useState<GameStatsSnapshot>({
                  levelId: LEVELS[0].id,
                  levelName: LEVELS[0].name,
                  levelSubtitle: LEVELS[0].subtitle,
                  echoesUsed: 0,
                  parEchoes: LEVELS[0].parEchoes,
                  deaths: 0,
                  elapsedSeconds: 0,
                  keysCollected: 0,
                  keysTotal: LEVELS[0].keys.length,
                  sonarCharges: 3,
                  maxSonarCharges: 3,
                  status: 'PLAYING',
                  deathMessage: null,
                  autoAdvanceRemaining: 0,
                });

                // Detect viewport width / touch capability for 'auto' mode
                useEffect(() => {
                  const checkViewport = () => {
                    const narrow = window.innerWidth < 860;
                    const touchPrimary = window.matchMedia('(pointer: coarse)').matches;
                    setIsNarrowOrTouch(narrow || touchPrimary);
                  };
                  checkViewport();
                  window.addEventListener('resize', checkViewport);
                  return () => window.removeEventListener('resize', checkViewport);
                }, []);

                const showMobileDeck =
                  deviceMode === 'mobile' || (deviceMode === 'auto' && isNarrowOrTouch);

                const selectLevel = useCallback((idx: number, customConfig?: LevelConfig) => {
                  const target = customConfig || LEVELS[idx];
                  setCurrentLevelIdx(idx);
                  engineRef.current?.loadLevel(target, 'PLAYING');
                  canvasRef.current?.focus();
                }, []);

                const handleNextLevel = useCallback(() => {
                  if (currentLevelIdx < LEVELS.length - 1) {
                    const nextIdx = currentLevelIdx + 1;
                    if (LEVELS[nextIdx].isProcedural) {
                      const nextSeed = proceduralSeed + 1;
                      setProceduralSeed(nextSeed);
                      const proc = generateProceduralLevel(nextSeed, proceduralTier);
                      selectLevel(nextIdx, {
                        ...LEVELS[nextIdx],
                        name: `06. Procedural Labyrinth (Tier ${proceduralTier})`,
                        walls: proc.walls,
                        keys: proc.keys,
                        sentinels: proc.sentinels,
                      });
                    } else {
                      selectLevel(nextIdx);
                    }
                  } else {
                    const nextSeed = proceduralSeed + 1;
                    const nextTier = proceduralTier + 1;
                    setProceduralSeed(nextSeed);
                    setProceduralTier(nextTier);
                    const procIdx = LEVELS.length - 1;
                    const proc = generateProceduralLevel(nextSeed, nextTier);
                    selectLevel(procIdx, {
                      ...LEVELS[procIdx],
                      name: `0${5 + nextTier}. Procedural Labyrinth (Tier ${nextTier})`,
                      parEchoes: 48 + nextTier * 6,
                      walls: proc.walls,
                      keys: proc.keys,
                      sentinels: proc.sentinels,
                    });
                  }
                }, [currentLevelIdx, proceduralSeed, proceduralTier, selectLevel]);

                useEffect(() => {
                  const canvas = canvasRef.current;
                  if (!canvas) return;

                  const engine = new ShadowEchoEngine(canvas, LEVELS[0], (snapshot) => {
                    setStats(snapshot);
                    if (snapshot.status === 'LEVEL_COMPLETE') {
                      setCompletedLevels((prev) =>
                        prev.includes(snapshot.levelId) ? prev : [...prev, snapshot.levelId]
                      );
                    }
                  });

                  engine.start();
                  engineRef.current = engine;
                  canvas.focus();

                  return () => {
                    engine.destroy();
                    engineRef.current = null;
                  };
                }, []);

                useEffect(() => {
                  engineRef.current?.setAutoAdvanceHandler(() => {
                    handleNextLevel();
                  });
                }, [handleNextLevel]);

                const handleRestartLevel = () => {
                  soundEngine.startAmbientMusic();
                  const current = LEVELS[currentLevelIdx];
                  if (current.isProcedural) {
                    const proc = generateProceduralLevel(proceduralSeed, proceduralTier);
                    const refreshed: LevelConfig = {
                      ...current,
                      name: `0${5 + proceduralTier}. Procedural Labyrinth (Tier ${proceduralTier})`,
                      walls: proc.walls,
                      keys: proc.keys,
                      sentinels: proc.sentinels,
                    };
                    engineRef.current?.loadLevel(refreshed, 'PLAYING');
                  } else {
                    engineRef.current?.loadLevel(current, 'PLAYING');
                  }
                  canvasRef.current?.focus();
                };

                const handleNewProceduralMaze = () => {
                  soundEngine.startAmbientMusic();
                  const nextSeed = proceduralSeed + 1;
                  const nextTier = proceduralTier + 1;
                  setProceduralSeed(nextSeed);
                  setProceduralTier(nextTier);
                  const procIdx = LEVELS.findIndex((l) => l.isProcedural);
                  const targetIdx = procIdx >= 0 ? procIdx : LEVELS.length - 1;
                  const proc = generateProceduralLevel(nextSeed, nextTier);
                  const updatedLevel: LevelConfig = {
                    ...LEVELS[targetIdx],
                    name: `0${5 + nextTier}. Procedural Labyrinth (Tier ${nextTier})`,
                    parEchoes: 48 + nextTier * 6,
                    walls: proc.walls,
                    keys: proc.keys,
                    sentinels: proc.sentinels,
                  };
                  selectLevel(targetIdx, updatedLevel);
                };

                const togglePlayerShape = () => {
                  soundEngine.startAmbientMusic();
                  const nextShape: PlayerShape =
                    playerShape === 'square' ? 'circle' : 'square';
                  setPlayerShape(nextShape);
                  engineRef.current?.setPlayerShape(nextShape);
                  canvasRef.current?.focus();
                };

                const toggleMusic = () => {
                  const next = !musicEnabled;
                  setMusicEnabled(next);
                  soundEngine.setMusicEnabled(next);
                  canvasRef.current?.focus();
                };

                const toggleSfx = () => {
                  const next = !sfxEnabled;
                  setSfxEnabled(next);
                  soundEngine.setSfxEnabled(next);
                  canvasRef.current?.focus();
                };

                // Virtual Analog Thumbstick Pointer Handlers
                const updateStickFromPointer = (clientX: number, clientY: number) => {
                  const base = stickBaseRef.current;
                  if (!base) return;
                  const rect = base.getBoundingClientRect();
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;
                  const dx = clientX - centerX;
                  const dy = clientY - centerY;
                  const dist = Math.hypot(dx, dy);
                  const maxRadius = 38;

                  if (dist > 4) {
                    const clampedDist = Math.min(dist, maxRadius);
                    const normX = dx / dist;
                    const normY = dy / dist;
                    setStickOffset({
                      x: normX * clampedDist,
                      y: normY * clampedDist,
                    });
                    const speedFactor = clampedDist / maxRadius;
                    engineRef.current?.setVirtualDirection(
                      normX * speedFactor,
                      normY * speedFactor
                    );
                  } else {
                    setStickOffset({ x: 0, y: 0 });
                    engineRef.current?.setVirtualDirection(0, 0);
                  }
                };

                const handleStickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  soundEngine.startAmbientMusic();
                  setIsDraggingStick(true);
                  updateStickFromPointer(e.clientX, e.clientY);
                };

                const handleStickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
                  if (!isDraggingStick) return;
                  e.preventDefault();
                  updateStickFromPointer(e.clientX, e.clientY);
                };

                const handleStickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
                  if (!isDraggingStick) return;
                  e.preventDefault();
                  setIsDraggingStick(false);
                  setStickOffset({ x: 0, y: 0 });
                  engineRef.current?.setVirtualDirection(0, 0);
                };

                const handleDpadPress = (
                  dir: 'up' | 'down' | 'left' | 'right',
                  dx: number,
                  dy: number
                ) => {
                  soundEngine.startAmbientMusic();
                  setActiveDpadDir(dir);
                  engineRef.current?.setVirtualDirection(dx, dy);
                };

                const handleDpadRelease = () => {
                  setActiveDpadDir(null);
                  engineRef.current?.setVirtualDirection(0, 0);
                };

                const handleCopyCode = (type: 'html' | 'css' | 'js', content: string) => {
                  navigator.clipboard.writeText(content).catch(() => {});
                  setCopiedBlock(type);
                  setTimeout(() => {
                    setCopiedBlock((prev) => (prev === type ? null : prev));
                  }, 1800);
                };

                const formatTime = (seconds: number): string => {
                  const mins = Math.floor(seconds / 60);
                  const secs = Math.floor(seconds % 60);
                  const tenths = Math.floor((seconds % 1) * 10);
                  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(
                    2,
                    '0'
                  )}.${tenths}`;
                };

                return (
                  <div className="min-h-screen bg-[#05070B] text-slate-100 flex flex-col justify-between select-none">
                    {/* Top Bar Contract: Zone 1 (Brand) — Zone 2 (5 Concise Nav Links) — Zone 3 (1 Primary CTA) */}
                    <header className="w-full border-b border-slate-800/80 bg-[#080B12]/90 backdrop-blur-md">
                      <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3">
                        {/* Zone 1: Single text element wordmark */}
                        <a
                          href="#top"
                          onClick={(e) => {
                            e.preventDefault();
                            handleRestartLevel();
                          }}
                          className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-sky-400"
                        >
                          Shadow Echo
                        </a>

                        {/* Zone 2: 5 concise single-line text navigation links */}
                        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
                          <button
                            type="button"
                            onClick={togglePlayerShape}
                            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Shape: {playerShape === 'square' ? 'Square' : 'Circle'}
                          </button>
                          <button
                            type="button"
                            onClick={toggleMusic}
                            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                          >
                            <Music
                              className={`w-3.5 h-3.5 ${
                                musicEnabled ? 'text-emerald-400' : 'text-slate-500'
                              }`}
                            />
                            <span>Ambient: {musicEnabled ? 'On' : 'Off'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={toggleSfx}
                            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                          >
                            {sfxEnabled ? (
                              <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                            ) : (
                              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                            )}
                            <span>Echo SFX: {sfxEnabled ? 'On' : 'Muted'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowHowToPlay(true)}
                            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            How to Play
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCodeModal(true)}
                            className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            HTML / CSS / JS Source
                          </button>
                        </nav>

                        {/* Zone 3: 1 primary action */}
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={handleRestartLevel}
                            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restart Level</span>
                          </button>
                        </div>
                      </div>
                    </header>

                    {/* Main Arena Workspace */}
                    <main className="flex-1 w-full max-w-[1200px] mx-auto px-3 sm:px-6 py-3 sm:py-5 flex flex-col items-center justify-center gap-3.5">
                      {/* Unobtrusive HUD Header (Zero-Pill Unboxed Metadata with Tabular Numerals) */}
                      <div className="w-full max-w-[960px] flex flex-col lg:flex-row lg:items-baseline justify-between gap-2 pb-2 border-b border-slate-800/70">
                        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-2">
                          <h1 className="font-display text-lg sm:text-xl font-semibold text-slate-100 tracking-tight whitespace-nowrap">
                            {stats.levelName}
                          </h1>
                          <span className="hidden sm:inline text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <p className="text-xs text-slate-400 line-clamp-1">
                            {stats.levelSubtitle}
                          </p>
                        </div>

                        {/* Unboxed Tabular Metrics */}
                        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap text-xs font-mono-tabular text-slate-300 shrink-0">
                          <span>
                            Keys:{' '}
                            <strong
                              className={
                                stats.keysCollected >= stats.keysTotal
                                  ? 'text-emerald-400 font-semibold'
                                  : 'text-amber-400 font-semibold'
                              }
                            >
                              {stats.keysCollected}/{stats.keysTotal}
                            </strong>
                          </span>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span>
                            Sonar:{' '}
                            <strong className="text-sky-400 font-semibold">
                              {stats.sonarCharges}/{stats.maxSonarCharges}
                            </strong>
                          </span>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span>
                            Echoes:{' '}
                            <strong className="text-sky-300 font-semibold">
                              {stats.echoesUsed}
                            </strong>
                            <span className="text-slate-500">/{stats.parEchoes}</span>
                          </span>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span>
                            Deaths:{' '}
                            <strong
                              className={
                                stats.deaths > 0
                                  ? 'text-rose-400 font-semibold'
                                  : 'text-slate-200 font-semibold'
                              }
                            >
                              {stats.deaths}
                            </strong>
                          </span>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span>
                            Time:{' '}
                            <strong className="text-emerald-400 font-semibold">
                              {formatTime(stats.elapsedSeconds)}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* HTML5 Canvas Arena Container (Supports Both Keyboard/Mouse & Touch-Drag Floating Joystick) */}
                      <div
                        className={`relative w-full ${
                          deviceMode === 'mobile' ? 'max-w-[560px]' : 'max-w-[960px]'
                        } rounded-2xl overflow-hidden border border-slate-800/90 bg-[#05070B] shadow-[0_24px_64px_rgba(0,0,0,0.85)] transition-all`}
                      >
                        <canvas
                          ref={canvasRef}
                          tabIndex={0}
                          width={CANVAS_WIDTH}
                          height={CANVAS_HEIGHT}
                          onClick={() => {
                            canvasRef.current?.focus();
                            engineRef.current?.triggerManualSonar();
                          }}
                          title="PC: Click or Spacebar for Sonar · Mobile: Drag anywhere on canvas to move, or tap for Sonar"
                          className="block w-full h-auto aspect-[960/560] cursor-crosshair outline-none touch-none"
                        />

                        {/* Status / Key / Sentinel Impact Notification Banner */}
                        {stats.deathMessage && (
                          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 max-w-[92%] px-3.5 py-2 rounded-lg bg-slate-950/90 border border-slate-700/80 text-xs font-medium text-slate-200 tracking-wide shadow-lg text-center truncate">
                            {stats.deathMessage}
                          </div>
                        )}

                        {/* Level Complete Victory Modal Overlay */}
                        {stats.status === 'LEVEL_COMPLETE' && (
                          <div className="absolute inset-0 bg-[#05070B]/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
                            <div className="w-full max-w-md bg-[#0B101B] border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 shadow-2xl">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-mono-tabular text-emerald-400">
                                  Exit Reached · Loading Harder Maze in{' '}
                                  {stats.autoAdvanceRemaining}s
                                </span>
                                <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-50">
                                  {stats.levelName} Cleared
                                </h2>
                                <p className="text-xs text-slate-400">
                                  {stats.echoesUsed <= stats.parEchoes
                                    ? 'Masterful acoustic efficiency — preparing the next deeper labyrinth.'
                                    : 'You unlocked the portal and escaped the Sentinels. Preparing the next sector.'}
                                </p>
                              </div>

                              {/* Unboxed Tabular Breakdown */}
                              <div className="grid grid-cols-3 gap-3 py-3 border-y border-slate-800/80 font-mono-tabular">
                                <div>
                                  <div className="text-[11px] text-slate-400">Echo Waves</div>
                                  <div className="text-base sm:text-lg font-semibold text-sky-400">
                                    {stats.echoesUsed}{' '}
                                    <span className="text-xs text-slate-500">
                                      / {stats.parEchoes}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-slate-400">Deaths</div>
                                  <div className="text-base sm:text-lg font-semibold text-slate-100">
                                    {stats.deaths}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-slate-400">Clear Time</div>
                                  <div className="text-base sm:text-lg font-semibold text-emerald-400">
                                    {formatTime(stats.elapsedSeconds)}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-3">
                                <button
                                  type="button"
                                  onClick={handleRestartLevel}
                                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  Replay Sector
                                </button>
                                <button
                                  type="button"
                                  onClick={handleNextLevel}
                                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>Next Level Now</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Dedicated Ergonomic Mobile Thumb-Zone Deck (Shown automatically on Mobile/Touch or when Mobile Mode is toggled) */}
                      {showMobileDeck && (
                        <section
                          aria-label="Mobile Touch Control Deck"
                          className="w-full max-w-[960px] bg-[#090D16] border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-3 shadow-xl touch-none"
                        >
                          {/* Mobile Quick Utility Row (44px min touch targets) */}
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/70 overflow-x-auto">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={togglePlayerShape}
                                className="min-h-[44px] px-3 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Shape: {playerShape === 'square' ? 'Square' : 'Circle'}
                              </button>
                              <button
                                type="button"
                                onClick={toggleMusic}
                                className="min-h-[44px] px-3 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-xl whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                              >
                                <Music
                                  className={`w-3.5 h-3.5 ${
                                    musicEnabled ? 'text-emerald-400' : 'text-slate-500'
                                  }`}
                                />
                                <span>{musicEnabled ? 'Music On' : 'Music Off'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={toggleSfx}
                                className="min-h-[44px] px-3 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-xl whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                              >
                                {sfxEnabled ? (
                                  <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                                ) : (
                                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                                )}
                                <span>{sfxEnabled ? 'SFX On' : 'Muted'}</span>
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowHowToPlay(true)}
                              className="min-h-[44px] px-3 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-xl whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1"
                            >
                              <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                              <span>Rules</span>
                            </button>
                          </div>

                          {/* Dual-Thumb Ergonomic Zone: Left (360° Thumbstick + Cross D-Pad) — Right (Large Sonar Action Pad) */}
                          <div className="flex items-center justify-between gap-4 pt-1">
                            {/* Left Thumb Zone: 360° Analog Virtual Stick + Tactile D-Pad */}
                            <div className="flex items-center gap-4">
                              {/* 360° Analog Virtual Joystick */}
                              <div className="flex flex-col items-center gap-1">
                                <div
                                  ref={stickBaseRef}
                                  onPointerDown={handleStickPointerDown}
                                  onPointerMove={handleStickPointerMove}
                                  onPointerUp={handleStickPointerUp}
                                  onPointerCancel={handleStickPointerUp}
                                  className="relative w-28 h-28 rounded-full bg-[#05070B] border-2 border-sky-500/30 flex items-center justify-center shadow-inner cursor-grab active:cursor-grabbing touch-none"
                                >
                                  {/* Inner crosshair rings */}
                                  <div className="w-14 h-14 rounded-full border border-slate-800/80 pointer-events-none" />
                                  {/* Draggable Thumb Knob */}
                                  <div
                                    style={{
                                      transform: `translate3d(${stickOffset.x}px, ${stickOffset.y}px, 0)`,
                                    }}
                                    className={`w-11 h-11 rounded-full pointer-events-none flex items-center justify-center transition-shadow ${
                                      isDraggingStick
                                        ? 'bg-sky-400 border-2 border-white shadow-[0_0_20px_#38BDF8]'
                                        : 'bg-sky-500/80 border border-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                                    }`}
                                  >
                                    <div className="w-2.5 h-2.5 rounded-full bg-slate-950" />
                                  </div>
                                </div>
                                <span className="text-[11px] text-slate-400 font-medium">
                                  360° Thumbstick
                                </span>
                              </div>

                              {/* Tactile 4-Way Cross D-Pad (48x48px hitboxes) */}
                              <div className="hidden sm:grid grid-cols-3 gap-1.5 items-center justify-items-center">
                                <div />
                                <button
                                  type="button"
                                  aria-label="Move Up"
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    handleDpadPress('up', 0, -1);
                                  }}
                                  onPointerUp={handleDpadRelease}
                                  onPointerLeave={handleDpadRelease}
                                  onPointerCancel={handleDpadRelease}
                                  className={`min-w-[48px] min-h-[48px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer touch-none ${
                                    activeDpadDir === 'up'
                                      ? 'bg-sky-400 text-slate-950 border-sky-300'
                                      : 'bg-slate-900/90 text-slate-200 border-slate-800 active:bg-sky-400 active:text-slate-950'
                                  }`}
                                >
                                  <ArrowUp className="w-5 h-5" />
                                </button>
                                <div />
                                <button
                                  type="button"
                                  aria-label="Move Left"
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    handleDpadPress('left', -1, 0);
                                  }}
                                  onPointerUp={handleDpadRelease}
                                  onPointerLeave={handleDpadRelease}
                                  onPointerCancel={handleDpadRelease}
                                  className={`min-w-[48px] min-h-[48px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer touch-none ${
                                    activeDpadDir === 'left'
                                      ? 'bg-sky-400 text-slate-950 border-sky-300'
                                      : 'bg-slate-900/90 text-slate-200 border-slate-800 active:bg-sky-400 active:text-slate-950'
                                  }`}
                                >
                                  <ArrowLeft className="w-5 h-5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Move Down"
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    handleDpadPress('down', 0, 1);
                                  }}
                                  onPointerUp={handleDpadRelease}
                                  onPointerLeave={handleDpadRelease}
                                  onPointerCancel={handleDpadRelease}
                                  className={`min-w-[48px] min-h-[48px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer touch-none ${
                                    activeDpadDir === 'down'
                                      ? 'bg-sky-400 text-slate-950 border-sky-300'
                                      : 'bg-slate-900/90 text-slate-200 border-slate-800 active:bg-sky-400 active:text-slate-950'
                                  }`}
                                >
                                  <ArrowDown className="w-5 h-5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Move Right"
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    handleDpadPress('right', 1, 0);
                                  }}
                                  onPointerUp={handleDpadRelease}
                                  onPointerLeave={handleDpadRelease}
                                  onPointerCancel={handleDpadRelease}
                                  className={`min-w-[48px] min-h-[48px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer touch-none ${
                                    activeDpadDir === 'right'
                                      ? 'bg-sky-400 text-slate-950 border-sky-300'
                                      : 'bg-slate-900/90 text-slate-200 border-slate-800 active:bg-sky-400 active:text-slate-950'
                                  }`}
                                >
                                  <ArrowRight className="w-5 h-5" />
                                </button>
                              </div>
                            </div>

                            {/* Right Thumb Zone: Primary Overcharged Sonar Ping Button + Harder Maze Trigger */}
                            <div className="flex flex-col items-end gap-2.5">
                              <button
                                type="button"
                                onClick={() => engineRef.current?.triggerManualSonar()}
                                className="min-w-[132px] min-h-[68px] px-5 py-3 rounded-2xl bg-sky-400 active:scale-[0.97] hover:bg-sky-300 text-slate-950 font-display font-bold text-sm shadow-[0_0_28px_rgba(56,189,248,0.35)] transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                              >
                                <div className="flex items-center gap-1.5">
                                  <Radio className="w-4 h-4" />
                                  <span>SONAR PING</span>
                                </div>
                                <span className="text-[11px] font-mono-tabular font-semibold text-slate-900">
                                  {stats.sonarCharges}/{stats.maxSonarCharges} Charges
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={handleNewProceduralMaze}
                                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-200 hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                              >
                                <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
                                <span>New Harder Maze</span>
                              </button>
                            </div>
                          </div>
                        </section>
                      )}

                      {/* Workspace Toolbar: Level Selector, Platform Mode Switcher (PC / Mobile / Auto), and PC Controls */}
                      <div className="w-full max-w-[960px] flex flex-wrap items-center justify-between gap-3 pt-1">
                        {/* Interactive Segmented Level Selector (44px mobile touch friendly) */}
                        <div className="flex items-center gap-1 p-1 bg-[#0B101B] border border-slate-800/80 rounded-xl overflow-x-auto max-w-full">
                          {LEVELS.map((lvl, idx) => {
                            const isCurrent = idx === currentLevelIdx;
                            const isDone = completedLevels.includes(lvl.id);
                            return (
                              <button
                                key={lvl.id}
                                type="button"
                                onClick={() => {
                                  soundEngine.startAmbientMusic();
                                  selectLevel(idx);
                                }}
                                className={`min-h-[38px] sm:min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  isCurrent
                                    ? 'bg-sky-400 text-slate-950 font-semibold shadow-sm'
                                    : isDone
                                    ? 'text-emerald-400 hover:text-slate-100 hover:bg-slate-800/60'
                                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                                }`}
                              >
                                {lvl.isProcedural ? '06+ · Procedural' : `0${lvl.id}`}
                              </button>
                            );
                          })}
                        </div>

                        {/* Platform Mode Switcher (Auto / PC / Mobile) & PC Action Buttons */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {/* Segmented Platform Switcher */}
                          <div className="flex items-center gap-1 p-1 bg-[#0B101B] border border-slate-800/80 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setDeviceMode('auto')}
                              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                                deviceMode === 'auto'
                                  ? 'bg-slate-800 text-slate-100'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Auto
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeviceMode('pc')}
                              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                                deviceMode === 'pc'
                                  ? 'bg-sky-400 text-slate-950 font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Monitor className="w-3.5 h-3.5" />
                              <span>PC Mode</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeviceMode('mobile')}
                              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                                deviceMode === 'mobile'
                                  ? 'bg-sky-400 text-slate-950 font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>Mobile Mode</span>
                            </button>
                          </div>

                          {!showMobileDeck && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  canvasRef.current?.focus();
                                  engineRef.current?.triggerManualSonar();
                                }}
                                className="px-3.5 py-2 text-xs font-medium text-sky-300 bg-sky-950/50 border border-sky-500/30 hover:bg-sky-900/50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 font-mono-tabular"
                              >
                                <Radio className="w-3.5 h-3.5" />
                                <span>
                                  Sonar Ping ({stats.sonarCharges}/{stats.maxSonarCharges} ·
                                  Space)
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={handleNewProceduralMaze}
                                className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-[#0B101B] border border-slate-800 hover:bg-slate-800/70 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                              >
                                <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Generate Harder Maze</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </main>

                    {/* Quiet Footer with PC + Mobile Controls Summary */}
                    <footer className="w-full border-t border-slate-900/80 py-3 px-4 sm:px-6 text-xs text-slate-500">
                      <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                          <span>
                            PC:{' '}
                            <strong className="text-slate-300 font-medium">
                              WASD / Arrows + Spacebar
                            </strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Mobile:{' '}
                            <strong className="text-slate-300 font-medium">
                              Drag on Canvas or 360° Thumbstick + Sonar Pad
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() => setShowHowToPlay(true)}
                            className="hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>Rules</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCodeModal(true)}
                            className="hover:text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            <span>View HTML / CSS / JS Blocks</span>
                          </button>
                        </div>
                      </div>
                    </footer>

                    {/* How to Play Modal */}
                    {showHowToPlay && (
                      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="w-full max-w-lg bg-[#0B101B] border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 shadow-2xl">
                          <div className="flex items-center justify-between">
                            <h2 className="font-display text-xl font-bold text-slate-50">
                              How to Play Shadow Echo (PC & Mobile)
                            </h2>
                            <button
                              type="button"
                              onClick={() => setShowHowToPlay(false)}
                              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex flex-col gap-3.5 text-sm text-slate-300 leading-relaxed">
                            <div>
                              <h3 className="font-semibold text-sky-400 text-xs mb-0.5">
                                01. PC & Mobile Controls
                              </h3>
                              <p className="text-xs text-slate-400">
                                <strong>On PC:</strong> Move with <strong>WASD</strong> or{' '}
                                <strong>Arrow Keys</strong>, and press{' '}
                                <strong>Spacebar</strong> (or click) for a Sonar Ping.
                                <br />
                                <strong>On Mobile:</strong> Drag your finger anywhere directly
                                on the game canvas (or use the dedicated{' '}
                                <strong>360° Thumbstick & D-Pad</strong>) to steer, and tap the{' '}
                                <strong>SONAR PING</strong> button.
                              </p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-amber-400 text-xs mb-0.5">
                                02. Golden Resonance Keys (Portal Unlock)
                              </h3>
                              <p className="text-xs text-slate-400">
                                The Exit starts <strong>LOCKED</strong>. When your sound wave
                                hits a hidden golden Resonance Key, the key rings back with an
                                amber echo ripple. Collect all keys in the sector to unlock the
                                green Exit portal.
                              </p>
                            </div>

                            <div>
                              <h3 className="font-semibold text-rose-400 text-xs mb-0.5">
                                03. Patrolling Shadow Sentinels & Hidden Walls
                              </h3>
                              <p className="text-xs text-slate-400">
                                Crimson Shadow Sentinels patrol the dark corridors. Sound waves
                                illuminate both the Sentinels and their dashed patrol paths.
                                Hitting a wall or Sentinel shatters your core, resets
                                unbanked keys, and respawns you at the start.
                              </p>
                            </div>
                          </div>

                          <div className="flex justify-end pt-2 border-t border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => {
                                setShowHowToPlay(false);
                                canvasRef.current?.focus();
                              }}
                              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-xl transition-colors cursor-pointer"
                            >
                              Resume Game
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Separated HTML, CSS, and Vanilla JS Blocks Modal */}
                    {showCodeModal && (
                      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="w-full max-w-4xl max-h-[88vh] bg-[#0B101B] border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                            <div>
                              <h2 className="font-display text-lg font-bold text-slate-50">
                                Shadow Echo — Separated HTML, CSS, and Vanilla JS Blocks
                              </h2>
                              <p className="text-xs text-slate-400">
                                Clean, standalone blocks for PC & Mobile
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowCodeModal(false)}
                              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                            {/* Block 1: HTML */}
                            <section className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-semibold text-sky-400 font-mono-tabular">
                                  01. HTML (index.html)
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode('html', STANDALONE_HTML)}
                                  className="px-3 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
                                >
                                  {copiedBlock === 'html' ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {copiedBlock === 'html' ? 'Copied HTML' : 'Copy HTML'}
                                  </span>
                                </button>
                              </div>
                              <pre className="p-4 rounded-lg bg-[#05070B] border border-slate-800/90 text-xs font-mono-tabular text-slate-300 overflow-x-auto leading-relaxed">
                                <code>{STANDALONE_HTML}</code>
                              </pre>
                            </section>

                            {/* Block 2: CSS */}
                            <section className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-semibold text-emerald-400 font-mono-tabular">
                                  02. CSS (style.css)
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode('css', STANDALONE_CSS)}
                                  className="px-3 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
                                >
                                  {copiedBlock === 'css' ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {copiedBlock === 'css' ? 'Copied CSS' : 'Copy CSS'}
                                  </span>
                                </button>
                              </div>
                              <pre className="p-4 rounded-lg bg-[#05070B] border border-slate-800/90 text-xs font-mono-tabular text-slate-300 overflow-x-auto leading-relaxed">
                                <code>{STANDALONE_CSS}</code>
                              </pre>
                            </section>

                            {/* Block 3: Vanilla JavaScript */}
                            <section className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-semibold text-amber-400 font-mono-tabular">
                                  03. Vanilla JavaScript (game.js)
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode('js', STANDALONE_JS)}
                                  className="px-3 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
                                >
                                  {copiedBlock === 'js' ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {copiedBlock === 'js' ? 'Copied JS' : 'Copy JS'}
                                  </span>
                                </button>
                              </div>
                              <pre className="p-4 rounded-lg bg-[#05070B] border border-slate-800/90 text-xs font-mono-tabular text-slate-300 overflow-x-auto leading-relaxed">
                                <code>{STANDALONE_JS}</code>
                              </pre>
                            </section>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
