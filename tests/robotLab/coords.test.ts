import { expect, test } from 'vitest'
import { toThree, yawOf } from '../../src/components/robotLab/coords.ts'

test('AprilTag 26 lands on the field model', () => {
  // WPILib field (4.022, 4.035, 1.124); AdvantageScope's model has tag 26 at (4.249, 0, 1.124) in its own frame.
  const v = toThree(4.022, 4.035, 1.124)
  expect(v.x).toBeCloseTo(4.249, 2)
  expect(v.z).toBeCloseTo(0, 1)
  expect(v.y).toBeCloseTo(1.124, 3)
})

test('heading 0 (facing the red wall) points along three.js −x', () => {
  expect(Math.cos(yawOf(0))).toBeCloseTo(-1)
})

test('heading 90° (facing +y on the field) points along three.js +z', () => {
  // A three.js object with rotation.y = φ points its local +x at (cos φ, 0, −sin φ).
  const phi = yawOf(Math.PI / 2)
  expect(-Math.sin(phi)).toBeCloseTo(1)
})
