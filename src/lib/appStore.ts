/**
 * Local game state: team profiles, progress, practice, settings, and the offline
 * submission outbox. Persisted to localStorage on every change so refreshes never
 * lose progress. Framework-agnostic (React binds via useSyncExternalStore).
 */
import { getChallenge } from '../game/challenges/index.ts'
import { applyAttempt, applyHint, applySkip, emptyProgress, progressFor, type AttemptOutcome } from '../game/progress.ts'
import type { Answer, GradeResult } from '../game/types.ts'
import type { AppState, ClassroomLink, OutboxItem, Settings, TeamProfile } from '../types/app.ts'
import { readJson, uuid, writeJson } from './storage.ts'

export const STORAGE_KEY = 'command-quest:v1'
export const NICKNAME_PATTERN = /^[A-Za-z0-9 _\-.!']{2,24}$/

function initialState(): AppState {
  return {
    version: 1,
    profiles: [],
    activeProfileId: null,
    practice: {},
    outbox: [],
    settings: { sound: false, reducedMotion: false },
  }
}

export function loadState(): AppState {
  const saved = readJson<AppState>(STORAGE_KEY)
  if (!saved || saved.version !== 1) return initialState()
  const base = initialState()
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...saved.settings },
    profiles: (saved.profiles ?? []).map((p) => ({ ...p, progress: p.progress ?? {}, confirmed: p.confirmed ?? {} })),
    outbox: saved.outbox ?? [],
    practice: saved.practice ?? {},
  }
}

export function validateNickname(raw: string): string | null {
  const nickname = raw.trim().replace(/\s+/g, ' ')
  if (nickname.length < 2) return 'Use at least 2 characters.'
  if (nickname.length > 24) return 'Use 24 characters or fewer.'
  if (!NICKNAME_PATTERN.test(nickname)) return "Use letters, numbers, spaces, and _ - . ! ' only."
  return null
}

type Listener = () => void

export class AppStore {
  private state: AppState
  private listeners = new Set<Listener>()

  constructor(state: AppState = loadState()) {
    this.state = state
  }

  getState = (): AppState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(next: AppState) {
    this.state = next
    writeJson(STORAGE_KEY, next)
    for (const l of this.listeners) l()
  }

  private updateProfile(id: string, fn: (p: TeamProfile) => TeamProfile) {
    this.set({ ...this.state, profiles: this.state.profiles.map((p) => (p.id === id ? fn(p) : p)) })
  }

  get activeProfile(): TeamProfile | undefined {
    return this.state.profiles.find((p) => p.id === this.state.activeProfileId)
  }

  createProfile(nickname: string, classroom?: ClassroomLink): TeamProfile {
    const clean = nickname.trim().replace(/\s+/g, ' ')
    const profile: TeamProfile = {
      id: uuid(),
      nickname: clean,
      createdAt: new Date().toISOString(),
      classroom,
      progress: {},
      confirmed: {},
    }
    this.set({ ...this.state, profiles: [...this.state.profiles, profile], activeProfileId: profile.id })
    return profile
  }

  switchProfile(id: string | null) {
    this.set({ ...this.state, activeProfileId: id })
  }

  removeProfile(id: string) {
    this.set({
      ...this.state,
      profiles: this.state.profiles.filter((p) => p.id !== id),
      outbox: this.state.outbox.filter((o) => o.profileId !== id),
      activeProfileId: this.state.activeProfileId === id ? null : this.state.activeProfileId,
    })
  }

  /** Records a graded competition attempt; queues it for the server when in a classroom. */
  recordAttempt(challengeId: string, grade: GradeResult, answer: Answer): AttemptOutcome | null {
    const profile = this.activeProfile
    const challenge = getChallenge(challengeId)
    if (!profile || !challenge) return null
    const outcome = applyAttempt(challenge, progressFor(profile.progress, challengeId), grade, answer)
    let outbox = this.state.outbox
    if (profile.classroom && !grade.invalid && !progressFor(profile.progress, challengeId).completed) {
      outbox = [
        ...outbox,
        {
          key: uuid(),
          type: 'submit',
          profileId: profile.id,
          classroomId: profile.classroom.id,
          challengeId,
          answer,
          createdAt: new Date().toISOString(),
          tries: 0,
        },
      ]
    }
    this.set({
      ...this.state,
      outbox,
      profiles: this.state.profiles.map((p) =>
        p.id === profile.id ? { ...p, progress: { ...p.progress, [challengeId]: outcome.progress } } : p,
      ),
    })
    return outcome
  }

  recordHint(challengeId: string, hintIndex: number) {
    const profile = this.activeProfile
    if (!profile) return
    const current = progressFor(profile.progress, challengeId)
    if (current.completed || hintIndex < current.hintsUsed) return
    const outbox: OutboxItem[] = profile.classroom
      ? [
          ...this.state.outbox,
          {
            key: uuid(),
            type: 'hint',
            profileId: profile.id,
            classroomId: profile.classroom.id,
            challengeId,
            hintIndex,
            createdAt: new Date().toISOString(),
            tries: 0,
          },
        ]
      : this.state.outbox
    this.set({
      ...this.state,
      outbox,
      profiles: this.state.profiles.map((p) =>
        p.id === profile.id ? { ...p, progress: { ...p.progress, [challengeId]: applyHint(current, hintIndex) } } : p,
      ),
    })
  }

  skip(challengeId: string) {
    const profile = this.activeProfile
    if (!profile) return
    this.updateProfile(profile.id, (p) => ({
      ...p,
      progress: { ...p.progress, [challengeId]: applySkip(progressFor(p.progress, challengeId)) },
    }))
  }

  recordPractice(challengeId: string, grade: GradeResult, answer: Answer) {
    const challenge = getChallenge(challengeId)
    if (!challenge) return null
    // Practice keeps its own progress so replays never touch competition scores.
    const current = this.state.practice[challengeId] ?? emptyProgress()
    const outcome = applyAttempt(challenge, current.completed ? { ...current, completed: false } : current, grade, answer)
    this.set({ ...this.state, practice: { ...this.state.practice, [challengeId]: outcome.progress } })
    return outcome
  }

  resetPractice() {
    this.set({ ...this.state, practice: {} })
  }

  // --- outbox ---------------------------------------------------------------

  outboxFor(profileId: string): OutboxItem[] {
    return this.state.outbox.filter((o) => o.profileId === profileId)
  }

  markOutboxDone(key: string, confirmation?: { challengeId: string; points: number; correct: boolean }) {
    const item = this.state.outbox.find((o) => o.key === key)
    const outbox = this.state.outbox.filter((o) => o.key !== key)
    let profiles = this.state.profiles
    if (item && confirmation) {
      profiles = profiles.map((p) =>
        p.id === item.profileId
          ? {
              ...p,
              confirmed: {
                ...p.confirmed,
                [confirmation.challengeId]: { points: confirmation.points, correct: confirmation.correct, at: new Date().toISOString() },
              },
            }
          : p,
      )
    }
    this.set({ ...this.state, outbox, profiles })
  }

  markOutboxFailed(key: string, error: string, permanent: boolean) {
    this.set({
      ...this.state,
      outbox: this.state.outbox.map((o) =>
        o.key === key ? { ...o, tries: o.tries + 1, lastError: error, rejected: permanent ? error : undefined } : o,
      ),
    })
  }

  dismissRejected(profileId: string) {
    this.set({ ...this.state, outbox: this.state.outbox.filter((o) => !(o.profileId === profileId && o.rejected)) })
  }

  updateSettings(patch: Partial<Settings>) {
    this.set({ ...this.state, settings: { ...this.state.settings, ...patch } })
  }

  setClassroom(profileId: string, classroom: ClassroomLink | undefined) {
    this.updateProfile(profileId, (p) => ({ ...p, classroom }))
  }
}

export const appStore = new AppStore()
