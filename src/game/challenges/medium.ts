import { commandToJava } from '../../simulation/java.ts'
import type { CommandDef, Scenario } from '../../simulation/types.ts'
import type { Challenge } from '../types.ts'
import { loopCommand, scenario } from './scenarios.ts'

// --- Medium 1: mechanism conflict -------------------------------------------
const driveForward = loopCommand('forward', 'Drive Forward', 'drive', 8, 'drive.arcade(0.5, 0);', 'drive.driveForward()')
const turnLeft = loopCommand('turn', 'Turn Left', 'drive', 4, 'drive.arcade(0, 0.4);', 'drive.turnLeft()')
const conflictScenario = scenario(
  [driveForward, turnLeft],
  [
    { cycle: 1, action: 'schedule', command: 'forward' },
    { cycle: 4, action: 'schedule', command: 'turn' },
  ],
  10,
)

// --- Medium 2: priorities ----------------------------------------------------
const climb = loopCommand('climb', 'Climb', 'arm', 10, 'arm.setVoltage(-8);', 'arm.climb()', 100)
const stow = loopCommand('stow', 'Stow Arm', 'arm', 3, 'arm.setVoltage(-3);', 'arm.stow()', 0)
const estop = loopCommand('estop', 'Emergency Stop', 'arm', 2, 'arm.setVoltage(0);', 'arm.emergencyStop()', 1000)
const priorityScenario = scenario(
  [climb, stow, estop],
  [
    { cycle: 1, action: 'schedule', command: 'climb' },
    { cycle: 3, action: 'schedule', command: 'stow' },
    { cycle: 6, action: 'schedule', command: 'estop' },
  ],
  10,
)

// --- Medium 3: fork vs await ------------------------------------------------
export function forkAwaitScenario(first: 'fork' | 'await', second: 'fork' | 'await'): Scenario {
  const raise = loopCommand('raise', 'Raise Arm', 'arm', 5, 'setArmVoltage(6);', 'arm.raise()')
  const path = loopCommand('path', 'Path ToScore', 'drive', 8, 'followTrajectoryStep("ToScore");', 'drive.followPath("ToScore")')
  const score = loopCommand('score', 'Score', 'intake', 2, 'setSpeed(-1.0);', 'intake.score()')
  const seq: CommandDef = {
    id: 'seq',
    name: 'Score Sequence',
    requirements: [],
    body: [
      first === 'fork' ? { op: 'fork', commands: ['raise'] } : { op: 'await', command: 'raise' },
      second === 'fork' ? { op: 'fork', commands: ['path'] } : { op: 'await', command: 'path' },
      { op: 'await', command: 'score' },
    ],
  }
  return scenario([seq, raise, path, score], [{ cycle: 1, action: 'schedule', command: 'seq' }], 18)
}

// --- Medium 5: timeline -----------------------------------------------------
const prepRaise = loopCommand('raise', 'Raise Arm', 'arm', 2, 'setArmVoltage(6);', 'arm.raise()')
const creep = loopCommand('creep', 'Creep Forward', 'drive', 3, 'drive.arcade(0.2, 0);', 'drive.creepForward()')
const prep: CommandDef = {
  id: 'prep',
  name: 'Score Prep',
  requirements: [],
  body: [
    { op: 'fork', commands: ['raise'] },
    { op: 'await', command: 'creep' },
  ],
}
const timelineScenario = scenario([prep, prepRaise, creep], [{ cycle: 1, action: 'schedule', command: 'prep' }], 6)

const javaFor = (s: Scenario, ids: string[]) =>
  ids.map((id) => commandToJava(s.commands.find((c) => c.id === id)!, s, { asMethod: true })).join('\n\n')

export const mediumChallenges: Challenge[] = [
  {
    id: 'medium-1-drive-conflict',
    kind: 'choice',
    title: 'Who Gets the Drivetrain?',
    difficulty: 'medium',
    mode: 'scheduler',
    concepts: ['mechanisms', 'requirements', 'conflicts'],
    objective: 'Predict what the scheduler does when two commands require the same mechanism.',
    briefing: [
      'Every command declares the mechanisms it **requires**. Only one running command may require a mechanism at a time, so two commands can never fight over the same motors.',
      'Commands created with `drive.run(...)` automatically require `drive`. Both commands below have the default priority, 0.',
    ],
    prompt:
      'Drive Forward is running and owns Drive. In cycle 4, a button schedules Turn Left, which also requires Drive. What happens? Lock in your prediction, then step the simulator to check.',
    code: javaFor(conflictScenario, ['forward', 'turn']),
    codeNote: '`run`, `named`, `coroutine.yield()` are WPILib API; `drive.arcade(...)` is illustrative team code.',
    scenario: conflictScenario,
    predictFirst: true,
    options: [
      {
        id: 'a',
        label: 'Turn Left waits until Drive Forward finishes, then runs.',
        feedback: 'Commands v3 has no waiting line for mechanisms. A conflicting command either takes over or is rejected immediately.',
      },
      {
        id: 'b',
        label: 'Both run, and the drivetrain blends their motor outputs.',
        feedback: 'This is exactly what requirements prevent: two commands driving the same motors would fight.',
      },
      {
        id: 'c',
        label: 'Drive Forward is interrupted and canceled; Turn Left takes over Drive.',
        feedback: 'Correct. Equal priority: the newly scheduled command wins the tie.',
      },
      {
        id: 'd',
        label: 'Turn Left is rejected because Drive Forward got there first.',
        feedback: 'That only happens if the new command has lower priority. Ties go to the newly scheduled command.',
      },
    ],
    correct: ['c'],
    verify: (r) => (r.outcomes.forward?.status === 'interrupted' && r.cycles[3].owners.drive === 'turn' ? ['c'] : ['?']),
    hints: ['Both commands have priority 0. What does the scheduler do on a tie?', 'Look for an "Interrupted" event in the log after stepping to cycle 4.'],
    why: 'During cycle 4 the scheduler promotes Turn Left from the pending set. It conflicts with Drive Forward on Drive, and with equal priority "newly scheduled commands win ties", so Drive Forward gets an Interrupted event followed by Canceled, and Turn Left owns Drive from that cycle on.',
    successMessage: 'Requirements make conflicts predictable. Nice call.',
  },
  {
    id: 'medium-2-priority',
    kind: 'choice',
    title: 'Priority Showdown',
    difficulty: 'medium',
    mode: 'scheduler',
    concepts: ['priority', 'conflicts', 'interruption'],
    objective: 'Apply Commands v3 integer priorities to predict interruptions and rejections.',
    briefing: [
      'Commands v3 priorities are integers (default 0). When a new command conflicts with a running one: **higher or equal** priority interrupts it, **lower** priority is rejected and never starts.',
      'Set a priority with `.withPriority(int)` before `.named(...)`.',
    ],
    prompt:
      'Climb (priority 100) starts in cycle 1. In cycle 3 a driver schedules Stow Arm (priority 0). In cycle 6 a safety trigger schedules Emergency Stop (priority 1000). All three require Arm. What happens?',
    code: javaFor(priorityScenario, ['climb', 'stow', 'estop']),
    codeNote: '`withPriority` and `named` are WPILib API; `arm.setVoltage(...)` is illustrative team code.',
    scenario: priorityScenario,
    predictFirst: true,
    options: [
      {
        id: 'a',
        label: 'Stow Arm interrupts Climb in cycle 3; then Emergency Stop interrupts Stow Arm in cycle 6.',
        feedback: 'Stow Arm (0) is lower priority than Climb (100), so it cannot interrupt it.',
      },
      {
        id: 'b',
        label: 'Stow Arm is rejected in cycle 3; Emergency Stop interrupts Climb in cycle 6.',
        feedback: 'Correct: lower priority is discarded, higher priority interrupts.',
      },
      {
        id: 'c',
        label: 'Stow Arm waits in the pending set and runs after Climb finishes.',
        feedback: 'Rejected commands are discarded, not queued. Something must schedule Stow Arm again later.',
      },
      {
        id: 'd',
        label: 'Nothing can interrupt Climb because it started first.',
        feedback: 'Starting first does not protect a command. Emergency Stop has higher priority, so it wins.',
      },
    ],
    correct: ['b'],
    verify: (r) =>
      r.outcomes.stow?.status === 'rejected' && r.outcomes.climb?.status === 'interrupted' && r.cycles[5].owners.arm === 'estop' ? ['b'] : ['?'],
    hints: ['Compare 0 with 100, then 1000 with 100.', 'Lower priority commands do not wait in line.'],
    why: 'Stow Arm (0) < Climb (100): schedule() fails with LowerPriorityThanRunningCommand, so Stow Arm never runs. Emergency Stop (1000) > Climb (100): Climb is interrupted and canceled, and Emergency Stop owns Arm. Safety commands often use a high priority so drivers cannot accidentally override them.',
    successMessage: 'You can read a priority table like a referee.',
  },
  {
    id: 'medium-3-fork-await',
    kind: 'choice',
    title: 'Fork or Await?',
    difficulty: 'medium',
    mode: 'scheduler',
    concepts: ['fork', 'await', 'parent-child'],
    objective: 'Choose between `fork()` (run alongside) and `await()` (wait for it) to build a fast, safe sequence.',
    briefing: [
      '`coroutine.fork(cmd)` starts a child command and the parent **keeps going** right away. The child runs alongside the parent.',
      '`coroutine.await(cmd)` starts a child command and the parent **waits** until the child finishes.',
    ],
    prompt:
      'Fill the two blanks so the arm rises WHILE the robot drives, and scoring starts only AFTER the robot has arrived. Raise Arm takes 5 cycles, the path takes 8.',
    code: `public Command scoreSequence() {
  return Command.noRequirements(coroutine -> {
    coroutine.___1___(arm.raise());
    coroutine.___2___(drive.followPath("ToScore"));
    coroutine.await(intake.score());
  }).named("Score Sequence");
}`,
    codeNote: '`fork`, `await`, `Command.noRequirements` are WPILib API; `arm.raise()`, `followPath` and `intake.score()` are illustrative team commands.',
    options: [
      {
        id: 'fork-await',
        label: '1 = fork, 2 = await',
        feedback: 'Correct: the arm rises in the background while the parent waits for the path, then scores.',
        scenario: forkAwaitScenario('fork', 'await'),
      },
      {
        id: 'await-await',
        label: '1 = await, 2 = await',
        feedback: 'Safe but slow: the robot sits still until the arm is fully up before it starts driving.',
        scenario: forkAwaitScenario('await', 'await'),
      },
      {
        id: 'fork-fork',
        label: '1 = fork, 2 = fork',
        feedback: 'The parent does not wait for the path, so it starts scoring immediately while the robot is still driving.',
        scenario: forkAwaitScenario('fork', 'fork'),
      },
      {
        id: 'await-fork',
        label: '1 = await, 2 = fork',
        feedback: 'Slow at the start AND it scores while driving. Two problems in one.',
        scenario: forkAwaitScenario('await', 'fork'),
      },
    ],
    correct: ['fork-await'],
    hints: ['Which step must the parent wait for before scoring?', 'Which step can safely happen in the background?'],
    why: '`fork(arm.raise())` returns immediately, so the arm rises while `await(drive.followPath(...))` holds the parent until the robot arrives. Then `await(intake.score())` runs. Compare the timelines: fork/await finishes in 11 cycles, await/await needs 16, and both fork-path versions start scoring while driving.',
    successMessage: 'Fork for "meanwhile", await for "and then". You have it.',
  },
  {
    id: 'medium-4-debug-sequence',
    kind: 'reorder',
    title: 'Debug the Sequence',
    difficulty: 'medium',
    mode: 'scheduler',
    concepts: ['await', 'debugging', 'execution-order'],
    objective: 'Find and fix an ordering bug in an awaited command sequence.',
    briefing: [
      'A chain of `await` calls runs one step at a time, like a recipe. If one awaited command never finishes, the whole routine is stuck on that line.',
      'Rules of this robot: the intake only finishes once it touches a game piece, the ground intake only works with the arm down, and scoring needs the robot at the scoring spot with the arm up.',
    ],
    prompt: 'This routine never scores. Reorder the lines so it collects the piece, drives to the scoring spot, and scores. Run it to test your order.',
    codeNote: 'Path and mechanism methods are illustrative team code. `await` and `Command.noRequirements` are WPILib API.',
    before: `public Command scoreOnePiece() {
  return Command.noRequirements(coroutine -> {`,
    after: `  }).named("Score One Piece");
}`,
    indent: 4,
    items: [
      { id: 'toPiece', code: 'coroutine.await(drive.followPath("ToPiece"));', step: { op: 'await', command: 'toPiece' } },
      { id: 'intake', code: 'coroutine.await(intake.intakeUntilPiece());', step: { op: 'await', command: 'intake' } },
      { id: 'raise', code: 'coroutine.await(arm.raise());', step: { op: 'await', command: 'raise' } },
      { id: 'toScore', code: 'coroutine.await(drive.followPath("ToScore"));', step: { op: 'await', command: 'toScore' } },
      { id: 'score', code: 'coroutine.await(intake.score());', step: { op: 'await', command: 'score' } },
    ],
    initialOrder: ['intake', 'toPiece', 'toScore', 'score', 'raise'],
    correctOrders: [
      ['toPiece', 'intake', 'raise', 'toScore', 'score'],
      ['toPiece', 'intake', 'toScore', 'raise', 'score'],
    ],
    gradeByRoutine: true,
    hints: [
      'The original routine is stuck on line 1. Where is the robot when it starts intaking?',
      'Scoring must come last, after both the drive and the arm are ready.',
    ],
    why: '`await(intake.intakeUntilPiece())` waits until a piece is detected, but at the starting line there is no piece, so the routine hangs forever. Drive to the piece first, then intake, raise the arm (only after pickup, because the ground intake needs it down), drive to the scoring spot, and score.',
    successMessage: 'Bug squashed. Reading await chains step by step is a core debugging skill.',
  },
  {
    id: 'medium-5-cycle-timeline',
    kind: 'timeline',
    title: 'Cycle by Cycle',
    difficulty: 'medium',
    mode: 'scheduler',
    concepts: ['scheduler-cycles', 'fork', 'await', 'yield'],
    objective: 'Trace parent and child commands across scheduler cycles.',
    briefing: [
      'A forked or awaited child **starts running immediately**, in the same cycle as the line that started it.',
      'Each cycle, running commands get a turn newest-first, so a parent can resume in the same cycle its awaited child finishes. A `for` loop that yields at the end of each pass needs one extra turn to notice the loop is over.',
    ],
    prompt:
      'Score Prep is scheduled in cycle 1. Fill in each command\'s status at the end of each cycle: Running (did work and yielded), Waiting (paused in an await), Done (completed this cycle), or — (not running).',
    code: javaFor(timelineScenario, ['prep', 'raise', 'creep']),
    codeNote: 'All coroutine and builder calls are WPILib API; `setArmVoltage` and `drive.arcade` are illustrative.',
    scenario: timelineScenario,
    rows: ['prep', 'raise', 'creep'],
    cycles: [1, 2, 3, 4, 5],
    choices: ['running', 'waiting', 'completed', 'idle'],
    expected: {
      prep: ['waiting', 'waiting', 'waiting', 'completed', 'idle'],
      raise: ['running', 'running', 'completed', 'idle', 'idle'],
      creep: ['running', 'running', 'running', 'completed', 'idle'],
    },
    hints: [
      'In cycle 1, Score Prep forks Raise Arm (which runs one loop pass) and then awaits Creep Forward (which also runs one pass).',
      'Raise Arm loops 2 times: it yields in cycles 1 and 2, and finishes when it resumes in cycle 3.',
    ],
    why: 'Cycle 1: Score Prep forks Raise Arm (runs pass 1), then awaits Creep Forward (runs pass 1) and parks. Raise Arm finishes on its third turn (cycle 3) when the loop condition fails. Creep Forward finishes in cycle 4; because commands run newest-first, Score Prep resumes in that same cycle and completes.',
    successMessage: 'You traced the scheduler like a debugger.',
  },
]
