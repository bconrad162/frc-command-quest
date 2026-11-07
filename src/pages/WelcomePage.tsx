import { Bot, Code2, Cpu, Gamepad2, Medal } from 'lucide-react'
import { HeroDemo } from '../components/HeroDemo.tsx'
import { LinkButton, TIER } from '../components/ui.tsx'
import { CHALLENGES, challengesFor, DIFFICULTIES } from '../game/challenges/index.ts'
import type { Difficulty } from '../game/types.ts'
import { useActiveProfile } from '../hooks/useAppState.ts'
import { isBackendConfigured } from '../lib/supabase.ts'
import { BASE_POINTS } from '../scoring/scoring.ts'

const TIER_TOPICS: Record<Difficulty, string> = {
  easy: 'Java basics, loops and conditions, what a command is, execution order, your first coroutine yield, and the Xbox controller.',
  medium: 'Mechanism requirements, conflicts and priorities, fork versus await, scheduler cycles, button bindings.',
  hard: 'Parent and child commands, interruption and cancellation, autonomous routines, default drive commands.',
}

const MODES = [
  {
    icon: Code2,
    name: 'Java Debugging Lab',
    text: 'Predict output, fix loops and conditions, and assemble real Java statements in a constrained editor.',
  },
  {
    icon: Cpu,
    name: 'Scheduler Showdown',
    text: 'Predict what the Commands v3 scheduler will do, then step through it cycle by cycle to check yourself.',
  },
  {
    icon: Bot,
    name: 'Autonomous Architect',
    text: 'Build an autonomous routine from fork and await steps, then race the clock for the fastest legal run.',
  },
  {
    icon: Gamepad2,
    name: 'Driver Controls',
    text: 'Map code to the buttons and sticks of an Xbox controller and pick the binding that makes the robot do what drivers expect.',
  },
]

export default function WelcomePage() {
  const profile = useActiveProfile()
  return (
    <div>
      <section className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pt-16">
        <div>
          <h1 className="font-display text-[clamp(2.8rem,6vw,5rem)] font-bold leading-[0.95] tracking-[0.02em]">
            COMMAND
            <br />
            QUEST
          </h1>
          <p className="mt-5 max-w-md text-xl text-ink-muted">Master Java. Control the Scheduler. Win the Competition.</p>
          <p className="mt-3 max-w-md text-[15px] text-ink-faint">
            A training game for FIRST Robotics Competition programmers, built around WPILib Commands v3 for the 2027 season.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton to={profile ? '/missions' : '/start'} variant="primary" size="lg" data-testid="start-competition">
              {profile ? `Continue as ${profile.nickname}` : 'Start Competition'}
            </LinkButton>
            <LinkButton to="/practice/easy-1-battery-math" size="lg">
              Practice Mode
            </LinkButton>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <LinkButton to="/how-to-play" variant="ghost" size="sm">
              How to Play
            </LinkButton>
            <LinkButton to="/leaderboard" variant="ghost" size="sm">
              <Medal className="size-4" aria-hidden /> Leaderboard
            </LinkButton>
            <LinkButton to="/teacher" variant="ghost" size="sm">
              Teacher Dashboard
            </LinkButton>
          </div>
          {!isBackendConfigured && (
            <p className="mt-6 max-w-md border-l-2 border-warn/60 pl-3 text-sm text-ink-muted">
              Local demonstration mode. Everything is playable, and scores are saved on this device only. Shared classroom leaderboards need the
              classroom server (see the README).
            </p>
          )}
        </div>
        <HeroDemo />
      </section>

      <section className="border-y border-steel bg-pit/50">
        <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-bold">Three tiers, {CHALLENGES.length} missions</h2>
          <p className="mt-1 text-ink-muted">Pick the tier that fits. Missions in a tier unlock in order.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {DIFFICULTIES.map((d) => (
              <div key={d} className="border-l-4 bg-pit px-5 py-4" style={{ borderColor: TIER[d].color }}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-xl font-bold">{TIER[d].name}</h3>
                  <span className={`text-sm ${TIER[d].text}`}>{TIER[d].label}</span>
                </div>
                <p className="mt-2 text-sm text-ink-muted">{TIER_TOPICS[d]}</p>
                <p className="mt-3 text-sm text-ink-faint">
                  {challengesFor(d).length} missions, {BASE_POINTS[d]} base points each
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-bold">Four ways to play</h2>
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map(({ icon: Icon, name, text }) => (
            <div key={name}>
              <Icon className="size-6 text-signal" aria-hidden />
              <h3 className="mt-2 text-lg font-bold">{name}</h3>
              <p className="mt-1 text-[15px] text-ink-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
