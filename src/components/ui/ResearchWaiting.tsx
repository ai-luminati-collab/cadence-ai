'use client'

import * as React from 'react'
import { Sparkles, Gamepad2, BookOpen, ChevronLeft, ChevronRight, Trophy, RotateCcw } from 'lucide-react'

/* ═══════════════════════════════════════════════════════
   RESEARCH WAITING EXPERIENCE
   Shown while Deep Research runs (2-10 minutes)
   Three tabs: Product Tour | Snake Game | Quotes
   ═══════════════════════════════════════════════════════ */

const PROGRESS_MESSAGES = [
  { emoji: '🔍', text: 'Scanning the web for brand intelligence...' },
  { emoji: '🌐', text: 'Analyzing competitor websites...' },
  { emoji: '📊', text: 'Mining industry trend data...' },
  { emoji: '🧠', text: 'Building psychographic profiles...' },
  { emoji: '💬', text: 'Reading customer reviews & sentiment...' },
  { emoji: '📱', text: 'Auditing social media presence...' },
  { emoji: '🎯', text: 'Identifying content opportunities...' },
  { emoji: '🔬', text: 'Deep-diving competitor strategies...' },
  { emoji: '📈', text: 'Synthesizing market positioning...' },
  { emoji: '✨', text: 'Almost there — finalizing your Brand OS...' },
]

const PRODUCT_TOUR_SLIDES = [
  {
    title: 'Brand OS — Your Living Brand Book',
    description: 'Once research is complete, you\'ll have a fully structured brand intelligence system. Every piece of content the AI creates will be anchored to YOUR brand DNA — tone, audience, competitors, and positioning.',
    icon: '🧬'
  },
  {
    title: 'AI Creative Director',
    description: 'Meet Cadence — your always-on Creative Director. It reviews every piece of content through a "No Artificial Smog" filter, killing generic marketing fluff and injecting real cultural relevance.',
    icon: '🎬'
  },
  {
    title: 'Smart Calendar Generator',
    description: 'Generate 30-day content calendars with platform-specific posts, optimal timing, and content mix strategies — all grounded in your Brand OS and industry best practices.',
    icon: '📅'
  },
  {
    title: 'Visual Generation with References',
    description: 'Upload brand references, product photos, and mood boards. The AI uses these as guardrails to generate visuals that actually look like YOUR brand, not generic stock art.',
    icon: '🎨'
  },
  {
    title: 'Multi-Platform Playbooks',
    description: 'Each platform gets a tailored strategy — Instagram Reels vs LinkedIn carousels vs TikTok trends. The same content idea transforms into platform-native formats automatically.',
    icon: '📱'
  },
  {
    title: 'Blanc Mode — Your AI Chat Partner',
    description: 'Got a wild idea at 2am? Open Blanc Mode and brainstorm with your AI Creative Director. It knows your brand inside out and speaks in your tone of voice.',
    icon: '💬'
  },
  {
    title: 'Pro Tip: Feed Aesthetic',
    description: 'When generating calendars, choose a Feed Aesthetic (Pastel, Bright, Monochrome, Earthy). This ensures visual cohesion across your entire social grid.',
    icon: '💡'
  },
  {
    title: 'Pro Tip: Reference Stages',
    description: 'You can add visual references at 3 levels: Brand-wide (onboarding), Calendar-tenure (for a month), or Per-post (individual concepts). The AI layers these for maximum fidelity.',
    icon: '🎯'
  },
]


// ─── SNAKE GAME ──────────────────────────────────────
const GRID = 20
const CELL = 16
const SPEED = 120

type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
type Pos = { x: number; y: number }

function SnakeGame() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [score, setScore] = React.useState(0)
  const [highScore, setHighScore] = React.useState(0)
  const [gameOver, setGameOver] = React.useState(false)
  const [started, setStarted] = React.useState(false)
  const gameRef = React.useRef<{
    snake: Pos[], dir: Dir, food: Pos, running: boolean, intervalId: number | null
  }>({ snake: [{ x: 10, y: 10 }], dir: 'RIGHT', food: { x: 5, y: 5 }, running: false, intervalId: null })

  const randomFood = (snake: Pos[]): Pos => {
    let pos: Pos
    do { pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) } }
    while (snake.some(s => s.x === pos.x && s.y === pos.y))
    return pos
  }

  const draw = React.useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const g = gameRef.current
    // Background
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, GRID * CELL, GRID * CELL)
    // Grid lines
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, GRID * CELL); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(GRID * CELL, i * CELL); ctx.stroke()
    }
    // Food
    ctx.fillStyle = '#ff6b6b'
    ctx.shadowColor = '#ff6b6b'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(g.food.x * CELL + CELL / 2, g.food.y * CELL + CELL / 2, CELL / 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    // Snake
    g.snake.forEach((seg, i) => {
      const alpha = 1 - (i / g.snake.length) * 0.6
      ctx.fillStyle = i === 0 ? '#a78bfa' : `rgba(139, 92, 246, ${alpha})`
      if (i === 0) { ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 6 }
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2)
      ctx.shadowBlur = 0
    })
  }, [])

  const tick = React.useCallback(() => {
    const g = gameRef.current
    if (!g.running) return
    const head = { ...g.snake[0] }
    if (g.dir === 'UP') head.y -= 1
    if (g.dir === 'DOWN') head.y += 1
    if (g.dir === 'LEFT') head.x -= 1
    if (g.dir === 'RIGHT') head.x += 1
    // Wall collision
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) { endGame(); return }
    // Self collision
    if (g.snake.some(s => s.x === head.x && s.y === head.y)) { endGame(); return }
    g.snake.unshift(head)
    if (head.x === g.food.x && head.y === g.food.y) {
      setScore(prev => { const ns = prev + 1; setHighScore(h => Math.max(h, ns)); return ns })
      g.food = randomFood(g.snake)
    } else { g.snake.pop() }
    draw()
  }, [draw])

  const endGame = () => {
    const g = gameRef.current
    g.running = false
    if (g.intervalId) clearInterval(g.intervalId)
    setGameOver(true)
  }

  const startGame = React.useCallback(() => {
    const g = gameRef.current
    if (g.intervalId) clearInterval(g.intervalId)
    g.snake = [{ x: 10, y: 10 }]
    g.dir = 'RIGHT'
    g.food = randomFood(g.snake)
    g.running = true
    setScore(0)
    setGameOver(false)
    setStarted(true)
    draw()
    g.intervalId = window.setInterval(tick, SPEED)
  }, [draw, tick])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const g = gameRef.current
      const map: Record<string, Dir> = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT' }
      const nd = map[e.key]
      if (!nd) return
      e.preventDefault()
      const opp: Record<Dir, Dir> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' }
      if (nd !== opp[g.dir]) g.dir = nd
    }
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('keydown', handler); if (gameRef.current.intervalId) clearInterval(gameRef.current.intervalId) }
  }, [])

  // Touch controls for mobile
  const handleTouch = (dir: Dir) => {
    const g = gameRef.current
    const opp: Record<Dir, Dir> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' }
    if (dir !== opp[g.dir]) g.dir = dir
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
        <span>Score: <strong className="text-[var(--color-accent-400)]">{score}</strong></span>
        <span>Best: <strong className="text-amber-400">{highScore}</strong></span>
      </div>
      <div className="relative" style={{ width: GRID * CELL, height: GRID * CELL }}>
        <canvas ref={canvasRef} width={GRID * CELL} height={GRID * CELL}
          className="rounded-lg border border-[var(--color-border-subtle)]" />
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
            <button onClick={startGame}
              className="px-6 py-3 rounded-xl bg-[var(--color-accent-600)] text-white text-sm font-bold hover:bg-[var(--color-accent-500)] transition-all transform hover:scale-105">
              <Gamepad2 className="inline w-4 h-4 mr-2" />Play Snake
            </button>
          </div>
        )}
        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-lg gap-3">
            <div className="flex items-center gap-2 text-amber-400"><Trophy className="w-5 h-5" /><span className="font-bold">Score: {score}</span></div>
            <button onClick={startGame}
              className="px-5 py-2 rounded-lg bg-[var(--color-accent-600)] text-white text-xs font-bold hover:bg-[var(--color-accent-500)] transition-all">
              <RotateCcw className="inline w-3 h-3 mr-1" />Play Again
            </button>
          </div>
        )}
      </div>
      {/* Mobile touch controls */}
      <div className="grid grid-cols-3 gap-1 w-32 md:hidden">
        <div />
        <button onTouchStart={() => handleTouch('UP')} className="p-2 rounded bg-[var(--color-bg-elevated)] text-center text-xs">▲</button>
        <div />
        <button onTouchStart={() => handleTouch('LEFT')} className="p-2 rounded bg-[var(--color-bg-elevated)] text-center text-xs">◀</button>
        <button onTouchStart={() => handleTouch('DOWN')} className="p-2 rounded bg-[var(--color-bg-elevated)] text-center text-xs">▼</button>
        <button onTouchStart={() => handleTouch('RIGHT')} className="p-2 rounded bg-[var(--color-bg-elevated)] text-center text-xs">▶</button>
      </div>
      <p className="text-[10px] text-[var(--color-text-quaternary)] hidden md:block">Use arrow keys or WASD to play</p>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────
interface ResearchWaitingProps {
  brandName: string
  elapsedSeconds: number
  onCancel?: () => void  
}

export function ResearchWaiting({ brandName, elapsedSeconds, onCancel }: ResearchWaitingProps) {
  // Alternating between activities to ensure exact 50/50 distribution
  const [activity, setActivity] = React.useState<'tour' | 'game'>('tour')

  React.useEffect(() => {
    // Determine strict 50/50 alternation so the user doesn't get bad RNG streaks
    const lastActivity = localStorage.getItem('cadence_ai_last_activity')
    const nextActivity = lastActivity === 'game' ? 'tour' : 'game'
    setActivity(nextActivity)
    localStorage.setItem('cadence_ai_last_activity', nextActivity)
  }, [])
  const [tourSlide, setTourSlide] = React.useState(0)

  // Auto-rotate progress message
  const msgIndex = Math.min(Math.floor(elapsedSeconds / 30), PROGRESS_MESSAGES.length - 1)
  const currentMsg = PROGRESS_MESSAGES[msgIndex]
  const progressPercent = Math.min((elapsedSeconds / 300) * 100, 95) // Cap at 95% until done
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-accent-600)]/15 border border-[var(--color-accent-500)]/20">
          <div className="w-2 h-2 rounded-full bg-[var(--color-accent-400)] animate-pulse" />
          <span className="text-sm font-medium text-[var(--color-accent-400)]">Deep Research in Progress</span>
        </div>
        <h2 className="text-xl font-display font-bold text-[var(--color-text-primary)]">
          Building Brand Intelligence for <span className="text-[var(--color-accent-400)]">{brandName}</span>
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {currentMsg.emoji} {currentMsg.text}
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="h-1.5 rounded-full bg-[var(--color-bg-elevated)] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent-600)] to-[var(--color-accent-400)] transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="flex justify-between text-xs text-[var(--color-text-tertiary)]">
          <span>{minutes}:{seconds.toString().padStart(2, '0')} elapsed</span>
          <span>Usually takes 3-8 minutes</span>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/50 p-6 min-h-[340px] flex flex-col items-center justify-center relative overflow-hidden">
        
        {/* Subtle indicator of what activity this is */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] opacity-50">
           {activity === 'tour' && <><Sparkles className="w-3 h-3 text-[var(--color-accent-400)]" /><span className="text-[10px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Product Tour</span></>}
           {activity === 'game' && <><Gamepad2 className="w-3 h-3 text-[var(--color-accent-400)]" /><span className="text-[10px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Brain Break</span></>}
        </div>

        {activity === 'tour' && (
          <div className="w-full space-y-4 animate-in fade-in duration-300">
            <div className="text-center space-y-3">
              <div className="text-5xl">{PRODUCT_TOUR_SLIDES[tourSlide].icon}</div>
              <h3 className="text-lg font-display font-bold text-[var(--color-text-primary)]">
                {PRODUCT_TOUR_SLIDES[tourSlide].title}
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed max-w-md mx-auto">
                {PRODUCT_TOUR_SLIDES[tourSlide].description}
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 pt-2">
              <button onClick={() => setTourSlide(i => Math.max(0, i - 1))} disabled={tourSlide === 0}
                className="p-2 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] disabled:opacity-30 hover:border-[var(--color-accent-500)] transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-1.5">
                {PRODUCT_TOUR_SLIDES.map((_, i) => (
                  <button key={i} onClick={() => setTourSlide(i)}
                    className={`w-2 h-2 rounded-full transition-all ${i === tourSlide ? 'bg-[var(--color-accent-400)] w-6' : 'bg-[var(--color-border-default)]'}`} />
                ))}
              </div>
              <button onClick={() => setTourSlide(i => Math.min(PRODUCT_TOUR_SLIDES.length - 1, i + 1))} disabled={tourSlide === PRODUCT_TOUR_SLIDES.length - 1}
                className="p-2 rounded-lg bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] disabled:opacity-30 hover:border-[var(--color-accent-500)] transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activity === 'game' && <SnakeGame />}
      </div>

      {/* Skip option */}
      {onCancel && (
        <div className="text-center">
          <button onClick={onCancel}
            className="text-xs text-[var(--color-text-quaternary)] hover:text-[var(--color-text-secondary)] transition-colors underline underline-offset-4">
            Switch to Quick Research instead (less comprehensive)
          </button>
        </div>
      )}
    </div>
  )
}
