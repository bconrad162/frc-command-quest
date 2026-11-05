/**
 * Backend integration tests against a real Supabase stack (local or a test project).
 * Skipped unless SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_KEY are set.
 *
 *   npx supabase start
 *   npx supabase functions serve        (in another terminal)
 *   npm run test:backend
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.SUPABASE_TEST_URL ?? ''
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ?? ''
const enabled = Boolean(URL && ANON && SERVICE)

const newClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

async function submit(client: SupabaseClient, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke('submit-answer', { body })
  if (error) {
    const res = (error as { context?: Response }).context
    const json = res ? await res.json().catch(() => null) : null
    return { status: res?.status ?? 0, body: json as Record<string, unknown> | null }
  }
  return { status: 200, body: data as Record<string, unknown> }
}

const easy1Right = { kind: 'predict-output', text: 'Battery: 80%\nMotors: 41' }
const easy1Wrong = { kind: 'predict-output', text: 'Battery: 80%\nMotors: 5' }
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!enabled)('Supabase backend', () => {
  const admin = enabled ? createClient(URL, SERVICE, { auth: { persistSession: false } }) : (null as unknown as SupabaseClient)
  const teacher = enabled ? newClient() : (null as unknown as SupabaseClient)
  const alice = enabled ? newClient() : (null as unknown as SupabaseClient)
  const bob = enabled ? newClient() : (null as unknown as SupabaseClient)
  const email = `teacher-${randomUUID().slice(0, 8)}@example.com`
  let classroomId = ''
  let code = ''

  beforeAll(async () => {
    const { data: created, error } = await admin.auth.admin.createUser({ email, password: 'correct-horse-9', email_confirm: true })
    if (error) throw error
    await admin.from('teachers').insert({ user_id: created.user.id })
    const signIn = await teacher.auth.signInWithPassword({ email, password: 'correct-horse-9' })
    if (signIn.error) throw signIn.error
    for (const c of [alice, bob]) {
      const r = await c.auth.signInAnonymously()
      if (r.error) throw r.error
    }
  })

  it('teachers create classrooms with a server-generated join code; students cannot', async () => {
    const { data, error } = await teacher.rpc('create_classroom', { p_name: 'Test Room', p_duration_minutes: 30, p_difficulties: ['easy', 'medium', 'hard'] })
    expect(error).toBeNull()
    classroomId = data.id
    code = data.join_code
    expect(code).toMatch(/^[A-Z2-9]{6}$/)
    const denied = await alice.rpc('create_classroom', { p_name: 'Hack', p_duration_minutes: 30, p_difficulties: ['easy'] })
    expect(denied.error?.message).toMatch(/Teacher access required/)
  })

  it('anonymous students join with a nickname; nicknames are unique per classroom', async () => {
    const a = await alice.rpc('join_classroom', { p_code: code.toLowerCase(), p_nickname: 'Swerve Wizards' })
    expect(a.error).toBeNull()
    const dup = await bob.rpc('join_classroom', { p_code: code, p_nickname: 'swerve wizards' })
    expect(dup.error?.message).toMatch(/already taken/)
    const b = await bob.rpc('join_classroom', { p_code: code, p_nickname: 'Brownout Bandits' })
    expect(b.error).toBeNull()
    const bad = await bob.rpc('join_classroom', { p_code: 'ZZZZZZ', p_nickname: 'X Y' })
    expect(bad.error?.message).toMatch(/No classroom/)
  })

  it('answers are not scored before the competition starts', async () => {
    const r = await submit(alice, { classroomId, challengeId: 'easy-1-battery-math', idempotencyKey: randomUUID(), answer: easy1Right })
    expect(r.status).toBe(409)
    expect(r.body?.permanent).toBe(false)
    const started = await teacher.rpc('start_classroom', { p_classroom: classroomId })
    expect(started.error).toBeNull()
    expect(started.data.status).toBe('running')
  })

  it('students cannot write scores or tables directly', async () => {
    const { data: me } = await alice.from('participants').select('id, total_points').single()
    const upd = await alice.from('participants').update({ total_points: 99999 }).eq('id', me!.id).select()
    expect(upd.data ?? []).toHaveLength(0)
    const ins = await alice.from('completions').insert({ participant_id: me!.id, challenge_id: 'easy-1-battery-math', classroom_id: classroomId, difficulty: 'easy', points: 9999, attempts: 1, hints_used: 0 })
    expect(ins.error).not.toBeNull()
    const reset = await alice.rpc('reset_classroom_scores', { p_classroom: classroomId })
    expect(reset.error?.message).toMatch(/Not your classroom/)
    // Students only see their own participant row directly.
    const { data: rows } = await alice.from('participants').select('nickname')
    expect(rows?.map((r) => r.nickname)).toEqual(['Swerve Wizards'])
    const { data: after } = await admin.from('participants').select('total_points').eq('id', me!.id).single()
    expect(after!.total_points).toBe(0)
  })

  it('grades on the server, applies retry penalties, and is idempotent', async () => {
    const wrong = await submit(alice, { classroomId, challengeId: 'easy-1-battery-math', idempotencyKey: randomUUID(), answer: easy1Wrong })
    expect(wrong.status).toBe(200)
    expect(wrong.body?.correct).toBe(false)
    await pause(2100)
    const key = randomUUID()
    const right = await submit(alice, { classroomId, challengeId: 'easy-1-battery-math', idempotencyKey: key, answer: easy1Right, points: 100000 })
    expect(right.body?.correct).toBe(true)
    expect(right.body?.pointsAwarded).toBe(100) // 100 base + 10 no-hint - 10 one retry
    const replay = await submit(alice, { classroomId, challengeId: 'easy-1-battery-math', idempotencyKey: key, answer: easy1Right })
    expect(replay.body?.duplicate).toBe(true)
    expect(replay.body?.pointsAwarded).toBe(100)
    await pause(2100)
    const again = await submit(alice, { classroomId, challengeId: 'easy-1-battery-math', idempotencyKey: randomUUID(), answer: easy1Right })
    expect(again.body?.alreadyCompleted).toBe(true)
    const { data } = await admin.from('participants').select('total_points, easy_completed').eq('classroom_id', classroomId).eq('nickname', 'Swerve Wizards').single()
    expect(data).toEqual({ total_points: 100, easy_completed: 1 })
  })

  it('uses server-recorded hints for penalties and rejects malformed answers', async () => {
    const h = await bob.rpc('record_hint', { p_classroom: classroomId, p_challenge: 'easy-1-battery-math', p_hint_index: 0 })
    expect(h.error).toBeNull()
    const bad = await submit(bob, { classroomId, challengeId: 'easy-1-battery-math', idempotencyKey: randomUUID(), answer: { kind: 'choice', selected: ['a'] } })
    expect(bad.status).toBe(400)
    expect(bad.body?.permanent).toBe(true)
    const r = await submit(bob, { classroomId, challengeId: 'easy-1-battery-math', idempotencyKey: randomUUID(), answer: easy1Right })
    expect(r.body?.pointsAwarded).toBe(115) // 100 + 25 first try - 10 hint
  })

  it('serves a ranked leaderboard and hides rankings on request', async () => {
    const { data } = await alice.rpc('classroom_leaderboard', { p_classroom: classroomId })
    expect(data.map((r: { nickname: string; total_points: number }) => [r.nickname, r.total_points])).toEqual([
      ['Brownout Bandits', 115],
      ['Swerve Wizards', 100],
    ])
    await teacher.rpc('update_classroom', { p_classroom: classroomId, p_name: null, p_duration_minutes: null, p_difficulties: null, p_rankings_hidden: true })
    const { data: hidden } = await alice.rpc('classroom_leaderboard', { p_classroom: classroomId })
    const bobRow = hidden.find((r: { nickname: string }) => r.nickname === 'Brownout Bandits')
    expect(bobRow.total_points).toBe(0)
    const { data: teacherView } = await teacher.rpc('classroom_leaderboard', { p_classroom: classroomId })
    expect(teacherView[0].total_points).toBe(115)
  })

  it('gives teachers per-challenge statistics', async () => {
    const { data, error } = await teacher.rpc('classroom_challenge_stats', { p_classroom: classroomId })
    expect(error).toBeNull()
    const easy1 = data.find((s: { challenge_id: string }) => s.challenge_id === 'easy-1-battery-math')
    expect(Number(easy1.teams_completed)).toBe(2)
    expect(Number(easy1.wrong_attempts)).toBe(1)
    expect(Number(easy1.hints_used)).toBe(1)
  })

  it('never scores a correct answer submitted after the answer was revealed', async () => {
    for (const code of ['i >= 0', 'i < 0', 'i > 1']) {
      const r = await submit(alice, { classroomId, challengeId: 'easy-2-countdown-loop', idempotencyKey: randomUUID(), answer: { kind: 'code-edit', code } })
      expect(r.body?.correct).toBe(false)
      await pause(2100)
    }
    const late = await submit(alice, { classroomId, challengeId: 'easy-2-countdown-loop', idempotencyKey: randomUUID(), answer: { kind: 'code-edit', code: 'i > 0' } })
    expect(late.status).toBe(200)
    expect(late.body?.correct).toBe(true)
    expect(late.body?.pointsAwarded).toBe(0)
    const { data, error } = await admin.from('completions').select('challenge_id').eq('classroom_id', classroomId).eq('challenge_id', 'easy-2-countdown-loop')
    expect(error).toBeNull()
    expect(data).toEqual([])
  }, 20_000)

  it('rejects answers after the competition closes, and resets cleanly', async () => {
    await teacher.rpc('close_classroom', { p_classroom: classroomId })
    const late = await submit(bob, { classroomId, challengeId: 'easy-2-countdown-loop', idempotencyKey: randomUUID(), answer: { kind: 'code-edit', code: 'i > 0' } })
    expect(late.status).toBe(409)
    expect(late.body?.permanent).toBe(true)
    const reset = await teacher.rpc('reset_classroom_scores', { p_classroom: classroomId })
    expect(reset.error).toBeNull()
    const { data } = await admin.from('participants').select('total_points').eq('classroom_id', classroomId)
    expect(data?.every((p) => p.total_points === 0)).toBe(true)
  })
})
