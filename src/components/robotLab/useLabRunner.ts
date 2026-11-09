/**
 * Runs the Robot Lab live: the student's deployed code on one CommandScheduler +
 * RobotWorld, stepped at the real 50 Hz loop rate (scaled by a speed setting) from
 * animation frames, reading the live controller each loop.
 */
import { useCallback, useRef, useState } from 'react'
import { NO_INPUT, type LabInput } from '../../game/robotLab/bindings.ts'
import type { LabConfig } from '../../game/robotLab/labCode.ts'
import { createLabSim } from '../../game/robotLab/labSim.ts'
import type { Pose } from '../../game/robotLab/pathplanner.ts'
import type { LabMode } from '../../game/robotLab/scenario.ts'
import type { RobotState } from '../../game/robotLab/world.ts'
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
  readonly config: LabConfig
  readonly mode: LabMode
  /** The robot is enabled and the scheduler is stepping. */
  readonly enabled: boolean
  /** The period (auto 20 s, teleop 2:15) reached its last loop. */
  readonly finished: boolean
  /** The controller as of now; read once per loop. */
  input: LabInput
  /** New code: a fresh robot, disabled (like deploying to a real robot). */
  deploy(config: LabConfig): void
  /** Autonomous or teleop: a fresh robot, disabled. */
  setMode(mode: LabMode): void
  /**
   * Start stepping. Autonomous starts the auto over (autonomousInit schedules it
   * again); so does a period that had ended. Triggers re-seed: a button held
   * through Enable doesn't count as a press.
   */
  enable(): void
  /**
   * Stop stepping and cancel every command that requires a mechanism, as a real
   * robot does on disable (Mechanism.controllableDuringDisabled() is false by
   * default). The robot stays where it is.
   */
  disable(): void
  /** A fresh robot, disabled. */
  reset(): void
  /** Robot start pose for every rebuild (missions place the robot). */
  setStartPose(pose: Pose | undefined): void
  setSpeed(s: LabSpeed): void
  /** Advances by one animation frame of `dtSeconds`; returns loops run. */
  advanceFrame(dtSeconds: number): number
  /** Test hook: runs exactly `seconds / 0.02` loops while enabled (until the period ends). */
  advance(seconds: number): void
}

export function createLabRunner(initialConfig: LabConfig, initialMode: LabMode, initialPose?: Pose): LabRunner {
  let config = initialConfig
  let mode = initialMode
  let startPose = initialPose
  let input: LabInput = NO_INPUT
  const readInput = () => input
  let sim = createLabSim(config, mode, readInput, startPose)
  let snapshot: CycleSnapshot | null = null
  let enabled = false
  let speed: LabSpeed = 1
  let backlog = 0

  const rebuild = () => {
    sim = createLabSim(config, mode, readInput, startPose)
    snapshot = null
    backlog = 0
    enabled = false
  }
  const stepOnce = () => {
    if (!enabled || sim.scheduler.finished) {
      enabled = false
      return false
    }
    snapshot = sim.scheduler.step()
    if (sim.scheduler.finished) enabled = false
    return true
  }

  return {
    get state() {
      return sim.world.state
    },
    get snapshot() {
      return snapshot
    },
    get events() {
      return sim.scheduler.result().events
    },
    get scenario() {
      return sim.scenario
    },
    get config() {
      return config
    },
    get mode() {
      return mode
    },
    get enabled() {
      return enabled
    },
    get finished() {
      return sim.scheduler.finished
    },
    get input() {
      return input
    },
    set input(v: LabInput) {
      input = v
    },
    deploy(c) {
      config = c
      rebuild()
    },
    setMode(m) {
      mode = m
      rebuild()
    },
    enable() {
      if (sim.scheduler.finished || (mode === 'auto' && sim.scheduler.cycle > 0)) rebuild()
      sim.poller.reseed()
      enabled = true
    },
    disable() {
      enabled = false
      for (const id of snapshot?.running ?? []) {
        const cmd = sim.scenario.commands.find((c) => c.id === id)
        if (cmd && cmd.requirements.length > 0 && sim.scheduler.isRunning(id)) sim.scheduler.cancel(id)
      }
    },
    reset: rebuild,
    setStartPose(pose) {
      startPose = pose
      rebuild()
    },
    setSpeed(s) {
      speed = s
    },
    advanceFrame(dt) {
      if (!enabled) return 0
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
export function useLabRunner(config: LabConfig, mode: LabMode): { runner: LabRunner; version: number; refresh: () => void } {
  const ref = useRef<LabRunner | null>(null)
  if (!ref.current) ref.current = createLabRunner(config, mode)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  return { runner: ref.current, version, refresh }
}
