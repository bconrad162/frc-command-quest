import { clsx } from 'clsx'
import { RotateCcw, StepForward, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { describeEvent, EVENT_TONE, priorityLabel } from '../components/scheduler/describe.ts'
import { MechanismBoard } from '../components/scheduler/MechanismBoard.tsx'
import { Timeline } from '../components/scheduler/Timeline.tsx'
import { Button, Panel } from '../components/ui.tsx'
import { loopCommand, MECHANISMS } from '../game/challenges/scenarios.ts'
import { CommandScheduler } from '../simulation/scheduler.ts'
import type { CommandDef, Scenario } from '../simulation/types.ts'
import { LOWEST_PRIORITY } from '../simulation/types.ts'

const LAB_COMMANDS: CommandDef[] = [
  loopCommand('forward', 'Drive Forward', 'drive', 10, 'drive.arcade(0.5, 0);', 'drive.driveForward()'),
  loopCommand('turn', 'Turn Left', 'drive', 4, 'drive.arcade(0, 0.4);', 'drive.turnLeft()'),
  loopCommand('defense', 'Defense Mode', 'drive', 12, 'drive.lockWheels();', 'drive.defense()', 50),
  loopCommand('spin', 'Spin Intake', 'intake', 8, 'setSpeed(0.8);', 'intake.spin()'),
  loopCommand('armUp', 'Arm Up', 'arm', 6, 'setArmVoltage(6);', 'arm.up()'),
  loopCommand('armDown', 'Arm Down', 'arm', 5, 'setArmVoltage(-4);', 'arm.down()'),
  loopCommand('estop', 'Emergency Arm Stop', 'arm', 3, 'setArmVoltage(0);', 'arm.emergencyStop()', 1000),
  {
    id: 'auto',
    name: 'Auto Score',
    requirements: [],
    body: [
      { op: 'fork', commands: ['autoArm'] },
      { op: 'fork', commands: ['autoIntake'] },
      { op: 'await', command: 'autoPath' },
    ],
  },
  loopCommand('autoArm', 'Auto: Arm', 'arm', 8, 'setArmVoltage(6);', 'arm.up()'),
  loopCommand('autoIntake', 'Auto: Intake', 'intake', 10, 'setSpeed(0.8);', 'intake.spin()'),
  loopCommand('autoPath', 'Auto: Path', 'drive', 12, 'followTrajectoryStep("ScorePath");', 'drive.followPath("ScorePath")'),
  {
    id: 'intakeIdle',
    name: 'Intake Idle (default)',
    requirements: ['intake'],
    priority: LOWEST_PRIORITY,
    repeatedly: true,
    body: [{ op: 'repeat', label: 'idle' }],
  },
]

const SCHEDULABLE = ['forward', 'turn', 'defense', 'spin', 'armUp', 'armDown', 'estop', 'auto']

function labScenario(withDefault: boolean): Scenario {
  return {
    mechanisms: MECHANISMS.map((m) => (m.id === 'intake' && withDefault ? { ...m, defaultCommand: 'intakeIdle' } : m)),
    commands: LAB_COMMANDS,
    events: [],
    maxCycles: 60,
  }
}

/** Free-play sandbox: schedule and cancel commands between cycles and watch what happens. */
export default function LabPage() {
  const [withDefault, setWithDefault] = useState(true)
  const [runKey, setRunKey] = useState(0)
  const scenario = useMemo(() => labScenario(withDefault), [withDefault])
  const scheduler = useMemo(() => new CommandScheduler(scenario), [scenario, runKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const [, setV] = useState(0)
  const refresh = () => setV((v) => v + 1)
  const result = scheduler.result()
  const snap = result.cycles[result.cycles.length - 1]
  const events = result.events.filter((e) => e.type !== 'Mounted' && e.type !== 'Yielded').slice(-14)
  const isRunning = (id: string) => scheduler.isRunning(id)

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold">Scheduler Lab</h1>
      <p className="mt-1 max-w-3xl text-ink-muted">
        Free play. Schedule commands like a driver pressing buttons, then step the scheduler. Commands you schedule now wait in the pending set until the
        next cycle&apos;s scheduling phase. Try scheduling Turn Left while Drive Forward runs, or the Emergency Arm Stop during Auto Score.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <Panel title="Driver station">
          <ul className="divide-y divide-steel/70">
            {SCHEDULABLE.map((id) => {
              const c = LAB_COMMANDS.find((x) => x.id === id)!
              const running = isRunning(id)
              return (
                <li key={id} className="flex items-center gap-2 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <div className={clsx('truncate text-sm font-medium', running && 'text-signal')}>{c.name}</div>
                    <div className="text-xs text-ink-faint">
                      {c.requirements.length ? `requires ${c.requirements.join(', ')}` : 'requires nothing (forks children)'}, priority {priorityLabel(c.priority)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      scheduler.scheduleExternal(id)
                      refresh()
                    }}
                    disabled={scheduler.finished}
                  >
                    Schedule
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Cancel ${c.name}`}
                    disabled={!running}
                    onClick={() => {
                      scheduler.cancel(id)
                      refresh()
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3 border-t border-steel px-4 py-3">
            <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={withDefault} onChange={(e) => setWithDefault(e.target.checked)} />
              Intake has a default command
            </label>
          </div>
        </Panel>
        <section className="panel" aria-label="Lab simulator">
          <header className="flex flex-wrap items-center gap-3 border-b border-steel px-4 py-2.5">
            <span className="font-display text-lg tabular-nums text-signal">Cycle {scheduler.cycle}</span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  scheduler.step()
                  refresh()
                }}
                disabled={scheduler.finished}
              >
                <StepForward className="size-4" aria-hidden /> Step one cycle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRunKey((k) => k + 1)} aria-label="Restart lab">
                <RotateCcw className="size-4" />
              </Button>
            </div>
          </header>
          <div className="grid gap-4 p-4">
            <MechanismBoard scenario={scenario} snap={snap} />
            <Timeline scenario={scenario} cycles={result.cycles} totalCycles={Math.max(20, result.cycles.length)} />
            <ol className="min-h-24 rounded bg-field-deep/70 p-2 font-mono text-xs" aria-live="polite">
              {events.length === 0 && <li className="text-ink-faint">Schedule a command, then step.</li>}
              {events.map((e) => (
                <li key={e.seq} className="flex gap-2">
                  <span className="w-16 shrink-0 text-ink-faint">{e.cycle === scheduler.cycle && e.type === 'Scheduled' ? 'pending' : `cycle ${e.cycle}`}</span>
                  <span className={EVENT_TONE[e.type] ?? 'text-ink-muted'}>{describeEvent(scenario, e)}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  )
}
