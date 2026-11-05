import { getChallenge } from '../game/challenges/index.ts'
import { aggregateScores, rankEntries, type CompletionRecord } from '../scoring/scoring.ts'
import type { TeamProfile } from '../types/app.ts'
import type { LeaderboardRow } from './backend.ts'

/** Leaderboard rows for teams stored on THIS device. Never mixed with server rows. */
export function localLeaderboard(profiles: TeamProfile[], activeId: string | null): Array<LeaderboardRow & { rank: number }> {
  const rows: LeaderboardRow[] = profiles.map((p) => {
    const completions: CompletionRecord[] = Object.entries(p.progress)
      .filter(([, prog]) => prog.completed && prog.completedAt)
      .map(([id, prog]) => ({
        challengeId: id,
        difficulty: getChallenge(id)?.difficulty ?? 'easy',
        points: prog.points,
        completedAt: prog.completedAt!,
      }))
    const t = aggregateScores(completions)
    return {
      id: p.id,
      nickname: p.nickname,
      totalPoints: t.totalPoints,
      easyCompleted: t.easyCompleted,
      mediumCompleted: t.mediumCompleted,
      hardCompleted: t.hardCompleted,
      lastScoredAt: t.lastScoredAt,
      isMe: p.id === activeId,
    }
  })
  return rankEntries(rows)
}

export function rankRows(rows: LeaderboardRow[]): Array<LeaderboardRow & { rank: number }> {
  return rankEntries(rows)
}
