import { Trash2, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Panel } from '../components/ui.tsx'
import { totalPoints } from '../game/progress.ts'
import { useAppState } from '../hooks/useAppState.ts'
import { appStore, validateNickname } from '../lib/appStore.ts'
import { joinClassroom } from '../lib/backend.ts'
import { isBackendConfigured } from '../lib/supabase.ts'

export default function StartPage() {
  const profiles = useAppState((s) => s.profiles)
  const activeId = useAppState((s) => s.activeProfileId)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/missions'
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState(params.get('code') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const problem = validateNickname(nickname)
    if (problem) {
      setError(problem)
      return
    }
    const joinCode = code.trim().toUpperCase()
    if (joinCode && !/^[A-Z2-9]{6}$/.test(joinCode)) {
      setError('Join codes are 6 letters and numbers, like K7PQ2M.')
      return
    }
    if (joinCode && !isBackendConfigured) {
      setError('This copy of Command Quest is not connected to a classroom server, so join codes cannot be used. Leave the code empty to play locally.')
      return
    }
    setBusy(true)
    try {
      if (joinCode) {
        const joined = await joinClassroom(joinCode, nickname)
        appStore.createProfile(joined.nickname, {
          id: joined.classroomId,
          code: joinCode,
          name: joined.classroomName,
          participantId: joined.participantId,
        })
      } else {
        appStore.createProfile(nickname)
      }
      navigate(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join. Check the code and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div>
        <h1 className="text-3xl font-bold">Choose your team name</h1>
        <p className="mt-2 text-ink-muted">
          Pick a team nickname. Do not use your real name: the nickname appears on the shared leaderboard. No email or account needed.
        </p>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Team nickname</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              autoComplete="off"
              placeholder="e.g. Swerve Wizards"
              className="h-11 rounded-lg border border-steel bg-field-deep px-3 text-ink placeholder:text-ink-faint focus:border-signal"
              data-testid="nickname-input"
              aria-describedby="nickname-help"
              required
            />
            <span id="nickname-help" className="text-xs text-ink-faint">
              2 to 24 characters: letters, numbers, spaces, and _ - . ! &apos;
            </span>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">
              Classroom join code <span className="font-normal text-ink-faint">(optional)</span>
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoComplete="off"
              placeholder={isBackendConfigured ? 'From your teacher, e.g. K7PQ2M' : 'Not available in local mode'}
              className="h-11 rounded-lg border border-steel bg-field-deep px-3 font-mono uppercase tracking-[0.2em] text-ink placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-ink-faint focus:border-signal"
              data-testid="code-input"
            />
            <span className="text-xs text-ink-faint">
              {isBackendConfigured
                ? 'With a code, your scores go to your classroom leaderboard. Without one, scores stay on this device.'
                : 'Local demonstration mode: scores stay on this device.'}
            </span>
          </label>
          {error && (
            <p role="alert" className="rounded-lg border border-fault/40 bg-fault/10 px-3 py-2 text-sm text-fault">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" variant="primary" size="lg" disabled={busy} data-testid="create-team">
              {busy ? 'Joining...' : code.trim() ? 'Join classroom' : 'Start playing'}
            </Button>
          </div>
        </form>
      </div>

      <Panel title={<span className="inline-flex items-center gap-2"><Users className="size-4" aria-hidden /> Teams on this device</span>}>
        {profiles.length === 0 ? (
          <p className="px-4 py-4 text-sm text-ink-muted">No teams yet. Create one to start your first mission.</p>
        ) : (
          <ul className="divide-y divide-steel">
            {profiles.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {p.nickname}
                    {p.id === activeId && <span className="ml-2 text-xs text-signal">playing now</span>}
                  </div>
                  <div className="text-xs text-ink-faint">{p.classroom ? `Classroom ${p.classroom.name} (${p.classroom.code})` : 'Local only'}</div>
                </div>
                <span className="font-display text-trophy tabular-nums">{totalPoints(p.progress)}</span>
                {p.id !== activeId && (
                  <Button
                    size="sm"
                    onClick={() => {
                      appStore.switchProfile(p.id)
                      navigate(next)
                    }}
                  >
                    Play
                  </Button>
                )}
                <button
                  type="button"
                  className="rounded p-1.5 text-ink-faint hover:bg-fault/15 hover:text-fault"
                  aria-label={`Remove ${p.nickname} from this device`}
                  onClick={() => {
                    if (window.confirm(`Remove ${p.nickname} from this device? Local progress for this team will be deleted.`)) appStore.removeProfile(p.id)
                  }}
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
