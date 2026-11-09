# Robot Lab 3D, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lazy-loaded `#/robot-lab` page where team 5829's auto #7 runs on the real 2026 REBUILT field in 3D. The existing Commands v3 simulator drives it, the ownership strip and log are live, and a toggle shows `AutoBuilder.configure(...)` with and without `drivetrain`.

**Architecture:**
- **Pure TypeScript core in `src/game/robotLab/`:** PathPlanner path math, a `Scenario` for the auto, and a `RobotWorld` world model. It runs on the existing `CommandScheduler`, has no rendering, and is shareable with the Edge Function later.
- **Plain three.js renderer in `src/components/robotLab/`:** draws `RobotWorld` state and loads a field asset preprocessed at build time.
- **The page:** a React page that steps the scheduler at 50 Hz and renders the strip, log, controls, quality levels and a 2D fallback.

**Tech Stack:** React 19, TypeScript, Vite 8, three.js 0.170.x, @gltf-transform (build script only), meshoptimizer, Vitest, Playwright (Chromium and WebKit).

**Spec:** `docs/superpowers/specs/2026-11-08-robot-lab-3d-design.md` (phase 1 of its "Phases" section).

## Global Constraints

- Commands v3 only. No v2 names or imports in anything a student sees.
- PathPlanner names come from the community v3 build: package `com.pathplanner.lib.command3`, PathplannerLib `2027.0.0-alpha-7-commandsv3-2` (`JosephTLockwood/pathplanner`). The page says it's a community build that may change.
- Scheduler behavior comes only from `src/simulation/scheduler.ts`. Don't hand-write scheduler logic in the lab; the spike's mini scheduler is not reused.
- `src/game/robotLab/**` must not import three.js, React or the DOM. The Edge Function will import it later.
- The lab route loads with `lazyPage` (`src/lib/lazyPage.ts`). three.js and the field asset load only on that route.
- Field asset credits: keep the BSD 3-clause notice from `Mechanical-Advantage/AdvantageScopeAssets` (copyright Littleton Robotics) next to the processed asset and on the Reference page. Credit FIRST for the field design. Don't imply 6328 endorses the project.
- Team data comes from `github.com/awtybots/2026Rebuilt` `main` @ `031ea9b`, with a note on where it came from.
- Field ↔ three.js: `(x, y, z) → (L/2 − x, z, y − W/2)` and heading `θ → θ + π`. L = 16.541 m, W = 8.069 m.
- Blue hub center: (4.626, 4.030) m (team `Constants.blueHubPose`).
- Existing tests must keep passing.
- **No commits or pushes.** The user reviews the result locally before anything goes to GitHub, so where this skill would commit, run the task's tests instead.

## Review Focus

1. **The page is opened on a machine without WebGL, or where WebGL fails.** Expect the 2D fallback with a working strip, log and Run button, never a blank page or the error boundary. Test: Task 6, "falls back to 2D when WebGL is unavailable".
2. **Run is clicked again mid-auto, or the toggle changes mid-run.** Expect a clean restart from the start pose, with no leftover balls, fuel or owners. Test: Task 4, "a fresh scheduler and world reset everything", and Task 6, "toggling mid-run restarts".
3. **The tab is hidden and comes back, or the frame rate drops sharply.** Expect the sim to stay at a capped step rate rather than jumping hundreds of loops. Test: Task 6, the stepper caps catch-up at 5 loops per frame.
4. **The field asset 404s.** For example, an old tab across a deploy, the same bug as the Reference page. Expect the 2D fallback with a message, not a stuck loading bar. Test: Task 6, "shows 2D fallback when the field model fails to load".
5. **The page is narrow, a phone or a small window.** Expect the panels to stack with no horizontal scroll, and the strip to stay readable. Test: Task 6 E2E at 390×844.

---

### Task 1: Pin the v3 facts the auto model depends on

**Files:**
- Modify: `docs/commands-v3-behavior.md` (new section "PathPlanner (Commands v3 community build)", plus "Sequences" under "Fork, await, parent/child")

**Interfaces:**
- Produces: written, sourced answers that Task 4 encodes:
  - (a) what `Command.sequence(...)` requires (the union of its children, held for the whole sequence?);
  - (b) what fork `PathPlannerAuto.requirements()` returns;
  - (c) `AutoBuilder.configure(..., Mechanism... driveRequirements)` is varargs;
  - (d) `FollowPathCommand` requires exactly `driveRequirements`, forks event commands, cancels them when the path ends, and throws if an event command requires a drive mechanism.

- [ ] **Step 1:** Read the sequence builder in allwpilib `main` (`commandsv3/src/main/java/org/wpilib/command3/`, `Command.sequence` and its group class) and note the requirements logic, with a permalink.
- [ ] **Step 2:** Read the fork's `pathplannerlib/src/main/java/com/pathplanner/lib/command3/{AutoBuilder,FollowPathCommand,PathPlannerAuto,CommandUtil}.java` on branch `new-path-2027-commands-v3`, and note (b) through (d) with permalinks.
- [ ] **Step 3:** Write both sections in the doc's existing style ("verified against … on 2026-11-08").
- [ ] **Step 4:** If (a) is *not* "the union held for the whole sequence", stop and record that Task 4's `auto` requirements must follow the real rule. Task 4's tests then change to match.

### Task 2: Field asset pipeline

**Files:**
- Create: `scripts/build-field-asset.ts`
- Create: `public/models/field-2026.glb` (output)
- Create: `public/models/LICENSE-AdvantageScopeAssets.txt` (copied verbatim from the assets repo)
- Create: `src/game/robotLab/fieldFuel.json` (output)
- Modify: `package.json`: add the script `"assets:field": "tsx scripts/build-field-asset.ts"`, and devDependencies `@gltf-transform/core`, `@gltf-transform/functions`, `meshoptimizer`
- Modify: `.gitignore`: add `.superpowers/` and `.cache/`
- Test: `tests/robotLab/fieldAsset.test.ts`

**Interfaces:**
- Produces:
  - `public/models/field-2026.glb`: meshopt-compressed, with fuel removed. Served at `${import.meta.env.BASE_URL}models/field-2026.glb`.
  - `src/game/robotLab/fieldFuel.json`: `{ x: number; y: number; z: number }[]` in the field frame (meters, blue origin, z up).

- [ ] **Step 1: Write the failing test**

```ts
import fuel from '../../src/game/robotLab/fieldFuel.json'
import { statSync } from 'node:fs'
test('fuel positions are on the field', () => {
  expect(fuel.length).toBeGreaterThanOrEqual(400)
  expect(fuel.length).toBeLessThanOrEqual(460)
  for (const f of fuel) { expect(f.x).toBeGreaterThan(-0.1); expect(f.x).toBeLessThan(16.65); expect(f.y).toBeGreaterThan(-0.1); expect(f.y).toBeLessThan(8.17) }
})
test('the blue depot holds fuel', () => {
  const inDepot = fuel.filter((f) => f.x < 0.75 && f.y > 5.4 && f.y < 6.55)
  expect(inDepot.length).toBeGreaterThanOrEqual(20)
})
test('the processed field is small enough to load on school Wi-Fi', () => {
  expect(statSync('public/models/field-2026.glb').size).toBeLessThan(6_000_000)
})
```

- [ ] **Step 2:** Run `npx vitest run tests/robotLab/fieldAsset.test.ts`. Expected: FAIL (the JSON module is missing).
- [ ] **Step 3: Implement `scripts/build-field-asset.ts`.**
  - **Source:** the first that exists of `$ADVANTAGESCOPE_FIELD_GLB`, `~/.config/AdvantageScope/autoAssets/Field3d_2026FRCFieldV1/model.glb`, or a download of `Field3d_2026FRCFieldV1.zip` from the `archive-v1` release of `Mechanical-Advantage/AdvantageScopeAssets` into `.cache/`.
  - **Fuel:** a node is a fuel root when its name matches `/Fuel/i` and no ancestor's name does. For each root, compute the world-space bounds center, then convert to field coordinates with the inverse of the Global Constraints mapping: `x = L/2 − X`, `y = Z + W/2`, `z = Y`. Write the JSON, then remove the fuel nodes.
  - **Materials:** override them (the CAD marks everything metallic 1, roughness 0.21):
    - light grays (r≈g≈b, r > 0.3) → metallic 0.55, roughness 0.42;
    - everything else → metallic 0.05, roughness 0.72;
    - alpha < 1 → `BLEND`, metallic 0, roughness 0.1.
  - **Optimize:** `flatten()`, `join()`, `weld()`, `dedup()`, `prune()`, then the `meshopt` encoder.
  - Print the output size, mesh count and fuel count.
- [ ] **Step 4:** Run `npm run assets:field`, then `npx vitest run tests/robotLab/fieldAsset.test.ts`. Expected: PASS. The script prints fewer than 100 meshes.

### Task 3: Team 5829 data and PathPlanner path math

**Files:**
- Create: `src/game/robotLab/team5829/` containing:
  - `Straight Back.path`, `Depot and shoot from Hub Shoot.path`, `#7 - Straight Back Depot - Chandak.auto` and `settings.json`, copied verbatim from `awtybots/2026Rebuilt` `main` @ `031ea9b` `src/main/deploy/pathplanner/`;
  - `README.md` stating that source.
- Create: `src/game/robotLab/pathplanner.ts`
- Test: `tests/robotLab/pathplanner.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PathFile {            // PathPlanner 2025.0 .path JSON (subset used)
  waypoints: { anchor: XY; prevControl: XY | null; nextControl: XY | null }[]
  rotationTargets: { waypointRelativePos: number; rotationDegrees: number }[]
  eventMarkers: { name: string; waypointRelativePos: number }[]
  globalConstraints: { maxVelocity: number; maxAcceleration: number }
  idealStartingState: { rotation: number }
  goalEndState: { rotation: number }
}
export interface XY { x: number; y: number }
export interface Pose { x: number; y: number; theta: number }          // field frame, radians
export interface PoseSample extends Pose { vx: number; vy: number; omega: number } // field-relative m/s, rad/s
export interface Trajectory { name: string; totalTime: number; sample(t: number): PoseSample; events: { name: string; time: number }[] }
export function buildTrajectory(name: string, file: PathFile): Trajectory
export const TEAM_PATHS: Record<string, Trajectory>   // keyed by path name, built from the copied files
```

- [ ] **Step 1: Write failing tests**

```ts
const sb = TEAM_PATHS['Straight Back'], depot = TEAM_PATHS['Depot and shoot from Hub Shoot']
test('starts and ends on the anchors with the planned headings', () => {
  expect(sb.sample(0)).toMatchObject({ x: expect.closeTo(3.5345, 3), y: expect.closeTo(4.0156, 3) })
  expect(sb.sample(0).theta).toBeCloseTo(Math.PI, 3)
  const end = depot.sample(depot.totalTime)
  expect(end.x).toBeCloseTo(2.0319, 2); expect(end.y).toBeCloseTo(5.6291, 2)
  expect(end.theta).toBeCloseTo(148.011 * Math.PI / 180, 2)
})
test('trapezoid timing: 1 m/s and 1 m/s² over the Straight Back length', () => {
  expect(sb.totalTime).toBeGreaterThan(2.55); expect(sb.totalTime).toBeLessThan(2.75)
})
test('event markers become times inside the path', () => {
  expect(depot.events.map((e) => e.name)).toEqual(['extend', 'intake'])
  expect(depot.events[0].time).toBe(0)
  expect(depot.events[1].time).toBeGreaterThan(0); expect(depot.events[1].time).toBeLessThan(depot.totalTime)
})
test('never exceeds the path max velocity', () => {
  for (let t = 0; t < depot.totalTime; t += 0.02) { const s = depot.sample(t); expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(3.5 + 1e-6) }
})
```

- [ ] **Step 2:** Run `npx vitest run tests/robotLab/pathplanner.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Shape:** each segment is a cubic Bézier: anchor i, nextControl i, prevControl i+1, anchor i+1. Sample at 80 steps per segment, with arc length accumulated along the way.
  - **Speed:** a trapezoidal profile from `maxVelocity` and `maxAcceleration`, using a triangle profile when the path is too short to reach max speed.
  - **Heading:** interpolate by waypoint-relative position, shortest way round, through the keys `[0, idealStartingState]`, then the `rotationTargets`, then `[n−1, goalEndState]`.
  - **Velocity:** the central difference of pose over 0.02 s.
  - **Load the files** with `import.meta.glob('./team5829/*.path', { eager: true, import: 'default', query: '?raw' })` and parse them with `JSON.parse`. Vite needs `?raw` because the file extension isn't `.json`.
- [ ] **Step 4:** Run the same command. Expected: PASS.

### Task 4: Auto scenario and the `RobotWorld` world model

**Files:**
- Create: `src/game/robotLab/scenario.ts`
- Create: `src/game/robotLab/world.ts`
- Test: `tests/robotLab/world.test.ts`

**Interfaces:**
- Consumes: `TEAM_PATHS`, `Trajectory`, `Pose` (Task 3); `fieldFuel.json` (Task 2); and from `src/simulation/*`: `Scenario`, `CommandDef`, `WorldModel`, `SchedulerView`, `CommandScheduler`, `LOWEST_PRIORITY`, `CYCLE_SECONDS`.
- Produces:

```ts
// scenario.ts
export const LAB_MECHANISMS = ['drivetrain', 'pushout', 'intake', 'shooter'] as const
export type LabMechanism = (typeof LAB_MECHANISMS)[number]
export interface LabSetup { passDrivetrain: boolean }
export const AUTO_ID = 'auto'                       // PathPlannerAuto("#7 - Straight Back Depot")
export const TELEOP_ID = 'teleopDrive'              // drivetrain default, LOWEST_PRIORITY, runRepeatedly, label 'teleop'
export const pathId = (name: string) => `path:${name}` // FollowPathCommand("<name>"), work label `follow:<name>`
export const SHOOT_IDS = ['shootPreload', 'controlAllShooting'] as const // NamedCommands; require shooter
export const EVENT_IDS = { extend: 'extend', intake: 'intake' } as const // require pushout / intake; runRepeatedly
export const START_POSE: Pose                        // Straight Back start, theta = π
export function buildAutoScenario(setup: LabSetup): Scenario // schedules AUTO_ID at cycle 1 (note "Autonomous enabled")

// world.ts
export interface Ball { x: number; y: number; z: number; vx: number; vy: number; vz: number; scored: boolean }
export interface RobotState {
  cycle: number
  pose: Pose
  velocity: { vx: number; vy: number; omega: number }  // robot-relative, for module angles
  ghost: Pose | null                                   // where the running path wants the robot
  driveConflict: boolean                               // a path command and TeleopDrive both wrote drive this loop
  pushout: number                                      // 0 (in) .. 0.26 m (out), 1.3 m/s
  intakeOn: boolean
  shooterOn: boolean
  hopper: number                                       // starts at 8 (preload)
  scored: number
  fuelTaken: boolean[]                                 // parallel to fieldFuel.json
  balls: Ball[]
}
export class RobotWorld implements WorldModel {
  constructor(setup: LabSetup)
  readonly state: RobotState
  afterCycle(view: SchedulerView): void
  signal(name: string, view: SchedulerView): boolean | undefined // 'hopperEmpty'
}
```

- **Scenario shape:**
  - `auto` requires `['drivetrain', 'shooter']` when `passDrivetrain`, otherwise `['shooter']`. That's what Task 1(a) is expected to confirm; follow Task 1 if it says otherwise. Its body: `await` each of path 1, `shootPreload`, path 2 and `controlAllShooting`.
  - Each path command requires `['drivetrain']` or `[]`. Its body is `work` segments labeled `follow:<name>`, split at event times, with `fork` of each event command at its time. The cycle count is `Math.round(time / CYCLE_SECONDS)`; skip zero-length work.
  - Each shoot command's body: `work 'spinUp'` for 25 cycles, then `waitUntil 'hopperEmpty'`.
  - Mechanism names shown to students: `drivetrain`, `pushout`, `intake` and `shooter`, matching team 5829's `drivebase`, `m_pushout`, `m_intake` and `m_shooter`.
- **What `RobotWorld` does each `afterCycle`:**
  - **Path:** a running path's clock advances 0.02 s per cycle while it runs, and resets when it doesn't. Its target is `trajectory.sample(clock)`, and `ghost` is that target.
  - **No conflict** (path running, TeleopDrive not running): the pose snaps to the target.
  - **Conflict** (both running): the pose doesn't move. `velocity` alternates each cycle between the target's robot-relative velocity and 2% of it, so the modules flick. `driveConflict` is true.
  - **Intake:** `pushout` moves toward 0.26 while `extend` runs. While `intake` runs and pushout > 0.2, the robot takes every untaken fuel within 0.42 m (x and y only) of the intake point, which is 0.48 m ahead of the robot center, with z < 0.35. Each one adds 1 to `hopper`.
  - **Shooting:** while a shoot command is running and 25 cycles past its start, fire one ball every 8 cycles while `hopper > 0`. The ball launches from robot-local (−0.42, 0, 0.62), aims at the hub center at z 1.55, with flight time `0.45 + 0.22 × distance`, and gravity is 9.81.
  - **Scoring:** a ball counts once when it's descending below z 1.6 within ±0.53 m of the hub center.
  - **Bounce:** a ball reaching z 0.075 bounces (vz × −0.35, horizontal speed × 0.7).
  - All of this is deterministic: no `Math.random`.

- [ ] **Step 1: Write failing tests**

```ts
function run(passDrivetrain: boolean, seconds = 14) {
  const world = new RobotWorld({ passDrivetrain })
  const s = new CommandScheduler(buildAutoScenario({ passDrivetrain }), { world })
  const snaps = []; for (let i = 0; i < seconds / 0.02; i++) snaps.push(s.step())
  return { world, snaps, s }
}
test('with drivetrain: the auto owns the drivetrain and ends at the depot shot', () => {
  const { world, snaps } = run(true)
  expect(snaps[2].owners.drivetrain).toBe(AUTO_ID)
  expect(world.state.pose.x).toBeCloseTo(2.032, 1); expect(world.state.pose.y).toBeCloseTo(5.629, 1)
  expect(world.state.scored).toBeGreaterThanOrEqual(8 + 20)
  expect(world.state.hopper).toBe(0)
})
test('forgot drivetrain: TeleopDrive keeps it, the robot twitches in place and picks up nothing', () => {
  const { world, snaps } = run(false)
  expect(snaps[2].owners.drivetrain).toBe(TELEOP_ID)
  expect(Math.hypot(world.state.pose.x - START_POSE.x, world.state.pose.y - START_POSE.y)).toBeLessThan(0.05)
  expect(world.state.fuelTaken.filter(Boolean)).toHaveLength(0)
})
test('the conflict is visible while the path runs', () => {
  const world = new RobotWorld({ passDrivetrain: false })
  const s = new CommandScheduler(buildAutoScenario({ passDrivetrain: false }), { world })
  for (let i = 0; i < 30; i++) s.step()
  expect(world.state.driveConflict).toBe(true); expect(world.state.ghost).not.toBeNull()
})
test('event commands are canceled when the depot path ends', () => { /* step until path 2 completes; expect isRunning('intake') false and outcomes.intake.status 'canceled' */ })
test('runs are deterministic', () => { expect(run(true).world.state).toEqual(run(true).world.state) })
test('a fresh scheduler and world reset everything', () => { const a = run(true, 3).world; const b = new RobotWorld({ passDrivetrain: true }); expect(b.state.balls).toEqual([]); expect(b.state.hopper).toBe(8); expect(a).not.toBe(b) })
```

- [ ] **Step 2:** Run `npx vitest run tests/robotLab/world.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `scenario.ts` and `world.ts` to the shapes above.
- [ ] **Step 4:** Run it again. Expected: PASS. Then run `npx vitest run`. Expected: all existing tests still PASS.

### Task 5: three.js renderer

**Files:**
- Modify: `package.json`: dependencies `three@^0.170.0`, devDependency `@types/three@^0.170.0`
- Create:
  - `src/components/robotLab/coords.ts`
  - `src/components/robotLab/robotModel.ts`
  - `src/components/robotLab/RobotScene.ts`
- Test: `tests/robotLab/coords.test.ts`

**Interfaces:**
- Consumes: `RobotState`, `Pose`, `TEAM_PATHS`, `fieldFuel.json`, `HUB` (export `HUB = { x: 4.626, y: 4.03, half: 0.53 }` from `world.ts`).
- Produces:

```ts
// coords.ts
export const FIELD_L = 16.541, FIELD_W = 8.069
export function toThree(x: number, y: number, z?: number): THREE.Vector3
export function yawOf(theta: number): number
// RobotScene.ts
export type Quality = 'full' | 'light'
export type CameraPreset = 'field' | 'chase' | 'driver' | 'top'
export class RobotScene {
  constructor(canvas: HTMLCanvasElement, quality: Quality)
  load(url: string, onProgress: (fraction: number) => void): Promise<void> // rejects on 404/parse error
  setQuality(q: Quality): void
  setCamera(p: CameraPreset, reducedMotion: boolean): void
  render(state: RobotState, dt: number): void   // draws robot, ghost, path lines, hopper fill, balls, field fuel (instanced), hub flash
  resize(w: number, h: number): void
  dispose(): void
}
```

- **The robot** matches the spike (`.superpowers/brainstorm/2917112-1794173730/content/robot-scene-spike.html`, `buildRobot`):
  - 0.87 m with bumpers, 5829 bumper numbers, swerve modules at ±0.2937 m with wheel radius 0.0381 m;
  - hopper, rear shooter with two flywheels, front pushout with rollers, LEDs (conflict → fault red, running → go green, idle → signal cyan).
- **Load** with `GLTFLoader` and `MeshoptDecoder` (`three/examples/jsm/libs/meshopt_decoder.module.js`).
- **Quality `full`:** PCF soft shadows with a 2048 map, `RoomEnvironment` env, pixel ratio up to 2, fog.
- **Quality `light`:** no shadows, pixel ratio 1, hemisphere and directional light only, no fog.
- **`reducedMotion`:** camera changes jump straight to the new view, and the chase camera doesn't ease.

- [ ] **Step 1: Write a failing test.** AprilTag 26 (WPILib field (4.022, 4.035)) must map onto the model's tag 26 position. From AdvantageScope's config that's config (4.249, 0), which in three.js is (4.249, z, 0.0 ± 0.01).

```ts
test('AprilTag 26 lands on the model', () => { const v = toThree(4.022, 4.035, 1.124); expect(v.x).toBeCloseTo(4.249, 2); expect(v.z).toBeCloseTo(0, 1); expect(v.y).toBeCloseTo(1.124, 3) })
test('heading 0 faces red (three −x)', () => { expect(Math.cos(yawOf(0))).toBeCloseTo(-1) })
```

- [ ] **Step 2:** Run `npx vitest run tests/robotLab/coords.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `coords.ts`, `robotModel.ts` and `RobotScene.ts`.
- [ ] **Step 4:** Run the test, then `npx tsc -b`. Expected: PASS, no type errors.

### Task 6: The Robot Lab page

**Files:**
- Create:
  - `src/pages/RobotLabPage.tsx`
  - `src/components/robotLab/OwnershipStrip.tsx`
  - `src/components/robotLab/FieldMap2D.tsx` (2D fallback)
  - `src/components/robotLab/useLabRunner.ts`
- Modify:
  - `src/App.tsx`: route `robot-lab` → `lazyPage(() => import('./pages/RobotLabPage.tsx'))`
  - `src/components/AppShell.tsx`: nav link "Robot Lab"
  - `src/pages/ReferencePage.tsx`: a "Credits" section with the BSD notice for the field model, FIRST for the field design, and team 5829's paths
- Test: `tests/e2e/robot-lab.spec.ts`, `tests/robotLab/runner.test.ts`

**Interfaces:**
- Consumes: Tasks 3 to 5.
- Produces:

```ts
// useLabRunner.ts: owns one CommandScheduler + RobotWorld; framework-agnostic core plus a React hook
export interface LabRunner {
  readonly state: RobotState
  readonly snapshot: CycleSnapshot | null
  readonly events: SchedulerEvent[]
  setup: LabSetup
  run(): void            // new scheduler + world from setup, starts stepping
  reset(): void          // new scheduler + world, not stepping
  setSpeed(s: 1 | 0.5 | 0.25): void
  advanceFrame(dtSeconds: number): void  // steps floor((acc + dt*speed)/0.02) cycles, capped at 5 per call
  advance(seconds: number): void          // test hook: steps exactly seconds/0.02 cycles
}
export function createLabRunner(setup: LabSetup): LabRunner
export function useLabRunner(): LabRunner & { version: number } // re-renders at most every animation frame
```

**Page contents:**
- **Header:** "Auto #7: Straight Back Depot" and "Team 5829's real PathPlanner auto on the 2026 REBUILT field".
- **A two-button toggle:** "Passes drivetrain" / "Forgot drivetrain". It restarts the run.
- **Read-only code (`CodeView`)** for the `AutoBuilder.configure` call, exactly as the spike shows it in both modes, with the package comment `// com.pathplanner.lib.command3`.
- **Buttons:** Run auto, Reset, speeds 1× ½× ¼×, cameras Field / Follow robot / Driver station / Top down, quality Auto / Full / Light.
- **A "Community PathPlanner build"** note with the pinned version.
- **`OwnershipStrip`:** one lane per `LAB_MECHANISMS` entry with chips:
  - owner `auto` while the current child uses that mechanism → "PathPlannerAuto › <child name>";
  - owner `auto` otherwise → "PathPlannerAuto (reserved for a later step)";
  - event commands → their name with "(event)";
  - TeleopDrive → "TeleopDrive (default)";
  - none → "free";
  - when `driveConflict` → an extra chip, "FollowPathCommand is also calling drive() (requires nothing)", that doesn't rely on color alone (an icon plus text).

  Its log lists the last 7 scheduler events, using `describeEvent` from `src/components/scheduler/describe.ts`, plus world notes. Use `aria-live="polite"` on a visually hidden one-line summary that updates only when ownership changes.
- **Quality `Auto`:** start `full`, measure the mean frame time over frames 30 to 120, switch to `light` if it's over 24 ms, and show the 2D fallback if `light` is still over 40 ms. Store the student's choice in `localStorage`, wrapped in try/catch. Honor a `?quality=light|full|2d` query in the hash URL (used by the E2E tests).
- **Fallback:** if `canvas.getContext('webgl2')` is null, `load()` rejects, or quality resolves to `2d`, render `FieldMap2D` instead: an SVG top-down view with the field outline, blue hub, depot, path lines, robot square with heading and ghost. Same runner, same strip.
- **Test hook:** `window.__robotLab = { advance(seconds) }`.
- **Narrow layout:** panels stack below 900 px, with no horizontal scroll at 390 px.

- [ ] **Step 1: Write failing tests.**
  - `tests/robotLab/runner.test.ts`:
    - "caps catch-up at 5 loops per frame": `advanceFrame(10)` steps exactly 5 cycles.
    - "run() restarts": run, advance 3 s, change the setup, run again → cycle 0, hopper 8, no balls.
  - `tests/e2e/robot-lab.spec.ts` (Chromium and WebKit), each opening `./#/robot-lab?quality=light` unless noted:
    - "replays auto #7 with the drivetrain passed": click Run auto, `page.evaluate(() => window.__robotLab.advance(14))`. The strip's drivetrain lane ends with "TeleopDrive (default)", the score text is at least 28, and the log contains `FollowPathCommand("Straight Back")`.
    - "forgot drivetrain shows the conflict": click Forgot drivetrain, Run auto, advance 1.5. The strip contains "FollowPathCommand is also calling drive()".
    - "toggling mid-run restarts": advance 3, click Passes drivetrain. The cycle shows 0, and the hopper reads 8.
    - "falls back to 2D when WebGL is unavailable": `page.addInitScript` makes `HTMLCanvasElement.prototype.getContext` return null for webgl/webgl2. The fallback SVG (`data-testid="field-2d"`) is visible, and Run works.
    - "shows 2D fallback when the field model fails to load": `page.route('**/models/field-2026.glb', r => r.fulfill({ status: 404 }))`. The fallback is visible with the text "Couldn't load the 3D field".
    - "fits a phone": viewport 390×844, `document.documentElement.scrollWidth <= 390`.
- [ ] **Step 2:** Run `npx vitest run tests/robotLab/runner.test.ts && npx playwright test tests/e2e/robot-lab.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the runner, strip, fallback, page, route, nav link and credits.
- [ ] **Step 4:** Run both commands again. Expected: PASS in Chromium and WebKit.

### Task 7: Full verification and local launch

**Files:** none new.

- [ ] **Step 1:** `npx tsc -b && npx vitest run`. Expected: no type errors, all tests pass, including the 215 existing ones.
- [ ] **Step 2:** `npx playwright test`. Expected: all E2E tests pass in Chromium and WebKit.
- [ ] **Step 3:** `npm run build`. Expected: success.
  - The Robot Lab chunk and three.js are in their own chunks.
  - The entry chunk's size is roughly unchanged from before this phase; compare `dist/assets/index-*.js`.
  - `dist/models/field-2026.glb` exists.
- [ ] **Step 4:** Start the dev server in the background (`npx vite --port 5173`). Open `http://localhost:5173/frc-command-quest/#/robot-lab` in a headless browser at full quality, and screenshot the idle state and mid-run. Check visually that the field is the blue side, the robot sits at the start pose facing the driver station, and the strip is readable.
- [ ] **Step 5:** Give the user the local URL and a short list of what to try. Leave the dev server running. No commit or push.
