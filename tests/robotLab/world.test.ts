import { expect, test } from 'vitest'
import { AUTO_ID, buildAutoScenario, EVENT_IDS, pathId, START_POSE, TELEOP_ID } from '../../src/game/robotLab/scenario.ts'
import { RobotWorld } from '../../src/game/robotLab/world.ts'
import { CommandScheduler } from '../../src/simulation/scheduler.ts'
import type { CycleSnapshot } from '../../src/simulation/types.ts'

function run(passDrivetrain: boolean, seconds = 16) {
  const world = new RobotWorld({ passDrivetrain })
  const scheduler = new CommandScheduler(buildAutoScenario({ passDrivetrain }), { world })
  const snaps: CycleSnapshot[] = []
  for (let i = 0; i < Math.round(seconds / 0.02); i++) snaps.push(scheduler.step())
  return { world, snaps, scheduler }
}

test('with drivetrain: the auto owns the drivetrain and ends at the depot shot', () => {
  const { world, snaps } = run(true)
  expect(snaps[2].owners.drivetrain).toBe(AUTO_ID)
  expect(world.state.pose.x).toBeCloseTo(2.032, 1)
  expect(world.state.pose.y).toBeCloseTo(5.629, 1)
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
  const { world } = run(false, 0.6)
  expect(world.state.driveConflict).toBe(true)
  expect(world.state.ghost).not.toBeNull()
})

test('no conflict when the drivetrain is passed', () => {
  const { world } = run(true, 0.6)
  expect(world.state.driveConflict).toBe(false)
})

test('a zoned event (intake) is canceled at the end of its zone, while the path is still running', () => {
  const world = new RobotWorld({ passDrivetrain: true })
  const scheduler = new CommandScheduler(buildAutoScenario({ passDrivetrain: true }), { world })
  const depot = pathId('Depot and shoot from Hub Shoot')
  let sawIntake = false
  let stoppedWhilePathRan = false
  for (let i = 0; i < 800; i++) {
    scheduler.step()
    if (scheduler.isRunning(EVENT_IDS.intake)) sawIntake = true
    else if (sawIntake) {
      stoppedWhilePathRan = scheduler.isRunning(depot)
      break
    }
  }
  expect(sawIntake).toBe(true)
  expect(stoppedWhilePathRan).toBe(true)
  expect(scheduler.result().outcomes[EVENT_IDS.intake]?.status).toBe('canceled')
})

test('a one-shot event (extend) is canceled when its path ends', () => {
  const world = new RobotWorld({ passDrivetrain: true })
  const scheduler = new CommandScheduler(buildAutoScenario({ passDrivetrain: true }), { world })
  const depot = pathId('Depot and shoot from Hub Shoot')
  let sawPath = false
  for (let i = 0; i < 800; i++) {
    scheduler.step()
    if (scheduler.isRunning(depot)) sawPath = true
    else if (sawPath) break
  }
  expect(scheduler.isRunning(EVENT_IDS.extend)).toBe(false)
  expect(scheduler.result().outcomes[EVENT_IDS.extend]?.status).toBe('canceled')
})

test('runs are deterministic', () => {
  expect(run(true).world.state).toEqual(run(true).world.state)
})

test('a fresh world starts with the preload and nothing in flight', () => {
  run(true, 3)
  const fresh = new RobotWorld({ passDrivetrain: true })
  expect(fresh.state.balls).toEqual([])
  expect(fresh.state.hopper).toBe(8)
  expect(fresh.state.scored).toBe(0)
  expect(fresh.state.pose).toEqual(START_POSE)
})
