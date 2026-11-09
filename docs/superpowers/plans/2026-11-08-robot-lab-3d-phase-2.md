# Robot Lab Phase 2 (Joystick + Editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose inline execution for this project). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Students drive the 3D robot live (an on-page controller, a gamepad or the keyboard), edit `RobotContainer.java` in a code-editor-style panel, deploy, and solve four fix-it missions.

**Architecture:**
- The code layer is pure TypeScript with no DOM: `labCode.ts` parses the editable regions into a `LabConfig`, `bindings.ts` polls triggers, `labSim.ts` runs headless, and `missions.ts` checks results.
- These parts feed the existing `CommandScheduler` through a new trigger-poll hook, and the `RobotWorld`, which is extended for teleop.
- React adds `LabEditor` (CodeMirror with several editable regions), `LabController` (pointer, gamepad and keyboard input) and a reworked `RobotLabPage`.

**Tech Stack:** TypeScript, React 19, CodeMirror 6, three.js (already present), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-robot-lab-3d-design.md`. Read "Phase 2 details", which is binding.

## Global Constraints
- Commands v3 names only. 2026 names appear only inside tips.
- The game reads only the editable regions and never evaluates Java.
- Everything under `src/game/robotLab/` stays free of DOM, React and three.js, and must import in plain Node (`tests/robotLab/nodeImport.test.ts`).
- Existing challenges keep their behavior. The full Vitest suite and both Playwright browsers stay green.
- Run `npm run supabase:sync` after changing shared game code. Nothing on the server imports the lab yet, so no redeploy is needed.
- No commits until the user asks. The user reviews locally first.

## Review Focus
1. **Keyboard driving while typing in the editor.** Typing WASD in `RobotContainer.java` must not drive the robot.
2. **Edge semantics at enable and deploy.** A button held while the robot is enabled must not fire `onTrue` until it's released and pressed again: the first poll seeds the previous state. Deploying mid-hold must not leave a `whileTrue` command running.
3. **Problems for half-typed lines.** A line that is missing `;` or `)`, or still has a v2 name, gets a specific message. It must never throw or deploy a partial config.
4. **Gamepad disconnects and pointers leaving the page.** Sticks return to center when the pointer is released outside the controller (pointer capture), and a gamepad that disappears gives zero input.
5. **Deterministic mission checks.** The same regions always give the same result, and the checks don't depend on frame rate.

---

### Task 1: Trigger-poll hook in the scheduler
**Files:** Modify `src/simulation/scheduler.ts` (`SchedulerOptions`, `step()` phase 3.1). Test `tests/simulation/pollTriggers.test.ts`.
**Produces:** `SchedulerOptions.pollTriggers?: (scheduler: CommandScheduler) => void`, called once per `step()` after the scenario events and before default commands, with `cycle` already advanced.
- [ ] Write tests:
  - `pollTriggers schedules a command in the same cycle it is polled`: it schedules `cmd` on cycle 3, and snapshot 3's `running` includes `cmd`.
  - `a polled command on a mechanism keeps its default command off`: the default doesn't run while the polled command is running.
  - `scenarios without pollTriggers are unchanged`: `simulate` of an existing scenario gives deep-equal results.
- [ ] RED, implement, GREEN. Then run the full suite.

### Task 2: Lab code parser
**Files:** Create `src/game/robotLab/labCode.ts`. Test `tests/robotLab/labCode.test.ts`.
**Produces:**
```ts
export type RegionId = 'driveRequirements' | 'defaultCommand' | 'bindings'
export type LabRegions = Record<RegionId, string>
export type LabCommandKey = 'runIntake' | 'push' | 'retract' | 'shootFuel'
export const LAB_COMMANDS: Record<LabCommandKey, { java: string; id: CommandId; name: string; requirements: LabMechanism[] }>
export type BindingKind = 'onTrue' | 'onFalse' | 'whileTrue' | 'toggleOnTrue'
export type AxisId = 'leftX' | 'leftY' | 'rightX' | 'rightY'
export interface AxisRef { axis: AxisId; sign: 1 | -1 }
export interface TeleopMapping { forward: AxisRef; strafe: AxisRef; turn: AxisRef }
export interface LabBinding { control: ControlId; kind: BindingKind; command: LabCommandKey; line: number }
export interface LabConfig { passDrivetrain: boolean; teleop: TeleopMapping | null; bindings: LabBinding[] }
export interface LabProblem { region: RegionId; line: number; message: string } // line is 1-based within the region
export function parseLabCode(regions: LabRegions): { config: LabConfig | null; problems: LabProblem[] } // config null iff problems.length > 0
export const FREE_PLAY_CODE: LabRegions
```
- The `LAB_COMMANDS` ids reuse `EVENT_IDS.intake` and `EVENT_IDS.extend`; add `'retract'` and `'shootFuel'`.
- The `driveRequirements` region is the last argument line of `configure`: `this::isRedAlliance` with an optional `, drivetrain`.
- `FREE_PLAY_CODE` is the correct code:
  - `driveRequirements`: `this::isRedAlliance, drivetrain`
  - `defaultCommand`: forward `-driver.getLeftY()`, strafe `-driver.getLeftX()`, turn `-driver.getRightX()`
  - bindings:
    - `driver.rightTrigger().whileTrue(intake.runIntakeCommand());`
    - `driver.leftBumper().onTrue(pushout.pushCommand());`
    - `driver.rightBumper().onTrue(pushout.retractCommand());`
    - `driver.a().whileTrue(shooter.shootFuelCommand());`
- [ ] Write tests:
  - `FREE_PLAY_CODE` parses to the expected config with no problems.
  - Whitespace and line breaks inside the default command are allowed.
  - An empty or fully commented `defaultCommand` gives `teleop: null`.
  - Blank lines and `//` comments are ignored in bindings.
  - The v2 names `povUp()`, `start()` and `back()` give the tip "`povUp()` is the 2026 name; Commands v3 uses `dpadUp()`" (each with its own pair).
  - `whenPressed`, `whileHeld` and `toggleWhenPressed` give "... is from older WPILib; Commands v3 uses `onTrue()`" (or `whileTrue()` / `toggleOnTrue()`).
  - An unknown command lists the four lab commands.
  - A missing `;` gives "Java statements end with a semicolon."
  - `teleopDrive(-driver.getLeftY(), ...)` without `() ->` gives "teleopDrive takes suppliers: write `() -> -driver.getLeftY()`, so it reads the stick every loop."
  - `driveRequirements` set to `this::isRedAlliance, shooter` gives a problem that names the drive mechanism.
  - An unparseable line gives "The lab doesn't understand this line." Problem lines are correct.
  - It never throws on any prefix of `FREE_PLAY_CODE` (a fuzz loop over substrings).
- [ ] RED, implement, GREEN.

### Task 3: Teleop world, lab scenario, trigger polling, headless runs
**Files:**
- Create `src/game/robotLab/bindings.ts` and `src/game/robotLab/labSim.ts`.
- Modify `src/game/robotLab/scenario.ts` and `world.ts`.
- Test `tests/robotLab/teleop.test.ts` and update `world.test.ts`.

**Produces:**
```ts
// scenario.ts
export type LabMode = 'auto' | 'teleop'
export function buildLabScenario(config: LabConfig, mode: LabMode): Scenario // auto = auto #7 with config.passDrivetrain; TeleopDrive default only if config.teleop; all LAB_COMMANDS defined in both modes; teleop maxCycles = 135 s
// bindings.ts
export interface LabInput { leftX: number; leftY: number; rightX: number; rightY: number; leftTrigger: number; rightTrigger: number; buttons: ReadonlySet<ControlId> }
export const NO_INPUT: LabInput
export function isPressed(input: LabInput, control: ControlId): boolean // triggers > 0.5
export function createTriggerPoller(bindings: LabBinding[], input: () => LabInput): (s: CommandScheduler) => void // first call seeds previous state (no edges)
// world.ts
export interface RobotWorldOptions { teleop?: TeleopMapping | null; input?: () => LabInput; startPose?: Pose }
constructor(setup: LabSetup, options?: RobotWorldOptions)
// labSim.ts
export function createLabSim(config: LabConfig, mode: LabMode, input: () => LabInput, startPose?: Pose): { scheduler: CommandScheduler; world: RobotWorld }
export function runLab(config, mode, script: (t: number) => LabInput, seconds: number, startPose?: Pose): { world: RobotWorld; samples: { t: number; state: { pose: Pose; intakeOn: boolean; shooterOn: boolean; scored: number } }[]; events: SchedulerEvent[] }
```
- **Teleop drive** (TeleopDrive running with no path target):
  - Apply a 0.1 deadband per axis, rescaled.
  - The field-relative velocity is (forward, strafe) × 5.03 m/s; ω is turn × 2π.
  - Integrate the pose, and clamp the center to 0.435 m inside the walls.
- **`retract`** drives the pushout toward 0.
- **`shootFuel`:** spinUp for 25 loops, then `repeat 'feed'`. It shoots every 8 loops while it runs and the hopper has fuel.
- **Shots** go along heading + π, with the distance set to the hub distance.
- [ ] Write tests:
  - Auto via `buildLabScenario(FREE_PLAY config, 'auto')` scores ≥ 20, and without drivetrain scores fewer. Record the exact values as rulings if they differ from phase 1's 32/8.
  - Holding the stick forward (leftY −1) for 1 s gives Δx > 3.
  - Inverted mapping gives Δx < −3.
  - Left (leftX −1) increases y.
  - A stick inside the deadband (0.05) doesn't move the robot.
  - The robot stays inside the walls.
  - `whileTrue` intake is on only while RT is held.
  - `onTrue` intake stays on after release.
  - `toggleOnTrue`: the first press starts it, the second stops it.
  - `onFalse` starts on release.
  - A held button at the first poll doesn't fire.
  - Shooting with the rear facing the hub from 2.5 m scores ≥ 3 in 3 s; facing away scores 0.
  - `runLab` is deterministic: two runs are deep-equal.
- [ ] RED, implement, GREEN. Update the phase 1 world and runner tests as needed, and ledger any score change.

### Task 4: Missions
**Files:** Create `src/game/robotLab/missions.ts`. Test `tests/robotLab/missions.test.ts`.
**Produces:**
```ts
export interface MissionResult { passed: boolean; message: string }
export interface LabMission { id: string; title: string; goal: string; story: string; mode: LabMode; start: LabRegions; solution: LabRegions; startPose?: Pose; check(config: LabConfig): MissionResult }
export const LAB_MISSIONS: LabMission[] // fix-auto, forward-backward, intake-wont-stop, add-shoot-button (spec order)
export function checkMission(m: LabMission, regions: LabRegions): MissionResult // parse problems → not passed, message names the first problem
```
| Mission | Check |
|---|---|
| fix-auto | auto scores ≥ 20 |
| forward-backward | stick forward 1 s gives Δx ≥ 1, and stick left gives Δy ≥ 1 |
| intake-wont-stop | RT held 1.0–2.0 s: intake off at 0.5 s, on at 1.5 s, off at 2.5 s |
| add-shoot-button | the first binding to shootFuel; hold its control 1.0–4.0 s from a pose whose rear faces the hub; ≥ 3 scored and shooter off at 5.0 s |

Failure messages say what the robot did and why, for example "Pushing forward moved the robot 3.0 m toward your driver station...".
- [ ] Write tests: each mission's `start` fails with its specific message, each `solution` passes, and a parse problem fails with that problem.
- [ ] RED, implement, GREEN. Run `npm run supabase:sync` and the full suite.

### Task 5: Live runner
**Files:** Rewrite `src/components/robotLab/useLabRunner.ts` and update `tests/robotLab/runner.test.ts`.
**Produces:**
```ts
export interface LabRunner {
  readonly state; readonly snapshot; readonly events; readonly scenario
  readonly config: LabConfig; readonly mode: LabMode; readonly enabled: boolean; readonly finished: boolean
  input: LabInput
  deploy(config: LabConfig): void
  setMode(mode: LabMode): void
  enable(): void
  disable(): void
  reset(): void
  setSpeed(s: LabSpeed): void
  advanceFrame(dt: number): number
  advance(seconds: number): void
}
export function createLabRunner(config: LabConfig, mode: LabMode, startPose?: Pose): LabRunner
export function useLabRunner(config, mode): { runner; version; refresh }
```
- `deploy`, `setMode` and `reset` rebuild a fresh sim and leave the robot disabled.
- `enable` on a finished sim rebuilds it first.
- `disable` stops stepping and cancels nothing.
- [ ] Tests:
  - `enable`, then `advance(1)` with the stick forward, moves the robot.
  - `disable` stops it.
  - `deploy` resets the pose and disables.
  - Auto mode runs auto #7 to the end.
  - Keep the phase 1 frame-backlog tests.

### Task 6: Code-editor panel
**Files:**
- Create `src/components/robotLab/LabEditor.tsx` and `src/components/robotLab/labFiles.ts`.
- Test `tests/robotLab/labFiles.test.ts`.

**Produces:**
- `labFiles.ts`:
  - `ROBOT_CONTAINER_TEMPLATE: { before: string; regions: [RegionId, string][] }`;
  - `buildRobotContainer(regions)`, which returns `{ doc, ranges: Record<RegionId, {from, to}> }`;
  - `regionLineToFileLine(regions, region, line)`;
  - `READ_ONLY_FILES: { path: string; code: string }[]`, with `Drivetrain.java`, `Intake.java`, `Pushout.java` and `Shooter.java`, each showing the command factories and their requirements.
- `<LabEditor regions onChange problems onDeploy deployDisabled dirty />`:
  - an explorer, a file tab, breadcrumbs `src › main › java › frc › robot`, and CodeMirror with `lineNumbers`;
  - read-only outside the regions, with a tinted background on the regions;
  - a Problems panel (count, with a click to jump to the line) and a status bar (Ln/Col, problem count, "Deploy" button).
- The editor stops key events from reaching window listeners, so typing doesn't drive (see Task 7).
- [ ] Tests:
  - the region ranges round-trip (`doc.slice(from, to) === region text`);
  - file lines map correctly.
  - The editor's behavior is covered in E2E (Task 8).

### Task 7: Controller input
**Files:**
- Create `src/components/robotLab/LabController.tsx` and `src/components/robotLab/input.ts`.
- Modify `ControllerDiagram.tsx` to export its `LAYOUT` as `CONTROLLER_LAYOUT` and `FACE_COLOR`.
- Test `tests/robotLab/input.test.ts`.

**Produces:**
- `input.ts`:
  - `mergeInputs(...inputs: LabInput[]): LabInput` (per axis the largest magnitude; buttons are the union);
  - `fromGamepad(gp: {axes: readonly number[]; buttons: readonly {pressed: boolean; value: number}[]} | null): LabInput` (standard mapping: axes 0–3; buttons 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT value, 7 RT value, 8 view, 9 menu, 12–15 dpad);
  - `fromKeys(keys: ReadonlySet<string>): LabInput`, using the spec's keyboard map. Keys are `KeyboardEvent.code`;
  - `isTypingTarget(el: EventTarget | null): boolean`, true inside `input`, `textarea`, `select`, `[contenteditable]` and `.cm-editor`.
- `<LabController input onPointerInput />`:
  - an SVG controller with the shared geometry and draggable sticks (pointer capture, back to center on release);
  - triggers and buttons held while the pointer is down;
  - a live display of the current merged input, and a key legend.
- [ ] Tests:
  - `fromGamepad` maps the standard layout, and `null` gives `NO_INPUT`;
  - `fromKeys` handles W, A, S, D, Q, E, Space, ShiftLeft and Digit1–Digit4;
  - `mergeInputs` keeps the larger magnitude;
  - `isTypingTarget` is true for a `.cm-editor` descendant (jsdom, or a plain object with `closest`).

### Task 8: Page
**Files:** Rewrite the layout of `src/pages/RobotLabPage.tsx`, and update `tests/e2e/robot-lab.spec.ts`.
- **Layout:**
  - On large screens, the 3D view sits on the left and the editor on the right. Below them go the Driver Station bar (the Mission select: Free play plus the four missions; Autonomous or Teleop; Enable and Disable; the clock, score and hopper) and the controller, then the ownership strip.
  - On narrow screens, everything stacks.
- **The mission panel** shows the story, the goal and "Check my code" (`checkMission` on the current regions). After three failed checks it shows "Show the fix", which loads the solution.
- **Live loop:** each animation frame it merges pointer, gamepad and keyboard input into `runner.input`, then calls `advanceFrame`.
- The keyboard listener ignores `isTypingTarget`, and releases all keys on blur.
- **Test hook:** `window.__robotLab` keeps `advance`, and adds `setInput(partial)` (dev and test only, `import.meta.env.DEV || MODE === 'test'`). This fixes phase 1's "test hook ships in production" minor.
- **Update the phase 1 E2E tests** to the new controls: the mission "Fix the auto" replaces the toggle.
- [ ] **New E2E tests** (Chromium and WebKit):
  - In free play teleop, enabling and holding W moves the robot (the clock and pose readout change).
  - Typing `w` in the editor doesn't move the robot.
  - Dragging the left stick up on the on-page controller moves the robot.
  - In the forward-backward mission, "Check my code" fails. Adding the minus, Deploy, then Check passes.
  - "Add a shoot button": type a binding in the editor, Deploy, and Check passes.
  - A line with `povUp()` shows the v3 tip in Problems and disables Deploy.
  - On a phone-width screen (390 px), nothing overflows horizontally.

### Task 9: Docs, sync, verification, review
- [ ] Add to `docs/commands-v3-behavior.md` under "Controllers and trigger bindings": how the lab polls triggers (the first poll seeds the previous state, and polling happens before default commands), citing `Trigger.java`.
- [ ] Run `npm run supabase:sync`, `npx tsc -b`, `npx vitest run`, `npx playwright test` and `npm run build`. Compare the entry chunk size with phase 1's 122 KB: the lab code must stay in the lazy chunk.
- [ ] Final whole-branch review by a fresh reviewer. Then one fix pass with RED→GREEN.
