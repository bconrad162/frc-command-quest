import { clsx } from 'clsx'
import { FastForward, Lock, Pause, Play, RotateCcw, StepForward } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { playSound } from '../../lib/sound.ts'
import { CommandScheduler } from '../../simulation/scheduler.ts'
import type { CycleSnapshot, Scenario, SimulationResult, WorldModel } from '../../simulation/types.ts'
import { CYCLE_SECONDS } from '../../simulation/types.ts'
import { Button } from '../ui.tsx'
import { commandName, describeEvent, EVENT_TONE, priorityLabel, STATUS_LABEL, STATUS_STYLE } from './describe.ts'
import { MechanismBoard } from './MechanismBoard.tsx'
import { Timeline } from './Timeline.tsx'

const SPEEDS = [
  { label: '1 cycle/s', value: 1 },
  { label: '2 cycles/s', value: 2 },
  { label: '5 cycles/s', value: 5 },
  { label: '15 cycles/s', value: 15 },
  { label: 'Real time (50/s)', value: 50 },
]

export interface SchedulerPanelProps<W extends WorldModel = WorldModel> {
  scenario: Scenario
  createWorld?: () => W
  /** Stop the run early (e.g. when the autonomous command finishes). */
  stopWhen?: (scheduler: CommandScheduler) => boolean
  locked?: boolean
  lockedMessage?: string
  title?: string
  defaultSpeed?: number
  autoPlay?: boolean
  /** Extra visualization rendered above the timeline (e.g. the field view). */
  renderExtra?: (snap: CycleSnapshot | undefined, world: W | undefined) => ReactNode
  onRunComplete?: (result: SimulationResult, world: W | undefined) => void
  /** Hide the command table and event log (small embeds). */
  compact?: boolean
  /** Cycles shown on the timeline (defaults to the scenario length or run length). */
  timelineCycles?: number
}

export function SchedulerPanel<W extends WorldModel = WorldModel>({
  scenario,
  createWorld,
  stopWhen,
  locked = false,
  lockedMessage = 'Lock in your prediction to unlock the simulator.',
  title = 'Scheduler Showdown',
  defaultSpeed = 2,
  autoPlay = false,
  renderExtra,
  onRunComplete,
  compact = false,
  timelineCycles,
}: SchedulerPanelProps<W>) {
  const [runKey, setRunKey] = useState(0)
  const sim = useMemo(() => {
    const world = createWorld?.()
    return { scheduler: new CommandScheduler(scenario, { world }), world }
    // runKey forces a fresh simulation on restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, createWorld, runKey])
  const [, setVersion] = useState(0)
  const [playing, setPlaying] = useState(autoPlay && !locked)
  const [speed, setSpeed] = useState(defaultSpeed)
  const [done, setDone] = useState(false)
  const reported = useRef(false)
  const logRef = useRef<HTMLOListElement>(null)

  const result = sim.scheduler.result()
  const snap = result.cycles[result.cycles.length - 1]
  const finished = done || sim.scheduler.finished

  const stepOnce = useCallback(() => {
    if (sim.scheduler.finished || done) return false
    sim.scheduler.step()
    const stop = stopWhen?.(sim.scheduler) ?? false
    if (stop || sim.scheduler.finished) {
      setDone(true)
      setPlaying(false)
      if (!reported.current) {
        reported.current = true
        onRunComplete?.(sim.scheduler.result(), sim.world)
      }
    }
    setVersion((v) => v + 1)
    return true
  }, [sim, stopWhen, done, onRunComplete])

  useEffect(() => {
    setDone(false)
    reported.current = false
  }, [sim])

  useEffect(() => {
    if (!playing || locked) return
    const perTick = speed > 25 ? Math.ceil(speed / 25) : 1
    const t = setInterval(
      () => {
        for (let i = 0; i < perTick; i++) if (!stepOnce()) break
      },
      1000 / Math.min(speed, 25),
    )
    return () => clearInterval(t)
  }, [playing, speed, locked, stepOnce])

  useEffect(() => {
    if (locked) setPlaying(false)
  }, [locked])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  })

  const restart = () => {
    setPlaying(false)
    setRunKey((k) => k + 1)
  }
  const runToEnd = () => {
    if (locked) return
    let guard = 0
    while (!sim.scheduler.finished && guard++ < 5000) {
      sim.scheduler.step()
      if (stopWhen?.(sim.scheduler)) break
    }
    setDone(true)
    setPlaying(false)
    if (!reported.current) {
      reported.current = true
      onRunComplete?.(sim.scheduler.result(), sim.world)
    }
    setVersion((v) => v + 1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    if (locked || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
    if (e.key === ' ' && target.tagName !== 'BUTTON') {
      e.preventDefault()
      setPlaying((p) => !p)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      stepOnce()
      playSound('step')
    }
  }

  const seen = new Set<string>()
  for (const c of result.cycles) for (const [id, s] of Object.entries(c.status)) if (s !== 'idle') seen.add(id)
  const commandRows = scenario.commands.filter((c) => seen.has(c.id))
  const visibleEvents = result.events.filter((e) => e.type !== 'Mounted' && e.type !== 'Yielded')
  const totalCycles = timelineCycles ?? (scenario.maxCycles <= 30 ? scenario.maxCycles : Math.max(result.cycles.length, 50))

  return (
    <section
      className="panel relative overflow-hidden"
      aria-label={title}
      onKeyDown={onKeyDown}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-steel px-4 py-2.5">
        <h2 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h2>
        <div className="flex items-baseline gap-2 rounded bg-field-deep px-2.5 py-1" aria-live="polite">
          <span className="text-xs text-ink-muted">Cycle</span>
          <span className="font-display text-lg leading-none tabular-nums text-signal" data-testid="cycle-counter">
            {sim.scheduler.cycle}
          </span>
          <span className="text-xs tabular-nums text-ink-faint">{(sim.scheduler.cycle * CYCLE_SECONDS).toFixed(2)} s</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant={playing ? 'secondary' : 'primary'} onClick={() => setPlaying((p) => !p)} disabled={locked || finished} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              stepOnce()
              playSound('step')
            }}
            disabled={locked || finished || playing}
          >
            <StepForward className="size-4" aria-hidden /> Step one cycle
          </Button>
          <Button size="sm" variant="ghost" onClick={runToEnd} disabled={locked || finished} title="Run to the end">
            <FastForward className="size-4" aria-hidden />
            <span className="sr-only">Run to the end</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={restart} disabled={locked} aria-label="Restart">
            <RotateCcw className="size-4" aria-hidden />
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="sr-only sm:not-sr-only">Speed</span>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="h-8 rounded border border-steel bg-pit-raised px-1.5 text-xs text-ink"
              disabled={locked}
            >
              {SPEEDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className={clsx('grid gap-4 p-4', locked && 'pointer-events-none select-none blur-[3px] opacity-50')} aria-hidden={locked}>
        <MechanismBoard scenario={scenario} snap={snap} />
        {renderExtra?.(snap, sim.world)}
        {snap && snap.pending.length > 0 && (
          <p className="text-xs text-ink-muted">
            Pending this cycle (promoted during scheduling):{' '}
            {snap.pending.map((id) => (
              <span key={id} className="mr-1 rounded border border-tier-medium/40 bg-tier-medium/10 px-1.5 py-px text-tier-medium">
                {commandName(scenario, id)}
              </span>
            ))}
          </p>
        )}

        {!compact && commandRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Commands and their state after cycle {sim.scheduler.cycle}</caption>
              <thead className="text-xs text-ink-faint">
                <tr>
                  <th className="py-1 pr-3 font-normal">Command</th>
                  <th className="py-1 pr-3 font-normal">Requires</th>
                  <th className="py-1 pr-3 font-normal">Priority</th>
                  <th className="py-1 pr-3 font-normal">Parent</th>
                  <th className="py-1 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {commandRows.map((c) => {
                  const status = snap?.status[c.id] ?? 'idle'
                  const effective = snap?.effectivePriority[c.id]
                  const own = c.priority ?? 0
                  return (
                    <tr key={c.id} className="border-t border-steel/60">
                      <td className="py-1.5 pr-3 font-medium">{c.name}</td>
                      <td className="py-1.5 pr-3 text-ink-muted">
                        {c.requirements.length ? c.requirements.map((r) => scenario.mechanisms.find((m) => m.id === r)?.name ?? r).join(', ') : 'nothing'}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs tabular-nums">
                        {priorityLabel(own)}
                        {effective !== undefined && effective !== own && <span className="text-trophy"> (inherits {priorityLabel(effective)})</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-ink-muted">{snap?.parents[c.id] ? commandName(scenario, snap.parents[c.id]!) : ''}</td>
                      <td className="py-1.5">
                        <span className={clsx('rounded border px-1.5 py-px text-xs', STATUS_STYLE[status].pill)}>{STATUS_LABEL[status]}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <h3 className="mb-1.5 font-sans text-xs font-medium text-ink-muted">Execution timeline</h3>
          <Timeline scenario={scenario} cycles={result.cycles} totalCycles={totalCycles} />
        </div>

        {!compact && (
          <div>
            <h3 className="mb-1.5 font-sans text-xs font-medium text-ink-muted">Scheduler event log</h3>
            <ol ref={logRef} className="max-h-48 overflow-y-auto rounded bg-field-deep/70 p-2 font-mono text-xs leading-relaxed" aria-live="polite">
              {visibleEvents.length === 0 && <li className="text-ink-faint">No events yet.</li>}
              {visibleEvents.map((e) => (
                <li key={e.seq} className="flex gap-2">
                  <span className="w-14 shrink-0 tabular-nums text-ink-faint">cycle {e.cycle}</span>
                  <span className={clsx('w-28 shrink-0', EVENT_TONE[e.type] ?? 'text-ink-muted')}>{e.type === 'Log' ? (e.command ? 'println' : 'robot') : e.type}</span>
                  <span className="text-ink-muted">{describeEvent(scenario, e)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Event names match WPILib&apos;s <code>SchedulerEvent</code> types. &quot;ScheduleRejected&quot;, &quot;AlreadyRunning&quot;, println and robot lines are simulator annotations.
              Keyboard: Space plays or pauses, the right arrow steps one cycle.
            </p>
          </div>
        )}
      </div>

      {locked && (
        <div className="absolute inset-0 top-12 flex items-center justify-center p-6">
          <p className="flex items-center gap-2 rounded-lg border border-steel-bright bg-pit px-4 py-3 text-sm text-ink shadow-lg">
            <Lock className="size-4 text-signal" aria-hidden /> {lockedMessage}
          </p>
        </div>
      )}
    </section>
  )
}
