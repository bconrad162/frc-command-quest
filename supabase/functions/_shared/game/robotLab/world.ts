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
import type { LabSetup } from './scenario.ts'
import { AUTO_STEPS, EVENT_IDS, followLabel, HOPPER_EMPTY, pathId, SHOOT_IDS, SPIN_UP_CYCLES, START_POSE, TELEOP_ID } from './scenario.ts'

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

  constructor(setup: LabSetup) {
    this.setup = setup
    this.state = {
      cycle: 0,
      pose: { ...START_POSE },
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
    } else {
      s.velocity = { vx: 0, vy: 0, omega: 0 }
    }

    // Intake pushout and rollers.
    const extendTarget = view.isRunning(EVENT_IDS.extend) ? PUSHOUT_OUT : s.pushout
    const step = PUSHOUT_SPEED * CYCLE_SECONDS
    s.pushout += Math.max(-step, Math.min(step, extendTarget - s.pushout))
    s.intakeOn = view.isRunning(EVENT_IDS.intake)
    if (s.intakeOn && s.pushout > 0.2) this.collectFuel()

    // Shooter.
    s.shooterOn = false
    for (const id of SHOOT_IDS) {
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
    const aim = { x: HUB.x + ((n % 5) - 2) * 0.05, y: HUB.y + (((n + 2) % 5) - 2) * 0.05, z: 1.55 }
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

