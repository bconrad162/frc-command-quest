import { ExternalLink, FlaskConical, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ControllerDiagram } from '../components/challenge/ControllerDiagram.tsx'
import { LazyCode } from '../components/challenge/inputs.tsx'
import { LinkButton } from '../components/ui.tsx'
import { CONTROLS } from '../game/controller.ts'
import { REFERENCE } from '../game/reference.ts'

export default function ReferencePage() {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return REFERENCE
    return REFERENCE.filter((e) => [e.term, e.summary, e.detail, e.code ?? ''].some((t) => t.toLowerCase().includes(q)))
  }, [query])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reference</h1>
          <p className="mt-1 max-w-2xl text-ink-muted">Short, plain-language explanations of Commands v3, each with the precise WPILib detail and a link to the official docs.</p>
        </div>
        <LinkButton to="/lab" variant="secondary">
          <FlaskConical className="size-4" aria-hidden /> Open the Scheduler Lab
        </LinkButton>
      </div>
      <label className="relative mt-6 block">
        <span className="sr-only">Search concepts</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search: fork, priority, yield..."
          className="h-11 w-full rounded-lg border border-steel bg-field-deep pl-9 pr-3 text-ink placeholder:text-ink-faint focus:border-signal"
        />
      </label>
      <p className="mt-2 text-sm text-ink-faint" aria-live="polite">
        {results.length} of {REFERENCE.length} concepts
      </p>
      <dl className="mt-4 grid gap-4">
        {results.map((e) => (
          <div key={e.id} id={e.id} className="panel px-5 py-4">
            <dt className="font-display text-xl font-bold">{e.term}</dt>
            <dd className="mt-1.5 grid gap-3">
              <p className="text-[15px] text-ink">{e.summary}</p>
              {e.code && <LazyCode code={e.code} label={`${e.term} example`} />}
              <p className="text-sm text-ink-muted">
                <span className="font-semibold text-ink">WPILib detail: </span>
                {e.detail}
              </p>
              {e.simplified && (
                <p className="text-sm text-ink-muted">
                  <span className="font-semibold text-warn">In the simulator: </span>
                  {e.simplified}
                </p>
              )}
              <a href={e.docs} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-sm text-signal hover:underline">
                Official docs <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </dd>
          </div>
        ))}
      </dl>
      <ControllerCheatSheet />
      <section className="mt-10 rounded-lg border border-steel px-5 py-4 text-sm text-ink-muted">
        <h2 className="text-lg text-ink">About the code in this game</h2>
        <p className="mt-2">
          Command Quest does not compile or run Java. Code challenges are graded by deterministic rules, and the scheduler is a TypeScript model of the
          documented Commands v3 behavior. WPILib names (<code className="inline-code">Command</code>, <code className="inline-code">Mechanism</code>,{' '}
          <code className="inline-code">coroutine.fork</code>, ...) are real API. Methods like <code className="inline-code">drive.followPath(...)</code> or{' '}
          <code className="inline-code">arm.raise()</code> are example team code, labeled in each mission.
        </p>
      </section>
    </div>
  )
}

function ControllerCheatSheet() {
  return (
    <section className="panel mt-10 px-5 py-4" id="controller" aria-labelledby="controller-heading">
      <h2 id="controller-heading" className="font-display text-xl font-bold">
        Xbox controller cheat sheet
      </h2>
      <p className="mt-1 text-[15px] text-ink-muted">
        Every control and the WPILib 2027 <code className="inline-code">CommandXboxController</code> method that reads it. The last column is the
        2026 name, for reading older team code.
      </p>
      <div className="mx-auto mt-3 max-w-md rounded-lg border border-steel bg-field-deep/60 p-2">
        <ControllerDiagram />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink-faint">
            <tr>
              <th scope="col" className="py-1.5 pr-4 font-normal">
                Control
              </th>
              <th scope="col" className="py-1.5 pr-4 font-normal">
                2027 method
              </th>
              <th scope="col" className="py-1.5 font-normal">
                2026 name
              </th>
            </tr>
          </thead>
          <tbody>
            {CONTROLS.map((c) => (
              <tr key={c.id} className="border-t border-steel/60">
                <th scope="row" className="py-1.5 pr-4 font-medium">
                  {c.label}
                </th>
                <td className="py-1.5 pr-4 font-mono text-[13px] text-signal">{c.methods.join(', ')}</td>
                <td className="py-1.5 font-mono text-[13px] text-ink-muted">{c.v2 ?? 'same'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
