/** Optional, off-by-default sound effects synthesized with Web Audio (no audio files to download). */
import { appStore } from './appStore.ts'

let ctx: AudioContext | null = null

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.06) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, ctx.currentTime + start)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration)
  osc.connect(g).connect(ctx.destination)
  osc.start(ctx.currentTime + start)
  osc.stop(ctx.currentTime + start + duration + 0.02)
}

export function playSound(kind: 'correct' | 'wrong' | 'step' | 'victory') {
  if (!appStore.getState().settings.sound) return
  try {
    ctx ??= new AudioContext()
    if (kind === 'correct') {
      tone(660, 0, 0.12, 'triangle')
      tone(990, 0.1, 0.18, 'triangle')
    } else if (kind === 'wrong') {
      tone(220, 0, 0.18, 'sawtooth', 0.03)
    } else if (kind === 'step') {
      tone(880, 0, 0.04, 'square', 0.015)
    } else {
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle'))
    }
  } catch {
    // Audio is a nicety; ignore failures.
  }
}
