import { describe, expect, it } from 'vitest'
import { getChallenge } from '../../src/game/challenges/index.ts'
import { CONTROLS, controlMixUpTip } from '../../src/game/controller.ts'
import { gradeAnswer } from '../../src/game/grading.ts'
import type { Challenge } from '../../src/game/types.ts'
import { simulate } from '../../src/simulation/scheduler.ts'

const get = (id: string): Challenge => {
  const c = getChallenge(id)
  if (!c) throw new Error(id)
  return c
}

describe('controller map (easy-6)', () => {
  const c = get('easy-6-controller-map')
  if (c.kind !== 'controller-map') throw new Error('kind')
  const right = { ...c.expected }

  it('accepts the expected controls', () => {
    expect(gradeAnswer(c, { kind: 'controller-map', picks: right }).correct).toBe(true)
  })
  it('marks wrong rows and explains bumper versus trigger', () => {
    const r = gradeAnswer(c, { kind: 'controller-map', picks: { ...right, intake: 'leftBumper' } })
    expect(r.correct).toBe(false)
    expect(r.wrongCells).toEqual(['intake'])
    expect(r.feedback).toMatch(/Bumpers are the buttons on the top edge/)
  })
  it('requires every row and rejects unknown controls or rows', () => {
    expect(gradeAnswer(c, { kind: 'controller-map', picks: { ...right, zero: null } }).invalid).toBe(true)
    expect(gradeAnswer(c, { kind: 'controller-map', picks: { ...right, zero: 'turbo' } }).invalid).toBe(true)
    expect(gradeAnswer(c, { kind: 'controller-map', picks: { ...right, extra: 'a' } }).invalid).toBe(true)
  })
  it('every expected control exists and has a v3 method name in the code', () => {
    for (const row of c.rows) {
      const control = CONTROLS.find((k) => k.id === c.expected[row.id])
      expect(control, row.id).toBeDefined()
      expect(control!.methods.some((m) => row.code.includes(m.replace('()', '(')))).toBe(true)
    }
  })
  it('gives targeted mix-up tips', () => {
    expect(controlMixUpTip('view', 'menu')).toMatch(/three lines/)
    expect(controlMixUpTip('leftStick', 'rightStick')).toMatch(/left and right/)
    expect(controlMixUpTip('a', 'dpadUp')).toBeUndefined()
  })
})

describe('stick math (easy-7)', () => {
  const c = get('easy-7-stick-math')
  it('expects the negated forward value and the deadbanded turn', () => {
    expect(gradeAnswer(c, { kind: 'predict-output', text: 'Forward: 1.0\nTurn: 0.0' }).correct).toBe(true)
    expect(gradeAnswer(c, { kind: 'predict-output', text: 'Forward: -1.0\nTurn: 0.0' }).feedback).toMatch(/negates/)
    expect(gradeAnswer(c, { kind: 'predict-output', text: 'Forward: 1.0\nTurn: 0.05' }).feedback).toMatch(/deadband/)
  })
})

describe('hold to intake (medium-6)', () => {
  const c = get('medium-6-hold-to-intake')
  it.each(['whileTrue', 'retryWhileTrue'])('accepts %s', (code) => {
    expect(gradeAnswer(c, { kind: 'code-edit', code }).correct).toBe(true)
  })
  it.each([
    ['onTrue', /never stops/],
    ['toggleOnTrue', /presses again/],
    ['onFalse', /released/],
  ])('rejects %s with feedback', (code, pattern) => {
    const r = gradeAnswer(c, { kind: 'code-edit', code })
    expect(r.correct).toBe(false)
    expect(r.feedback).toMatch(pattern)
  })
})

describe('tap the button (medium-7): option timelines match the explanations', () => {
  const c = get('medium-7-tap-the-button')
  if (c.kind !== 'choice') throw new Error('kind')
  const runningAfterRelease = (id: string) => {
    const option = c.options.find((o) => o.id === id)!
    const result = simulate(option.scenario!)
    // Cycle 4 is the first full cycle after the release in cycle 3.
    return result.cycles[3].owners.intake === 'spin'
  }
  it('onTrue, toggleOnTrue and onFalse leave Spin Rollers running; whileTrue stops it', () => {
    const running = c.options.map((o) => o.id).filter(runningAfterRelease).sort()
    expect(running).toEqual([...c.correct].sort())
  })
  it('the log shows the button presses', () => {
    const option = c.options.find((o) => o.id === 'whileTrue')!
    const texts = simulate(option.scenario!).events.filter((e) => e.type === 'Log').map((e) => e.text)
    expect(texts).toContain('Driver pressed A (whileTrue)')
    expect(texts).toContain('whileTrue: falling edge, cancel Spin Rollers')
  })
})

describe('aim, then drive (hard-6)', () => {
  const c = get('hard-6-aim-then-drive')
  if (c.kind !== 'choice' || !c.scenario) throw new Error('kind')
  const result = simulate(c.scenario)
  it('the default command is interrupted while aiming and returns in the release cycle', () => {
    expect(result.cycles[1].owners.drive).toBe('teleop')
    expect(result.cycles[2].owners.drive).toBe('aim')
    expect(result.cycles[5].owners.drive).toBe('aim')
    expect(result.cycles[6].owners.drive).toBe('teleop')
    expect(result.events.some((e) => e.type === 'Interrupted' && e.command === 'teleop' && e.interrupter === 'aim')).toBe(true)
  })
})
