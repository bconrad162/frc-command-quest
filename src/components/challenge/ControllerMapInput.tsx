import { clsx } from 'clsx'
import { Fragment, useState } from 'react'
import { CONTROL_BY_ID, CONTROLS, type ControlId } from '../../game/controller.ts'
import type { ControllerMapChallenge } from '../../game/types.ts'
import { ControllerDiagram, type ControlMark } from './ControllerDiagram.tsx'

type Picks = Record<string, ControlId | null>

/** Code that wraps after "." and "(" instead of in the middle of a name. */
export function WrappingCode({ code }: { code: string }) {
  const parts = code.split(/(?<=[.(])/)
  return (
    <code className="block break-words font-mono text-[13px] text-ink">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </code>
  )
}

/** Badges like "1, 4" for every control that one or more rows point at. */
export function marksFor(
  rows: ControllerMapChallenge['rows'],
  picks: Partial<Record<string, ControlId | null>>,
  toneFor: (rowId: string) => ControlMark['tone'],
): Partial<Record<ControlId, ControlMark>> {
  const marks: Partial<Record<ControlId, ControlMark>> = {}
  rows.forEach((row, i) => {
    const id = picks[row.id]
    if (!id) return
    const tone = toneFor(row.id)
    const prev = marks[id]
    marks[id] = {
      badge: prev?.badge ? `${prev.badge},${i + 1}` : String(i + 1),
      tone: prev?.tone === 'fault' || tone === 'fault' ? 'fault' : tone,
    }
  })
  return marks
}

export function ControllerMapInput({
  challenge,
  picks,
  onChange,
  wrongRows = [],
  disabled,
}: {
  challenge: ControllerMapChallenge
  picks: Picks
  onChange: (p: Picks) => void
  wrongRows?: string[]
  disabled?: boolean
}) {
  const [active, setActive] = useState<string>(challenge.rows[0]?.id ?? '')

  const assign = (rowId: string, control: ControlId | null) => {
    const next = { ...picks, [rowId]: control }
    onChange(next)
    // Move on to the next line that still needs a control.
    if (control) {
      const after = challenge.rows.slice(challenge.rows.findIndex((r) => r.id === rowId) + 1)
      const nextEmpty = [...after, ...challenge.rows].find((r) => !next[r.id])
      if (nextEmpty) setActive(nextEmpty.id)
    }
  }

  const marks = marksFor(challenge.rows, picks, (rowId) => (wrongRows.includes(rowId) ? 'fault' : 'signal'))

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
      <ol className="grid gap-2" aria-label="Lines of robot code">
        {challenge.rows.map((row, i) => {
          const wrong = wrongRows.includes(row.id)
          const isActive = active === row.id && !disabled
          return (
            <li
              key={row.id}
              className={clsx(
                'rounded-lg border p-2.5 transition-colors',
                wrong ? 'border-fault bg-fault/5' : isActive ? 'border-signal bg-signal/5' : 'border-steel bg-field-deep/50',
              )}
              onClick={() => !disabled && setActive(row.id)}
              data-testid={`map-row-${row.id}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-steel text-xs font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <WrappingCode code={row.code} />
                  <div className="mt-0.5 text-xs text-ink-muted">{row.purpose}</div>
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                <span className="sr-only">
                  Line {i + 1}, {row.purpose}:
                </span>
                <span aria-hidden>Control</span>
                <select
                  value={picks[row.id] ?? ''}
                  disabled={disabled}
                  onFocus={() => setActive(row.id)}
                  onChange={(e) => assign(row.id, (e.target.value || null) as ControlId | null)}
                  className={clsx(
                    'h-8 min-w-0 flex-1 rounded border bg-field-deep px-1.5 text-xs text-ink',
                    wrong ? 'border-fault ring-1 ring-fault' : 'border-steel',
                  )}
                  data-testid={`map-select-${row.id}`}
                >
                  <option value="">Choose a control</option>
                  {CONTROLS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          )
        })}
      </ol>
      <div className="order-first xl:sticky xl:top-4 xl:order-last">
        <div className="rounded-lg border border-steel bg-field-deep/60 p-2">
          <ControllerDiagram
            marks={marks}
            onPick={disabled ? undefined : (id) => active && assign(active, id)}
            highlight={disabled ? null : picks[active] ?? null}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">
          {disabled
            ? 'Numbers show which line uses each control.'
            : `Line ${challenge.rows.findIndex((r) => r.id === active) + 1} is selected: click a control to assign it${picks[active] ? ` (now ${CONTROL_BY_ID[picks[active]!].label})` : ''}.`}
        </p>
      </div>
    </div>
  )
}
