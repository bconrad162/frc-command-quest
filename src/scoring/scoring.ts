/**
 * Scoring rules. Shared by the browser (local/demo scores and previews) and the
 * Supabase Edge Function (authoritative classroom scores).
 *
 * Design goals: difficulty matters most; thinking time does not matter at all;
 * retries and hints cost a little; every correct solve keeps at least half its value.
 */
import type { Difficulty, EfficiencyTier } from '../game/types.ts'

export const BASE_POINTS: Record<Difficulty, number> = {
  easy: 100,
  medium: 200,
  hard: 350,
}

export const SCORING_RULES = {
  /** Bonus for solving on the first attempt (a correct prediction). */
  firstTryBonus: 0.25,
  /** Bonus for solving without opening any hint. */
  noHintBonus: 0.1,
  /** Deduction per wrong attempt before solving. */
  retryPenalty: 0.1,
  /** Cap on retry deductions. */
  maxRetryPenalty: 0.4,
  /** Deduction per hint revealed. */
  hintPenalty: 0.1,
  /** A correct solve is always worth at least this fraction of base points. */
  minimumFraction: 0.5,
  /** Autonomous efficiency bonuses. */
  efficiency: { gold: 0.4, silver: 0.2, bronze: 0 } as Record<EfficiencyTier, number>,
} as const

export interface ScoreInput {
  difficulty: Difficulty
  /** Wrong attempts before the correct one. */
  wrongAttempts: number
  hintsUsed: number
  efficiency?: EfficiencyTier
  basePoints?: number
}

export interface ScoreLine {
  label: string
  points: number
}

export interface ScoreBreakdown {
  total: number
  lines: ScoreLine[]
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const base = input.basePoints ?? BASE_POINTS[input.difficulty]
  const wrong = Math.max(0, Math.floor(input.wrongAttempts))
  const hints = Math.max(0, Math.floor(input.hintsUsed))
  const r = SCORING_RULES
  const lines: ScoreLine[] = [{ label: `${capitalize(input.difficulty)} mission`, points: base }]

  if (wrong === 0) lines.push({ label: 'First-try bonus', points: Math.round(base * r.firstTryBonus) })
  if (hints === 0) lines.push({ label: 'No-hint bonus', points: Math.round(base * r.noHintBonus) })
  if (input.efficiency && r.efficiency[input.efficiency] > 0) {
    lines.push({ label: `${capitalize(input.efficiency)} efficiency`, points: Math.round(base * r.efficiency[input.efficiency]) })
  }
  if (wrong > 0) {
    lines.push({ label: `Retries (${wrong})`, points: -Math.round(base * Math.min(r.maxRetryPenalty, wrong * r.retryPenalty)) })
  }
  if (hints > 0) lines.push({ label: `Hints (${hints})`, points: -Math.round(base * hints * r.hintPenalty) })

  let total = lines.reduce((sum, l) => sum + l.points, 0)
  const floor = Math.round(base * r.minimumFraction)
  if (total < floor) {
    lines.push({ label: 'Minimum for solving', points: floor - total })
    total = floor
  }
  return { total, lines }
}

/** Highest score available for a challenge (first try, no hints, best efficiency). */
export function maxScore(difficulty: Difficulty, hasEfficiency: boolean, basePoints?: number): number {
  return computeScore({ difficulty, wrongAttempts: 0, hintsUsed: 0, efficiency: hasEfficiency ? 'gold' : undefined, basePoints }).total
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface CompletionRecord {
  challengeId: string
  difficulty: Difficulty
  points: number
  completedAt: string
}

export interface ScoreTotals {
  totalPoints: number
  easyCompleted: number
  mediumCompleted: number
  hardCompleted: number
  /** ISO time of the most recent scoring completion (tie-break: earlier is better). */
  lastScoredAt: string | null
}

/** Aggregates completions; duplicate challenge ids are counted once (first completion wins). */
export function aggregateScores(completions: CompletionRecord[]): ScoreTotals {
  const seen = new Set<string>()
  const totals: ScoreTotals = { totalPoints: 0, easyCompleted: 0, mediumCompleted: 0, hardCompleted: 0, lastScoredAt: null }
  const ordered = [...completions].sort((a, b) => a.completedAt.localeCompare(b.completedAt))
  for (const c of ordered) {
    if (seen.has(c.challengeId)) continue
    seen.add(c.challengeId)
    totals.totalPoints += c.points
    if (c.difficulty === 'easy') totals.easyCompleted++
    else if (c.difficulty === 'medium') totals.mediumCompleted++
    else totals.hardCompleted++
    totals.lastScoredAt = c.completedAt
  }
  return totals
}

export interface RankedEntry {
  id: string
  totalPoints: number
  lastScoredAt: string | null
}

/** Sort by points desc; ties go to whoever reached their score first. */
export function rankEntries<T extends RankedEntry>(entries: T[]): Array<T & { rank: number }> {
  const sorted = [...entries].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (a.lastScoredAt && b.lastScoredAt) return a.lastScoredAt.localeCompare(b.lastScoredAt)
    if (a.lastScoredAt) return -1
    if (b.lastScoredAt) return 1
    return a.id.localeCompare(b.id)
  })
  let rank = 0
  let prev: T | undefined
  return sorted.map((e, i) => {
    if (!prev || prev.totalPoints !== e.totalPoints || prev.lastScoredAt !== e.lastScoredAt) rank = i + 1
    prev = e
    return { ...e, rank }
  })
}
