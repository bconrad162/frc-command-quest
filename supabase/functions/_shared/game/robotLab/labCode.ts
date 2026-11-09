/**
 * Reads the Robot Lab's editable regions of RobotContainer.java into a config the
 * lab can run. Nothing here evaluates Java: each region accepts a small, fixed set
 * of line forms, and anything else becomes a Problem with a line number.
 *
 * Pure TypeScript: no DOM, React or three.js.
 */
import type { ControlId } from '../controller.ts'
import type { CommandId } from '../../simulation/types.ts'
import type { LabMechanism } from './scenario.ts'

export type RegionId = 'driveRequirements' | 'defaultCommand' | 'bindings'
export type LabRegions = Record<RegionId, string>
export const REGION_IDS: readonly RegionId[] = ['driveRequirements', 'defaultCommand', 'bindings']

export type LabCommandKey = 'runIntake' | 'push' | 'retract' | 'shootFuel'

/**
 * Command factories the lab's mechanism classes offer (team 5829 names where they exist).
 * The intake and extend ids are the same commands auto #7's event markers run (scenario.ts EVENT_IDS).
 */
export const LAB_COMMANDS: Record<LabCommandKey, { java: string; id: CommandId; name: string; requirements: LabMechanism[] }> = {
  runIntake: { java: 'intake.runIntakeCommand()', id: 'intake', name: 'intake', requirements: ['intake'] },
  push: { java: 'pushout.pushCommand()', id: 'extend', name: 'extend', requirements: ['pushout'] },
  retract: { java: 'pushout.retractCommand()', id: 'retract', name: 'retract', requirements: ['pushout'] },
  shootFuel: { java: 'shooter.shootFuelCommand()', id: 'shootFuel', name: 'shootFuel', requirements: ['shooter'] },
}
const COMMAND_KEYS = Object.keys(LAB_COMMANDS) as LabCommandKey[]

export type BindingKind = 'onTrue' | 'onFalse' | 'whileTrue' | 'toggleOnTrue'
export type AxisId = 'leftX' | 'leftY' | 'rightX' | 'rightY'
export interface AxisRef {
  axis: AxisId
  sign: 1 | -1
}
export interface TeleopMapping {
  forward: AxisRef
  strafe: AxisRef
  turn: AxisRef
}
export interface LabBinding {
  control: ControlId
  kind: BindingKind
  command: LabCommandKey
  /** 1-based line within the bindings region. */
  line: number
}
export interface LabConfig {
  /** `drivetrain` was passed as AutoBuilder.configure(...)'s drive requirement. */
  passDrivetrain: boolean
  /** The drivetrain's default command, or null when there is none. */
  teleop: TeleopMapping | null
  bindings: LabBinding[]
}
export interface LabProblem {
  region: RegionId
  /** 1-based line within the region. */
  line: number
  message: string
}

/** The correct code: free play starts here, and every mission starts from it with one bug. */
export const FREE_PLAY_CODE: LabRegions = {
  driveRequirements: 'this::isRedAlliance, drivetrain',
  defaultCommand: [
    'drivetrain.setDefaultCommand(',
    '    drivetrain.teleopDrive(',
    '        () -> -driver.getLeftY(),   // forward',
    '        () -> -driver.getLeftX(),   // strafe left',
    '        () -> -driver.getRightX())); // turn left',
  ].join('\n'),
  bindings: [
    'driver.rightTrigger().whileTrue(intake.runIntakeCommand());',
    'driver.leftBumper().onTrue(pushout.pushCommand());',
    'driver.rightBumper().onTrue(pushout.retractCommand());',
    'driver.a().whileTrue(shooter.shootFuelCommand());',
  ].join('\n'),
}

const TRIGGERS: Record<string, ControlId> = {
  a: 'a',
  b: 'b',
  x: 'x',
  y: 'y',
  leftBumper: 'leftBumper',
  rightBumper: 'rightBumper',
  leftTrigger: 'leftTrigger',
  rightTrigger: 'rightTrigger',
  dpadUp: 'dpadUp',
  dpadDown: 'dpadDown',
  dpadLeft: 'dpadLeft',
  dpadRight: 'dpadRight',
  view: 'view',
  menu: 'menu',
}
/** Real CommandXboxController triggers the lab's controller doesn't have (stick clicks, the Xbox button). */
const UNMODELED_TRIGGERS = new Set(['leftStick', 'rightStick', 'xbox'])
const V2_TRIGGERS: Record<string, string> = { povUp: 'dpadUp', povDown: 'dpadDown', povLeft: 'dpadLeft', povRight: 'dpadRight', start: 'menu', back: 'view' }
const BINDINGS = new Set<string>(['onTrue', 'onFalse', 'whileTrue', 'toggleOnTrue'])
const OLD_BINDINGS: Record<string, BindingKind> = { whenPressed: 'onTrue', whenReleased: 'onFalse', whileHeld: 'whileTrue', toggleWhenPressed: 'toggleOnTrue' }

const DONT_UNDERSTAND = "The lab doesn't understand this line."
const SEMICOLON = 'Java statements end with a semicolon.'
const PARENS = "Check your parentheses: the ( and ) don't match."

const stripComment = (line: string) => line.replace(/\/\/.*$/, '')
const compact = (text: string) => text.replace(/\s+/g, '')
const balanced = (text: string) => {
  let depth = 0
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')' && --depth < 0) return false
  }
  return depth === 0
}
const listCommands = () => COMMAND_KEYS.map((k) => LAB_COMMANDS[k].java).join(', ')

function parseDriveRequirements(text: string, problems: LabProblem[]): boolean {
  const code = compact(stripComment(text))
  const problem = (message: string) => problems.push({ region: 'driveRequirements', line: 1, message })
  const m = /^this::isRedAlliance(?:,(.*))?$/.exec(code)
  if (!m) {
    problem('Keep `this::isRedAlliance` (should the path flip for red?) first, then the drive requirements.')
    return false
  }
  if (m[1] === undefined) return false
  if (m[1] === 'drivetrain') return true
  problem('The drive requirements are the mechanisms every path command requires: pass the drive mechanism, `drivetrain`.')
  return false
}

const AXIS = /^(-?)driver\.get(Left|Right)(X|Y)\(\)$/

function parseDefaultCommand(text: string, problems: LabProblem[]): TeleopMapping | null {
  const lines = text.split('\n')
  const code = compact(lines.map(stripComment).join('\n'))
  if (code === '') return null
  const lineOf = (needle: string) => {
    const i = lines.findIndex((l) => compact(stripComment(l)).includes(needle))
    return i < 0 ? 1 : i + 1
  }
  const problem = (message: string, line = 1) => {
    problems.push({ region: 'defaultCommand', line, message })
    return null
  }
  if (!balanced(code)) return problem(PARENS)
  if (!code.endsWith(';')) return problem(SEMICOLON, lines.length)
  const m = /^drivetrain\.setDefaultCommand\(drivetrain\.teleopDrive\((.*)\)\);$/.exec(code)
  if (!m) return problem(DONT_UNDERSTAND)
  const args = splitTopLevel(m[1])
  if (args.length !== 3) return problem('teleopDrive takes three suppliers: forward, strafe and turn.')
  const refs: AxisRef[] = []
  for (const arg of args) {
    if (AXIS.test(arg)) {
      return problem(`teleopDrive takes suppliers: write \`() -> ${arg}\`, so it reads the stick every loop.`, lineOf(arg))
    }
    const sup = /^\(\)->(.*)$/.exec(arg)
    const axis = sup && AXIS.exec(sup[1])
    if (!axis) return problem('Each teleopDrive argument reads one stick axis, like `() -> -driver.getLeftY()`.', lineOf(arg))
    refs.push({ axis: `${axis[2].toLowerCase()}${axis[3]}` as AxisId, sign: axis[1] === '-' ? -1 : 1 })
  }
  return { forward: refs[0], strafe: refs[1], turn: refs[2] }
}

function splitTopLevel(args: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < args.length; i++) {
    const ch = args[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(args.slice(start, i))
      start = i + 1
    }
  }
  out.push(args.slice(start))
  return out.filter((a) => a !== '')
}

function parseBindings(text: string, problems: LabProblem[]): LabBinding[] {
  const bindings: LabBinding[] = []
  text.split('\n').forEach((raw, i) => {
    const line = i + 1
    const code = compact(stripComment(raw))
    if (code === '') return
    const problem = (message: string) => problems.push({ region: 'bindings', line, message })
    if (!balanced(code)) return problem(PARENS)
    const m = /^(\w+)\.(\w+)\(\)\.(\w+)\((.*)\)(;?)$/.exec(code)
    if (!m) return problem(DONT_UNDERSTAND)
    const [, controller, trigger, binding, command, semi] = m
    if (controller !== 'driver') return problem('This RobotContainer names the controller `driver`.')
    if (V2_TRIGGERS[trigger]) return problem(`\`${trigger}()\` is the 2026 name; Commands v3 uses \`${V2_TRIGGERS[trigger]}()\`.`)
    if (UNMODELED_TRIGGERS.has(trigger))
      return problem(`\`${trigger}()\` is a real CommandXboxController trigger, but the lab's controller doesn't have it. Try a button, bumper, trigger or the d-pad.`)
    const control = TRIGGERS[trigger]
    if (!control) return problem(`\`${trigger}()\` isn't a CommandXboxController trigger.`)
    if (OLD_BINDINGS[binding]) return problem(`\`${binding}()\` is from older WPILib; Commands v3 uses \`${OLD_BINDINGS[binding]}()\`.`)
    if (!BINDINGS.has(binding)) return problem(`\`${binding}()\` isn't a Trigger binding the lab knows. Use onTrue, onFalse, whileTrue or toggleOnTrue.`)
    const key = COMMAND_KEYS.find((k) => compact(LAB_COMMANDS[k].java) === command)
    if (!key) return problem(`The lab doesn't have \`${command}\`. Try ${listCommands()}.`)
    if (!semi) return problem(SEMICOLON)
    bindings.push({ control, kind: binding as BindingKind, command: key, line })
  })
  return bindings
}

export function parseLabCode(regions: LabRegions): { config: LabConfig | null; problems: LabProblem[] } {
  const problems: LabProblem[] = []
  const passDrivetrain = parseDriveRequirements(regions.driveRequirements, problems)
  const teleop = parseDefaultCommand(regions.defaultCommand, problems)
  const bindings = parseBindings(regions.bindings, problems)
  return { config: problems.length ? null : { passDrivetrain, teleop, bindings }, problems }
}
