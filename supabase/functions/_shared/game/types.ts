/**
 * Challenge definition types. Challenge data and grading are pure TypeScript with
 * no browser or React dependencies, so the same files are bundled into the
 * Supabase Edge Function for server-side grading.
 */
import type { PaletteId, RoutineStep } from '../simulation/autonomous.ts'
import type { ControlId } from './controller.ts'
import type { CommandCycleStatus, CommandId, Scenario, SimulationResult } from '../simulation/types.ts'

export type Difficulty = 'easy' | 'medium' | 'hard'
export type GameMode = 'java-lab' | 'scheduler' | 'autonomous' | 'controls'

export type Concept =
  | 'java-basics'
  | 'operators'
  | 'strings'
  | 'loops'
  | 'conditionals'
  | 'commands'
  | 'execution-order'
  | 'coroutines'
  | 'yield'
  | 'mechanisms'
  | 'requirements'
  | 'conflicts'
  | 'priority'
  | 'fork'
  | 'await'
  | 'scheduler-cycles'
  | 'parent-child'
  | 'interruption'
  | 'cancellation'
  | 'debugging'
  | 'optimization'
  | 'controllers'
  | 'bindings'
  | 'default-commands'

export const CONCEPT_LABELS: Record<Concept, string> = {
  'java-basics': 'Java basics',
  operators: 'Operators',
  strings: 'Strings',
  loops: 'Loops',
  conditionals: 'Conditionals',
  commands: 'Commands',
  'execution-order': 'Execution order',
  coroutines: 'Coroutines',
  yield: 'Yield',
  mechanisms: 'Mechanisms',
  requirements: 'Requirements',
  conflicts: 'Conflicts',
  priority: 'Priority',
  fork: 'Fork',
  await: 'Await',
  'scheduler-cycles': 'Scheduler cycles',
  'parent-child': 'Parent & child',
  interruption: 'Interruption',
  cancellation: 'Cancellation',
  debugging: 'Debugging',
  optimization: 'Optimization',
  controllers: 'Controllers',
  bindings: 'Trigger bindings',
  'default-commands': 'Default commands',
}

interface ChallengeBase {
  id: string
  title: string
  difficulty: Difficulty
  mode: GameMode
  concepts: Concept[]
  /** Learning objective, one sentence. */
  objective: string
  /** Short explanation shown before the problem (1-3 short paragraphs). */
  briefing: string[]
  /** The problem statement / prompt. */
  prompt: string
  /** Java source shown in the code panel (if any). */
  code?: string
  /** Notes about which names in the code are illustrative team code vs WPILib API. */
  codeNote?: string
  hints: string[]
  /** Concise "Why?" explanation shown after any answer. */
  why: string
  successMessage: string
  /** Base points override (defaults to the difficulty's base points). */
  basePoints?: number
}

export interface PredictOutputChallenge extends ChallengeBase {
  kind: 'predict-output'
  expectedOutput: string[]
  /** Common wrong answers with targeted feedback. */
  mistakes?: Array<{ output: string[]; feedback: string }>
  /** Optional simulation students can step through after answering. */
  scenario?: Scenario
}

export interface ChoiceOption {
  id: string
  label: string
  /** Optional code shown in the option. */
  code?: string
  /** Explanation shown when this option is chosen (or reviewed). */
  feedback: string
  /** Optional scenario to compare this option visually after answering. */
  scenario?: Scenario
}

export interface ChoiceChallenge extends ChallengeBase {
  kind: 'choice'
  options: ChoiceOption[]
  /** One id, or several ids when `multiple` is true (exact set must match). */
  correct: string[]
  multiple?: boolean
  /** Multi-select only: finishes "You are missing 2 ..." feedback. Defaults to "correct answer(s)". */
  answerNoun?: string
  /** Scenario shown in the scheduler panel. */
  scenario?: Scenario
  /** Lock the simulator until a prediction has been submitted. */
  predictFirst?: boolean
  /** Derives the correct answer from a simulation (used by tests to verify `correct`). */
  verify?: (result: SimulationResult) => string[]
}

export interface CodeEditChallenge extends ChallengeBase {
  kind: 'code-edit'
  /** Read-only code before the editable region. */
  prefix: string
  /** Initial content of the editable region. */
  initial: string
  /** Read-only code after the editable region. */
  suffix: string
  /** Regexes matched against the edited region with all whitespace removed. */
  accepted: string[]
  /** Regexes (whitespace removed) for common mistakes with targeted feedback. */
  mistakes?: Array<{ pattern: string; feedback: string }>
  /** Reference solution shown after completion. */
  solution: string
  scenario?: Scenario
}

export interface ReorderItem {
  id: string
  code: string
  /** When grading by routine, the step this line represents. */
  step?: RoutineStep
}

export interface ReorderChallenge extends ChallengeBase {
  kind: 'reorder'
  /** Code shown above the reorderable lines (read-only). */
  before: string
  after: string
  items: ReorderItem[]
  initialOrder: string[]
  /** Accepted orders. Ignored when gradeByRoutine is true. */
  correctOrders: string[][]
  /** Grade by running the order through the autonomous simulator instead of fixed answers. */
  gradeByRoutine?: boolean
  /** Indentation (spaces) of the reorderable lines in the assembled code. */
  indent?: number
}

export type TimelineCell = Extract<CommandCycleStatus, 'running' | 'waiting' | 'completed' | 'idle'>

export interface TimelineChallenge extends ChallengeBase {
  kind: 'timeline'
  scenario: Scenario
  rows: CommandId[]
  cycles: number[]
  choices: TimelineCell[]
  /** Hand-written answer key; tests verify it against the simulator. */
  expected: Record<CommandId, TimelineCell[]>
}

export interface AutonomousChallenge extends ChallengeBase {
  kind: 'autonomous'
  starter: RoutineStep[]
  palette: PaletteId[]
  /** Seconds for the gold efficiency bonus. */
  goldSeconds: number
  /** Seconds for the silver efficiency bonus. */
  silverSeconds: number
  /** Extra objective: arm must end fully down. */
  requireArmDown?: boolean
}

export interface ControllerMapChallenge extends ChallengeBase {
  kind: 'controller-map'
  /** Lines of robot code; each one reads exactly one control. */
  rows: { id: string; code: string; purpose: string }[]
  expected: Record<string, ControlId>
}

export type Challenge =
  | ControllerMapChallenge
  | PredictOutputChallenge
  | ChoiceChallenge
  | CodeEditChallenge
  | ReorderChallenge
  | TimelineChallenge
  | AutonomousChallenge

export type ChallengeKind = Challenge['kind']

export type Answer =
  | { kind: 'predict-output'; text: string }
  | { kind: 'choice'; selected: string[] }
  | { kind: 'code-edit'; code: string }
  | { kind: 'reorder'; order: string[] }
  | { kind: 'timeline'; cells: Record<CommandId, TimelineCell[]> }
  | { kind: 'autonomous'; routine: RoutineStep[] }
  | { kind: 'controller-map'; picks: Record<string, ControlId | null> }

export type EfficiencyTier = 'gold' | 'silver' | 'bronze'

export interface GradeResult {
  correct: boolean
  /** Short message specific to this answer. */
  feedback: string
  /** Autonomous / routine details. */
  seconds?: number | null
  efficiency?: EfficiencyTier
  /** Timeline cells ("row:index") or controller-map rows ("row") that were wrong. */
  wrongCells?: string[]
  /** Answer failed validation (malformed). */
  invalid?: boolean
}
