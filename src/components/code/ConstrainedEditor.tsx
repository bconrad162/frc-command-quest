import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { java } from '@codemirror/lang-java'
import { EditorState, RangeSet, StateField, type Range } from '@codemirror/state'
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { cqHighlight, cqTheme } from './theme.ts'

/**
 * A Java editor where only one region (between `prefix` and `suffix`) can change.
 * Edits outside the region are filtered out, so students fix exactly the line the
 * challenge is about. Nothing typed here is executed.
 */
export default function ConstrainedEditor({
  prefix,
  initial,
  suffix,
  value,
  onChange,
  label,
  disabled = false,
}: {
  prefix: string
  initial: string
  suffix: string
  value: string
  onChange: (region: string) => void
  label: string
  disabled?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!host.current) return
    const start = prefix.length
    // Region bounds tracked through edits. Stored as [from, to].
    const region = StateField.define<[number, number]>({
      create: () => [start, start + value.length],
      update(bounds, tr) {
        if (!tr.docChanged) return bounds
        return [tr.changes.mapPos(bounds[0], -1), tr.changes.mapPos(bounds[1], 1)]
      },
    })
    const highlight = StateField.define<DecorationSet>({
      create: (state) => regionDecoration(state.field(region)),
      update: (_d, tr) => regionDecoration(tr.state.field(region)),
      provide: (f) => EditorView.decorations.from(f),
    })
    const pointer = { down: false }
    const selectRegion = (view: EditorView) => {
      const [from, to] = view.state.field(region)
      view.dispatch({ selection: { anchor: from, head: to } })
      return true
    }
    const guard = EditorState.changeFilter.of((tr) => {
      const [from, to] = tr.startState.field(region)
      let allowed = true
      tr.changes.iterChangedRanges((fromA, toA) => {
        if (fromA < from || toA > to) allowed = false
      })
      // Keep the region on one line.
      if (tr.newDoc.lines !== tr.startState.doc.lines) allowed = false
      return allowed
    })
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: prefix + value + suffix,
        selection: { anchor: start + value.length },
        extensions: [
          lineNumbers(),
          history(),
          // Select-all selects only the editable region.
          keymap.of([{ key: 'Mod-a', run: selectRegion }, ...defaultKeymap, ...historyKeymap]),
          // Keyboard focus lands on the editable region, ready to type over.
          EditorView.domEventHandlers({
            focus: (_e, view) => {
              if (pointer.down) return false
              selectRegion(view)
              return false
            },
            mousedown: () => {
              pointer.down = true
              setTimeout(() => (pointer.down = false), 0)
              return false
            },
          }),
          java(),
          cqTheme,
          cqHighlight,
          region,
          highlight,
          guard,
          EditorState.readOnly.of(disabled),
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-describedby': 'editor-help' }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return
            const [from, to] = u.state.field(region)
            onChangeRef.current(u.state.doc.sliceString(from, to))
          }),
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor is created once per challenge; `value` updates flow out via onChange.
  }, [prefix, suffix, initial, disabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div ref={host} className="overflow-x-auto rounded-lg border border-steel" data-testid="constrained-editor" />
      <p id="editor-help" className="mt-1.5 text-xs text-ink-faint">
        Only the highlighted part can be edited. Tab into the editor to select it, or click inside it. Cmd/Ctrl+A selects the editable part.
      </p>
    </div>
  )
}

function regionDecoration([from, to]: [number, number]): DecorationSet {
  if (to <= from) return RangeSet.of<Decoration>([])
  const ranges: Range<Decoration>[] = [Decoration.mark({ class: 'cq-editable' }).range(from, to)]
  return Decoration.set(ranges)
}
