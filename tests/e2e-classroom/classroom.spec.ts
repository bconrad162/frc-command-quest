import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const URL = process.env.SUPABASE_TEST_URL ?? ''
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ?? ''

test.skip(!URL || !SERVICE, 'Needs a Supabase stack (npm run test:e2e:classroom)')

test('teacher runs a competition; a student joins, scores, and appears live', async ({ browser }) => {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.com`
  const password = 'correct-horse-9'
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await admin.from('teachers').insert({ user_id: data.user.id })

  // Teacher creates and starts a competition.
  const teacherCtx = await browser.newContext()
  const teacher = await teacherCtx.newPage()
  await teacher.goto('./#/teacher')
  await teacher.getByLabel('Email').fill(email)
  await teacher.getByLabel('Password').fill(password)
  await teacher.getByRole('button', { name: 'Sign in' }).click()
  await teacher.getByPlaceholder('FRC Training, Period 3').fill('E2E Room')
  await teacher.getByRole('button', { name: 'Create and get a join code' }).click()
  const code = (await teacher.getByTestId('join-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z2-9]{6}$/)
  await teacher.getByRole('button', { name: 'Start competition' }).click()
  await expect(teacher.getByRole('button', { name: 'Close competition' })).toBeVisible()
  const presentHref = await teacher.getByRole('link', { name: 'Present leaderboard' }).getAttribute('href')

  // Student joins with the code and solves a mission.
  const studentCtx = await browser.newContext()
  const student = await studentCtx.newPage()
  await student.goto('./#/start')
  await student.getByTestId('nickname-input').fill('Swerve Wizards')
  await student.getByTestId('code-input').fill(code)
  await student.getByTestId('create-team').click()
  await expect(student).toHaveURL(/#\/missions/)
  await expect(student.getByText('in E2E Room')).toBeVisible()
  await student.getByTestId('play-easy-1-battery-math').click()
  await student.getByTestId('output-input').fill('Battery: 80%\nMotors: 41')
  await student.getByTestId('check-answer').click()
  await expect(student.getByTestId('feedback')).toContainText('Correct!')
  await expect(student.getByText('Server confirmed 135')).toBeVisible({ timeout: 15_000 })
  await expect(student.getByText('Synced')).toBeVisible()

  await student.goto('./#/leaderboard')
  await expect(student.getByRole('tab', { name: 'Classroom: E2E Room' })).toHaveAttribute('aria-selected', 'true')
  await expect(student.getByTestId('leaderboard-table').getByRole('row', { name: /Swerve Wizards/ })).toContainText('135')

  // Projector view shows the team live, hides rankings, and crowns the winner.
  await teacher.goto(`./${presentHref}`)
  await expect(teacher.getByTestId('leaderboard-table')).toContainText('Swerve Wizards')
  await expect(teacher.getByTestId('leaderboard-table')).toContainText('135')
  await teacher.getByRole('button', { name: 'Hide rankings' }).click()
  await expect(teacher.getByText('Rankings are hidden.')).toBeVisible()
  await teacher.getByRole('button', { name: 'Victory screen' }).click()
  await expect(teacher.getByRole('dialog', { name: 'Victory' })).toContainText('Swerve Wizards')

  await teacherCtx.close()
  await studentCtx.close()
})
