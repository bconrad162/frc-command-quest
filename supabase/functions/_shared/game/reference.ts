/** Concept reference entries. Plain-language summaries backed by the official Commands v3 docs. */
export interface ReferenceEntry {
  id: string
  term: string
  summary: string
  code?: string
  /** Precise detail from WPILib docs/source. */
  detail: string
  /** How Command Quest's simulator simplifies it (if at all). */
  simplified?: string
  docs: string
}

const DOCS = 'https://docs.wpilib.org/en/latest/docs/software/commandbased/commands-v3/'

export const REFERENCE: ReferenceEntry[] = [
  {
    id: 'command',
    term: 'Command',
    summary: 'A named piece of robot behavior, like "Intake Piece" or "Drive Forward". Its body is ordinary Java that runs top to bottom.',
    code: `public Command intakePiece() {
  return run(coroutine -> {
    setSpeed(0.75);
    coroutine.waitUntil(hasGamePiece);
    setSpeed(0);
  }).named("Intake Piece");
}`,
    detail: 'Every command has requirements, logic, and a name. The staged builders force all three: forgetting .named(...) is a compile error.',
    docs: `${DOCS}creating-commands.html`,
  },
  {
    id: 'mechanism',
    term: 'Mechanism',
    summary: 'A piece of robot hardware (drivetrain, arm, intake) that only one command may control at a time.',
    code: `public class Intake implements Mechanism {
  private final PWMSparkMax motor = new PWMSparkMax(1);
  public Command stop() {
    return runRepeatedly(() -> motor.set(0)).named("Stop Intake");
  }
}`,
    detail: 'Mechanism.run(...) and runRepeatedly(...) automatically require the mechanism. Keep motor fields private so every actuator change goes through a command.',
    docs: `${DOCS}mechanisms.html`,
  },
  {
    id: 'requirements',
    term: 'Requirements',
    summary: 'The list of mechanisms a command controls. Two running commands can never require the same mechanism.',
    detail: 'Use Command.requiring(a, b).executing(...) for several mechanisms, or Command.noRequirements(...) for commands that only coordinate other commands or change software state.',
    docs: `${DOCS}creating-commands.html`,
  },
  {
    id: 'scheduler',
    term: 'Scheduler',
    summary: 'The referee. Every 20 ms it decides which commands start, which stop, and gives every running command a turn.',
    detail:
      'Each Scheduler.run() has phases: cleanup, sideloads, scheduling (poll triggers, queue default commands, promote pending commands), then execution, newest command first.',
    simplified: 'The simulator models the scheduling and execution phases. Triggers are modeled as "schedule at cycle N" events; scopes beyond commands, sideloads and OpModes are not modeled.',
    docs: `${DOCS}how-it-works.html`,
  },
  {
    id: 'cycle',
    term: 'Scheduler cycle',
    summary: 'One call to Scheduler.run(), normally every 20 ms. "Cycle 5" means the fifth time the scheduler ran.',
    detail: 'coroutine.wait() has a resolution of one scheduler period: a 1 ms wait and a 19 ms wait both resume on a later cycle.',
    docs: `${DOCS}how-it-works.html`,
  },
  {
    id: 'scheduling-vs-execution',
    term: 'Scheduling vs execution',
    summary: '"Scheduled" means queued for consideration. "Running" means the command actually started. A scheduled command can still lose a priority conflict and never run.',
    detail: 'Commands scheduled from outside a command go into the pending set and are promoted in the next scheduling phase. A child forked or awaited from inside a command starts running immediately.',
    docs: `${DOCS}how-it-works.html`,
  },
  {
    id: 'coroutine',
    term: 'Coroutine',
    summary: 'The object passed into a command body that lets it pause and resume. It is how many commands share one thread.',
    detail: 'Coroutines are cooperative, not preemptive: a command only lets others run when it calls yield(), wait(), waitUntil(), await(), awaitAll(), awaitAny(), or park(). The Coroutine class only works with the command scheduler.',
    docs: `${DOCS}index.html`,
  },
  {
    id: 'yield',
    term: 'Yield',
    summary: 'coroutine.yield() means "pause here until my next turn". The next cycle resumes right after the yield.',
    code: `while (getDistance() < meters) {
  setSpeed(0.5);
  coroutine.yield(); // let other commands run
}`,
    detail: 'A while loop in command code without a yielding call is a compile error from the WPILib compiler plugin ("greedy loop").',
    docs: `${DOCS}creating-commands.html`,
  },
  {
    id: 'fork',
    term: 'Fork',
    summary: 'coroutine.fork(cmd) starts a child command and the parent keeps going right away. Use it for "meanwhile".',
    code: `coroutine.fork(arm.raise());       // arm rises in the background
coroutine.await(drive.followPath("ToScore"));`,
    detail: 'If the parent finishes or is canceled, its forked children are canceled too. By default a failed fork (child loses a priority conflict) cancels the composition; setCancelOnForkFailure(false) lets the parent handle it.',
    docs: `${DOCS}making-commands-run.html`,
  },
  {
    id: 'await',
    term: 'Await',
    summary: 'coroutine.await(cmd) starts a child command and the parent waits until it finishes. Use it for "and then".',
    detail: 'Awaiting a command object that is already running waits for that run. Awaiting one that already finished starts it again from the beginning.',
    docs: `${DOCS}making-commands-run.html`,
  },
  {
    id: 'parent-child',
    term: 'Parent and child commands',
    summary: 'Commands a command forks or awaits are its children. A parent that requires nothing still owns its children\'s mechanisms while they run.',
    detail: 'External interruption of a child cancels the whole composition. Interruption by a sibling cancels only that sibling. A child can share requirements with its parent without interrupting it.',
    docs: `${DOCS}creating-commands.html`,
  },
  {
    id: 'priority',
    term: 'Priority',
    summary: 'An integer (default 0). When commands conflict, equal or higher priority wins; lower priority is rejected.',
    code: `arm.run(...).withPriority(500).named("Medium Priority");`,
    detail: 'Command.LOWEST_PRIORITY and HIGHEST_PRIORITY are the int limits. Children inherit their parent\'s priority if it is higher than their own.',
    docs: `${DOCS}migration-guide.html`,
  },
  {
    id: 'interruption',
    term: 'Interruption',
    summary: 'A command is interrupted when another command takes one of its mechanisms. It stops immediately.',
    detail: 'The scheduler emits an Interrupted event (naming the interrupter), then a Canceled event.',
    docs: `${DOCS}telemetry.html`,
  },
  {
    id: 'cancellation',
    term: 'Cancellation',
    summary: 'Stopping a command before it finishes on its own: interrupted, canceled by code, or because its parent or scope ended.',
    code: `run(coroutine -> { ... })
  .whenCanceled(() -> roller.set(0))
  .named("Run Roller");`,
    detail: 'A canceled command stops where it was paused, so code after that point never runs. Use whenCanceled(...) for short cleanup.',
    simplified: 'The simulator shows cancellation but does not run whenCanceled cleanup code.',
    docs: `${DOCS}migration-guide.html`,
  },
  {
    id: 'default-command',
    term: 'Default command',
    summary: 'What a mechanism does when no other command is using it, like holding the arm still or stopping the intake.',
    detail: 'Setting one does not start it immediately; the scheduler queues it during the scheduling phase when the mechanism is idle. Default commands should usually have low priority.',
    docs: `${DOCS}mechanisms.html`,
  },
  {
    id: 'xbox-controller',
    term: 'CommandXboxController',
    summary: 'How robot code reads a driver\'s Xbox controller. Each button method returns a Trigger you can bind a command to; stick methods return numbers.',
    code: `import org.wpilib.command3.button.CommandXboxController;

// Port 0 is the first controller in the Driver Station.
CommandXboxController driver = new CommandXboxController(0);

driver.a().whileTrue(intake.intakeFuel());   // a button
double forward = -driver.getLeftY();          // a stick`,
    detail:
      'In 2027 it lives in org.wpilib.command3.button. Several names changed from 2026: povUp() is dpadUp(), start() is menu(), back() is view(), and getLeftTriggerAxis() is getLeftTrigger(). leftTrigger() is true when the trigger is pulled past 0.5 unless you pass a threshold. A generic CommandGamepad class also exists, with position names like faceDown().',
    docs: `${DOCS}triggers.html`,
  },
  {
    id: 'stick-axes',
    term: 'Stick axes and deadband',
    summary: 'Sticks read from -1.0 to 1.0. Pushing a stick forward gives a negative Y value, so drive code usually flips it. Tiny readings near the center are ignored.',
    code: `double forward = -driver.getLeftY();  // forward stick -> positive speed
double turn = -driver.getRightX();`,
    detail:
      'For the Y axes, back is positive. CommandXboxController applies a 0.1 deadband to each stick by default (setLeftYDeadband and friends change it), so a stick drifting to 0.05 reads as 0.0. Triggers read 0.0 to 1.0.',
    docs: 'https://github.wpilib.org/allwpilib/docs/beta/java/wpilib.command3/org/wpilib/command3/button/package-summary.html',
  },
  {
    id: 'trigger-bindings',
    term: 'Trigger bindings',
    summary: 'A binding connects a button (or any true/false condition) to a command. The binding decides when the command starts and stops.',
    code: `driver.leftTrigger().whileTrue(intake.intakeFuel()); // runs only while held
driver.menu().onTrue(drive.zeroGyro());              // starts on press, finishes on its own
driver.b().toggleOnTrue(shooter.spinUp());           // press to start, press again to stop`,
    detail:
      'onTrue schedules on the rising edge (pressed). onFalse schedules on the falling edge (released). whileTrue schedules on the rising edge and cancels on the falling edge. toggleOnTrue schedules on one rising edge and cancels on the next. retryWhileTrue is like whileTrue but restarts the command if it ends while held. The docs recommend whileTrue for most operator controls.',
    simplified: 'Button presses are modeled as scenario events that schedule or cancel a command at the start of a cycle.',
    docs: `${DOCS}triggers.html`,
  },
]
