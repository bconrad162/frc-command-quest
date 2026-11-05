import { clsx } from 'clsx'
import { Trophy } from 'lucide-react'
import type { LeaderboardRow } from '../lib/backend.ts'

function formatTime(iso: string | null, startedAt?: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (startedAt) {
    const s = Math.max(0, Math.floor((t - new Date(startedAt).getTime()) / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function LeaderboardTable({
  rows,
  showClassroom = false,
  startedAt,
  large = false,
  hidden = false,
}: {
  rows: Array<LeaderboardRow & { rank: number }>
  showClassroom?: boolean
  /** When set, the tie-break column shows time since the competition started. */
  startedAt?: string | null
  large?: boolean
  hidden?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx('w-full text-left', large ? 'text-xl' : 'text-sm')} data-testid="leaderboard-table">
        <thead className={clsx('text-ink-faint', large ? 'text-base' : 'text-xs')}>
          <tr>
            <th className="py-2 pr-3 font-normal">Rank</th>
            <th className="py-2 pr-3 font-normal">Team</th>
            {showClassroom && <th className="py-2 pr-3 font-normal">Classroom</th>}
            <th className="py-2 pr-3 text-right font-normal">Points</th>
            <th className="py-2 pr-3 text-right font-normal">Easy</th>
            <th className="py-2 pr-3 text-right font-normal">Medium</th>
            <th className="py-2 pr-3 text-right font-normal">Hard</th>
            <th className="py-2 text-right font-normal" title="Ties are broken by who reached their score first">
              {startedAt ? 'Reached score at' : 'Last scored'}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={clsx('border-t border-steel/70', r.isMe && 'bg-signal/10')}
              aria-current={r.isMe ? 'true' : undefined}
            >
              <td className={clsx('py-2.5 pr-3 font-display font-bold tabular-nums', r.rank === 1 ? 'text-trophy' : 'text-ink-muted')}>
                <span className="inline-flex items-center gap-1.5">
                  {r.rank === 1 && !hidden && <Trophy className={large ? 'size-6' : 'size-4'} aria-hidden />}
                  {hidden ? '?' : r.rank}
                </span>
              </td>
              <td className="py-2.5 pr-3 font-medium">
                {r.nickname}
                {r.isMe && <span className="ml-2 text-xs font-normal text-signal">your team</span>}
              </td>
              {showClassroom && <td className="py-2.5 pr-3 text-ink-muted">{r.classroomName}</td>}
              <td className={clsx('py-2.5 pr-3 text-right font-display font-bold tabular-nums', large ? 'text-3xl' : 'text-lg', 'text-ink')}>
                {hidden ? '—' : r.totalPoints}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-tier-easy">{hidden ? '—' : r.easyCompleted}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-tier-medium">{hidden ? '—' : r.mediumCompleted}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-tier-hard">{hidden ? '—' : r.hardCompleted}</td>
              <td className="py-2.5 text-right tabular-nums text-ink-muted">{hidden ? '—' : formatTime(r.lastScoredAt, startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
