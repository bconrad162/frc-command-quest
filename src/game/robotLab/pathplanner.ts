/**
 * PathPlanner path math for the Robot Lab: turns a PathPlanner 2025.0 `.path`
 * file into a time-parameterized trajectory.
 *
 * This is an educational approximation of PathPlannerLib's generator: Bézier
 * segments between waypoints, a trapezoidal speed profile from the path's global
 * constraints, and holonomic rotation interpolated between rotation targets.
 * It ignores constraint zones and the robot's module limits.
 *
 * Pure TypeScript: no DOM, React or three.js (shared with server grading later).
 */
import depotPath from './team5829/depot-and-shoot-from-hub-shoot.path.json' with { type: 'json' }
import straightBackPath from './team5829/straight-back.path.json' with { type: 'json' }

export interface XY {
  x: number
  y: number
}

/** PathPlanner 2025.0 `.path` JSON (the subset the lab uses). */
export interface PathFile {
  waypoints: { anchor: XY; prevControl: XY | null; nextControl: XY | null }[]
  rotationTargets: { waypointRelativePos: number; rotationDegrees: number }[]
  /** A marker with endWaypointRelativePos is zoned: its command is canceled at the zone's end. */
  eventMarkers: { name: string; waypointRelativePos: number; endWaypointRelativePos?: number | null }[]
  globalConstraints: { maxVelocity: number; maxAcceleration: number }
  idealStartingState: { rotation: number }
  goalEndState: { rotation: number }
}

/** Field frame (WPILib blue origin), meters and radians. */
export interface Pose {
  x: number
  y: number
  theta: number
}

/** A pose plus field-relative velocity (m/s, rad/s). */
export interface PoseSample extends Pose {
  vx: number
  vy: number
  omega: number
}

export interface Trajectory {
  name: string
  totalTime: number
  /** Clamped to [0, totalTime]; past the end the robot holds the end pose at rest. */
  sample(t: number): PoseSample
  /** Event markers in path order; zoned markers also have the time their zone ends. */
  events: { name: string; time: number; endTime?: number }[]
}

const STEPS_PER_SEGMENT = 80
const DIFF_DT = 0.01
const DEG = Math.PI / 180

/** Wraps an angle to (-π, π]. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

interface PathPoint {
  x: number
  y: number
  /** Waypoint-relative position: segment index + fraction. */
  wp: number
  /** Arc length from the start. */
  s: number
}

export function buildTrajectory(name: string, file: PathFile): Trajectory {
  const W = file.waypoints
  const pts: PathPoint[] = []
  for (let i = 0; i < W.length - 1; i++) {
    const p0 = W[i].anchor
    const p1 = W[i].nextControl ?? p0
    const p3 = W[i + 1].anchor
    const p2 = W[i + 1].prevControl ?? p3
    for (let k = i === 0 ? 0 : 1; k <= STEPS_PER_SEGMENT; k++) {
      const t = k / STEPS_PER_SEGMENT
      const u = 1 - t
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
      pts.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y, wp: i + t, s: 0 })
    }
  }
  for (let i = 1; i < pts.length; i++) {
    pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  const length = pts[pts.length - 1].s

  // Trapezoidal profile (triangle when the path is too short to reach max speed).
  const { maxVelocity: vMax, maxAcceleration: aMax } = file.globalConstraints
  let accelTime = vMax / aMax
  let peak = vMax
  let cruiseTime = 0
  if (aMax * accelTime * accelTime > length) {
    accelTime = Math.sqrt(length / aMax)
    peak = aMax * accelTime
  } else {
    cruiseTime = (length - aMax * accelTime * accelTime) / vMax
  }
  const totalTime = 2 * accelTime + cruiseTime
  const distanceAt = (t: number) => {
    const tc = Math.max(0, Math.min(totalTime, t))
    if (tc < accelTime) return 0.5 * aMax * tc * tc
    if (tc < accelTime + cruiseTime) return 0.5 * aMax * accelTime * accelTime + peak * (tc - accelTime)
    const left = totalTime - tc
    return length - 0.5 * aMax * left * left
  }

  const pointAt = (s: number) => {
    let lo = 0
    let hi = pts.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid].s < s) lo = mid
      else hi = mid
    }
    const a = pts[lo], b = pts[hi]
    const f = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), wp: lerp(a.wp, b.wp, f) }
  }

  // Rotation keys by waypoint-relative position, interpolated the short way round.
  const keys: [number, number][] = [
    [0, file.idealStartingState.rotation * DEG],
    ...file.rotationTargets.map((r): [number, number] => [r.waypointRelativePos, r.rotationDegrees * DEG]),
    [W.length - 1, file.goalEndState.rotation * DEG],
  ].sort((a, b) => a[0] - b[0]) as [number, number][]
  const rotationAt = (wp: number) => {
    let i = 0
    while (i < keys.length - 2 && wp > keys[i + 1][0]) i++
    const [w0, r0] = keys[i]
    const [w1, r1] = keys[i + 1]
    const f = w1 > w0 ? Math.max(0, Math.min(1, (wp - w0) / (w1 - w0))) : 1
    return wrapAngle(r0 + wrapAngle(r1 - r0) * f)
  }

  const poseAt = (t: number): Pose => {
    const p = pointAt(distanceAt(t))
    return { x: p.x, y: p.y, theta: rotationAt(p.wp) }
  }
  const clampT = (t: number) => Math.max(0, Math.min(totalTime, t))
  const sample = (t: number): PoseSample => {
    const pose = poseAt(t)
    const a = poseAt(clampT(t - DIFF_DT))
    const b = poseAt(clampT(t + DIFF_DT))
    const h = 2 * DIFF_DT
    return { ...pose, vx: (b.x - a.x) / h, vy: (b.y - a.y) / h, omega: wrapAngle(b.theta - a.theta) / h }
  }

  // Time at which the path reaches a waypoint-relative position.
  const timeAtWp = (wp: number) => {
    const target = pts.find((p) => p.wp >= wp) ?? pts[pts.length - 1]
    if (target.s <= 0) return 0
    let lo = 0
    let hi = totalTime
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      if (distanceAt(mid) < target.s) lo = mid
      else hi = mid
    }
    return hi
  }
  const events = [...file.eventMarkers]
    .sort((a, b) => a.waypointRelativePos - b.waypointRelativePos)
    .map((m) => {
      const time = timeAtWp(m.waypointRelativePos)
      const end = m.endWaypointRelativePos
      return typeof end === 'number' ? { name: m.name, time, endTime: timeAtWp(end) } : { name: m.name, time }
    })

  return { name, totalTime, sample, events }
}

/** Team 5829's paths used by auto #7, keyed by PathPlanner path name. */
export const TEAM_PATHS: Record<string, Trajectory> = {
  'Straight Back': buildTrajectory('Straight Back', straightBackPath as PathFile),
  'Depot and shoot from Hub Shoot': buildTrajectory('Depot and shoot from Hub Shoot', depotPath as PathFile),
}
