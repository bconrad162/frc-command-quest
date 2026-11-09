import { Vector3 } from 'three'

/** 2026 REBUILT field size (AdvantageScope model: 651.22 × 317.677 in). */
export const FIELD_L = 16.541
export const FIELD_W = 8.069

/**
 * WPILib field frame (blue origin, meters, z up) to the field model's three.js
 * frame. AdvantageScope's model is centered and turned 180° from WPILib's frame,
 * which AprilTag 26 confirms (see tests/robotLab/coords.test.ts).
 */
export function toThree(x: number, y: number, z = 0): Vector3 {
  return new Vector3(FIELD_L / 2 - x, z, y - FIELD_W / 2)
}

/** three.js rotation.y for a robot facing field heading `theta` (radians, CCW from +x). */
export function yawOf(theta: number): number {
  return theta + Math.PI
}
