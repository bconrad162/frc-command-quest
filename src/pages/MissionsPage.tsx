import { clsx } from 'clsx'
import { CheckCircle2, CircleDashed, Clock, Lock, SkipForward } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, LinkButton, RichText, TIER } from '../components/ui.tsx'
import { challengesFor, DIFFICULTIES } from '../game/challenges/index.ts'
import { isUnlocked, progressFor, totalPoints } from '../game/progress.ts'
import { CONCEPT_LABELS } from '../game/types.ts'
import { competitionPhase, useClassroom } from '../hooks/useClassroom.ts'
import { useActiveProfile, useNow } from '../hooks/useAppState.ts'
import { maxScore } from '../scoring/scoring.ts'

const MODE_SHORT = { 'java-lab': 'Java Lab', scheduler: 'Scheduler', autonomous: 'Autonomous' } as const

export function formatRemaining(ms: number): string {
  if (ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function MissionsPage() {
  const profile = useActiveProfile()
  const { classroom } = useClassroom(profile?.classroom?.id)
  const now = useNow(1000)
  const progress = profile?.progress ?? {}
  const phase = profile?.classroom ? competitionPhase(classroom, now) : null

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mission select</h1>
          <p className="mt-1 text-ink-muted">
            {profile ? (
              <>
                Playing as <strong className="text-ink">{profile.nickname}</strong>
                {profile.classroom ? ` in ${profile.classroom.name}` : ' on this device'}.
              </>
            ) : (
              <>
                Browsing missions. <Link to="/start" className="text-signal hover:underline">Choose a team</Link> to earn points, or open any mission in practice mode.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-6">
          {phase && (
            <div className="text-right" role="status">
              <div className="text-xs text-ink-muted">Competition</div>
              <div className="flex items-center gap-1.5 font-display text-lg">
                <Clock className="size-4 text-signal" aria-hidden />
                {phase === 'lobby' && 'Waiting to start'}
                {phase === 'ended' && 'Finished'}
                {phase === 'running' && classroom?.ends_at && formatRemaining(new Date(classroom.ends_at).getTime() - now)}
              </div>
            </div>
          )}
          {profile && (
            <div className="text-right">
              <div className="text-xs text-ink-muted">Total points</div>
              <div className="font-display text-3xl font-bold text-trophy tabular-nums" data-testid="total-points">
                {totalPoints(progress)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {DIFFICULTIES.map((d) => {
          const tier = challengesFor(d)
          const done = tier.filter((c) => progressFor(progress, c.id).completed).length
          const disabled = classroom && !classroom.enabled_difficulties.includes(d)
          return (
            <section key={d} aria-labelledby={`tier-${d}`} className={clsx('panel overflow-hidden', disabled && 'opacity-50')}>
              <header className="border-b border-steel px-5 py-4" style={{ boxShadow: `inset 0 3px 0 ${TIER[d].color}` }}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id={`tier-${d}`} className="text-xl font-bold">
                    {TIER[d].name}
                  </h2>
                  <span className={clsx('text-sm font-medium', TIER[d].text)}>{TIER[d].label}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-field-deep" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${(done / tier.length) * 100}%`, background: TIER[d].color }} />
                  </div>
                  <span className="text-xs tabular-nums text-ink-muted">
                    {done}/{tier.length} complete
                  </span>
                </div>
                {disabled && <p className="mt-2 text-xs text-warn">Turned off by your teacher for this competition.</p>}
              </header>
              <ol className="divide-y divide-steel/70">
                {tier.map((c, i) => {
                  const p = progressFor(progress, c.id)
                  const open = isUnlocked(c, progress)
                  const Icon = p.completed ? CheckCircle2 : p.skipped ? SkipForward : open ? CircleDashed : Lock
                  return (
                    <li key={c.id} className="px-5 py-3.5" data-testid={`mission-${c.id}`}>
                      <div className="flex items-start gap-3">
                        <Icon
                          className={clsx('mt-0.5 size-5 shrink-0', p.completed ? 'text-go' : p.skipped ? 'text-warn' : open ? 'text-signal' : 'text-ink-faint')}
                          aria-label={p.completed ? 'Completed' : p.skipped ? 'Skipped' : open ? 'Available' : 'Locked'}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <h3 className="font-sans text-[15px] font-semibold">
                              {i + 1}. {c.title}
                            </h3>
                            <span className="text-xs tabular-nums text-ink-muted">
                              {p.completed ? <span className="text-trophy">{p.points} pts</span> : `up to ${maxScore(c.difficulty, c.kind === 'autonomous', c.basePoints)} pts`}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-ink-muted">
                            <RichText text={c.objective} />
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge tone="signal">{MODE_SHORT[c.mode]}</Badge>
                            {c.concepts.slice(0, 3).map((k) => (
                              <Badge key={k}>{CONCEPT_LABELS[k]}</Badge>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-2">
                            {profile && open && !disabled && (
                              <LinkButton to={`/play/${c.id}`} size="sm" variant={p.completed ? 'secondary' : 'primary'} data-testid={`play-${c.id}`}>
                                {p.completed ? 'Replay' : p.attempts > 0 ? 'Continue' : 'Play'}
                              </LinkButton>
                            )}
                            <LinkButton to={`/practice/${c.id}`} size="sm" variant="ghost">
                              Practice
                            </LinkButton>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
      </div>
    </div>
  )
}
