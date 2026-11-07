/**
 * Xbox controller controls and the WPILib 2027 Commands v3 methods that read them
 * (org.wpilib.command3.button.CommandXboxController). Verified against allwpilib
 * main; see docs/commands-v3-behavior.md "Controllers and trigger bindings".
 *
 * Pure data, shared with the Supabase Edge Function.
 */

export type ControlId =
  | 'leftStick'
  | 'rightStick'
  | 'leftTrigger'
  | 'rightTrigger'
  | 'leftBumper'
  | 'rightBumper'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight'
  | 'view'
  | 'menu'

export interface ControlInfo {
  id: ControlId
  /** Name a driver would use. */
  label: string
  /** Short label drawn on the controller. */
  short: string
  /** Commands v3 methods that read this control. */
  methods: string[]
  /** The 2026 (Commands v2) name, when it changed. */
  v2?: string
}

export const CONTROLS: ControlInfo[] = [
  { id: 'leftStick', label: 'Left stick', short: 'LS', methods: ['getLeftX()', 'getLeftY()'] },
  { id: 'rightStick', label: 'Right stick', short: 'RS', methods: ['getRightX()', 'getRightY()'] },
  { id: 'leftTrigger', label: 'Left trigger (LT)', short: 'LT', methods: ['leftTrigger()', 'getLeftTrigger()'], v2: 'getLeftTriggerAxis()' },
  { id: 'rightTrigger', label: 'Right trigger (RT)', short: 'RT', methods: ['rightTrigger()', 'getRightTrigger()'], v2: 'getRightTriggerAxis()' },
  { id: 'leftBumper', label: 'Left bumper (LB)', short: 'LB', methods: ['leftBumper()'] },
  { id: 'rightBumper', label: 'Right bumper (RB)', short: 'RB', methods: ['rightBumper()'] },
  { id: 'a', label: 'A button', short: 'A', methods: ['a()'] },
  { id: 'b', label: 'B button', short: 'B', methods: ['b()'] },
  { id: 'x', label: 'X button', short: 'X', methods: ['x()'] },
  { id: 'y', label: 'Y button', short: 'Y', methods: ['y()'] },
  { id: 'dpadUp', label: 'D-pad up', short: '▲', methods: ['dpadUp()'], v2: 'povUp()' },
  { id: 'dpadDown', label: 'D-pad down', short: '▼', methods: ['dpadDown()'], v2: 'povDown()' },
  { id: 'dpadLeft', label: 'D-pad left', short: '◀', methods: ['dpadLeft()'], v2: 'povLeft()' },
  { id: 'dpadRight', label: 'D-pad right', short: '▶', methods: ['dpadRight()'], v2: 'povRight()' },
  { id: 'view', label: 'View button (two squares)', short: 'View', methods: ['view()'], v2: 'back()' },
  { id: 'menu', label: 'Menu button (three lines)', short: 'Menu', methods: ['menu()'], v2: 'start()' },
]

export const CONTROL_BY_ID = Object.fromEntries(CONTROLS.map((c) => [c.id, c])) as Record<ControlId, ControlInfo>

export const isControlId = (v: unknown): v is ControlId => typeof v === 'string' && v in CONTROL_BY_ID

/** A tip for the most common mix-ups, or undefined. */
export function controlMixUpTip(picked: ControlId, expected: ControlId): string | undefined {
  const pair = new Set([picked, expected])
  const has = (a: ControlId, b: ControlId) => pair.has(a) && pair.has(b)
  if (has('leftBumper', 'leftTrigger') || has('rightBumper', 'rightTrigger'))
    return 'Bumpers are the buttons on the top edge; triggers are the pull levers underneath them.'
  if (has('view', 'menu')) return 'View has two overlapping squares (left of center); Menu has three lines (right of center).'
  const part = (id: ControlId) => id.replace(/^(left|right)/, '')
  if (picked !== expected && /^(left|right)/.test(picked) && part(picked) === part(expected))
    return 'Check left and right: the method name says which side.'
  return undefined
}
