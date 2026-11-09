import { clsx } from 'clsx'
import { CONTROL_BY_ID, type ControlId } from '../../game/controller.ts'

export type MarkTone = 'signal' | 'go' | 'fault' | 'muted'

export interface ControlMark {
  /** Text in the badge next to the control (e.g. line numbers). */
  badge?: string
  tone: MarkTone
}

const TONE: Record<MarkTone, { fill: string; stroke: string; text: string }> = {
  signal: { fill: 'var(--color-signal)', stroke: 'var(--color-signal)', text: 'var(--color-field-deep)' },
  go: { fill: 'var(--color-go)', stroke: 'var(--color-go)', text: 'var(--color-field-deep)' },
  fault: { fill: 'var(--color-fault)', stroke: 'var(--color-fault)', text: 'var(--color-field-deep)' },
  muted: { fill: 'var(--color-steel-bright)', stroke: 'var(--color-steel-bright)', text: 'var(--color-ink)' },
}

type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number }

/** Where each control is drawn, and where its badge sits. */
export const CONTROLLER_LAYOUT: Record<ControlId, { shape: Shape; badge: [number, number] }> = {
  leftTrigger: { shape: { kind: 'rect', x: 78, y: 6, w: 66, h: 24, rx: 8 }, badge: [62, 14] },
  rightTrigger: { shape: { kind: 'rect', x: 296, y: 6, w: 66, h: 24, rx: 8 }, badge: [378, 14] },
  leftBumper: { shape: { kind: 'rect', x: 66, y: 36, w: 92, h: 16, rx: 7 }, badge: [50, 44] },
  rightBumper: { shape: { kind: 'rect', x: 282, y: 36, w: 92, h: 16, rx: 7 }, badge: [390, 44] },
  leftStick: { shape: { kind: 'circle', cx: 118, cy: 106, r: 25 }, badge: [80, 82] },
  rightStick: { shape: { kind: 'circle', cx: 276, cy: 168, r: 25 }, badge: [314, 192] },
  dpadUp: { shape: { kind: 'rect', x: 157, y: 138, w: 18, h: 20, rx: 3 }, badge: [166, 126] },
  dpadDown: { shape: { kind: 'rect', x: 157, y: 178, w: 18, h: 20, rx: 3 }, badge: [166, 212] },
  dpadLeft: { shape: { kind: 'rect', x: 135, y: 159, w: 21, h: 18, rx: 3 }, badge: [121, 168] },
  dpadRight: { shape: { kind: 'rect', x: 176, y: 159, w: 21, h: 18, rx: 3 }, badge: [211, 168] },
  view: { shape: { kind: 'rect', x: 184, y: 98, w: 24, h: 14, rx: 7 }, badge: [196, 84] },
  menu: { shape: { kind: 'rect', x: 232, y: 98, w: 24, h: 14, rx: 7 }, badge: [244, 84] },
  y: { shape: { kind: 'circle', cx: 324, cy: 80, r: 13 }, badge: [345, 64] },
  x: { shape: { kind: 'circle', cx: 299, cy: 106, r: 13 }, badge: [278, 90] },
  b: { shape: { kind: 'circle', cx: 349, cy: 106, r: 13 }, badge: [372, 96] },
  a: { shape: { kind: 'circle', cx: 324, cy: 132, r: 13 }, badge: [345, 148] },
}

/** Button colors that match the printed letters on an Xbox-style pad. */
export const FACE_COLOR: Partial<Record<ControlId, string>> = { a: '#4ade80', b: '#f87171', x: '#60a5fa', y: '#facc15' }

/** The controller's outline in the 440×250 viewBox. */
export const CONTROLLER_BODY =
  'M92 50 Q220 34 348 50 Q398 58 414 118 Q432 196 408 232 Q384 254 356 226 Q330 198 300 198 L140 198 Q110 198 84 226 Q56 254 32 232 Q8 196 26 118 Q42 58 92 50 Z'

const LAYOUT = CONTROLLER_LAYOUT
const ORDER = Object.keys(LAYOUT) as ControlId[]

/**
 * A top-down Xbox-style controller. `marks` highlight controls and draw badges;
 * `onPick` makes controls clickable (a mouse shortcut: every use pairs it with
 * an accessible control such as a select, so the drawing itself is decorative).
 */
export function ControllerDiagram({
  marks = {},
  onPick,
  highlight,
  className,
}: {
  marks?: Partial<Record<ControlId, ControlMark>>
  onPick?: (id: ControlId) => void
  /** Control to emphasize (e.g. hovered row). */
  highlight?: ControlId | null
  className?: string
}) {
  return (
    <svg viewBox="0 0 440 250" className={clsx('block h-auto w-full', className)} aria-hidden="true">
      <path
        d={CONTROLLER_BODY}
        fill="var(--color-pit-raised)"
        stroke="var(--color-steel-bright)"
        strokeWidth="2"
      />
      <circle cx="220" cy="72" r="11" fill="none" stroke="var(--color-steel-bright)" strokeWidth="1.5" />
      <circle cx="166" cy="168" r="29" fill="var(--color-field-deep)" opacity="0.6" />
      {ORDER.map((id) => {
        const { shape } = LAYOUT[id]
        const mark = marks[id]
        const tone = mark ? TONE[mark.tone] : null
        const emphasized = highlight === id
        const common = {
          fill: tone ? tone.fill : (FACE_COLOR[id] ?? 'var(--color-field-deep)'),
          fillOpacity: tone ? 0.9 : FACE_COLOR[id] ? 0.25 : 1,
          stroke: tone ? tone.stroke : emphasized ? 'var(--color-signal)' : 'var(--color-steel-bright)',
          strokeWidth: emphasized ? 3 : 1.5,
        }
        const label = CONTROL_BY_ID[id].short
        const [lx, ly] = shape.kind === 'circle' ? [shape.cx, shape.cy] : [shape.x + shape.w / 2, shape.y + shape.h / 2]
        const showLabel = !id.startsWith('dpad')
        return (
          <g
            key={id}
            data-control={id}
            onClick={onPick ? () => onPick(id) : undefined}
            className={clsx(onPick && 'cursor-pointer [&:hover>*:first-child]:stroke-signal')}
          >
            {shape.kind === 'circle' ? (
              <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />
            ) : (
              <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} {...common} />
            )}
            {showLabel && (
              <text
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                fontSize={label.length > 2 ? 9 : 11}
                fontWeight={600}
                fill={tone ? tone.text : FACE_COLOR[id] ?? 'var(--color-ink-muted)'}
                pointerEvents="none"
              >
                {label}
              </text>
            )}
          </g>
        )
      })}
      {ORDER.map((id) => {
        const mark = marks[id]
        if (!mark?.badge) return null
        const [bx, by] = LAYOUT[id].badge
        const tone = TONE[mark.tone]
        const w = Math.max(18, mark.badge.length * 7 + 8)
        return (
          <g key={`badge-${id}`} pointerEvents="none">
            <rect x={bx - w / 2} y={by - 9} width={w} height={18} rx={9} fill={tone.fill} />
            <text x={bx} y={by + 4} textAnchor="middle" fontSize="11" fontWeight={700} fill={tone.text}>
              {mark.badge}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
