/**
 * Deterministic graders for every challenge kind. Pure functions: used by the
 * browser for instant feedback AND by the Supabase Edge Function, which re-grades
 * every competition submission server-side. Answers are treated as untrusted input.
 */
import { evaluateRoutine, MAX_ROUTINE_STEPS, validateRoutineShape, type RoutineStep } from '../simulation/autonomous.ts'
import { controlMixUpTip, isControlId, type ControlId } from './controller.ts'
import type {
  Answer,
  AutonomousChallenge,
  Challenge,
  ChoiceChallenge,
  CodeEditChallenge,
  ControllerMapChallenge,
  EfficiencyTier,
  GradeResult,
  PredictOutputChallenge,
  ReorderChallenge,
  TimelineCell,
  TimelineChallenge,
} from './types.ts'

const MAX_TEXT = 2000

export function normalizeOutput(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0)
}

export function stripWhitespace(code: string): string {
  return code.replace(/\s+/g, '')
}

const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i])

function invalid(message = 'That answer could not be read. Try again.'): GradeResult {
  return { correct: false, invalid: true, feedback: message }
}

function gradePredictOutput(c: PredictOutputChallenge, text: unknown): GradeResult {
  if (typeof text !== 'string' || text.length > MAX_TEXT) return invalid()
  const lines = normalizeOutput(text)
  if (lines.length === 0) return invalid('Type the output first.')
  const expected = c.expectedOutput.map((l) => l.trim().replace(/\s+/g, ' '))
  if (sameLines(lines, expected)) return { correct: true, feedback: c.successMessage }
  for (const m of c.mistakes ?? []) {
    if (sameLines(lines, m.output)) return { correct: false, feedback: m.feedback }
  }
  return { correct: false, feedback: describeOutputDiff(lines, expected) }
}

/** Letters and digits only: used to spot answers that are right except for punctuation, case or spacing. */
const looseKey = (line: string) => line.toLowerCase().replace(/[^a-z0-9]/g, '')

const listLines = (nums: number[]) =>
  nums.length === 1 ? `Line ${nums[0]}` : `Lines ${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`

/** Line-by-line feedback that says where the answer differs without revealing the expected text. */
function describeOutputDiff(lines: string[], expected: string[]): string {
  const right: number[] = []
  const close: number[] = []
  const wrong: number[] = []
  expected.forEach((exp, i) => {
    const got = lines[i]
    if (got === undefined) return
    if (got === exp) right.push(i + 1)
    else if (looseKey(got) === looseKey(exp)) close.push(i + 1)
    else wrong.push(i + 1)
  })
  const parts: string[] = []
  if (right.length) parts.push(`${listLines(right)} ${right.length === 1 ? 'is' : 'are'} correct.`)
  if (close.length) {
    parts.push(
      `${listLines(close)} ${close.length === 1 ? 'has' : 'have'} the right values, but output must match exactly: check punctuation, capital letters and spacing against the text in the code.`,
    )
  }
  if (wrong.length) parts.push(`${listLines(wrong)} ${wrong.length === 1 ? 'prints' : 'print'} something different. Trace ${wrong.length === 1 ? 'that statement' : 'those statements'} step by step.`)
  if (lines.length < expected.length) parts.push(`The code prints ${expected.length} lines; you wrote ${lines.length}.`)
  if (lines.length > expected.length) parts.push(`The code prints only ${expected.length} line${expected.length === 1 ? '' : 's'}; you wrote ${lines.length}.`)
  return parts.join(' ')
}

function gradeChoice(c: ChoiceChallenge, selected: unknown): GradeResult {
  if (!Array.isArray(selected) || selected.length > c.options.length) return invalid()
  if (!selected.every((s) => typeof s === 'string' && c.options.some((o) => o.id === s))) return invalid()
  const picked = [...new Set(selected as string[])].sort()
  if (picked.length === 0) return invalid('Choose an answer first.')
  if (!c.multiple && picked.length !== 1) return invalid('Choose exactly one answer.')
  const correct = [...c.correct].sort()
  const isCorrect = picked.length === correct.length && picked.every((p, i) => p === correct[i])
  if (isCorrect) return { correct: true, feedback: c.options.find((o) => o.id === picked[0])?.feedback ?? c.successMessage }
  if (!c.multiple) return { correct: false, feedback: c.options.find((o) => o.id === picked[0])?.feedback ?? 'Not quite.' }
  const extra = picked.filter((p) => !correct.includes(p))
  const missing = correct.filter((p) => !picked.includes(p))
  const firstExtra = extra.length ? c.options.find((o) => o.id === extra[0]) : undefined
  if (firstExtra) return { correct: false, feedback: `${firstExtra.label}: ${firstExtra.feedback}` }
  return { correct: false, feedback: `You are missing ${missing.length} ${c.answerNoun ?? 'correct answer(s)'}.` }
}

function gradeCodeEdit(c: CodeEditChallenge, code: unknown): GradeResult {
  if (typeof code !== 'string' || code.length > MAX_TEXT) return invalid()
  const compact = stripWhitespace(code)
  if (!compact) return invalid('The editable line is empty.')
  if (c.accepted.some((p) => new RegExp(p).test(compact))) return { correct: true, feedback: c.successMessage }
  for (const m of c.mistakes ?? []) {
    if (new RegExp(m.pattern).test(compact)) return { correct: false, feedback: m.feedback }
  }
  return { correct: false, feedback: 'That edit does not fix the problem yet. Read the goal again and trace the code.' }
}

function gradeReorder(c: ReorderChallenge, order: unknown): GradeResult {
  if (!Array.isArray(order) || order.length !== c.items.length) return invalid()
  const ids = c.items.map((i) => i.id)
  if (!order.every((o) => typeof o === 'string' && ids.includes(o)) || new Set(order).size !== ids.length) return invalid()
  if (c.gradeByRoutine) {
    const routine = (order as string[]).map((id) => c.items.find((i) => i.id === id)?.step).filter(Boolean) as RoutineStep[]
    const evaluation = evaluateRoutine(routine)
    if (evaluation.success) return { correct: true, feedback: c.successMessage, seconds: evaluation.seconds }
    return { correct: false, feedback: evaluation.issues[0]?.message ?? evaluation.messages[0] ?? 'The routine did not complete its objectives.' }
  }
  const ok = c.correctOrders.some((accepted) => accepted.every((id, i) => id === order[i]))
  if (ok) return { correct: true, feedback: c.successMessage }
  const firstAccepted = c.correctOrders[0]
  let firstWrong = 0
  while (firstWrong < order.length && firstAccepted[firstWrong] === order[firstWrong]) firstWrong++
  return {
    correct: false,
    feedback:
      firstWrong > 0
        ? `The first ${firstWrong} line(s) are in a working order. Think about what has to happen next.`
        : 'Not quite. Think about what the robot must do first.',
  }
}

const TIMELINE_CHOICES: TimelineCell[] = ['running', 'waiting', 'completed', 'idle']

function gradeTimeline(c: TimelineChallenge, cells: unknown): GradeResult {
  if (typeof cells !== 'object' || cells === null || Array.isArray(cells)) return invalid()
  const wrong: string[] = []
  let blank = 0
  for (const row of c.rows) {
    const given = (cells as Record<string, unknown>)[row]
    if (!Array.isArray(given) || given.length !== c.cycles.length) return invalid('Fill in every cell first.')
    c.expected[row].forEach((exp, i) => {
      const g = given[i]
      if (g === null || g === '' || g === undefined) blank++
      else if (typeof g !== 'string' || !TIMELINE_CHOICES.includes(g as TimelineCell)) wrong.push(`${row}:${i}`)
      else if (g !== exp) wrong.push(`${row}:${i}`)
    })
  }
  if (blank > 0) return invalid('Fill in every cell first.')
  if (wrong.length === 0) return { correct: true, feedback: c.successMessage, wrongCells: [] }
  return {
    correct: false,
    feedback: `${wrong.length} cell(s) are wrong (highlighted). Step through the simulation in your head one cycle at a time.`,
    wrongCells: wrong,
  }
}

function gradeControllerMap(c: ControllerMapChallenge, picks: unknown): GradeResult {
  if (typeof picks !== 'object' || picks === null || Array.isArray(picks)) return invalid()
  const given = picks as Record<string, unknown>
  if (Object.keys(given).some((k) => !c.rows.some((r) => r.id === k))) return invalid()
  if (c.rows.some((r) => given[r.id] === null || given[r.id] === undefined || given[r.id] === '')) {
    return invalid('Pick a control for every line first.')
  }
  if (!c.rows.every((r) => isControlId(given[r.id]))) return invalid()
  const wrong = c.rows.filter((r) => given[r.id] !== c.expected[r.id])
  if (wrong.length === 0) return { correct: true, feedback: c.successMessage, wrongCells: [] }
  const tip = wrong.map((r) => controlMixUpTip(given[r.id] as ControlId, c.expected[r.id])).find(Boolean)
  return {
    correct: false,
    feedback: `${wrong.length} of ${c.rows.length} lines point at the wrong control (highlighted).${tip ? ` Tip: ${tip}` : ' Read the method name in each line: it names the control.'}`,
    wrongCells: wrong.map((r) => r.id),
  }
}

export function efficiencyTier(c: AutonomousChallenge, seconds: number): EfficiencyTier {
  if (seconds <= c.goldSeconds + 1e-9) return 'gold'
  if (seconds <= c.silverSeconds + 1e-9) return 'silver'
  return 'bronze'
}

function gradeAutonomous(c: AutonomousChallenge, routine: unknown): GradeResult {
  if (!validateRoutineShape(routine)) {
    return invalid(`Build a routine with 1 to ${MAX_ROUTINE_STEPS} steps.`)
  }
  if (!routine.every((s) => c.palette.includes(s.command))) return invalid()
  const evaluation = evaluateRoutine(routine, { requireArmDown: c.requireArmDown })
  if (!evaluation.success) {
    const reason = evaluation.issues[0]?.message ?? evaluation.messages[0] ?? 'The routine did not complete its objectives.'
    return { correct: false, feedback: reason, seconds: evaluation.seconds }
  }
  const seconds = evaluation.seconds ?? 0
  const tier = efficiencyTier(c, seconds)
  const tierText = tier === 'gold' ? 'Gold efficiency!' : tier === 'silver' ? 'Silver efficiency.' : 'Valid, but there is time to save.'
  return { correct: true, feedback: `${c.successMessage} ${seconds.toFixed(2)} s. ${tierText}`, seconds, efficiency: tier }
}

export function gradeAnswer(challenge: Challenge, answer: Answer | unknown): GradeResult {
  if (typeof answer !== 'object' || answer === null) return invalid()
  const a = answer as Record<string, unknown>
  if (a.kind !== challenge.kind) return invalid()
  switch (challenge.kind) {
    case 'predict-output':
      return gradePredictOutput(challenge, a.text)
    case 'choice':
      return gradeChoice(challenge, a.selected)
    case 'code-edit':
      return gradeCodeEdit(challenge, a.code)
    case 'reorder':
      return gradeReorder(challenge, a.order)
    case 'timeline':
      return gradeTimeline(challenge, a.cells)
    case 'autonomous':
      return gradeAutonomous(challenge, a.routine)
    case 'controller-map':
      return gradeControllerMap(challenge, a.picks)
  }
}

/** The canonical correct answer (used for "show solution" after completion and in tests). */
export function referenceAnswer(challenge: Challenge): Answer {
  switch (challenge.kind) {
    case 'predict-output':
      return { kind: 'predict-output', text: challenge.expectedOutput.join('\n') }
    case 'choice':
      return { kind: 'choice', selected: challenge.correct }
    case 'code-edit':
      return { kind: 'code-edit', code: challenge.solution }
    case 'reorder':
      return { kind: 'reorder', order: challenge.correctOrders[0] }
    case 'timeline':
      return { kind: 'timeline', cells: challenge.expected }
    case 'controller-map':
      return { kind: 'controller-map', picks: { ...challenge.expected } }
    case 'autonomous':
      return {
        kind: 'autonomous',
        routine: [
          { op: 'fork', command: 'intake' },
          { op: 'await', command: 'toPiece' },
          { op: 'await', command: 'intake' },
          { op: 'fork', command: 'raise' },
          { op: 'await', command: 'toScore' },
          { op: 'await', command: 'score' },
          ...(challenge.requireArmDown ? [{ op: 'await' as const, command: 'lower' as const }] : []),
        ],
      }
  }
}
