import { clsx } from 'clsx'
import { ChevronRight, Eye, Lock, Play, RotateCcw, Target } from 'lucide-react'
import { Suspense, useCallback, useMemo, useState } from 'react'
import { lazyPage } from '../lib/lazyPage.ts'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AutonomousBuilder, FieldView } from '../components/challenge/AutonomousBuilder.tsx'
import { ControllerMapInput } from '../components/challenge/ControllerMapInput.tsx'
import { AnswerRevealPanel, FeedbackPanel, HintButton, HintList } from '../components/challenge/Feedback.tsx'
import { ChoiceInput, LazyCode, PredictOutputInput, ReorderInput, TimelineInput } from '../components/challenge/inputs.tsx'
import { SchedulerPanel } from '../components/scheduler/SchedulerPanel.tsx'
import { Timeline } from '../components/scheduler/Timeline.tsx'
import { Badge, Button, LinkButton, Panel, RichText, Spinner, TIER, TierBadge } from '../components/ui.tsx'
import { challengesFor, getChallenge } from '../game/challenges/index.ts'
import { gradeAnswer, referenceAnswer } from '../game/grading.ts'
import { isRevealed, isUnlocked, progressFor, REVEAL_AFTER_WRONG, type AttemptOutcome } from '../game/progress.ts'
import type { Answer, Challenge, GradeResult, TimelineCell } from '../game/types.ts'
import { CONCEPT_LABELS } from '../game/types.ts'
import { competitionPhase, useClassroom } from '../hooks/useClassroom.ts'
import { useActiveProfile, useAppState, useNow } from '../hooks/useAppState.ts'
import { appStore } from '../lib/appStore.ts'
import { playSound } from '../lib/sound.ts'
import { isBackendConfigured } from '../lib/supabase.ts'
import { maxScore, SCORING_RULES } from '../scoring/scoring.ts'
import { AUTO_COMMAND_ID, AutonomousWorld, buildAutonomousScenario, type RoutineStep } from '../simulation/autonomous.ts'
import type { CommandScheduler } from '../simulation/scheduler.ts'
import { simulate } from '../simulation/scheduler.ts'

const ConstrainedEditor = lazyPage(() => import('../components/code/ConstrainedEditor.tsx'))

const MODE_LABEL = {
  'java-lab': 'Java Debugging Lab',
  scheduler: 'Scheduler Showdown',
  autonomous: 'Autonomous Architect',
  controls: 'Driver Controls',
} as const

export default function ChallengePage({ practice = false }: { practice?: boolean }) {
  const { id = '' } = useParams()
  const challenge = getChallenge(id)
  const profile = useActiveProfile()
  if (!challenge) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl">Mission not found</h1>
        <p className="mt-2 text-ink-muted">That mission does not exist. It may have been renamed.</p>
        <LinkButton to="/missions" variant="primary" className="mt-6">
          Back to missions
        </LinkButton>
      </div>
    )
  }
  if (!practice && !profile) return <Navigate to={`/start?next=${encodeURIComponent(`/play/${challenge.id}`)}`} replace />
  return <ChallengeScreen key={`${challenge.id}-${practice}`} challenge={challenge} practice={practice} />
}

function defaultAnswer(c: Challenge): Answer {
  switch (c.kind) {
    case 'predict-output':
      return { kind: 'predict-output', text: '' }
    case 'choice':
      return { kind: 'choice', selected: [] }
    case 'code-edit':
      return { kind: 'code-edit', code: c.initial }
    case 'reorder':
      return { kind: 'reorder', order: c.initialOrder }
    case 'timeline':
      return { kind: 'timeline', cells: Object.fromEntries(c.rows.map((r) => [r, c.cycles.map(() => null as unknown as TimelineCell)])) }
    case 'autonomous':
      return { kind: 'autonomous', routine: c.starter }
    case 'controller-map':
      return { kind: 'controller-map', picks: Object.fromEntries(c.rows.map((r) => [r.id, null])) }
  }
}

function ChallengeScreen({ challenge, practice }: { challenge: Challenge; practice: boolean }) {
  const profile = useActiveProfile()
  const practiceMap = useAppState((s) => s.practice)
  const progress = practice ? progressFor(practiceMap, challenge.id) : progressFor(profile?.progress ?? {}, challenge.id)
  const unlocked = practice || isUnlocked(challenge, profile?.progress ?? {})
  const { classroom, loading: classroomLoading } = useClassroom(practice ? undefined : profile?.classroom?.id)
  const now = useNow(5000)

  const revealed = isRevealed(progress)
  const [answer, setAnswer] = useState<Answer>(() =>
    // Autonomous loads the working routine so it can be run; other kinds keep the
    // student's last attempt so it can be compared with the answer key.
    revealed && challenge.kind === 'autonomous'
      ? referenceAnswer(challenge)
      : progress.lastAnswer && progress.lastAnswer.kind === challenge.kind
        ? progress.lastAnswer
        : defaultAnswer(challenge),
  )
  const [result, setResult] = useState<{ grade: GradeResult; outcome?: AttemptOutcome | null } | null>(null)
  const [lastWrongKey, setLastWrongKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [practiceHints, setPracticeHints] = useState(0)
  const [peeked, setPeeked] = useState(false)

  const tier = challengesFor(challenge.difficulty)
  const index = tier.findIndex((c) => c.id === challenge.id)
  const next = tier[index + 1]
  const hasEfficiency = challenge.kind === 'autonomous'
  const available = maxScore(challenge.difficulty, hasEfficiency, challenge.basePoints)
  const revealedHints = practice ? practiceHints : progress.hintsUsed

  // Competition gating for classroom teams.
  let blocked: string | null = null
  if (!practice && profile?.classroom && isBackendConfigured) {
    if (classroomLoading && !classroom) blocked = 'Checking the competition status...'
    else {
      const phase = competitionPhase(classroom, now)
      if (phase === 'lobby') blocked = 'Your teacher has not started the competition yet. Practice mode is open while you wait.'
      else if (phase === 'ended') blocked = 'The competition is over. You can keep playing in practice mode.'
      else if (classroom && !classroom.enabled_difficulties.includes(challenge.difficulty))
        blocked = `${TIER[challenge.difficulty].label} missions are turned off for this competition.`
    }
  }

  const locked = Boolean(challenge.kind === 'choice' && challenge.predictFirst && progress.attempts === 0 && !result && !peeked)
  const solved = progress.completed || Boolean(result?.grade.correct)
  const showWhy = solved || revealed

  const submit = () => {
    setNotice(null)
    const key = JSON.stringify(answer)
    if (!solved && key === lastWrongKey) {
      setNotice('You already tried exactly this answer. Change something before checking again.')
      return
    }
    const grade = gradeAnswer(challenge, answer)
    if (grade.invalid) {
      setResult({ grade })
      return
    }
    const outcome = practice ? appStore.recordPractice(challenge.id, grade, answer) : appStore.recordAttempt(challenge.id, grade, answer)
    setResult({ grade, outcome })
    setLastWrongKey(grade.correct ? null : key)
    playSound(grade.correct ? 'correct' : 'wrong')
    // The third wrong attempt reveals the answer. Autonomous loads the working routine into the builder.
    if (outcome && isRevealed(outcome.progress) && challenge.kind === 'autonomous') setAnswer(referenceAnswer(challenge))
  }

  const retryPractice = () => {
    appStore.retryPractice(challenge.id)
    setAnswer(defaultAnswer(challenge))
    setResult(null)
    setLastWrongKey(null)
    setNotice(null)
    setPracticeHints(0)
    setPeeked(false)
  }

  const revealHint = () => {
    if (practice) setPracticeHints((h) => Math.min(challenge.hints.length, h + 1))
    else appStore.recordHint(challenge.id, revealedHints)
  }

  const scenario = 'scenario' in challenge ? challenge.scenario : undefined

  if (!unlocked) {
    const prev = tier[index - 1]
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Lock className="size-8 text-ink-faint" aria-hidden />
        <h1 className="mt-4 text-2xl">{challenge.title} is locked</h1>
        <p className="mt-2 text-ink-muted">Finish &quot;{prev?.title}&quot; first. Each mission builds on the one before it.</p>
        <div className="mt-6 flex gap-3">
          {prev && (
            <LinkButton to={`/play/${prev.id}`} variant="primary">
              Go to {prev.title}
            </LinkButton>
          )}
          <LinkButton to={`/practice/${challenge.id}`}>Try it in practice mode</LinkButton>
        </div>
      </div>
    )
  }

  const inputDisabled = Boolean(blocked) || revealed
  // After a reload the last grade is gone; re-grade the saved attempt so wrong timeline cells stay marked.
  const wrongCells =
    result?.grade.wrongCells ??
    (revealed && (challenge.kind === 'timeline' || challenge.kind === 'controller-map') ? gradeAnswer(challenge, answer).wrongCells : undefined)

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted">
        <Link to="/missions" className="hover:text-ink">
          Missions
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span>{TIER[challenge.difficulty].name}</span>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-ink">{challenge.title}</span>
      </nav>

      {practice && (
        <div className="mb-4 rounded-lg border border-tier-medium/40 bg-tier-medium/10 px-4 py-2.5 text-sm">
          Practice mode: replay freely. Nothing here changes competition scores.{' '}
          {profile && (
            <Link to={`/play/${challenge.id}`} className="text-signal underline-offset-2 hover:underline">
              Switch to competition
            </Link>
          )}
        </div>
      )}
      {blocked && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm" role="status">
          <span>{blocked}</span>
          <LinkButton to={`/practice/${challenge.id}`} size="sm">
            Open in practice mode
          </LinkButton>
        </div>
      )}

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-l-4 pl-4" style={{ borderColor: TIER[challenge.difficulty].color }}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <TierBadge difficulty={challenge.difficulty} long />
            <span className="text-ink-faint">{MODE_LABEL[challenge.mode]}</span>
            <span className="text-ink-faint">
              Mission {index + 1} of {tier.length}
            </span>
          </div>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{challenge.title}</h1>
          <p className="mt-1.5 flex max-w-3xl items-start gap-2 text-ink-muted">
            <Target className="mt-1 size-4 shrink-0 text-signal" aria-hidden />
            <RichText text={challenge.objective} />
          </p>
        </div>
        <ScoreCard
          available={available}
          practice={practice}
          attempts={progress.attempts}
          completed={progress.completed}
          skipped={progress.skipped}
          points={progress.points}
          hasEfficiency={hasEfficiency}
          confirmed={profile?.confirmed[challenge.id]?.points}
          classroom={Boolean(profile?.classroom) && !practice}
        />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-4">
          <Panel title="Briefing">
            <div className="grid gap-2.5 px-4 py-3 text-[15px] text-ink-muted">
              {challenge.briefing.map((p, i) => (
                <p key={i}>
                  <RichText text={p} />
                </p>
              ))}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {challenge.concepts.map((c) => (
                  <Badge key={c}>{CONCEPT_LABELS[c]}</Badge>
                ))}
              </div>
            </div>
          </Panel>
          {challenge.code && challenge.kind !== 'code-edit' && (
            <Panel title="Code">
              <div className="p-3">
                <LazyCode code={challenge.code} label={`${challenge.title} code`} />
                {challenge.codeNote && (
                  <p className="mt-2 text-xs text-ink-faint">
                    <RichText text={challenge.codeNote} />
                  </p>
                )}
              </div>
            </Panel>
          )}
        </div>

        <Panel title="Your mission" className="min-w-0 content-start">
          <div className="grid gap-4 px-4 py-4">
            <p className="text-[15px] text-ink">
              <RichText text={challenge.prompt} />
            </p>
            {challenge.kind === 'predict-output' && answer.kind === 'predict-output' && (
              <PredictOutputInput value={answer.text} onChange={(text) => setAnswer({ kind: 'predict-output', text })} disabled={inputDisabled} />
            )}
            {challenge.kind === 'choice' && answer.kind === 'choice' && (
              <ChoiceInput challenge={challenge} selected={answer.selected} onChange={(selected) => setAnswer({ kind: 'choice', selected })} disabled={inputDisabled} reveal={showWhy} />
            )}
            {challenge.kind === 'code-edit' && answer.kind === 'code-edit' && (
              <>
                <Suspense fallback={<Spinner label="Loading editor" />}>
                  <ConstrainedEditor
                    prefix={challenge.prefix}
                    initial={challenge.initial}
                    suffix={challenge.suffix}
                    value={answer.code}
                    onChange={(code) => setAnswer({ kind: 'code-edit', code })}
                    label={`${challenge.title} editor`}
                    disabled={inputDisabled}
                  />
                </Suspense>
                {challenge.codeNote && (
                  <p className="text-xs text-ink-faint">
                    <RichText text={challenge.codeNote} />
                  </p>
                )}
              </>
            )}
            {challenge.kind === 'reorder' && answer.kind === 'reorder' && (
              <>
                <ReorderInput challenge={challenge} order={answer.order} onChange={(order) => setAnswer({ kind: 'reorder', order })} disabled={inputDisabled} />
                {challenge.codeNote && (
                  <p className="text-xs text-ink-faint">
                    <RichText text={challenge.codeNote} />
                  </p>
                )}
              </>
            )}
            {challenge.kind === 'timeline' && answer.kind === 'timeline' && (
              <TimelineInput
                challenge={challenge}
                cells={answer.cells}
                onChange={(cells) => setAnswer({ kind: 'timeline', cells: cells as Record<string, TimelineCell[]> })}
                wrongCells={wrongCells}
                disabled={inputDisabled}
              />
            )}
            {challenge.kind === 'controller-map' && answer.kind === 'controller-map' && (
              <ControllerMapInput
                challenge={challenge}
                picks={answer.picks}
                onChange={(picks) => setAnswer({ kind: 'controller-map', picks })}
                wrongRows={wrongCells}
                disabled={inputDisabled}
              />
            )}
            {challenge.kind === 'autonomous' && (
              <p className="text-sm text-ink-muted">Build your routine below, run it to watch the robot, then submit it for scoring.</p>
            )}

            {!revealed && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={submit} disabled={inputDisabled} data-testid="check-answer">
                  {challenge.kind === 'autonomous' ? 'Submit routine' : challenge.kind === 'choice' && challenge.predictFirst && !solved ? 'Lock in prediction' : 'Check answer'}
                </Button>
                <HintButton
                  total={challenge.hints.length}
                  revealed={revealedHints}
                  onReveal={revealHint}
                  practice={practice}
                  disabled={inputDisabled || solved}
                />
              </div>
            )}
            <HintList hints={challenge.hints} revealed={revealedHints} />
            {notice && (
              <p role="status" className="text-sm text-warn">
                {notice}
              </p>
            )}
            {!solved && !revealed && progress.wrongAttempts > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-ink-faint" data-testid="attempts-left">
                <Eye className="size-3.5" aria-hidden />
                Wrong attempts: {progress.wrongAttempts} of {REVEAL_AFTER_WRONG}. On wrong attempt {REVEAL_AFTER_WRONG} the answer is shown
                {practice ? '.' : ' and this mission earns no points.'}
              </p>
            )}
            {result && (
              <FeedbackPanel
                grade={result.grade}
                challenge={challenge}
                breakdown={result.outcome?.breakdown}
                awarded={result.outcome?.awarded}
                showWhy={Boolean(result.grade.correct)}
                practice={practice}
                alreadyCompleted={Boolean(result.outcome && !result.outcome.firstCompletion && result.grade.correct)}
              />
            )}
            {revealed && <AnswerRevealPanel challenge={challenge} practice={practice} wrongCells={wrongCells} />}
            {!result && progress.completed && (
              <FeedbackPanel
                grade={{ correct: true, feedback: 'You completed this mission.' }}
                challenge={challenge}
                showWhy
                practice
                alreadyCompleted={false}
              />
            )}
            {(solved || revealed) && (
              <div className="flex flex-wrap gap-2">
                {practice && revealed && (
                  <Button onClick={retryPractice}>
                    <RotateCcw className="size-4" aria-hidden /> Try it again
                  </Button>
                )}
                {next ? (
                  <LinkButton to={practice ? `/practice/${next.id}` : `/play/${next.id}`} variant="gold" data-testid="next-mission">
                    Next mission: {next.title} <ChevronRight className="size-4" aria-hidden />
                  </LinkButton>
                ) : (
                  <LinkButton to="/missions" variant="gold">
                    {TIER[challenge.difficulty].name} tier complete. Back to missions
                  </LinkButton>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {challenge.kind === 'autonomous' && answer.kind === 'autonomous' && (
        <AutonomousSection
          challenge={challenge}
          routine={answer.routine}
          onChange={(routine) => setAnswer({ kind: 'autonomous', routine })}
          disabled={inputDisabled}
        />
      )}

      {scenario && (
        <div className="mt-6">
          <SchedulerPanel
            scenario={scenario}
            locked={locked}
            lockedMessage="Lock in your prediction first, then run the simulation to check it."
            title={challenge.kind === 'choice' && challenge.predictFirst ? 'Verify your prediction' : 'Scheduler Showdown'}
          />
          {locked && practice && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setPeeked(true)}>
              <Play className="size-4" aria-hidden /> Practice mode: run it without predicting
            </Button>
          )}
        </div>
      )}

      {challenge.kind === 'choice' && challenge.options.some((o) => o.scenario) && (progress.attempts > 0 || result) && <OptionCompare challenge={challenge} />}
    </div>
  )
}

function ScoreCard({
  available,
  practice,
  attempts,
  completed,
  skipped,
  points,
  hasEfficiency,
  confirmed,
  classroom,
}: {
  available: number
  practice: boolean
  attempts: number
  completed: boolean
  skipped: boolean
  points: number
  hasEfficiency: boolean
  confirmed?: number
  classroom: boolean
}) {
  const r = SCORING_RULES
  return (
    <div className="panel min-w-[15rem] px-4 py-3 text-sm">
      {practice ? (
        <p className="text-ink-muted">Practice: no points.</p>
      ) : completed ? (
        <>
          <div className="text-ink-muted">Points earned</div>
          <div className="font-display text-3xl font-bold text-trophy tabular-nums">{points}</div>
          {classroom && (
            <div className="text-xs text-ink-faint">{confirmed !== undefined ? `Server confirmed ${confirmed}` : 'Waiting for the server to confirm'}</div>
          )}
        </>
      ) : skipped ? (
        <p className="text-ink-muted">Answer shown after {REVEAL_AFTER_WRONG} wrong attempts. No points for this mission.</p>
      ) : (
        <>
          <div className="text-ink-muted">Up to</div>
          <div className="font-display text-3xl font-bold text-ink tabular-nums">
            {available} <span className="text-base font-medium text-ink-muted">points</span>
          </div>
          <details className="mt-1 text-xs text-ink-muted">
            <summary className="cursor-pointer text-signal">How scoring works</summary>
            <ul className="mt-1.5 grid gap-0.5">
              <li>+{r.firstTryBonus * 100}% for a correct first attempt</li>
              <li>+{r.noHintBonus * 100}% if you use no hints</li>
              {hasEfficiency && (
                <li>
                  +{r.efficiency.gold * 100}% gold or +{r.efficiency.silver * 100}% silver routine time
                </li>
              )}
              <li>−{r.retryPenalty * 100}% per wrong attempt</li>
              <li>After {REVEAL_AFTER_WRONG} wrong attempts the answer is shown, for no points</li>
              <li>−{r.hintPenalty * 100}% per hint</li>
              <li>Never less than {r.minimumFraction * 100}% of base points once solved</li>
              <li>Time spent thinking never costs points</li>
            </ul>
          </details>
        </>
      )}
      <div className="mt-2 text-xs text-ink-faint">Attempts: {attempts}</div>
    </div>
  )
}

function AutonomousSection({
  challenge,
  routine,
  onChange,
  disabled,
}: {
  challenge: Extract<Challenge, { kind: 'autonomous' }>
  routine: RoutineStep[]
  onChange: (r: RoutineStep[]) => void
  disabled: boolean
}) {
  const routineKey = JSON.stringify(routine)
  const scenario = useMemo(() => buildAutonomousScenario(routine), [routineKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const createWorld = useCallback(() => new AutonomousWorld(), [])
  const stopWhen = useCallback((s: CommandScheduler) => s.cycle >= 1 && !s.isRunning(AUTO_COMMAND_ID), [])
  return (
    <div className="mt-6 grid gap-6">
      <Panel title="Routine builder">
        <div className="p-4">
          <AutonomousBuilder challenge={challenge} routine={routine} onChange={onChange} disabled={disabled} />
        </div>
      </Panel>
      {routine.length > 0 ? (
        <SchedulerPanel
          key={routineKey}
          scenario={scenario}
          createWorld={createWorld}
          stopWhen={stopWhen}
          title="Autonomous simulation"
          defaultSpeed={50}
          renderExtra={(_snap, world) => <FieldView world={world} />}
        />
      ) : (
        <p className="text-sm text-ink-faint">Add at least one step to simulate the routine.</p>
      )}
    </div>
  )
}

function OptionCompare({ challenge }: { challenge: Extract<Challenge, { kind: 'choice' }> }) {
  const runs = useMemo(
    () => challenge.options.filter((o) => o.scenario).map((o) => ({ option: o, result: simulate(o.scenario!) })),
    [challenge],
  )
  return (
    <Panel title="Compare every option" className="mt-6">
      <div className="grid gap-5 p-4 md:grid-cols-2">
        {runs.map(({ option, result }) => (
          <div key={option.id} className={clsx('rounded-lg border p-3', challenge.correct.includes(option.id) ? 'border-go/50' : 'border-steel')}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-medium">{option.label}</span>
              {challenge.correct.includes(option.id) && <Badge tone="go">Best</Badge>}
            </div>
            <p className="mb-2 text-xs text-ink-muted">{option.feedback}</p>
            <Timeline scenario={option.scenario!} cycles={result.cycles} totalCycles={option.scenario!.maxCycles} />
          </div>
        ))}
      </div>
    </Panel>
  )
}
