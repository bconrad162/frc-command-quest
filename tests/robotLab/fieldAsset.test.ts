import { statSync } from 'node:fs'
import { expect, test } from 'vitest'
import fuel from '../../src/game/robotLab/fieldFuel.json'

test('fuel on the carpet is inside the field walls', () => {
  expect(fuel.length).toBeGreaterThanOrEqual(400)
  expect(fuel.length).toBeLessThanOrEqual(460)
  const onCarpet = fuel.filter((f) => f.z < 0.3)
  expect(onCarpet.length).toBeGreaterThanOrEqual(380)
  for (const f of onCarpet) {
    expect(f.x).toBeGreaterThan(-0.1)
    expect(f.x).toBeLessThan(16.65)
    expect(f.y).toBeGreaterThan(-0.1)
    expect(f.y).toBeLessThan(8.17)
  }
})

test('raised fuel sits in the outposts or inside a hub', () => {
  const raised = fuel.filter((f) => f.z >= 0.3)
  for (const f of raised) {
    const blueOutpost = f.x < 0 && f.y < 1.3
    const redOutpost = f.x > 16.5 && f.y > 6.7
    const inHub = Math.abs(f.y - 4.034) < 0.6 && (Math.abs(f.x - 4.626) < 0.6 || Math.abs(f.x - 11.915) < 0.6)
    expect(blueOutpost || redOutpost || inHub).toBe(true)
  }
})

test('the blue depot holds fuel', () => {
  const inDepot = fuel.filter((f) => f.x < 0.75 && f.y > 5.4 && f.y < 6.55)
  expect(inDepot.length).toBeGreaterThanOrEqual(20)
})

test('the processed field is small enough to load on school Wi-Fi', () => {
  expect(statSync('public/models/field-2026.glb').size).toBeLessThan(6_000_000)
})
