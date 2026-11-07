/**
 * Validates every challenge definition: structure, answer keys, and that every
 * scheduler-based answer key agrees with the simulator.
 */
import { describe, expect, it } from 'vitest'
import { CHALLENGES, challengesFor, DIFFICULTIES } from '../../src/game/challenges/index.ts'
import { forkAwaitScenario } from '../../src/game/challenges/medium.ts'
import { gradeAnswer, referenceAnswer } from '../../src/game/grading.ts'
import { evaluateRoutine } from '../../src/simulation/autonomous.ts'
import { simulate, validateScenario } from '../../src/simulation/scheduler.ts'

describe('challenge catalog', () => {
  it('has at least 15 challenges, five per difficulty', () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(15)
    for (const d of DIFFICULTIES) expect(challengesFor(d).length).toBeGreaterThanOrEqual(5)
  })

  it('uses unique, URL-safe ids', () => {
    const ids = CHALLENGES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('covers all four game modes', () => {
    const modes = new Set(CHALLENGES.map((c) => c.mode))
    expect(modes).toEqual(new Set(['java-lab', 'scheduler', 'autonomous', 'controls']))
  })

  for (const c of CHALLENGES) {
    describe(c.id, () => {
      it('has all required content', () => {
        expect(c.title.length).toBeGreaterThan(3)
        expect(c.objective.length).toBeGreaterThan(10)
        expect(c.briefing.length).toBeGreaterThan(0)
        expect(c.prompt.length).toBeGreaterThan(10)
        expect(c.hints.length).toBeGreaterThanOrEqual(1)
        expect(c.why.length).toBeGreaterThan(20)
        expect(c.successMessage.length).toBeGreaterThan(5)
        expect(c.concepts.length).toBeGreaterThan(0)
        // No placeholder text.
        const text = JSON.stringify(c)
        expect(text).not.toMatch(/TODO|lorem|placeholder|FIXME/i)
      })

      it('accepts its reference answer', () => {
        const result = gradeAnswer(c, referenceAnswer(c))
        expect(result.invalid).toBeFalsy()
        expect(result.correct).toBe(true)
      })

      it('rejects malformed answers without throwing', () => {
        expect(gradeAnswer(c, null).invalid).toBe(true)
        expect(gradeAnswer(c, { kind: 'nope' }).invalid).toBe(true)
        expect(gradeAnswer(c, { kind: c.kind }).correct).toBe(false)
        expect(gradeAnswer(c, { kind: c.kind, text: 1, selected: 'x', code: {}, order: 5, cells: [], routine: 'x' }).correct).toBe(false)
      })

      if ('scenario' in c && c.scenario) {
        it('has a valid scenario', () => {
          expect(() => validateScenario(c.scenario!)).not.toThrow()
        })
      }
    })
  }
})

describe('scheduler answer keys agree with the simulator', () => {
  for (const c of CHALLENGES) {
    if (c.kind === 'choice' && c.verify && c.scenario) {
      it(`${c.id}: verify() matches the declared answer`, () => {
        const result = simulate(c.scenario!)
        expect(c.verify!(result).sort()).toEqual([...c.correct].sort())
      })
    }
    if (c.kind === 'timeline') {
      it(`${c.id}: expected grid matches the simulator`, () => {
        const result = simulate(c.scenario)
        for (const row of c.rows) {
          const actual = c.cycles.map((cycle) => result.cycles[cycle - 1].status[row])
          expect(actual).toEqual(c.expected[row])
        }
      })
    }
    if (c.kind === 'predict-output' && c.scenario) {
      it(`${c.id}: expected output matches simulated prints after 2 cycles`, () => {
        const result = simulate(c.scenario!)
        const printed = result.events.filter((e) => e.type === 'Log' && e.cycle <= 2).map((e) => e.text)
        expect(printed).toEqual(c.expectedOutput)
      })
    }
  }

  it('medium-3: only fork/await raises while driving and scores after arriving', () => {
    const check = (first: 'fork' | 'await', second: 'fork' | 'await') => {
      const r = simulate(forkAwaitScenario(first, second))
      const runningAt = (id: string) => r.cycles.filter((s) => s.status[id] === 'running').map((s) => s.cycle)
      const path = runningAt('path')
      const raise = runningAt('raise')
      const score = runningAt('score')
      const overlap = raise.some((cy) => path.includes(cy))
      const scoreAfterArrive = Math.min(...score) > Math.max(...path)
      return { overlap, scoreAfterArrive, done: r.outcomes.seq?.cycle }
    }
    expect(check('fork', 'await')).toEqual({ overlap: true, scoreAfterArrive: true, done: 11 })
    expect(check('await', 'await')).toEqual({ overlap: false, scoreAfterArrive: true, done: 16 })
    expect(check('fork', 'fork').scoreAfterArrive).toBe(false)
    expect(check('await', 'fork').scoreAfterArrive).toBe(false)
  })

  it('medium-4: the starting order hangs and both accepted orders succeed', () => {
    const c = CHALLENGES.find((x) => x.id === 'medium-4-debug-sequence')!
    if (c.kind !== 'reorder') throw new Error('wrong kind')
    expect(gradeAnswer(c, { kind: 'reorder', order: c.initialOrder }).correct).toBe(false)
    for (const order of c.correctOrders) expect(gradeAnswer(c, { kind: 'reorder', order }).correct).toBe(true)
  })

  it('hard-4: the starter routine fails', () => {
    const c = CHALLENGES.find((x) => x.id === 'hard-4-debug-auto')!
    if (c.kind !== 'autonomous') throw new Error('wrong kind')
    expect(evaluateRoutine(c.starter).success).toBe(false)
  })

  it('hard-5: thresholds are reachable and meaningful', () => {
    const c = CHALLENGES.find((x) => x.id === 'hard-5-optimize-auto')!
    if (c.kind !== 'autonomous') throw new Error('wrong kind')
    const best = gradeAnswer(c, referenceAnswer(c))
    expect(best.efficiency).toBe('gold')
    const sequential = gradeAnswer(c, {
      kind: 'autonomous',
      routine: [
        { op: 'await', command: 'toPiece' },
        { op: 'await', command: 'intake' },
        { op: 'await', command: 'raise' },
        { op: 'await', command: 'toScore' },
        { op: 'await', command: 'score' },
        { op: 'await', command: 'lower' },
      ],
    })
    expect(sequential.correct).toBe(true)
    expect(sequential.efficiency).toBe('bronze')
    // Forking Lower Arm at the end leaves the arm up: My Auto finishes and cancels it.
    const forkedLower = gradeAnswer(c, {
      kind: 'autonomous',
      routine: [
        { op: 'fork', command: 'intake' },
        { op: 'await', command: 'toPiece' },
        { op: 'fork', command: 'raise' },
        { op: 'await', command: 'toScore' },
        { op: 'await', command: 'score' },
        { op: 'fork', command: 'lower' },
      ],
    })
    expect(forkedLower.correct).toBe(false)
  })
})
