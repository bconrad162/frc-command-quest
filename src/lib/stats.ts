import { CONCEPT_LABELS, type Concept } from '../game/types.ts'

export interface ChallengeStat {
  challenge_id: string
  title: string
  difficulty: string
  concepts: string[]
  teams_attempted: number
  teams_completed: number
  total_attempts: number
  wrong_attempts: number
  hints_used: number
  avg_attempts_to_solve: number | null
}

export interface ConceptStruggle {
  concept: string
  label: string
  attempts: number
  wrong: number
  hints: number
  /** 0..1: share of attempts that were wrong, plus hint pressure. */
  score: number
}

/** Ranks concepts by how much students struggle (wrong-attempt rate plus hint usage). */
export function conceptStruggles(stats: ChallengeStat[]): ConceptStruggle[] {
  const by = new Map<string, { attempts: number; wrong: number; hints: number }>()
  for (const s of stats) {
    for (const c of s.concepts) {
      const cur = by.get(c) ?? { attempts: 0, wrong: 0, hints: 0 }
      cur.attempts += Number(s.total_attempts)
      cur.wrong += Number(s.wrong_attempts)
      cur.hints += Number(s.hints_used)
      by.set(c, cur)
    }
  }
  return [...by.entries()]
    .filter(([, v]) => v.attempts > 0)
    .map(([concept, v]) => ({
      concept,
      label: CONCEPT_LABELS[concept as Concept] ?? concept,
      ...v,
      score: v.wrong / v.attempts + Math.min(0.5, v.hints / (v.attempts * 4)),
    }))
    .sort((a, b) => b.score - a.score)
}
