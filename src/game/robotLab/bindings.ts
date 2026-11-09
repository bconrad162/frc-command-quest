/**
 * Controller input for the Robot Lab and the trigger bindings that read it.
 * Edge semantics follow docs/commands-v3-behavior.md ("Controllers and trigger
 * bindings"): onTrue on the rising edge, onFalse on the falling edge, whileTrue
 * schedules on the rising edge and cancels on the falling edge, toggleOnTrue
 * schedules on a rising edge or cancels if it is still running.
 *
 * Pure TypeScript: no DOM, React or three.js.
 */
import type { ControlId } from '../controller.ts'
import type { CommandScheduler } from '../../simulation/scheduler.ts'
import { LAB_COMMANDS, type LabBinding } from './labCode.ts'

/** One poll of an Xbox controller. Stick axes are -1..1 (Y is positive when pulled back); triggers 0..1. */
export interface LabInput {
  leftX: number
  leftY: number
  rightX: number
  rightY: number
  leftTrigger: number
  rightTrigger: number
  /** Buttons held down (not the triggers or sticks). */
  buttons: ReadonlySet<ControlId>
}

export const NO_INPUT: LabInput = { leftX: 0, leftY: 0, rightX: 0, rightY: 0, leftTrigger: 0, rightTrigger: 0, buttons: new Set() }

/** leftTrigger() and rightTrigger() are true above 0.5 (CommandXboxController's default threshold). */
export function isPressed(input: LabInput, control: ControlId): boolean {
  if (control === 'leftTrigger') return input.leftTrigger > 0.5
  if (control === 'rightTrigger') return input.rightTrigger > 0.5
  return input.buttons.has(control)
}

/**
 * Returns a scheduler pollTriggers hook for `bindings`. The first poll only records
 * each trigger's state, so a button already held when the robot is enabled is not
 * a rising edge.
 */
export interface TriggerPoller {
  (s: CommandScheduler): void
  /** The next poll only records each trigger's state again (after the robot was disabled). */
  reseed(): void
}

export function createTriggerPoller(bindings: readonly LabBinding[], input: () => LabInput): TriggerPoller {
  let previous: boolean[] | null = null
  const poll = (s: CommandScheduler) => {
    const now = input()
    const current = bindings.map((b) => isPressed(now, b.control))
    const before = previous
    previous = current
    if (!before) return
    bindings.forEach((b, i) => {
      const rising = current[i] && !before[i]
      const falling = !current[i] && before[i]
      const id = LAB_COMMANDS[b.command].id
      switch (b.kind) {
        case 'onTrue':
          if (rising) s.scheduleExternal(id)
          break
        case 'onFalse':
          if (falling) s.scheduleExternal(id)
          break
        case 'whileTrue':
          if (rising) s.scheduleExternal(id)
          if (falling) s.cancel(id)
          break
        case 'toggleOnTrue':
          if (rising) {
            if (s.isRunning(id)) s.cancel(id)
            else s.scheduleExternal(id)
          }
          break
      }
    })
  }
  return Object.assign(poll, {
    reseed() {
      previous = null
    },
  })
}
