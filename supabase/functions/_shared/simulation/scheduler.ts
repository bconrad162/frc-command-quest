/**
 * Deterministic educational model of the WPILib Commands v3 scheduler.
 *
 * Modeled after org.wpilib.command3.Scheduler / Coroutine (allwpilib main) and the
 * official docs. See docs/commands-v3-behavior.md for the list of behaviors and the
 * features that are intentionally NOT modeled.
 *
 * Nothing here runs user code: command bodies are declarative CoroutineStep lists.
 */
import type {
  CommandCycleStatus,
  CommandDef,
  CommandId,
  CoroutineStep,
  CycleSnapshot,
  MechanismId,
  RunId,
  Scenario,
  SchedulerEvent,
  SchedulerEventType,
  SchedulerView,
  SimulationResult,
  WorldModel,
} from './types.ts'
import { DEFAULT_PRIORITY } from './types.ts'

export class SimulationError extends Error {}

type Park =
  | { kind: 'cycle'; until: number }
  | { kind: 'signal'; name: string }
  | { kind: 'runs'; mode: 'all' | 'any'; runs: Array<{ command: CommandId; runId: RunId }> }
  | { kind: 'forever' }

interface RunState {
  runId: RunId
  command: CommandDef
  parent: CommandId | null
  pc: number
  iter: number | null
  park: Park | null
  cancelOnForkFailure: boolean
}

type ScheduleResult =
  | { kind: 'success'; runId: RunId }
  | { kind: 'alreadyRunning'; runId: RunId }
  | {
      kind: 'failure'
      reason: 'LowerPriorityThanRunningCommand' | 'LowerPriorityThanQueuedCommand'
      blocker: CommandId
    }

/** Outcome of running a command body until it yields. */
type RunOutcome = 'done' | 'yield' | 'aborted' | { forkFailed: CommandId[]; blocker?: CommandId }

export interface SchedulerOptions {
  world?: WorldModel
  /** Record Mounted/Yielded events (very chatty; off by default for the UI log). */
  recordMountEvents?: boolean
  /**
   * Live trigger bindings: called once per cycle while triggers are polled (after
   * scenario events, before default commands), like Trigger bindings in Scheduler.run().
   */
  pollTriggers?: (scheduler: CommandScheduler) => void
}

export class CommandScheduler {
  readonly scenario: Scenario
  private readonly commands: Map<CommandId, CommandDef>
  private readonly world?: WorldModel
  private readonly recordMountEvents: boolean
  private readonly pollTriggers?: (scheduler: CommandScheduler) => void

  private cycleNumber = 0
  private nextRunId = 1
  private seq = 0
  private queue: RunState[] = []
  private running = new Map<CommandId, RunState>()
  private stack: RunState[] = []
  private signals = new Map<string, boolean>()
  private events: SchedulerEvent[] = []
  private snapshots: CycleSnapshot[] = []
  private outcomes: SimulationResult['outcomes'] = {}
  private cycleStatus = new Map<CommandId, CommandCycleStatus>()
  private interruptedThisCycle = new Set<CommandId>()
  private activityMap = new Map<CommandId, string | undefined>()

  constructor(scenario: Scenario, options: SchedulerOptions = {}) {
    validateScenario(scenario)
    this.scenario = scenario
    this.commands = new Map(scenario.commands.map((c) => [c.id, c]))
    this.world = options.world
    this.recordMountEvents = options.recordMountEvents ?? false
    this.pollTriggers = options.pollTriggers
    this.reset()
  }

  /** Returns the simulation to cycle 0. */
  reset(): void {
    this.cycleNumber = 0
    this.nextRunId = 1
    this.seq = 0
    this.queue = []
    this.running = new Map()
    this.stack = []
    this.signals = new Map(Object.entries(this.scenario.signals ?? {}))
    this.events = []
    this.snapshots = []
    this.outcomes = {}
    this.cycleStatus = new Map()
    this.interruptedThisCycle = new Set()
    this.activityMap = new Map()
  }

  get cycle(): number {
    return this.cycleNumber
  }

  get finished(): boolean {
    return this.cycleNumber >= this.scenario.maxCycles
  }

  result(): SimulationResult {
    return {
      cycles: [...this.snapshots],
      events: [...this.events],
      outcomes: { ...this.outcomes },
    }
  }

  /** Runs one full Scheduler.run() cycle. */
  step(): CycleSnapshot {
    if (this.finished) {
      return this.snapshots[this.snapshots.length - 1] ?? this.snapshot([])
    }
    this.cycleNumber += 1
    this.cycleStatus = new Map()
    this.interruptedThisCycle = new Set()
    this.activityMap = new Map()

    // Sideload-like world update (e.g. sensor reads in robotPeriodic()).
    this.world?.beforeCycle?.(this.view())

    // Phase 3.1: poll triggers -> scenario events for this cycle.
    for (const event of this.scenario.events) {
      if (event.cycle !== this.cycleNumber) continue
      if (event.note) this.emit('Log', { text: event.note })
      if (event.action === 'schedule' && event.command) this.scheduleExternal(event.command)
      else if (event.action === 'cancel' && event.command) this.cancel(event.command)
      else if (event.action === 'setSignal' && event.signal) this.signals.set(event.signal, event.value ?? true)
    }
    this.pollTriggers?.(this)

    // Phase 3.2: default commands for idle mechanisms.
    for (const mechanism of this.scenario.mechanisms) {
      if (!mechanism.defaultCommand) continue
      const busy =
        [...this.running.values()].some((s) => s.command.requirements.includes(mechanism.id)) ||
        this.queue.some((s) => s.command.requirements.includes(mechanism.id))
      if (!busy) this.scheduleExternal(mechanism.defaultCommand)
    }

    // Phase 3.3: promote pending commands.
    const pending = this.queue.map((s) => s.command.id)
    for (const state of this.queue) this.evictConflictingRunning(state)
    for (const state of this.queue) this.running.set(state.command.id, state)
    this.queue = []

    // Phase 4: execution, newest to oldest.
    for (const state of [...this.running.values()].reverse()) {
      this.runCommand(state)
    }

    this.world?.afterCycle?.(this.view())

    const snap = this.snapshot(pending)
    this.snapshots.push(snap)
    return snap
  }

  /** Steps until maxCycles or until `stop` returns true after a cycle. */
  runUntil(stop?: (snap: CycleSnapshot, scheduler: CommandScheduler) => boolean): SimulationResult {
    while (!this.finished) {
      const snap = this.step()
      if (stop?.(snap, this)) break
    }
    return this.result()
  }

  isRunning(id: CommandId): boolean {
    return this.running.has(id)
  }

  getSignal(name: string): boolean {
    const fromWorld = this.world?.signal?.(name, this.view())
    if (fromWorld !== undefined) return fromWorld
    return this.signals.get(name) ?? false
  }

  // ---------------------------------------------------------------------------
  // Scheduling

  private command(id: CommandId): CommandDef {
    const cmd = this.commands.get(id)
    if (!cmd) throw new SimulationError(`Unknown command "${id}"`)
    return cmd
  }

  private priorityOf(cmd: CommandDef): number {
    return cmd.priority ?? DEFAULT_PRIORITY
  }

  private conflicts(a: CommandDef, b: CommandDef): boolean {
    return a.requirements.some((r) => b.requirements.includes(r))
  }

  private runIdOf(id: CommandId): RunId {
    const running = this.running.get(id)
    if (running) return running.runId
    const queued = this.queue.find((s) => s.command.id === id)
    return queued ? queued.runId : 0
  }

  private ancestryOf(state: RunState | undefined): CommandId[] {
    const chain: CommandId[] = []
    let current: RunState | undefined = state
    while (current) {
      chain.push(current.command.id)
      current = current.parent ? this.running.get(current.parent) : undefined
    }
    return chain
  }

  /** Effective priority = max(own, every running ancestor). */
  effectivePriority(id: CommandId): number {
    const state = this.running.get(id) ?? this.queue.find((s) => s.command.id === id)
    if (!state) return this.priorityOf(this.command(id))
    let max = this.priorityOf(state.command)
    let parent = state.parent
    while (parent) {
      const parentState = this.running.get(parent)
      max = Math.max(max, this.priorityOf(this.command(parent)))
      parent = parentState ? parentState.parent : null
    }
    return max
  }

  private isSchedulable(cmd: CommandDef, ancestry: CommandId[]): ScheduleResult {
    const existing = this.runIdOf(cmd.id)
    if (existing !== 0) return { kind: 'alreadyRunning', runId: existing }

    let incoming = this.priorityOf(cmd)
    for (const a of ancestry) incoming = Math.max(incoming, this.priorityOf(this.command(a)))

    for (const state of this.running.values()) {
      if (ancestry.includes(state.command.id)) continue
      if (this.conflicts(state.command, cmd) && incoming < this.effectivePriority(state.command.id)) {
        return { kind: 'failure', reason: 'LowerPriorityThanRunningCommand', blocker: state.command.id }
      }
    }
    for (const state of this.queue) {
      if (ancestry.includes(state.command.id)) continue
      if (this.conflicts(state.command, cmd) && incoming < this.effectivePriority(state.command.id)) {
        return { kind: 'failure', reason: 'LowerPriorityThanQueuedCommand', blocker: state.command.id }
      }
    }
    return { kind: 'success', runId: 0 }
  }

  private newRun(cmd: CommandDef, parent: CommandId | null): RunState {
    return {
      runId: this.nextRunId++,
      command: cmd,
      parent,
      pc: 0,
      iter: null,
      park: null,
      cancelOnForkFailure: true,
    }
  }

  /** Scheduler.getDefault().schedule(cmd) from outside any command (or a trigger binding). */
  scheduleExternal(id: CommandId): ScheduleResult {
    const cmd = this.command(id)
    const result = this.isSchedulable(cmd, [])
    if (result.kind === 'alreadyRunning') {
      this.emit('AlreadyRunning', { command: id })
      return result
    }
    if (result.kind === 'failure') {
      this.emit('ScheduleRejected', { command: id, blocker: result.blocker, reason: result.reason })
      this.markEnded(id, 'rejected')
      return result
    }
    this.evictConflictingOnDeck(cmd)
    const state = this.newRun(cmd, null)
    this.emit('Scheduled', { command: id })
    this.queue.push(state)
    return { kind: 'success', runId: state.runId }
  }

  /** schedule() called from inside a running command: the child starts immediately. */
  private scheduleChild(id: CommandId, parent: RunState): ScheduleResult {
    const cmd = this.command(id)
    const result = this.isSchedulable(cmd, this.ancestryOf(parent))
    if (result.kind === 'alreadyRunning') {
      this.emit('AlreadyRunning', { command: id })
      return result
    }
    if (result.kind === 'failure') {
      this.emit('ScheduleRejected', { command: id, blocker: result.blocker, reason: result.reason })
      this.markEnded(id, 'rejected')
      return result
    }
    this.evictConflictingOnDeck(cmd)
    const state = this.newRun(cmd, parent.command.id)
    this.emit('Scheduled', { command: id })
    this.evictConflictingRunning(state)
    this.running.set(id, state)
    this.runCommand(state)
    return { kind: 'success', runId: state.runId }
  }

  private evictConflictingOnDeck(cmd: CommandDef): void {
    const kept: RunState[] = []
    for (const state of this.queue) {
      if (state.command.id !== cmd.id && this.conflicts(state.command, cmd)) {
        this.emit('Interrupted', { command: state.command.id, interrupter: cmd.id })
        this.interruptedThisCycle.add(state.command.id)
        this.emit('Canceled', { command: state.command.id })
        this.markEnded(state.command.id, 'interrupted')
      } else {
        kept.push(state)
      }
    }
    this.queue = kept
  }

  private isAncestorOf(ancestor: CommandId, state: RunState): boolean {
    let parent = state.parent
    while (parent) {
      if (!this.running.has(parent)) return false
      if (parent === ancestor) return true
      parent = this.running.get(parent)?.parent ?? null
    }
    return false
  }

  /**
   * Cancels running commands that conflict with an incoming command.
   * Climbs from the conflicting command to its highest ancestor that is not a
   * sibling-subtree of the incoming command: siblings lose only their own subtree,
   * unrelated commands lose their whole composition.
   */
  private evictConflictingRunning(incoming: RunState): void {
    const roots: RunState[] = []
    for (const state of this.running.values()) {
      if (state === incoming) continue
      if (!this.conflicts(incoming.command, state.command)) continue
      if (this.isAncestorOf(state.command.id, incoming)) continue
      let root = state
      while (root.parent !== null && root.parent !== incoming.parent) {
        const next = this.running.get(root.parent)
        if (!next) break
        root = next
      }
      if (!roots.includes(root)) roots.push(root)
    }
    for (const root of roots) {
      if (!this.running.has(root.command.id)) continue
      this.emit('Interrupted', { command: root.command.id, interrupter: incoming.command.id })
      this.interruptedThisCycle.add(root.command.id)
      this.cancel(root.command.id)
    }
  }

  /** Scheduler.cancel(cmd): also cancels every descendant. */
  cancel(id: CommandId): void {
    const wasRunning = this.running.delete(id)
    const queuedBefore = this.queue.length
    this.queue = this.queue.filter((s) => s.command.id !== id)
    const wasQueued = this.queue.length !== queuedBefore
    if (wasRunning || wasQueued) {
      this.emit('Canceled', { command: id })
      this.markEnded(id, this.interruptedThisCycle.has(id) ? 'interrupted' : 'canceled')
    }
    this.removeOrphanedChildren(id)
  }

  private removeOrphanedChildren(parent: CommandId): void {
    const children = [...this.running.values()].filter((s) => s.parent === parent).map((s) => s.command.id)
    for (const child of children) this.cancel(child)
  }

  private rootOf(id: CommandId): CommandId {
    let root = id
    let parent = this.running.get(id)?.parent ?? null
    while (parent) {
      root = parent
      parent = this.running.get(parent)?.parent ?? null
    }
    return root
  }

  // ---------------------------------------------------------------------------
  // Execution

  private parkSatisfied(park: Park): boolean {
    switch (park.kind) {
      case 'cycle':
        return this.cycleNumber >= park.until
      case 'signal':
        return this.getSignal(park.name)
      case 'forever':
        return false
      case 'runs': {
        const stillRunning = park.runs.filter((r) => this.runIdOf(r.command) === r.runId)
        return park.mode === 'all' ? stillRunning.length === 0 : stillRunning.length < park.runs.length
      }
    }
  }

  private runCommand(state: RunState): void {
    const id = state.command.id
    if (this.running.get(id) !== state) return // canceled (or restarted) earlier this cycle
    if (state.park && !this.parkSatisfied(state.park)) return // unmountable: still waiting

    this.stack.push(state)
    if (this.recordMountEvents) this.emit('Mounted', { command: id })
    this.activityMap.set(id, undefined)
    let outcome: RunOutcome
    try {
      outcome = this.interpret(state)
    } finally {
      this.stack.pop()
    }

    if (outcome === 'aborted') return
    if (typeof outcome === 'object') {
      this.emit('ForkFailure', { command: id, blocker: outcome.blocker, text: outcome.forkFailed.join(', ') })
      this.cancel(this.rootOf(id))
      return
    }
    if (outcome === 'done') {
      this.running.delete(id)
      this.emit('Completed', { command: id })
      this.markEnded(id, 'completed')
      this.removeOrphanedChildren(id)
      return
    }
    if (this.recordMountEvents) this.emit('Yielded', { command: id })
  }

  /** Runs a command body from its program counter until it yields or finishes. */
  private interpret(state: RunState): RunOutcome {
    const body = state.command.body
    const id = state.command.id

    // Resuming from a parked state: the parked statement finishes now.
    if (state.park) {
      const park = state.park
      state.park = null
      if (park.kind === 'runs' && park.mode === 'any') {
        for (const r of park.runs) {
          if (this.runIdOf(r.command) === r.runId) this.cancel(r.command)
        }
      }
      state.pc += 1
    }

    // Guard against runaway scenarios (a step list cannot loop without yielding,
    // but nested forks are bounded by the number of commands).
    let guard = 0
    while (state.pc < body.length) {
      if (++guard > 10_000) throw new SimulationError(`Command "${id}" did not yield`)
      const step: CoroutineStep = body[state.pc]
      switch (step.op) {
        case 'log':
          this.emit('Log', { command: id, text: step.text })
          state.pc += 1
          break
        case 'setSignal':
          this.signals.set(step.signal, step.value)
          state.pc += 1
          break
        case 'setCancelOnForkFailure':
          state.cancelOnForkFailure = step.value
          state.pc += 1
          break
        case 'yield':
          state.pc += 1
          return 'yield'
        case 'work':
          if (state.iter === null) state.iter = 0
          if (state.iter < step.cycles) {
            state.iter += 1
            this.activityMap.set(id, step.label)
            return 'yield'
          }
          state.iter = null
          state.pc += 1
          break
        case 'repeat':
          this.activityMap.set(id, step.label)
          return 'yield'
        case 'wait':
          if (step.cycles <= 0) {
            state.pc += 1
            break
          }
          state.park = { kind: 'cycle', until: this.cycleNumber + step.cycles }
          return 'yield'
        case 'waitUntil':
          if (this.getSignal(step.signal)) {
            state.pc += 1
            break
          }
          state.park = { kind: 'signal', name: step.signal }
          return 'yield'
        case 'park':
          state.park = { kind: 'forever' }
          return 'yield'
        case 'fork':
        case 'awaitAll':
        case 'awaitAny': {
          const ids = step.commands
          this.throwIfMutuallyConflicting(ids)
          // checkAllForkable: nothing is forked if any command would fail.
          const failures: Array<{ id: CommandId; blocker: CommandId }> = []
          for (const childId of ids) {
            const check = this.isSchedulable(this.command(childId), this.ancestryOf(state))
            if (check.kind === 'failure') {
              this.emit('ScheduleRejected', { command: childId, blocker: check.blocker, reason: check.reason })
              this.markEnded(childId, 'rejected')
              failures.push({ id: childId, blocker: check.blocker })
            }
          }
          if (failures.length > 0) {
            if (state.cancelOnForkFailure) {
              return { forkFailed: failures.map((f) => f.id), blocker: failures[0].blocker }
            }
            state.pc += 1
            break
          }
          const runs: Array<{ command: CommandId; runId: RunId }> = []
          for (const childId of ids) {
            const result = this.scheduleChild(childId, state)
            if (this.running.get(id) !== state) return 'aborted'
            if (result.kind === 'failure') {
              if (state.cancelOnForkFailure) return { forkFailed: [childId], blocker: result.blocker }
              continue
            }
            runs.push({ command: childId, runId: result.runId })
          }
          if (step.op === 'fork') {
            state.pc += 1
            break
          }
          const park: Park = { kind: 'runs', mode: step.op === 'awaitAll' ? 'all' : 'any', runs }
          if (runs.length > 0 && !this.parkSatisfied(park)) {
            state.park = park
            return 'yield'
          }
          if (park.mode === 'any') {
            for (const r of runs) if (this.runIdOf(r.command) === r.runId) this.cancel(r.command)
          }
          state.pc += 1
          break
        }
        case 'await': {
          const result = this.scheduleChild(step.command, state)
          if (this.running.get(id) !== state) return 'aborted'
          if (result.kind === 'failure') {
            if (state.cancelOnForkFailure) return { forkFailed: [step.command], blocker: result.blocker }
            state.pc += 1
            break
          }
          const park: Park = { kind: 'runs', mode: 'all', runs: [{ command: step.command, runId: result.runId }] }
          if (!this.parkSatisfied(park)) {
            state.park = park
            return 'yield'
          }
          state.pc += 1
          break
        }
      }
    }
    return 'done'
  }

  private throwIfMutuallyConflicting(ids: CommandId[]): void {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (this.conflicts(this.command(ids[i]), this.command(ids[j]))) {
          throw new SimulationError(
            `Cannot fork "${ids[i]}" and "${ids[j]}" together: they require the same mechanism`,
          )
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Recording

  private emit(type: SchedulerEventType, fields: Partial<SchedulerEvent>): void {
    this.events.push({ seq: this.seq++, cycle: this.cycleNumber, type, ...fields })
  }

  private markEnded(id: CommandId, status: 'completed' | 'canceled' | 'interrupted' | 'rejected'): void {
    this.cycleStatus.set(id, status)
    // Latest outcome wins (a command object can run more than once).
    this.outcomes[id] = { status, cycle: this.cycleNumber }
  }

  private view(): SchedulerView {
    return {
      cycle: this.cycleNumber,
      isRunning: (id) => this.running.has(id),
      activity: () => this.activityMap,
      owner: (mechanism) => this.ownerOf(mechanism),
      getSignal: (name) => this.signals.get(name) ?? false,
      setSignal: (name, value) => {
        this.signals.set(name, value)
      },
      note: (text) => this.emit('Log', { text }),
    }
  }

  private ownerOf(mechanism: MechanismId): CommandId | undefined {
    for (const state of this.running.values()) {
      if (state.command.requirements.includes(mechanism)) return state.command.id
    }
    return undefined
  }

  private snapshot(pending: CommandId[]): CycleSnapshot {
    const status: Record<CommandId, CommandCycleStatus> = {}
    for (const cmd of this.scenario.commands) status[cmd.id] = 'idle'
    for (const [id, s] of this.cycleStatus) status[id] = s
    for (const [id, state] of this.running) status[id] = state.park ? 'waiting' : 'running'

    const owners: Record<MechanismId, CommandId | null> = {}
    for (const m of this.scenario.mechanisms) owners[m.id] = this.ownerOf(m.id) ?? null

    const parents: Record<CommandId, CommandId | null> = {}
    const effectivePriority: Record<CommandId, number> = {}
    for (const [id, state] of this.running) {
      parents[id] = state.parent
      effectivePriority[id] = this.effectivePriority(id)
    }

    const signals: Record<string, boolean> = {}
    for (const [k, v] of this.signals) signals[k] = v

    return {
      cycle: this.cycleNumber,
      pending,
      running: [...this.running.keys()],
      status,
      owners,
      parents,
      effectivePriority,
      signals,
    }
  }
}

/** Throws if a scenario references unknown commands/mechanisms or has an invalid default command. */
export function validateScenario(scenario: Scenario): void {
  const commandIds = new Set<CommandId>()
  for (const c of scenario.commands) {
    if (commandIds.has(c.id)) throw new SimulationError(`Duplicate command id "${c.id}"`)
    commandIds.add(c.id)
  }
  const mechanismIds = new Set(scenario.mechanisms.map((m) => m.id))
  for (const c of scenario.commands) {
    for (const r of c.requirements) {
      if (!mechanismIds.has(r)) throw new SimulationError(`Command "${c.id}" requires unknown mechanism "${r}"`)
    }
    for (const step of c.body) {
      const refs =
        step.op === 'fork' || step.op === 'awaitAll' || step.op === 'awaitAny'
          ? step.commands
          : step.op === 'await'
            ? [step.command]
            : []
      for (const ref of refs) {
        if (!commandIds.has(ref)) throw new SimulationError(`Command "${c.id}" references unknown command "${ref}"`)
        if (ref === c.id) throw new SimulationError(`Command "${c.id}" cannot fork or await itself`)
      }
      if ((step.op === 'work' || step.op === 'wait') && (!Number.isInteger(step.cycles) || step.cycles < 0)) {
        throw new SimulationError(`Command "${c.id}" has an invalid cycle count`)
      }
    }
  }
  for (const m of scenario.mechanisms) {
    if (!m.defaultCommand) continue
    const d = scenario.commands.find((c) => c.id === m.defaultCommand)
    if (!d) throw new SimulationError(`Mechanism "${m.id}" has unknown default command`)
    if (d.requirements.length !== 1 || d.requirements[0] !== m.id) {
      throw new SimulationError(`A mechanism's default command must require exactly that mechanism ("${m.id}")`)
    }
  }
  for (const e of scenario.events) {
    if (e.command && !commandIds.has(e.command)) throw new SimulationError(`Event references unknown command "${e.command}"`)
  }
}

/** Convenience: run a whole scenario. */
export function simulate(scenario: Scenario, options?: SchedulerOptions): SimulationResult {
  const scheduler = new CommandScheduler(scenario, options)
  return scheduler.runUntil()
}
