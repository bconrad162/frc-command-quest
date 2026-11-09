import { TEAM_PATHS } from '../../game/robotLab/pathplanner.ts'
import type { Pose } from '../../game/robotLab/pathplanner.ts'
import { FIELD_FUEL, HUB, type RobotState } from '../../game/robotLab/world.ts'

/** The blue half of the field, in meters (x toward red, y toward the left wall). */
const VIEW_L = 8.27
const VIEW_W = 8.069
const ROBOT = 0.87
const DEPOT = { x: 0, y: 5.964 - 0.533, w: 0.686, h: 1.067 }

const PATH_POINTS = Object.values(TEAM_PATHS).map((t) => {
  const pts: string[] = []
  for (let i = 0; i <= 60; i++) {
    const s = t.sample((t.totalTime * i) / 60)
    pts.push(`${s.x.toFixed(3)},${s.y.toFixed(3)}`)
  }
  return pts.join(' ')
})

function RobotShape({ pose, ghost }: { pose: Pose; ghost?: boolean }) {
  const deg = (pose.theta * 180) / Math.PI
  return (
    <g transform={`translate(${pose.x} ${pose.y}) rotate(${deg})`}>
      <rect
        x={-ROBOT / 2}
        y={-ROBOT / 2}
        width={ROBOT}
        height={ROBOT}
        rx={0.06}
        fill={ghost ? 'none' : 'var(--color-pit-raised)'}
        stroke={ghost ? 'var(--color-signal)' : '#1d4fd6'}
        strokeWidth={ghost ? 0.03 : 0.08}
        strokeDasharray={ghost ? '0.08 0.06' : undefined}
      />
      <path d={`M ${ROBOT / 2 - 0.05} 0 L ${ROBOT / 2 - 0.25} 0.14 L ${ROBOT / 2 - 0.25} -0.14 Z`} fill={ghost ? 'var(--color-signal)' : 'var(--color-ink)'} />
    </g>
  )
}

/** Top-down 2D view for machines that can't show the 3D field. */
export function FieldMap2D({ state }: { state: RobotState }) {
  return (
    <svg
      viewBox={`-0.3 -0.3 ${VIEW_L + 0.6} ${VIEW_W + 0.6}`}
      className="block h-full w-full"
      role="img"
      aria-label="Top-down view of the blue half of the 2026 field with the robot and its planned paths"
      data-testid="field-2d"
    >
      {/* Flip y so +y (field left) points up, like a field drawing. */}
      <g transform={`translate(0 ${VIEW_W}) scale(1 -1)`}>
        <rect x={0} y={0} width={VIEW_L} height={VIEW_W} fill="var(--color-field-deep)" stroke="var(--color-steel-bright)" strokeWidth={0.04} />
        <line x1={VIEW_L} y1={0} x2={VIEW_L} y2={VIEW_W} stroke="var(--color-steel-bright)" strokeWidth={0.03} strokeDasharray="0.15 0.1" />
        <rect x={HUB.x - 0.6} y={HUB.y - 0.6} width={1.2} height={1.2} fill="#1d4fd6" opacity={0.35} stroke="#1d4fd6" strokeWidth={0.04} />
        <rect {...{ x: DEPOT.x, y: DEPOT.y, width: DEPOT.w, height: DEPOT.h }} fill="none" stroke="var(--color-ink-faint)" strokeWidth={0.03} />
        {PATH_POINTS.map((p, i) => (
          <polyline key={i} points={p} fill="none" stroke="var(--color-signal)" strokeWidth={0.035} opacity={0.75} />
        ))}
        {FIELD_FUEL.map((f, i) =>
          state.fuelTaken[i] || f.z > 0.35 || f.x > VIEW_L ? null : <circle key={i} cx={f.x} cy={f.y} r={0.075} fill="var(--color-trophy)" />,
        )}
        {state.ghost && <RobotShape pose={state.ghost} ghost />}
        <RobotShape pose={state.pose} />
        {state.balls.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={0.075 + b.z * 0.03} fill="var(--color-trophy)" stroke="var(--color-field-deep)" strokeWidth={0.015} />
        ))}
      </g>
    </svg>
  )
}
