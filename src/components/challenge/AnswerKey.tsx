import { clsx } from 'clsx'
import { CONTROL_BY_ID } from '../../game/controller.ts'
import { referenceAnswer } from '../../game/grading.ts'
import type { Challenge, TimelineChallenge } from '../../game/types.ts'
import { PALETTE_BY_ID } from '../../simulation/autonomous.ts'
import { STATUS_STYLE } from '../scheduler/describe.ts'
import { ControllerDiagram } from './ControllerDiagram.tsx'
import { marksFor, WrappingCode } from './ControllerMapInput.tsx'
import { CELL_LABEL, LazyCode } from './inputs.tsx'

const codeBox = 'overflow-x-auto rounded-md border border-steel bg-field-deep px-3 py-2 font-mono text-sm text-ink'

/**
 * The correct answer laid out like the question the student filled in, so the
 * two can be compared side by side. `wrongCells` outlines timeline cells the
 * student got wrong.
 */
export function AnswerKey({ challenge, wrongCells = [] }: { challenge: Challenge; wrongCells?: string[] }) {
  switch (challenge.kind) {
    case 'predict-output':
      return (
        <pre className={codeBox} data-testid="revealed-output">
          {challenge.expectedOutput.join('\n')}
        </pre>
      )
    case 'code-edit':
      return <pre className={codeBox}>{challenge.solution}</pre>
    case 'choice': {
      const correct = challenge.options.filter((o) => challenge.correct.includes(o.id))
      return (
        <ul className="grid gap-1.5">
          {correct.map((o) => (
            <li key={o.id} className="rounded-md border border-go/40 bg-go/5 px-3 py-2">
              <span className="font-medium text-ink">{o.label}</span>
              {o.code && <pre className={clsx(codeBox, 'mt-1.5')}>{o.code}</pre>}
            </li>
          ))}
        </ul>
      )
    }
    case 'reorder': {
      const pad = ' '.repeat(challenge.indent ?? 4)
      const order = challenge.correctOrders[0]
      const lines = order.map((id) => pad + (challenge.items.find((i) => i.id === id)?.code ?? ''))
      return <LazyCode code={[challenge.before, ...lines, challenge.after].join('\n')} label="Correct order" />
    }
    case 'timeline':
      return <TimelineKey challenge={challenge} wrongCells={wrongCells} />
    case 'controller-map':
      return (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
          <ol className="grid gap-1.5" data-testid="answer-controller">
            {challenge.rows.map((row, i) => {
              const missed = wrongCells.includes(row.id)
              return (
                <li
                  key={row.id}
                  className={clsx('rounded-md border px-2.5 py-1.5', missed ? 'border-fault' : 'border-steel')}
                  data-testid={`answer-row-${row.id}`}
                >
                  <WrappingCode code={`${i + 1}. ${row.code}`} />
                  <span className="text-sm text-go">{CONTROL_BY_ID[challenge.expected[row.id]].label}</span>
                  {missed && <span className="ml-1.5 text-xs text-fault">(you had this wrong)</span>}
                </li>
              )
            })}
          </ol>
          <div className="rounded-lg border border-steel bg-field-deep/60 p-2">
            <ControllerDiagram marks={marksFor(challenge.rows, challenge.expected, (id) => (wrongCells.includes(id) ? 'fault' : 'go'))} />
          </div>
        </div>
      )
    case 'autonomous': {
      const answer = referenceAnswer(challenge)
      if (answer.kind !== 'autonomous') return null
      return (
        <ol className="grid gap-1">
          {answer.routine.map((s, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border border-steel bg-field-deep px-2 py-1.5 text-sm">
              <span className="w-5 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
              <span className={clsx('rounded px-1.5 py-px font-mono text-xs', s.op === 'fork' ? 'bg-tier-medium/25 text-tier-medium' : 'bg-signal/20 text-signal')}>
                {s.op}
              </span>
              <span>{PALETTE_BY_ID[s.command].label}</span>
            </li>
          ))}
        </ol>
      )
    }
  }
}

function TimelineKey({ challenge, wrongCells }: { challenge: TimelineChallenge; wrongCells: string[] }) {
  const name = (id: string) => challenge.scenario.commands.find((c) => c.id === id)?.name ?? id
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm" data-testid="answer-timeline">
        <caption className="sr-only">Correct status of each command at the end of every cycle</caption>
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
              {challenge.expected[row].map((value, i) => {
                const missed = wrongCells.includes(`${row}:${i}`)
                return (
                  <td
                    key={i}
                    className={clsx(
                      'h-9 min-w-[5.5rem] rounded border px-2 text-center text-xs',
                      value === 'idle' ? 'border-steel text-ink-faint' : STATUS_STYLE[value].pill,
                      missed && 'outline-2 outline-offset-1 outline-fault',
                    )}
                    data-testid={`answer-${row}-${i}`}
                  >
                    {CELL_LABEL[value]}
                    {missed && <span className="sr-only"> (you had this wrong)</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {wrongCells.length > 0 && (
        <p className="mt-1 text-xs text-ink-faint">Cells outlined in red are the ones you got wrong.</p>
      )}
    </div>
  )
}
