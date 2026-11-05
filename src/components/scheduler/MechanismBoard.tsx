import { clsx } from 'clsx'
import type { CycleSnapshot, Scenario } from '../../simulation/types.ts'
import { commandName } from './describe.ts'

function Glyph({ id, active }: { id: string; active: boolean }) {
  const spin = active ? 'origin-center animate-[spin_1.2s_linear_infinite]' : ''
  if (id === 'drive') {
    return (
      <svg viewBox="0 0 48 32" className="h-8 w-12" aria-hidden>
        <rect x="8" y="6" width="32" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
        {[
          [8, 6],
          [40, 6],
          [8, 26],
          [40, 26],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`} className={spin} style={{ transformBox: 'fill-box' }}>
            <circle cx={cx} cy={cy} r="5" fill="var(--color-pit)" stroke="currentColor" strokeWidth="2" />
            <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} stroke="currentColor" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
    )
  }
  if (id === 'intake') {
    return (
      <svg viewBox="0 0 48 32" className="h-8 w-12" aria-hidden>
        {[14, 34].map((cx) => (
          <g key={cx} className={spin} style={{ transformBox: 'fill-box' }}>
            <circle cx={cx} cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d={`M${cx} 7v18M${cx - 9} 16h18`} stroke="currentColor" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 32" className="h-8 w-12" aria-hidden>
      <rect x="6" y="24" width="14" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
      <g className={clsx('transition-transform duration-500', active && 'rotate-[-28deg]')} style={{ transformOrigin: '13px 24px' }}>
        <line x1="13" y1="24" x2="40" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="40" cy="12" r="3" fill="currentColor" />
      </g>
      <circle cx="13" cy="24" r="3" fill="var(--color-pit)" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function MechanismBoard({ scenario, snap }: { scenario: Scenario; snap: CycleSnapshot | undefined }) {
  if (scenario.mechanisms.length === 0) return null
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${scenario.mechanisms.length}, minmax(0, 1fr))` }}>
      {scenario.mechanisms.map((m) => {
        const owner = snap?.owners[m.id] ?? null
        const status = owner ? snap?.status[owner] : undefined
        const working = status === 'running'
        return (
          <div
            key={`${m.id}-${owner ?? 'none'}`}
            className={clsx(
              'rounded-lg border px-3 py-2.5 transition-colors',
              owner ? 'border-signal/60 bg-signal/5 anim-own' : 'border-steel bg-field-deep/40',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-semibold">{m.name}</span>
              <span className={owner ? (working ? 'text-signal' : 'text-ink-muted') : 'text-ink-faint'}>
                <Glyph id={m.id} active={working} />
              </span>
            </div>
            <div className="mt-1 text-xs text-ink-muted">Owner</div>
            <div className={clsx('truncate text-sm font-medium', owner ? 'text-ink' : 'text-ink-faint')}>
              {owner ? commandName(scenario, owner) : 'None (idle)'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
