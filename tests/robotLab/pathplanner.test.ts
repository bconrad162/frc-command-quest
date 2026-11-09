import { expect, test } from 'vitest'
import { TEAM_PATHS } from '../../src/game/robotLab/pathplanner.ts'

const sb = TEAM_PATHS['Straight Back']
const depot = TEAM_PATHS['Depot and shoot from Hub Shoot']

test('starts and ends on the anchors with the planned headings', () => {
  const start = sb.sample(0)
  expect(start.x).toBeCloseTo(3.5345, 3)
  expect(start.y).toBeCloseTo(4.0156, 3)
  expect(start.theta).toBeCloseTo(Math.PI, 3)
  const end = depot.sample(depot.totalTime)
  expect(end.x).toBeCloseTo(2.0319, 2)
  expect(end.y).toBeCloseTo(5.6291, 2)
  expect(end.theta).toBeCloseTo((148.011 * Math.PI) / 180, 2)
})

test('Straight Back bulges toward the hub first, like the team drew it', () => {
  // Its first control point (x 4.08) is ahead of the start (x 3.53), so the curve
  // moves toward the hub before backing up: about 1.85 m instead of 1.64 m.
  let maxX = 0
  for (let t = 0; t <= sb.totalTime; t += 0.02) maxX = Math.max(maxX, sb.sample(t).x)
  expect(maxX).toBeGreaterThan(3.6)
})

test('trapezoid timing at 1 m/s and 1 m/s²: 2 s ramping plus cruise', () => {
  // T = 2·(v/a) + (length − v²/a)/v = 2 + (length − 1)
  expect(sb.totalTime).toBeGreaterThan(2.75)
  expect(sb.totalTime).toBeLessThan(2.95)
})

test('event markers become times inside the path', () => {
  expect(depot.events.map((e) => e.name)).toEqual(['extend', 'intake'])
  expect(depot.events[0].time).toBe(0)
  expect(depot.events[1].time).toBeGreaterThan(0)
  expect(depot.events[1].time).toBeLessThan(depot.totalTime)
})

test('zoned markers get an end time; one-shot markers do not', () => {
  const [extend, intake] = depot.events
  expect(extend.endTime).toBeUndefined()
  expect(intake.endTime).toBeGreaterThan(intake.time)
  expect(intake.endTime).toBeLessThan(depot.totalTime)
})

test('never exceeds the path max velocity', () => {
  for (let t = 0; t < depot.totalTime; t += 0.02) {
    const s = depot.sample(t)
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(3.5 + 1e-6)
  }
})

test('samples past the end hold the end pose at rest', () => {
  const s = sb.sample(sb.totalTime + 5)
  expect(s.x).toBeCloseTo(1.8912, 3)
  expect(Math.hypot(s.vx, s.vy)).toBe(0)
})
