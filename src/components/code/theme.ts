import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

export const cqTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-field-deep)',
      color: '#d6e2f5',
      fontSize: '13.5px',
      borderRadius: '8px',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      fontVariantLigatures: 'none',
      fontFeatureSettings: '"liga" 0, "calt" 0',
      padding: '12px 0',
      caretColor: 'var(--color-signal)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#4d5d7d',
      border: 'none',
      fontFamily: 'var(--font-mono)',
    },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '&.cm-focused': { outline: '2px solid var(--color-signal)', outlineOffset: '2px' },
    '.cm-line': { padding: '0 14px 0 6px' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#24456a !important' },
    '.cm-cursor': { borderLeftColor: 'var(--color-signal)', borderLeftWidth: '2px' },
    '.cq-editable': {
      backgroundColor: 'rgba(60, 200, 240, 0.12)',
      outline: '1px dashed rgba(60, 200, 240, 0.7)',
      borderRadius: '3px',
    },
  },
  { dark: true },
)

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: '#c792ea' },
  { tag: [t.typeName, t.className, t.namespace], color: '#ffcb6b' },
  { tag: [t.string, t.special(t.string)], color: '#a5e075' },
  { tag: [t.number, t.bool, t.null], color: '#f78c6c' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6b7d9f', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#82aaff' },
  { tag: [t.propertyName], color: '#89ddff' },
  { tag: [t.operator, t.punctuation], color: '#9fb3d1' },
  { tag: [t.variableName], color: '#e6edf7' },
])

export const cqHighlight = syntaxHighlighting(highlight)
