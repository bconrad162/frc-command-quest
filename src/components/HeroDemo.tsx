import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loopCommand, scenario as makeScenario } from '../game/challenges/scenarios.ts'
import { usePrefersReducedMotion } from '../hooks/useAppState.ts'
import { CommandScheduler } from '../simulation/scheduler.ts'
import type { CommandDef } from '../simulation/types.ts'
import { describeEvent, EVENT_TONE } from './scheduler/describe.ts'
import { MechanismBoard } from './scheduler/MechanismBoard.tsx'
import { Timeline } from './scheduler/Timeline.tsx'

const autoScore: CommandDef = {
  id: 'auto',
  name: 'Auto Score',
  requirements: [],
  body: [
    { op: 'fork', commands: ['raise'] },
    { op: 'fork', commands: ['spin'] },
    { op: 'await', command: 'path' },
    { op: 'await', command: 'score' },
  ],
}

export const HERO_SCENARIO = makeScenario(
  [
    autoScore,
    loopCommand('raise', 'Raise Arm', 'arm', 4, 'setArmVoltage(6);', 'arm.raise()'),
    loopCommand('spin', 'Spin Intake', 'intake', 5, 'setSpeed(0.8);', 'intake.spin()'),
    loopCommand('path', 'Follow Path', 'drive', 7, 'followTrajectoryStep("ToScore");', 'drive.followPath("ToScore")'),
    loopCommand('score', 'Score', 'intake', 2, 'setSpeed(-1);', 'intake.score()'),
    loopCommand('forward', 'Drive Forward', 'drive', 6, 'drive.arcade(0.5, 0);', 'drive.driveForward()'),
    loopCommand('turn', 'Turn Left', 'drive', 3, 'drive.arcade(0, 0.4);', 'drive.turnLeft()'),
  ],
  [
    { cycle: 1, action: 'schedule', command: 'auto' },
    { cycle: 12, action: 'schedule', command: 'forward' },
    { cycle: 15, action: 'schedule', command: 'turn' },
  ],
  20,
)

/** The welcome screen's live scheduler: loops forever, pauses for reduced motion. */
export function HeroDemo() {
  const reduced = usePrefersReducedMotion()
  const scheduler = useMemo(() => new CommandScheduler(HERO_SCENARIO), [])
  const [, setTick] = useState(0)
  const [playing, setPlaying] = useState(!reduced)

  useEffect(() => {
    if (reduced) {
      // Show a meaningful frozen frame instead of animating.
      scheduler.reset()
      for (let i = 0; i < 15; i++) scheduler.step()
      setTick((t) => t + 1)
      setPlaying(false)
    }
  }, [reduced, scheduler])

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      if (scheduler.finished) scheduler.reset()
      scheduler.step()
      setTick((x) => x + 1)
    }, 520)
    return () => clearInterval(t)
  }, [playing, scheduler])

  const result = scheduler.result()
  const snap = result.cycles[result.cycles.length - 1]
  const recent = result.events.filter((e) => e.type !== 'Log' && e.type !== 'Scheduled').slice(-3)

  return (
    <div className="panel field-grid overflow-hidden" aria-label="Live demo of the command scheduler">
      <div className="flex items-center justify-between border-b border-steel bg-pit/90 px-4 py-2">
        <span className="text-sm text-ink-muted">Live scheduler</span>
        <div className="flex items-center gap-3">
          <span className="font-display text-sm tabular-nums text-signal">Cycle {scheduler.cycle}</span>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="rounded p-1 text-ink-muted hover:text-ink"
            aria-label={playing ? 'Pause demo' : 'Play demo'}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        </div>
      </div>
      <div className="grid gap-4 bg-pit/80 p-4">
        <MechanismBoard scenario={HERO_SCENARIO} snap={snap} />
        <Timeline scenario={HERO_SCENARIO} cycles={result.cycles} totalCycles={HERO_SCENARIO.maxCycles} rows={['auto', 'raise', 'spin', 'path', 'score', 'forward', 'turn']} />
        <ol className="grid min-h-[4.5rem] gap-0.5 font-mono text-xs" aria-live="off">
          {recent.map((e) => (
            <li key={e.seq} className="flex gap-2">
              <span className="w-16 shrink-0 text-ink-faint">cycle {e.cycle}</span>
              <span className={EVENT_TONE[e.type] ?? 'text-ink-muted'}>{describeEvent(HERO_SCENARIO, e)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
