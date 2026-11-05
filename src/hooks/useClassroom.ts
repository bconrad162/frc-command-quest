import { useCallback, useEffect, useState } from 'react'
import { fetchClassroom, watchClassroom, type Classroom } from '../lib/backend.ts'
import { isBackendConfigured } from '../lib/supabase.ts'

export type CompetitionPhase = 'local' | 'loading' | 'lobby' | 'running' | 'ended' | 'unavailable'

export function competitionPhase(classroom: Classroom | null, now: number): Exclude<CompetitionPhase, 'local' | 'loading' | 'unavailable'> {
  if (!classroom || classroom.status === 'lobby') return 'lobby'
  if (classroom.status === 'closed') return 'ended'
  if (classroom.ends_at && now > new Date(classroom.ends_at).getTime()) return 'ended'
  return 'running'
}

/** Live classroom status for a joined team. Polls and listens for Realtime updates. */
export function useClassroom(classroomId: string | undefined) {
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [loading, setLoading] = useState(Boolean(classroomId && isBackendConfigured))
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!classroomId || !isBackendConfigured) return
    try {
      setClassroom(await fetchClassroom(classroomId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the classroom server')
    } finally {
      setLoading(false)
    }
  }, [classroomId])

  useEffect(() => {
    if (!classroomId || !isBackendConfigured) return
    void refresh()
    return watchClassroom(classroomId, () => void refresh(), 10_000)
  }, [classroomId, refresh])

  return { classroom, loading, error, refresh }
}
