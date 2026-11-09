/**
 * Auto quality for the Robot Lab: watches frame times and decides, within the
 * first couple of seconds at each level, whether to drop from Full to Light or
 * from Light to the 2D view. Decides on elapsed time, not frame counts, so a
 * machine drawing 5 frames a second isn't stuck for half a minute.
 */
export interface QualityMeterOptions {
  /** Seconds ignored after each level starts (shader compiles, first uploads). */
  warmup: number
  /** Seconds measured before deciding. */
  window: number
  /** Mean frame time (ms) at Full above which to drop to Light. */
  slowFullMs: number
  /** Mean frame time (ms) at Light above which to drop to 2D. */
  slowLightMs: number
}

export const QUALITY_METER_DEFAULTS: QualityMeterOptions = { warmup: 0.5, window: 1.5, slowFullMs: 24, slowLightMs: 40 }

export function createQualityMeter(options: QualityMeterOptions = QUALITY_METER_DEFAULTS) {
  let warm = 0
  let measured = 0
  let frames = 0
  const reset = () => {
    warm = 0
    measured = 0
    frames = 0
  }
  return {
    reset,
    /** Adds one frame drawn at `level`; returns the level to switch to, or null to keep it. */
    add(dtSeconds: number, level: 'full' | 'light'): 'light' | '2d' | null {
      if (warm < options.warmup) {
        warm += dtSeconds
        return null
      }
      measured += dtSeconds
      frames += 1
      const meanMs = (measured / frames) * 1000
      const limit = level === 'full' ? options.slowFullMs : options.slowLightMs
      // Decide at the end of the window, or early when frames are far too slow.
      const farTooSlow = measured >= options.window / 3 && meanMs > 2 * limit
      if (measured < options.window && !farTooSlow) return null
      reset()
      if (meanMs <= limit) return null
      return level === 'full' ? 'light' : '2d'
    },
  }
}
