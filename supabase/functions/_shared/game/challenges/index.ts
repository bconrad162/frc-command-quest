import type { Challenge, Difficulty } from '../types.ts'
import { easyControls, hardControls, mediumControls } from './controls.ts'
import { easyChallenges } from './easy.ts'
import { hardChallenges } from './hard.ts'
import { mediumChallenges } from './medium.ts'

export const CHALLENGES: Challenge[] = [
  ...easyChallenges,
  ...easyControls,
  ...mediumChallenges,
  ...mediumControls,
  ...hardChallenges,
  ...hardControls,
]

export const CHALLENGES_BY_ID: Record<string, Challenge> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]))

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export function challengesFor(difficulty: Difficulty): Challenge[] {
  return CHALLENGES.filter((c) => c.difficulty === difficulty)
}

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES_BY_ID[id]
}

/** Bump when challenge content or grading changes in a way the server must know about. */
export const CONTENT_VERSION = 2
