/**
 * The Robot Lab's robot: turns the commands the scheduler ran each 20 ms loop
 * into robot motion, intake, hopper and shooting on the 2026 REBUILT field.
 *
 * Deterministic (no randomness) and free of DOM, React and three.js, so the same
 * model can grade lab missions on the server later.
 */
import type { SchedulerView, WorldModel } from '../../simulation/types.ts'
import { CYCLE_SECONDS } from '../../simulation/types.ts'
import fieldFuel from './fieldFuel.json' with { type: 'json' }
import type { Pose, PoseSample } from './pathplanner.ts'
import { TEAM_PATHS } from './pathplanner.ts'
import type { LabInput } from './bindings.ts'
import { LAB_COMMANDS, type AxisRef, type TeleopMapping } from './labCode.ts'
import type { LabSetup } from './scenario.ts'
import { AUTO_STEPS, EVENT_IDS, FIELD_L, FIELD_W, followLabel, HOPPER_EMPTY, pathId, SHOOT_IDS, SPIN_UP_CYCLES, START_POSE, TELEOP_ID } from './scenario.ts'

/** Blue hub center (team 5829 Constants.blueHubPose) and half of its opening. */
export const HUB = { x: 4.626, y: 4.03, half: 0.53 }
export const PRELOAD = 8
export const PUSHOUT_OUT = 0.26
const PUSHOUT_SPEED = 1.3
/** Intake point ahead of the robot center when the pushout is out. */
const INTAKE_REACH = 0.48
const PICKUP_RADIUS = 0.42
const SHOT_INTERVAL_CYCLES = 8
const GRAVITY = 9.81
const BALL_RADIUS = 0.075
/** Shooter exit in robot coordinates (x forward, y left, z up). The shooter faces backward. */
const SHOOTER_EXIT = { x: -0.42, y: 0, z: 0.62 }
/** Team 5829 Constants.MAX_SPEED (16.5 ft/s). */
export const MAX_SPEED = 5.03
export const MAX_OMEGA = 2 * Math.PI
/** XboxController's default stick deadband. */
export const STICK_DEADBAND = 0.1
/** Half the bumper-to-bumper width: how close the robot center gets to a wall. */
export const ROBOT_HALF = 0.435
/** Half the hub's footprint (about 47 in square); both hubs block the robot. */
const HUB_HALF = 0.6
const HUBS = [HUB, { x: FIELD_L - HUB.x, y: HUB.y }]
const blocked = (x: number, y: number) => HUBS.some((h) => Math.abs(x - h.x) < HUB_HALF + ROBOT_HALF && Math.abs(y - h.y) < HUB_HALF + ROBOT_HALF)
const SHOOTERS: readonly string[] = [...SHOOT_IDS, LAB_COMMANDS.shootFuel.id]

export interface RobotWorldOptions {
  /** How TeleopDrive reads the sticks (null: the code sets no default command). */
  teleop?: TeleopMapping | null
  /** The controller, read once per loop. */
  input?: () => LabInput
  startPose?: Pose
}

/** MathUtil.applyDeadband(value, deadband): zero inside, rescaled to reach 1 outside. */
export function applyDeadband(value: number, deadband = STICK_DEADBAND): number {
  if (Math.abs(value) < deadband) return 0
  return (Math.sign(value) * (Math.abs(value) - deadband)) / (1 - deadband)
}

export const FIELD_FUEL: readonly { x: number; y: number; z: number }[] = fieldFuel

export interface Ball {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  scored: boolean
}

export interface RobotState {
  cycle: number
  pose: Pose
  /** Robot-relative velocity the modules are asked for (vx forward, vy left). */
  velocity: { vx: number; vy: number; omega: number }
  /** Where the running path wants the robot right now. */
  ghost: Pose | null
  /** A path command and TeleopDrive both commanded the drivetrain this loop. */
  driveConflict: boolean
  /** 0 (in) to PUSHOUT_OUT meters. */
  pushout: number
  intakeOn: boolean
  shooterOn: boolean
  hopper: number
  scored: number
  /** Parallel to FIELD_FUEL. */
  fuelTaken: boolean[]
  balls: Ball[]
}

const PATH_NAMES = AUTO_STEPS.filter((s) => s.kind === 'path').map((s) => s.name)

export class RobotWorld implements WorldModel {
  readonly state: RobotState
  private readonly pathClock = new Map<string, number>()
  private readonly shootCycles = new Map<string, number>()
  private shotCount = 0
  readonly setup: LabSetup
  private readonly options: RobotWorldOptions

  constructor(setup: LabSetup, options: RobotWorldOptions = {}) {
    this.setup = setup
    this.options = options
    this.state = {
      cycle: 0,
      pose: { ...(options.startPose ?? START_POSE) },
      velocity: { vx: 0, vy: 0, omega: 0 },
      ghost: null,
      driveConflict: false,
      pushout: 0,
      intakeOn: false,
      shooterOn: false,
      hopper: PRELOAD,
      scored: 0,
      fuelTaken: FIELD_FUEL.map(() => false),
      balls: [],
    }
  }

  signal(name: string): boolean | undefined {
    if (name === HOPPER_EMPTY) return this.state.hopper === 0
    return undefined
  }

  afterCycle(view: SchedulerView): void {
    const s = this.state
    s.cycle = view.cycle
    const activity = view.activity()

    // Drive: which path (if any) is following its trajectory this loop.
    let target: PoseSample | null = null
    for (const name of PATH_NAMES) {
      const id = pathId(name)
      if (!view.isRunning(id)) {
        this.pathClock.delete(id)
        continue
      }
      const clock = this.pathClock.get(id) ?? 0
      if (activity.get(id) === followLabel(name)) target = TEAM_PATHS[name].sample(clock)
      this.pathClock.set(id, clock + CYCLE_SECONDS)
    }
    const teleop = view.isRunning(TELEOP_ID)
    s.ghost = target ? { x: target.x, y: target.y, theta: target.theta } : null
    s.driveConflict = !!target && teleop
    if (target && !teleop) {
      s.velocity = toRobotRelative(target, target.theta)
      s.pose = { x: target.x, y: target.y, theta: target.theta }
    } else if (target && teleop) {
      // The path asks to move, then TeleopDrive (sticks at rest) asks for zero in
      // the same loop: the robot stays put while its modules flick back and forth.
      const wanted = toRobotRelative(target, s.pose.theta)
      s.velocity = view.cycle % 2 === 0 ? wanted : { vx: wanted.vx * 0.02, vy: wanted.vy * 0.02, omega: 0 }
    } else if (teleop && this.options.teleop && this.options.input) {
      this.teleopDrive(this.options.teleop, this.options.input())
    } else {
      s.velocity = { vx: 0, vy: 0, omega: 0 }
    }

    // Intake pushout and rollers.
    const extendTarget = view.isRunning(EVENT_IDS.extend) ? PUSHOUT_OUT : view.isRunning(LAB_COMMANDS.retract.id) ? 0 : s.pushout
    const step = PUSHOUT_SPEED * CYCLE_SECONDS
    s.pushout += Math.max(-step, Math.min(step, extendTarget - s.pushout))
    s.intakeOn = view.isRunning(EVENT_IDS.intake)
    if (s.intakeOn && s.pushout > 0.2) this.collectFuel()

    // Shooter.
    s.shooterOn = false
    for (const id of SHOOTERS) {
      if (!view.isRunning(id)) {
        this.shootCycles.delete(id)
        continue
      }
      s.shooterOn = true
      const n = (this.shootCycles.get(id) ?? 0) + 1
      this.shootCycles.set(id, n)
      if (n > SPIN_UP_CYCLES && (n - SPIN_UP_CYCLES - 1) % SHOT_INTERVAL_CYCLES === 0 && s.hopper > 0) this.shoot()
    }

    this.stepBalls()
  }

  /** Field-relative swerve drive from the blue driver station: forward is +x, left is +y. */
  private teleopDrive(mapping: TeleopMapping, input: LabInput) {
    const s = this.state
    const read = (ref: AxisRef) => ref.sign * applyDeadband(input[ref.axis])
    const vxField = read(mapping.forward) * MAX_SPEED
    const vyField = read(mapping.strafe) * MAX_SPEED
    const omega = read(mapping.turn) * MAX_OMEGA
    const theta = s.pose.theta + omega * CYCLE_SECONDS
    // Walls clamp; the hubs stop motion along each axis separately, so the robot slides along them.
    let x = clamp(s.pose.x + vxField * CYCLE_SECONDS, ROBOT_HALF, FIELD_L - ROBOT_HALF)
    if (blocked(x, s.pose.y)) x = s.pose.x
    let y = clamp(s.pose.y + vyField * CYCLE_SECONDS, ROBOT_HALF, FIELD_W - ROBOT_HALF)
    if (blocked(x, y)) y = s.pose.y
    s.pose = { x, y, theta: Math.atan2(Math.sin(theta), Math.cos(theta)) }
    s.velocity = { ...toRobotRelative({ vx: vxField, vy: vyField, omega } as PoseSample, s.pose.theta), omega }
  }

  private collectFuel() {
    const s = this.state
    const reach = INTAKE_REACH + (s.pushout - PUSHOUT_OUT)
    const cx = s.pose.x + reach * Math.cos(s.pose.theta)
    const cy = s.pose.y + reach * Math.sin(s.pose.theta)
    FIELD_FUEL.forEach((f, i) => {
      if (s.fuelTaken[i] || f.z >= 0.35) return
      if (Math.hypot(f.x - cx, f.y - cy) < PICKUP_RADIUS) {
        s.fuelTaken[i] = true
        s.hopper += 1
      }
    })
  }

  private shoot() {
    const s = this.state
    s.hopper -= 1
    const n = this.shotCount++
    // Small, repeatable spread so balls don't fly in a single file.
    const lateral = ((n % 3) - 1) * 0.08
    const c = Math.cos(s.pose.theta), sn = Math.sin(s.pose.theta)
    const ex = SHOOTER_EXIT.x, ey = SHOOTER_EXIT.y + lateral
    const from = { x: s.pose.x + ex * c - ey * sn, y: s.pose.y + ex * sn + ey * c, z: SHOOTER_EXIT.z }
    // The shooter sets its speed for the distance to the hub (the team's RPM table)
    // but can't aim sideways: the ball leaves the back of the robot, along its heading.
    const reach = Math.hypot(HUB.x - from.x, HUB.y - from.y) + ((n % 5) - 2) * 0.05
    const back = s.pose.theta + Math.PI
    const aim = { x: from.x + reach * Math.cos(back), y: from.y + reach * Math.sin(back), z: 1.55 }
    const dist = Math.hypot(aim.x - from.x, aim.y - from.y)
    const t = 0.45 + 0.22 * dist
    s.balls.push({
      ...from,
      vx: (aim.x - from.x) / t,
      vy: (aim.y - from.y) / t,
      vz: (aim.z - from.z + 0.5 * GRAVITY * t * t) / t,
      scored: false,
    })
  }

  private stepBalls() {
    const s = this.state
    const dt = CYCLE_SECONDS
    s.balls = s.balls.filter((b) => {
      b.vz -= GRAVITY * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.z += b.vz * dt
      if (!b.scored && b.vz < 0 && b.z < 1.6 && Math.abs(b.x - HUB.x) < HUB.half && Math.abs(b.y - HUB.y) < HUB.half) {
        b.scored = true
        s.scored += 1
      }
      if (b.scored && b.z < 1.0) return false
      if (b.z < BALL_RADIUS) {
        b.z = BALL_RADIUS
        b.vz *= -0.35
        b.vx *= 0.7
        b.vy *= 0.7
      }
      return true
    })
  }
}

function toRobotRelative(v: PoseSample, heading: number) {
  const c = Math.cos(-heading), s = Math.sin(-heading)
  return { vx: v.vx * c - v.vy * s, vy: v.vx * s + v.vy * c, omega: v.omega }
}


const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
