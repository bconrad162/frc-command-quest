import { clsx } from 'clsx'
import { CheckCircle2, Eye, Lightbulb, XCircle } from 'lucide-react'
import type { Challenge, GradeResult } from '../../game/types.ts'
import { SCORING_RULES, type ScoreBreakdown } from '../../scoring/scoring.ts'
import { Button, RichText } from '../ui.tsx'
import { AnswerKey } from './AnswerKey.tsx'

export function FeedbackPanel({
  grade,
  challenge,
  breakdown,
  awarded,
  showWhy,
  practice,
  alreadyCompleted,
}: {
  grade: GradeResult
  challenge: Challenge
  breakdown?: ScoreBreakdown
  awarded?: number
  showWhy: boolean
  practice: boolean
  alreadyCompleted: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="feedback"
      className={clsx(
        'anim-rise rounded-lg border p-4',
        grade.invalid ? 'border-steel-bright bg-pit-raised' : grade.correct ? 'border-go/50 bg-go/5' : 'border-warn/50 bg-warn/5',
      )}
    >
      <div className="flex items-start gap-2.5">
        {grade.invalid ? null : grade.correct ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-go" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{grade.invalid ? 'Almost ready' : grade.correct ? 'Correct!' : 'Not yet'}</p>
          <p className="mt-0.5 text-ink-muted">
            <RichText text={grade.feedback} />
          </p>
          {grade.correct && !practice && awarded !== undefined && (
            <div className="mt-3">
              {alreadyCompleted ? (
                <p className="text-sm text-ink-muted">You already completed this mission, so replays do not change your score.</p>
              ) : (
                breakdown && (
                  <dl className="grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 text-sm" aria-label="Points earned">
                    {breakdown.lines.map((l) => (
                      <div key={l.label} className="contents">
                        <dt className="text-ink-muted">{l.label}</dt>
                        <dd className={clsx('text-right tabular-nums', l.points < 0 ? 'text-warn' : 'text-ink')}>
                          {l.points > 0 ? '+' : ''}
                          {l.points}
                        </dd>
                      </div>
                    ))}
                    <dt className="border-t border-steel pt-1 font-semibold">Points earned</dt>
                    <dd className="border-t border-steel pt-1 text-right font-display text-lg font-bold text-trophy tabular-nums" data-testid="points-earned">
                      {awarded}
                    </dd>
                  </dl>
                )
              )}
            </div>
          )}
        </div>
      </div>
      {showWhy && (
        <div className="mt-4 border-t border-steel pt-3">
          <h3 className="mb-1 font-sans text-sm font-semibold text-signal">Why?</h3>
          <p className="text-[15px] text-ink-muted">
            <RichText text={challenge.why} />
          </p>
        </div>
      )}
    </div>
  )
}

export function HintList({ hints, revealed }: { hints: string[]; revealed: number }) {
  if (revealed === 0) return null
  return (
    <ol className="grid gap-1.5" aria-label="Hints">
      {hints.slice(0, revealed).map((h, i) => (
        <li key={i} className="flex gap-2 rounded-lg border border-trophy/30 bg-trophy/5 p-2.5 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-trophy" aria-hidden />
          <span>
            <span className="sr-only">Hint {i + 1}: </span>
            <RichText text={h} />
          </span>
        </li>
      ))}
    </ol>
  )
}

export function HintButton({
  total,
  revealed,
  onReveal,
  practice,
  disabled,
}: {
  total: number
  revealed: number
  onReveal: () => void
  practice: boolean
  disabled?: boolean
}) {
  if (revealed >= total) return null
  return (
    <Button size="sm" variant="ghost" onClick={onReveal} disabled={disabled} data-testid="hint-button">
      <Lightbulb className="size-4 text-trophy" aria-hidden />
      {revealed === 0 ? 'Show a hint' : 'Show another hint'}
      {!practice && <span className="text-ink-faint">(−{Math.round(SCORING_RULES.hintPenalty * 100)}%)</span>}
    </Button>
  )
}

const REVEAL_NOTE: Partial<Record<Challenge['kind'], string>> = {
  autonomous: 'It is also loaded in the builder below, so you can run it and watch the robot.',
}

/** Shown after the last allowed wrong attempt: the answer, laid out like the question, then why it is right. */
export function AnswerRevealPanel({ challenge, practice, wrongCells }: { challenge: Challenge; practice: boolean; wrongCells?: string[] }) {
  return (
    <div role="status" aria-live="polite" data-testid="answer-revealed" className="anim-rise rounded-lg border border-signal/50 bg-signal/5 p-4">
      <div className="flex items-start gap-2.5">
        <Eye className="mt-0.5 size-5 shrink-0 text-signal" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Here is the answer</p>
          <p className="mt-0.5 text-ink-muted">
            {practice ? 'Compare it with yours, then try again or move on.' : 'Compare it with yours, then move on. This mission earns no points.'}{' '}
            {REVEAL_NOTE[challenge.kind] ?? ''}
          </p>
          <div className="mt-2">
            <AnswerKey challenge={challenge} wrongCells={wrongCells} />
          </div>
        </div>
      </div>
      <div className="mt-4 border-t border-steel pt-3">
        <h3 className="mb-1 font-sans text-sm font-semibold text-signal">Why?</h3>
        <p className="text-[15px] text-ink-muted">
          <RichText text={challenge.why} />
        </p>
      </div>
    </div>
  )
}
