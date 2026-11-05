import { clsx } from 'clsx'
import { Download, LogOut, MonitorPlay, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, buttonClass, EmptyState, LinkButton, Panel, Spinner, TIER } from '../components/ui.tsx'
import { CHALLENGES, DIFFICULTIES } from '../game/challenges/index.ts'
import type { Difficulty } from '../game/types.ts'
import { useNow } from '../hooks/useAppState.ts'
import { currentTeacher, listMyClassrooms, signOut, teacherApi, teacherSignIn, watchClassroom, type Classroom } from '../lib/backend.ts'
import { downloadCsv } from '../lib/csv.ts'
import { conceptStruggles, type ChallengeStat } from '../lib/stats.ts'
import { isBackendConfigured } from '../lib/supabase.ts'
import { formatRemaining } from './MissionsPage.tsx'

export default function TeacherPage() {
  if (!isBackendConfigured) return <NoBackend />
  return <TeacherGate />
}

function NoBackend() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Teacher dashboard</h1>
      <p className="mt-3 text-ink-muted">
        This copy of Command Quest is running in local demonstration mode, so there is no classroom server to manage. Students can still play every mission,
        and their scores stay on their own devices.
      </p>
      <Panel title="Turn on classroom competitions" className="mt-6">
        <ol className="grid list-decimal gap-2 py-4 pl-9 pr-4 text-sm text-ink-muted">
          <li>Create a free Supabase project and apply the migrations in <code className="inline-code">supabase/migrations</code>.</li>
          <li>Deploy the <code className="inline-code">submit-answer</code> Edge Function and enable anonymous sign-ins.</li>
          <li>Create your teacher login and add it to the <code className="inline-code">teachers</code> table.</li>
          <li>
            Set <code className="inline-code">VITE_SUPABASE_URL</code> and <code className="inline-code">VITE_SUPABASE_ANON_KEY</code> as GitHub Actions variables and
            redeploy.
          </li>
        </ol>
        <p className="border-t border-steel px-4 py-3 text-sm text-ink-muted">The README has step-by-step instructions.</p>
      </Panel>
      <div className="mt-6 flex flex-wrap gap-3">
        <LinkButton to="/present/local" variant="primary">
          <MonitorPlay className="size-4" aria-hidden /> Present this device&apos;s leaderboard
        </LinkButton>
        <LinkButton to="/missions">Browse missions</LinkButton>
      </div>
    </div>
  )
}

function TeacherGate() {
  const [state, setState] = useState<'loading' | 'signed-out' | 'not-teacher' | 'ready'>('loading')
  const [email, setEmail] = useState('')
  const check = useCallback(async () => {
    try {
      const t = await currentTeacher()
      if (!t) setState('signed-out')
      else {
        setEmail(t.email)
        setState(t.isTeacher ? 'ready' : 'not-teacher')
      }
    } catch {
      setState('signed-out')
    }
  }, [])
  useEffect(() => {
    void check()
  }, [check])

  if (state === 'loading')
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  if (state === 'signed-out') return <SignIn onDone={check} />
  if (state === 'not-teacher') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold">Teacher access needed</h1>
        <p className="mt-3 text-ink-muted">
          You are signed in as {email}, but this account is not in the <code className="inline-code">teachers</code> table. A project admin can add it in the
          Supabase SQL editor:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-field-deep p-4 text-sm">{`insert into public.teachers (user_id)
select id from auth.users where email = '${email}';`}</pre>
        <Button
          className="mt-6"
          onClick={async () => {
            await signOut()
            void check()
          }}
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </div>
    )
  }
  return (
    <Dashboard
      email={email}
      onSignOut={async () => {
        await signOut()
        void check()
      }}
    />
  )
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await teacherSignIn(email.trim(), password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold">Teacher sign-in</h1>
      <p className="mt-2 text-ink-muted">Use the teacher account created in your Supabase project. Students never need to sign in here.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 rounded-lg border border-steel bg-field-deep px-3 focus:border-signal"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 rounded-lg border border-steel bg-field-deep px-3 focus:border-signal"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-fault">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}

function Dashboard({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [rooms, setRooms] = useState<Classroom[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await listMyClassrooms()
      setRooms(list)
      setSelected((s) => s ?? list[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load classrooms')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const room = rooms?.find((r) => r.id === selected)

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Teacher dashboard</h1>
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          {email}
          <Button size="sm" variant="ghost" onClick={onSignOut}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </Button>
        </div>
      </div>
      {error && <p className="mt-4 text-fault">{error}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <CreateClassroom
            onCreated={(r) => {
              setRooms((list) => [r, ...(list ?? [])])
              setSelected(r.id)
            }}
          />
          <Panel title="Your classrooms">
            {rooms === null ? (
              <div className="p-4">
                <Spinner />
              </div>
            ) : rooms.length === 0 ? (
              <p className="p-4 text-sm text-ink-muted">No classrooms yet.</p>
            ) : (
              <ul className="divide-y divide-steel/70">
                {rooms.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className={clsx('flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm', r.id === selected ? 'bg-signal/10' : 'hover:bg-pit-raised')}
                    >
                      <span className="truncate font-medium">{r.name}</span>
                      <StatusBadge room={r} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        {room ? (
          <ClassroomDetail
            key={room.id}
            room={room}
            onChange={(r) => setRooms((list) => list?.map((x) => (x.id === r.id ? r : x)) ?? null)}
            onDeleted={() => {
              setRooms((list) => list?.filter((x) => x.id !== room.id) ?? null)
              setSelected(null)
            }}
          />
        ) : (
          <EmptyState title="Create a classroom to begin">Each classroom gets a 6-character join code for students.</EmptyState>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ room }: { room: Classroom }) {
  const now = useNow(5000)
  const ended = room.status === 'closed' || (room.ends_at && new Date(room.ends_at).getTime() < now)
  if (room.status === 'lobby') return <Badge tone="neutral">Lobby</Badge>
  if (ended) return <Badge tone="trophy">Finished</Badge>
  return <Badge tone="go">Running</Badge>
}

function DifficultyPicker({ value, onChange }: { value: Difficulty[]; onChange: (d: Difficulty[]) => void }) {
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-sm font-medium">Enabled tiers</legend>
      {DIFFICULTIES.map((d) => (
        <label key={d} className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.includes(d)}
            onChange={(e) => {
              const next = e.target.checked ? [...value, d] : value.filter((x) => x !== d)
              if (next.length) onChange(DIFFICULTIES.filter((x) => next.includes(x)))
            }}
          />
          <span className={TIER[d].text}>{TIER[d].label}</span> <span className="text-ink-muted">{TIER[d].name}</span>
        </label>
      ))}
    </fieldset>
  )
}

function CreateClassroom({ onCreated }: { onCreated: (r: Classroom) => void }) {
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(40)
  const [diffs, setDiffs] = useState<Difficulty[]>(['easy', 'medium', 'hard'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Panel title="New competition">
      <form
        className="grid gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            onCreated(await teacherApi.create(name.trim() || 'FRC Training', duration, diffs))
            setName('')
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not create the classroom')
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="FRC Training, Period 3" className="h-9 rounded border border-steel bg-field-deep px-2.5" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Duration (minutes)</span>
          <input type="number" min={5} max={240} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-9 w-24 rounded border border-steel bg-field-deep px-2.5" />
        </label>
        <DifficultyPicker value={diffs} onChange={setDiffs} />
        {error && <p className="text-sm text-fault">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          <Plus className="size-4" aria-hidden /> Create and get a join code
        </Button>
      </form>
    </Panel>
  )
}

type Participant = Awaited<ReturnType<typeof teacherApi.participants>>[number]

function ClassroomDetail({ room, onChange, onDeleted }: { room: Classroom; onChange: (r: Classroom) => void; onDeleted: () => void }) {
  const now = useNow(1000)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [stats, setStats] = useState<ChallengeStat[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(room.duration_minutes)

  const refresh = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([teacherApi.participants(room.id), teacherApi.stats(room.id)])
      setParticipants(p.sort((a, b) => b.total_points - a.total_points))
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load classroom data')
    }
  }, [room.id])

  useEffect(() => {
    void refresh()
    return watchClassroom(room.id, () => void refresh(), 15_000)
  }, [room.id, refresh])

  const act = async (fn: () => Promise<Classroom | void>) => {
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      if (r) onChange(r)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That action failed')
    } finally {
      setBusy(false)
    }
  }

  const running = room.status === 'running' && (!room.ends_at || new Date(room.ends_at).getTime() > now)
  const struggles = conceptStruggles(stats).filter((s) => s.score > 0).slice(0, 5)
  const active = participants.filter((p) => now - new Date(p.last_active_at).getTime() < 5 * 60_000).length

  const exportCsv = async () => {
    const completions = await teacherApi.completions(room.id)
    const header = ['Rank', 'Team', 'Total points', 'Easy', 'Medium', 'Hard', 'Last scored', ...CHALLENGES.map((c) => c.title)]
    const rows = participants.map((p, i) => [
      i + 1,
      p.nickname,
      p.total_points,
      p.easy_completed,
      p.medium_completed,
      p.hard_completed,
      p.last_scored_at ?? '',
      ...CHALLENGES.map((c) => completions.find((x) => x.participant_id === p.id && x.challenge_id === c.id)?.points ?? ''),
    ])
    downloadCsv(`command-quest-${room.join_code}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
  }

  return (
    <div className="grid content-start gap-6">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-6 p-5">
          <div>
            <h2 className="text-2xl font-bold">{room.name}</h2>
            <div className="mt-2 flex items-center gap-3">
              <StatusBadge room={room} />
              <span className="text-sm text-ink-muted">
                {room.status === 'lobby' && `${room.duration_minutes} minutes once started`}
                {running && room.ends_at && `${formatRemaining(new Date(room.ends_at).getTime() - now)} remaining`}
                {!running && room.status !== 'lobby' && 'Scores are final'}
              </span>
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              {participants.length} teams joined, {active} active in the last 5 minutes.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-muted">Join code</div>
            <div className="font-mono text-4xl font-bold tracking-[0.25em] text-signal" data-testid="join-code">
              {room.join_code}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-steel px-5 py-3">
          {!running ? (
            <Button variant="primary" disabled={busy} onClick={() => act(() => teacherApi.start(room.id))}>
              <Play className="size-4" aria-hidden /> {room.status === 'lobby' ? 'Start competition' : 'Restart timer'}
            </Button>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => window.confirm('Close the competition now? Scores become final.') && act(() => teacherApi.close(room.id))}>
              <Square className="size-4" aria-hidden /> Close competition
            </Button>
          )}
          <Link to={`/present/${room.id}`} target="_blank" className={buttonClass('gold', 'md')}>
            <MonitorPlay className="size-4" aria-hidden /> Present leaderboard
          </Link>
          <Button disabled={busy || participants.length === 0} onClick={() => void exportCsv()}>
            <Download className="size-4" aria-hidden /> Export CSV
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => window.confirm('Reset every score in this classroom? Teams stay joined, but all attempts and points are deleted.') && act(() => teacherApi.reset(room.id))}
          >
            <RotateCcw className="size-4" aria-hidden /> Reset scores
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete "${room.name}" and all of its data? This cannot be undone.`)) {
                void teacherApi.remove(room.id).then(onDeleted, (e) => setError(e instanceof Error ? e.message : 'Delete failed'))
              }
            }}
          >
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
        </div>
        {error && <p className="border-t border-steel px-5 py-2 text-sm text-fault">{error}</p>}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Settings">
          <div className="grid gap-4 p-4">
            <div className="flex items-end gap-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Duration (minutes)</span>
                <input type="number" min={5} max={240} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-9 w-24 rounded border border-steel bg-field-deep px-2.5" />
              </label>
              <Button size="sm" disabled={busy || duration === room.duration_minutes} onClick={() => act(() => teacherApi.update(room.id, { durationMinutes: duration }))}>
                Save
              </Button>
            </div>
            <DifficultyPicker value={room.enabled_difficulties} onChange={(d) => void act(() => teacherApi.update(room.id, { difficulties: d }))} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={room.rankings_hidden} onChange={(e) => void act(() => teacherApi.update(room.id, { rankingsHidden: e.target.checked }))} />
              Hide rankings from students (reveal later for suspense)
            </label>
          </div>
        </Panel>
        <Panel title="Where students struggle">
          {struggles.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">No wrong answers or hints yet. Concepts that trip teams up will appear here.</p>
          ) : (
            <ul className="grid gap-2 p-4">
              {struggles.map((s) => (
                <li key={s.concept} className="text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{s.label}</span>
                    <span className="text-ink-muted tabular-nums">
                      {s.wrong} wrong of {s.attempts}, {s.hints} hints
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-field-deep">
                    <div className="h-full rounded-full bg-warn" style={{ width: `${Math.min(100, s.score * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Mission statistics">
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink-faint">
              <tr>
                <th className="py-1 pr-3 font-normal">Mission</th>
                <th className="py-1 pr-3 text-right font-normal">Teams tried</th>
                <th className="py-1 pr-3 text-right font-normal">Solved</th>
                <th className="py-1 pr-3 text-right font-normal">Wrong answers</th>
                <th className="py-1 pr-3 text-right font-normal">Hints</th>
                <th className="py-1 text-right font-normal">Avg tries to solve</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.challenge_id} className="border-t border-steel/60">
                  <td className="py-1.5 pr-3">
                    <span className={clsx('mr-2 text-xs', TIER[s.difficulty as Difficulty]?.text)}>{TIER[s.difficulty as Difficulty]?.label}</span>
                    {s.title}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.teams_attempted}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-go">{s.teams_completed}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-warn">{s.wrong_attempts}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.hints_used}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.avg_attempts_to_solve ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`Teams (${participants.length})`}>
        {participants.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">
            No teams yet. Students open the game, choose Start Competition, and enter the code <strong className="font-mono text-signal">{room.join_code}</strong>.
          </p>
        ) : (
          <ul className="divide-y divide-steel/70">
            {participants.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{p.nickname}</span>
                <span className="flex gap-2 text-xs tabular-nums" aria-label={`Completed: ${p.easy_completed} easy, ${p.medium_completed} medium, ${p.hard_completed} hard`}>
                  <span className="text-tier-easy">E{p.easy_completed}</span>
                  <span className="text-tier-medium">M{p.medium_completed}</span>
                  <span className="text-tier-hard">H{p.hard_completed}</span>
                </span>
                <span className="w-16 text-right font-display font-bold tabular-nums text-trophy">{p.total_points}</span>
                <button
                  type="button"
                  className="rounded p-1 text-ink-faint hover:bg-fault/15 hover:text-fault"
                  aria-label={`Remove ${p.nickname}`}
                  onClick={() => window.confirm(`Remove team ${p.nickname} and its scores?`) && void act(() => teacherApi.removeParticipant(p.id))}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
