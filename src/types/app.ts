import type { ProgressMap } from '../game/progress.ts'
import type { Answer } from '../game/types.ts'

export interface ClassroomLink {
  id: string
  code: string
  name: string
  participantId: string
}

/** A team playing on this device. Only a nickname is stored: no names or emails. */
export interface TeamProfile {
  id: string
  nickname: string
  createdAt: string
  classroom?: ClassroomLink
  /** Competition progress (scored). */
  progress: ProgressMap
  /** Server-confirmed points per challenge (classroom mode). */
  confirmed: Record<string, { points: number; correct: boolean; at: string }>
}

export type OutboxItem =
  | {
      key: string
      type: 'submit'
      profileId: string
      classroomId: string
      challengeId: string
      answer: Answer
      createdAt: string
      tries: number
      lastError?: string
      /** Permanently rejected by the server (e.g. competition closed). */
      rejected?: string
    }
  | {
      key: string
      type: 'hint'
      profileId: string
      classroomId: string
      challengeId: string
      hintIndex: number
      createdAt: string
      tries: number
      lastError?: string
      rejected?: string
    }

export interface Settings {
  sound: boolean
  reducedMotion: boolean
}

export interface AppState {
  version: 1
  profiles: TeamProfile[]
  activeProfileId: string | null
  /** Practice progress is per device and never scored. */
  practice: ProgressMap
  outbox: OutboxItem[]
  settings: Settings
}
