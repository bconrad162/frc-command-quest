/**
 * Turns the three ways to drive the Robot Lab (a real gamepad, the keyboard, the
 * on-page controller) into one LabInput per loop.
 */
import type { ControlId } from '../../game/controller.ts'
import { NO_INPUT, type LabInput } from '../../game/robotLab/bindings.ts'

/** The browser Gamepad API "standard" mapping (w3.org/TR/gamepad). */
const PAD_BUTTONS: [number, ControlId][] = [
  [0, 'a'],
  [1, 'b'],
  [2, 'x'],
  [3, 'y'],
  [4, 'leftBumper'],
  [5, 'rightBumper'],
  [8, 'view'],
  [9, 'menu'],
  [12, 'dpadUp'],
  [13, 'dpadDown'],
  [14, 'dpadLeft'],
  [15, 'dpadRight'],
]

interface PadLike {
  axes: readonly number[]
  buttons: readonly { pressed: boolean; value: number }[]
}

export function fromGamepad(gp: PadLike | null): LabInput {
  if (!gp || gp.axes.length < 4) return NO_INPUT
  const buttons = new Set<ControlId>()
  for (const [i, id] of PAD_BUTTONS) if (gp.buttons[i]?.pressed) buttons.add(id)
  return {
    leftX: gp.axes[0] ?? 0,
    leftY: gp.axes[1] ?? 0,
    rightX: gp.axes[2] ?? 0,
    rightY: gp.axes[3] ?? 0,
    leftTrigger: gp.buttons[6]?.value ?? 0,
    rightTrigger: gp.buttons[7]?.value ?? 0,
    buttons,
  }
}

/** Keyboard layout shown on the page. Keys are KeyboardEvent.code, so it works on any layout. */
export const KEY_LEGEND: { keys: string; does: string }[] = [
  { keys: 'W A S D', does: 'Left stick (drive)' },
  { keys: 'Q E', does: 'Right stick left/right (turn)' },
  { keys: 'Space', does: 'Right trigger (RT)' },
  { keys: 'Shift', does: 'Left trigger (LT)' },
  { keys: '1 2 3 4', does: 'A B X Y' },
  { keys: 'R F', does: 'Right / left bumper' },
]

const KEY_BUTTONS: Record<string, ControlId> = {
  Digit1: 'a',
  Digit2: 'b',
  Digit3: 'x',
  Digit4: 'y',
  KeyR: 'rightBumper',
  KeyF: 'leftBumper',
  ArrowUp: 'dpadUp',
  ArrowDown: 'dpadDown',
  ArrowLeft: 'dpadLeft',
  ArrowRight: 'dpadRight',
}

export function fromKeys(keys: ReadonlySet<string>): LabInput {
  const axis = (neg: string, pos: string) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0)
  const buttons = new Set<ControlId>()
  for (const [code, id] of Object.entries(KEY_BUTTONS)) if (keys.has(code)) buttons.add(id)
  return {
    leftX: axis('KeyA', 'KeyD'),
    // Y is positive when the stick is pulled back, so W (forward) is -1.
    leftY: axis('KeyW', 'KeyS'),
    rightX: axis('KeyQ', 'KeyE'),
    rightY: 0,
    leftTrigger: keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0,
    rightTrigger: keys.has('Space') ? 1 : 0,
    buttons,
  }
}

/** Keys the lab uses (so the page can stop them scrolling or typing elsewhere). */
export const LAB_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight', ...Object.keys(KEY_BUTTONS)])

const pick = (a: number, b: number) => (Math.abs(b) > Math.abs(a) ? b : a)

export function mergeInputs(...inputs: LabInput[]): LabInput {
  const out = { ...NO_INPUT, buttons: new Set<ControlId>() }
  for (const i of inputs) {
    out.leftX = pick(out.leftX, i.leftX)
    out.leftY = pick(out.leftY, i.leftY)
    out.rightX = pick(out.rightX, i.rightX)
    out.rightY = pick(out.rightY, i.rightY)
    out.leftTrigger = pick(out.leftTrigger, i.leftTrigger)
    out.rightTrigger = pick(out.rightTrigger, i.rightTrigger)
    for (const b of i.buttons) out.buttons.add(b)
  }
  return out
}

/** Key presses here are typing, not driving. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  const el = target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return true
  return el.closest('.cm-editor, [contenteditable="true"]') !== null
}
