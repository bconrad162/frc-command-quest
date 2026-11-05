/**
 * Typed wrappers around the Supabase RPCs and the submit-answer Edge Function.
 * Every call here needs the backend; callers check isBackendConfigured first.
 */
import type { Answer, Difficulty } from '../game/types.ts'
import { getSupabase } from './supabase.ts'

export class BackendError extends Error {
  readonly permanent: boolean
  readonly status?: number
  constructor(message: string, permanent: boolean, status?: number) {
    super(message)
    this.permanent = permanent
    this.status = status
  }
}

function rpcError(error: { message: string; code?: string } | null): BackendError | null {
  if (!error) return null
  // Postgres errors raised by our functions are deliberate and not worth retrying.
  const permanent = Boolean(error.code && !['PGRST301', '08000', '08006', '57014'].includes(error.code))
  return new BackendError(error.message, permanent)
}

/** Students use anonymous auth: no email, no password. */
export async function ensureStudentSession(): Promise<string> {
  const supabase = await getSupabase()
  const { data } = await supabase.auth.getSession()
  if (data.session?.user) return data.session.user.id
  const { data: signIn, error } = await supabase.auth.signInAnonymously()
  if (error || !signIn.user) {
    throw new BackendError(
      error?.message.includes('Anonymous') ? 'Anonymous sign-ins are disabled for this project (see README).' : (error?.message ?? 'Could not start a session'),
      false,
    )
  }
  return signIn.user.id
}

export interface JoinResult {
  participantId: string
  classroomId: string
  classroomName: string
  nickname: string
}

export async function joinClassroom(code: string, nickname: string): Promise<JoinResult> {
  await ensureStudentSession()
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('join_classroom', { p_code: code, p_nickname: nickname })
  const err = rpcError(error)
  if (err) throw err
  const row = (data as Array<{ participant_id: string; classroom_id: string; classroom_name: string; nickname: string }>)[0]
  if (!row) throw new BackendError('Could not join the classroom', false)
  return { participantId: row.participant_id, classroomId: row.classroom_id, classroomName: row.classroom_name, nickname: row.nickname }
}

export interface SubmitResponse {
  correct: boolean
  feedback?: string
  pointsAwarded: number
  attemptNumber?: number
  alreadyCompleted?: boolean
  duplicate?: boolean
}

export async function submitAnswer(input: {
  classroomId: string
  challengeId: string
  idempotencyKey: string
  answer: Answer
}): Promise<SubmitResponse> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.functions.invoke('submit-answer', { body: input })
  if (error) {
    // FunctionsHttpError carries the response; read our { error, permanent } body.
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      const body = (await context.json().catch(() => null)) as { error?: string; permanent?: boolean } | null
      throw new BackendError(body?.error ?? error.message, Boolean(body?.permanent), context.status)
    }
    throw new BackendError(error.message, false)
  }
  return data as SubmitResponse
}

export async function recordHint(classroomId: string, challengeId: string, hintIndex: number): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.rpc('record_hint', { p_classroom: classroomId, p_challenge: challengeId, p_hint_index: hintIndex })
  const err = rpcError(error)
  if (err) throw err
}

export interface LeaderboardRow {
  id: string
  nickname: string
  classroomName?: string
  totalPoints: number
  easyCompleted: number
  mediumCompleted: number
  hardCompleted: number
  lastScoredAt: string | null
  isMe: boolean
}

export async function fetchClassroomLeaderboard(classroomId: string): Promise<LeaderboardRow[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('classroom_leaderboard', { p_classroom: classroomId })
  const err = rpcError(error)
  if (err) throw err
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.participant_id),
    nickname: String(r.nickname),
    totalPoints: Number(r.total_points),
    easyCompleted: Number(r.easy_completed),
    mediumCompleted: Number(r.medium_completed),
    hardCompleted: Number(r.hard_completed),
    lastScoredAt: (r.last_scored_at as string | null) ?? null,
    isMe: Boolean(r.is_me),
  }))
}

export async function fetchGlobalLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc('global_leaderboard', { p_limit: 50 })
  const err = rpcError(error)
  if (err) throw err
  return (data as Array<Record<string, unknown>>).map((r, i) => ({
    id: `${i}-${String(r.nickname)}`,
    nickname: String(r.nickname),
    classroomName: String(r.classroom_name),
    totalPoints: Number(r.total_points),
    easyCompleted: Number(r.easy_completed),
    mediumCompleted: Number(r.medium_completed),
    hardCompleted: Number(r.hard_completed),
    lastScoredAt: (r.last_scored_at as string | null) ?? null,
    isMe: Boolean(r.is_me),
  }))
}

export interface Classroom {
  id: string
  name: string
  join_code: string
  status: 'lobby' | 'running' | 'closed'
  enabled_difficulties: Difficulty[]
  duration_minutes: number
  rankings_hidden: boolean
  started_at: string | null
  ends_at: string | null
  closed_at: string | null
  created_at: string
}

export async function fetchClassroom(classroomId: string): Promise<Classroom | null> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.from('classrooms').select('*').eq('id', classroomId).maybeSingle()
  const err = rpcError(error)
  if (err) throw err
  return (data as Classroom | null) ?? null
}

/**
 * Calls `onChange` whenever classroom scores may have changed. Teachers get
 * Realtime pushes; students (who may only read their own row) fall back to polling.
 */
export function watchClassroom(classroomId: string, onChange: () => void, pollMs = 8000): () => void {
  let stopped = false
  let channel: { unsubscribe: () => void } | null = null
  const timer = setInterval(() => !stopped && onChange(), pollMs)
  getSupabase()
    .then((supabase) => {
      if (stopped) return
      channel = supabase
        .channel(`classroom-${classroomId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `classroom_id=eq.${classroomId}` }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'classrooms', filter: `id=eq.${classroomId}` }, () => onChange())
        .subscribe()
    })
    .catch(() => undefined)
  return () => {
    stopped = true
    clearInterval(timer)
    channel?.unsubscribe()
  }
}

// --- Teacher ----------------------------------------------------------------

export async function teacherSignIn(email: string, password: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new BackendError(error.message, true)
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase()
  await supabase.auth.signOut()
}

export async function currentTeacher(): Promise<{ email: string; isTeacher: boolean } | null> {
  const supabase = await getSupabase()
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user || user.is_anonymous) return null
  const { data: isTeacher } = await supabase.rpc('is_teacher')
  return { email: user.email ?? 'teacher', isTeacher: Boolean(isTeacher) }
}

export async function listMyClassrooms(): Promise<Classroom[]> {
  const supabase = await getSupabase()
  const { data: session } = await supabase.auth.getSession()
  const uid = session.session?.user.id
  if (!uid) return []
  const { data, error } = await supabase.from('classrooms').select('*').eq('owner_id', uid).order('created_at', { ascending: false })
  const err = rpcError(error)
  if (err) throw err
  return data as Classroom[]
}

async function teacherRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await getSupabase()
  const { data, error } = await supabase.rpc(fn, args)
  const err = rpcError(error)
  if (err) throw err
  return data as T
}

export const teacherApi = {
  create: (name: string, durationMinutes: number, difficulties: Difficulty[]) =>
    teacherRpc<Classroom>('create_classroom', { p_name: name, p_duration_minutes: durationMinutes, p_difficulties: difficulties }),
  update: (id: string, patch: { name?: string; durationMinutes?: number; difficulties?: Difficulty[]; rankingsHidden?: boolean }) =>
    teacherRpc<Classroom>('update_classroom', {
      p_classroom: id,
      p_name: patch.name ?? null,
      p_duration_minutes: patch.durationMinutes ?? null,
      p_difficulties: patch.difficulties ?? null,
      p_rankings_hidden: patch.rankingsHidden ?? null,
    }),
  start: (id: string) => teacherRpc<Classroom>('start_classroom', { p_classroom: id }),
  close: (id: string) => teacherRpc<Classroom>('close_classroom', { p_classroom: id }),
  reset: (id: string) => teacherRpc<void>('reset_classroom_scores', { p_classroom: id }),
  remove: (id: string) => teacherRpc<void>('delete_classroom', { p_classroom: id }),
  removeParticipant: (participantId: string) => teacherRpc<void>('remove_participant', { p_participant: participantId }),
  stats: (id: string) =>
    teacherRpc<
      Array<{
        challenge_id: string
        title: string
        difficulty: Difficulty
        concepts: string[]
        sort_order: number
        teams_attempted: number
        teams_completed: number
        total_attempts: number
        wrong_attempts: number
        hints_used: number
        avg_attempts_to_solve: number | null
      }>
    >('classroom_challenge_stats', { p_classroom: id }),
  completions: async (id: string) => {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('completions')
      .select('participant_id, challenge_id, points, attempts, hints_used, completed_at')
      .eq('classroom_id', id)
    const err = rpcError(error)
    if (err) throw err
    return data as Array<{ participant_id: string; challenge_id: string; points: number; attempts: number; hints_used: number; completed_at: string }>
  },
  participants: async (id: string) => {
    const supabase = await getSupabase()
    const { data, error } = await supabase
      .from('participants')
      .select('id, nickname, total_points, easy_completed, medium_completed, hard_completed, last_scored_at, last_active_at, joined_at')
      .eq('classroom_id', id)
    const err = rpcError(error)
    if (err) throw err
    return data as Array<{
      id: string
      nickname: string
      total_points: number
      easy_completed: number
      medium_completed: number
      hard_completed: number
      last_scored_at: string | null
      last_active_at: string
      joined_at: string
    }>
  },
}
