import { expect, test } from 'vitest'
import { CommandScheduler, simulate } from '../../src/simulation/scheduler.ts'
import type { Scenario } from '../../src/simulation/types.ts'
import { LOWEST_PRIORITY } from '../../src/simulation/types.ts'

const scenario = (): Scenario => ({
  mechanisms: [{ id: 'intake', name: 'intake', defaultCommand: 'idle' }],
  commands: [
    { id: 'idle', name: 'Idle', requirements: ['intake'], priority: LOWEST_PRIORITY, repeatedly: true, body: [{ op: 'repeat', label: 'idle' }] },
    { id: 'cmd', name: 'RunIntake', requirements: ['intake'], repeatedly: true, body: [{ op: 'repeat', label: 'run' }] },
  ],
  events: [],
  maxCycles: 10,
})

test('pollTriggers schedules a command in the same cycle it is polled', () => {
  const s = new CommandScheduler(scenario(), {
    pollTriggers: (sch) => {
      if (sch.cycle === 3) sch.scheduleExternal('cmd')
    },
  })
  const snaps = [s.step(), s.step(), s.step()]
  expect(snaps[1].running).not.toContain('cmd')
  expect(snaps[2].cycle).toBe(3)
  expect(snaps[2].running).toContain('cmd')
})

test('a polled command on a mechanism keeps its default command off', () => {
  const s = new CommandScheduler(scenario(), {
    pollTriggers: (sch) => {
      if (sch.cycle === 1) sch.scheduleExternal('cmd')
    },
  })
  for (let i = 0; i < 4; i++) {
    const snap = s.step()
    expect(snap.running).toContain('cmd')
    expect(snap.running).not.toContain('idle')
  }
})

test('scenarios without pollTriggers are unchanged', () => {
  const a = simulate(scenario())
  const b = new CommandScheduler(scenario(), {}).runUntil()
  expect(b).toEqual(a)
})
