import { clsx } from 'clsx'
import { Eye, EyeOff, Maximize, Minimize, Trophy, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Wordmark } from '../components/AppShell.tsx'
import { LeaderboardTable } from '../components/LeaderboardTable.tsx'
import { Button, LinkButton, Spinner } from '../components/ui.tsx'
import { CHALLENGES } from '../game/challenges/index.ts'
import { useAppState, useNow, usePrefersReducedMotion } from '../hooks/useAppState.ts'
import { competitionPhase } from '../hooks/useClassroom.ts'
import { fetchClassroom, fetchClassroomLeaderboard, teacherApi, watchClassroom, type Classroom, type LeaderboardRow } from '../lib/backend.ts'
import { localLeaderboard, rankRows } from '../lib/localLeaderboard.ts'
import { playSound } from '../lib/sound.ts'
import { isBackendConfigured } from '../lib/supabase.ts'
import { formatRemaining } from './MissionsPage.tsx'

export default function PresentPage() {
  const { classroomId = 'local' } = useParams()
  const local = classroomId === 'local' || !isBackendConfigured
  const profiles = useAppState((s) => s.profiles)
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [room, setRoom] = useState<Classroom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [victory, setVictory] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const now = useNow(1000)

  const load = useCallback(async () => {
    if (local) return
    try {
      const [r, lb] = await Promise.all([fetchClassroom(classroomId), fetchClassroomLeaderboard(classroomId)])
      setRoom(r)
      setRows(lb.map((x) => ({ ...x, isMe: false })))
      setError(null)
      if (r) setHidden(r.rankings_hidden)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the classroom')
    }
  }, [classroomId, local])

  useEffect(() => {
    if (local) return
    void load()
    return watchClassroom(classroomId, () => void load(), 5000)
  }, [classroomId, local, load])

  useEffect(() => {
    const fn = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  const ranked = useMemo(
    () => (local ? localLeaderboard(profiles, null).map((r) => ({ ...r, isMe: false })) : rows ? rankRows(rows) : null),
    [local, profiles, rows],
  )

  const phase = room ? competitionPhase(room, now) : null
  const completions = ranked?.reduce((sum, r) => sum + r.easyCompleted + r.mediumCompleted + r.hardCompleted, 0) ?? 0

  const toggleHidden = async () => {
    const next = !hidden
    setHidden(next)
    if (!local && room) {
      try {
        setRoom(await teacherApi.update(room.id, { rankingsHidden: next }))
      } catch {
        // The projector view still hides locally even if the server update fails.
      }
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()
  }

  if (!local && error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20">
        <h1 className="text-3xl font-bold">Cannot show this classroom</h1>
        <p className="mt-3 text-ink-muted">{error}. Sign in on the teacher dashboard in this browser, then open the presentation again.</p>
        <LinkButton to="/teacher" variant="primary" className="mt-6">
          Open teacher dashboard
        </LinkButton>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-field">
      <header className="flex flex-wrap items-center gap-x-10 gap-y-4 border-b border-steel px-8 py-5">
        <Link to={local ? '/teacher' : '/teacher'} className="text-2xl" aria-label="Back to teacher dashboard">
          <Wordmark />
        </Link>
        <div>
          <div className="text-sm text-ink-muted">{local ? 'Local leaderboard (this device only)' : room?.name}</div>
          {!local && room && (
            <div className="font-display text-xl">
              Join code <span className="font-mono text-3xl font-bold tracking-[0.2em] text-signal">{room.join_code}</span>
            </div>
          )}
        </div>
        <Stat label={phase === 'running' ? 'Time left' : 'Competition'} big>
          {local
            ? 'Demo'
            : phase === 'running' && room?.ends_at
              ? formatRemaining(new Date(room.ends_at).getTime() - now)
              : phase === 'lobby'
                ? 'Not started'
                : phase === 'ended'
                  ? 'Finished'
                  : '—'}
        </Stat>
        <Stat label="Teams">{ranked?.length ?? 0}</Stat>
        <Stat label="Missions completed">{completions}</Stat>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => void toggleHidden()} aria-pressed={hidden}>
            {hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
            {hidden ? 'Reveal rankings' : 'Hide rankings'}
          </Button>
          <Button
            variant="gold"
            disabled={!ranked || ranked.length === 0 || ranked[0].totalPoints === 0}
            onClick={() => {
              setHidden(false)
              setVictory(true)
              playSound('victory')
            }}
          >
            <Trophy className="size-4" aria-hidden /> Victory screen
          </Button>
          <Button variant="ghost" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>
            {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </Button>
        </div>
      </header>

      <main className="px-8 py-6">
        {ranked === null ? (
          <Spinner label="Loading leaderboard" />
        ) : ranked.length === 0 ? (
          <p className="py-20 text-center font-display text-3xl text-ink-muted">Waiting for teams to join...</p>
        ) : (
          <>
            {hidden && (
              <p className="mb-4 text-center font-display text-2xl text-trophy">Rankings are hidden. Keep solving: the reveal is coming.</p>
            )}
            <LeaderboardTable rows={hidden ? [...ranked].sort((a, b) => a.nickname.localeCompare(b.nickname)) : ranked} large hidden={hidden} startedAt={room?.started_at} />
          </>
        )}
        <p className="mt-6 text-sm text-ink-faint">
          {CHALLENGES.length} missions available. Ties go to the team that reached its score first.
          {!local && ' Updates live.'}
        </p>
      </main>

      {victory && ranked && ranked.length > 0 && <Victory rows={ranked} onClose={() => setVictory(false)} />}
    </div>
  )
}

function Stat({ label, children, big = false }: { label: string; children: ReactNode; big?: boolean }) {
  return (
    <div>
      <div className="text-sm text-ink-muted">{label}</div>
      <div className={clsx('font-display font-bold tabular-nums', big ? 'text-4xl text-ink' : 'text-3xl text-ink')}>{children}</div>
    </div>
  )
}

const CONFETTI_COLORS = ['var(--color-trophy)', 'var(--color-signal)', 'var(--color-go)', 'var(--color-tier-medium)', '#ffffff']

function Victory({ rows, onClose }: { rows: Array<LeaderboardRow & { rank: number }>; onClose: () => void }) {
  const reduced = usePrefersReducedMotion()
  const winners = rows.filter((r) => r.rank === 1)
  const runnersUp = rows.filter((r) => r.rank > 1).slice(0, 2)
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 14) * 0.18,
        duration: 3.2 + (i % 5) * 0.5,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + (i % 4) * 3,
      })),
    [],
  )
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label="Victory" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-field-deep/95">
      {!reduced &&
        pieces.map((p, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute top-0"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.5,
              background: p.color,
              animation: `cq-confetti ${p.duration}s linear ${p.delay}s infinite`,
            }}
          />
        ))}
      <button type="button" onClick={onClose} className="absolute right-6 top-6 rounded p-2 text-ink-muted hover:text-ink" aria-label="Close victory screen">
        <X className="size-7" />
      </button>
      <div className="relative text-center">
        <Trophy className="mx-auto size-24 text-trophy" aria-hidden />
        <p className="mt-6 font-display text-2xl text-ink-muted">{winners.length > 1 ? 'Joint champions' : 'Champions'}</p>
        <h2 className="mt-2 font-display text-[clamp(3rem,9vw,8rem)] font-bold leading-none text-trophy">{winners.map((w) => w.nickname).join(' & ')}</h2>
        <p className="mt-4 font-display text-4xl tabular-nums">{winners[0].totalPoints} points</p>
        {runnersUp.length > 0 && (
          <div className="mt-12 flex justify-center gap-16">
            {runnersUp.map((r) => (
              <div key={r.id}>
                <div className="font-display text-xl text-ink-muted">#{r.rank}</div>
                <div className="font-display text-3xl font-bold">{r.nickname}</div>
                <div className="tabular-nums text-ink-muted">{r.totalPoints} points</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
