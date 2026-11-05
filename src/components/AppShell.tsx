import { clsx } from 'clsx'
import { BookOpen, CircleHelp, CloudAlert, CloudCheck, CloudOff, LoaderCircle, Medal, Swords, Volume2, VolumeX } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { totalPoints } from '../game/progress.ts'
import { useActiveProfile, useAppState } from '../hooks/useAppState.ts'
import { useOutboxSync } from '../hooks/useSync.ts'
import { appStore } from '../lib/appStore.ts'
import { isBackendConfigured } from '../lib/supabase.ts'

const NAV = [
  { to: '/missions', label: 'Missions', icon: Swords },
  { to: '/leaderboard', label: 'Leaderboard', icon: Medal },
  { to: '/reference', label: 'Reference', icon: BookOpen },
  { to: '/how-to-play', label: 'How to play', icon: CircleHelp },
]

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx('font-display font-bold tracking-[0.08em] text-ink', className)}>
      COMMAND<span className="text-signal">/</span>QUEST
    </span>
  )
}

function SyncIndicator() {
  const profile = useActiveProfile()
  const { status, pending, rejected, retry } = useOutboxSync()
  if (!profile?.classroom || !isBackendConfigured) return null
  if (rejected > 0) {
    return (
      <button
        type="button"
        onClick={() => appStore.dismissRejected(profile.id)}
        className="hidden sm:inline-flex items-center gap-1.5 text-xs text-warn"
        title="Some answers were not scored (for example, the competition had closed). Click to dismiss."
      >
        <CloudAlert className="size-4" aria-hidden /> {rejected} not scored
      </button>
    )
  }
  if (status === 'syncing') {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-ink-muted" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Saving
      </span>
    )
  }
  if (pending > 0) {
    return (
      <button type="button" onClick={retry} className="hidden sm:inline-flex items-center gap-1.5 text-xs text-warn" title="Answers are saved on this device and will be sent when the connection returns.">
        <CloudOff className="size-4" aria-hidden /> {pending} waiting to send
      </button>
    )
  }
  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-go" title="All answers have been scored by the server">
      <CloudCheck className="size-4" aria-hidden /> Synced
    </span>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const profile = useActiveProfile()
  const sound = useAppState((s) => s.settings.sound)
  const reducedMotion = useAppState((s) => s.settings.reducedMotion)
  const location = useLocation()

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion)
  }, [reducedMotion])

  useEffect(() => {
    // Move focus to main content on navigation for keyboard and screen-reader users.
    document.getElementById('main')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-signal focus:text-field-deep focus:px-3 focus:py-2 focus:rounded">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-steel bg-field/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="text-[17px] shrink-0" aria-label="Command Quest home">
            <Wordmark />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors',
                    isActive ? 'text-ink bg-pit-raised' : 'text-ink-muted hover:text-ink',
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SyncIndicator />
            <button
              type="button"
              onClick={() => appStore.updateSettings({ sound: !sound })}
              className="rounded p-1.5 text-ink-muted hover:text-ink"
              aria-pressed={sound}
              aria-label={sound ? 'Turn sound effects off' : 'Turn sound effects on'}
              title={sound ? 'Sound on' : 'Sound off'}
            >
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            {profile ? (
              <Link to="/start" className="flex items-center gap-2 rounded border border-steel px-2.5 py-1 text-sm hover:border-signal/60" title="Switch team">
                <span className="max-w-[10rem] truncate font-medium">{profile.nickname}</span>
                <span className="font-display text-trophy tabular-nums">{totalPoints(profile.progress)}</span>
              </Link>
            ) : (
              <Link to="/start" className="text-sm text-signal hover:underline">
                Choose a team
              </Link>
            )}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t border-steel">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-ink-faint sm:px-6">
          <span>
            Teaches WPILib Commands v3 (2027). The simulator is an educational model, not the real WPILib runtime.{' '}
            {isBackendConfigured ? 'Classroom server connected.' : 'Local demonstration mode: scores stay on this device.'}
          </span>
          <span className="flex gap-4">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={reducedMotion} onChange={(e) => appStore.updateSettings({ reducedMotion: e.target.checked })} />
              Reduce motion
            </label>
            <Link to="/teacher" className="hover:text-ink">
              Teacher dashboard
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
