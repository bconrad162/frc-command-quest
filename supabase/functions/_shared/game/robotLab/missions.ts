/**
 * Robot Lab fix-it missions. Each starts from the free-play code with one bug. A
 * check runs the student's deployed code with no browser, on a scripted input
 * timeline, and says what the robot did and why. Deterministic, so the same
 * check can run on the server later.
 *
 * Pure TypeScript: no DOM, React or three.js.
 */
import { CONTROL_BY_ID, type ControlId } from '../controller.ts'
import { NO_INPUT, type LabInput } from './bindings.ts'
import { FREE_PLAY_CODE, parseLabCode, type LabConfig, type LabRegions, type RegionId } from './labCode.ts'
import { runLab, type LabSample } from './labSim.ts'
import type { Pose } from './pathplanner.ts'
import type { LabMode } from './scenario.ts'
import { HUB } from './world.ts'

export interface MissionResult {
  passed: boolean
  message: string
}

export interface LabMission {
  id: string
  title: string
  /** What's wrong, as the drive team would report it. */
  story: string
  /** What the check needs to see. */
  goal: string
  mode: LabMode
  start: LabRegions
  solution: LabRegions
  startPose?: Pose
  check(config: LabConfig): MissionResult
}

const REGION_NAME: Record<RegionId, string> = {
  driveRequirements: 'AutoBuilder.configure(...)',
  defaultCommand: 'the default command',
  bindings: 'configureBindings()',
}

const at = (samples: LabSample[], t: number) => samples.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best)).state
const m1 = (n: number) => Math.abs(n).toFixed(1)
const holding = (control: ControlId, from: number, to: number) => (t: number): LabInput => {
  if (t < from || t >= to) return NO_INPUT
  if (control === 'leftTrigger') return { ...NO_INPUT, leftTrigger: 1 }
  if (control === 'rightTrigger') return { ...NO_INPUT, rightTrigger: 1 }
  return { ...NO_INPUT, buttons: new Set([control]) }
}

const AUTO_MIN_SCORE = 20

const fixAuto: LabMission = {
  id: 'fix-auto',
  title: 'Fix the auto',
  story: 'Auto #7 compiles, and the log says PathPlannerAuto ran, but the robot just twitches at the starting line.',
  goal: `Auto #7 drives both paths and scores at least ${AUTO_MIN_SCORE} fuel.`,
  mode: 'auto',
  start: { ...FREE_PLAY_CODE, driveRequirements: 'this::isRedAlliance' },
  solution: FREE_PLAY_CODE,
  check(config) {
    const { world } = runLab(config, 'auto', () => NO_INPUT, 16)
    const scored = world.state.scored
    if (!config.passDrivetrain && !config.teleop)
      return {
        passed: false,
        message: `With no default command nothing fights the path, so the auto scored ${scored}, but now nothing drives in teleop. Keep TeleopDrive and give the path commands the drivetrain instead.`,
      }
    if (scored >= AUTO_MIN_SCORE && config.passDrivetrain) return { passed: true, message: `The path commands required the drivetrain, so the robot drove both paths and scored ${scored} fuel.` }
    if (!config.passDrivetrain && config.teleop)
      return {
        passed: false,
        message: `The robot scored only its ${scored} preloaded fuel. FollowPathCommand required nothing, so TeleopDrive (the default command) kept the drivetrain and the robot fought itself in place.`,
      }
    return { passed: false, message: `The auto scored ${scored} fuel; it needs at least ${AUTO_MIN_SCORE}.` }
  },
}

const forwardBackward: LabMission = {
  id: 'forward-backward',
  title: 'Forward drives backward',
  story: 'The driver pushes the left stick forward and the robot backs into the driver station wall.',
  goal: 'Pushing the left stick forward drives away from your driver station, and pushing it left strafes left.',
  mode: 'teleop',
  start: { ...FREE_PLAY_CODE, defaultCommand: FREE_PLAY_CODE.defaultCommand.replace('() -> -driver.getLeftY(),', '() -> driver.getLeftY(), ') },
  solution: FREE_PLAY_CODE,
  check(config) {
    if (!config.teleop) return { passed: false, message: 'Nothing drove: the drivetrain has no default command, so nothing reads the sticks.' }
    const fwd = runLab(config, 'teleop', (t) => (t < 1 ? { ...NO_INPUT, leftY: -1 } : NO_INPUT), 1.1).samples
    const dx = at(fwd, 1).pose.x - at(fwd, 0.02).pose.x
    if (dx <= -1)
      return {
        passed: false,
        message: `Pushing forward moved the robot ${m1(dx)} m toward your driver station. A stick's Y axis is positive when you pull it back, so forward reads negative.`,
      }
    if (dx < 1) return { passed: false, message: `Pushing the left stick forward moved the robot only ${m1(dx)} m forward. Forward should read the left stick's Y axis.` }
    const left = runLab(config, 'teleop', (t) => (t < 0.5 ? { ...NO_INPUT, leftX: -1 } : NO_INPUT), 0.6).samples
    const dy = at(left, 0.5).pose.y - at(left, 0.02).pose.y
    if (dy < 1) return { passed: false, message: `Forward works, but pushing the stick left moved the robot ${dy < 0 ? `${m1(dy)} m right` : `only ${m1(dy)} m left`}.` }
    return { passed: true, message: `Forward drives away from the driver station (${m1(dx)} m in 1 s), and left strafes left.` }
  },
}

const intakeWontStop: LabMission = {
  id: 'intake-wont-stop',
  title: "The intake won't stop",
  story: 'The driver taps RT to intake, but the rollers keep spinning for the rest of the match.',
  goal: 'The intake runs while RT is held and stops when it is released.',
  mode: 'teleop',
  start: { ...FREE_PLAY_CODE, bindings: FREE_PLAY_CODE.bindings.replace('driver.rightTrigger().whileTrue(', 'driver.rightTrigger().onTrue(') },
  solution: FREE_PLAY_CODE,
  check(config) {
    const { samples } = runLab(config, 'teleop', holding('rightTrigger', 1, 2), 3)
    if (at(samples, 0.5).intakeOn) return { passed: false, message: 'The intake ran before RT was pressed.' }
    if (!at(samples, 1.5).intakeOn) return { passed: false, message: "Holding RT didn't run the intake. Bind driver.rightTrigger() to intake.runIntakeCommand()." }
    if (at(samples, 2.5).intakeOn) return { passed: false, message: 'The intake kept running after RT was released: that binding only starts the command, and nothing cancels it.' }
    return { passed: true, message: 'The intake runs only while RT is held.' }
  },
}

const SHOOT_POSE: Pose = { x: HUB.x - 2.5, y: HUB.y, theta: Math.PI }

const addShootButton: LabMission = {
  id: 'add-shoot-button',
  title: 'Add a shoot button',
  story: "The drive team wants a button that shoots. Nothing in configureBindings() runs the shooter yet. The robot starts lined up with the hub, shooter facing it.",
  goal: 'Holding a button of your choice shoots at least 3 fuel, and the shooter stops when you let go.',
  mode: 'teleop',
  start: { ...FREE_PLAY_CODE, bindings: FREE_PLAY_CODE.bindings.split('\n').filter((l) => !l.includes('shootFuel')).join('\n') },
  solution: FREE_PLAY_CODE,
  startPose: SHOOT_POSE,
  check(config) {
    const binding = config.bindings.find((b) => b.command === 'shootFuel')
    if (!binding) return { passed: false, message: 'No button runs `shooter.shootFuelCommand()` yet. Add a binding to configureBindings().' }
    const name = CONTROL_BY_ID[binding.control].short
    const { samples, world } = runLab(config, 'teleop', holding(binding.control, 1, 4), 5.2, SHOOT_POSE)
    const scoredWhileHeld = at(samples, 4).scored
    if (scoredWhileHeld < 3)
      return { passed: false, message: `Holding ${name} for 3 seconds scored ${scoredWhileHeld} fuel. The shooter has to run while the button is held.` }
    if (at(samples, 5).shooterOn)
      return { passed: false, message: `${name} shot ${world.state.scored} fuel, but the shooter is still running a second after you let go.` }
    return { passed: true, message: `Holding ${name} shot ${world.state.scored} fuel into the hub, and the shooter stopped when you let go.` }
  },
}

export const LAB_MISSIONS: LabMission[] = [fixAuto, forwardBackward, intakeWontStop, addShootButton]

/** Parses the student's regions; any Problem fails the check with that problem. */
export function checkMission(mission: LabMission, regions: LabRegions): MissionResult {
  const { config, problems } = parseLabCode(regions)
  if (!config) {
    const p = problems[0]
    return { passed: false, message: `Line ${p.line} of ${REGION_NAME[p.region]}: ${p.message}` }
  }
  return mission.check(config)
}
