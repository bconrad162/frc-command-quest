import { expect, test } from 'vitest'
import { fromGamepad, fromKeys, isTypingTarget, mergeInputs } from '../../src/components/robotLab/input.ts'
import { NO_INPUT } from '../../src/game/robotLab/bindings.ts'

const pad = (axes: number[], pressed: number[] = [], values: Record<number, number> = {}) => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? (pressed.includes(i) ? 1 : 0) })),
})

test('a standard-mapping gamepad: sticks, triggers and buttons', () => {
  const input = fromGamepad(pad([0.5, -1, 0.25, 0], [0, 4, 12, 9], { 6: 0.3, 7: 0.9 }))
  expect(input).toMatchObject({ leftX: 0.5, leftY: -1, rightX: 0.25, rightY: 0, leftTrigger: 0.3, rightTrigger: 0.9 })
  expect([...input.buttons].sort()).toEqual(['a', 'dpadUp', 'leftBumper', 'menu'])
})

test('no gamepad (or one that disconnected) is no input', () => {
  expect(fromGamepad(null)).toEqual(NO_INPUT)
  expect(fromGamepad({ axes: [], buttons: [] })).toEqual(NO_INPUT)
})

test('keyboard: WASD is the left stick, Q/E turn, Space is RT, Shift is LT, 1-4 are A/B/X/Y', () => {
  expect(fromKeys(new Set(['KeyW']))).toMatchObject({ leftY: -1, leftX: 0 })
  expect(fromKeys(new Set(['KeyS', 'KeyA']))).toMatchObject({ leftY: 1, leftX: -1 })
  expect(fromKeys(new Set(['KeyD']))).toMatchObject({ leftX: 1 })
  expect(fromKeys(new Set(['KeyQ']))).toMatchObject({ rightX: -1 })
  expect(fromKeys(new Set(['KeyE']))).toMatchObject({ rightX: 1 })
  expect(fromKeys(new Set(['Space', 'ShiftLeft']))).toMatchObject({ rightTrigger: 1, leftTrigger: 1 })
  expect([...fromKeys(new Set(['Digit1', 'Digit2', 'Digit3', 'Digit4'])).buttons].sort()).toEqual(['a', 'b', 'x', 'y'])
  expect(fromKeys(new Set(['KeyW', 'KeyS']))).toMatchObject({ leftY: 0 })
})

test('merging keeps the larger magnitude per axis and every pressed button', () => {
  const merged = mergeInputs({ ...NO_INPUT, leftY: -0.3, buttons: new Set(['a']) }, { ...NO_INPUT, leftY: 0.8, rightTrigger: 1, buttons: new Set(['b']) })
  expect(merged).toMatchObject({ leftY: 0.8, rightTrigger: 1 })
  expect([...merged.buttons].sort()).toEqual(['a', 'b'])
})

test('typing targets: form fields and anything inside the code editor', () => {
  const el = (tag: string, inEditor = false) => ({ tagName: tag, isContentEditable: false, closest: (sel: string) => (inEditor && sel.includes('.cm-editor') ? {} : null) }) as unknown as EventTarget
  expect(isTypingTarget(el('INPUT'))).toBe(true)
  expect(isTypingTarget(el('TEXTAREA'))).toBe(true)
  expect(isTypingTarget(el('DIV', true))).toBe(true)
  expect(isTypingTarget(el('BUTTON'))).toBe(false)
  expect(isTypingTarget(null)).toBe(false)
})
