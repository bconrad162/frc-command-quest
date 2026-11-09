import { describe, expect, test } from 'vitest'
import { FREE_PLAY_CODE, parseLabCode, type LabRegions } from '../../src/game/robotLab/labCode.ts'

const withRegion = (patch: Partial<LabRegions>): LabRegions => ({ ...FREE_PLAY_CODE, ...patch })
const problemsOf = (patch: Partial<LabRegions>) => parseLabCode(withRegion(patch)).problems
const firstMessage = (patch: Partial<LabRegions>) => problemsOf(patch)[0]?.message ?? ''

test('the free-play code parses with no problems', () => {
  const { config, problems } = parseLabCode(FREE_PLAY_CODE)
  expect(problems).toEqual([])
  expect(config).toEqual({
    passDrivetrain: true,
    teleop: {
      forward: { axis: 'leftY', sign: -1 },
      strafe: { axis: 'leftX', sign: -1 },
      turn: { axis: 'rightX', sign: -1 },
    },
    bindings: [
      { control: 'rightTrigger', kind: 'whileTrue', command: 'runIntake', line: 1 },
      { control: 'leftBumper', kind: 'onTrue', command: 'push', line: 2 },
      { control: 'rightBumper', kind: 'onTrue', command: 'retract', line: 3 },
      { control: 'a', kind: 'whileTrue', command: 'shootFuel', line: 4 },
    ],
  })
})

test('whitespace and line breaks inside the default command are fine', () => {
  const { config } = parseLabCode(
    withRegion({
      defaultCommand: 'drivetrain.setDefaultCommand(\n    drivetrain.teleopDrive(\n        () -> driver.getLeftY(),\n        () ->  -driver.getLeftX(),\n        () -> -driver.getRightX()));',
    }),
  )
  expect(config?.teleop?.forward).toEqual({ axis: 'leftY', sign: 1 })
})

test('an empty or commented-out default command means no default command', () => {
  expect(parseLabCode(withRegion({ defaultCommand: '' })).config?.teleop).toBeNull()
  expect(parseLabCode(withRegion({ defaultCommand: '// drivetrain.setDefaultCommand(...);' })).config?.teleop).toBeNull()
})

test('blank lines and comments in configureBindings are ignored, and lines are counted', () => {
  const { config } = parseLabCode(withRegion({ bindings: '// Driver\n\ndriver.b().toggleOnTrue(intake.runIntakeCommand()); // tap to toggle\n' }))
  expect(config?.bindings).toEqual([{ control: 'b', kind: 'toggleOnTrue', command: 'runIntake', line: 3 }])
})

test('without drivetrain in configure(...) the path commands require nothing', () => {
  expect(parseLabCode(withRegion({ driveRequirements: 'this::isRedAlliance' })).config?.passDrivetrain).toBe(false)
})

describe('problems', () => {
  test.each([
    ['povUp', 'dpadUp'],
    ['start', 'menu'],
    ['back', 'view'],
  ])('%s() gets the 2026-name tip', (v2, v3) => {
    expect(firstMessage({ bindings: `driver.${v2}().onTrue(pushout.pushCommand());` })).toBe(
      `\`${v2}()\` is the 2026 name; Commands v3 uses \`${v3}()\`.`,
    )
  })

  test.each([
    ['whenPressed', 'onTrue'],
    ['whileHeld', 'whileTrue'],
    ['toggleWhenPressed', 'toggleOnTrue'],
  ])('%s is from older WPILib', (old, v3) => {
    expect(firstMessage({ bindings: `driver.a().${old}(pushout.pushCommand());` })).toBe(
      `\`${old}()\` is from older WPILib; Commands v3 uses \`${v3}()\`.`,
    )
  })

  test('an unknown command lists what the lab has', () => {
    const msg = firstMessage({ bindings: 'driver.a().onTrue(shooter.fire());' })
    expect(msg).toContain('`shooter.fire()`')
    for (const c of ['intake.runIntakeCommand()', 'pushout.pushCommand()', 'pushout.retractCommand()', 'shooter.shootFuelCommand()'])
      expect(msg).toContain(c)
  })

  test('a missing semicolon', () => {
    expect(problemsOf({ bindings: 'driver.a().onTrue(pushout.pushCommand())' })).toEqual([
      { region: 'bindings', line: 1, message: 'Java statements end with a semicolon.' },
    ])
  })

  test('unbalanced parentheses', () => {
    expect(firstMessage({ bindings: 'driver.a().onTrue(pushout.pushCommand();' })).toBe("Check your parentheses: the ( and ) don't match.")
  })

  test('teleopDrive needs suppliers, not values', () => {
    const problems = problemsOf({
      defaultCommand: 'drivetrain.setDefaultCommand(drivetrain.teleopDrive(\n  -driver.getLeftY(),\n  () -> -driver.getLeftX(),\n  () -> -driver.getRightX()));',
    })
    expect(problems).toEqual([
      {
        region: 'defaultCommand',
        line: 2,
        message: 'teleopDrive takes suppliers: write `() -> -driver.getLeftY()`, so it reads the stick every loop.',
      },
    ])
  })

  test('teleopDrive needs three suppliers', () => {
    expect(firstMessage({ defaultCommand: 'drivetrain.setDefaultCommand(drivetrain.teleopDrive(() -> -driver.getLeftY()));' })).toBe(
      'teleopDrive takes three suppliers: forward, strafe and turn.',
    )
  })

  test('drive requirements must be the drive mechanism', () => {
    expect(firstMessage({ driveRequirements: 'this::isRedAlliance, shooter' })).toContain('`drivetrain`')
  })

  test('anything else is a line the lab does not understand, on the right line', () => {
    expect(problemsOf({ bindings: 'driver.a().onTrue(pushout.pushCommand());\nSystem.out.println("hi");' })).toEqual([
      { region: 'bindings', line: 2, message: "The lab doesn't understand this line." },
    ])
  })

  test('problems mean no config', () => {
    expect(parseLabCode(withRegion({ bindings: 'oops' })).config).toBeNull()
  })

  test('never throws on any half-typed version of the code', () => {
    for (const region of ['driveRequirements', 'defaultCommand', 'bindings'] as const) {
      const full = FREE_PLAY_CODE[region]
      for (let i = 0; i <= full.length; i++) {
        expect(() => parseLabCode(withRegion({ [region]: full.slice(0, i) }))).not.toThrow()
      }
    }
  })
})

test.each(['leftStick', 'rightStick', 'xbox'])('%s() is a real trigger the lab just does not model', (t) => {
  expect(firstMessage({ bindings: `driver.${t}().onTrue(pushout.pushCommand());` })).toBe(
    `\`${t}()\` is a real CommandXboxController trigger, but the lab's controller doesn't have it. Try a button, bumper, trigger or the d-pad.`,
  )
})
