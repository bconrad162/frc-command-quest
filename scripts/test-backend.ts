/**
 * Runs backend tests against the local Supabase stack started with `npx supabase start`.
 *   node scripts/test-backend.ts            -> tests/integration (Vitest)
 *   node scripts/test-backend.ts classroom  -> classroom-mode browser E2E (Playwright)
 */
import { execFileSync } from 'node:child_process'

const env = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
const vars = Object.fromEntries(
  env
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [m[1], m[2]]),
)
const testEnv = {
  ...process.env,
  SUPABASE_TEST_URL: vars.API_URL,
  SUPABASE_TEST_ANON_KEY: vars.ANON_KEY ?? vars.PUBLISHABLE_KEY,
  SUPABASE_TEST_SERVICE_KEY: vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY,
}
const classroom = process.argv[2] === 'classroom'
execFileSync(
  'npx',
  classroom ? ['playwright', 'test', '--config', 'playwright.classroom.config.ts'] : ['vitest', 'run', 'tests/integration'],
  { stdio: 'inherit', env: testEnv },
)
