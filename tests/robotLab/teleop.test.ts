import { describe, expect, test } from 'vitest'
import { NO_INPUT, type LabInput } from '../../src/game/robotLab/bindings.ts'
import { FREE_PLAY_CODE, parseLabCode, type LabConfig, type LabRegions } from '../../src/game/robotLab/labCode.ts'
import { runLab } from '../../src/game/robotLab/labSim.ts'
import { FIELD_W } from '../../src/game/robotLab/scenario.ts'
import { HUB } from '../../src/game/robotLab/world.ts'
import type { ControlId } from '../../src/game/controller.ts'

const config = (patch: Partial<LabRegions> = {}): LabConfig => {
  const { config, problems } = parseLabCode({ ...FREE_PLAY_CODE, ...patch })
  if (!config) throw new Error(JSON.stringify(problems))
  return config
}
const stick = (patch: Partial<LabInput>): LabInput => ({ ...NO_INPUT, ...patch })
const hold = (control: ControlId, from: number, to: number) => (t: number): LabInput =>
  t >= from && t < to
    ? control === 'rightTrigger'
      ? stick({ rightTrigger: 1 })
      : stick({ buttons: new Set([control]) })
    : NO_INPUT
const at = (r: ReturnType<typeof runLab>, t: number) => r.samples.find((s) => Math.abs(s.t - t) < 0.011)!.state

describe('auto through the lab config', () => {
  test('with drivetrain the auto scores most of its fuel; without, far less', () => {
    const good = runLab(config(), 'auto', () => NO_INPUT, 16)
    const bad = runLab(config({ driveRequirements: 'this::isRedAlliance' }), 'auto', () => NO_INPUT, 16)
    expect(good.world.state.scored).toBeGreaterThanOrEqual(20)
    expect(bad.world.state.scored).toBeLessThan(good.world.state.scored)
  })
})

describe('teleop driving', () => {
  test('stick forward (leftY = -1) for 1 s drives away from the driver station', () => {
    const r = runLab(config(), 'teleop', (t) => (t < 1 ? stick({ leftY: -1 }) : NO_INPUT), 1.2)
    expect(at(r, 1.0).pose.x - at(r, 0.02).pose.x).toBeGreaterThan(3)
  })

  test('without the minus, forward drives backward', () => {
    const r = runLab(
      config({ defaultCommand: 'drivetrain.setDefaultCommand(drivetrain.teleopDrive(() -> driver.getLeftY(), () -> -driver.getLeftX(), () -> -driver.getRightX()));' }),
      'teleop',
      (t) => (t < 1 ? stick({ leftY: -1 }) : NO_INPUT),
      1.2,
    )
    expect(at(r, 1.0).pose.x - at(r, 0.02).pose.x).toBeLessThan(-1)
  })

  test('stick left (leftX = -1) strafes left (+y)', () => {
    const r = runLab(config(), 'teleop', (t) => (t < 0.5 ? stick({ leftX: -1 }) : NO_INPUT), 0.6)
    expect(at(r, 0.5).pose.y - at(r, 0.02).pose.y).toBeGreaterThan(1)
  })

  test('right stick left turns counterclockwise', () => {
    const r = runLab(config(), 'teleop', (t) => (t < 0.2 ? stick({ rightX: -1 }) : NO_INPUT), 0.3)
    expect(at(r, 0.2).pose.theta).not.toBeCloseTo(at(r, 0.02).pose.theta, 1)
  })

  test('a stick inside the 0.1 deadband does nothing', () => {
    const r = runLab(config(), 'teleop', () => stick({ leftY: -0.05, leftX: 0.08 }), 1)
    expect(r.world.state.pose.x).toBeCloseTo(at(r, 0.02).pose.x, 6)
    expect(r.world.state.pose.y).toBeCloseTo(at(r, 0.02).pose.y, 6)
  })

  test('the robot stays inside the field walls', () => {
    const r = runLab(config(), 'teleop', () => stick({ leftX: 1 }), 5)
    expect(r.world.state.pose.y).toBeGreaterThanOrEqual(0.43)
    expect(r.world.state.pose.y).toBeLessThan(FIELD_W)
  })

  test('no default command: the sticks do nothing', () => {
    const r = runLab(config({ defaultCommand: '' }), 'teleop', () => stick({ leftY: -1 }), 1)
    expect(Math.abs(r.world.state.pose.x - at(r, 0.02).pose.x)).toBeLessThan(1e-9)
  })
})

describe('bindings', () => {
  test('whileTrue: the intake runs only while RT is held', () => {
    const r = runLab(config(), 'teleop', hold('rightTrigger', 1, 2), 3)
    expect(at(r, 0.5).intakeOn).toBe(false)
    expect(at(r, 1.5).intakeOn).toBe(true)
    expect(at(r, 2.5).intakeOn).toBe(false)
  })

  test('onTrue: the intake keeps running after RT is released', () => {
    const r = runLab(config({ bindings: 'driver.rightTrigger().onTrue(intake.runIntakeCommand());' }), 'teleop', hold('rightTrigger', 1, 2), 3)
    expect(at(r, 2.5).intakeOn).toBe(true)
  })

  test('toggleOnTrue: the first press starts it, the second stops it', () => {
    const cfg = config({ bindings: 'driver.b().toggleOnTrue(intake.runIntakeCommand());' })
    const script = (t: number) => ((t >= 0.5 && t < 0.7) || (t >= 1.5 && t < 1.7) ? stick({ buttons: new Set(['b']) }) : NO_INPUT)
    const r = runLab(cfg, 'teleop', script, 2)
    expect(at(r, 1.0).intakeOn).toBe(true)
    expect(at(r, 1.9).intakeOn).toBe(false)
  })

  test('onFalse: starts when the button is released', () => {
    const r = runLab(config({ bindings: 'driver.x().onFalse(intake.runIntakeCommand());' }), 'teleop', hold('x', 0.5, 1), 1.5)
    expect(at(r, 0.8).intakeOn).toBe(false)
    expect(at(r, 1.3).intakeOn).toBe(true)
  })

  test('a button already held when the robot is enabled does not fire onTrue', () => {
    const r = runLab(config({ bindings: 'driver.x().onTrue(intake.runIntakeCommand());' }), 'teleop', hold('x', 0, 1), 1.2)
    expect(at(r, 0.5).intakeOn).toBe(false)
  })

  test('pushCommand extends the pushout and retractCommand brings it back', () => {
    const script = (t: number) =>
      t >= 0.2 && t < 0.3 ? stick({ buttons: new Set(['leftBumper']) }) : t >= 1.2 && t < 1.3 ? stick({ buttons: new Set(['rightBumper']) }) : NO_INPUT
    const r = runLab(config(), 'teleop', script, 2.2)
    expect(at(r, 1.0).pushout).toBeGreaterThan(0.2)
    expect(at(r, 2.2).pushout).toBeLessThan(0.02)
  })
})

describe('shooting', () => {
  const facingHub = { x: HUB.x - 2.5, y: HUB.y, theta: Math.PI }
  test('with the shooter (the back of the robot) facing the hub, holding A scores', () => {
    const r = runLab(config(), 'teleop', hold('a', 0.2, 3.2), 4.5, facingHub)
    expect(r.world.state.scored).toBeGreaterThanOrEqual(3)
  })

  test('facing away from the hub, the shots miss', () => {
    const r = runLab(config(), 'teleop', hold('a', 0.2, 3.2), 4.5, { ...facingHub, theta: 0 })
    expect(r.world.state.scored).toBe(0)
  })
})

test('runs are deterministic', () => {
  const script = (t: number) => stick({ leftY: -Math.sin(t), rightX: 0.4, rightTrigger: t > 1 ? 1 : 0 })
  const a = runLab(config(), 'teleop', script, 3)
  const b = runLab(config(), 'teleop', script, 3)
  expect(a.samples).toEqual(b.samples)
  expect(a.world.state).toEqual(b.world.state)
})

test('the hub is solid: driving at it stops at its edge', () => {
  // Start in front of the blue hub and drive straight at it.
  const r = runLab(config(), 'teleop', () => stick({ leftY: -1 }), 2, { x: HUB.x - 2, y: HUB.y, theta: 0 })
  expect(r.world.state.pose.x).toBeLessThan(HUB.x - 0.6)
  expect(r.world.state.pose.x).toBeGreaterThan(HUB.x - 1.3)
})

test('touching the hub, the robot can still slide sideways', () => {
  const script = (t: number) => (t < 1 ? stick({ leftY: -1 }) : stick({ leftY: -1, leftX: -1 }))
  const r = runLab(config(), 'teleop', script, 2, { x: HUB.x - 2, y: HUB.y, theta: 0 })
  expect(r.world.state.pose.y).toBeGreaterThan(HUB.y + 1)
})
