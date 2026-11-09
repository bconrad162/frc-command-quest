import { expect, test } from 'vitest'
import { createLabRunner } from '../../src/components/robotLab/useLabRunner.ts'
import { NO_INPUT } from '../../src/game/robotLab/bindings.ts'
import { FREE_PLAY_CODE, parseLabCode } from '../../src/game/robotLab/labCode.ts'
import { TELEOP_START_POSE } from '../../src/game/robotLab/scenario.ts'

const good = parseLabCode(FREE_PLAY_CODE).config!
const forgot = parseLabCode({ ...FREE_PLAY_CODE, driveRequirements: 'this::isRedAlliance' }).config!

test('caps catch-up at 5 loops per frame', () => {
  const r = createLabRunner(good, 'auto')
  r.enable()
  r.advanceFrame(10)
  expect(r.state.cycle).toBe(5)
})

test('steps at real time: one frame of 0.1 s is 5 loops at 1×, 2 loops at ½× after rounding down', () => {
  const r = createLabRunner(good, 'auto')
  r.enable()
  r.advanceFrame(0.1)
  expect(r.state.cycle).toBe(5)
  r.setSpeed(0.5)
  r.advanceFrame(0.1)
  expect(r.state.cycle).toBe(7)
})

test('does nothing until enabled', () => {
  const r = createLabRunner(good, 'teleop')
  r.input = { ...NO_INPUT, leftY: -1 }
  r.advanceFrame(0.1)
  r.advance(1)
  expect(r.state.cycle).toBe(0)
  expect(r.enabled).toBe(false)
})

test('teleop: the live stick drives the robot, and disable stops it where it is', () => {
  const r = createLabRunner(good, 'teleop')
  r.enable()
  r.input = { ...NO_INPUT, leftY: -1 }
  r.advance(1)
  const x = r.state.pose.x
  expect(x - TELEOP_START_POSE.x).toBeGreaterThan(3)
  r.disable()
  r.advance(1)
  expect(r.state.pose.x).toBe(x)
  expect(r.enabled).toBe(false)
})

test('deploy restarts with the new code, disabled', () => {
  const r = createLabRunner(good, 'auto')
  r.enable()
  r.advance(3)
  r.deploy(forgot)
  expect(r.enabled).toBe(false)
  expect(r.state.cycle).toBe(0)
  expect(r.state.hopper).toBe(8)
  expect(r.config.passDrivetrain).toBe(false)
  r.enable()
  r.advance(0.1)
  expect(r.snapshot?.owners.drivetrain).toBe('teleopDrive')
})

test('setMode switches between auto and teleop and resets', () => {
  const r = createLabRunner(good, 'auto')
  r.enable()
  r.advance(0.1)
  expect(r.snapshot?.owners.drivetrain).toBe('auto')
  r.setMode('teleop')
  expect(r.mode).toBe('teleop')
  expect(r.state.cycle).toBe(0)
  r.enable()
  r.advance(0.1)
  expect(r.snapshot?.owners.drivetrain).toBe('teleopDrive')
})

test('auto stops at the end of the period; enabling again starts over', () => {
  const r = createLabRunner(good, 'auto')
  r.enable()
  r.advance(30)
  expect(r.state.cycle).toBe(1000)
  expect(r.finished).toBe(true)
  expect(r.enabled).toBe(false)
  r.enable()
  expect(r.state.cycle).toBe(0)
})

test('a start pose applies to every rebuild', () => {
  const pose = { x: 2, y: 4, theta: Math.PI }
  const r = createLabRunner(good, 'teleop', pose)
  expect(r.state.pose).toEqual(pose)
  r.enable()
  r.input = { ...NO_INPUT, leftY: -1 }
  r.advance(0.5)
  r.reset()
  expect(r.state.pose).toEqual(pose)
})

const onTrueIntake = parseLabCode({ ...FREE_PLAY_CODE, bindings: 'driver.rightTrigger().onTrue(intake.runIntakeCommand());\ndriver.leftBumper().onTrue(pushout.pushCommand());' }).config!

test('disable cancels mechanism commands, as on a real robot (Mechanism.controllableDuringDisabled is false)', () => {
  const r = createLabRunner(onTrueIntake, 'teleop')
  r.enable()
  r.advance(0.1)
  r.input = { ...NO_INPUT, rightTrigger: 1 }
  r.advance(0.1)
  r.input = NO_INPUT
  r.advance(0.1)
  expect(r.state.intakeOn).toBe(true)
  r.disable()
  r.enable()
  r.advance(0.1)
  expect(r.state.intakeOn).toBe(false)
})

test('enable re-seeds the triggers: a button held through Disable/Enable does not fire onTrue', () => {
  const r = createLabRunner(onTrueIntake, 'teleop')
  r.enable()
  r.advance(0.1)
  r.disable()
  r.input = { ...NO_INPUT, buttons: new Set(['leftBumper']) }
  r.enable()
  r.advance(0.5)
  expect(r.state.pushout).toBe(0)
})

test('disable mid-auto stops the auto; enabling autonomous again starts it over', () => {
  const r = createLabRunner(good, 'auto')
  r.enable()
  r.advance(3)
  r.disable()
  r.enable()
  expect(r.state.cycle).toBe(0)
  r.advance(0.1)
  expect(r.snapshot?.owners.drivetrain).toBe('auto')
})
