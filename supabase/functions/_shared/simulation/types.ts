/**
 * Strongly typed model of the WPILib Commands v3 scheduler, used by the
 * educational simulator. Behavior is documented in docs/commands-v3-behavior.md.
 *
 * Command bodies are NOT Java. They are small, declarative lists of coroutine
 * steps that mirror what a Java command body would do. Nothing here evaluates
 * user-provided code.
 */

export type MechanismId = string
export type CommandId = string
export type RunId = number

/** WPILib priority constants (org.wpilib.command3.Command). */
export const DEFAULT_PRIORITY = 0
export const LOWEST_PRIORITY = -2147483648
export const HIGHEST_PRIORITY = 2147483647

/** Scheduler period of a standard robot loop. */
export const CYCLE_SECONDS = 0.02

/**
 * One coroutine action inside a command body.
 *
 * Java equivalents:
 *  - log        -> System.out.println(...)      (does not yield)
 *  - yield      -> coroutine.yield()
 *  - work       -> for (int i = 0; i < n; i++) { doWork(); coroutine.yield(); }
 *  - repeat     -> the body of runRepeatedly(...)  (forever, yields every cycle)
 *  - wait       -> coroutine.wait(Seconds.of(cycles * 0.02))
 *  - waitUntil  -> coroutine.waitUntil(signal)
 *  - fork       -> coroutine.fork(a, b, ...)
 *  - await      -> coroutine.await(cmd)
 *  - awaitAll   -> coroutine.awaitAll(a, b, ...)
 *  - awaitAny   -> coroutine.awaitAny(a, b, ...)
 *  - park       -> coroutine.park()
 *  - setSignal  -> sets a boolean (e.g. a flag a trigger/sensor reads); does not yield
 *  - setCancelOnForkFailure -> coroutine.setCancelOnForkFailure(value)
 */
export type CoroutineStep =
  | { op: 'log'; text: string }
  | { op: 'yield' }
  | { op: 'work'; label: string; cycles: number; java?: string }
  | { op: 'repeat'; label: string; java?: string }
  | { op: 'wait'; cycles: number }
  | { op: 'waitUntil'; signal: string }
  | { op: 'fork'; commands: CommandId[] }
  | { op: 'await'; command: CommandId }
  | { op: 'awaitAll'; commands: CommandId[] }
  | { op: 'awaitAny'; commands: CommandId[] }
  | { op: 'park' }
  | { op: 'setSignal'; signal: string; value: boolean }
  | { op: 'setCancelOnForkFailure'; value: boolean }

/** A Command object. Its id is its identity (like a Java object reference). */
export interface CommandDef {
  id: CommandId
  /** Name given with .named("...") */
  name: string
  requirements: MechanismId[]
  /** Integer priority, default 0 (Command.DEFAULT_PRIORITY). */
  priority?: number
  body: CoroutineStep[]
  /**
   * Java expression that creates this command in team code, e.g. `drive.followPath("ToPiece")`.
   * These factory methods are illustrative team code, not WPILib API.
   */
  factory?: string
  /** Built with runRepeatedly(...) instead of run(...). Body must be a single repeat step. */
  repeatedly?: boolean
}

export interface MechanismDef {
  id: MechanismId
  name: string
  /** Command id of the default command, if any. Must require only this mechanism. */
  defaultCommand?: CommandId
}

/**
 * Something that happens "outside" commands at the start of a cycle, during
 * trigger polling (e.g. a button binding or Scheduler.getDefault().schedule()).
 */
export interface ScenarioEvent {
  cycle: number
  action: 'schedule' | 'cancel' | 'setSignal'
  command?: CommandId
  signal?: string
  value?: boolean
  /** Shown in the event log before the action, e.g. "Driver pressed RT (whileTrue)". */
  note?: string
}

export interface Scenario {
  mechanisms: MechanismDef[]
  commands: CommandDef[]
  events: ScenarioEvent[]
  /** Initial boolean signals (sensor values, flags). */
  signals?: Record<string, boolean>
  /** Hard stop for the simulation. */
  maxCycles: number
}

/** Pluggable world model (e.g. robot position for the autonomous game). */
export interface WorldModel {
  /** Called at the start of every cycle before triggers are polled (like robotPeriodic sensor reads). */
  beforeCycle?(view: SchedulerView): void
  /** Called after every cycle's execution phase. */
  afterCycle?(view: SchedulerView): void
  /** Optional dynamic signals. Falls back to scheduler signals when undefined. */
  signal?(name: string, view: SchedulerView): boolean | undefined
}

/** Read-only view of scheduler state given to world models. */
export interface SchedulerView {
  readonly cycle: number
  isRunning(id: CommandId): boolean
  /** Commands that were mounted this cycle and their last work label (if any). */
  activity(): ReadonlyMap<CommandId, string | undefined>
  owner(mechanism: MechanismId): CommandId | undefined
  getSignal(name: string): boolean
  setSignal(name: string, value: boolean): void
  /** Lets world models record domain events into the scheduler log. */
  note(text: string): void
}

export type SchedulerEventType =
  | 'Scheduled'
  | 'Mounted'
  | 'Yielded'
  | 'Completed'
  | 'Interrupted'
  | 'Canceled'
  | 'ForkFailure'
  // Not a WPILib SchedulerEvent: schedule() returned a failure ScheduleResult.
  | 'ScheduleRejected'
  // Not a WPILib SchedulerEvent: schedule() of an already-running instance (no effect).
  | 'AlreadyRunning'
  // Not WPILib: a System.out.println from command code, or a world-model note.
  | 'Log'

export interface SchedulerEvent {
  seq: number
  cycle: number
  type: SchedulerEventType
  command?: CommandId
  /** For Interrupted: the command that caused the interruption. */
  interrupter?: CommandId
  /** For ScheduleRejected / ForkFailure: the running command that won. */
  blocker?: CommandId
  /** Failure kind for ScheduleRejected (WPILib ScheduleResult record name). */
  reason?: 'LowerPriorityThanRunningCommand' | 'LowerPriorityThanQueuedCommand'
  text?: string
}

/** Per-cycle status of a command, for the timeline. */
export type CommandCycleStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'canceled'
  | 'interrupted'
  | 'rejected'

export interface CycleSnapshot {
  cycle: number
  /** Commands in the pending set right before promotion this cycle. */
  pending: CommandId[]
  /** Running commands after execution, in scheduling order (oldest first). */
  running: CommandId[]
  status: Record<CommandId, CommandCycleStatus>
  owners: Record<MechanismId, CommandId | null>
  parents: Record<CommandId, CommandId | null>
  /** Effective priority of each running command. */
  effectivePriority: Record<CommandId, number>
  signals: Record<string, boolean>
}

export interface SimulationResult {
  cycles: CycleSnapshot[]
  events: SchedulerEvent[]
  /** Most recent cycle in which each command ended, and how. */
  outcomes: Record<CommandId, { status: 'completed' | 'canceled' | 'interrupted' | 'rejected'; cycle: number } | undefined>
}
