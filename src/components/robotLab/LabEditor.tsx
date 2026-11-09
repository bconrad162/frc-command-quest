import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { java } from '@codemirror/lang-java'
import { EditorState, StateEffect, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { clsx } from 'clsx'
import { CircleAlert, CircleCheck, FileCode2, Lock, Rocket } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { REGION_IDS, type LabProblem, type LabRegions, type RegionId } from '../../game/robotLab/labCode.ts'
import { cqHighlight, cqTheme } from '../code/theme.ts'
import { RichText } from '../ui.tsx'
import { buildRobotContainer, READ_ONLY_FILES, regionLineToFileLine, unindentRegion } from './labFiles.ts'

type Ranges = Record<RegionId, [number, number]>
const MAIN_FILE = 'RobotContainer.java'

const setProblems = StateEffect.define<LabProblem[]>()

const editorChrome = EditorView.theme({
  '&': { borderRadius: '0', height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto' },
  '.cq-problem': {
    textDecoration: 'underline wavy var(--color-fault)',
    textDecorationSkipInk: 'none',
    textUnderlineOffset: '3px',
  },
  '.cq-problem-line': { backgroundColor: 'rgba(255, 93, 108, 0.08)' },
})

/** On phone-width screens long lines wrap, so a whole binding is visible without sideways scrolling. */
const phoneWrap = () => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches ? EditorView.lineWrapping : [])

/** Creates the RobotContainer editor state: read-only except inside the three regions. */
function containerState(regions: LabRegions, onChange: (r: LabRegions) => void, onCursor: (line: number, col: number) => void) {
  const { doc, ranges } = buildRobotContainer(regions)
  const regionField = StateField.define<Ranges>({
    create: () => Object.fromEntries(REGION_IDS.map((id) => [id, [ranges[id].from, ranges[id].to]])) as Ranges,
    update(value, tr) {
      if (!tr.docChanged) return value
      return Object.fromEntries(REGION_IDS.map((id) => [id, [tr.changes.mapPos(value[id][0], -1), tr.changes.mapPos(value[id][1], 1)]])) as Ranges
    },
  })
  const regionMarks = StateField.define<DecorationSet>({
    create: (s) => markRegions(s.field(regionField)),
    update: (_d, tr) => markRegions(tr.state.field(regionField)),
    provide: (f) => EditorView.decorations.from(f),
  })
  const problemMarks = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      let next = value.map(tr.changes)
      for (const e of tr.effects) if (e.is(setProblems)) next = markProblems(tr.state, tr.state.field(regionField), e.value)
      return next
    },
    provide: (f) => EditorView.decorations.from(f),
  })
  const guard = EditorState.changeFilter.of((tr) => {
    const bounds = tr.startState.field(regionField)
    let ok = true
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const inside = REGION_IDS.find((id) => fromA >= bounds[id][0] && toA <= bounds[id][1])
      if (!inside) ok = false
      // AutoBuilder.configure's last argument line stays one line.
      else if (inside === 'driveRequirements' && inserted.lines > 1) ok = false
    })
    return ok
  })
  const state = EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      history(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      java(),
      cqTheme,
      editorChrome,
      cqHighlight,
      regionField,
      regionMarks,
      problemMarks,
      guard,
      EditorState.tabSize.of(4),
      phoneWrap(),
      EditorView.contentAttributes.of({ 'aria-label': `${MAIN_FILE}: only the highlighted parts can be edited` }),
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged) {
          const head = u.state.selection.main.head
          const line = u.state.doc.lineAt(head)
          onCursor(line.number, head - line.from + 1)
        }
        if (!u.docChanged) return
        const f = u.state.field(regionField)
        onChange(Object.fromEntries(REGION_IDS.map((id) => [id, unindentRegion(id, u.state.doc.sliceString(f[id][0], f[id][1]))])) as LabRegions)
      }),
    ],
  })
  return { state, regionField }
}

function markRegions(ranges: Ranges): DecorationSet {
  const marks: Range<Decoration>[] = []
  for (const id of REGION_IDS) {
    const [from, to] = ranges[id]
    if (to > from) marks.push(Decoration.mark({ class: 'cq-editable', attributes: { 'data-region': id } }).range(from, to))
  }
  return Decoration.set(marks, true)
}

/** The file line (1-based) of a problem, from the region's live position. */
function problemLine(state: EditorState, ranges: Ranges, p: LabProblem): number {
  const first = state.doc.lineAt(ranges[p.region][0]).number
  return Math.min(state.doc.lines, first + p.line - 1)
}

function markProblems(state: EditorState, ranges: Ranges, problems: LabProblem[]): DecorationSet {
  const marks: Range<Decoration>[] = []
  for (const p of problems) {
    const line = state.doc.line(problemLine(state, ranges, p))
    marks.push(Decoration.line({ class: 'cq-problem-line' }).range(line.from))
    const text = line.text
    const start = line.from + (text.length - text.trimStart().length)
    if (line.to > start) marks.push(Decoration.mark({ class: 'cq-problem' }).range(start, line.to))
  }
  return Decoration.set(marks, true)
}

function ReadOnlyFile({ code, path }: { code: string; path: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(),
          java(),
          cqTheme,
          editorChrome,
          cqHighlight,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          phoneWrap(),
          EditorView.contentAttributes.of({ 'aria-label': `${path} (read-only)`, tabindex: '0' }),
        ],
      }),
    })
    return () => view.destroy()
  }, [code, path])
  return <div ref={host} className="h-full" />
}

/**
 * A code-editor-style panel: explorer, file tabs, breadcrumbs, the editor, a
 * Problems panel and a status bar with Deploy. `docKey` recreates the editor
 * from `regions` (a mission loaded, or the fix shown); otherwise edits flow out
 * through `onChange`.
 */
export function LabEditor({
  regions,
  docKey,
  onChange,
  problems,
  onDeploy,
  dirty,
}: {
  regions: LabRegions
  docKey: string
  onChange: (r: LabRegions) => void
  problems: LabProblem[]
  onDeploy: () => void
  /** The editor's code differs from what's deployed. */
  dirty: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const [active, setActive] = useState(MAIN_FILE)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const problemsRef = useRef(problems)
  const regionsRef = useRef<StateField<Ranges> | null>(null)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!host.current) return
    const { state, regionField } = containerState(regions, (r) => onChangeRef.current(r), (line, col) => setCursor({ line, col }))
    regionsRef.current = regionField
    const view = new EditorView({ parent: host.current, state })
    // Open on the code students change: configureBindings() and the default command above it.
    const bindingsAt = view.state.field(regionField).bindings[0]
    view.dispatch({ effects: [setProblems.of(problemsRef.current), EditorView.scrollIntoView(bindingsAt, { y: 'center' })] })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Recreated only when the parent loads new code (docKey); typing flows out via onChange.
  }, [docKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    problemsRef.current = problems
    viewRef.current?.dispatch({ effects: setProblems.of(problems) })
  }, [problems])

  const fileLine = (view: EditorView, p: LabProblem): number => {
    const field = regionsRef.current
    return field ? problemLine(view.state, view.state.field(field), p) : p.line
  }
  const jumpTo = (p: LabProblem) => {
    setActive(MAIN_FILE)
    // The main editor stays mounted (hidden), so it can take focus right away.
    const view = viewRef.current
    if (!view) return
    const line = view.state.doc.line(fileLine(view, p))
    view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true })
    requestAnimationFrame(() => view.focus())
  }

  const files = [MAIN_FILE, ...READ_ONLY_FILES.map((f) => f.path)]
  const readOnly = READ_ONLY_FILES.find((f) => f.path === active)
  const canDeploy = problems.length === 0

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-steel bg-field-deep" aria-label="Code editor" data-testid="lab-editor">
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-44 shrink-0 flex-col border-r border-steel bg-pit/60 py-2 text-xs 2xl:flex" aria-label="Explorer">
          <p className="px-3 pb-1.5 text-[11px] font-semibold text-ink-faint">Explorer</p>
          <p className="px-3 pb-1 font-mono text-[11px] text-ink-faint">src/main/java/frc/robot</p>
          {files.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setActive(f)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1 text-left font-mono',
                f === active ? 'bg-signal/15 text-ink' : 'text-ink-muted hover:bg-pit-raised hover:text-ink',
                f !== MAIN_FILE && 'pl-5',
              )}
              aria-current={f === active ? 'true' : undefined}
            >
              {f === MAIN_FILE ? <FileCode2 className="size-3.5 shrink-0 text-signal" aria-hidden /> : <Lock className="size-3 shrink-0 text-ink-faint" aria-hidden />}
              <span className="truncate">{f}</span>
              {f === MAIN_FILE && dirty && <span className="ml-auto size-2 shrink-0 rounded-full bg-ink-muted" aria-label="unsaved changes" />}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-stretch border-b border-steel bg-pit/60">
            <div className="flex min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label="Open files">
              {files.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={f === active}
                  onClick={() => setActive(f)}
                  className={clsx(
                    'flex shrink-0 items-center gap-1.5 border-r border-steel px-3 py-2 font-mono text-xs',
                    f === active ? 'border-t-2 border-t-signal bg-field-deep text-ink' : 'border-t-2 border-t-transparent text-ink-faint hover:text-ink',
                  )}
                >
                  {f}
                  {f === MAIN_FILE && dirty && <span className="size-1.5 rounded-full bg-ink-muted" aria-hidden />}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onDeploy}
              disabled={!canDeploy}
              title={canDeploy ? 'Deploy this code to the robot (restarts it, disabled)' : 'Fix the problems first'}
              className={clsx(
                'flex shrink-0 items-center gap-1.5 px-3 text-xs font-semibold',
                canDeploy ? (dirty ? 'bg-signal text-field-deep hover:bg-[#62d6f5]' : 'text-signal hover:bg-pit-raised') : 'cursor-not-allowed text-ink-faint',
              )}
              data-testid="lab-deploy"
            >
              <Rocket className="size-3.5" aria-hidden />
              Deploy
            </button>
          </div>
          <p className="truncate border-b border-steel/60 px-3 py-1 font-mono text-[11px] text-ink-faint">
            src › main › java › frc › robot › <span className="text-ink-muted">{active}</span>
            {readOnly && <span className="ml-2 text-ink-faint">(read-only)</span>}
          </p>
          <div className="relative min-h-[22rem] flex-1">
            <div ref={host} className={clsx('absolute inset-0', readOnly && 'invisible')} data-testid="lab-code" />
            {readOnly && (
              <div className="absolute inset-0">
                <ReadOnlyFile code={readOnly.code} path={readOnly.path} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-steel bg-pit/60" data-testid="lab-problems">
        <p className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-ink-muted">
          Problems
          <span className={clsx('rounded-full px-1.5 font-mono', problems.length ? 'bg-fault/20 text-fault' : 'bg-steel text-ink-faint')}>{problems.length}</span>
        </p>
        <ul className="max-h-28 overflow-y-auto pb-1.5 text-xs" aria-live="polite">
          {problems.length === 0 && <li className="px-3 py-0.5 text-ink-faint">No problems. Deploy to try your code on the robot.</li>}
          {problems.map((p, i) => (
            <li key={i}>
              <button type="button" onClick={() => jumpTo(p)} className="flex w-full items-start gap-2 px-3 py-0.5 text-left hover:bg-pit-raised">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-fault" aria-hidden />
                <RichText text={p.message} className="min-w-0 break-words text-ink" />
                <span className="ml-auto shrink-0 font-mono text-ink-faint">
                  {MAIN_FILE} [Ln {regionLineToFileLine(regions, p.region, p.line)}]
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-3 border-t border-steel bg-signal-deep/40 px-3 py-0.5 font-mono text-[11px] text-ink-muted">
        <span className="flex items-center gap-1">
          {problems.length ? <CircleAlert className="size-3 text-fault" aria-hidden /> : <CircleCheck className="size-3 text-go" aria-hidden />}
          {problems.length} {problems.length === 1 ? 'problem' : 'problems'}
        </span>
        <span>{dirty ? 'Not deployed' : 'Deployed'}</span>
        <span className="ml-auto">
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span className="hidden sm:inline">Java · Commands v3</span>
      </div>
    </section>
  )
}
