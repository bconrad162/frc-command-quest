import { describe, expect, test } from 'vitest'
import { FREE_PLAY_CODE } from '../../src/game/robotLab/labCode.ts'
import { checkMission, LAB_MISSIONS } from '../../src/game/robotLab/missions.ts'

const mission = (id: string) => LAB_MISSIONS.find((m) => m.id === id)!

test('missions come in the spec order', () => {
  expect(LAB_MISSIONS.map((m) => m.id)).toEqual(['fix-auto', 'forward-backward', 'intake-wont-stop', 'add-shoot-button'])
})

describe.each(LAB_MISSIONS.map((m) => [m.id, m] as const))('%s', (_id, m) => {
  test('its starting code fails', () => {
    expect(checkMission(m, m.start).passed).toBe(false)
  })
  test('its solution passes', () => {
    const r = checkMission(m, m.solution)
    expect(r.message).toBeTruthy()
    expect(r.passed).toBe(true)
  })
  test('it starts from the free-play code with one region changed', () => {
    const changed = (Object.keys(FREE_PLAY_CODE) as (keyof typeof FREE_PLAY_CODE)[]).filter((k) => m.start[k] !== FREE_PLAY_CODE[k])
    expect(changed).toHaveLength(1)
  })
})

test('fix-auto explains that the path command required nothing', () => {
  const m = mission('fix-auto')
  expect(checkMission(m, m.start).message).toMatch(/TeleopDrive/)
})

test('forward-backward says which way the robot went', () => {
  const m = mission('forward-backward')
  expect(checkMission(m, m.start).message).toMatch(/toward your driver station/)
})

test('intake-wont-stop says the intake kept running', () => {
  const m = mission('intake-wont-stop')
  expect(checkMission(m, m.start).message).toMatch(/kept running/)
})

test('add-shoot-button: no binding yet, then toggle keeps shooting, then whileTrue on any button passes', () => {
  const m = mission('add-shoot-button')
  expect(checkMission(m, m.start).message).toMatch(/No button runs `shooter\.shootFuelCommand\(\)`/)
  const toggle = { ...m.start, bindings: m.start.bindings + '\ndriver.y().toggleOnTrue(shooter.shootFuelCommand());' }
  expect(checkMission(m, toggle)).toMatchObject({ passed: false, message: expect.stringMatching(/still running/) })
  const x = { ...m.start, bindings: m.start.bindings + '\ndriver.x().whileTrue(shooter.shootFuelCommand());' }
  expect(checkMission(m, x).passed).toBe(true)
})

test('a line the lab cannot read fails with that problem', () => {
  const m = mission('intake-wont-stop')
  expect(checkMission(m, { ...m.start, bindings: 'driver.povUp().onTrue(pushout.pushCommand());' })).toEqual({
    passed: false,
    message: 'Line 1 of configureBindings(): `povUp()` is the 2026 name; Commands v3 uses `dpadUp()`.',
  })
})

test('checks are deterministic', () => {
  for (const m of LAB_MISSIONS) expect(checkMission(m, m.start)).toEqual(checkMission(m, m.start))
})

test('fix-auto: deleting the default command instead of passing drivetrain does not pass', () => {
  const m = mission('fix-auto')
  const r = checkMission(m, { ...m.start, defaultCommand: '' })
  expect(r.passed).toBe(false)
  expect(r.message).toMatch(/nothing drives in teleop/)
})
