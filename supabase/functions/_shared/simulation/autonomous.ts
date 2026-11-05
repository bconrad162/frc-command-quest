/**
 * Autonomous Architect: a tiny simulated robot world that runs on top of the
 * Commands v3 scheduler model. Students build the body of an autonomous command
 * out of fork()/await() steps; this module turns that into a Scenario, runs it,
 * and validates the objectives.
 *
 * Path names and mechanism factory methods (drive.followPath, arm.raise, ...) are
 * illustrative team code (PathPlanner-style naming), not WPILib API.
 */
import { CommandScheduler } from './scheduler.ts'
import type { CommandDef, Scenario, SchedulerEvent, SchedulerView, SimulationResult, WorldModel } from './types.ts'
import { CYCLE_SECONDS, LOWEST_PRIORITY } from './types.ts'

export type PaletteId = 'toPiece' | 'toScore' | 'intake' | 'stopIntake' | 'raise' | 'lower' | 'score'

export interface PaletteItem {
  id: PaletteId
  label: string
  factory: string
  /** Local variable name in generated Java (must not shadow mechanism fields). */
  javaName: string
  mechanism: 'drive' | 'intake' | 'arm'
  /** Seconds, or null when the command waits for a condition / runs forever. */
  seconds: number | null
  description: string
}

export const AUTO_LIMIT_SECONDS = 15
export const AUTO_LIMIT_CYCLES = Math.round(AUTO_LIMIT_SECONDS / CYCLE_SECONDS)
/** Intake rollers must run this long before they can grab a piece. */
export const INTAKE_SPINUP_CYCLES = 20

const cycles = (seconds: number) => Math.round(seconds / CYCLE_SECONDS)

export const PALETTE: PaletteItem[] = [
  {
    id: 'toPiece',
    javaName: 'toPiece',
    label: 'Follow Path: ToPiece',
    factory: 'drive.followPath("ToPiece")',
    mechanism: 'drive',
    seconds: 1.6,
    description: 'Drive from the starting line to the game piece.',
  },
  {
    id: 'toScore',
    javaName: 'toScore',
    label: 'Follow Path: ToScore',
    factory: 'drive.followPath("ToScore")',
    mechanism: 'drive',
    seconds: 2.0,
    description: 'Drive from the game piece to the scoring location.',
  },
  {
    id: 'intake',
    javaName: 'runIntake',
    label: 'Start Intake',
    factory: 'intake.intakeUntilPiece()',
    mechanism: 'intake',
    seconds: null,
    description: `Spins the rollers and finishes when the beam break sees a piece. Rollers need ${(INTAKE_SPINUP_CYCLES * CYCLE_SECONDS).toFixed(1)} s to spin up. Only works with the arm down.`,
  },
  {
    id: 'stopIntake',
    javaName: 'stopIntake',
    label: 'Stop Intake',
    factory: 'intake.stop()',
    mechanism: 'intake',
    seconds: null,
    description: 'runRepeatedly(() -> setSpeed(0)). Never finishes on its own.',
  },
  {
    id: 'raise',
    javaName: 'raiseArm',
    label: 'Raise Arm',
    factory: 'arm.raise()',
    mechanism: 'arm',
    seconds: 1.0,
    description: 'Raise the arm to scoring height.',
  },
  {
    id: 'lower',
    javaName: 'lowerArm',
    label: 'Lower Arm',
    factory: 'arm.lower()',
    mechanism: 'arm',
    seconds: 0.8,
    description: 'Lower the arm back to the floor.',
  },
  {
    id: 'score',
    javaName: 'scorePiece',
    label: 'Score Game Piece',
    factory: 'intake.score()',
    mechanism: 'intake',
    seconds: 0.4,
    description: 'Eject the piece. Must be stopped at the scoring location with the arm raised.',
  },
]

export const PALETTE_BY_ID = Object.fromEntries(PALETTE.map((p) => [p.id, p])) as Record<PaletteId, PaletteItem>

export interface RoutineStep {
  op: 'fork' | 'await'
  command: PaletteId
}

export const MAX_ROUTINE_STEPS = 12

export const AUTO_COMMAND_ID = 'auto'

function paletteCommands(): CommandDef[] {
  const work = (id: PaletteId, label: string, java: string): CommandDef => {
    const p = PALETTE_BY_ID[id]
    return {
      id,
      name: p.label.replace('Follow Path: ', 'Path '),
      requirements: [p.mechanism],
      factory: p.factory,
      body: [{ op: 'work', label, cycles: cycles(p.seconds ?? 0), java }],
    }
  }
  return [
    work('toPiece', 'path:ToPiece', 'followTrajectoryStep("ToPiece");'),
    work('toScore', 'path:ToScore', 'followTrajectoryStep("ToScore");'),
    {
      id: 'intake',
      name: 'Intake Until Piece',
      requirements: ['intake'],
      factory: PALETTE_BY_ID.intake.factory,
      body: [{ op: 'waitUntil', signal: 'hasGamePiece' }],
    },
    {
      id: 'stopIntake',
      name: 'Stop Intake',
      requirements: ['intake'],
      factory: PALETTE_BY_ID.stopIntake.factory,
      repeatedly: true,
      body: [{ op: 'repeat', label: 'rollers off', java: 'setSpeed(0);' }],
    },
    work('raise', 'arm:raise', 'setArmVoltage(6);'),
    work('lower', 'arm:lower', 'setArmVoltage(-4);'),
    work('score', 'intake:score', 'setSpeed(-1.0);'),
    {
      id: 'intakeIdle',
      name: 'Intake Idle',
      requirements: ['intake'],
      priority: LOWEST_PRIORITY,
      repeatedly: true,
      factory: 'intake.idleRollers()',
      body: [{ op: 'repeat', label: 'idle', java: 'setSpeed(0);' }],
    },
  ]
}

export function buildAutonomousScenario(routine: RoutineStep[]): Scenario {
  const auto: CommandDef = {
    id: AUTO_COMMAND_ID,
    name: 'My Auto',
    requirements: [],
    factory: 'myAuto()',
    body: routine.map((s) => (s.op === 'fork' ? { op: 'fork', commands: [s.command] } : { op: 'await', command: s.command })),
  }
  return {
    mechanisms: [
      { id: 'drive', name: 'Drive' },
      { id: 'intake', name: 'Intake', defaultCommand: 'intakeIdle' },
      { id: 'arm', name: 'Arm' },
    ],
    commands: [auto, ...paletteCommands()],
    events: [{ cycle: 1, action: 'schedule', command: AUTO_COMMAND_ID }],
    maxCycles: AUTO_LIMIT_CYCLES,
  }
}

export type RobotLocation = 'start' | 'piece' | 'score' | 'between'

export interface RobotState {
  location: RobotLocation
  /** 0 = down, ARM_UP_CYCLES = fully raised */
  armProgress: number
  hasPiece: boolean
  scored: boolean
  intakeRunCycles: number
  pathProgress: Record<'toPiece' | 'toScore', number>
  pathValid: Record<'toPiece' | 'toScore', boolean>
  scoreProgress: number
}

export const ARM_UP_CYCLES = cycles(1.0)

export interface WorldIssue {
  cycle: number
  kind: 'pickup-blocked' | 'bad-path-start' | 'bad-score' | 'path-interrupted'
  message: string
}

export class AutonomousWorld implements WorldModel {
  state: RobotState = AutonomousWorld.initial()
  issues: WorldIssue[] = []
  history: Array<{ cycle: number; state: RobotState }> = []
  private warned = new Set<string>()

  static initial(): RobotState {
    return {
      location: 'start',
      armProgress: 0,
      hasPiece: false,
      scored: false,
      intakeRunCycles: 0,
      pathProgress: { toPiece: 0, toScore: 0 },
      pathValid: { toPiece: false, toScore: false },
      scoreProgress: 0,
    }
  }

  private issue(view: SchedulerView, kind: WorldIssue['kind'], message: string, once = true) {
    const key = `${kind}:${message}`
    if (once && this.warned.has(key)) return
    this.warned.add(key)
    this.issues.push({ cycle: view.cycle, kind, message })
    view.note(message)
  }

  signal(name: string): boolean | undefined {
    if (name === 'hasGamePiece') return this.state.hasPiece
    return undefined
  }

  afterCycle(view: SchedulerView): void {
    // Effects of this cycle are judged against the robot state at the start of the cycle.
    const copy = (r: RobotState): RobotState => ({ ...r, pathProgress: { ...r.pathProgress }, pathValid: { ...r.pathValid } })
    const before = copy(this.state)
    const next = copy(before)
    const activity = view.activity()
    const armDown = before.armProgress === 0
    const armUp = before.armProgress >= ARM_UP_CYCLES

    // Intake rollers spin while Intake Until Piece is running (even while it waits).
    if (view.isRunning('intake')) {
      next.intakeRunCycles = before.intakeRunCycles + 1
      if (!before.hasPiece && before.location === 'piece') {
        if (!armDown) {
          this.issue(view, 'pickup-blocked', 'The arm is not down, so the ground intake cannot reach the game piece.')
        } else if (before.intakeRunCycles + 1 >= INTAKE_SPINUP_CYCLES) {
          next.hasPiece = true
          view.note('Beam break: game piece collected!')
        }
      }
    } else {
      next.intakeRunCycles = 0
    }

    // Paths
    for (const path of ['toPiece', 'toScore'] as const) {
      const pathName = path === 'toPiece' ? 'ToPiece' : 'ToScore'
      const required: RobotLocation = path === 'toPiece' ? 'start' : 'piece'
      const destination: RobotLocation = path === 'toPiece' ? 'piece' : 'score'
      if (activity.get(path) === `path:${pathName}`) {
        if (before.pathProgress[path] === 0) {
          next.pathValid[path] = before.location === required
          if (!next.pathValid[path]) {
            this.issue(
              view,
              'bad-path-start',
              `Path ${pathName} must start at the ${required === 'start' ? 'starting line' : 'game piece'}.`,
            )
          }
        }
        next.pathProgress[path] = before.pathProgress[path] + 1
        next.location = 'between'
        if (next.pathProgress[path] >= cycles(PALETTE_BY_ID[path].seconds ?? 0)) {
          next.location = next.pathValid[path] ? destination : 'between'
          next.pathProgress[path] = 0
        }
      } else if (before.pathProgress[path] > 0 && !view.isRunning(path)) {
        this.issue(view, 'path-interrupted', 'A path was stopped before it finished; the robot is stranded mid-field.')
        next.pathProgress[path] = 0
        next.location = 'between'
      }
    }

    // Arm
    if (activity.get('raise') === 'arm:raise') next.armProgress = Math.min(ARM_UP_CYCLES, before.armProgress + 1)
    if (activity.get('lower') === 'arm:lower') next.armProgress = Math.max(0, before.armProgress - ARM_UP_CYCLES / cycles(PALETTE_BY_ID.lower.seconds ?? 0.8))

    // Score
    if (activity.get('score') === 'intake:score') {
      next.scoreProgress = before.scoreProgress + 1
      if (next.scoreProgress >= cycles(PALETTE_BY_ID.score.seconds ?? 0)) {
        next.scoreProgress = 0
        const moving = activity.get('toPiece') !== undefined || activity.get('toScore') !== undefined
        if (!before.hasPiece) this.issue(view, 'bad-score', 'Score ran, but the robot has no game piece.', false)
        else if (before.location !== 'score' || moving) this.issue(view, 'bad-score', 'Score ran away from the scoring location. The piece missed!', false)
        else if (!armUp) this.issue(view, 'bad-score', 'Score ran before the arm was fully raised. The piece missed!', false)
        else {
          next.scored = true
          view.note('SCORED! Game piece delivered.')
        }
        if (before.hasPiece) next.hasPiece = false
      }
    } else if (!view.isRunning('score')) {
      next.scoreProgress = 0
    }

    this.state = next
    this.history.push({ cycle: view.cycle, state: next })
  }
}

export interface RoutineOptions {
  /** Extra objective: the arm must be fully down when My Auto finishes. */
  requireArmDown?: boolean
}

export interface RoutineEvaluation {
  /** Routine finished within the autonomous period and every objective was met. */
  success: boolean
  objectives: { collected: boolean; scored: boolean; finished: boolean; armDown: boolean | null }
  /** Cycle in which the auto command completed (or null if it never did). */
  finishCycle: number | null
  seconds: number | null
  issues: WorldIssue[]
  /** Interruptions caused inside the routine (mechanism conflicts). */
  conflicts: SchedulerEvent[]
  result: SimulationResult
  world: AutonomousWorld
  messages: string[]
}

export function validateRoutineShape(routine: unknown): routine is RoutineStep[] {
  if (!Array.isArray(routine) || routine.length === 0 || routine.length > MAX_ROUTINE_STEPS) return false
  return routine.every(
    (s) =>
      typeof s === 'object' &&
      s !== null &&
      ((s as RoutineStep).op === 'fork' || (s as RoutineStep).op === 'await') &&
      typeof (s as RoutineStep).command === 'string' &&
      (s as RoutineStep).command in PALETTE_BY_ID,
  )
}

export function evaluateRoutine(routine: RoutineStep[], options: RoutineOptions = {}): RoutineEvaluation {
  const world = new AutonomousWorld()
  const scheduler = new CommandScheduler(buildAutonomousScenario(routine), { world })
  const result = scheduler.runUntil((_snap, s) => !s.isRunning(AUTO_COMMAND_ID) && s.cycle >= 1)
  const outcome = result.outcomes[AUTO_COMMAND_ID]
  const finished = outcome?.status === 'completed'
  const finishCycle = finished ? outcome.cycle : null
  const collected = world.history.some((h) => h.state.hasPiece) || world.state.scored
  const scored = world.state.scored
  const armDown = options.requireArmDown ? world.state.armProgress === 0 : null
  const conflicts = result.events.filter((e) => e.type === 'Interrupted' && e.command !== 'intakeIdle')

  const messages: string[] = []
  if (!finished) {
    messages.push(
      outcome
        ? `My Auto was ${outcome.status} at ${(outcome.cycle * CYCLE_SECONDS).toFixed(2)} s.`
        : `My Auto was still running when the ${AUTO_LIMIT_SECONDS} s autonomous period ended. Is it awaiting a command that never finishes?`,
    )
  }
  if (!collected) messages.push('The robot never collected the game piece.')
  if (collected && !scored) messages.push('The robot collected the piece but did not score it.')
  if (armDown === false) messages.push('The arm was not fully down when My Auto finished.')
  if (finished && scored && armDown !== false) messages.push(`Objective complete in ${((finishCycle ?? 0) * CYCLE_SECONDS).toFixed(2)} s.`)

  return {
    success: finished && collected && scored && armDown !== false,
    objectives: { collected, scored, finished, armDown },
    finishCycle,
    seconds: finishCycle === null ? null : Number((finishCycle * CYCLE_SECONDS).toFixed(2)),
    issues: world.issues,
    conflicts,
    result,
    world,
    messages,
  }
}

/** Java source for a student routine. */
export function routineToJava(routine: RoutineStep[]): string {
  const counts = new Map<PaletteId, number>()
  for (const s of routine) counts.set(s.command, (counts.get(s.command) ?? 0) + 1)
  const locals = PALETTE.filter((p) => counts.has(p.id))
  const lines = ['public Command myAuto() {']
  for (const p of locals) lines.push(`  Command ${p.javaName} = ${p.factory};`)
  lines.push('', '  return Command.noRequirements(coroutine -> {')
  for (const s of routine) lines.push(`    coroutine.${s.op}(${PALETTE_BY_ID[s.command].javaName});`)
  if (routine.length === 0) lines.push('    // add steps here')
  lines.push('  }).named("My Auto");', '}')
  return lines.join('\n')
}
