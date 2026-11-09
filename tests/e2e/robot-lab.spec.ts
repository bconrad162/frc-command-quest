import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __robotLab?: { advance(seconds: number): void; setInput(input: Record<string, unknown>): void }
  }
}

async function openLab(page: Page, quality = 'light') {
  await page.goto(`./#/robot-lab?quality=${quality}`)
  await expect(page.getByRole('heading', { name: 'Robot Lab', exact: true })).toBeVisible()
  await page.waitForFunction(() => !!window.__robotLab)
}

const advance = (page: Page, seconds: number) => page.evaluate((s) => window.__robotLab!.advance(s), seconds)
const poseX = async (page: Page) => Number((await page.getByTestId('lab-pose').textContent())!.match(/x (-?[\d.]+)/)![1])

/** Clicks the end of the last line of configureBindings() (the editor opens scrolled there). */
async function clickLastBinding(page: Page) {
  const line = page.locator('.cm-line', { hasText: /driver\.\w+\(\)\.\w+\(/ }).last()
  await line.click()
  await page.keyboard.press('End')
}

/** Types a new line at the end of configureBindings(). */
async function addBindingLine(page: Page, line: string) {
  await clickLastBinding(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type(line)
}

test.describe('autonomous (auto #7)', () => {
  test('replays auto #7 with the drivetrain passed', async ({ page }) => {
    await openLab(page)
    await page.getByTestId('lab-mode-auto').click()
    await page.getByTestId('lab-enable').click()
    await advance(page, 14)
    await expect(page.getByTestId('lane-drivetrain')).toContainText('TeleopDrive (default)')
    await expect(page.getByTestId('lab-log')).toContainText('PathPlannerAuto("#7 - Straight Back Depot")')
    expect(Number(await page.getByTestId('lab-score').textContent())).toBeGreaterThanOrEqual(28)
  })

  test('while the path runs, the auto owns the drivetrain', async ({ page }) => {
    await openLab(page)
    await page.getByTestId('lab-mode-auto').click()
    await page.getByTestId('lab-enable').click()
    await advance(page, 1)
    await expect(page.getByTestId('lane-drivetrain')).toContainText('FollowPathCommand("Straight Back")')
    await expect(page.getByTestId('lane-shooter')).toContainText('reserved for a later step')
  })

  test('mission 1 (forgot drivetrain) shows the conflict, and fixing the code passes', async ({ page }) => {
    await openLab(page)
    await page.getByTestId('lab-mission').selectOption('fix-auto')
    await expect(page.getByTestId('lab-mode-auto')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('lab-enable').click()
    await advance(page, 1.5)
    await expect(page.getByTestId('lane-drivetrain')).toContainText('TeleopDrive (default)')
    await expect(page.getByTestId('lane-drivetrain')).toContainText('FollowPathCommand is also calling drive()')
    await page.getByTestId('lab-check').click()
    await expect(page.getByTestId('lab-check-result')).toContainText('TeleopDrive')
    // Fix it: add the drive requirement.
    // The editor opens at configureBindings(); scroll up to AutoBuilder.configure(...).
    await page.locator('.cm-line', { hasText: 'this::isRedAlliance' }).scrollIntoViewIfNeeded()
    await page.locator('[data-region="driveRequirements"]').click()
    // End of the line is after ");" (read-only); the region ends just before it.
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type(', drivetrain')
    await page.getByTestId('lab-check').click()
    await expect(page.getByTestId('lab-check-result')).toContainText('Mission complete')
  })
})

test('teleop: holding W drives the robot forward', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-enable').click()
  const before = await poseX(page)
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.down('KeyW')
  await advance(page, 0.6)
  await page.keyboard.up('KeyW')
  expect((await poseX(page)) - before).toBeGreaterThan(1)
})

test('typing W in the editor does not drive', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-enable').click()
  const before = await poseX(page)
  await clickLastBinding(page)
  await page.keyboard.down('KeyW')
  await advance(page, 0.6)
  await page.keyboard.up('KeyW')
  expect(await poseX(page)).toBeCloseTo(before, 2)
})

test('dragging the on-page left stick up drives forward', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-enable').click()
  const before = await poseX(page)
  const knob = page.getByTestId('lab-controller').locator('[data-control="leftStick"]')
  await knob.scrollIntoViewIfNeeded()
  const box = (await knob.boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - 60, { steps: 4 })
  await advance(page, 0.6)
  await expect(page.getByTestId('lab-input-readout')).toContainText('LY -1.00')
  await page.mouse.up()
  expect((await poseX(page)) - before).toBeGreaterThan(1)
  await expect(page.getByTestId('lab-input-readout')).toContainText('LY  0.00')
})

test('mission 2: forward drives backward until the minus sign is added', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-mission').selectOption('forward-backward')
  await page.getByTestId('lab-check').click()
  await expect(page.getByTestId('lab-check-result')).toContainText('toward your driver station')
  // Home goes to the start of the line's text; "() -> " is 6 characters.
  await page.locator('.cm-line', { hasText: '() -> driver.getLeftY()' }).click()
  await page.keyboard.press('Home')
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.type('-')
  await expect(page.getByTestId('lab-problems')).toContainText('No problems')
  await page.getByTestId('lab-check').click()
  await expect(page.getByTestId('lab-check-result')).toContainText('Mission complete')
})

test('mission 4: add a shoot binding, deploy, and pass', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-mission').selectOption('add-shoot-button')
  await page.getByTestId('lab-check').click()
  await expect(page.getByTestId('lab-check-result')).toContainText('No button runs')
  await addBindingLine(page, 'driver.x().whileTrue(shooter.shootFuelCommand());')
  await expect(page.getByTestId('lab-deploy')).toBeEnabled()
  await page.getByTestId('lab-deploy').click()
  await page.getByTestId('lab-enable').click()
  await page.evaluate(() => window.__robotLab!.setInput({ buttons: ['x'] }))
  await advance(page, 3)
  expect(Number(await page.getByTestId('lab-score').textContent())).toBeGreaterThanOrEqual(3)
  await page.getByTestId('lab-check').click()
  await expect(page.getByTestId('lab-check-result')).toContainText('Mission complete')
})

test('a 2026 name shows the Commands v3 tip in Problems and blocks Deploy', async ({ page }) => {
  await openLab(page)
  await addBindingLine(page, 'driver.povUp().onTrue(pushout.pushCommand());')
  await expect(page.getByTestId('lab-problems')).toContainText('is the 2026 name; Commands v3 uses')
  await expect(page.getByTestId('lab-problems')).toContainText('dpadUp()')
  await expect(page.getByTestId('lab-deploy')).toBeDisabled()
})

test('three failed checks offer the fix', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-mission').selectOption('intake-wont-stop')
  for (let i = 0; i < 3; i++) await page.getByTestId('lab-check').click()
  await page.getByTestId('lab-show-fix').click()
  await expect(page.getByTestId('lab-code')).toContainText('driver.rightTrigger().whileTrue(intake.runIntakeCommand());')
  await page.getByTestId('lab-check').click()
  await expect(page.getByTestId('lab-check-result')).toContainText('Mission complete')
})

test('falls back to 2D when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null
      return (original as (...a: unknown[]) => unknown).call(this, type, ...args)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await openLab(page, 'auto')
  await expect(page.getByTestId('field-2d')).toBeVisible()
  await expect(page.getByTestId('lab-fallback-reason')).toContainText("can't show 3D")
  await page.getByTestId('lab-mode-auto').click()
  await page.getByTestId('lab-enable').click()
  await advance(page, 1)
  await expect(page.getByTestId('lane-drivetrain')).toContainText('FollowPathCommand')
})

test('shows the 2D fallback when the field model fails to load', async ({ page }) => {
  await page.route('**/models/field-2026.glb', (r) => r.fulfill({ status: 404, body: 'Not found' }))
  await openLab(page)
  await expect(page.getByTestId('field-2d')).toBeVisible()
  await expect(page.getByTestId('lab-fallback-reason')).toContainText("Couldn't load the 3D field")
})

test('fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openLab(page)
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(390)
  await expect(page.getByTestId('lab-enable')).toBeVisible()
  await expect(page.getByTestId('lab-deploy')).toBeVisible()
})

test('the conflict callout does not linger after switching to 2D', async ({ page }) => {
  await openLab(page)
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 60_000 })
  await page.getByTestId('lab-mission').selectOption('fix-auto')
  await page.getByTestId('lab-enable').click()
  await advance(page, 1.5)
  await expect(page.getByTestId('lab-conflict-callout')).toBeVisible()
  await page.getByRole('group', { name: 'Quality' }).getByRole('button', { name: '2D' }).click()
  await expect(page.getByTestId('field-2d')).toBeVisible()
  await expect(page.getByTestId('lab-conflict-callout')).toBeHidden()
})

test('on a phone the conflict explanation is not cut off', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openLab(page)
  await page.getByTestId('lab-mission').selectOption('fix-auto')
  await page.getByTestId('lab-enable').click()
  await advance(page, 1.5)
  const chip = page.getByTestId('conflict-chip')
  await expect(chip).toBeVisible()
  expect(await chip.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false)
})

test('on a phone, every file opens and code lines wrap instead of running off the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openLab(page)
  const scroller = page.getByTestId('lab-code').locator('.cm-scroller')
  expect(await scroller.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.getByRole('tab', { name: 'Shooter.java' }).click()
  await expect(page.getByTestId('lab-editor')).toContainText('public Command shootFuelCommand()')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('after picking a mission, number keys press buttons instead of switching missions', async ({ page }) => {
  await openLab(page)
  const select = page.getByTestId('lab-mission')
  await select.focus()
  await select.selectOption('forward-backward')
  await page.keyboard.press('Digit1')
  await page.keyboard.press('KeyF')
  await expect(page.getByTestId('lab-mission')).toHaveValue('forward-backward')
})

test('switching missions after editing asks first, and Cancel keeps the code', async ({ page }) => {
  await openLab(page)
  await addBindingLine(page, '// my notes')
  page.once('dialog', (d) => d.dismiss())
  await page.getByTestId('lab-mission').selectOption('fix-auto')
  await expect(page.getByTestId('lab-mission')).toHaveValue('free')
  await expect(page.getByTestId('lab-code')).toContainText('// my notes')
})

test('the on-page controller takes touch drags instead of scrolling the page', async ({ page }) => {
  await openLab(page)
  const svg = page.getByTestId('lab-controller').locator('svg').first()
  expect(await svg.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none')
})
