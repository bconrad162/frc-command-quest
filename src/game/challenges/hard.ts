import { commandToJava } from '../../simulation/java.ts'
import type { CommandDef, Scenario } from '../../simulation/types.ts'
import type { Challenge } from '../types.ts'
import { loopCommand, scenario } from './scenarios.ts'

const javaFor = (s: Scenario, ids: string[]) =>
  ids.map((id) => commandToJava(s.commands.find((c) => c.id === id)!, s, { asMethod: true })).join('\n\n')

// --- Hard 1: sibling conflict -------------------------------------------------
const armUp = loopCommand('armUp', 'Arm Up', 'arm', 6, 'setArmVoltage(6);', 'arm.up()')
const armDown = loopCommand('armDown', 'Arm Down', 'arm', 3, 'setArmVoltage(-4);', 'arm.down()')
const spin = loopCommand('spin', 'Spin Intake', 'intake', 8, 'setSpeed(0.8);', 'intake.spin()')
const pickup: CommandDef = {
  id: 'pickup',
  name: 'Pickup Routine',
  requirements: [],
  body: [
    { op: 'fork', commands: ['armUp'] },
    { op: 'fork', commands: ['spin'] },
    { op: 'wait', cycles: 2 },
    { op: 'fork', commands: ['armDown'] },
    { op: 'await', command: 'spin' },
  ],
}
const siblingScenario = scenario([pickup, armUp, spin, armDown], [{ cycle: 1, action: 'schedule', command: 'pickup' }], 12)

// --- Hard 2: external interruption --------------------------------------------
const armTask = loopCommand('armTask', 'Arm Task', 'arm', 10, 'setArmVoltage(6);', 'arm.moveUp()')
const intakeTask = loopCommand('intakeTask', 'Intake Task', 'intake', 10, 'setSpeed(0.8);', 'intake.spin()')
const scorePath = loopCommand('path', 'Follow ScorePath', 'drive', 12, 'followTrajectoryStep("ScorePath");', 'drive.followPath("ScorePath")')
const manualArm = loopCommand('manualArm', 'Manual Arm', 'arm', 4, 'setArmVoltage(operator.getLeftY() * 6);', 'arm.manualControl()')
const autoScore: CommandDef = {
  id: 'autoScore',
  name: 'Auto Score',
  requirements: [],
  body: [
    { op: 'fork', commands: ['armTask'] },
    { op: 'fork', commands: ['intakeTask'] },
    { op: 'await', command: 'path' },
  ],
}
const externalScenario = scenario(
  [autoScore, armTask, intakeTask, scorePath, manualArm],
  [
    { cycle: 1, action: 'schedule', command: 'autoScore' },
    { cycle: 4, action: 'schedule', command: 'manualArm' },
  ],
  10,
)

// --- Hard 3: parent cancellation ----------------------------------------------
const roller: CommandDef = {
  id: 'roller',
  name: 'Run Roller Until Loaded',
  requirements: ['intake'],
  factory: 'intake.runRollerUntilLoaded()',
  body: [{ op: 'waitUntil', signal: 'hasGamePiece' }],
}
const toPiece = loopCommand('toPiece', 'Path ToPiece', 'drive', 10, 'followTrajectoryStep("ToPiece");', 'drive.followPath("ToPiece")')
const twoPiece: CommandDef = {
  id: 'twoPiece',
  name: 'Two Piece Auto',
  requirements: [],
  body: [
    { op: 'fork', commands: ['roller'] },
    { op: 'await', command: 'toPiece' },
  ],
}
const cancelScenario = scenario(
  [twoPiece, roller, toPiece],
  [
    { cycle: 1, action: 'schedule', command: 'twoPiece' },
    { cycle: 5, action: 'cancel', command: 'twoPiece' },
  ],
  8,
)

export const hardChallenges: Challenge[] = [
  {
    id: 'hard-1-sibling-conflict',
    kind: 'choice',
    title: 'Sibling Rivalry',
    difficulty: 'hard',
    mode: 'scheduler',
    concepts: ['parent-child', 'conflicts', 'interruption'],
    objective: 'Predict how a conflict between two children of the same parent is resolved.',
    briefing: [
      'Commands a parent forks or awaits are its **children**; children of the same parent are **siblings**.',
      'The official docs: if one forked child is interrupted by a sibling, only the interrupted child (and its own children) are canceled. The parent and other siblings keep running.',
    ],
    prompt:
      'In cycle 3, Pickup Routine forks Arm Down while its other child, Arm Up, still owns Arm. What gets canceled? Predict, then step through it.',
    code: javaFor(siblingScenario, ['pickup']),
    codeNote: '`fork`, `wait`, `await` are WPILib API; `arm.up()`, `arm.down()`, `intake.spin()` are illustrative team commands.',
    scenario: siblingScenario,
    predictFirst: true,
    options: [
      {
        id: 'a',
        label: 'Only Arm Up. Pickup Routine and Spin Intake keep running.',
        feedback: 'Correct: a sibling conflict cancels just the interrupted sibling.',
      },
      {
        id: 'b',
        label: 'The whole Pickup Routine, including Spin Intake.',
        feedback: 'That is what happens with an EXTERNAL interruption. Here the interrupter is a sibling, part of the same composition.',
      },
      {
        id: 'c',
        label: 'Nothing. Arm Down is rejected because Arm Up got there first.',
        feedback: 'Siblings have equal effective priority here, and new commands win ties.',
      },
      {
        id: 'd',
        label: 'Arm Up and Spin Intake, but Pickup Routine continues.',
        feedback: 'Spin Intake does not require Arm, so it has no conflict at all.',
      },
    ],
    correct: ['a'],
    verify: (r) =>
      r.outcomes.armUp?.status === 'interrupted' && r.outcomes.pickup?.status === 'completed' && r.outcomes.spin?.status === 'completed'
        ? ['a']
        : ['?'],
    hints: ['Arm Up and Arm Down have the same parent.', 'Does Spin Intake require Arm?'],
    why: 'Arm Down and Arm Up are siblings. The scheduler cancels the conflicting command up to (but not including) the shared parent, so only Arm Up is interrupted. Spin Intake has no conflict, and Pickup Routine keeps awaiting it until it completes in cycle 9.',
    successMessage: 'Sibling rules mastered. This is subtle scheduler behavior.',
  },
  {
    id: 'hard-2-external-interrupt',
    kind: 'choice',
    title: 'Outside Interference',
    difficulty: 'hard',
    mode: 'scheduler',
    concepts: ['parent-child', 'interruption', 'cancellation'],
    objective: 'Predict how an external interruption of one child affects the whole composition.',
    briefing: [
      'A parent that requires no mechanisms still "inherits" its children\'s requirements while they run.',
      'If a child is interrupted by a command from **outside** the composition, the scheduler cancels the entire composition: the parent and every child.',
    ],
    prompt:
      'Auto Score forks Arm Task and Intake Task, then awaits Follow ScorePath. In cycle 4 the operator schedules Manual Arm (priority 0, requires Arm). Select EVERY command still running at the end of cycle 4.',
    code: javaFor(externalScenario, ['autoScore', 'manualArm']),
    codeNote: 'Builder and coroutine calls are WPILib API; mechanism methods are illustrative.',
    scenario: externalScenario,
    predictFirst: true,
    multiple: true,
    options: [
      { id: 'autoScore', label: 'Auto Score', feedback: 'Auto Score is canceled: its child was interrupted from outside.' },
      { id: 'armTask', label: 'Arm Task', feedback: 'Arm Task lost the Arm to Manual Arm.' },
      { id: 'intakeTask', label: 'Intake Task', feedback: 'Intake Task is canceled along with its parent, even though nothing else wanted the Intake.' },
      { id: 'path', label: 'Follow ScorePath', feedback: 'The path is a child of Auto Score, so it is canceled too.' },
      { id: 'manualArm', label: 'Manual Arm', feedback: 'Manual Arm took over the Arm and keeps running.' },
    ],
    correct: ['manualArm'],
    verify: (r) => [...r.cycles[3].running].sort(),
    hints: ['Manual Arm is not part of Auto Score.', 'When a composition is canceled, all of its children go with it.'],
    why: 'Manual Arm (priority 0) ties with Arm Task\'s effective priority (0), so it wins. Because Manual Arm is outside the composition, the scheduler climbs to the root, Auto Score, and interrupts it. Canceling a parent cancels all of its children: Intake Task and Follow ScorePath stop even though they had no conflict. Only Manual Arm is left.',
    successMessage: 'You see the whole composition, not just one command.',
  },
  {
    id: 'hard-3-cancel-cleanup',
    kind: 'code-edit',
    title: 'Pull the Plug',
    difficulty: 'hard',
    mode: 'scheduler',
    concepts: ['cancellation', 'parent-child', 'debugging'],
    objective: 'Make a child command clean up safely when its parent is canceled.',
    briefing: [
      'When a parent command is canceled, all of its children are canceled too, wherever they are paused.',
      'A command canceled in the middle of `waitUntil` never reaches the lines after it. Commands v3 builders offer `.whenCanceled(Runnable)` for short cleanup that must run when a command is canceled.',
    ],
    prompt:
      'Step the simulator: Two Piece Auto is canceled in cycle 5 while Run Roller Until Loaded is waiting, so `roller.set(0)` never runs and the roller keeps spinning. Add one builder call in the highlighted line so the roller stops on cancellation.',
    codeNote: '`run`, `waitUntil`, `whenCanceled` and `named` are WPILib API. `roller` is a motor controller and `hasGamePiece` a sensor in team code.',
    prefix: `public Command runRollerUntilLoaded() {
  return run(coroutine -> {
    roller.set(0.6);
    coroutine.waitUntil(hasGamePiece);
    roller.set(0);
  })
    `,
    initial: '// add cleanup here',
    suffix: `
    .named("Run Roller Until Loaded");
}`,
    accepted: [
      '^\\.whenCanceled\\(\\(\\)->roller\\.(set\\(0(\\.0)?\\)|stopMotor\\(\\))\\)$',
      '^\\.whenCanceled\\(\\(\\)->\\{roller\\.(set\\(0(\\.0)?\\)|stopMotor\\(\\));\\}\\)$',
      '^\\.whenExited\\(\\(\\)->roller\\.(set\\(0(\\.0)?\\)|stopMotor\\(\\))\\)$',
      '^\\.whenExited\\(\\(\\)->\\{roller\\.(set\\(0(\\.0)?\\)|stopMotor\\(\\));\\}\\)$',
    ],
    mistakes: [
      { pattern: '^//.*$', feedback: 'The line is still a comment. Add a builder method call that starts with a dot.' },
      { pattern: '^\\.whenCanceled\\(roller\\.set\\(0(\\.0)?\\)\\)$', feedback: '`whenCanceled` needs a Runnable, a lambda like `() -> roller.set(0)`, not the result of calling `set` right now.' },
      { pattern: '^roller\\.set\\(0(\\.0)?\\);?$', feedback: 'This line is part of a builder chain, so it must be a method call like `.whenCanceled(...)`.' },
      { pattern: '^\\.whenCanceled\\(.*set\\(0\\.6\\).*\\)$', feedback: 'Cleanup should stop the roller (0), not start it.' },
      { pattern: '^\\.until\\(.*\\)$', feedback: '`until` adds an end condition; it does not run cleanup when the parent cancels this command.' },
    ],
    solution: '.whenCanceled(() -> roller.set(0))',
    scenario: cancelScenario,
    hints: ['The method name says exactly when it runs: when the command is ___.', 'It takes a lambda: `() -> roller.set(0)`.'],
    why: 'Canceling Two Piece Auto cascades to Run Roller Until Loaded while it is parked in `waitUntil`, so the code after the wait never runs. `.whenCanceled(() -> roller.set(0))` registers cleanup that runs whenever the command is canceled, for any reason. (`.whenExited(...)` also works: it runs on every exit.) Keep cancellation cleanup short: stop a motor, clear a flag.',
    successMessage: 'Safe cancellation is what separates demo code from match-ready code.',
  },
  {
    id: 'hard-4-debug-auto',
    kind: 'autonomous',
    title: 'Debug the Autonomous',
    difficulty: 'hard',
    mode: 'autonomous',
    concepts: ['debugging', 'fork', 'await', 'parent-child'],
    objective: 'Debug a concurrent autonomous routine that compiles but fails on the field.',
    briefing: [
      'This routine was written in a hurry before a match. Run it and read the event log: it never scores.',
      'Remember: forked children are canceled when the parent finishes, the ground intake needs the arm down, and scoring needs the robot stopped at the scoring spot with the arm up.',
    ],
    prompt: 'Fix the routine so the robot collects the piece and scores within the 15 s autonomous period. Faster fixes earn an efficiency bonus.',
    codeNote: 'Path and mechanism factories are illustrative team code (PathPlanner-style path names). `fork`, `await` and `Command.noRequirements` are WPILib API.',
    starter: [
      { op: 'fork', command: 'raise' },
      { op: 'fork', command: 'intake' },
      { op: 'await', command: 'toPiece' },
      { op: 'await', command: 'toScore' },
      { op: 'fork', command: 'score' },
    ],
    palette: ['toPiece', 'toScore', 'intake', 'stopIntake', 'raise', 'lower', 'score'],
    goldSeconds: 4.1,
    silverSeconds: 4.5,
    hints: [
      'Two bugs: one stops the intake from ever grabbing the piece, and one cancels the score before it finishes.',
      'Move Raise Arm after the robot has the piece, and await the score so My Auto does not finish early.',
    ],
    why: 'Raising the arm at the start lifts the ground intake off the floor, so the piece is never collected. And `fork(score)` as the last line means My Auto completes immediately, which cancels the forked score. A parent must await anything that has to finish before it ends.',
    successMessage: 'Field-ready. That is real autonomous debugging.',
  },
  {
    id: 'hard-5-optimize-auto',
    kind: 'autonomous',
    title: 'Autonomous Architect',
    difficulty: 'hard',
    mode: 'autonomous',
    concepts: ['optimization', 'fork', 'await', 'conflicts'],
    objective: 'Design the fastest legal autonomous routine using fork and await.',
    briefing: [
      'Build the routine from scratch. Any step can be `fork` (run alongside) or `await` (wait for it). Steps that use different mechanisms can overlap, but each mechanism can only run one command at a time.',
      'Objective: collect the game piece, score it, and finish with the arm back down for teleop. The clock stops when My Auto completes.',
    ],
    prompt: 'Build the fastest routine that completes every objective. Gold: 4.9 s or less. Silver: 5.3 s or less.',
    codeNote: 'Path and mechanism factories are illustrative team code. `fork`, `await` and `Command.noRequirements` are WPILib API.',
    starter: [],
    palette: ['toPiece', 'toScore', 'intake', 'stopIntake', 'raise', 'lower', 'score'],
    goldSeconds: 4.9,
    silverSeconds: 5.3,
    requireArmDown: true,
    hints: [
      'The intake rollers need 0.4 s to spin up. Can they spin up while the robot is still driving to the piece?',
      'Can the arm rise while the robot drives to the scoring spot? And what happens to a forked Lower Arm when My Auto finishes?',
    ],
    why: 'The fastest routine forks the intake before driving (so the rollers are already at speed on arrival), forks Raise Arm during the ToScore path, awaits the score, and finally awaits Lower Arm. A forked Lower Arm at the end would be canceled when My Auto completes, leaving the arm up.',
    successMessage: 'Autonomous Architect! Concurrency, sequencing, and safety, all in one routine.',
  },
]
