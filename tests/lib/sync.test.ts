import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStore, loadState, STORAGE_KEY, validateNickname } from '../../src/lib/appStore.ts'
import { BackendError } from '../../src/lib/backend.ts'
import { flushOutbox, type SyncDeps } from '../../src/lib/sync.ts'

// Minimal localStorage for the node test environment.
class MemoryStorage {
  private data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  clear() {
    this.data.clear()
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
})

const correct = { correct: true, feedback: 'ok' }
const wrong = { correct: false, feedback: 'no' }
const answer = { kind: 'predict-output' as const, text: 'Battery: 80%\nMotors: 41' }
const classroom = { id: '11111111-1111-4111-8111-111111111111', code: 'K7PQ2M', name: 'Room', participantId: 'p' }

function freshStore() {
  return new AppStore(loadState())
}

describe('local persistence', () => {
  it('persists progress across a reload', () => {
    const store = freshStore()
    store.createProfile('Swerve Wizards')
    store.recordAttempt('easy-1-battery-math', correct, answer)
    const reloaded = new AppStore(loadState())
    expect(reloaded.activeProfile?.nickname).toBe('Swerve Wizards')
    expect(reloaded.activeProfile?.progress['easy-1-battery-math'].completed).toBe(true)
    expect(reloaded.activeProfile?.progress['easy-1-battery-math'].points).toBe(135)
  })

  it('survives corrupted storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadState().profiles).toEqual([])
  })

  it('keeps practice separate from competition progress', () => {
    const store = freshStore()
    store.createProfile('Team')
    store.recordPractice('easy-1-battery-math', correct, answer)
    expect(store.activeProfile?.progress['easy-1-battery-math']).toBeUndefined()
    expect(store.getState().practice['easy-1-battery-math'].completed).toBe(true)
  })

  it('validates nicknames without collecting personal data', () => {
    expect(validateNickname('A')).toMatch(/at least 2/)
    expect(validateNickname('Robo<script>')).toMatch(/letters/)
    expect(validateNickname('  Brownout   Bandits ')).toBeNull()
  })
})

describe('classroom outbox', () => {
  it('queues attempts and hints for classroom teams only', () => {
    const store = freshStore()
    store.createProfile('Local')
    store.recordAttempt('easy-1-battery-math', wrong, answer)
    expect(store.getState().outbox).toHaveLength(0)
    store.createProfile('Room Team', classroom)
    store.recordHint('easy-1-battery-math', 0)
    store.recordAttempt('easy-1-battery-math', correct, answer)
    expect(store.getState().outbox.map((o) => o.type)).toEqual(['hint', 'submit'])
  })

  it('does not queue replays of completed missions', () => {
    const store = freshStore()
    store.createProfile('Room Team', classroom)
    store.recordAttempt('easy-1-battery-math', correct, answer)
    store.recordAttempt('easy-1-battery-math', correct, answer)
    expect(store.getState().outbox).toHaveLength(1)
  })

  it('sends in order with a stable idempotency key and clears on success', async () => {
    const store = freshStore()
    const profile = store.createProfile('Room Team', classroom)
    store.recordAttempt('easy-1-battery-math', wrong, { kind: 'predict-output', text: 'x' })
    store.recordAttempt('easy-1-battery-math', correct, answer)
    const keys = store.getState().outbox.map((o) => o.key)
    const calls: string[] = []
    const deps: SyncDeps = {
      session: async () => 'user',
      hint: vi.fn(),
      submit: vi.fn(async (input) => {
        calls.push(input.idempotencyKey)
        return input.idempotencyKey === keys[1] ? { correct: true, pointsAwarded: 120 } : { correct: false, pointsAwarded: 0 }
      }),
    }
    expect(await flushOutbox(store, profile.id, deps)).toBe('idle')
    expect(calls).toEqual(keys)
    expect(store.getState().outbox).toHaveLength(0)
    expect(store.activeProfile?.confirmed['easy-1-battery-math'].points).toBe(120)
  })

  it('keeps items after a network failure and retries with the SAME key (no duplicates)', async () => {
    const store = freshStore()
    const profile = store.createProfile('Room Team', classroom)
    store.recordAttempt('easy-1-battery-math', correct, answer)
    const key = store.getState().outbox[0].key
    const seen: string[] = []
    let fail = true
    const deps: SyncDeps = {
      session: async () => 'user',
      hint: vi.fn(),
      submit: vi.fn(async (input) => {
        seen.push(input.idempotencyKey)
        if (fail) throw new TypeError('Failed to fetch')
        return { correct: true, pointsAwarded: 135 }
      }),
    }
    expect(await flushOutbox(store, profile.id, deps)).not.toBe('idle')
    expect(store.getState().outbox).toHaveLength(1)
    expect(store.getState().outbox[0].tries).toBe(1)
    fail = false
    expect(await flushOutbox(store, profile.id, deps)).toBe('idle')
    expect(seen).toEqual([key, key])
    expect(store.getState().outbox).toHaveLength(0)
  })

  it('stops at the first retryable failure to preserve attempt order', async () => {
    const store = freshStore()
    const profile = store.createProfile('Room Team', classroom)
    store.recordAttempt('easy-1-battery-math', wrong, { kind: 'predict-output', text: 'x' })
    store.recordAttempt('easy-1-battery-math', correct, answer)
    const submit = vi.fn(async () => {
      throw new BackendError('Too many answers', false, 429)
    })
    await flushOutbox(store, profile.id, { session: async () => 'u', hint: vi.fn(), submit })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(store.getState().outbox).toHaveLength(2)
  })

  it('marks permanent rejections and moves on', async () => {
    const store = freshStore()
    const profile = store.createProfile('Room Team', classroom)
    store.recordAttempt('easy-1-battery-math', correct, answer)
    const deps: SyncDeps = {
      session: async () => 'u',
      hint: vi.fn(),
      submit: vi.fn(async () => {
        throw new BackendError('The competition is over', true, 409)
      }),
    }
    expect(await flushOutbox(store, profile.id, deps)).toBe('idle')
    expect(store.getState().outbox[0].rejected).toMatch(/over/)
    store.dismissRejected(profile.id)
    expect(store.getState().outbox).toHaveLength(0)
  })

  it('reports offline when no session can be created', async () => {
    const store = freshStore()
    const profile = store.createProfile('Room Team', classroom)
    store.recordAttempt('easy-1-battery-math', correct, answer)
    const status = await flushOutbox(store, profile.id, {
      session: async () => {
        throw new Error('offline')
      },
      hint: vi.fn(),
      submit: vi.fn(),
    })
    expect(status).toBe('offline')
    expect(store.getState().outbox).toHaveLength(1)
  })
})
