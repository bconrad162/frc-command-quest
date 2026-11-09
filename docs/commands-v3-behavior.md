# Commands v3 behavior reference (verified)

This file records the WPILib Commands v3 behaviors that Command Quest's scheduler
simulator models, and where each was verified. The simulator (`src/simulation/`)
and its tests (`tests/simulation/`) are written against this list.

Verified on 2026-11-05 against:

- frc-docs `main`: `source/docs/software/commandbased/commands-v3/*.rst`
  (published at https://docs.wpilib.org/en/latest/docs/software/commandbased/commands-v3/)
- allwpilib `main`: `commandsv3/src/main/java/org/wpilib/command3/Scheduler.java`,
  `Coroutine.java`, `Command.java`, `SchedulerEvent.java`

The 2027 framework is still evolving. If the docs change, re-verify this list and
the tests in `tests/simulation/scheduler.test.ts`.

## API names used in the game

| Name | Kind | Source |
| --- | --- | --- |
| `org.wpilib.command3` | package | docs, source |
| `Mechanism` (interface), `run(coroutine -> ...)`, `runRepeatedly(...)`, `idle()` | mechanism builders | mechanisms.rst |
| `Command.noRequirements(...)`, `Command.requiring(...)` | static builders | creating-commands.rst, Command.java |
| `.named("...")` (required), `.withPriority(int)` | builder stages | creating-commands.rst, migration-guide.rst |
| `Command.DEFAULT_PRIORITY` (0), `LOWEST_PRIORITY`, `HIGHEST_PRIORITY` | constants | Command.java |
| `coroutine.yield()`, `wait(Time)`, `waitUntil(BooleanSupplier)`, `fork(...)`, `await(...)`, `awaitAll(...)`, `awaitAny(...)`, `park()` | coroutine | index.rst, Coroutine.java |
| `coroutine.setCancelOnForkFailure(boolean)` | coroutine | migration-guide.rst, Coroutine.java |
| `Scheduler.getDefault().schedule(cmd)`, `.cancel(cmd)`, `.run()` | scheduler | making-commands-run.rst, Scheduler.java |
| `setDefaultCommand(...)` | mechanism | mechanisms.rst |
| Events: `Scheduled`, `Mounted`, `Yielded`, `Completed`, `CompletedWithError`, `Canceled`, `Interrupted`, `ForkFailure` | `SchedulerEvent` | telemetry.rst, SchedulerEvent.java |

Mechanism methods such as `drive.followPath("ToPiece")`, `arm.raise()` or
`intake.intakeUntilPiece()` that appear in challenges are **illustrative team
code**, not WPILib API. The UI labels them as such.

## Scheduler cycle (`Scheduler.run()`)

1. Cleanup: cancel commands/bindings whose scope has exited.
2. Sideloads (periodic functions).
3. Scheduling: poll triggers -> queue default commands for idle mechanisms ->
   promote pending commands to running (evicting conflicting running commands).
4. Execution: run every running command **newest to oldest** until each yields
   or finishes. Running newest-first lets a parent resume in the same cycle an
   awaited child completes.

## Scheduling and conflicts

- `schedule()` called outside a running command puts the command in the
  **pending** set. It starts running when promoted in the next `run()`.
- At `schedule()` time, if the new command has **lower priority** than any
  conflicting running or pending command, it is rejected immediately
  (`LowerPriorityThanRunningCommand` / `LowerPriorityThanQueuedCommand`) and
  never starts.
- **Equal or higher** priority wins: the conflicting command is interrupted
  (`Interrupted` event, then `Canceled`). "Newly scheduled commands win ties."
- A pending command that conflicts with a newer, equal-or-higher-priority
  pending command is evicted (also `Interrupted` + `Canceled`).
- Scheduling a command instance that is already pending or running has no
  effect (it is not restarted).
- Priority is an `int`; default `0`. A child's effective priority is the max of
  its own priority and its ancestors' priorities.
- A child never conflicts with its own ancestors (it may share their
  requirements).

## Coroutines

- Cooperative: a command only gives up control at `yield()`, `wait()`,
  `waitUntil()`, `await()`, `awaitAll()`, `awaitAny()`, or `park()`.
- A command that never yields runs to completion in one mount ("one-shot").
- `wait()` resolution is the scheduler period (20 ms in a standard robot loop).
- `park()` pauses until the command is canceled.

## Fork, await, parent/child

- `fork(cmd)` schedules the child **and starts running it immediately** (inside
  the parent's turn, up to the child's first yield), then the parent continues
  with its next statement in the same cycle.
- `await(cmd)` schedules the child the same way, then pauses the parent until
  that child run is no longer running. If the child finishes without yielding,
  the parent continues immediately.
- When a parent **finishes or is canceled**, all of its still-running children
  are canceled ("children cannot outlive the parent's scope").
- A child **interrupted by an external command** cancels the entire
  composition (the root ancestor and every descendant).
- A child **interrupted by a sibling** (another child of the same parent):
  only the interrupted child and its descendants are canceled; the parent and
  other siblings keep running.
- Fork failure (child loses a priority conflict): by default
  (`setCancelOnForkFailure(true)`) the whole composition is canceled and a
  `ForkFailure` event is emitted. With `setCancelOnForkFailure(false)` the parent
  continues and can inspect the returned result.
  - Note: `making-commands-run.rst` says the parent "immediately continues"
    after a failed fork, while `migration-guide.rst` and `Coroutine.java` show
    the default is to cancel the composition. The simulator follows the source
    code and models the flag explicitly. No graded challenge depends on the
    default.

### Sequences

Verified 2026-11-08 against allwpilib `main` @ `645e1f8`
([`SequentialGroup.java`](https://github.com/wpilibsuite/allwpilib/blob/645e1f84a49b154066447a19c9cb7b1aee96806d/commandsv3/src/main/java/org/wpilib/command3/SequentialGroup.java)):

- `Command.sequence(...)` builds a `SequentialGroup` whose body is
  `for (command : commands) coroutine.await(command)`.
- Its requirements are the **union of every child's requirements, owned for the
  whole sequence**: "a mechanism owned by one command in the sequence, but not
  by a later one, will be *uncommanded* while that later command executes."
- Its priority is the highest priority of its children.

The simulator models a sequence as a command that requires that union and
`await`s each child in turn.

## Default commands

- Queued during the scheduling phase for any mechanism with no running or
  pending command requiring it. Setting one does not start it immediately.
- Initially `idle()` (lowest priority). Should normally be lower priority than
  ordinary commands.

## Controllers and trigger bindings

Verified on 2026-11-07 against allwpilib `main`:
`commandsv3/src/main/java/org/wpilib/command3/Trigger.java`, `BindingType.java`,
`commandsv3/src/generated/main/java/org/wpilib/command3/button/CommandXboxController.java`,
`button/CommandGamepad.java`, `button/CommandGenericHID.java`,
`wpilibj/src/generated/main/java/org/wpilib/driverstation/XboxController.java`,
`wpilibj/src/main/java/org/wpilib/driverstation/Gamepad.java`; and frc-docs
`commands-v3/triggers.rst` and `migration-guide.rst`.

- `org.wpilib.command3.button.CommandXboxController(int port)`. Button triggers:
  `a()`, `b()`, `x()`, `y()`, `leftBumper()`, `rightBumper()`, `leftStick()`,
  `rightStick()` (stick clicks), `view()`, `menu()`, `xbox()`, `dpadUp()`,
  `dpadDown()`, `dpadLeft()`, `dpadRight()`, `leftTrigger()`/`rightTrigger()`
  (true above 0.5, or a given threshold). Axes: `getLeftX/Y()`, `getRightX/Y()`,
  `getLeftTrigger()`, `getRightTrigger()`.
- Renamed from the 2026 (v2) `CommandXboxController`: `povUp/Down/Left/Right()`
  are `dpadUp/...()`, `start()` is `menu()`, `back()` is `view()`,
  `getLeft/RightTriggerAxis()` are `getLeft/RightTrigger()`. A generic
  `CommandGamepad` also exists (`faceDown()` etc.).
- Y axes: back is positive (`Gamepad.getLeftY()` Javadoc), so forward reads
  negative. `XboxController` applies a 0.1 deadband to each stick axis by default
  (0.01 for triggers); `setLeftYDeadband(...)` etc. change it.
- Bindings (`BindingType`): `onTrue` schedules on the rising edge; `onFalse` on the
  falling edge; `whileTrue` schedules on the rising edge and cancels on the
  falling edge (no restart); `toggleOnTrue` schedules on a rising edge and cancels
  on the next rising edge if still running; `retryWhileTrue` also restarts the
  command if it ends while high; `ifTrue` schedules on every high poll without
  canceling.
- Triggers are polled at the start of `Scheduler.run()`; the default drive
  command pattern is `setDefaultCommand(runRepeatedly(...).withPriority(Command.LOWEST_PRIORITY).named(...))`
  (migration-guide.rst).
- Docs discrepancy (2026-11-07): triggers.rst's "Advanced Controller Triggers"
  example says `getLeftY() > 0.5` means "pushed forward"; per the `Gamepad`
  Javadoc (back is positive) that condition is *back*. The game follows the
  Javadoc.

- First poll (`Trigger.poll()`, verified 2026-11-08 in the same `Trigger.java`):
  the previous signal starts as `null`, so the first poll counts as an edge. If
  the condition is high, rising-edge bindings fire; if it is low, falling-edge
  bindings (`onFalse`, `whileFalse`) fire. `toggleOnTrue` cancels when the command
  `isScheduledOrRunning`, otherwise schedules it. Other bindings exist beyond the
  lab's four: `ifTrue`, `whileFalse`, `retryWhileTrue`, `retryWhileFalse`,
  `toggleOnFalse`.

**Robot Lab trigger polling.** The lab polls the student's bindings through the
scheduler's `pollTriggers` hook, once per loop after scenario events and before
default commands, with the same edge rules. A real robot polls from boot,
while disabled; the lab only steps while enabled, so its first poll after
Enable or Deploy records each trigger's state without firing anything (as if
the robot had been sitting disabled). A button held through Enable therefore
does not fire `onTrue` until it is released and pressed again.

Disable cancels every running command that requires a mechanism: `Mechanism`
commands are canceled "when the robot enters a disabled mode" unless the
mechanism overrides `controllableDuringDisabled()` (default `false`;
`Mechanism.java`). Enabling autonomous again starts the auto over, as
`autonomousInit()` would schedule it again. One simplification: every binding
to the same factory (say, `intake.runIntakeCommand()`) shares one command in the
lab, while in Java each call creates its own command object.

In the simulator, a button press is a scenario event at the start of a cycle
(`schedule` for a rising-edge binding, `cancel` for `whileTrue`'s falling edge),
with an optional `note` shown in the event log.

## PathPlanner (Commands v3 community build)

The official PathPlanner `2027` branch still uses Commands v2. The lab teaches the
community v3 build: `JosephTLockwood/pathplanner`, branch
`new-path-2027-commands-v3` @ `43f3aa9`, vendordep PathplannerLib
`2027.0.0-alpha-7-commandsv3-2`, package `com.pathplanner.lib.command3`. It is
alpha and may change. Verified 2026-11-08:

- `AutoBuilder.configure(..., BooleanSupplier shouldFlipPath, Mechanism... driveRequirements)`.
  `driveRequirements` is **varargs**, so leaving out the drivetrain compiles; every
  path command it builds then requires nothing
  ([`AutoBuilder.java`](https://github.com/JosephTLockwood/pathplanner/blob/43f3aa9f9bb628a64788c10d9e4d3e2cb6d2fb6a/pathplannerlib/src/main/java/com/pathplanner/lib/command3/AutoBuilder.java)).
- `FollowPathCommand` requires exactly the mechanisms passed in. Its body forks
  an events command, then follows the path and yields each loop until the path
  is finished. The events command requires nothing; it forks each event-marker
  command as its own child, so all event commands are canceled when the path ends.
  The constructor **throws `IllegalArgumentException`** ("Events that are triggered
  during path following cannot require the drive mechanism") if an event command
  shares a requirement with the path
  ([`FollowPathCommand.java`](https://github.com/JosephTLockwood/pathplanner/blob/43f3aa9f9bb628a64788c10d9e4d3e2cb6d2fb6a/pathplannerlib/src/main/java/com/pathplanner/lib/command3/FollowPathCommand.java),
  [`EventScheduler.java`](https://github.com/JosephTLockwood/pathplanner/blob/43f3aa9f9bb628a64788c10d9e4d3e2cb6d2fb6a/pathplannerlib/src/main/java/com/pathplanner/lib/command3/EventScheduler.java)).
- **Zoned event markers** (a marker with `endWaypointRelativePos`) schedule their
  command at the zone start and **cancel it at the zone end**: the trajectory adds
  a `CancelCommandEvent` at the marker's end position. One-shot markers run until
  they finish or the path ends
  ([`PathPlannerTrajectory.java` L110-116](https://github.com/JosephTLockwood/pathplanner/blob/43f3aa9f9bb628a64788c10d9e4d3e2cb6d2fb6a/pathplannerlib/src/main/java/com/pathplanner/lib/trajectory/PathPlannerTrajectory.java#L110-L116)).
  The simulator models a zoned marker as a no-requirements wrapper that forks the
  event command and finishes when the zone ends, which cancels it.
- Autos build sequential parts with `Command.sequence(...)` (`CommandUtil.buildCommand`),
  and `PathPlannerAuto.requirements()` returns its inner command's requirements,
  so an auto owns the union of its paths' and named commands' requirements for
  its whole run (see "Sequences").
- `NamedCommands.getCommand(name)` returns the registered command itself (v3
  commands can be reused in several compositions). If nothing is registered
  under that name **when the auto is built**, it reports a warning and returns
  a command named "None" that does nothing
  ([`NamedCommands.java`](https://github.com/JosephTLockwood/pathplanner/blob/43f3aa9f9bb628a64788c10d9e4d3e2cb6d2fb6a/pathplannerlib/src/main/java/com/pathplanner/lib/command3/NamedCommands.java)).

## Not modeled by the simulator

Triggers (other than "schedule at cycle N" / "cancel at cycle N" scenario
events), scopes beyond command scope, OpModes, sideloads, `StateMachine`,
`Command.sequence/parallel/race` group builders, exceptions
(`CompletedWithError`), disabled-mode mechanism safety, `withTimeout`,
`whenCanceled` hooks. Scenarios that would need these are not offered.
