import { LinkButton } from '../components/ui.tsx'
import { BASE_POINTS, SCORING_RULES as R } from '../scoring/scoring.ts'

export default function HowToPlayPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold">How to play</h1>
      <ol className="mt-6 grid gap-5">
        {[
          ['Pick a team nickname', 'No real names and no accounts. If your teacher gives you a join code, enter it to appear on the classroom leaderboard.'],
          ['Choose a tier', 'Java Rookie, Scheduler Engineer, or Autonomous Architect. Each tier has five missions that unlock one after another.'],
          ['Read the briefing, then experiment', 'Each mission teaches one idea. Predict, edit, reorder, or build, then check your answer.'],
          ['Use the simulator', 'Scheduler missions let you step the WPILib Commands v3 scheduler one cycle at a time and watch mechanisms change hands.'],
          ['Learn from mistakes', 'Wrong answers explain what actually happens. After you solve a mission, the "Why?" panel explains the idea.'],
        ].map(([title, text], i) => (
          <li key={title} className="flex gap-4">
            <span className="font-display text-2xl font-bold tabular-nums text-signal">{i + 1}</span>
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="text-ink-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 text-2xl font-bold">Scoring</h2>
      <table className="mt-3 w-full text-left text-sm">
        <tbody className="divide-y divide-steel">
          <tr>
            <th className="py-2 pr-4 font-medium">Base points</th>
            <td className="py-2 text-ink-muted">
              Easy {BASE_POINTS.easy}, Medium {BASE_POINTS.medium}, Hard {BASE_POINTS.hard}
            </td>
          </tr>
          <tr>
            <th className="py-2 pr-4 font-medium">First-try bonus</th>
            <td className="py-2 text-ink-muted">+{R.firstTryBonus * 100}% for a correct first attempt (a correct prediction)</td>
          </tr>
          <tr>
            <th className="py-2 pr-4 font-medium">No-hint bonus</th>
            <td className="py-2 text-ink-muted">+{R.noHintBonus * 100}%</td>
          </tr>
          <tr>
            <th className="py-2 pr-4 font-medium">Autonomous efficiency</th>
            <td className="py-2 text-ink-muted">
              +{R.efficiency.gold * 100}% gold time, +{R.efficiency.silver * 100}% silver time. Only routines that complete every objective count.
            </td>
          </tr>
          <tr>
            <th className="py-2 pr-4 font-medium">Retries</th>
            <td className="py-2 text-ink-muted">
              −{R.retryPenalty * 100}% per wrong attempt, at most −{R.maxRetryPenalty * 100}%. Repeating the exact same wrong answer is not counted.
            </td>
          </tr>
          <tr>
            <th className="py-2 pr-4 font-medium">Hints</th>
            <td className="py-2 text-ink-muted">−{R.hintPenalty * 100}% per hint</td>
          </tr>
          <tr>
            <th className="py-2 pr-4 font-medium">Minimum</th>
            <td className="py-2 text-ink-muted">A solved mission is always worth at least {R.minimumFraction * 100}% of its base points.</td>
          </tr>
          <tr>
            <th className="py-2 pr-4 font-medium">Time</th>
            <td className="py-2 text-ink-muted">Thinking time never costs points. Ties are broken by who reached their score first.</td>
          </tr>
          <tr>
            <th className="py-2 pr-4 font-medium">Replays</th>
            <td className="py-2 text-ink-muted">Each mission scores once. Practice mode is unlimited and never changes competition scores.</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-10 text-2xl font-bold">Keyboard</h2>
      <p className="mt-2 text-ink-muted">
        Everything works with the keyboard. Tab moves between controls. In the simulator, Space plays or pauses and the right arrow steps one cycle. Reorder
        puzzles have up and down buttons as well as drag and drop.
      </p>

      <h2 className="mt-10 text-2xl font-bold">What this game is (and is not)</h2>
      <p className="mt-2 text-ink-muted">
        Command Quest teaches WPILib Commands v3 for the 2027 FRC season. It does not run a Java compiler: code missions are graded by deterministic rules,
        and the scheduler is an educational TypeScript model of the documented behavior. Classroom scores are graded again on the server, so a browser
        cannot simply claim points.
      </p>
      <LinkButton to="/start" variant="primary" size="lg" className="mt-8">
        Start playing
      </LinkButton>
    </div>
  )
}
