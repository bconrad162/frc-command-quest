import { describe, expect, it } from 'vitest'
import { getChallenge } from '../../src/game/challenges/index.ts'
import { applyAttempt, applyHint, emptyProgress, isRevealed, isUnlocked, REVEAL_AFTER_WRONG, type ProgressMap } from '../../src/game/progress.ts'
import { aggregateScores, BASE_POINTS, computeScore, maxScore, rankEntries } from '../../src/scoring/scoring.ts'

describe('difficulty scoring', () => {
  it('uses difficulty-weighted base points', () => {
    expect(BASE_POINTS).toEqual({ easy: 100, medium: 200, hard: 350 })
  })
  it('first try with no hints earns base + first-try + no-hint bonuses', () => {
    expect(computeScore({ difficulty: 'easy', wrongAttempts: 0, hintsUsed: 0 }).total).toBe(135)
    expect(computeScore({ difficulty: 'medium', wrongAttempts: 0, hintsUsed: 0 }).total).toBe(270)
    expect(computeScore({ difficulty: 'hard', wrongAttempts: 0, hintsUsed: 0 }).total).toBe(473)
  })
  it('a hard mission solved with retries still beats a perfect easy mission', () => {
    const hardSlow = computeScore({ difficulty: 'hard', wrongAttempts: 3, hintsUsed: 2 }).total
    expect(hardSlow).toBeGreaterThan(maxScore('easy', false))
  })
  it('adds autonomous efficiency bonuses', () => {
    expect(computeScore({ difficulty: 'hard', wrongAttempts: 0, hintsUsed: 0, efficiency: 'gold' }).total).toBe(613)
    expect(computeScore({ difficulty: 'hard', wrongAttempts: 0, hintsUsed: 0, efficiency: 'silver' }).total).toBe(543)
  })
})

describe('hint and retry penalties', () => {
  it('each hint costs 10% and removes the no-hint bonus', () => {
    expect(computeScore({ difficulty: 'easy', wrongAttempts: 0, hintsUsed: 1 }).total).toBe(115)
    expect(computeScore({ difficulty: 'easy', wrongAttempts: 0, hintsUsed: 2 }).total).toBe(105)
  })
  it('retries cost 10% each, capped at 40%', () => {
    expect(computeScore({ difficulty: 'medium', wrongAttempts: 1, hintsUsed: 0 }).total).toBe(200)
    expect(computeScore({ difficulty: 'medium', wrongAttempts: 4, hintsUsed: 0 }).total).toBe(140)
    expect(computeScore({ difficulty: 'medium', wrongAttempts: 10, hintsUsed: 0 }).total).toBe(140)
  })
  it('never drops below half of base points for a correct solve', () => {
    const r = computeScore({ difficulty: 'easy', wrongAttempts: 10, hintsUsed: 5 })
    expect(r.total).toBe(50)
    expect(r.lines.some((l) => l.label.startsWith('Minimum'))).toBe(true)
  })
  it('breakdown lines add up to the total', () => {
    for (const w of [0, 1, 5]) {
      for (const h of [0, 1, 3]) {
        const r = computeScore({ difficulty: 'hard', wrongAttempts: w, hintsUsed: h, efficiency: 'silver' })
        expect(r.lines.reduce((s, l) => s + l.points, 0)).toBe(r.total)
      }
    }
  })
})

describe('duplicate submissions and replays', () => {
  const c = getChallenge('easy-1-battery-math')!
  const answer = { kind: 'predict-output' as const, text: 'Battery: 80%\nMotors: 41' }
  it('awards points once; replays of a completed mission award nothing', () => {
    const first = applyAttempt(c, emptyProgress(), { correct: true, feedback: '' }, answer)
    expect(first.awarded).toBe(135)
    expect(first.firstCompletion).toBe(true)
    const replay = applyAttempt(c, first.progress, { correct: true, feedback: '' }, answer)
    expect(replay.awarded).toBe(0)
    expect(replay.progress.points).toBe(135)
    const wrongReplay = applyAttempt(c, first.progress, { correct: false, feedback: '' }, answer)
    expect(wrongReplay.progress.points).toBe(135)
    expect(wrongReplay.progress.completed).toBe(true)
  })
  it('invalid answers do not count as attempts', () => {
    const r = applyAttempt(c, emptyProgress(), { correct: false, invalid: true, feedback: '' }, answer)
    expect(r.progress.attempts).toBe(0)
  })
  it('hints are recorded and reduce the eventual score', () => {
    const p = applyHint(applyHint(emptyProgress(), 0), 0)
    expect(p.hintsUsed).toBe(1)
    expect(applyAttempt(c, p, { correct: true, feedback: '' }, answer).awarded).toBe(115)
  })
})

describe('score aggregation and ranking', () => {
  it('aggregates by difficulty and ignores duplicate completions', () => {
    const totals = aggregateScores([
      { challengeId: 'a', difficulty: 'easy', points: 100, completedAt: '2026-01-01T10:00:00Z' },
      { challengeId: 'a', difficulty: 'easy', points: 100, completedAt: '2026-01-01T10:05:00Z' },
      { challengeId: 'b', difficulty: 'medium', points: 200, completedAt: '2026-01-01T10:02:00Z' },
      { challengeId: 'c', difficulty: 'hard', points: 350, completedAt: '2026-01-01T10:03:00Z' },
    ])
    expect(totals).toEqual({
      totalPoints: 650,
      easyCompleted: 1,
      mediumCompleted: 1,
      hardCompleted: 1,
      lastScoredAt: '2026-01-01T10:03:00Z',
    })
  })
  it('ranks by points, then by who got there first', () => {
    const ranked = rankEntries([
      { id: 'slow', totalPoints: 300, lastScoredAt: '2026-01-01T10:30:00Z' },
      { id: 'fast', totalPoints: 300, lastScoredAt: '2026-01-01T10:10:00Z' },
      { id: 'top', totalPoints: 500, lastScoredAt: '2026-01-01T10:40:00Z' },
      { id: 'zero', totalPoints: 0, lastScoredAt: null },
    ])
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['top', 1],
      ['fast', 2],
      ['slow', 3],
      ['zero', 4],
    ])
  })
})

describe('challenge progression', () => {
  const easy2 = getChallenge('easy-2-countdown-loop')!
  const easy1 = getChallenge('easy-1-battery-math')!
  const medium1 = getChallenge('medium-1-drive-conflict')!
  it('first mission of every tier is unlocked', () => {
    expect(isUnlocked(easy1, {})).toBe(true)
    expect(isUnlocked(medium1, {})).toBe(true)
  })
  it('completing a mission unlocks the next one', () => {
    expect(isUnlocked(easy2, {})).toBe(false)
    const map: ProgressMap = { [easy1.id]: { ...emptyProgress(), completed: true } }
    expect(isUnlocked(easy2, map)).toBe(true)
  })
  it('the third wrong attempt reveals the answer, unlocks the next mission and earns nothing', () => {
    const wrong = { correct: false, feedback: '' }
    let p = emptyProgress()
    for (let i = 0; i < REVEAL_AFTER_WRONG - 1; i++) p = applyAttempt(easy1, p, wrong, { kind: 'predict-output', text: 'x' }).progress
    expect(isRevealed(p)).toBe(false)
    expect(isUnlocked(easy2, { [easy1.id]: p })).toBe(false)
    p = applyAttempt(easy1, p, wrong, { kind: 'predict-output', text: 'x' }).progress
    expect(REVEAL_AFTER_WRONG).toBe(3)
    expect(isRevealed(p)).toBe(true)
    expect(p.points).toBe(0)
    expect(isUnlocked(easy2, { [easy1.id]: p })).toBe(true)
    const later = applyAttempt(easy1, p, { correct: true, feedback: '' }, { kind: 'predict-output', text: 'x' })
    expect(later.awarded).toBe(0)
  })
  it('solving on the second wrong attempt still scores', () => {
    let p = emptyProgress()
    for (let i = 0; i < 2; i++) p = applyAttempt(easy1, p, { correct: false, feedback: '' }, { kind: 'predict-output', text: 'x' }).progress
    const outcome = applyAttempt(easy1, p, { correct: true, feedback: '' }, { kind: 'predict-output', text: 'x' })
    expect(outcome.awarded).toBeGreaterThan(0)
    expect(isRevealed(outcome.progress)).toBe(false)
  })
})
