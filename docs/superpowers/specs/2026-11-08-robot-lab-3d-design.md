# Robot Lab 3D: design

Status: draft for review, 2026-11-08
Prototype: the throwaway 3D scene at `.superpowers/brainstorm/2917112-1794173730/content/robot-scene-spike.html` (not part of the app; see "What the spike proved").

## Why

Team 5829's programmers keep hitting bugs where the code compiles and looks right, but the robot doesn't do what it should. The example that started this: a PathPlanner autonomous didn't move the robot because `AutoBuilder.configure(...)` was never given the drive mechanism as a requirement.

Command Quest teaches the Commands v3 scheduler through text, tables and a flat field view. Students now need to **see** what the scheduler does to a robot, in real time, and **fix the code and watch the robot work**. One programmer already learns best from the site's visuals, and this builds on that.

Everything is **WPILib 2027 Commands v3**. No v2 patterns, names or imports, except where the game explicitly compares with the 2026 names, as the controller cheat sheet already does.

## Who uses it, and where

- New and returning FRC programmers on team 5829, in class and at home.
- **School MacBooks.** Safari is the main browser; Chrome also matters. The public site is on GitHub Pages, and classroom mode uses Supabase.
- Some students will have an Xbox controller to pair with their Mac. Many won't.

## Goals

1. **A realistic 3D robot on the real 2026 REBUILT field.** It should look legit, not like a diagram: the user's bar is "pretty legit", and they pointed out that people run full 3D games in browsers.
2. **Live driving.** An Xbox controller drawn on the page drives the robot in real time. A real controller works too, when one is paired.
3. **Students' code decides what the robot does.** That includes trigger bindings (`onTrue`, `whileTrue`, `toggleOnTrue`, ...), default commands, and PathPlanner setup and autos.
4. **The scheduler is always visible.** Every 20 ms loop, students can see which command owns each mechanism. When the robot misbehaves, the screen shows why.
5. **Fix-it missions.** The lab opens with a real bug in place, the student fixes the code, and the robot then visibly works. These are graded on what the robot actually does.
6. **Troubleshooting PathPlanner autos,** using the real names from the community Commands v3 build of PathPlannerLib.

## Non-goals

- Running arbitrary student Java. The game reads only specific editable spots (see "How students change the code").
- A physics-accurate simulator, or a stand-in for WPILib sim, AdvantageScope or the real robot. It's an educational model, like the rest of the game.
- A path editor. Paths come from team 5829's real PathPlanner files, built into the game.
- Multiplayer, or more than one robot on the field.
- Teaching Commands v2.

## Anti-goals (would make this a failure even if it technically works)

- **Behavior that contradicts real Commands v3 or the PathPlanner v3 build.** If the lab shows something WPILib wouldn't do, it teaches the wrong lesson. Scheduler behavior must come from the existing simulator (`src/simulation/scheduler.ts`, documented in `docs/commands-v3-behavior.md`), not from a second hand-written model like the spike's.
- **Eye candy that hides the lesson.** The ownership strip and log must stay readable at all times, and the cause of a failure must be visible, not just the symptom.
- **Too slow or too heavy for a school MacBook,** or a page that breaks the rest of the site. The lab loads only when opened.
- **A copy of another game's look,** or FIRST branding used as decoration. The field is the real FRC field because it's a training tool for that field.

## Decisions the user made

- **Layout:** the field and the robot's mechanisms in one view, made fully 3D rather than drawn diagrams.
- **The real 2026 REBUILT field,** not a generic one.
- **PathPlanner names:** use the community v3 fork's actual API (`com.pathplanner.lib.command3`: `AutoBuilder`, `NamedCommands`, `PathPlannerAuto`, `FollowPathCommand`), labeled as a community build that may change. The pinned version is PathplannerLib `2027.0.0-alpha-7-commandsv3-2` from `JosephTLockwood/pathplanner`, branch `new-path-2027-commands-v3`. The official PathPlanner `2027` branch is still Commands v2.
- **Student experience:** they fix the code and see the robot work on the 3D field. That covers PathPlanner autos, v3 commands, setting up controllers properly, and driving with an on-page controller to see the robot move, shoot and so on.
- **Computers:** school MacBooks.

## Calls I made (the user can overrule these)

- **How students change the code.** They see a real-looking Commands v3 Java file (for example `RobotContainer.java`) with a few editable spots, using the existing `ConstrainedEditor`. They type the real line, such as adding `drivetrain` to `AutoBuilder.configure(...)` or changing `onTrue` to `whileTrue`. Each spot accepts a known set of forms, like the `accepted` patterns code-edit missions already use. Anything else gets a clear "the lab doesn't understand this line" message rather than a guess.
- **No separate side-view inset.** The 3D cameras (Field, Follow robot, Driver station, Top down) cover what the side view was for.
- **The robot model.** A procedural swerve robot like the spike's, sized from team 5829's PathPlanner settings (0.87 m with bumpers, modules at ±0.294 m), with 5829 bumpers, an intake pushout, rollers, a hopper and a shooter. The 2026 game has no arm, so its "arm" lessons use the intake pushout. Replacing it with the team's real CAD later should only mean swapping the model.
- **Input.** An on-page controller (draggable sticks, clickable buttons and triggers), a real gamepad through the browser Gamepad API (mirrored on the on-page controller), and a keyboard fallback, so nobody is locked out.
- **The first content is team 5829's own auto,** #7 "Straight Back Depot". It uses the paths "Straight Back" and "Depot and shoot from Hub Shoot", and the named commands "Shoot Preload" and "Control All Shooting".
- **Where the team's files come from.** The team's 2026 robot code is public at `github.com/awtybots/2026Rebuilt`. Use `main` at `031ea9b` (2026-06-08), the latest; its copies of auto #7's two paths match what the spike used. Copy the files the lab needs into this repo with a note on where they came from:
  - from `src/main/deploy/pathplanner/`: the needed `.path` and `.auto` files, and `settings.json`;
  - the relevant parts of `Constants.java` and `util/FieldConstants.java`.

  Read `RobotContainer.java` and the mechanism classes to decide which mechanisms the world model needs, what each named command requires, and which names the editable `RobotContainer` uses. For example: is the indexer separate from the shooter, and what does "Shoot Preload" require? Translate the team's v2 code into Commands v3 in the lab; never show it as v2.

## How it works

### One scheduler, two views

- The live lab drives the existing `CommandScheduler` one loop at a time (`step()` at 50 Hz, scaled by a speed control).
- Controller input is polled each loop and turned into trigger edges. Bindings act through `scheduleExternal` and `cancel`, with the same semantics as `BindingType` and the Driver Controls missions.
- A new **robot world model** (`WorldModel`: `beforeCycle`/`afterCycle`, reading `activity()` and `owner()`) turns the commands running each loop into robot motion: swerve, pushout, rollers, hopper and shooter.
- When two commands both write drive outputs in one loop, the world model shows the conflict (the twitching robot in the spike). It never quietly picks a winner.
- The world model is **plain TypeScript with no rendering.** The 3D view only draws its state. That keeps the lab testable in Vitest, and lets the Supabase Edge Function grade lab missions by running the same model with no browser (see "Grading").

### Scheduler gaps to fill

`docs/commands-v3-behavior.md` lists the following as "Not modeled", but the auto replay and some missions need them:
- `Command.sequence`, with whatever it requires (to verify);
- `withTimeout`;
- commands that end with an error (`CompletedWithError`).

Extend the shared scheduler with tests, and keep every existing challenge's behavior unchanged. The Edge Function grades with the same code, so redeploy it after `npm run supabase:sync`.

### PathPlanner, modeled on the v3 fork

These behaviors come from reading the fork's source:
- **`AutoBuilder.configure(..., Mechanism... driveRequirements)`.** The parameter is varargs, so leaving out the drivetrain compiles. Path commands then require nothing.
- **`FollowPathCommand`** requires exactly the mechanisms passed in. Event commands along a path are forked, and are canceled when the path ends. It throws if an event command requires a drive mechanism.
- **`PathPlannerAuto.requirements()`** returns the requirements of the auto's inner command.

**To verify before relying on them:**
- What a sequential v3 group requires: the union of its children, held for the whole group? The spike assumed yes.
- What `NamedCommands.getCommand` does for a name that wasn't registered when the auto was built.
- Whether a forked event command may require a mechanism its parent doesn't own.

Verify all three against allwpilib `main` and the fork, and record them in `docs/commands-v3-behavior.md` with sources, like the existing entries.

### The page

- **A new lazy-loaded route** (for example `#/robot-lab`) using `lazyPage`. three.js and the field model download only there. Whether to use plain three.js or React Three Fiber is the builder's call.
- **Layout:** the 3D view is the main area. Around it go the code editor with its editable spots, the controller (on-page or mirrored), and the ownership strip with the scheduler log, which must stay visible while driving. The controller reuses `ControllerDiagram` styling where it makes sense.
- **Missions** open the same lab in a starting state: the code, the bug, the robot pose, and a goal such as "score at least 8 fuel in auto", "intake only while RT is held", or "drive forward when the stick is pushed forward".

### The field asset

- The source is AdvantageScope's `Field3d_2026FRCFieldV1` model, which is 18 MB and about 2,900 meshes.
- It must be preprocessed at build time:
  - merge static meshes by material, as the spike did at runtime;
  - compress the geometry (for example meshopt or Draco);
  - fix the materials, because the CAD export marks everything as polished metal.
- Its 456 fuel balls become one instanced mesh.
- Coordinates: the model is centered and turned 180° from WPILib's blue-origin frame (checked with AprilTag 26). Field (x, y, z) maps to three.js as `(L/2 − x, z, y − W/2)`, and heading as `θ + π`.
- **License: BSD 3-clause** (`LICENSE` in `Mechanical-Advantage/AdvantageScopeAssets`, copyright Littleton Robotics). Reuse and modified copies are allowed if we:
  - keep their copyright notice and license text, both in the repo next to the processed asset and on a credits section of the site (the Reference page or an About section);
  - don't use 6328's or AdvantageScope's name to imply they endorse Command Quest.

  The model is built from FIRST's official field CAD (`FE-2026`/`GE-26xxx` part numbers). Credit FIRST for the field design too.
- The source `.glb` (18 MB) may be committed, or fetched from the assets repo's `archive-v1` release (`Field3d_2026FRCFieldV1.zip`) by the build. The builder decides; only the processed asset is served.

## Grading

- **Free play is never graded.**
- **A lab mission is graded by running the world model with no browser,** using the student's edited spots and a scripted input timeline from the mission. For example: "hold RT from 1.0 s to 2.0 s, then release", or "run the auto". The result is then checked against the mission's goal (fuel scored, ending pose, whether the intake ran only while held, and so on).
- The student's live run is for seeing and debugging. The scripted run is the one that's graded, which keeps grades deterministic and lets the server check them.
- New missions follow the existing rules:
  - a new challenge kind in `src/game/types.ts` and `src/game/grading.ts`;
  - shared code copied to the Edge Function by `npm run supabase:sync`;
  - a new per-`CONTENT_VERSION` catalog migration;
  - the three-wrong-attempts reveal.
- The revealed answer shows the corrected code, plus a replay of the robot doing it right.

## Accessibility

- The ownership strip and scheduler log are real text, so screen readers and keyboard users get the full story. The 3D view is a supplement.
- Driving works from the keyboard.
- Respect "Reduce motion": no camera swoops, and a slower or step-by-step option.
- The ghost robot, path line and conflict callout don't rely on color alone.

## Performance and compatibility

- **Target:** smooth (about 60 fps) on a recent school MacBook Air in Safari and Chrome, with the field loading in a few seconds on school Wi-Fi.
- **Unknown hardware (my call).** Nobody knows yet whether the school MacBooks are Apple Silicon or older Intel models, so plan for both.
  - Build at least two quality levels:
    - **Full:** soft shadows, environment lighting, high pixel ratio.
    - **Light:** no or cheap shadows, pixel ratio 1, simpler lighting, no fog or post effects.
  - Pick the level automatically by measuring frame time during the first seconds in the lab, and drop a level when frames stay slow. Students can also choose the level by hand.
  - Below the light level, use the 2D fallback.
  - Before phase 1 ships, test on a real school MacBook. The user doesn't have access to one yet, so plan for that check and ask for it.
- **If WebGL is missing or too slow,** the lab falls back to the existing 2D views (the field view, `MechanismBoard`, the timeline) with the same scheduler. It never shows a blank screen.
- Nothing about the lab may slow down or break the rest of the site.

## Testing

- **Vitest:** the robot world model, binding and trigger edges, the PathPlanner modeling (each bug and each fix), path-following math against the team's path files, and grading of each lab mission.
- **Playwright (Chromium and WebKit):**
  - the lab loads;
  - driving with the on-page controller moves the robot;
  - fixing a mission's code changes the outcome;
  - the reveal shows the fix.
- **Headless WebGL renders a few frames a second.** Tests need a hook that advances the simulation without waiting for frames; the spike used `window.__advance(seconds)`.

## Phases (each one shippable)

1. **Foundation:** the processed field asset, the robot model, the robot world model on the real scheduler, the cameras, the 2D fallback, and a lab page that replays auto #7 with the drivetrain-requirement toggle. This is the spike, rebuilt properly.
2. **Driving and bindings:**
   - the on-page and real controller, plus keyboard;
   - an editable `RobotContainer` with binding and default-command spots;
   - free play;
   - the first binding missions.
3. **Auto troubleshooting:** PathPlanner missions on team 5829's paths. Candidate list below; the builder picks the first few after verifying the behavior.

### Candidate missions (verify each before building)

| Bug | What the robot does | The fix |
|---|---|---|
| `AutoBuilder.configure` without `drivetrain` | Twitches in place while the path "runs"; the depot run collects nothing | Pass `drivetrain` |
| Intake bound with `onTrue` | Rollers keep spinning after RT is released | `whileTrue` |
| No default drive command | Sticks do nothing | `setDefaultCommand(...)` for teleop drive |
| Forward uses `getLeftY()` | Pushing forward drives backward (Y is positive when the stick is pulled back) | `-driver.getLeftY()` |
| Named command registered after the autos are built | The "Shoot Preload" step does nothing | Register before `AutoBuilder.buildAutoChooser()` (to verify) |
| Event command requires `drivetrain` | The auto fails with an error at start | Remove the drive requirement from the event command |

## What the spike proved

- The real field and the team's real path data line up. At auto #7's end pose, the rear shooter faces the hub, as planned.
- A procedural robot in the team's colors looks convincing next to the CAD field.
- **Performance:**
  - The raw field model is too heavy to use as is.
  - Merging by material and instancing the fuel makes it workable, so the real version needs that as a build step.
  - The spike was only seen in a headless software renderer. Speed on real MacBooks is still to be confirmed.
- **Throwaway parts:** the spike's mini scheduler and its "last write wins" drive model. The real version uses the project's scheduler and a world model designed for it.

## Open questions

- **Upstream changes.** The PathPlanner v3 fork, and Commands v3 itself, are alpha and may change. Pin the versions the lab teaches, and show them on the page.

## Left to the builder

- three.js directly vs React Three Fiber, and how the 3D scene is split into components.
- The asset pipeline tooling and compression settings.
- The exact page layout at each screen size, within the constraints above.
- The keyboard mapping.
- Which candidate missions ship first in phase 3, once their behavior is verified.

## Phase 2 details (added 2026-11-08)

The user asked for "a joystick on the page they can use to control the robot and then a like vs code style on the page to make changes like fix the joystick issue, or add button to make it shoot using Commands V3". After phase 2 comes logging in the same lab (see "Next: logging").

### What the user decided
- An on-page joystick drives the robot live.
- The code editor looks like VS Code: a file tab, line numbers and a Problems panel.
- Students fix bugs (the joystick, the auto) and add new bindings, such as a button that shoots, all in Commands v3.
- Order: the joystick and editor first, then logging.

### Calls I made (the user can overrule these)
- **The editor is a code-editor-style panel, not a copy of VS Code.**
  - It has an explorer with `RobotContainer.java` and read-only mechanism files, so students can see what each command requires.
  - It also has a file tab, breadcrumbs, line numbers, highlighted editable regions, a Problems panel and a status bar.
  - It doesn't copy VS Code's icons or branding.
- **`RobotContainer.java` has three editable regions:**
  - the drive requirements passed to `AutoBuilder.configure(...)`;
  - the drivetrain's default command;
  - `configureBindings()`.
  
  The rest of the file is read-only.
- **The lab understands a fixed set of line forms.** It still runs no Java.
  - **Bindings:** `driver.<trigger>().<binding>(<command>);`
    - Triggers are every `CommandXboxController` button trigger.
    - Bindings are `onTrue`, `onFalse`, `whileTrue` and `toggleOnTrue`.
    - Commands are the lab's command factories.
  - **Default drive command:** `drivetrain.setDefaultCommand(drivetrain.teleopDrive(() -> <axis>, () -> <axis>, () -> <axis>));`. The three arguments are forward, strafe and turn, and each axis is `[-]driver.get(Left|Right)(X|Y)()`.
  - **Anything else** shows in Problems as "the lab doesn't understand this line", with the line number.
  - **2026 (v2) names** get a specific tip, for example "`povUp()` is the 2026 name; Commands v3 uses `dpadUp()`".
- **Deploy.** Edits take effect when the student presses **Deploy**, which restarts the robot with the new code, as on a real robot. Problems block deploy, as compile errors would.
- **Commands the lab offers**, using the team's real names where they exist:
  - `intake.runIntakeCommand()` (requires intake);
  - `pushout.pushCommand()` and `pushout.retractCommand()` (require pushout);
  - `shooter.shootFuelCommand()` (requires shooter): spins up, then feeds every 8 loops while it runs and the hopper has fuel.
- **Driving.**
  - `teleopDrive` is field-relative from the blue driver station. Forward is +x.
  - Speed is the team's `MAX_SPEED` (16.5 ft/s = 5.03 m/s), with turning at up to 2π rad/s.
  - The `XboxController` 0.1 stick deadband applies.
  - The robot stays inside the field walls. Hubs and other field elements are not obstacles yet.
- **Shots leave the back of the robot along its heading, sized for the distance to the hub.** They score only when the robot's rear faces the hub. This replaces phase 1's "always aim at the hub" behavior.
- **Driver Station bar:** Autonomous or Teleop, Enable and Disable. Autonomous runs auto #7 using the `AutoBuilder.configure` region. Phase 1's "forgot the drivetrain" toggle becomes a mission.
- **Input:**
  - the on-page controller: drag the sticks, and hold the buttons and triggers with the pointer;
  - a real gamepad through the Gamepad API, using its standard mapping and mirrored on the page;
  - the keyboard: WASD for the left stick, Q and E to turn, Space for RT, Shift for LT, and 1 to 4 for A, B, X and Y. The keyboard is ignored while typing in the editor.
- **Triggers are polled at the start of each loop,** before default commands, using a new scheduler hook. Edge semantics match the "Controllers and trigger bindings" section.
- **Missions in phase 2.** The robot runs a scripted input timeline with no browser, and the result is checked. Every mission starts from free play's correct code with one bug.
  1. Fix the auto: no `drivetrain` in `AutoBuilder.configure`.
  2. Forward drives backward: `driver.getLeftY()` without the minus.
  3. The intake won't stop: `onTrue` instead of `whileTrue`.
  4. Add a shoot button: there's no shoot binding. The student binds any button so the robot shoots while it's held.

  After three failed checks, the lab shows the fix.
- **Points and leaderboard.** Phase 2 missions are checked in the lab but not added to the points catalog. That needs a catalog migration and an Edge Function deploy, so it waits for phase 3, when there are more missions to add.

### Next: logging (after phase 2)
- Team 5829 uses AdvantageKit 26.0.2 (`LoggedRobot`, `WPILOGWriter` + `NT4Publisher`, replay mode).
- It logs with `Logger.recordOutput` only: no `@AutoLog` inputs or IO layers, so replay can't reproduce a match.
- Its keys are inconsistent (`Intake/AppliedVolts` vs `IntakeRightRPM`).
- Some values exist only in `SmartDashboard`, and `DataLogManager` writes a second log.
- The plan is for students to add `Logger.recordOutput(...)` in the lab editor and see the values in an AdvantageScope-style graph while they drive.
- Missions would then cover the gaps above.
- Before designing, check whether AdvantageKit supports the 2027 Commands v3. The lab must stay v3.
