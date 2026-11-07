/**
 * Driver Controls missions: Xbox controllers and trigger bindings in WPILib 2027
 * Commands v3 (org.wpilib.command3.button.CommandXboxController, Trigger).
 * Bindings mirror a real team's 2026 robot code, translated to the v3 API.
 */
import type { CommandDef, Scenario } from '../../simulation/types.ts'
import { LOWEST_PRIORITY } from '../../simulation/types.ts'
import type { Challenge, ChoiceOption } from '../types.ts'
import { MECHANISMS, scenario } from './scenarios.ts'

const CONTROLS_NOTE =
  '`CommandXboxController`, its button and stick methods, and the `Trigger` binding methods (`onTrue`, `whileTrue`, ...) are WPILib 2027 API. Mechanism commands like `intake.intakeFuel()` are team code.'

// --- Medium 7: what a quick tap does with each binding -----------------------
const spin: CommandDef = {
  id: 'spin',
  name: 'Spin Rollers',
  requirements: ['intake'],
  repeatedly: true,
  factory: 'intake.spin()',
  body: [{ op: 'repeat', label: 'Spin Rollers', java: 'setSpeed(0.8);' }],
}
const press = { cycle: 2, action: 'setSignal', signal: 'A', value: true } as const
const release = { cycle: 3, action: 'setSignal', signal: 'A', value: false } as const
function tapScenario(binding: string, extra: Scenario['events']): Scenario {
  const events: Scenario['events'] = [
    { ...press, note: `Driver pressed A (${binding})` },
    { ...release, note: `Driver let go of A (${binding})` },
    ...extra,
  ]
  return scenario([spin], events.sort((a, b) => a.cycle - b.cycle), 6)
}
const tapOptions: ChoiceOption[] = [
  {
    id: 'onTrue',
    label: 'driver.a().onTrue(intake.spin())',
    feedback: 'Still running. onTrue starts the command on the press and then leaves it alone: letting go does not stop it.',
    scenario: tapScenario('onTrue', [{ cycle: 2, action: 'schedule', command: 'spin', note: 'onTrue: rising edge, schedule Spin Rollers' }]),
  },
  {
    id: 'whileTrue',
    label: 'driver.a().whileTrue(intake.spin())',
    feedback: 'Stopped. whileTrue cancels the command on the falling edge, the moment the driver lets go.',
    scenario: tapScenario('whileTrue', [
      { cycle: 2, action: 'schedule', command: 'spin', note: 'whileTrue: rising edge, schedule Spin Rollers' },
      { cycle: 3, action: 'cancel', command: 'spin', note: 'whileTrue: falling edge, cancel Spin Rollers' },
    ]),
  },
  {
    id: 'toggleOnTrue',
    label: 'driver.a().toggleOnTrue(intake.spin())',
    feedback: 'Still running. toggleOnTrue starts it on the first press and only cancels it on the next press.',
    scenario: tapScenario('toggleOnTrue', [{ cycle: 2, action: 'schedule', command: 'spin', note: 'toggleOnTrue: first press, schedule Spin Rollers' }]),
  },
  {
    id: 'onFalse',
    label: 'driver.a().onFalse(intake.spin())',
    feedback: 'Running. onFalse does nothing on the press; it starts the command on the release, so it is running after the driver lets go.',
    scenario: tapScenario('onFalse', [{ cycle: 3, action: 'schedule', command: 'spin', note: 'onFalse: falling edge, schedule Spin Rollers' }]),
  },
]

// --- Hard 6: default drive command vs. a held trigger ------------------------
const teleop: CommandDef = {
  id: 'teleop',
  name: 'Teleop Drive',
  requirements: ['drive'],
  priority: LOWEST_PRIORITY,
  repeatedly: true,
  body: [{ op: 'repeat', label: 'Teleop Drive', java: 'arcadeDrive(-driver.getLeftY(), -driver.getRightX());' }],
}
const aim: CommandDef = {
  id: 'aim',
  name: 'Aim at Hub',
  requirements: ['drive'],
  repeatedly: true,
  factory: 'drive.aimAtHub()',
  body: [{ op: 'repeat', label: 'Aim at Hub', java: 'turnToward(hubAngle());' }],
}
export const defaultDriveScenario: Scenario = scenario(
  [teleop, aim],
  [
    { cycle: 3, action: 'schedule', command: 'aim', note: 'Driver pulled RT: whileTrue schedules Aim at Hub' },
    { cycle: 7, action: 'cancel', command: 'aim', note: 'Driver let go of RT: whileTrue cancels Aim at Hub' },
  ],
  9,
  { mechanisms: MECHANISMS.map((m) => (m.id === 'drive' ? { ...m, defaultCommand: 'teleop' } : m)) },
)

export const easyControls: Challenge[] = [
  {
    id: 'easy-6-controller-map',
    kind: 'controller-map',
    title: 'Map the Controller',
    difficulty: 'easy',
    mode: 'controls',
    concepts: ['controllers', 'bindings'],
    objective: 'Match each line of robot code to the Xbox controller control it reads.',
    briefing: [
      'Robot code reads a driver\'s controller through a `CommandXboxController`. Port `0` is the first controller listed in the Driver Station.',
      'Each method names a control: `a()`, `leftBumper()`, `rightTrigger()`, `dpadUp()`, `menu()`. Methods like `getLeftY()` read how far a **stick** is pushed.',
      '2027 renamed a few controls from 2026 code: `povUp()` is now `dpadUp()`, `start()` is now `menu()`, and `back()` is now `view()`.',
    ],
    prompt:
      'For each line, pick the control the driver uses. Choose a line, then click the control on the controller (or use the dropdown).',
    code: `import org.wpilib.command3.button.CommandXboxController;

public class Robot extends OpModeRobot {
  private final Drive drive = new Drive();
  private final Intake intake = new Intake();
  private final Hopper hopper = new Hopper();
  private final Climber climber = new Climber();

  // Port 0: the first controller in the Driver Station
  private final CommandXboxController driver =
      new CommandXboxController(0);

  public Robot() {
    drive.setDefaultCommand(drive.teleop(
        () -> -driver.getLeftY(),    // forward and back
        () -> -driver.getRightX())); // turn

    driver.leftTrigger().whileTrue(intake.intakeFuel());
    driver.rightBumper().whileTrue(hopper.ferry());
    driver.y().whileTrue(intake.extend());
    driver.dpadUp().whileTrue(climber.climb());
    driver.menu().onTrue(drive.zeroGyro());
  }
}`,
    codeNote: CONTROLS_NOTE,
    rows: [
      { id: 'forward', code: '-driver.getLeftY()', purpose: 'Drive forward and back' },
      { id: 'turn', code: '-driver.getRightX()', purpose: 'Turn' },
      { id: 'intake', code: 'driver.leftTrigger().whileTrue(intake.intakeFuel())', purpose: 'Intake fuel' },
      { id: 'ferry', code: 'driver.rightBumper().whileTrue(hopper.ferry())', purpose: 'Ferry fuel' },
      { id: 'extend', code: 'driver.y().whileTrue(intake.extend())', purpose: 'Extend the intake' },
      { id: 'climb', code: 'driver.dpadUp().whileTrue(climber.climb())', purpose: 'Climb' },
      { id: 'zero', code: 'driver.menu().onTrue(drive.zeroGyro())', purpose: 'Reset field heading' },
    ],
    expected: { forward: 'leftStick', turn: 'rightStick', intake: 'leftTrigger', ferry: 'rightBumper', extend: 'y', climb: 'dpadUp', zero: 'menu' },
    hints: [
      'Bumpers are the buttons on the top edge of the controller. Triggers are the pull levers underneath them.',
      'getLeftY() and getRightX() read sticks. menu() is the button with three lines, just right of center.',
    ],
    why: 'The method name is the control: `leftTrigger()` is LT, `rightBumper()` is RB, `y()` is the Y button, `dpadUp()` is up on the D-pad, and `menu()` is the three-line button. `getLeftY()` reads the left stick pushed forward or back, and `getRightX()` reads the right stick pushed left or right, which is why many teams drive with the left stick and turn with the right.',
    successMessage: 'You can read a driver\'s controller from code.',
  },
  {
    id: 'easy-7-stick-math',
    kind: 'predict-output',
    title: 'Stick Math',
    difficulty: 'easy',
    mode: 'controls',
    concepts: ['controllers', 'java-basics'],
    objective: 'Predict joystick values: forward is negative, and a small deadband ignores stick drift.',
    briefing: [
      'Stick methods return a `double` from -1.0 to 1.0. For the Y axis, pushing the stick **forward gives a negative number** (back is positive). That is why drive code flips it: `-driver.getLeftY()`.',
      'Real sticks rarely rest at exactly 0. In 2027, `CommandXboxController` applies a **deadband** of 0.1 to each stick by default: any reading smaller than 0.1 comes back as `0.0`, so a drifting stick does not creep the robot.',
    ],
    prompt: 'The driver pushes the left stick all the way forward. The right stick is let go, but it drifts to 0.05. What does this code print?',
    code: `CommandXboxController driver = new CommandXboxController(0);

double forward = -driver.getLeftY();
double turn = driver.getRightX();

System.out.println("Forward: " + forward);
System.out.println("Turn: " + turn);`,
    codeNote: '`CommandXboxController`, `getLeftY()` and `getRightX()` are WPILib 2027 API. Its stick methods apply a 0.1 deadband by default (`setLeftYDeadband` and friends change it).',
    expectedOutput: ['Forward: 1.0', 'Turn: 0.0'],
    mistakes: [
      { output: ['Forward: -1.0', 'Turn: 0.0'], feedback: 'Fully forward reads -1.0, but the code negates it: `-(-1.0)` is `1.0`.' },
      { output: ['Forward: 1.0', 'Turn: 0.05'], feedback: 'Forward is right. 0.05 is inside the 0.1 deadband, so getRightX() returns 0.0.' },
      { output: ['Forward: -1.0', 'Turn: 0.05'], feedback: 'Two things: the code negates the forward reading, and 0.05 is inside the default 0.1 deadband.' },
      { output: ['Forward: 1', 'Turn: 0'], feedback: 'The values are right, but these are `double`s: Java prints them with a decimal point, like `1.0`.' },
    ],
    hints: ['Pushing a stick forward reads as a negative number. What does the minus sign in front of driver.getLeftY() do to it?', 'Is 0.05 bigger or smaller than the 0.1 deadband?'],
    why: 'Fully forward, `getLeftY()` returns -1.0 and `-(-1.0)` is 1.0, so the robot drives forward at full speed. The right stick reads 0.05, which is inside the default 0.1 deadband, so `getRightX()` returns 0.0 and the robot does not turn. Java prints a `double` with a decimal point, so `Forward: 1.0` and `Turn: 0.0`.',
    successMessage: 'Forward is negative, drift is ignored. Your robot drives straight.',
  },
]

export const mediumControls: Challenge[] = [
  {
    id: 'medium-6-hold-to-intake',
    kind: 'code-edit',
    title: 'Hold to Intake',
    difficulty: 'medium',
    mode: 'controls',
    concepts: ['bindings', 'controllers', 'debugging'],
    objective: 'Choose the trigger binding that ties a command to a held button.',
    briefing: [
      'A **binding** connects a button to a command. The common ones: `onTrue` starts the command when the button is pressed and lets it keep running. `whileTrue` starts it on the press and **cancels it on release**. `toggleOnTrue` starts it on one press and cancels it on the next press.',
      '`intake.intakeFuel()` is built with `runRepeatedly`, so it never finishes on its own. The WPILib docs recommend `whileTrue` for most operator controls: letting go of the button stops the robot.',
    ],
    prompt: 'Drivers report that the intake keeps spinning after they let go of the left trigger. Fix the binding so the intake runs only while the trigger is held.',
    prefix: `public class Robot extends OpModeRobot {
  private final Intake intake = new Intake();
  private final CommandXboxController driver =
      new CommandXboxController(0);

  public Robot() {
    // Run the intake ONLY while the driver holds the left trigger.
    driver.leftTrigger().`,
    initial: 'onTrue',
    suffix: `(intake.intakeFuel());
  }
}`,
    accepted: ['^whileTrue$', '^retryWhileTrue$'],
    mistakes: [
      { pattern: '^onTrue$', feedback: 'onTrue is the bug: it starts the intake on the press and never stops it.' },
      { pattern: '^toggleOnTrue$', feedback: 'toggleOnTrue keeps the intake running after release until the driver presses again. The goal is "only while held".' },
      { pattern: '^onFalse$', feedback: 'onFalse starts the command when the trigger is released, which is the opposite of what drivers want.' },
      { pattern: '^whileFalse$', feedback: 'whileFalse runs the command while the trigger is NOT pulled.' },
      { pattern: '^ifTrue$', feedback: 'ifTrue keeps scheduling the command while held, but does not cancel it on release.' },
    ],
    solution: 'whileTrue',
    codeNote: CONTROLS_NOTE,
    hints: ['Which binding cancels its command when the button is released?', 'The name describes the lifetime: the command runs while the trigger is true.'],
    why: '`whileTrue` schedules the command on the rising edge (trigger pulled past halfway) and cancels it on the falling edge (released). `onTrue` only reacts to the press, so a `runRepeatedly` command it starts runs until something else interrupts it. `retryWhileTrue` also stops on release, but it restarts the command if it ends while held; plain `whileTrue` is the usual choice.',
    successMessage: 'Let go, and the intake stops. Drivers will thank you.',
  },
  {
    id: 'medium-7-tap-the-button',
    kind: 'choice',
    title: 'Tap the Button',
    difficulty: 'medium',
    mode: 'controls',
    concepts: ['bindings', 'scheduler-cycles'],
    objective: 'Predict how onTrue, whileTrue, toggleOnTrue and onFalse respond to a quick tap.',
    briefing: [
      'Triggers are polled at the start of every scheduler cycle. A **rising edge** is the cycle the button goes from released to pressed; a **falling edge** is the cycle it goes back.',
      '`onTrue` acts on the rising edge. `onFalse` acts on the falling edge. `whileTrue` schedules on the rising edge and cancels on the falling edge. `toggleOnTrue` schedules on one rising edge and cancels on the next.',
    ],
    prompt:
      'The driver taps A: pressed in cycle 2, released in cycle 3, never pressed again. `intake.spin()` is a `runRepeatedly` command that never finishes on its own. With each binding below (one at a time), is Spin Rollers running after the driver lets go? Select every binding that leaves it running.',
    code: `public Command spin() {
  return runRepeatedly(() -> setSpeed(0.8))
      .named("Spin Rollers");
}`,
    codeNote: CONTROLS_NOTE,
    multiple: true,
    answerNoun: 'binding(s) that leave Spin Rollers running',
    options: tapOptions,
    correct: ['onTrue', 'toggleOnTrue', 'onFalse'],
    hints: ['Only one of these bindings stops the command when the button is released.', 'onFalse does nothing on the press. What does it do on the release?'],
    why: 'After a tap, `onTrue` and `toggleOnTrue` have started Spin Rollers and are waiting for nothing else (toggle would need a second press to cancel it). `onFalse` starts it on the release, so it is running too. Only `whileTrue` cancels it on the falling edge. Compare the timelines below the answer.',
    successMessage: 'You can predict every binding from its edges.',
  },
]

export const hardControls: Challenge[] = [
  {
    id: 'hard-6-aim-then-drive',
    kind: 'choice',
    title: 'Aim, Then Drive',
    difficulty: 'hard',
    mode: 'controls',
    concepts: ['default-commands', 'bindings', 'priority', 'interruption'],
    objective: 'Predict how a held-button command and a default drive command share the drivetrain.',
    briefing: [
      'A mechanism\'s **default command** runs whenever no other command requires it. Teleop driving is usually the drivetrain\'s default command, reading the sticks every cycle. The WPILib docs give it `Command.LOWEST_PRIORITY`.',
      'Any command with a higher or equal priority that requires the same mechanism interrupts it. When the mechanism is free again, the scheduler starts the default command again automatically in the scheduling phase.',
    ],
    prompt:
      'The driver holds the right trigger from cycle 3 through cycle 6 and lets go before cycle 7. `drive.aimAtHub()` requires Drive and has the default priority (0). Which describes the drivetrain? Lock in your prediction, then step the simulator.',
    code: `public class Drive implements Mechanism {
  public Drive(CommandXboxController driver) {
    setDefaultCommand(
        runRepeatedly(() -> arcadeDrive(
                -driver.getLeftY(), -driver.getRightX()))
            .withPriority(Command.LOWEST_PRIORITY)
            .named("Teleop Drive"));
  }

  public Command aimAtHub() {
    return runRepeatedly(() -> turnToward(hubAngle()))
        .named("Aim at Hub");
  }
}

// In the Robot constructor:
driver.rightTrigger().whileTrue(drive.aimAtHub());`,
    codeNote: `${CONTROLS_NOTE} \`setDefaultCommand\`, \`runRepeatedly\`, \`withPriority\` and \`Command.LOWEST_PRIORITY\` are WPILib API; \`arcadeDrive\`, \`turnToward\` and \`hubAngle\` are illustrative.`,
    scenario: defaultDriveScenario,
    predictFirst: true,
    options: [
      {
        id: 'a',
        label: 'Cycles 3 to 6: Aim at Hub owns Drive and Teleop Drive is interrupted. Cycle 7: Teleop Drive starts again on its own.',
        feedback: 'Correct. Priority 0 beats LOWEST_PRIORITY, and the default command comes back as soon as Drive is free.',
      },
      {
        id: 'b',
        label: 'Cycles 3 to 6: both commands run, so the driver can still steer while the robot aims.',
        feedback: 'Two commands can never require the same mechanism at once. Teleop Drive is interrupted while aiming.',
      },
      {
        id: 'c',
        label: 'Aim at Hub is rejected because Teleop Drive already owns Drive.',
        feedback: 'Rejection only happens to a lower-priority command. Teleop Drive has the lowest priority possible.',
      },
      {
        id: 'd',
        label: 'Cycle 7: nothing drives the robot until the driver presses another button.',
        feedback: 'Default commands are automatic: once Aim at Hub is canceled and Drive is idle, the scheduler starts Teleop Drive again in the same cycle.',
      },
    ],
    correct: ['a'],
    verify: (r) => {
      const owner = (cycle: number) => r.cycles[cycle - 1]?.owners.drive
      const aimed = [3, 4, 5, 6].every((c) => owner(c) === 'aim')
      return aimed && owner(7) === 'teleop' && owner(2) === 'teleop' ? ['a'] : ['?']
    },
    hints: ['Compare the priorities: 0 for Aim at Hub, LOWEST_PRIORITY for Teleop Drive.', 'What does the scheduler do for a mechanism that has a default command and no running command?'],
    why: 'In cycle 3 the trigger\'s rising edge schedules Aim at Hub. It requires Drive with priority 0, which beats Teleop Drive\'s LOWEST_PRIORITY, so Teleop Drive is interrupted and the sticks stop steering. In cycle 7 the falling edge cancels Aim at Hub; in the same scheduling phase the scheduler sees Drive is idle and queues its default command, so Teleop Drive is back immediately and the driver has control again.',
    successMessage: 'Aim on demand, drive by default. That is how real teleop code is built.',
  },
]
