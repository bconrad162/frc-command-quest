# Command Quest

**Master Java. Control the Scheduler. Win the Competition.**

Command Quest is a browser game for training FIRST Robotics Competition programmers. Students compete in teams through 20 missions that teach Java basics and the **WPILib Commands v3** framework introduced for the 2027 FRC season: commands and mechanisms, coroutines and `yield()`, `fork()` vs `await()`, priorities, conflicts, interruption, cancellation, parent/child commands, and driving with Xbox controllers.

It runs entirely in the browser (GitHub Pages). Students need no installs, no accounts, and no email. A teacher can optionally connect a free Supabase project for shared classroom leaderboards, a projector view, and server-side grading.

- **Java Debugging Lab**: predict output, fix loops and conditions in a constrained code editor, reorder statements.
- **Scheduler Showdown**: predict what the Commands v3 scheduler does, then step a visual simulator cycle by cycle (mechanism ownership, priorities, pending/running commands, timeline, event log).
- **Autonomous Architect**: build an autonomous routine from `fork`/`await` steps and race the clock for the fastest *legal* run.
- **Driver Controls**: map code to the buttons and sticks of an Xbox controller, predict stick values, and choose the right trigger binding (`onTrue`, `whileTrue`, `toggleOnTrue`, ...). These missions use the 2027 `CommandXboxController`, and the Reference page has a controller cheat sheet that lists the 2026 names too.

Live site (after you deploy): `https://USERNAME.github.io/frc-command-quest/`

---

## Contents

1. [How students use it](#how-students-use-it)
2. [How teachers run a competition](#how-teachers-run-a-competition)
3. [Make it available to students (checklist)](#make-it-available-to-students-checklist)
4. [Local development](#local-development)
5. [Deploying to GitHub Pages](#deploying-to-github-pages)
6. [Configuring Supabase](#configuring-supabase)
7. [Environment variables](#environment-variables)
8. [Testing](#testing)
9. [Adding challenges](#adding-challenges)
10. [Changing scoring rules](#changing-scoring-rules)
11. [Creating and resetting competitions](#creating-and-resetting-competitions)
12. [Accuracy: Commands v3 and the simulator](#accuracy-commands-v3-and-the-simulator)
13. [Security and fair play](#security-and-fair-play)
14. [Limitations](#limitations)
15. [Project structure](#project-structure)

---

## How students use it

1. Open the site on a laptop (Chrome or Safari).
2. **Start Competition** → enter a team nickname (no real names) and, if the teacher gave one, the 6-character **join code**.
3. Pick a tier: **Java Rookie** (Easy), **Scheduler Engineer** (Medium), or **Autonomous Architect** (Hard). Missions inside a tier unlock in order.
4. Read the short briefing, answer, and learn from the feedback. Scheduler missions ask for a prediction first, then unlock the simulator to check it.
5. Watch the leaderboard. **Practice mode** replays any mission freely without changing competition scores.

The first mission takes about a minute. Progress is saved in the browser, so a refresh never loses work. If the Wi-Fi drops in classroom mode, answers are queued on the device and sent when the connection returns (each one exactly once).

## How teachers run a competition

With Supabase configured (see below):

1. Open **Teacher dashboard** (footer link, or `#/teacher`) and sign in with your teacher account.
2. **New competition**: name, duration (minutes), and which tiers are enabled. You get a join code like `K7PQ2M`.
3. Students join with the code (they can join while the competition is in the lobby; answers only count once it starts).
4. Press **Start competition**. The timer is server-side: answers after the end time are rejected.
5. Press **Present leaderboard** to open the projector view in a new tab: big live rankings, timer, join code, team count, missions completed, full-screen button, **Hide rankings** (for a suspenseful reveal), and a **Victory screen** for the winners.
6. Watch **Where students struggle** and **Mission statistics** to see which concepts need a re-teach.
7. **Close competition** when done, then **Export CSV** for your records. **Reset scores** clears a classroom for reuse.

Without Supabase, the game runs in **local demonstration mode**: everything is playable, scores stay on each device, and the leaderboard is clearly labeled "This device". The projector view still works for the device it runs on (`#/present/local`). No fake scores are ever shown as classroom results.

## Make it available to students (checklist)

Local demo mode only (10 minutes):

1. Push this repository to GitHub as `frc-command-quest`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main` (or run the workflow manually). The site appears at `https://USERNAME.github.io/frc-command-quest/`.

Shared classroom leaderboard (another 20–30 minutes, once):

4. Create a Supabase project and apply the database migrations ([Configuring Supabase](#configuring-supabase)).
5. Enable anonymous sign-ins and raise the anonymous rate limit.
6. Deploy the `submit-answer` Edge Function.
7. Create your teacher login and add it to the `teachers` table.
8. In GitHub: **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then re-run the deploy workflow.
9. Before class: sign in to the teacher dashboard, create the competition, and project the join code.

## Local development

Requirements: Node.js 22+ (CI uses 24).

```bash
npm install
npm run dev          # http://localhost:5173/frc-command-quest/
```

Without environment variables the app runs in local demonstration mode. To connect a backend, create `.env.local` (see [Environment variables](#environment-variables)).

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | oxlint |
| `npm run typecheck` | TypeScript project check |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright end-to-end tests (Chromium + WebKit) |
| `npm run test:backend` | Integration tests against a local Supabase stack |
| `npm run supabase:sync` | Copy shared grading code into the Edge Function and regenerate the challenge catalog migration |
| `npm run check` | lint + typecheck + unit tests + build |

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs on every push to `main`:

1. **test**: lint, typecheck, unit tests, Playwright E2E (Chromium and WebKit).
2. **build**: `npm run build` with `VITE_BASE_PATH=/<repo-name>/` and the optional Supabase variables.
3. **deploy**: publishes `dist/` with `actions/deploy-pages`.

One-time setup: **Settings → Pages → Source: GitHub Actions**.

Routing uses hash URLs (`/frc-command-quest/#/missions`), so deep links and refreshes work on GitHub Pages without a 404 redirect trick. Vite's `base` is `/frc-command-quest/` (overridable with `VITE_BASE_PATH`, e.g. `/` for a custom domain). If you rename the repository, the workflow adapts automatically.

After you connect Supabase, add your Pages URL to **Supabase → Authentication → URL Configuration → Site URL** (`https://USERNAME.github.io/frc-command-quest/`).

## Configuring Supabase

Supabase is optional and only needed for shared classroom competitions.

### 1. Create the project and apply migrations

Create a project at <https://supabase.com>. Then, using the Supabase CLI (`npx supabase`):

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push            # applies supabase/migrations/*.sql
```

Or paste each file in `supabase/migrations/` (in filename order) into **SQL Editor → New query → Run**.

The migrations create:

| Table | Purpose |
| --- | --- |
| `teachers` | Allowlist of teacher accounts |
| `classrooms` | Competitions: join code, status, duration, enabled tiers, server start/end times, hidden rankings |
| `participants` | Teams (nickname only) and their score totals |
| `challenge_catalog` | Challenge ids, titles, difficulty, concepts (no answer keys) |
| `attempts` | Every graded submission, with idempotency key and server timestamp |
| `completions` | First correct solve per team and mission (the only source of points) |
| `hint_usage` | Hints revealed, recorded server-side for penalties |

Plus SECURITY DEFINER functions (`join_classroom`, `record_hint`, `classroom_leaderboard`, `global_leaderboard`, `create_classroom`, `update_classroom`, `start_classroom`, `close_classroom`, `reset_classroom_scores`, `remove_participant`, `delete_classroom`, `classroom_challenge_stats`), Row Level Security policies, and Realtime publication for live updates.

### 2. Authentication settings

In **Authentication → Sign In / Providers**:

- Turn on **Allow anonymous sign-ins** (students play anonymously; no email).
- Keep **Email** enabled for teacher logins. You may turn off **Allow new users to sign up** for email; teachers are created by an admin.

In **Authentication → Rate Limits**, raise **anonymous sign-ins per hour** (the default is 30 per IP). A whole classroom usually shares one school IP address; 300+ is reasonable.

### 3. Deploy the grading Edge Function

```bash
npm run supabase:sync                      # only needed after changing challenges/scoring
npx supabase functions deploy submit-answer
```

The function uses the project's built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets (set automatically by Supabase). Optionally restrict CORS to your site:

```bash
npx supabase secrets set ALLOWED_ORIGIN=https://USERNAME.github.io
```

### 4. Create a teacher account

**Authentication → Users → Add user** (email + password, auto-confirm). Then in the SQL editor:

```sql
insert into public.teachers (user_id)
select id from auth.users where email = 'you@example.com';
```

### 5. Point the site at the project

Copy **Project Settings → API → Project URL** and the **anon / publishable key** into the GitHub Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and re-run the deploy workflow.

### Running Supabase locally

```bash
npx supabase start                  # needs Docker; config in supabase/config.toml
npx supabase functions serve        # in a second terminal
npx supabase status -o env          # shows API_URL and ANON_KEY for .env.local
npm run test:backend                # integration tests (creates a temporary teacher + classroom)
```

## Environment variables

Create `.env.local` (git-ignored) for local development. A template (this is also the content of `.env.example`):

```bash
# Leave both empty to run in local demonstration mode.
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
# Optional: override the base path (default /frc-command-quest/), e.g. "/" for a custom domain.
# VITE_BASE_PATH=/frc-command-quest/
```

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | build (GitHub Actions variable) | Public |
| `VITE_SUPABASE_ANON_KEY` | build (GitHub Actions variable) | Public by design; RLS protects data |
| `VITE_BASE_PATH` | build | Defaults to `/frc-command-quest/` |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function only (set by Supabase) | **Never** put this in a `VITE_` variable or commit it |
| `ALLOWED_ORIGIN` | Edge Function secret (optional) | CORS origin for `submit-answer` |

## Testing

```bash
npm test               # unit tests (Vitest)
npm run test:e2e       # Playwright E2E against the production build under /frc-command-quest/
npm run test:backend   # optional, needs a local Supabase stack
```

Unit tests cover the scheduler simulator (scheduling, conflicts, priorities, yield/resume, fork/await, parent/child cancellation, sibling vs external interruption, default commands, reset), the autonomous world model, every challenge definition (each answer key is checked against the simulator), grading, scoring, hint and retry penalties, duplicate submissions, score aggregation and ranking, progression/unlocking, local persistence, the offline outbox (ordering, idempotent retries, permanent rejections), CSV export, Java code generation, GitHub Pages base path/routing, and that the Edge Function's copy of the grading code is up to date.

E2E tests cover joining, completing an Easy mission, unlocking the next mission, a scheduler prediction verified in the simulator, the constrained editor, the autonomous builder, keyboard reordering, the leaderboard, refresh persistence, and replay protection.

## Adding challenges

Challenges are typed data in `src/game/challenges/{easy,medium,hard,controls}.ts` (types in `src/game/types.ts`). Each has an id, title, difficulty, mode, concepts, objective, briefing, prompt, hints, a "Why?" explanation, and grading data for its `kind`:

| `kind` | Interaction | Grading |
| --- | --- | --- |
| `predict-output` | Type the console output | Line-by-line, whitespace-normalized; `mistakes` give targeted feedback |
| `choice` | Single or multi-select (optional code per option, optional scenario, `predictFirst`) | Exact set; per-option feedback; `verify(sim)` lets tests check the key against the simulator |
| `code-edit` | Edit one highlighted region in CodeMirror | Regexes on the whitespace-stripped edit (`accepted`, `mistakes`) |
| `reorder` | Drag or arrow-button lines into order | `correctOrders`, or `gradeByRoutine` to accept any order that succeeds in the autonomous simulator |
| `timeline` | Predict each command's status per cycle | Cell-by-cell against `expected` (tests verify it against the simulator) |
| `autonomous` | Build a fork/await routine | Must complete every objective in the simulated world; efficiency tiers by time |
| `controller-map` | Match lines of code to controls on a drawn Xbox controller (click or dropdown) | Row by row against `expected`; tips for common mix-ups (bumper vs trigger, left vs right) |

Steps:

1. Add the object to the right tier file (order in `CHALLENGES` in `src/game/challenges/index.ts` = unlock order).
2. For scheduler scenarios, build commands with `loopCommand(...)` / `scenario(...)` from `src/game/challenges/scenarios.ts`. Generate displayed Java with `commandToJava(...)` so the code always matches the simulation.
3. Run `npm test` (structure, reference answers, and simulator agreement are all checked).
4. Bump `CONTENT_VERSION` in `src/game/challenges/index.ts` and add a new file name for that version in `CATALOG_MIGRATIONS` in `scripts/sync-supabase.ts` (never edit a migration that is already applied).
5. Run `npm run supabase:sync`, commit the new catalog migration and `supabase/functions/_shared/`, apply the migration (`npx supabase db push --remote`), and redeploy the function (`npx supabase functions deploy submit-answer`).

## Changing scoring rules

All scoring lives in `src/scoring/scoring.ts` (`BASE_POINTS` and `SCORING_RULES`): base points per tier (100/200/350), first-try bonus (+25%), no-hint bonus (+10%), autonomous efficiency (+40% gold / +20% silver), retry penalty (−10% each, max −40%), hint penalty (−10% each), and a 50% floor for any correct solve. Ties are broken by who reached their score first; thinking time never costs points.

After changing it: `npm test`, `npm run supabase:sync`, redeploy the Edge Function (`npx supabase functions deploy submit-answer`) and the site. Existing completions keep the points they were awarded.

## Creating and resetting competitions

- **Create**: Teacher dashboard → New competition. The join code is generated server-side (no ambiguous characters).
- **Start / restart timer**: sets `started_at` and `ends_at` from the server clock.
- **Settings**: change duration (recomputes the end time), enabled tiers, hide rankings.
- **Close**: ends immediately; later answers are rejected.
- **Reset scores**: deletes attempts, hints and completions, zeroes totals, and returns the classroom to the lobby. Teams stay joined.
- **Delete**: removes the classroom and everything in it.
- SQL alternatives: `select public.reset_classroom_scores('<classroom-uuid>');` (run as the owning teacher) or delete rows as an admin.

## Accuracy: Commands v3 and the simulator

The educational content was written against the official documentation (`docs.wpilib.org/en/latest/docs/software/commandbased/commands-v3/`) and the allwpilib `commandsv3` source. `docs/commands-v3-behavior.md` lists every modeled behavior, its source, and what is **not** modeled.

Highlights the simulator implements faithfully:

- Scheduler phases: pending commands are promoted during the scheduling phase; running commands execute **newest to oldest**, so a parent resumes in the same cycle its awaited child finishes.
- Conflicts: equal or higher priority interrupts (newest wins ties); lower priority is rejected and never starts; a new command must beat *every* command it conflicts with.
- `fork()` starts the child immediately and the parent continues; `await()` pauses the parent until that child run ends; awaiting an already-running command waits for it, awaiting a finished one restarts it.
- Parent/child: canceling or finishing a parent cancels its children; an **external** interruption of a child cancels the whole composition; a **sibling** interruption cancels only that sibling; children inherit higher parent priority and never conflict with ancestors.
- Default commands are queued only when a mechanism is idle.
- Events use WPILib `SchedulerEvent` names (`Scheduled`, `Interrupted`, `Canceled`, `Completed`, `ForkFailure`); simulator-only annotations are labeled.

Mechanism methods such as `drive.followPath("ToPiece")`, `arm.raise()` or `intake.intakeUntilPiece()` are **illustrative team code** (PathPlanner-style naming), labeled as such in each mission. WPILib names (`Command`, `Mechanism`, `run`, `runRepeatedly`, `named`, `withPriority`, `Command.noRequirements`, `coroutine.yield/fork/await/wait/waitUntil/park`, `whenCanceled`) are real API. The framework is still evolving for 2027: if the docs change, update `docs/commands-v3-behavior.md`, the simulator, and its tests.

## Security and fair play

- No personal data: teams choose a nickname; students use Supabase anonymous auth.
- The browser never sends points. The `submit-answer` Edge Function re-grades each raw answer with the same grading code (copied into `supabase/functions/_shared`), computes points from **server-side** attempt and hint counts, and writes completions with the service role.
- Row Level Security: clients have read-only access to what they need; students only see their own participant row (others via the leaderboard function). There are no client INSERT/UPDATE/DELETE grants on any table. Teacher operations check ownership in the database.
- Idempotent submissions (client-generated key, unique in the database), rate limiting (15 answers/minute per team, 2 s between answers to the same mission), duplicate-answer suppression in the UI, and one scoring completion per team and mission.
- Server timestamps decide whether a competition is running.
- Teacher access uses Supabase Auth plus the `teachers` allowlist, not a password in JavaScript.
- Honest limitation: challenge content and answer keys are shipped to the browser so the game works offline and in practice mode. A determined student could read them in DevTools. Server-side grading, attempt tracking, and rate limits keep the leaderboard reasonable, but no browser game is cheat-proof. "Hide rankings" is a presentation feature, not a secrecy guarantee.

## Limitations

- No Java compiler: code challenges use constrained, deterministically graded exercises, and the scheduler is a TypeScript model, not a JVM running WPILib. The UI says so.
- The simulator does not model triggers beyond scheduled events, OpModes and scopes other than command scope, sideloads, `StateMachine`, `Command.sequence/parallel/race` groups, exceptions, or `whenCanceled` hook execution.
- `making-commands-run.rst` says a parent "immediately continues" after a failed fork, while the migration guide and source show the default cancels the composition. The simulator follows the source (and models `setCancelOnForkFailure`); no graded challenge depends on it.
- Realtime pushes are used for teachers; students' leaderboards refresh every ~8 seconds.
- `.env.example` content is in [Environment variables](#environment-variables).

## Project structure

```
src/
  simulation/      Commands v3 scheduler model (framework-independent), autonomous world, Java codegen
  game/            challenge definitions, grading, progression, reference content
  scoring/         scoring rules and aggregation
  lib/             local store, Supabase client and API, offline outbox sync, CSV, stats
  hooks/           React hooks (app state, classroom status, sync)
  components/      UI: scheduler visualizer, code views/editors, challenge inputs, leaderboard
  pages/           screens (welcome, start, missions, challenge, leaderboard, reference, lab, teacher, present)
  styles/          design tokens (Tailwind v4 theme)
  types/           app state types
supabase/
  migrations/      schema, RLS, functions; generated challenge catalog
  functions/       submit-answer Edge Function (+ generated _shared grading code)
tests/             unit (Vitest), integration (Supabase), e2e (Playwright)
docs/              verified Commands v3 behavior notes
.github/workflows/ CI + GitHub Pages deployment
```
