/**
 * Team 5829's auto #7 ("Straight Back Depot") as a Commands v3 scenario for the
 * existing scheduler model. Behavior follows docs/commands-v3-behavior.md
 * ("Sequences" and "PathPlanner (Commands v3 community build)"):
 *
 * - PathPlannerAuto is a sequence: it requires the union of its children's
 *   requirements for the whole run and awaits each child in turn.
 * - FollowPathCommand requires exactly the drive requirements given to
 *   AutoBuilder.configure(...). It forks an events command (no requirements),
 *   which forks each event-marker command; all of them end with the path.
 * - Forgetting the drivetrain in configure(...) leaves every path command
 *   requiring nothing, so TeleopDrive (the default command) keeps the drivetrain.
 *
 * Pure TypeScript: no DOM, React or three.js.
 */
import type { CommandDef, CoroutineStep, Scenario } from '../../simulation/types.ts'
import { CYCLE_SECONDS, LOWEST_PRIORITY } from '../../simulation/types.ts'
import type { Pose, Trajectory } from './pathplanner.ts'
import { TEAM_PATHS } from './pathplanner.ts'

export const LAB_MECHANISMS = ['drivetrain', 'pushout', 'intake', 'shooter'] as const
export type LabMechanism = (typeof LAB_MECHANISMS)[number]

export interface LabSetup {
  /** Whether AutoBuilder.configure(...) was given `drivetrain` as its drive requirement. */
  passDrivetrain: boolean
}

export const AUTO_NAME = '#7 - Straight Back Depot'
export const AUTO_ID = 'auto'
export const TELEOP_ID = 'teleopDrive'
export const pathId = (name: string) => `path:${name}`
export const pathEventsId = (name: string) => `pathEvents:${name}`
/** Wrapper that runs a zoned event command until its zone ends. */
export const zoneId = (path: string, event: string) => `zone:${path}:${event}`
/** Work label a path command reports while it is following its trajectory. */
export const followLabel = (name: string) => `follow:${name}`
export const SHOOT_IDS = ['shootPreload', 'controlAllShooting'] as const
export const EVENT_IDS = { extend: 'extend', intake: 'intake' } as const
export const HOPPER_EMPTY = 'hopperEmpty'
/** Cycles a shoot command spins its flywheels before feeding. */
export const SPIN_UP_CYCLES = 25

/** Auto #7's paths and named commands, in order. */
export const AUTO_STEPS = [
  { kind: 'path', name: 'Straight Back' },
  { kind: 'named', id: 'shootPreload', name: 'Shoot Preload' },
  { kind: 'path', name: 'Depot and shoot from Hub Shoot' },
  { kind: 'named', id: 'controlAllShooting', name: 'Control All Shooting' },
] as const

const FIRST_PATH = TEAM_PATHS['Straight Back']
const start = FIRST_PATH.sample(0)
export const START_POSE: Pose = { x: start.x, y: start.y, theta: start.theta }

const cycles = (seconds: number) => Math.round(seconds / CYCLE_SECONDS)

function pathCommands(traj: Trajectory, passDrivetrain: boolean): CommandDef[] {
  // Zoned markers: PathPlanner schedules the command at the zone start and cancels
  // it at the zone end (PathPlannerTrajectory adds a CancelCommandEvent). Modeled as
  // a wrapper that forks the event command and finishes when the zone ends, which
  // cancels its child.
  const zones: CommandDef[] = []
  const eventsBody: CoroutineStep[] = []
  let at = 0
  for (const event of traj.events) {
    const wait = cycles(event.time) - at
    if (wait > 0) eventsBody.push({ op: 'work', label: 'events', cycles: wait })
    at += Math.max(0, wait)
    if (event.endTime === undefined) {
      eventsBody.push({ op: 'fork', commands: [event.name] })
      continue
    }
    const id = zoneId(traj.name, event.name)
    zones.push({
      id,
      name: `"${event.name}" zone`,
      requirements: [],
      body: [
        { op: 'fork', commands: [event.name] },
        { op: 'work', label: 'zone', cycles: Math.max(1, cycles(event.endTime) - cycles(event.time)) },
      ],
    })
    eventsBody.push({ op: 'fork', commands: [id] })
  }
  eventsBody.push({ op: 'park' })
  return [
    ...zones,
    {
      id: pathId(traj.name),
      name: `FollowPathCommand("${traj.name}")`,
      requirements: passDrivetrain ? ['drivetrain'] : [],
      factory: `AutoBuilder.followPath(PathPlannerPath.fromPathFile("${traj.name}"))`,
      body: [
        { op: 'fork', commands: [pathEventsId(traj.name)] },
        { op: 'work', label: followLabel(traj.name), cycles: Math.max(1, cycles(traj.totalTime)) },
      ],
    },
    {
      id: pathEventsId(traj.name),
      name: `Path events ("${traj.name}")`,
      requirements: [],
      body: eventsBody,
    },
  ]
}

export function buildAutoScenario(setup: LabSetup): Scenario {
  const paths = AUTO_STEPS.filter((s) => s.kind === 'path').map((s) => TEAM_PATHS[s.name])
  const commands: CommandDef[] = [
    {
      id: TELEOP_ID,
      name: 'TeleopDrive',
      requirements: ['drivetrain'],
      priority: LOWEST_PRIORITY,
      repeatedly: true,
      factory: 'drivetrain.teleopDrive(driver)',
      body: [{ op: 'repeat', label: 'teleop' }],
    },
    {
      id: AUTO_ID,
      name: `PathPlannerAuto("${AUTO_NAME}")`,
      requirements: setup.passDrivetrain ? ['drivetrain', 'shooter'] : ['shooter'],
      factory: `new PathPlannerAuto("${AUTO_NAME}")`,
      body: AUTO_STEPS.map((s): CoroutineStep => ({ op: 'await', command: s.kind === 'path' ? pathId(s.name) : s.id })),
    },
    ...paths.flatMap((t) => pathCommands(t, setup.passDrivetrain)),
    ...AUTO_STEPS.filter((s) => s.kind === 'named').map(
      (s): CommandDef => ({
        id: s.id,
        name: s.name,
        requirements: ['shooter'],
        factory: `NamedCommands.getCommand("${s.name}")`,
        body: [
          { op: 'work', label: 'spinUp', cycles: SPIN_UP_CYCLES },
          { op: 'waitUntil', signal: HOPPER_EMPTY },
        ],
      }),
    ),
    {
      id: EVENT_IDS.extend,
      name: 'extend',
      requirements: ['pushout'],
      repeatedly: true,
      factory: 'pushout.pushCommand()',
      body: [{ op: 'repeat', label: 'extend' }],
    },
    {
      id: EVENT_IDS.intake,
      name: 'intake',
      requirements: ['intake'],
      repeatedly: true,
      factory: 'intake.runIntakeCommand()',
      body: [{ op: 'repeat', label: 'intake' }],
    },
  ]
  return {
    mechanisms: LAB_MECHANISMS.map((id) => ({ id, name: id, defaultCommand: id === 'drivetrain' ? TELEOP_ID : undefined })),
    commands,
    events: [{ cycle: 1, action: 'schedule', command: AUTO_ID, note: 'Autonomous enabled' }],
    maxCycles: cycles(20),
  }
}
