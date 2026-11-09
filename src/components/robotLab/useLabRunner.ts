/**
 * Runs the Robot Lab live: one CommandScheduler + RobotWorld, stepped at the
 * real 50 Hz loop rate (scaled by a speed setting) from animation frames.
 */
import { useCallback, useRef, useState } from 'react'
import { buildAutoScenario, type LabSetup } from '../../game/robotLab/scenario.ts'
import { RobotWorld, type RobotState } from '../../game/robotLab/world.ts'
import { CommandScheduler } from '../../simulation/scheduler.ts'
import type { CycleSnapshot, Scenario, SchedulerEvent } from '../../simulation/types.ts'
import { CYCLE_SECONDS } from '../../simulation/types.ts'

/** Most loops one animation frame may run; a hidden tab or a long frame drops the backlog. */
export const MAX_LOOPS_PER_FRAME = 5

export type LabSpeed = 1 | 0.5 | 0.25

export interface LabRunner {
  readonly state: RobotState
  readonly snapshot: CycleSnapshot | null
  readonly events: SchedulerEvent[]
  readonly scenario: Scenario
  /** Stepping (Run pressed and the auto period not over). */
  readonly running: boolean
  /** The scenario reached its last loop. */
  readonly finished: boolean
  setup: LabSetup
  /** New scheduler and world from `setup`, then start stepping. */
  run(): void
  /** New scheduler and world from `setup`, not stepping. */
  reset(): void
  setSpeed(s: LabSpeed): void
  /** Advances by one animation frame of `dtSeconds`; returns loops run. */
  advanceFrame(dtSeconds: number): number
  /** Test hook: runs exactly `seconds / 0.02` loops (until the scenario ends). */
  advance(seconds: number): void
}

export function createLabRunner(initial: LabSetup): LabRunner {
  let setup = initial
  let scenario = buildAutoScenario(setup)
  let world = new RobotWorld(setup)
  let scheduler = new CommandScheduler(scenario, { world })
  let snapshot: CycleSnapshot | null = null
  let stepping = false
  let speed: LabSpeed = 1
  let backlog = 0

  const rebuild = () => {
    scenario = buildAutoScenario(setup)
    world = new RobotWorld(setup)
    scheduler = new CommandScheduler(scenario, { world })
    snapshot = null
    backlog = 0
  }
  const stepOnce = () => {
    if (scheduler.finished) {
      stepping = false
      return false
    }
    snapshot = scheduler.step()
    if (scheduler.finished) stepping = false
    return true
  }

  return {
    get state() {
      return world.state
    },
    get snapshot() {
      return snapshot
    },
    get events() {
      return scheduler.result().events
    },
    get scenario() {
      return scenario
    },
    get running() {
      return stepping
    },
    get finished() {
      return scheduler.finished
    },
    get setup() {
      return setup
    },
    set setup(s: LabSetup) {
      setup = s
    },
    run() {
      rebuild()
      stepping = true
    },
    reset() {
      rebuild()
      stepping = false
    },
    setSpeed(s) {
      speed = s
    },
    advanceFrame(dt) {
      if (!stepping) return 0
      backlog += dt * speed
      let loops = Math.floor(backlog / CYCLE_SECONDS + 1e-9)
      if (loops > MAX_LOOPS_PER_FRAME) {
        loops = MAX_LOOPS_PER_FRAME
        backlog = 0
      } else {
        backlog -= loops * CYCLE_SECONDS
      }
      let ran = 0
      for (let i = 0; i < loops && stepOnce(); i++) ran++
      return ran
    },
    advance(seconds) {
      for (let i = 0; i < Math.round(seconds / CYCLE_SECONDS); i++) if (!stepOnce()) break
    },
  }
}

/** Keeps one runner for the page and re-renders React when it changes. */
export function useLabRunner(initial: LabSetup): { runner: LabRunner; version: number; refresh: () => void } {
  const ref = useRef<LabRunner | null>(null)
  if (!ref.current) ref.current = createLabRunner(initial)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  return { runner: ref.current, version, refresh }
}
