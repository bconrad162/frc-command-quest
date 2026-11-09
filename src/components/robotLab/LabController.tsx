import { clsx } from 'clsx'
import { Gamepad2, Keyboard } from 'lucide-react'
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { CONTROL_BY_ID, type ControlId } from '../../game/controller.ts'
import { isPressed, NO_INPUT, type LabInput } from '../../game/robotLab/bindings.ts'
import { CONTROLLER_BODY, CONTROLLER_LAYOUT, FACE_COLOR } from '../challenge/ControllerDiagram.tsx'
import { KEY_LEGEND } from './input.ts'

/** How far (viewBox units) a stick knob travels at full deflection. */
const TRAVEL = 18
const STICKS = { leftStick: ['leftX', 'leftY'], rightStick: ['rightX', 'rightY'] } as const
type StickId = keyof typeof STICKS
const BUTTONS = (Object.keys(CONTROLLER_LAYOUT) as ControlId[]).filter((id) => id !== 'leftStick' && id !== 'rightStick')

/**
 * An Xbox controller drawn on the page that drives the robot: drag the sticks,
 * hold buttons and triggers with the pointer. It also shows the live merged input
 * (a real gamepad or the keyboard light it up too).
 */
export function LabController({
  input,
  onPointerInput,
  gamepadName,
}: {
  /** What the robot reads this loop (pointer, gamepad and keyboard merged). */
  input: LabInput
  onPointerInput: (input: LabInput) => void
  gamepadName: string | null
}) {
  const svg = useRef<SVGSVGElement>(null)
  const pointer = useRef<LabInput>(NO_INPUT)
  const held = useRef(new Map<number, ControlId>())
  const sticks = useRef(new Map<number, StickId>())

  const publish = useCallback(
    (patch: Partial<LabInput>) => {
      pointer.current = { ...pointer.current, ...patch }
      onPointerInput(pointer.current)
    },
    [onPointerInput],
  )
  const syncButtons = () => {
    const ids = new Set(held.current.values())
    publish({
      buttons: new Set([...ids].filter((id) => id !== 'leftTrigger' && id !== 'rightTrigger')),
      leftTrigger: ids.has('leftTrigger') ? 1 : 0,
      rightTrigger: ids.has('rightTrigger') ? 1 : 0,
    })
  }

  const toViewBox = (e: ReactPointerEvent) => {
    const m = svg.current?.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }
  const moveStick = (id: StickId, e: ReactPointerEvent) => {
    const shape = CONTROLLER_LAYOUT[id].shape
    if (shape.kind !== 'circle') return
    const p = toViewBox(e)
    let dx = (p.x - shape.cx) / TRAVEL
    let dy = (p.y - shape.cy) / TRAVEL
    const len = Math.hypot(dx, dy)
    if (len > 1) {
      dx /= len
      dy /= len
    }
    const [ax, ay] = STICKS[id]
    // Screen down is +y, and so is a stick pulled back (toward the driver).
    publish({ [ax]: dx, [ay]: dy })
  }
  const release = (e: ReactPointerEvent) => {
    const stick = sticks.current.get(e.pointerId)
    if (stick) {
      sticks.current.delete(e.pointerId)
      const [ax, ay] = STICKS[stick]
      publish({ [ax]: 0, [ay]: 0 })
    }
    if (held.current.delete(e.pointerId)) syncButtons()
  }
  // Capture on the <svg> (not the control), so moves and the release arrive even off the control.
  const capture = (e: ReactPointerEvent) => {
    e.preventDefault()
    try {
      svg.current?.setPointerCapture(e.pointerId)
    } catch {
      // The pointer is already gone: the release handlers still reset the control.
    }
  }
  const onMove = (e: ReactPointerEvent) => {
    const stick = sticks.current.get(e.pointerId)
    if (stick) moveStick(stick, e)
  }

  const knob = (id: StickId) => {
    const shape = CONTROLLER_LAYOUT[id].shape
    if (shape.kind !== 'circle') return null
    const [ax, ay] = STICKS[id]
    const cx = shape.cx + input[ax] * TRAVEL
    const cy = shape.cy + input[ay] * TRAVEL
    const active = Math.hypot(input[ax], input[ay]) > 0.1
    return (
      <g
        key={id}
        data-control={id}
        className="cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => {
          capture(e)
          sticks.current.set(e.pointerId, id)
          moveStick(id, e)
        }}
      >
        <circle cx={shape.cx} cy={shape.cy} r={shape.r + 10} fill="transparent" />
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill="var(--color-field-deep)" stroke="var(--color-steel-bright)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={15} fill={active ? 'var(--color-signal)' : 'var(--color-steel-bright)'} fillOpacity={active ? 0.85 : 1} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight={700} fill={active ? 'var(--color-field-deep)' : 'var(--color-ink-muted)'} pointerEvents="none">
          {CONTROL_BY_ID[id].short}
        </text>
      </g>
    )
  }

  return (
    <div className="grid gap-2" data-testid="lab-controller">
      <svg
        ref={svg}
        viewBox="0 0 440 250"
        className="mx-auto block h-auto w-full max-w-[420px] touch-none select-none"
        role="img"
        aria-label="On-page Xbox controller: drag the sticks, hold the buttons and triggers"
        onPointerMove={onMove}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <path d={CONTROLLER_BODY} fill="var(--color-pit-raised)" stroke="var(--color-steel-bright)" strokeWidth="2" />
        <circle cx="220" cy="72" r="11" fill="none" stroke="var(--color-steel-bright)" strokeWidth="1.5" />
        <circle cx="166" cy="168" r="29" fill="var(--color-field-deep)" opacity="0.6" />
        {BUTTONS.map((id) => {
          const { shape } = CONTROLLER_LAYOUT[id]
          const analog = id === 'leftTrigger' ? input.leftTrigger : id === 'rightTrigger' ? input.rightTrigger : 0
          const down = isPressed(input, id) || analog > 0.05
          const face = FACE_COLOR[id]
          const fill = down ? (face ?? 'var(--color-signal)') : face ?? 'var(--color-field-deep)'
          const label = CONTROL_BY_ID[id].short
          const [lx, ly] = shape.kind === 'circle' ? [shape.cx, shape.cy] : [shape.x + shape.w / 2, shape.y + shape.h / 2]
          return (
            <g
              key={id}
              data-control={id}
              className="cursor-pointer touch-none"
              onPointerDown={(e) => {
                capture(e)
                held.current.set(e.pointerId, id)
                syncButtons()
              }}
            >
              {shape.kind === 'circle' ? (
                <circle cx={shape.cx} cy={shape.cy} r={shape.r + 2} fill={fill} fillOpacity={down ? 0.95 : face ? 0.25 : 1} stroke={down ? 'var(--color-ink)' : 'var(--color-steel-bright)'} strokeWidth={1.5} />
              ) : (
                <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} fill={fill} fillOpacity={down ? 0.95 : 1} stroke={down ? 'var(--color-ink)' : 'var(--color-steel-bright)'} strokeWidth={1.5} />
              )}
              {analog > 0.05 && shape.kind === 'rect' && (
                <rect x={shape.x} y={shape.y + shape.h * (1 - analog)} width={shape.w} height={shape.h * analog} rx={shape.rx} fill="var(--color-signal)" pointerEvents="none" />
              )}
              {!id.startsWith('dpad') && (
                <text x={lx} y={ly + 4} textAnchor="middle" fontSize={label.length > 2 ? 9 : 11} fontWeight={600} fill={down ? 'var(--color-field-deep)' : (face ?? 'var(--color-ink-muted)')} pointerEvents="none">
                  {label}
                </text>
              )}
            </g>
          )
        })}
        {knob('leftStick')}
        {knob('rightStick')}
      </svg>
      <p className="font-mono text-[11px] text-ink-faint" data-testid="lab-input-readout" aria-live="off">
        LX {fmt(input.leftX)} LY {fmt(input.leftY)} RX {fmt(input.rightX)} · LT {input.leftTrigger.toFixed(1)} RT {input.rightTrigger.toFixed(1)}
        {input.buttons.size > 0 && ` · ${[...input.buttons].map((b) => CONTROL_BY_ID[b].short).join(' ')}`}
      </p>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className={clsx('flex items-center gap-1.5', gamepadName ? 'text-go' : 'text-ink-faint')}>
          <Gamepad2 className="size-3.5" aria-hidden />
          {gamepadName ? `Controller connected: ${gamepadName.slice(0, 40)}` : 'No controller paired. Press a button on one to use it.'}
        </span>
        <details className="min-w-0">
          <summary className="flex cursor-pointer items-center gap-1.5">
            <Keyboard className="size-3.5" aria-hidden />
            Keyboard
          </summary>
          <ul className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
            {KEY_LEGEND.map((k) => (
              <li key={k.keys} className="contents">
                <span className="text-ink">{k.keys}</span>
                <span className="text-ink-faint">{k.does}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  )
}

const fmt = (v: number) => (v >= 0 ? ' ' : '') + v.toFixed(2)
