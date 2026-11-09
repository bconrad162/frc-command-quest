/**
 * The Java files the Robot Lab's editor shows. RobotContainer.java is a template
 * with three editable regions; the mechanism files are read-only, so students can
 * see what each command factory requires. Illustrative team code in Commands v3
 * style (org.wpilib.command3); the lab reads only the regions.
 */
import type { LabRegions, RegionId } from '../../game/robotLab/labCode.ts'

type Part = string | { region: RegionId; indent: string }

const ROBOT_CONTAINER: Part[] = [
  `package frc.robot;

import com.pathplanner.lib.command3.AutoBuilder;
import com.pathplanner.lib.command3.NamedCommands;
import com.pathplanner.lib.command3.PathPlannerAuto;
import frc.robot.subsystems.*;
import org.wpilib.command3.Command;
import org.wpilib.command3.button.CommandXboxController;
import org.wpilib.driverstation.DriverStation;
import org.wpilib.driverstation.DriverStation.Alliance;

public class RobotContainer {
  private final CommandXboxController driver = new CommandXboxController(0);
  private final Drivetrain drivetrain = new Drivetrain();
  private final Pushout pushout = new Pushout();
  private final Intake intake = new Intake();
  private final Shooter shooter = new Shooter();

  public RobotContainer() {
    // Named commands first: autos look them up when they are built.
    NamedCommands.registerCommand("Shoot Preload", shooter.shootPreloadCommand());
    NamedCommands.registerCommand("Control All Shooting", shooter.controlAllShootingCommand());
    NamedCommands.registerCommand("extend", pushout.pushCommand());
    NamedCommands.registerCommand("intake", intake.runIntakeCommand());

    AutoBuilder.configure(
        drivetrain::getPose,
        drivetrain::resetPose,
        drivetrain::getRobotVelocity,
        drivetrain::driveRobotRelative,
        Constants.PATH_CONTROLLER,
        Constants.ROBOT_CONFIG,
        // shouldFlipPath, then the drive requirements (Mechanism...):
        `,
  { region: 'driveRequirements', indent: '        ' },
  `);

    `,
  { region: 'defaultCommand', indent: '    ' },
  `

    configureBindings();
  }

  private void configureBindings() {
    `,
  { region: 'bindings', indent: '    ' },
  `
  }

  public Command getAutonomousCommand() {
    return new PathPlannerAuto("#7 - Straight Back Depot");
  }

  private boolean isRedAlliance() {
    return DriverStation.getAlliance().orElse(Alliance.Blue) == Alliance.Red;
  }
}
`,
]

/** Indents every line after the first (the template already indents the first). */
const indentRest = (text: string, indent: string) => text.replace(/\n/g, `\n${indent}`)

export function buildRobotContainer(regions: LabRegions): { doc: string; ranges: Record<RegionId, { from: number; to: number }> } {
  let doc = ''
  const ranges = {} as Record<RegionId, { from: number; to: number }>
  for (const part of ROBOT_CONTAINER) {
    if (typeof part === 'string') {
      doc += part
      continue
    }
    const text = indentRest(regions[part.region], part.indent)
    ranges[part.region] = { from: doc.length, to: doc.length + text.length }
    doc += text
  }
  return { doc, ranges }
}

/** Removes the indentation buildRobotContainer added, so region text reads the same either way. */
export function unindentRegion(region: RegionId, text: string): string {
  const part = ROBOT_CONTAINER.find((p): p is { region: RegionId; indent: string } => typeof p !== 'string' && p.region === region)
  if (!part) return text
  return text
    .split('\n')
    .map((l, i) => (i > 0 && l.startsWith(part.indent) ? l.slice(part.indent.length) : l))
    .join('\n')
}

/** 1-based line in RobotContainer.java for a 1-based line within a region. */
export function regionLineToFileLine(regions: LabRegions, region: RegionId, line: number): number {
  const { doc, ranges } = buildRobotContainer(regions)
  return doc.slice(0, ranges[region].from).split('\n').length + line - 1
}

export const READ_ONLY_FILES: { path: string; code: string }[] = [
  {
    path: 'Drivetrain.java',
    code: `public class Drivetrain implements Mechanism {
  /** Field-relative swerve drive; reads the suppliers every loop. */
  public Command teleopDrive(DoubleSupplier forward, DoubleSupplier strafe, DoubleSupplier turn) {
    return run(coroutine -> {
      while (true) {
        driveFieldRelative(forward.getAsDouble() * MAX_SPEED,
            strafe.getAsDouble() * MAX_SPEED,
            turn.getAsDouble() * MAX_ANGULAR_SPEED);
        coroutine.yield();
      }
    }).withPriority(Command.LOWEST_PRIORITY).named("TeleopDrive");
  }
}
`,
  },
  {
    path: 'Intake.java',
    code: `public class Intake implements Mechanism {
  /** Spins the rollers until canceled. Requires: intake. */
  public Command runIntakeCommand() {
    return runRepeatedly(() -> setRollers(INTAKE_SPEED)).named("intake");
  }
}
`,
  },
  {
    path: 'Pushout.java',
    code: `public class Pushout implements Mechanism {
  /** Pushes the intake out and holds it there. Requires: pushout. */
  public Command pushCommand() {
    return runRepeatedly(() -> setPosition(OUT)).named("extend");
  }

  /** Pulls the intake back in and holds it. Requires: pushout. */
  public Command retractCommand() {
    return runRepeatedly(() -> setPosition(IN)).named("retract");
  }
}
`,
  },
  {
    path: 'Shooter.java',
    code: `public class Shooter implements Mechanism {
  /** Spins up, then feeds fuel until canceled. Requires: shooter. */
  public Command shootFuelCommand() {
    return run(coroutine -> {
      spinUp();
      coroutine.wait(Milliseconds.of(500)); // 25 loops
      while (true) {
        feed(); // one fuel every 8 loops while the hopper has fuel
        coroutine.yield();
      }
    }).named("shootFuel");
  }
}
`,
  },
]
