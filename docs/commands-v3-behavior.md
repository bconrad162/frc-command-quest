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

## Default commands

- Queued during the scheduling phase for any mechanism with no running or
  pending command requiring it. Setting one does not start it immediately.
- Initially `idle()` (lowest priority). Should normally be lower priority than
  ordinary commands.

## Not modeled by the simulator

Triggers (other than "schedule at cycle N" / "cancel at cycle N" scenario
events), scopes beyond command scope, OpModes, sideloads, `StateMachine`,
`Command.sequence/parallel/race` group builders, exceptions
(`CompletedWithError`), disabled-mode mechanism safety, `withTimeout`,
`whenCanceled` hooks. Scenarios that would need these are not offered.
