/** Shared helpers for building challenge scenarios. */
import type { CommandDef, MechanismDef, Scenario } from '../../simulation/types.ts'

export const MECHANISMS: MechanismDef[] = [
  { id: 'drive', name: 'Drive' },
  { id: 'intake', name: 'Intake' },
  { id: 'arm', name: 'Arm' },
]

/** A command that does `cycles` loop iterations of `java` with a yield after each. */
export function loopCommand(
  id: string,
  name: string,
  mechanism: string,
  cycles: number,
  java: string,
  factory: string,
  priority?: number,
): CommandDef {
  return {
    id,
    name,
    requirements: [mechanism],
    priority,
    factory,
    body: [{ op: 'work', label: name, cycles, java }],
  }
}

export function scenario(commands: CommandDef[], events: Scenario['events'], maxCycles: number, extra: Partial<Scenario> = {}): Scenario {
  return { mechanisms: MECHANISMS, commands, events, maxCycles, ...extra }
}
