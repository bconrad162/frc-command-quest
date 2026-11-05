import { java } from '@codemirror/lang-java'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { cqHighlight, cqTheme } from './theme.ts'

/** Read-only, syntax-highlighted Java. */
export default function CodeView({ code, label }: { code: string; label: string }) {
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
          cqHighlight,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ 'aria-label': label, tabindex: '0' }),
        ],
      }),
    })
    return () => view.destroy()
  }, [code, label])
  return <div ref={host} className="overflow-x-auto rounded-lg border border-steel" data-testid="code-view" />
}
