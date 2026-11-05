/**
 * Scheduler behavior tests. Each expectation cites the Commands v3 documentation
 * (docs.wpilib.org .../commands-v3/) or allwpilib Scheduler.java. See
 * docs/commands-v3-behavior.md.
 */
import { describe, expect, it } from 'vitest'
import { CommandScheduler, simulate, SimulationError } from '../../src/simulation/scheduler.ts'
import type { CommandDef, Scenario } from '../../src/simulation/types.ts'
import { LOWEST_PRIORITY } from '../../src/simulation/types.ts'

const mechs = [
  { id: 'drive', name: 'Drive' },
  { id: 'intake', name: 'Intake' },
  { id: 'arm', name: 'Arm' },
]

function scenario(commands: CommandDef[], events: Scenario['events'], extra: Partial<Scenario> = {}): Scenario {
  return { mechanisms: mechs, commands, events, maxCycles: 20, ...extra }
}

const work = (id: string, req: string[], cycles: number, priority?: number): CommandDef => ({
  id,
  name: id,
  requirements: req,
  priority,
  body: [{ op: 'work', label: id, cycles }],
})

function types(result: ReturnType<typeof simulate>, command?: string) {
  return result.events.filter((e) => !command || e.command === command).map((e) => `${e.cycle}:${e.type}:${e.command ?? ''}`)
}

describe('scheduling vs execution', () => {
  it('a scheduled command is pending until promoted, then runs in the same cycle', () => {
    const s = new CommandScheduler(scenario([work('a', ['drive'], 3)], [{ cycle: 1, action: 'schedule', command: 'a' }]))
    const snap = s.step()
    expect(snap.pending).toEqual(['a'])
    expect(snap.status.a).toBe('running')
    expect(snap.owners.drive).toBe('a')
  })

  it('a for-loop command with yield runs one iteration per cycle and completes on the next mount', () => {
    // creating-commands.rst: "calling coroutine.yield() at the end of every loop"
    const r = simulate(scenario([work('a', ['drive'], 3)], [{ cycle: 1, action: 'schedule', command: 'a' }]))
    expect(r.cycles.slice(0, 4).map((c) => c.status.a)).toEqual(['running', 'running', 'running', 'completed'])
    expect(r.outcomes.a).toEqual({ status: 'completed', cycle: 4 })
    expect(r.cycles[3].owners.drive).toBeNull() // requirements released on completion
  })

  it('a one-shot command (no yield) completes in the cycle it is promoted', () => {
    const r = simulate(
      scenario(
        [{ id: 'reset', name: 'Reset Gyro', requirements: [], body: [{ op: 'log', text: 'reset' }] }],
        [{ cycle: 2, action: 'schedule', command: 'reset' }],
      ),
    )
    expect(r.outcomes.reset).toEqual({ status: 'completed', cycle: 2 })
    expect(types(r, 'reset')).toEqual(['2:Scheduled:reset', '2:Log:reset', '2:Completed:reset'])
  })

  it('scheduling an already-running command object has no effect', () => {
    // making-commands-run.rst "Scheduling Already Running Commands"
    const r = simulate(
      scenario(
        [work('a', ['drive'], 5)],
        [
          { cycle: 1, action: 'schedule', command: 'a' },
          { cycle: 3, action: 'schedule', command: 'a' },
        ],
      ),
    )
    expect(r.outcomes.a).toEqual({ status: 'completed', cycle: 6 })
    expect(types(r, 'a')).toContain('3:AlreadyRunning:a')
  })
})

describe('mechanism conflicts and priorities', () => {
  it('a new equal-priority command interrupts the running command (newest wins ties)', () => {
    // how-it-works.rst: "If they have the same priority, the pending command interrupts the running one"
    const r = simulate(
      scenario(
        [work('forward', ['drive'], 10), work('turn', ['drive'], 3)],
        [
          { cycle: 1, action: 'schedule', command: 'forward' },
          { cycle: 3, action: 'schedule', command: 'turn' },
        ],
      ),
    )
    expect(r.outcomes.forward).toEqual({ status: 'interrupted', cycle: 3 })
    expect(r.cycles[2].owners.drive).toBe('turn')
    const forwardEvents = r.events.filter((e) => e.command === 'forward' && e.cycle === 3).map((e) => e.type)
    // telemetry.rst: Interrupted is emitted immediately before Canceled
    expect(forwardEvents).toEqual(['Interrupted', 'Canceled'])
    expect(r.events.find((e) => e.type === 'Interrupted')?.interrupter).toBe('turn')
  })

  it('a higher-priority pending command interrupts a lower-priority running command', () => {
    const r = simulate(
      scenario(
        [work('low', ['arm'], 10, 0), work('high', ['arm'], 2, 10)],
        [
          { cycle: 1, action: 'schedule', command: 'low' },
          { cycle: 2, action: 'schedule', command: 'high' },
        ],
      ),
    )
    expect(r.outcomes.low?.status).toBe('interrupted')
    expect(r.cycles[1].owners.arm).toBe('high')
  })

  it('a lower-priority command is rejected and never starts; the running command continues', () => {
    // how-it-works.rst: "If the pending command has lower priority, it is discarded and does not start."
    const r = simulate(
      scenario(
        [work('climb', ['arm'], 6, 100), work('stow', ['arm'], 2, 0)],
        [
          { cycle: 1, action: 'schedule', command: 'climb' },
          { cycle: 2, action: 'schedule', command: 'stow' },
        ],
      ),
    )
    expect(r.outcomes.stow).toEqual({ status: 'rejected', cycle: 2 })
    expect(r.outcomes.climb).toEqual({ status: 'completed', cycle: 7 })
    const rejected = r.events.find((e) => e.type === 'ScheduleRejected')
    expect(rejected).toMatchObject({ command: 'stow', blocker: 'climb', reason: 'LowerPriorityThanRunningCommand' })
  })

  it('a new command must be >= every command it conflicts with', () => {
    // migration-guide.rst "Requirements Still Matter"
    const both: CommandDef = { id: 'both', name: 'both', requirements: ['drive', 'arm'], priority: 5, body: [{ op: 'work', label: 'x', cycles: 2 }] }
    const r = simulate(
      scenario(
        [work('d', ['drive'], 10, 0), work('a', ['arm'], 10, 9), both],
        [
          { cycle: 1, action: 'schedule', command: 'd' },
          { cycle: 1, action: 'schedule', command: 'a' },
          { cycle: 2, action: 'schedule', command: 'both' },
        ],
      ),
    )
    expect(r.outcomes.both?.status).toBe('rejected')
    expect(r.cycles[1].owners).toMatchObject({ drive: 'd', arm: 'a' })
  })

  it('commands on different mechanisms run together', () => {
    const r = simulate(
      scenario(
        [work('d', ['drive'], 3), work('i', ['intake'], 3)],
        [
          { cycle: 1, action: 'schedule', command: 'd' },
          { cycle: 1, action: 'schedule', command: 'i' },
        ],
      ),
    )
    expect(r.cycles[0].owners).toMatchObject({ drive: 'd', intake: 'i' })
    expect(r.outcomes.d?.status).toBe('completed')
    expect(r.outcomes.i?.status).toBe('completed')
  })

  it('two conflicting commands scheduled in the same cycle: the later one evicts the earlier pending one', () => {
    const r = simulate(
      scenario(
        [work('a', ['drive'], 3), work('b', ['drive'], 3)],
        [
          { cycle: 1, action: 'schedule', command: 'a' },
          { cycle: 1, action: 'schedule', command: 'b' },
        ],
      ),
    )
    expect(r.outcomes.a?.status).toBe('interrupted')
    expect(r.cycles[0].pending).toEqual(['b'])
    expect(r.cycles[0].owners.drive).toBe('b')
  })

  it('only one running command ever owns a mechanism', () => {
    const r = simulate(
      scenario(
        [work('a', ['drive'], 4), work('b', ['drive', 'arm'], 4), work('c', ['arm'], 4)],
        [
          { cycle: 1, action: 'schedule', command: 'a' },
          { cycle: 2, action: 'schedule', command: 'c' },
          { cycle: 3, action: 'schedule', command: 'b' },
          { cycle: 4, action: 'schedule', command: 'a' },
        ],
      ),
    )
    for (const c of r.cycles) {
      for (const m of ['drive', 'arm']) {
        const owners = c.running.filter((id) => [work('a', ['drive'], 0), work('b', ['drive', 'arm'], 0), work('c', ['arm'], 0)].find((x) => x.id === id)?.requirements.includes(m))
        expect(owners.length).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('coroutines: yield, wait, waitUntil, park', () => {
  it('yield pauses and resumes from the same point next cycle', () => {
    const cmd: CommandDef = {
      id: 'p',
      name: 'Printer',
      requirements: [],
      body: [
        { op: 'log', text: 'A' },
        { op: 'yield' },
        { op: 'log', text: 'B' },
        { op: 'yield' },
        { op: 'log', text: 'C' },
      ],
    }
    const r = simulate(scenario([cmd], [{ cycle: 1, action: 'schedule', command: 'p' }]))
    expect(r.events.filter((e) => e.type === 'Log').map((e) => `${e.cycle}${e.text}`)).toEqual(['1A', '2B', '3C'])
    expect(r.outcomes.p).toEqual({ status: 'completed', cycle: 3 })
  })

  it('wait(n cycles) resumes n cycles later', () => {
    const cmd: CommandDef = {
      id: 'w',
      name: 'Waiter',
      requirements: [],
      body: [{ op: 'wait', cycles: 3 }, { op: 'log', text: 'done' }],
    }
    const r = simulate(scenario([cmd], [{ cycle: 1, action: 'schedule', command: 'w' }]))
    expect(r.cycles[0].status.w).toBe('waiting')
    expect(r.outcomes.w).toEqual({ status: 'completed', cycle: 4 })
  })

  it('waitUntil continues immediately if the condition is already true, otherwise parks', () => {
    const cmd: CommandDef = {
      id: 'u',
      name: 'Until',
      requirements: ['intake'],
      body: [{ op: 'waitUntil', signal: 'hasGamePiece' }, { op: 'log', text: 'got it' }],
    }
    const r = simulate(
      scenario([cmd], [
        { cycle: 1, action: 'schedule', command: 'u' },
        { cycle: 4, action: 'setSignal', signal: 'hasGamePiece', value: true },
      ]),
    )
    expect(r.outcomes.u).toEqual({ status: 'completed', cycle: 4 })
    expect(r.cycles[1].owners.intake).toBe('u') // still owns the mechanism while waiting
  })

  it('park() waits until canceled', () => {
    const cmd: CommandDef = { id: 'k', name: 'Park', requirements: ['arm'], body: [{ op: 'park' }] }
    const r = simulate(
      scenario([cmd], [
        { cycle: 1, action: 'schedule', command: 'k' },
        { cycle: 6, action: 'cancel', command: 'k' },
      ]),
    )
    expect(r.cycles[4].status.k).toBe('waiting')
    expect(r.outcomes.k).toEqual({ status: 'canceled', cycle: 6 })
  })
})

describe('fork and await', () => {
  const armUp = work('armUp', ['arm'], 3)
  const spin = work('spin', ['intake'], 5)

  it('fork starts the child immediately and the parent keeps going', () => {
    const parent: CommandDef = {
      id: 'parent',
      name: 'Parent',
      requirements: [],
      body: [{ op: 'fork', commands: ['armUp'] }, { op: 'log', text: 'after fork' }, { op: 'await', command: 'spin' }],
    }
    const r = simulate(scenario([parent, armUp, spin], [{ cycle: 1, action: 'schedule', command: 'parent' }]))
    // Child is scheduled and running in cycle 1, and the parent's next line ran in cycle 1 too.
    expect(r.cycles[0].status.armUp).toBe('running')
    expect(r.cycles[0].owners.arm).toBe('armUp')
    expect(r.cycles[0].parents.armUp).toBe('parent')
    expect(r.events.find((e) => e.type === 'Log')?.cycle).toBe(1)
    // arm and intake work at the same time
    expect(r.cycles[1].owners).toMatchObject({ arm: 'armUp', intake: 'spin' })
    expect(r.outcomes.armUp?.status).toBe('completed')
  })

  it('await pauses the parent until the child completes, and the parent resumes in the same cycle', () => {
    // how-it-works.rst: newest-to-oldest "allows parent commands to resume in the same loop cycle"
    const parent: CommandDef = {
      id: 'parent',
      name: 'Parent',
      requirements: [],
      body: [{ op: 'await', command: 'armUp' }, { op: 'log', text: 'arm is up' }],
    }
    const r = simulate(scenario([parent, armUp], [{ cycle: 1, action: 'schedule', command: 'parent' }]))
    expect(r.cycles[0].status.parent).toBe('waiting')
    expect(r.outcomes.armUp).toEqual({ status: 'completed', cycle: 4 })
    expect(r.events.find((e) => e.type === 'Log')?.cycle).toBe(4)
    expect(r.outcomes.parent).toEqual({ status: 'completed', cycle: 4 })
  })

  it('fork vs await: forking two children finishes sooner than awaiting them in sequence', () => {
    const drive = work('path', ['drive'], 4)
    const forked: CommandDef = {
      id: 'auto',
      name: 'Auto',
      requirements: [],
      body: [{ op: 'fork', commands: ['armUp'] }, { op: 'await', command: 'path' }],
    }
    const awaited: CommandDef = {
      id: 'auto',
      name: 'Auto',
      requirements: [],
      body: [{ op: 'await', command: 'armUp' }, { op: 'await', command: 'path' }],
    }
    const a = simulate(scenario([forked, armUp, drive], [{ cycle: 1, action: 'schedule', command: 'auto' }]))
    const b = simulate(scenario([awaited, armUp, drive], [{ cycle: 1, action: 'schedule', command: 'auto' }]))
    expect(a.outcomes.auto?.cycle).toBe(5)
    expect(b.outcomes.auto?.cycle).toBe(8)
  })

  it('awaiting a one-shot child continues immediately without yielding', () => {
    const oneShot: CommandDef = { id: 'flag', name: 'Flag', requirements: [], body: [{ op: 'log', text: 'set' }] }
    const parent: CommandDef = {
      id: 'parent',
      name: 'Parent',
      requirements: [],
      body: [{ op: 'await', command: 'flag' }, { op: 'log', text: 'next' }],
    }
    const r = simulate(scenario([parent, oneShot], [{ cycle: 1, action: 'schedule', command: 'parent' }]))
    expect(r.outcomes.parent).toEqual({ status: 'completed', cycle: 1 })
  })

  it('awaiting an already-running forked child waits for that same run', () => {
    // making-commands-run.rst duplicateScheduling example
    const parent: CommandDef = {
      id: 'parent',
      name: 'Parent',
      requirements: [],
      body: [{ op: 'fork', commands: ['armUp'] }, { op: 'await', command: 'armUp' }],
    }
    const r = simulate(scenario([parent, armUp], [{ cycle: 1, action: 'schedule', command: 'parent' }]))
    expect(r.outcomes.armUp).toEqual({ status: 'completed', cycle: 4 })
    expect(r.outcomes.parent).toEqual({ status: 'completed', cycle: 4 })
    expect(r.events.filter((e) => e.type === 'Scheduled' && e.command === 'armUp')).toHaveLength(1)
  })

  it('awaiting a child that already finished starts it over again', () => {
    const quick = work('quick', ['arm'], 1)
    const parent: CommandDef = {
      id: 'parent',
      name: 'Parent',
      requirements: [],
      body: [{ op: 'fork', commands: ['quick'] }, { op: 'await', command: 'spin' }, { op: 'await', command: 'quick' }],
    }
    const r = simulate(scenario([parent, quick, spin], [{ cycle: 1, action: 'schedule', command: 'parent' }]))
    expect(r.events.filter((e) => e.type === 'Scheduled' && e.command === 'quick')).toHaveLength(2)
  })

  it('awaitAll waits for every child; awaitAny cancels the rest after the first finishes', () => {
    const all: CommandDef = { id: 'p', name: 'P', requirements: [], body: [{ op: 'awaitAll', commands: ['armUp', 'spin'] }] }
    const r1 = simulate(scenario([all, armUp, spin], [{ cycle: 1, action: 'schedule', command: 'p' }]))
    expect(r1.outcomes.p?.cycle).toBe(6)
    const any: CommandDef = { id: 'p', name: 'P', requirements: [], body: [{ op: 'awaitAny', commands: ['armUp', 'spin'] }] }
    const r2 = simulate(scenario([any, armUp, spin], [{ cycle: 1, action: 'schedule', command: 'p' }]))
    expect(r2.outcomes.armUp?.status).toBe('completed')
    expect(r2.outcomes.spin).toEqual({ status: 'canceled', cycle: 4 })
    expect(r2.outcomes.p?.cycle).toBe(4)
  })

  it('forking two children that require the same mechanism together is a programming error', () => {
    const p: CommandDef = { id: 'p', name: 'P', requirements: [], body: [{ op: 'fork', commands: ['a', 'b'] }] }
    const s = new CommandScheduler(scenario([p, work('a', ['arm'], 2), work('b', ['arm'], 2)], [{ cycle: 1, action: 'schedule', command: 'p' }]))
    expect(() => s.step()).toThrow(SimulationError)
  })
})

describe('parent/child relationships', () => {
  const armTask = work('armTask', ['arm'], 10)
  const intakeTask = work('intakeTask', ['intake'], 10)
  const path = work('path', ['drive'], 10)
  const autoScore: CommandDef = {
    id: 'auto',
    name: 'Auto Score',
    requirements: [],
    body: [
      { op: 'fork', commands: ['armTask'] },
      { op: 'fork', commands: ['intakeTask'] },
      { op: 'await', command: 'path' },
    ],
  }

  it('canceling the parent cancels all forked children', () => {
    const r = simulate(
      scenario([autoScore, armTask, intakeTask, path], [
        { cycle: 1, action: 'schedule', command: 'auto' },
        { cycle: 3, action: 'cancel', command: 'auto' },
      ]),
    )
    for (const id of ['auto', 'armTask', 'intakeTask', 'path']) expect(r.outcomes[id]).toEqual({ status: 'canceled', cycle: 3 })
    expect(r.cycles[2].running).toEqual([])
  })

  it('an external interruption of one child cancels the whole composition', () => {
    // creating-commands.rst "Interruption Example"
    const safety = work('safety', ['arm'], 2, 0)
    const r = simulate(
      scenario([autoScore, armTask, intakeTask, path, safety], [
        { cycle: 1, action: 'schedule', command: 'auto' },
        { cycle: 3, action: 'schedule', command: 'safety' },
      ]),
    )
    expect(r.outcomes.auto).toEqual({ status: 'interrupted', cycle: 3 })
    expect(r.outcomes.intakeTask).toEqual({ status: 'canceled', cycle: 3 })
    expect(r.outcomes.path).toEqual({ status: 'canceled', cycle: 3 })
    expect(r.outcomes.armTask).toEqual({ status: 'canceled', cycle: 3 })
    expect(r.cycles[2].owners.arm).toBe('safety')
    // The Interrupted event names the root composition and the interrupter.
    expect(r.events.find((e) => e.type === 'Interrupted')).toMatchObject({ command: 'auto', interrupter: 'safety' })
  })

  it('a sibling interruption cancels only the interrupted sibling; parent and others continue', () => {
    // creating-commands.rst "Sibling Interruption Example"
    const first = work('first', ['arm'], 10)
    const second = work('second', ['arm'], 3)
    const other = work('other', ['intake'], 10)
    const parent: CommandDef = {
      id: 'parent',
      name: 'Sibling Conflict',
      requirements: [],
      body: [
        { op: 'fork', commands: ['first'] },
        { op: 'fork', commands: ['other'] },
        { op: 'yield' },
        { op: 'fork', commands: ['second'] },
        { op: 'park' },
      ],
    }
    const r = simulate(scenario([parent, first, second, other], [{ cycle: 1, action: 'schedule', command: 'parent' }]))
    expect(r.outcomes.first).toEqual({ status: 'interrupted', cycle: 2 })
    expect(r.cycles[1].status.parent).toBe('waiting')
    expect(r.cycles[1].status.other).toBe('running')
    expect(r.cycles[1].owners.arm).toBe('second')
    expect(r.outcomes.parent).toBeUndefined()
  })

  it('children are canceled when the parent finishes', () => {
    // scopes.rst: "the child is automatically canceled if the parent command finishes"
    const parent: CommandDef = {
      id: 'parent',
      name: 'Parent',
      requirements: [],
      body: [{ op: 'fork', commands: ['intakeTask'] }, { op: 'wait', cycles: 2 }],
    }
    const r = simulate(scenario([parent, intakeTask], [{ cycle: 1, action: 'schedule', command: 'parent' }]))
    expect(r.outcomes.parent).toEqual({ status: 'completed', cycle: 3 })
    expect(r.outcomes.intakeTask).toEqual({ status: 'canceled', cycle: 3 })
  })

  it('a child can share requirements with its parent without interrupting it', () => {
    const parent: CommandDef = { id: 'parent', name: 'Parent', requirements: ['arm'], body: [{ op: 'await', command: 'armTask' }] }
    const r = simulate(scenario([parent, armTask], [{ cycle: 1, action: 'schedule', command: 'parent' }]))
    expect(r.outcomes.parent?.status).toBe('completed')
    expect(r.outcomes.armTask?.status).toBe('completed')
  })

  it('children inherit a higher parent priority', () => {
    // migration-guide.rst: the "High Priority Wrapper" lets a lowest-priority child interrupt others
    const lowest = { ...work('lowest', ['arm'], 3), priority: LOWEST_PRIORITY }
    const normal = work('normal', ['arm'], 10, 0)
    const wrapper: CommandDef = { id: 'wrapper', name: 'Wrapper', requirements: [], priority: 1000, body: [{ op: 'await', command: 'lowest' }] }
    const r = simulate(
      scenario([lowest, normal, wrapper], [
        { cycle: 1, action: 'schedule', command: 'normal' },
        { cycle: 2, action: 'schedule', command: 'wrapper' },
      ]),
    )
    expect(r.outcomes.normal?.status).toBe('interrupted')
    expect(r.outcomes.lowest?.status).toBe('completed')
    expect(r.cycles[1].effectivePriority.lowest).toBe(1000)
  })

  it('fork failure cancels the composition by default, or lets it continue with setCancelOnForkFailure(false)', () => {
    const guard = work('guard', ['arm'], 10, 50)
    const strict: CommandDef = { id: 'seq', name: 'Seq', requirements: [], body: [{ op: 'await', command: 'armTask' }, { op: 'log', text: 'continued' }] }
    const r1 = simulate(
      scenario([guard, armTask, strict], [
        { cycle: 1, action: 'schedule', command: 'guard' },
        { cycle: 2, action: 'schedule', command: 'seq' },
      ]),
    )
    expect(r1.events.some((e) => e.type === 'ForkFailure' && e.command === 'seq')).toBe(true)
    expect(r1.outcomes.seq).toEqual({ status: 'canceled', cycle: 2 })
    expect(r1.events.some((e) => e.text === 'continued')).toBe(false)

    const lenient: CommandDef = { ...strict, body: [{ op: 'setCancelOnForkFailure', value: false }, ...strict.body] }
    const r2 = simulate(
      scenario([guard, armTask, lenient], [
        { cycle: 1, action: 'schedule', command: 'guard' },
        { cycle: 2, action: 'schedule', command: 'seq' },
      ]),
    )
    expect(r2.outcomes.seq).toEqual({ status: 'completed', cycle: 2 })
    expect(r2.outcomes.guard?.status).toBe('completed')
  })
})

describe('default commands', () => {
  const stop: CommandDef = {
    id: 'stop',
    name: 'Stop Intake',
    requirements: ['intake'],
    priority: LOWEST_PRIORITY,
    repeatedly: true,
    body: [{ op: 'repeat', label: 'motor off' }],
  }
  const mechanisms = [{ id: 'intake', name: 'Intake', defaultCommand: 'stop' }]

  it('the default command runs whenever nothing else requires the mechanism', () => {
    const spin = work('spin', ['intake'], 2)
    const r = simulate({
      mechanisms,
      commands: [stop, spin],
      events: [{ cycle: 3, action: 'schedule', command: 'spin' }],
      maxCycles: 8,
    })
    expect(r.cycles[0].owners.intake).toBe('stop')
    expect(r.cycles[2].owners.intake).toBe('spin')
    expect(r.outcomes.stop?.status).toBe('interrupted')
    // spin completes in cycle 5; the default is queued again in cycle 6's scheduling phase
    expect(r.cycles[4].owners.intake).toBeNull()
    expect(r.cycles[5].owners.intake).toBe('stop')
  })

  it('rejects a default command that does not require exactly its mechanism', () => {
    expect(
      () =>
        new CommandScheduler({
          mechanisms: [{ id: 'intake', name: 'Intake', defaultCommand: 'x' }],
          commands: [{ id: 'x', name: 'x', requirements: [], body: [] }],
          events: [],
          maxCycles: 1,
        }),
    ).toThrow(/default command/)
  })
})

describe('reset and determinism', () => {
  it('reset returns to cycle 0 and replays identically', () => {
    const s = new CommandScheduler(
      scenario([work('a', ['drive'], 3), work('b', ['drive'], 3)], [
        { cycle: 1, action: 'schedule', command: 'a' },
        { cycle: 2, action: 'schedule', command: 'b' },
      ]),
    )
    const first = s.runUntil()
    s.reset()
    expect(s.cycle).toBe(0)
    expect(s.result().events).toEqual([])
    const second = s.runUntil()
    expect(second).toEqual(first)
  })

  it('validates unknown references', () => {
    expect(() => simulate(scenario([work('a', ['nope'], 1)], []))).toThrow(SimulationError)
  })
})
