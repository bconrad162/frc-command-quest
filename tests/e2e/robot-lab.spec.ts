import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __robotLab?: { advance(seconds: number): void }
  }
}

async function openLab(page: Page, quality = 'light') {
  await page.goto(`./#/robot-lab?quality=${quality}`)
  await expect(page.getByRole('heading', { name: 'Auto #7: Straight Back Depot' })).toBeVisible()
  await page.waitForFunction(() => !!window.__robotLab)
}

const advance = (page: Page, seconds: number) => page.evaluate((s) => window.__robotLab!.advance(s), seconds)

test('replays auto #7 with the drivetrain passed', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-run').click()
  await advance(page, 14)
  await expect(page.getByTestId('lane-drivetrain')).toContainText('TeleopDrive (default)')
  await expect(page.getByTestId('lab-log')).toContainText('PathPlannerAuto("#7 - Straight Back Depot")')
  const score = Number(await page.getByTestId('lab-score').textContent())
  expect(score).toBeGreaterThanOrEqual(28)
})

test('while the path runs, the auto owns the drivetrain', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-run').click()
  await advance(page, 1)
  await expect(page.getByTestId('lane-drivetrain')).toContainText('FollowPathCommand("Straight Back")')
  await expect(page.getByTestId('lane-shooter')).toContainText('reserved for a later step')
})

test('forgot drivetrain shows the conflict', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-mode-forgot').click()
  await expect(page.getByTestId('lab-code')).toContainText('No drivetrain!')
  await page.getByTestId('lab-run').click()
  await advance(page, 1.5)
  await expect(page.getByTestId('lane-drivetrain')).toContainText('TeleopDrive (default)')
  await expect(page.getByTestId('lane-drivetrain')).toContainText('FollowPathCommand is also calling drive()')
})

test('toggling mid-run resets to the start', async ({ page }) => {
  await openLab(page)
  await page.getByTestId('lab-run').click()
  await advance(page, 3)
  await page.getByTestId('lab-mode-forgot').click()
  await expect(page.getByTestId('lab-clock')).toContainText('loop 0')
  await expect(page.getByTestId('lab-hopper')).toHaveText('8')
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
  await page.getByTestId('lab-run').click()
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
  await expect(page.getByTestId('lab-run')).toBeVisible()
})

test('the conflict callout does not linger after switching to 2D', async ({ page }) => {
  await openLab(page)
  // Wait for the 3D field to finish loading (the callout only exists in 3D).
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 60_000 })
  await page.getByTestId('lab-mode-forgot').click()
  await page.getByTestId('lab-run').click()
  await advance(page, 1.5)
  await expect(page.getByTestId('lab-conflict-callout')).toBeVisible()
  await page.getByRole('group', { name: 'Quality' }).getByRole('button', { name: '2D' }).click()
  await expect(page.getByTestId('field-2d')).toBeVisible()
  await expect(page.getByTestId('lab-conflict-callout')).toBeHidden()
})

test('on a phone the conflict explanation is not cut off', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openLab(page)
  await page.getByTestId('lab-mode-forgot').click()
  await page.getByTestId('lab-run').click()
  await advance(page, 1.5)
  const chip = page.getByTestId('conflict-chip')
  await expect(chip).toBeVisible()
  const clipped = await chip.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  expect(clipped).toBe(false)
})
