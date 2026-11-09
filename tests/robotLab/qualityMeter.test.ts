import { expect, test } from 'vitest'
import { createQualityMeter } from '../../src/components/robotLab/qualityMeter.ts'

/** Feeds frames of `frameMs` for up to `seconds`; returns the first decision and when it came. */
function feed(meter: ReturnType<typeof createQualityMeter>, level: 'full' | 'light', frameMs: number, seconds: number) {
  let t = 0
  while (t < seconds) {
    t += frameMs / 1000
    const d = meter.add(frameMs / 1000, level)
    if (d) return { decision: d, at: t }
  }
  return null
}

test('a very slow machine (5 fps) drops from Full to Light within about 2 seconds', () => {
  const r = feed(createQualityMeter(), 'full', 200, 30)
  expect(r?.decision).toBe('light')
  expect(r!.at).toBeLessThanOrEqual(2.2)
})

test('and from Light to 2D within about 2 more seconds', () => {
  const meter = createQualityMeter()
  feed(meter, 'full', 200, 30)
  const r = feed(meter, 'light', 200, 30)
  expect(r?.decision).toBe('2d')
  expect(r!.at).toBeLessThanOrEqual(2.2)
})

test('a smooth machine (60 fps) keeps Full', () => {
  expect(feed(createQualityMeter(), 'full', 1000 / 60, 10)).toBeNull()
})

test('Light at 30 fps is fine (under 40 ms per frame)', () => {
  expect(feed(createQualityMeter(), 'light', 33, 10)).toBeNull()
})

test('ignores the first half second while the field warms up', () => {
  const meter = createQualityMeter()
  expect(meter.add(0.4, 'full')).toBeNull()
  // Then smooth frames: the slow warm-up frame must not count.
  expect(feed(meter, 'full', 1000 / 60, 5)).toBeNull()
})
