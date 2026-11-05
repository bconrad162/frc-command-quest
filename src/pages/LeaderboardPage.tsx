import { clsx } from 'clsx'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { LeaderboardTable } from '../components/LeaderboardTable.tsx'
import { Button, EmptyState, LinkButton, Panel, Spinner } from '../components/ui.tsx'
import { useActiveProfile, useAppState } from '../hooks/useAppState.ts'
import { fetchClassroomLeaderboard, fetchGlobalLeaderboard, watchClassroom, type LeaderboardRow } from '../lib/backend.ts'
import { localLeaderboard, rankRows } from '../lib/localLeaderboard.ts'
import { isBackendConfigured } from '../lib/supabase.ts'

type Tab = 'classroom' | 'overall' | 'device'

export default function LeaderboardPage() {
  const profile = useActiveProfile()
  const profiles = useAppState((s) => s.profiles)
  const activeId = useAppState((s) => s.activeProfileId)
  const classroomId = profile?.classroom?.id
  const [tab, setTab] = useState<Tab>(isBackendConfigured && classroomId ? 'classroom' : isBackendConfigured ? 'overall' : 'device')
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (tab === 'device') return
    try {
      const data = tab === 'classroom' && classroomId ? await fetchClassroomLeaderboard(classroomId) : await fetchGlobalLeaderboard()
      setRows(data)
      setError(null)
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the leaderboard')
    }
  }, [tab, classroomId])

  useEffect(() => {
    setRows(null)
    if (tab === 'device') return
    void load()
    if (tab === 'classroom' && classroomId) return watchClassroom(classroomId, () => void load(), 8000)
    const t = setInterval(() => void load(), 20_000)
    return () => clearInterval(t)
  }, [tab, classroomId, load])

  const tabs: Array<{ id: Tab; label: string; available: boolean }> = [
    { id: 'classroom', label: profile?.classroom ? `Classroom: ${profile.classroom.name}` : 'Classroom', available: isBackendConfigured && Boolean(classroomId) },
    { id: 'overall', label: 'Overall', available: isBackendConfigured },
    { id: 'device', label: 'This device', available: true },
  ]

  const deviceRows = localLeaderboard(profiles, activeId)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Leaderboard</h1>
          <p className="mt-1 text-ink-muted">Points first. Ties go to the team that reached its score earlier, so thinking time never hurts.</p>
        </div>
        {tab !== 'device' && (
          <div className="flex items-center gap-3 text-xs text-ink-faint">
            {updatedAt && <span>Updated {updatedAt.toLocaleTimeString()}</span>}
            <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Refresh leaderboard">
              <RefreshCw className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Leaderboard scope" className="mt-6 flex gap-1 border-b border-steel">
        {tabs
          .filter((t) => t.available)
          .map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                '-mb-px border-b-2 px-3 py-2 text-sm',
                tab === t.id ? 'border-signal text-ink' : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      <Panel className="mt-4">
        <div className="px-4 py-3">
          {tab === 'device' ? (
            <>
              <p className="mb-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink-muted">
                Local scores: only teams that played on this device. These are not a shared classroom leaderboard.
              </p>
              {deviceRows.length === 0 ? (
                <EmptyState title="No teams on this device yet" action={<LinkButton to="/start" variant="primary">Create a team</LinkButton>}>
                  Create a team and finish a mission to appear here.
                </EmptyState>
              ) : (
                <LeaderboardTable rows={deviceRows} />
              )}
            </>
          ) : error ? (
            <EmptyState title="The leaderboard is unavailable right now" action={<Button onClick={() => void load()}>Try again</Button>}>
              {error}. Your answers are still saved on this device and will be scored when the connection returns.
            </EmptyState>
          ) : rows === null ? (
            <div className="py-8">
              <Spinner label="Loading leaderboard" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No scores yet">The first team to finish a mission takes the top spot.</EmptyState>
          ) : (
            <LeaderboardTable rows={rankRows(rows)} showClassroom={tab === 'overall'} />
          )}
        </div>
      </Panel>
    </div>
  )
}
