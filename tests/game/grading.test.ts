import { describe, expect, it } from 'vitest'
import { getChallenge } from '../../src/game/challenges/index.ts'
import { gradeAnswer, normalizeOutput } from '../../src/game/grading.ts'
import type { Challenge } from '../../src/game/types.ts'

const get = (id: string): Challenge => {
  const c = getChallenge(id)
  if (!c) throw new Error(id)
  return c
}

describe('predict-output grading (Java Debugging Lab)', () => {
  const c = get('easy-1-battery-math')
  it('normalizes whitespace and blank lines', () => {
    expect(normalizeOutput('  Battery:   80%  \r\n\n Motors: 41 \n')).toEqual(['Battery: 80%', 'Motors: 41'])
    expect(gradeAnswer(c, { kind: 'predict-output', text: 'Battery:  80%\n\nMotors: 41\n' }).correct).toBe(true)
  })
  it('gives targeted feedback for the string concatenation trap', () => {
    const r = gradeAnswer(c, { kind: 'predict-output', text: 'Battery: 80%\nMotors: 5' })
    expect(r.correct).toBe(false)
    expect(r.feedback).toMatch(/String/)
  })
  it('points to the first wrong line otherwise', () => {
    const r = gradeAnswer(c, { kind: 'predict-output', text: 'Battery: 80%\nMotors: 6' })
    expect(r.feedback).toMatch(/line 2/)
  })
  it('is case sensitive like real program output', () => {
    expect(gradeAnswer(c, { kind: 'predict-output', text: 'battery: 80%\nmotors: 41' }).correct).toBe(false)
  })
  it('rejects empty and oversized answers as invalid', () => {
    expect(gradeAnswer(c, { kind: 'predict-output', text: '   ' }).invalid).toBe(true)
    expect(gradeAnswer(c, { kind: 'predict-output', text: 'x'.repeat(5000) }).invalid).toBe(true)
  })
})

describe('code-edit grading', () => {
  const loop = get('easy-2-countdown-loop')
  it.each(['i > 0', 'i>=1', '0 < i', 'i != 0'])('accepts %s', (code) => {
    expect(gradeAnswer(loop, { kind: 'code-edit', code }).correct).toBe(true)
  })
  it.each([
    ['i >= 0', /0/],
    ['i < 0', /never runs/],
    ['i > 1', /too early/],
    ['i <= 3', /runaway/],
  ])('rejects %s with feedback', (code, pattern) => {
    const r = gradeAnswer(loop, { kind: 'code-edit', code })
    expect(r.correct).toBe(false)
    expect(r.feedback).toMatch(pattern)
  })

  const cleanup = get('hard-3-cancel-cleanup')
  it.each(['.whenCanceled(() -> roller.set(0))', '.whenCanceled(() -> { roller.set(0); })', '.whenExited(() -> roller.stopMotor())'])(
    'accepts cleanup %s',
    (code) => {
      expect(gradeAnswer(cleanup, { kind: 'code-edit', code }).correct).toBe(true)
    },
  )
  it('explains that whenCanceled needs a lambda', () => {
    expect(gradeAnswer(cleanup, { kind: 'code-edit', code: '.whenCanceled(roller.set(0))' }).feedback).toMatch(/lambda/)
  })
})

describe('choice grading', () => {
  it('single choice returns the option-specific explanation', () => {
    const c = get('medium-1-drive-conflict')
    const r = gradeAnswer(c, { kind: 'choice', selected: ['a'] })
    expect(r.correct).toBe(false)
    expect(r.feedback).toMatch(/waiting line/)
    expect(gradeAnswer(c, { kind: 'choice', selected: ['c'] }).correct).toBe(true)
  })
  it('single choice rejects multiple selections', () => {
    expect(gradeAnswer(get('medium-1-drive-conflict'), { kind: 'choice', selected: ['a', 'c'] }).invalid).toBe(true)
  })
  it('multi-select requires the exact set', () => {
    const c = get('hard-2-external-interrupt')
    expect(gradeAnswer(c, { kind: 'choice', selected: ['manualArm'] }).correct).toBe(true)
    const extra = gradeAnswer(c, { kind: 'choice', selected: ['manualArm', 'intakeTask'] })
    expect(extra.correct).toBe(false)
    expect(extra.feedback).toMatch(/Intake Task/)
  })
  it('rejects unknown option ids', () => {
    expect(gradeAnswer(get('easy-3-arm-safety'), { kind: 'choice', selected: ['zzz'] }).invalid).toBe(true)
  })
})

describe('reorder grading', () => {
  const c = get('easy-4-first-command')
  it('accepts every valid order', () => {
    expect(gradeAnswer(c, { kind: 'reorder', order: ['print', 'start', 'wait', 'stop'] }).correct).toBe(true)
    expect(gradeAnswer(c, { kind: 'reorder', order: ['start', 'print', 'wait', 'stop'] }).correct).toBe(true)
  })
  it('rejects wrong orders and duplicate ids', () => {
    expect(gradeAnswer(c, { kind: 'reorder', order: ['start', 'stop', 'wait', 'print'] }).correct).toBe(false)
    expect(gradeAnswer(c, { kind: 'reorder', order: ['start', 'start', 'wait', 'stop'] }).invalid).toBe(true)
  })
})

describe('timeline grading', () => {
  const c = get('medium-5-cycle-timeline')
  it('highlights wrong cells', () => {
    if (c.kind !== 'timeline') throw new Error()
    const cells = structuredClone(c.expected)
    cells.raise[2] = 'running'
    const r = gradeAnswer(c, { kind: 'timeline', cells })
    expect(r.correct).toBe(false)
    expect(r.wrongCells).toEqual(['raise:2'])
  })
  it('treats blanks as incomplete, not wrong', () => {
    if (c.kind !== 'timeline') throw new Error()
    const cells = structuredClone(c.expected) as Record<string, (string | null)[]>
    cells.prep[0] = null
    expect(gradeAnswer(c, { kind: 'timeline', cells }).invalid).toBe(true)
  })
})

describe('autonomous grading', () => {
  const c = get('hard-4-debug-auto')
  it('validates the routine objective, not just its duration', () => {
    // Very short routine: "fast" but never scores.
    const r = gradeAnswer(c, { kind: 'autonomous', routine: [{ op: 'await', command: 'toPiece' }] })
    expect(r.correct).toBe(false)
  })
  it('awards efficiency tiers', () => {
    const r = gradeAnswer(c, {
      kind: 'autonomous',
      routine: [
        { op: 'fork', command: 'intake' },
        { op: 'await', command: 'toPiece' },
        { op: 'fork', command: 'raise' },
        { op: 'await', command: 'toScore' },
        { op: 'await', command: 'score' },
      ],
    })
    expect(r.correct).toBe(true)
    expect(r.efficiency).toBe('gold')
  })
  it('rejects commands outside the palette and oversized routines', () => {
    expect(gradeAnswer(c, { kind: 'autonomous', routine: [{ op: 'await', command: 'teleport' }] }).invalid).toBe(true)
    expect(gradeAnswer(c, { kind: 'autonomous', routine: Array.from({ length: 40 }, () => ({ op: 'await', command: 'toPiece' })) }).invalid).toBe(true)
  })
})
