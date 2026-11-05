import { clsx } from 'clsx'
import type { CommandCycleStatus, CycleSnapshot, Scenario } from '../../simulation/types.ts'
import { CYCLE_SECONDS } from '../../simulation/types.ts'
import { STATUS_LABEL, STATUS_STYLE } from './describe.ts'

interface Segment {
  status: CommandCycleStatus
  from: number
  to: number
}

function segments(cycles: CycleSnapshot[], id: string): Segment[] {
  const out: Segment[] = []
  for (const snap of cycles) {
    const status = snap.status[id] ?? 'idle'
    const last = out[out.length - 1]
    if (last && last.status === status && last.to === snap.cycle - 1 && !['completed', 'interrupted', 'canceled', 'rejected'].includes(status)) {
      last.to = snap.cycle
    } else {
      out.push({ status, from: snap.cycle, to: snap.cycle })
    }
  }
  return out
}

/**
 * Execution timeline: one row per command, one column per scheduler cycle.
 * Short simulations show discrete cells; long ones (autonomous) are time-scaled.
 */
export function Timeline({
  scenario,
  cycles,
  totalCycles,
  rows,
}: {
  scenario: Scenario
  cycles: CycleSnapshot[]
  totalCycles: number
  rows?: string[]
}) {
  const ids = rows ?? scenario.commands.map((c) => c.id)
  const visibleIds = ids.filter((id) => rows || cycles.some((s) => (s.status[id] ?? 'idle') !== 'idle'))
  const discrete = totalCycles <= 30
  const current = cycles.length

  if (visibleIds.length === 0) {
    return <p className="px-1 py-3 text-sm text-ink-faint">Nothing has run yet. Step the scheduler to fill the timeline.</p>
  }

  return (
    <div role="table" aria-label="Command execution timeline" className="text-xs">
      <div role="row" className="flex items-end gap-2 pb-1">
        <div role="columnheader" className="w-36 shrink-0 text-ink-faint">
          Command
        </div>
        <div role="columnheader" className="relative flex-1 text-ink-faint">
          {discrete ? (
            <div className="grid" style={{ gridTemplateColumns: `repeat(${totalCycles}, minmax(0, 1fr))` }}>
              {Array.from({ length: totalCycles }, (_, i) => (
                <span key={i} className={clsx('text-center tabular-nums', i + 1 === current && 'text-signal font-semibold')}>
                  {i + 1}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex justify-between tabular-nums">
              <span>0 s</span>
              <span>{((totalCycles * CYCLE_SECONDS) / 2).toFixed(1)} s</span>
              <span>{(totalCycles * CYCLE_SECONDS).toFixed(1)} s</span>
            </div>
          )}
        </div>
      </div>
      {visibleIds.map((id) => {
        const name = scenario.commands.find((c) => c.id === id)?.name ?? id
        const segs = segments(cycles, id)
        return (
          <div role="row" key={id} className="flex items-center gap-2 py-0.5">
            <div role="rowheader" className="w-36 shrink-0 truncate text-ink-muted" title={name}>
              {name}
            </div>
            <div role="cell" className="relative h-5 flex-1 rounded-sm bg-field-deep/60">
              {discrete &&
                Array.from({ length: totalCycles }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="absolute top-0 h-full border-l border-steel/50"
                    style={{ left: `${(i / totalCycles) * 100}%` }}
                  />
                ))}
              {segs
                .filter((s) => s.status !== 'idle')
                .map((s) => (
                  <span
                    key={`${s.from}-${s.status}`}
                    title={`${name}: ${STATUS_LABEL[s.status]} (cycle ${s.from}${s.to !== s.from ? `–${s.to}` : ''})`}
                    className={clsx('absolute top-0.5 bottom-0.5 rounded-[3px]', STATUS_STYLE[s.status].cell)}
                    style={{
                      left: `calc(${((s.from - 1) / totalCycles) * 100}% + 1px)`,
                      width: `calc(${((s.to - s.from + 1) / totalCycles) * 100}% - 2px)`,
                      minWidth: 3,
                    }}
                  />
                ))}
              {current > 0 && current < totalCycles && (
                <span aria-hidden className="absolute -top-0.5 -bottom-0.5 w-px bg-trophy/80" style={{ left: `${(current / totalCycles) * 100}%` }} />
              )}
            </div>
          </div>
        )
      })}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-ink-faint" aria-label="Legend">
        {(['running', 'waiting', 'completed', 'interrupted', 'canceled', 'rejected'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={clsx('inline-block h-2.5 w-4 rounded-[2px]', STATUS_STYLE[s].cell)} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  )
}
