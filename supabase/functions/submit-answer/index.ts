// Supabase Edge Function: authoritative grading for classroom competitions.
//
// The browser never sends points. It sends the raw answer; this function
// re-grades it with the same deterministic grader the game uses (copied into
// ../_shared by `npm run supabase:sync`), computes points from SERVER-SIDE
// attempt and hint counts, and stores the result. Submissions are idempotent
// (client-generated idempotency key), rate limited, and rejected outside the
// competition window using server timestamps.
//
// Deploy: supabase functions deploy submit-answer
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getChallenge } from '../_shared/game/challenges/index.ts'
import { gradeAnswer } from '../_shared/game/grading.ts'
import { computeScore } from '../_shared/scoring/scoring.ts'
import { REVEAL_AFTER_WRONG } from '../_shared/game/progress.ts'

const MAX_BODY_BYTES = 16_000
const RATE_LIMIT_PER_MINUTE = 15
const MIN_SECONDS_BETWEEN_SAME_CHALLENGE = 2
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** permanent = the client should stop retrying this submission. */
function fail(status: number, error: string, permanent: boolean): Response {
  return json(status, { error, permanent })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'Use POST', true)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return fail(500, 'Server is not configured', false)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return fail(401, 'Sign-in required', false)
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return fail(401, 'Sign-in required', false)
  const userId = userData.user.id

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return fail(413, 'Answer is too large', true)
  let body: { classroomId?: unknown; challengeId?: unknown; idempotencyKey?: unknown; answer?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return fail(400, 'Invalid JSON', true)
  }
  const { classroomId, challengeId, idempotencyKey, answer } = body
  if (typeof classroomId !== 'string' || !UUID.test(classroomId)) return fail(400, 'Invalid classroom', true)
  if (typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey)) return fail(400, 'Invalid submission key', true)
  if (typeof challengeId !== 'string' || challengeId.length > 80) return fail(400, 'Invalid challenge', true)
  const challenge = getChallenge(challengeId)
  if (!challenge) return fail(400, 'Unknown challenge', true)

  const { data: participant } = await admin
    .from('participants')
    .select('id, classroom_id, user_id')
    .eq('classroom_id', classroomId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!participant) return fail(403, 'Join the classroom first', true)

  // Idempotent replay: the same submission key always returns the stored result.
  const { data: existing } = await admin
    .from('attempts')
    .select('participant_id, correct, points_awarded, attempt_number, feedback')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing) {
    if (existing.participant_id !== participant.id) return fail(409, 'Submission key already used', true)
    return json(200, {
      correct: existing.correct,
      feedback: existing.feedback,
      pointsAwarded: existing.points_awarded,
      attemptNumber: existing.attempt_number,
      duplicate: true,
    })
  }

  const { data: room } = await admin
    .from('classrooms')
    .select('status, ends_at, enabled_difficulties')
    .eq('id', classroomId)
    .single()
  if (!room) return fail(404, 'Classroom not found', true)
  const now = new Date()
  if (room.status === 'lobby') return fail(409, 'The competition has not started yet', false)
  if (room.status === 'closed' || (room.ends_at && now > new Date(room.ends_at))) {
    return fail(409, 'The competition is over, so this answer was not scored', true)
  }
  if (!room.enabled_difficulties.includes(challenge.difficulty)) {
    return fail(409, `${challenge.difficulty} missions are turned off for this competition`, true)
  }

  // Rate limiting (per team).
  const minuteAgo = new Date(now.getTime() - 60_000).toISOString()
  const { count: recent } = await admin
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', participant.id)
    .gte('created_at', minuteAgo)
  if ((recent ?? 0) >= RATE_LIMIT_PER_MINUTE) return fail(429, 'Too many answers in a minute. Slow down and think!', false)

  const { data: lastSame } = await admin
    .from('attempts')
    .select('created_at')
    .eq('participant_id', participant.id)
    .eq('challenge_id', challenge.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastSame && now.getTime() - new Date(lastSame.created_at).getTime() < MIN_SECONDS_BETWEEN_SAME_CHALLENGE * 1000) {
    return fail(429, 'Answers are arriving too quickly', false)
  }

  const { data: completion } = await admin
    .from('completions')
    .select('points')
    .eq('participant_id', participant.id)
    .eq('challenge_id', challenge.id)
    .maybeSingle()
  if (completion) {
    return json(200, { correct: true, alreadyCompleted: true, pointsAwarded: 0, totalForChallenge: completion.points })
  }

  const grade = gradeAnswer(challenge, answer)
  if (grade.invalid) return fail(400, grade.feedback, true)

  const [{ count: priorAttempts }, { count: wrongBefore }, { count: hintsUsed }] = await Promise.all([
    admin.from('attempts').select('id', { count: 'exact', head: true }).eq('participant_id', participant.id).eq('challenge_id', challenge.id),
    admin
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('participant_id', participant.id)
      .eq('challenge_id', challenge.id)
      .eq('correct', false),
    admin.from('hint_usage').select('hint_index', { count: 'exact', head: true }).eq('participant_id', participant.id).eq('challenge_id', challenge.id),
  ])

  // The browser shows the answer after REVEAL_AFTER_WRONG wrong attempts, so a
  // correct answer after that point is recorded but never scores or completes.
  const revealed = (wrongBefore ?? 0) >= REVEAL_AFTER_WRONG
  const breakdown = grade.correct && !revealed
    ? computeScore({
        difficulty: challenge.difficulty,
        wrongAttempts: wrongBefore ?? 0,
        hintsUsed: hintsUsed ?? 0,
        efficiency: grade.efficiency,
        basePoints: challenge.basePoints,
      })
    : null
  const attemptNumber = (priorAttempts ?? 0) + 1

  let pointsAwarded = 0
  if (grade.correct && breakdown) {
    const { data: inserted, error: completionError } = await admin
      .from('completions')
      .upsert(
        {
          participant_id: participant.id,
          challenge_id: challenge.id,
          classroom_id: classroomId,
          difficulty: challenge.difficulty,
          points: breakdown.total,
          attempts: attemptNumber,
          hints_used: hintsUsed ?? 0,
        },
        { onConflict: 'participant_id,challenge_id', ignoreDuplicates: true },
      )
      .select('points')
    if (completionError) return fail(500, 'Could not save the result', false)
    pointsAwarded = inserted && inserted.length > 0 ? breakdown.total : 0
  }

  const { error: attemptError } = await admin.from('attempts').insert({
    idempotency_key: idempotencyKey,
    classroom_id: classroomId,
    participant_id: participant.id,
    challenge_id: challenge.id,
    attempt_number: attemptNumber,
    answer,
    correct: grade.correct,
    hints_used: hintsUsed ?? 0,
    points_awarded: pointsAwarded,
    feedback: grade.feedback,
  })
  if (attemptError && attemptError.code !== '23505') return fail(500, 'Could not save the attempt', false)

  await admin.from('participants').update({ last_active_at: now.toISOString() }).eq('id', participant.id)

  return json(200, {
    correct: grade.correct,
    feedback: grade.feedback,
    pointsAwarded,
    attemptNumber,
    breakdown: breakdown?.lines ?? null,
    efficiency: grade.efficiency ?? null,
    seconds: grade.seconds ?? null,
  })
})
