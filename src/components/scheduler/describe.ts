import type { CommandCycleStatus, Scenario, SchedulerEvent } from '../../simulation/types.ts'
import { HIGHEST_PRIORITY, LOWEST_PRIORITY } from '../../simulation/types.ts'

export function commandName(scenario: Scenario, id: string | undefined): string {
  if (!id) return ''
  return scenario.commands.find((c) => c.id === id)?.name ?? id
}

export function priorityLabel(p: number | undefined): string {
  if (p === undefined) return '0'
  if (p === LOWEST_PRIORITY) return 'LOWEST'
  if (p === HIGHEST_PRIORITY) return 'HIGHEST'
  return String(p)
}

/** Plain-language description of a scheduler event. */
export function describeEvent(scenario: Scenario, e: SchedulerEvent): string {
  const name = commandName(scenario, e.command)
  switch (e.type) {
    case 'Scheduled':
      return `${name} was scheduled`
    case 'Mounted':
      return `${name} mounted`
    case 'Yielded':
      return `${name} yielded`
    case 'Completed':
      return `${name} completed and released its mechanisms`
    case 'Interrupted':
      return `${name} was interrupted by ${commandName(scenario, e.interrupter)}`
    case 'Canceled':
      return `${name} was canceled`
    case 'ForkFailure':
      return `${name} could not fork ${e.text ?? 'a child'} (lost to ${commandName(scenario, e.blocker)}), so its composition was canceled`
    case 'ScheduleRejected':
      return `schedule(${name}) failed: lower priority than ${commandName(scenario, e.blocker)} (${e.reason})`
    case 'AlreadyRunning':
      return `${name} is already running, so scheduling it again had no effect`
    case 'Log':
      return name ? `${name} printed "${e.text}"` : (e.text ?? '')
  }
}

export const STATUS_LABEL: Record<CommandCycleStatus, string> = {
  idle: 'Not running',
  pending: 'Pending',
  running: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  canceled: 'Canceled',
  interrupted: 'Interrupted',
  rejected: 'Rejected',
}

/** Tailwind classes for timeline cells and status pills. */
export const STATUS_STYLE: Record<CommandCycleStatus, { cell: string; pill: string }> = {
  idle: { cell: 'bg-transparent', pill: 'text-ink-faint border-steel' },
  pending: { cell: 'bg-tier-medium/50', pill: 'text-tier-medium border-tier-medium/40 bg-tier-medium/10' },
  running: { cell: 'bg-signal', pill: 'text-signal border-signal/40 bg-signal/10' },
  waiting: {
    cell: 'bg-[repeating-linear-gradient(135deg,var(--color-steel-bright)_0_3px,transparent_3px_6px)] ring-1 ring-inset ring-steel-bright',
    pill: 'text-ink-muted border-steel-bright bg-pit-raised',
  },
  completed: { cell: 'bg-go', pill: 'text-go border-go/40 bg-go/10' },
  canceled: { cell: 'bg-fault', pill: 'text-fault border-fault/40 bg-fault/10' },
  interrupted: { cell: 'bg-warn', pill: 'text-warn border-warn/40 bg-warn/10' },
  rejected: { cell: 'ring-2 ring-inset ring-fault', pill: 'text-fault border-fault/40 bg-transparent' },
}

export const EVENT_TONE: Partial<Record<SchedulerEvent['type'], string>> = {
  Completed: 'text-go',
  Interrupted: 'text-warn',
  Canceled: 'text-fault',
  ForkFailure: 'text-fault',
  ScheduleRejected: 'text-fault',
  Scheduled: 'text-signal',
  AlreadyRunning: 'text-ink-muted',
  Log: 'text-ink',
}
