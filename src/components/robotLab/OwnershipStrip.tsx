import { clsx } from 'clsx'
import { TriangleAlert } from 'lucide-react'
import { AUTO_ID, EVENT_IDS, LAB_MECHANISMS, TELEOP_ID, type LabMechanism } from '../../game/robotLab/scenario.ts'
import type { CommandId, CycleSnapshot, Scenario, SchedulerEvent } from '../../simulation/types.ts'
import { describeEvent, EVENT_TONE } from '../scheduler/describe.ts'

type Tone = 'auto' | 'event' | 'default' | 'free'

interface Chip {
  text: string
  tone: Tone
}

const CHIP_CLASS: Record<Tone, string> = {
  auto: 'border-go/60 bg-go/10 text-go',
  event: 'border-signal/60 bg-signal/10 text-signal',
  default: 'border-steel-bright bg-pit-raised text-ink-muted',
  free: 'border-dashed border-steel text-ink-faint',
}

const EVENT_COMMANDS = new Set<CommandId>(Object.values(EVENT_IDS))

/** Who owns a mechanism, in words a student can read. */
export function ownerChip(scenario: Scenario, snapshot: CycleSnapshot | null, mechanism: LabMechanism): Chip {
  const owner = snapshot?.owners[mechanism] ?? null
  if (!owner || !snapshot) return { text: 'free', tone: 'free' }
  const nameOf = (id: CommandId) => scenario.commands.find((c) => c.id === id)?.name ?? id
  if (owner === TELEOP_ID) return { text: 'TeleopDrive (default)', tone: 'default' }
  if (EVENT_COMMANDS.has(owner)) return { text: `${nameOf(owner)} (event)`, tone: 'event' }
  if (owner === AUTO_ID) {
    // The sequence owns it for its whole run; is a running child using it right now?
    const user = snapshot.running.find((id) => {
      if (id === AUTO_ID || snapshot.parents[id] !== AUTO_ID) return false
      return scenario.commands.find((c) => c.id === id)?.requirements.includes(mechanism)
    })
    if (user) return { text: `PathPlannerAuto › ${nameOf(user)}`, tone: 'auto' }
    return { text: 'PathPlannerAuto (reserved for a later step)', tone: 'auto' }
  }
  return { text: nameOf(owner), tone: 'auto' }
}

export function OwnershipStrip({
  scenario,
  snapshot,
  events,
  driveConflict,
}: {
  scenario: Scenario
  snapshot: CycleSnapshot | null
  events: SchedulerEvent[]
  driveConflict: boolean
}) {
  const chips = LAB_MECHANISMS.map((m) => [m, ownerChip(scenario, snapshot, m)] as const)
  const summary = chips.map(([m, c]) => `${m}: ${c.text}`).join('; ') + (driveConflict ? '; two commands are driving' : '')
  const recent = events.filter((e) => e.type !== 'Mounted' && e.type !== 'Yielded').slice(-7).reverse()
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div>
        <h2 className="text-sm font-semibold text-ink-muted">Who owns each mechanism (every 20 ms loop)</h2>
        <p className="sr-only" aria-live="polite">
          {summary}
        </p>
        <ul className="mt-2 grid gap-1.5">
          {chips.map(([m, chip]) => (
            <li key={m} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2" data-testid={`lane-${m}`}>
              <span className="font-mono text-xs text-ink-muted">{m}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className={clsx('max-w-full rounded-full border px-2 py-0.5 font-mono text-xs break-words sm:truncate', CHIP_CLASS[chip.tone])} title={chip.text}>
                  {chip.text}
                </span>
                {m === 'drivetrain' && driveConflict && (
                  <span className="inline-flex max-w-full items-start gap-1 rounded-xl border border-fault bg-fault/10 px-2 py-0.5 font-mono text-xs text-fault">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words" data-testid="conflict-chip">FollowPathCommand is also calling drive() (requires nothing)</span>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-ink-muted">Scheduler log</h2>
        <ol className="mt-2 grid gap-0.5 font-mono text-xs" data-testid="lab-log">
          {recent.length === 0 && <li className="text-ink-faint">Press Run auto to enable autonomous.</li>}
          {recent.map((e) => (
            <li key={e.seq} className={clsx('break-words sm:truncate', EVENT_TONE[e.type] ?? 'text-ink-muted')}>
              <span className="mr-2 text-ink-faint">{(e.cycle * 0.02).toFixed(2)}s</span>
              {describeEvent(scenario, e)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
