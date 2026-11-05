import { readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalogSql, CATALOG_MIGRATION, listFiles, SHARED_DIRS, SHARED_TARGET } from '../../scripts/sync-supabase.ts'
import { toCsv } from '../../src/lib/csv.ts'
import { conceptStruggles } from '../../src/lib/stats.ts'
import { commandToJava } from '../../src/simulation/java.ts'
import { HIGHEST_PRIORITY, type Scenario } from '../../src/simulation/types.ts'
import { BASE_PATH } from '../../vite.config.ts'

const root = resolve(import.meta.dirname, '../..')

describe('GitHub Pages configuration', () => {
  it('serves from the repository subpath by default', () => {
    expect(BASE_PATH).toBe('/frc-command-quest/')
  })
  it('uses hash routing so deep links work without server rewrites', () => {
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')
    expect(app).toContain('createHashRouter')
    expect(app).not.toContain('createBrowserRouter')
  })
  it('references assets relative to the base path', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    expect(html).toContain('href="favicon.svg"')
    expect(html).not.toMatch(/href="\/favicon/)
  })
  it('deploys with a GitHub Actions Pages workflow', () => {
    const wf = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8')
    expect(wf).toContain('actions/deploy-pages')
    expect(wf).toContain('npm run build')
  })
})

describe('Supabase sync', () => {
  it('the Edge Function grades with an up-to-date copy of the game code', () => {
    for (const dir of SHARED_DIRS) {
      const srcDir = join(root, 'src', dir)
      for (const file of listFiles(srcDir)) {
        const copy = join(SHARED_TARGET, dir, relative(srcDir, file))
        expect(readFileSync(copy, 'utf8'), `${copy} is stale: run npm run supabase:sync`).toBe(readFileSync(file, 'utf8'))
      }
    }
  })
  it('the challenge catalog migration matches the challenge definitions', () => {
    expect(readFileSync(CATALOG_MIGRATION, 'utf8')).toBe(catalogSql())
  })
  it('never ships a service role key to the browser bundle', () => {
    for (const file of listFiles(join(root, 'src'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/service_role|SERVICE_ROLE/)
    }
  })
})

describe('CSV export', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny', 'plain']])).toBe('"a,b","say ""hi""","x\ny",plain')
  })
  it('neutralizes spreadsheet formulas in student nicknames', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '-2', '@a', 'ok']])).toBe(`"'=HYPERLINK(""x"")",'+1,'-2,'@a,ok`)
  })
})

describe('struggle analysis', () => {
  it('ranks concepts by wrong-answer rate', () => {
    const ranked = conceptStruggles([
      { challenge_id: 'a', title: 'A', difficulty: 'easy', concepts: ['loops'], teams_attempted: 5, teams_completed: 5, total_attempts: 10, wrong_attempts: 1, hints_used: 0, avg_attempts_to_solve: 1 },
      { challenge_id: 'b', title: 'B', difficulty: 'medium', concepts: ['priority'], teams_attempted: 5, teams_completed: 2, total_attempts: 10, wrong_attempts: 7, hints_used: 4, avg_attempts_to_solve: 3 },
    ])
    expect(ranked.map((r) => r.concept)).toEqual(['priority', 'loops'])
    expect(ranked[0].label).toBe('Priority')
  })
})

describe('Java code generation', () => {
  const scenario: Scenario = {
    mechanisms: [{ id: 'arm', name: 'Arm' }],
    commands: [
      { id: 'up', name: 'Arm Up', requirements: ['arm'], factory: 'arm.up()', priority: HIGHEST_PRIORITY, body: [{ op: 'work', label: 'up', cycles: 3, java: 'setArmVoltage(6);' }] },
      { id: 'seq', name: 'Seq', requirements: [], body: [{ op: 'fork', commands: ['up'] }, { op: 'await', command: 'up' }, { op: 'wait', cycles: 5 }] },
    ],
    events: [],
    maxCycles: 5,
  }
  it('emits real Commands v3 builder syntax', () => {
    const java = commandToJava(scenario.commands[0], scenario)
    expect(java).toContain('return arm.run(coroutine -> {')
    expect(java).toContain('coroutine.yield();')
    expect(java).toContain('}).withPriority(Command.HIGHEST_PRIORITY).named("Arm Up");')
  })
  it('declares a local variable when the same command object is reused', () => {
    const java = commandToJava(scenario.commands[1], scenario)
    expect(java).toContain('Command armUp = arm.up();')
    expect(java).toContain('coroutine.fork(armUp);')
    expect(java).toContain('coroutine.await(armUp);')
    expect(java).toContain('coroutine.wait(Milliseconds.of(100));')
    expect(java).toContain('return Command.noRequirements(coroutine -> {')
  })
})
