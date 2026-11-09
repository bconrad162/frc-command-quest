import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('the lab core imports in plain Node (server grading needs this)', () => {
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', "const m = await import('./src/game/robotLab/world.ts'); console.log(typeof m.RobotWorld)"],
    { encoding: 'utf8' },
  )
  expect(out.trim()).toBe('function')
})
