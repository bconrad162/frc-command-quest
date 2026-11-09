import { expect, test } from 'vitest'
import { createLabRunner } from '../../src/components/robotLab/useLabRunner.ts'

test('caps catch-up at 5 loops per frame', () => {
  const r = createLabRunner({ passDrivetrain: true })
  r.run()
  r.advanceFrame(10)
  expect(r.state.cycle).toBe(5)
})

test('steps at real time: one frame of 0.1 s is 5 loops at 1×, 2 loops at ½× after rounding down', () => {
  const r = createLabRunner({ passDrivetrain: true })
  r.run()
  r.advanceFrame(0.1)
  expect(r.state.cycle).toBe(5)
  r.setSpeed(0.5)
  r.advanceFrame(0.1)
  expect(r.state.cycle).toBe(7)
})

test('does nothing until Run is pressed', () => {
  const r = createLabRunner({ passDrivetrain: true })
  r.advanceFrame(0.1)
  expect(r.state.cycle).toBe(0)
})

test('run() restarts from the start with a new setup', () => {
  const r = createLabRunner({ passDrivetrain: true })
  r.run()
  r.advance(3)
  expect(r.state.cycle).toBe(150)
  r.setup = { passDrivetrain: false }
  r.run()
  expect(r.state.cycle).toBe(0)
  expect(r.state.hopper).toBe(8)
  expect(r.state.balls).toEqual([])
  expect(r.setup.passDrivetrain).toBe(false)
})

test('exposes the latest snapshot and scheduler events', () => {
  const r = createLabRunner({ passDrivetrain: true })
  r.run()
  r.advance(0.1)
  expect(r.snapshot?.owners.drivetrain).toBe('auto')
  expect(r.events.some((e) => e.type === 'Scheduled' && e.command === 'auto')).toBe(true)
})

test('stops stepping once the auto period is over', () => {
  const r = createLabRunner({ passDrivetrain: true })
  r.run()
  r.advance(30)
  expect(r.state.cycle).toBe(1000)
  expect(r.finished).toBe(true)
})
