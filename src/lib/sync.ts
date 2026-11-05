/**
 * Flushes the offline outbox to the backend, in order, with retry and backoff.
 * Each submission carries a stable idempotency key, so retries after a network
 * failure can never double-count an attempt or award points twice.
 */
import type { OutboxItem } from '../types/app.ts'
import type { AppStore } from './appStore.ts'
import { BackendError, ensureStudentSession, recordHint, submitAnswer } from './backend.ts'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncDeps {
  submit: typeof submitAnswer
  hint: typeof recordHint
  session: typeof ensureStudentSession
}

const defaultDeps: SyncDeps = { submit: submitAnswer, hint: recordHint, session: ensureStudentSession }

export function backoffMs(tries: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.min(tries, 5))
}

/** Sends pending items for one profile, oldest first. Stops at the first retryable failure to keep order. */
export async function flushOutbox(store: AppStore, profileId: string, deps: SyncDeps = defaultDeps): Promise<SyncStatus> {
  const pending = store.outboxFor(profileId).filter((o) => !o.rejected)
  if (pending.length === 0) return 'idle'
  try {
    await deps.session()
  } catch {
    return 'offline'
  }
  for (const item of pending) {
    try {
      await send(item, deps, store)
    } catch (e) {
      const err = e instanceof BackendError ? e : new BackendError(e instanceof Error ? e.message : 'Network error', false)
      store.markOutboxFailed(item.key, err.message, err.permanent)
      if (!err.permanent) return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'
    }
  }
  return 'idle'
}

async function send(item: OutboxItem, deps: SyncDeps, store: AppStore) {
  if (item.type === 'hint') {
    await deps.hint(item.classroomId, item.challengeId, item.hintIndex)
    store.markOutboxDone(item.key)
    return
  }
  const res = await deps.submit({
    classroomId: item.classroomId,
    challengeId: item.challengeId,
    idempotencyKey: item.key,
    answer: item.answer,
  })
  // alreadyCompleted: the server scored this mission earlier; keep that confirmation.
  store.markOutboxDone(
    item.key,
    res.correct && !res.alreadyCompleted ? { challengeId: item.challengeId, points: res.pointsAwarded, correct: true } : undefined,
  )
}
