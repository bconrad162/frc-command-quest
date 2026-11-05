import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { ChoiceChallenge, ReorderChallenge, TimelineCell, TimelineChallenge } from '../../game/types.ts'
import { STATUS_STYLE } from '../scheduler/describe.ts'
import { Spinner } from '../ui.tsx'

const CodeView = lazy(() => import('../code/CodeView.tsx'))

export function PredictOutputInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-muted">Console output</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={5}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="Type each printed line on its own line"
        className="w-full resize-y rounded-lg border border-steel bg-field-deep p-3 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-signal"
        data-testid="output-input"
      />
    </label>
  )
}

export function ChoiceInput({
  challenge,
  selected,
  onChange,
  disabled,
  reveal,
}: {
  challenge: ChoiceChallenge
  selected: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  /** After completion, mark the correct options. */
  reveal?: boolean
}) {
  const multiple = Boolean(challenge.multiple)
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm text-ink-muted">{multiple ? 'Select every answer that applies.' : 'Choose one answer.'}</legend>
      {challenge.options.map((o) => {
        const checked = selected.includes(o.id)
        const isCorrect = reveal && challenge.correct.includes(o.id)
        return (
          <label
            key={o.id}
            className={clsx(
              'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors',
              checked ? 'border-signal bg-signal/5' : 'border-steel hover:border-steel-bright',
              isCorrect && 'border-go bg-go/5',
            )}
          >
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={`choice-${challenge.id}`}
              value={o.id}
              checked={checked}
              onChange={(e) => {
                if (multiple) onChange(e.target.checked ? [...selected, o.id] : selected.filter((s) => s !== o.id))
                else onChange([o.id])
              }}
              className="mt-1 size-4 shrink-0 accent-[var(--color-signal)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{o.label}</span>
              {o.code && (
                <span className="mt-2 block">
                  <Suspense fallback={<pre className="font-mono text-xs">{o.code}</pre>}>
                    <CodeView code={o.code} label={`${o.label} code`} />
                  </Suspense>
                </span>
              )}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

export function ReorderInput({
  challenge,
  order,
  onChange,
  disabled,
}: {
  challenge: ReorderChallenge
  order: string[]
  onChange: (o: string[]) => void
  disabled?: boolean
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const items = order.map((id) => challenge.items.find((i) => i.id === id)!).filter(Boolean)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || disabled) return
    const next = [...order]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    onChange(next)
    setAnnounce(`Moved line to position ${to + 1} of ${order.length}`)
  }
  const pad = ' '.repeat(Math.max(0, (challenge.indent ?? 4) - 2))
  return (
    <div className="rounded-lg border border-steel bg-field-deep p-3 font-mono text-[13px]">
      <pre className="whitespace-pre-wrap text-ink-muted">{challenge.before}</pre>
      <ol className="my-1.5 grid gap-1" aria-label="Reorderable lines. Use the arrow buttons to move a line.">
        {items.map((item, i) => (
          <li
            key={item.id}
            draggable={!disabled}
            onDragStart={() => setDragging(item.id)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging) move(order.indexOf(dragging), i)
              setDragging(null)
            }}
            className={clsx(
              'flex items-center gap-2 rounded border bg-pit-raised py-1 pl-1 pr-1.5',
              dragging === item.id ? 'border-signal opacity-60' : 'border-steel-bright',
            )}
            data-testid={`reorder-item-${item.id}`}
          >
            <GripVertical className="size-4 shrink-0 cursor-grab text-ink-faint" aria-hidden />
            <span className="w-5 shrink-0 text-right text-xs text-ink-faint tabular-nums">{i + 1}</span>
            <code className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">
              {pad}
              {item.code}
            </code>
            <span className="flex shrink-0 gap-0.5">
              <button
                type="button"
                className="rounded p-1 text-ink-muted hover:bg-steel hover:text-ink disabled:opacity-30"
                onClick={() => move(i, i - 1)}
                disabled={disabled || i === 0}
                aria-label={`Move "${item.code}" up`}
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-ink-muted hover:bg-steel hover:text-ink disabled:opacity-30"
                onClick={() => move(i, i + 1)}
                disabled={disabled || i === items.length - 1}
                aria-label={`Move "${item.code}" down`}
              >
                <ArrowDown className="size-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <pre className="whitespace-pre-wrap text-ink-muted">{challenge.after}</pre>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  )
}

/** Named after where each command stopped at the end of the cycle, not whether it did any work. */
const CELL_LABEL: Record<TimelineCell, string> = { running: 'Yielded', waiting: 'Awaiting', completed: 'Finished', idle: '—' }

export function TimelineInput({
  challenge,
  cells,
  onChange,
  wrongCells = [],
  disabled,
}: {
  challenge: TimelineChallenge
  cells: Record<string, (TimelineCell | null)[]>
  onChange: (c: Record<string, (TimelineCell | null)[]>) => void
  wrongCells?: string[]
  disabled?: boolean
}) {
  const name = (id: string) => challenge.scenario.commands.find((c) => c.id === id)?.name ?? id
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <caption className="sr-only">Predict each command's status at the end of every cycle</caption>
        <thead>
          <tr>
            <th className="text-left text-xs font-normal text-ink-faint">Command</th>
            {challenge.cycles.map((c) => (
              <th key={c} scope="col" className="text-xs font-normal text-ink-faint">
                Cycle {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {challenge.rows.map((row) => (
            <tr key={row}>
              <th scope="row" className="whitespace-nowrap pr-2 text-left font-medium">
                {name(row)}
              </th>
              {challenge.cycles.map((cycle, i) => {
                const value = cells[row]?.[i] ?? null
                const wrong = wrongCells.includes(`${row}:${i}`)
                return (
                  <td key={cycle}>
                    <select
                      aria-label={`${name(row)}, cycle ${cycle}`}
                      value={value ?? ''}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = { ...cells, [row]: [...(cells[row] ?? challenge.cycles.map(() => null))] }
                        next[row][i] = (e.target.value || null) as TimelineCell | null
                        onChange(next)
                      }}
                      className={clsx(
                        'h-9 w-full min-w-[5.5rem] rounded border bg-field-deep px-1.5 text-xs',
                        value === null && 'text-ink-faint',
                        value && value !== 'idle' && STATUS_STYLE[value].pill,
                        wrong ? 'border-fault ring-1 ring-fault' : 'border-steel',
                      )}
                      data-testid={`cell-${row}-${i}`}
                    >
                      <option value="">Choose</option>
                      {challenge.choices.map((c) => (
                        <option key={c} value={c}>
                          {CELL_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-ink-faint" aria-label="What each status means">
        <dt className="font-medium text-ink-muted">Yielded</dt>
        <dd>
          Stopped at <code className="inline-code">coroutine.yield()</code>. It picks up again next cycle.
        </dd>
        <dt className="font-medium text-ink-muted">Awaiting</dt>
        <dd>
          Stopped at an <code className="inline-code">await</code>. It is stuck until that child finishes, even if it did work earlier this cycle.
        </dd>
        <dt className="font-medium text-ink-muted">Finished</dt>
        <dd>Ended during this cycle. In later cycles it is —.</dd>
        <dt className="font-medium text-ink-muted">—</dt>
        <dd>Not running: not started yet, or already finished.</dd>
      </dl>
      <p className="mt-1.5 text-xs text-ink-faint">The simulator calls these Running, Waiting and Completed.</p>
    </div>
  )
}

export function LazyCode({ code, label }: { code: string; label: string }) {
  return (
    <Suspense fallback={<Spinner label="Loading code" />}>
      <CodeView code={code} label={label} />
    </Suspense>
  )
}
