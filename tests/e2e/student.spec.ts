import { expect, test, type Page } from '@playwright/test'

async function createTeam(page: Page, nickname = 'Swerve Wizards') {
  await page.goto('./')
  await page.getByTestId('start-competition').click()
  await expect(page).toHaveURL(/#\/start/)
  await page.getByTestId('nickname-input').fill(nickname)
  await page.getByTestId('create-team').click()
  await expect(page).toHaveURL(/#\/missions/)
}

async function solveEasy1(page: Page) {
  await page.getByTestId('play-easy-1-battery-math').click()
  await page.getByTestId('output-input').fill('Battery: 80%\nMotors: 41')
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('feedback')).toContainText('Correct!')
}

test('the site loads under the GitHub Pages subpath with working assets', async ({ page }) => {
  const failed: string[] = []
  page.on('requestfailed', (r) => failed.push(r.url()))
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /COMMAND\s*QUEST/ })).toBeVisible()
  await expect(page.getByText('Master Java. Control the Scheduler. Win the Competition.')).toBeVisible()
  expect(page.url()).toContain('/frc-command-quest/')
  expect(failed).toEqual([])
  // Deep links use hash routing, so a reload of a nested route still works on GitHub Pages.
  await page.goto('./#/reference')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Reference' })).toBeVisible()
})

test('a student joins, completes an Easy mission, and unlocks the next one', async ({ page }) => {
  await createTeam(page)
  await expect(page.getByTestId('mission-easy-2-countdown-loop').getByLabel('Locked')).toBeVisible()

  // A wrong answer first: targeted feedback, no points.
  await page.getByTestId('play-easy-1-battery-math').click()
  await page.getByTestId('output-input').fill('Battery: 80%\nMotors: 5')
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('feedback')).toContainText('Not yet')
  await expect(page.getByTestId('feedback')).toContainText('String')

  await page.getByTestId('output-input').fill('Battery: 80%\nMotors: 41')
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('feedback')).toContainText('Correct!')
  await expect(page.getByTestId('feedback')).toContainText('Why?')
  // 100 base + 10 no-hint - 10 one retry = 100
  await expect(page.getByTestId('points-earned')).toHaveText('100')

  await page.getByTestId('next-mission').click()
  await expect(page.getByRole('heading', { name: 'Fix the Countdown' })).toBeVisible()
  await page.goto('./#/missions')
  await expect(page.getByTestId('play-easy-2-countdown-loop')).toBeVisible()
  await expect(page.getByTestId('total-points')).toHaveText('100')
})

test('three wrong answers reveal the answer, score nothing, and unlock the next mission', async ({ page }) => {
  await createTeam(page)
  await page.getByTestId('play-easy-1-battery-math').click()
  for (const [i, text] of ['Battery 80%\nMotors: 41', 'Battery: 76%\nMotors: 41'].entries()) {
    await page.getByTestId('output-input').fill(text)
    await page.getByTestId('check-answer').click()
    await expect(page.getByTestId('attempts-left')).toContainText(`Wrong attempts: ${i + 1} of 3`)
  }
  await expect(page.getByTestId('answer-revealed')).toHaveCount(0)
  await page.getByTestId('output-input').fill('Battery: 80%\nMotors: 5')
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('answer-revealed')).toContainText('Here is the answer')
  await expect(page.getByTestId('revealed-output')).toHaveText('Battery: 80%\nMotors: 41')
  await expect(page.getByTestId('output-input')).toBeDisabled()
  await expect(page.getByTestId('check-answer')).toHaveCount(0)
  await page.getByTestId('next-mission').click()
  await expect(page.getByRole('heading', { name: 'Fix the Countdown' })).toBeVisible()
  await page.goto('./#/missions')
  await expect(page.getByTestId('total-points')).toHaveText('0')
})

test('the constrained editor fixes a loop', async ({ page }) => {
  await createTeam(page)
  await solveEasy1(page)
  await page.getByTestId('next-mission').click()
  const editor = page.getByTestId('constrained-editor').locator('.cm-content')
  await expect(editor).toBeVisible()
  // Click inside the editable region, select it, and type the fix.
  await page.locator('.cq-editable').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('i > 0')
  await expect(page.locator('.cq-editable')).toHaveText('i > 0')
  // Typing outside the region is blocked.
  await expect(editor).toContainText('System.out.println("Launch!");')
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('feedback')).toContainText('Correct!')
})

test('a scheduler challenge: predict, lock in, then verify in the simulator', async ({ page }) => {
  await createTeam(page)
  await page.getByTestId('play-medium-1-drive-conflict').click()
  const sim = page.getByRole('region', { name: 'Verify your prediction' })
  await expect(sim.getByText('Lock in your prediction first')).toBeVisible()
  await page.getByLabel('Drive Forward is interrupted and canceled; Turn Left takes over Drive.').check()
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('feedback')).toContainText('Correct!')
  await expect(page.getByTestId('points-earned')).toHaveText('270')

  // The simulator unlocks: step to cycle 4 and watch the interruption happen.
  const step = sim.getByRole('button', { name: 'Step one cycle' })
  for (let i = 0; i < 4; i++) await step.click()
  await expect(sim.getByTestId('cycle-counter')).toHaveText('4')
  await expect(sim.getByText('Drive Forward was interrupted by Turn Left')).toBeVisible()
  await expect(sim.getByText('Turn Left', { exact: true }).first()).toBeVisible()
})

test('progress and the leaderboard survive a refresh', async ({ page }) => {
  await createTeam(page, 'Brownout Bandits')
  await solveEasy1(page)
  await page.reload()
  await expect(page.getByTestId('feedback')).toContainText('You completed this mission.')
  await page.goto('./#/missions')
  await expect(page.getByTestId('total-points')).toHaveText('135')
  await expect(page.getByTestId('mission-easy-1-battery-math').getByLabel('Completed')).toBeVisible()

  await page.goto('./#/leaderboard')
  await expect(page.getByText('Local scores: only teams that played on this device.')).toBeVisible()
  const row = page.getByTestId('leaderboard-table').getByRole('row', { name: /Brownout Bandits/ })
  await expect(row).toContainText('135')
  await expect(row).toContainText('your team')
})

test('replaying a completed mission does not award points twice', async ({ page }) => {
  await createTeam(page)
  await solveEasy1(page)
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('feedback')).toContainText('replays do not change your score')
  await page.goto('./#/missions')
  await expect(page.getByTestId('total-points')).toHaveText('135')
})

test('the autonomous builder runs a routine and scores it', async ({ page }) => {
  await page.goto('./#/practice/hard-5-optimize-auto')
  const add = (name: string) => page.getByRole('button', { name, exact: true }).click()
  await add('Add fork Start Intake')
  await add('Add await Follow Path: ToPiece')
  await add('Add fork Raise Arm')
  await add('Add await Follow Path: ToScore')
  await add('Add await Score Game Piece')
  await add('Add await Lower Arm')
  await expect(page.getByTestId('routine-step')).toHaveCount(6)
  const sim = page.getByRole('region', { name: 'Autonomous simulation' })
  await sim.getByRole('button', { name: 'Run to the end' }).click()
  await expect(sim.getByText('SCORED! Game piece delivered.')).toBeVisible()
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('feedback')).toContainText('Correct!')
  await expect(page.getByTestId('feedback')).toContainText('Gold efficiency')
})

test('keyboard users can reorder lines without drag and drop', async ({ page }) => {
  await page.goto('./#/practice/easy-4-first-command')
  // Initial order: wait, stop, start, print. Target: start, print, wait, stop.
  await page.getByRole('button', { name: 'Move "setSpeed(0.75);" up' }).click()
  await page.getByRole('button', { name: 'Move "setSpeed(0.75);" up' }).click()
  await page.getByRole('button', { name: 'Move "System.out.println("Intake started");" up' }).click()
  await page.getByRole('button', { name: 'Move "System.out.println("Intake started");" up' }).click()
  await page.getByTestId('check-answer').click()
  await expect(page.getByTestId('feedback')).toContainText('Correct!')
})
