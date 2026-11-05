import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { AutonomousChallenge } from '../../game/types.ts'
import {
  ARM_UP_CYCLES,
  AutonomousWorld,
  MAX_ROUTINE_STEPS,
  PALETTE_BY_ID,
  routineToJava,
  type PaletteId,
  type RoutineStep,
} from '../../simulation/autonomous.ts'
import { Badge } from '../ui.tsx'
import { LazyCode } from './inputs.tsx'

const MECH_TONE: Record<string, string> = { drive: 'text-signal', intake: 'text-go', arm: 'text-tier-medium' }

export function AutonomousBuilder({
  challenge,
  routine,
  onChange,
  disabled,
}: {
  challenge: AutonomousChallenge
  routine: RoutineStep[]
  onChange: (r: RoutineStep[]) => void
  disabled?: boolean
}) {
  const full = routine.length >= MAX_ROUTINE_STEPS
  const add = (command: PaletteId, op: RoutineStep['op']) => !full && onChange([...routine, { op, command }])
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= routine.length) return
    const next = [...routine]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <h3 className="mb-2 font-sans text-sm font-medium text-ink-muted">Command palette</h3>
        <ul className="grid gap-1.5">
          {challenge.palette.map((id) => {
            const p = PALETTE_BY_ID[id]
            return (
              <li key={id} className="rounded-lg border border-steel bg-field-deep/50 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-ink-muted">
                      <span className={MECH_TONE[p.mechanism]}>{p.mechanism}</span>
                      {', '}
                      {p.seconds === null ? (id === 'stopIntake' ? 'never finishes' : 'until a piece is detected') : `${p.seconds.toFixed(1)} s`}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={disabled || full}
                      onClick={() => add(id, 'fork')}
                      className="inline-flex items-center gap-1 rounded border border-steel-bright px-2 py-1 text-xs hover:border-signal disabled:opacity-40"
                      aria-label={`Add fork ${p.label}`}
                    >
                      <Plus className="size-3" aria-hidden /> fork
                    </button>
                    <button
                      type="button"
                      disabled={disabled || full}
                      onClick={() => add(id, 'await')}
                      className="inline-flex items-center gap-1 rounded border border-steel-bright px-2 py-1 text-xs hover:border-signal disabled:opacity-40"
                      aria-label={`Add await ${p.label}`}
                    >
                      <Plus className="size-3" aria-hidden /> await
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-faint">{p.description}</p>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-sans text-sm font-medium text-ink-muted">
            Your routine <span className="text-ink-faint">({routine.length}/{MAX_ROUTINE_STEPS} steps)</span>
          </h3>
          {routine.length > 0 && !disabled && (
            <button type="button" className="text-xs text-ink-muted hover:text-fault" onClick={() => onChange([])}>
              Clear all
            </button>
          )}
        </div>
        {routine.length === 0 ? (
          <p className="rounded-lg border border-dashed border-steel-bright p-4 text-sm text-ink-muted">
            Add steps from the palette. <strong className="text-ink">fork</strong> starts a command and moves on right away;{' '}
            <strong className="text-ink">await</strong> starts it and waits for it to finish.
          </p>
        ) : (
          <ol className="grid gap-1.5" aria-label="Routine steps">
            {routine.map((s, i) => {
              const p = PALETTE_BY_ID[s.command]
              return (
                <li key={`${i}-${s.op}-${s.command}`} className="flex items-center gap-2 rounded-lg border border-steel bg-pit-raised px-2 py-1.5" data-testid="routine-step">
                  <span className="w-5 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
                  <div className="inline-flex overflow-hidden rounded border border-steel-bright text-xs" role="group" aria-label={`Step ${i + 1} mode`}>
                    {(['fork', 'await'] as const).map((op) => (
                      <button
                        key={op}
                        type="button"
                        disabled={disabled}
                        aria-pressed={s.op === op}
                        onClick={() => onChange(routine.map((r, k) => (k === i ? { ...r, op } : r)))}
                        className={clsx('px-2 py-0.5 font-mono', s.op === op ? (op === 'fork' ? 'bg-tier-medium/25 text-tier-medium' : 'bg-signal/20 text-signal') : 'text-ink-faint hover:text-ink')}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm">{p.label}</span>
                  <span className="flex gap-0.5">
                    <button type="button" className="rounded p-1 text-ink-muted hover:bg-steel disabled:opacity-30" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`}>
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-ink-muted hover:bg-steel disabled:opacity-30"
                      disabled={disabled || i === routine.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move step ${i + 1} down`}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-ink-muted hover:bg-fault/20 hover:text-fault disabled:opacity-30"
                      disabled={disabled}
                      onClick={() => onChange(routine.filter((_, k) => k !== i))}
                      aria-label={`Remove step ${i + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        <div className="mt-3">
          <LazyCode code={routineToJava(routine)} label="Generated Java for your routine" />
        </div>
      </div>
    </div>
  )
}

/** Top-down view of the simulated field, driven by the AutonomousWorld state. */
export function FieldView({ world }: { world: AutonomousWorld | undefined }) {
  const s = world?.state ?? AutonomousWorld.initial()
  const START = 48
  const PIECE = 200
  const SCORE = 372
  let x = START
  let stranded = false
  if (s.location === 'piece') x = PIECE
  else if (s.location === 'score') x = SCORE
  else if (s.location === 'between') {
    if (s.pathProgress.toPiece > 0) x = START + ((PIECE - START) * s.pathProgress.toPiece) / 80
    else if (s.pathProgress.toScore > 0) x = PIECE + ((SCORE - PIECE) * s.pathProgress.toScore) / 100
    else {
      stranded = true
      x = (PIECE + SCORE) / 2
    }
  }
  const armAngle = -70 * Math.min(1, s.armProgress / ARM_UP_CYCLES)
  const intakeOn = s.intakeRunCycles > 0
  return (
    <div className="rounded-lg border border-steel bg-field-deep/70 p-2">
      <svg viewBox="0 0 420 120" className="mx-auto block max-h-44 w-full max-w-3xl" role="img" aria-label={`Field view: robot ${s.location === 'between' ? 'moving' : `at ${s.location}`}, arm ${s.armProgress === 0 ? 'down' : s.armProgress >= ARM_UP_CYCLES ? 'up' : 'moving'}, ${s.hasPiece ? 'holding a game piece' : 'no game piece'}${s.scored ? ', scored' : ''}`}>
        <line x1={START - 14} y1="14" x2={START - 14} y2="106" stroke="var(--color-steel-bright)" strokeWidth="2" strokeDasharray="4 4" />
        <text x={START - 14} y="10" fill="var(--color-ink-faint)" fontSize="9" textAnchor="middle">
          start
        </text>
        <rect x={SCORE + 18} y="30" width="22" height="60" rx="3" fill="none" stroke={s.scored ? 'var(--color-trophy)' : 'var(--color-steel-bright)'} strokeWidth="2" />
        <text x={SCORE + 29} y="22" fill="var(--color-ink-faint)" fontSize="9" textAnchor="middle">
          goal
        </text>
        {!s.hasPiece && !s.scored && <circle cx={PIECE + 26} cy="60" r="8" fill="var(--color-warn)" />}
        {s.scored && <circle cx={SCORE + 29} cy="60" r="8" fill="var(--color-trophy)" />}
        <g style={{ transform: `translateX(${x}px)`, transition: 'transform 80ms linear' }}>
          <rect x="-22" y="40" width="44" height="40" rx="5" fill="var(--color-pit-raised)" stroke={stranded ? 'var(--color-fault)' : 'var(--color-signal)'} strokeWidth="2" />
          <g transform={`rotate(${armAngle} -6 60)`}>
            <line x1="-6" y1="60" x2="20" y2="60" stroke="var(--color-tier-medium)" strokeWidth="4" strokeLinecap="round" />
          </g>
          <rect x="20" y="48" width="6" height="24" rx="2" fill={intakeOn ? 'var(--color-go)' : 'var(--color-steel-bright)'} />
          {s.hasPiece && <circle cx="6" cy="60" r="6" fill="var(--color-warn)" />}
        </g>
      </svg>
      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
        <Badge tone={s.hasPiece || s.scored ? 'go' : 'neutral'}>{s.scored ? 'Piece scored' : s.hasPiece ? 'Holding piece' : 'No piece'}</Badge>
        <Badge tone={s.armProgress >= ARM_UP_CYCLES ? 'signal' : 'neutral'}>{s.armProgress === 0 ? 'Arm down' : s.armProgress >= ARM_UP_CYCLES ? 'Arm up' : 'Arm moving'}</Badge>
        <Badge tone={intakeOn ? 'go' : 'neutral'}>{intakeOn ? 'Rollers spinning' : 'Rollers off'}</Badge>
        {stranded && <Badge tone="fault">Stranded mid-field</Badge>}
      </div>
    </div>
  )
}
