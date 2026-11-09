/**
 * Runs the Robot Lab with no browser: the student's config on the real scheduler,
 * the robot world, and the trigger poller. Used live (one loop per step) and by
 * mission checks (a scripted input timeline).
 *
 * Pure TypeScript: no DOM, React or three.js.
 */
import { CommandScheduler } from '../../simulation/scheduler.ts'
import type { SchedulerEvent } from '../../simulation/types.ts'
import { CYCLE_SECONDS } from '../../simulation/types.ts'
import { createTriggerPoller, type LabInput } from './bindings.ts'
import type { LabConfig } from './labCode.ts'
import type { Pose } from './pathplanner.ts'
import { buildLabScenario, TELEOP_START_POSE, type LabMode } from './scenario.ts'
import { RobotWorld } from './world.ts'

export function createLabSim(config: LabConfig, mode: LabMode, input: () => LabInput, startPose?: Pose) {
  const scenario = buildLabScenario(config, mode)
  const pose = startPose ?? (mode === 'teleop' ? TELEOP_START_POSE : undefined)
  const world = new RobotWorld({ passDrivetrain: config.passDrivetrain }, { teleop: config.teleop, input, startPose: pose })
  const poller = createTriggerPoller(config.bindings, input)
  const scheduler = new CommandScheduler(scenario, { world, pollTriggers: poller })
  return { scenario, scheduler, world, poller }
}

export interface LabSample {
  /** Seconds since enable, at the end of the loop. */
  t: number
  state: { pose: Pose; intakeOn: boolean; shooterOn: boolean; pushout: number; scored: number }
}

/** Runs `seconds` of the lab, reading `script(t)` as the controller each loop. Deterministic. */
export function runLab(config: LabConfig, mode: LabMode, script: (t: number) => LabInput, seconds: number, startPose?: Pose) {
  let t = 0
  const { scheduler, world } = createLabSim(config, mode, () => script(t), startPose)
  const samples: LabSample[] = []
  const loops = Math.round(seconds / CYCLE_SECONDS)
  for (let i = 0; i < loops && !scheduler.finished; i++) {
    t = i * CYCLE_SECONDS
    scheduler.step()
    const s = world.state
    samples.push({
      t: Math.round((i + 1) * CYCLE_SECONDS * 100) / 100,
      state: { pose: { ...s.pose }, intakeOn: s.intakeOn, shooterOn: s.shooterOn, pushout: s.pushout, scored: s.scored },
    })
  }
  const events: SchedulerEvent[] = scheduler.result().events
  return { world, samples, events }
}
