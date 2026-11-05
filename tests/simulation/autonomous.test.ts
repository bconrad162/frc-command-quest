import { describe, expect, it } from 'vitest'
import { evaluateRoutine, routineToJava, validateRoutineShape, type RoutineStep } from '../../src/simulation/autonomous.ts'

const aw = (command: RoutineStep['command']): RoutineStep => ({ op: 'await', command })
const fk = (command: RoutineStep['command']): RoutineStep => ({ op: 'fork', command })

describe('autonomous routine evaluation', () => {
  it('a fully sequential routine succeeds but is slow', () => {
    const r = evaluateRoutine([aw('toPiece'), aw('intake'), aw('raise'), aw('toScore'), aw('score')])
    expect(r.success).toBe(true)
    expect(r.seconds).toBe(5.42)
  })

  it('raising the arm during the ToScore path saves a second', () => {
    const r = evaluateRoutine([aw('toPiece'), aw('intake'), fk('raise'), aw('toScore'), aw('score')])
    expect(r.success).toBe(true)
    expect(r.seconds).toBe(4.42)
  })

  it('spinning up the intake early (fork) plus parallel arm is optimal', () => {
    const r = evaluateRoutine([fk('intake'), aw('toPiece'), aw('intake'), fk('raise'), aw('toScore'), aw('score')])
    expect(r.success).toBe(true)
    expect(r.seconds).toBe(4.04)
    expect(r.conflicts).toEqual([])
  })

  it('awaiting the intake before driving never finishes (no piece at the start line)', () => {
    const r = evaluateRoutine([aw('intake'), aw('toPiece'), aw('toScore'), aw('score')])
    expect(r.success).toBe(false)
    expect(r.objectives.finished).toBe(false)
    expect(r.finishCycle).toBeNull()
  })

  it('raising the arm before pickup blocks the ground intake', () => {
    const r = evaluateRoutine([fk('raise'), fk('intake'), aw('toPiece'), aw('intake'), aw('toScore'), aw('score')])
    expect(r.success).toBe(false)
    expect(r.issues.some((i) => i.kind === 'pickup-blocked')).toBe(true)
  })

  it('scoring while still driving misses', () => {
    const r = evaluateRoutine([fk('intake'), aw('toPiece'), aw('intake'), aw('raise'), fk('toScore'), aw('score')])
    expect(r.success).toBe(false)
    expect(r.issues.some((i) => i.kind === 'bad-score')).toBe(true)
  })

  it('a forked score that is never awaited is canceled when My Auto finishes', () => {
    const r = evaluateRoutine([fk('intake'), aw('toPiece'), aw('intake'), aw('raise'), aw('toScore'), fk('score')])
    expect(r.objectives.scored).toBe(false)
    expect(r.result.outcomes.score?.status).toBe('canceled')
  })

  it('forking Lower Arm right after Raise Arm is a sibling conflict that interrupts the raise', () => {
    const r = evaluateRoutine([fk('intake'), aw('toPiece'), aw('intake'), fk('raise'), fk('lower'), aw('toScore'), aw('score')])
    expect(r.conflicts.some((e) => e.command === 'raise' && e.interrupter === 'lower')).toBe(true)
    expect(r.result.outcomes.auto?.status).toBe('completed') // parent survives a sibling conflict
    expect(r.success).toBe(false)
  })

  it('awaiting Stop Intake hangs because runRepeatedly never finishes', () => {
    const r = evaluateRoutine([fk('intake'), aw('toPiece'), aw('intake'), aw('stopIntake'), aw('toScore')])
    expect(r.objectives.finished).toBe(false)
  })

  it('validates routine shape', () => {
    expect(validateRoutineShape([aw('toPiece')])).toBe(true)
    expect(validateRoutineShape([])).toBe(false)
    expect(validateRoutineShape([{ op: 'eval', command: 'toPiece' }])).toBe(false)
    expect(validateRoutineShape([{ op: 'fork', command: 'teleport' }])).toBe(false)
    expect(validateRoutineShape(Array.from({ length: 13 }, () => aw('toPiece')))).toBe(false)
  })

  it('generates Java for the routine', () => {
    const java = routineToJava([fk('intake'), aw('toPiece')])
    expect(java).toContain('Command runIntake = intake.intakeUntilPiece();')
    expect(java).toContain('coroutine.fork(runIntake);')
    expect(java).toContain('.named("My Auto");')
  })
})
