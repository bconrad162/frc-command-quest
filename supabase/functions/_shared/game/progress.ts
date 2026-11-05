/**
 * Pure progression logic: unlocking, recording attempts, awarding points once.
 */
import { computeScore, type ScoreBreakdown } from '../scoring/scoring.ts'
import { challengesFor } from './challenges/index.ts'
import type { Answer, Challenge, EfficiencyTier, GradeResult } from './types.ts'

export interface ChallengeProgress {
  attempts: number
  wrongAttempts: number
  hintsUsed: number
  completed: boolean
  /**
   * The answer was revealed after REVEAL_AFTER_WRONG wrong attempts. The mission
   * counts as passed for unlocking but earns nothing. (Stored as `skipped` so
   * existing saved progress keeps working.)
   */
  skipped: boolean
  points: number
  breakdown?: ScoreBreakdown
  completedAt?: string
  lastAnswer?: Answer
  efficiency?: EfficiencyTier
  seconds?: number | null
  /** Best autonomous time seen (including replays after completion). */
  bestSeconds?: number | null
}

export type ProgressMap = Record<string, ChallengeProgress>

export const REVEAL_AFTER_WRONG = 3

export function emptyProgress(): ChallengeProgress {
  return { attempts: 0, wrongAttempts: 0, hintsUsed: 0, completed: false, skipped: false, points: 0 }
}

export function progressFor(map: ProgressMap, id: string): ChallengeProgress {
  return map[id] ?? emptyProgress()
}

/** First mission in each tier is open; the next unlocks when the previous is completed or its answer was revealed. */
export function isUnlocked(challenge: Challenge, map: ProgressMap): boolean {
  const tier = challengesFor(challenge.difficulty)
  const index = tier.findIndex((c) => c.id === challenge.id)
  if (index <= 0) return true
  const prev = progressFor(map, tier[index - 1].id)
  return prev.completed || prev.skipped
}

/** True once the answer is on screen: the student can study it and move on, but not score. */
export function isRevealed(p: ChallengeProgress): boolean {
  return p.skipped && !p.completed
}

export interface AttemptOutcome {
  progress: ChallengeProgress
  /** Points newly awarded by this attempt (0 for wrong answers and for replays). */
  awarded: number
  breakdown?: ScoreBreakdown
  firstCompletion: boolean
}

/**
 * Applies a graded attempt. Points are awarded only on the first correct
 * completion; replaying a completed challenge never changes its score.
 */
export function applyAttempt(
  challenge: Challenge,
  current: ChallengeProgress,
  grade: GradeResult,
  answer: Answer,
  now: string = new Date().toISOString(),
): AttemptOutcome {
  if (grade.invalid) return { progress: current, awarded: 0, firstCompletion: false }
  const next: ChallengeProgress = { ...current, attempts: current.attempts + 1, lastAnswer: answer }
  if (grade.seconds !== undefined && grade.correct && grade.seconds !== null) {
    next.bestSeconds = current.bestSeconds == null ? grade.seconds : Math.min(current.bestSeconds, grade.seconds)
  }
  if (current.completed) return { progress: next, awarded: 0, firstCompletion: false }
  if (!grade.correct) {
    next.wrongAttempts = current.wrongAttempts + 1
    if (next.wrongAttempts >= REVEAL_AFTER_WRONG) next.skipped = true
    return { progress: next, awarded: 0, firstCompletion: false }
  }
  const breakdown = computeScore({
    difficulty: challenge.difficulty,
    wrongAttempts: current.wrongAttempts,
    hintsUsed: current.hintsUsed,
    efficiency: grade.efficiency,
    basePoints: challenge.basePoints,
  })
  // Once the answer has been revealed, a correct submission earns nothing.
  const awarded = current.skipped ? 0 : breakdown.total
  next.completed = true
  next.points = awarded
  next.breakdown = current.skipped ? undefined : breakdown
  next.completedAt = now
  next.efficiency = grade.efficiency
  next.seconds = grade.seconds
  return { progress: next, awarded, breakdown, firstCompletion: true }
}

export function applyHint(current: ChallengeProgress, hintIndex: number): ChallengeProgress {
  if (current.completed) return current
  return { ...current, hintsUsed: Math.max(current.hintsUsed, hintIndex + 1) }
}

export function totalPoints(map: ProgressMap): number {
  return Object.values(map).reduce((sum, p) => sum + (p.completed ? p.points : 0), 0)
}
