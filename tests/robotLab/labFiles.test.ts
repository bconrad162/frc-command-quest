import { expect, test } from 'vitest'
import { buildRobotContainer, READ_ONLY_FILES, regionLineToFileLine } from '../../src/components/robotLab/labFiles.ts'
import { FREE_PLAY_CODE, REGION_IDS } from '../../src/game/robotLab/labCode.ts'

test('each region range holds exactly that region (later lines indented)', () => {
  const { doc, ranges } = buildRobotContainer(FREE_PLAY_CODE)
  for (const id of REGION_IDS) {
    const text = doc.slice(ranges[id].from, ranges[id].to)
    expect(text.replace(/\n\s+/g, '\n')).toBe(FREE_PLAY_CODE[id].replace(/\n\s+/g, '\n'))
  }
})

test('the file reads like a Commands v3 RobotContainer', () => {
  const { doc } = buildRobotContainer(FREE_PLAY_CODE)
  expect(doc).toContain('import org.wpilib.command3.button.CommandXboxController;')
  expect(doc).toContain('import com.pathplanner.lib.command3.AutoBuilder;')
  expect(doc).toContain('        this::isRedAlliance, drivetrain);')
  expect(doc).toContain('  private void configureBindings() {\n    driver.rightTrigger().whileTrue(intake.runIntakeCommand());')
  expect(doc).not.toMatch(/edu\.wpi\.first\.wpilibj2/)
})

test('region lines map to file lines', () => {
  const { doc, ranges } = buildRobotContainer(FREE_PLAY_CODE)
  const lineAt = (pos: number) => doc.slice(0, pos).split('\n').length
  expect(regionLineToFileLine(FREE_PLAY_CODE, 'bindings', 1)).toBe(lineAt(ranges.bindings.from))
  expect(regionLineToFileLine(FREE_PLAY_CODE, 'bindings', 3)).toBe(lineAt(ranges.bindings.from) + 2)
  expect(regionLineToFileLine(FREE_PLAY_CODE, 'driveRequirements', 1)).toBe(lineAt(ranges.driveRequirements.from))
})

test('read-only mechanism files show each lab command and what it requires', () => {
  const all = READ_ONLY_FILES.map((f) => f.code).join('\n')
  for (const name of ['runIntakeCommand', 'pushCommand', 'retractCommand', 'shootFuelCommand', 'teleopDrive']) expect(all).toContain(`public Command ${name}(`)
  expect(READ_ONLY_FILES.map((f) => f.path)).toEqual(['Drivetrain.java', 'Intake.java', 'Pushout.java', 'Shooter.java'])
})

test('the Java compiles as Commands v3: Mechanism is an interface, and every type used is imported', () => {
  const { doc } = buildRobotContainer(FREE_PLAY_CODE)
  for (const f of READ_ONLY_FILES) {
    expect(f.code).toMatch(/implements Mechanism/)
    expect(f.code).not.toMatch(/extends Mechanism/)
  }
  expect(doc).toContain('import org.wpilib.driverstation.DriverStation;')
  expect(doc).toContain('import org.wpilib.driverstation.DriverStation.Alliance;')
})
