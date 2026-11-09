import { clsx } from 'clsx'
import { CircleCheck, CircleX, Lightbulb, Power, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LabController } from '../components/robotLab/LabController.tsx'
import { LabEditor } from '../components/robotLab/LabEditor.tsx'
import { fromGamepad, fromKeys, isTypingTarget, LAB_KEYS, mergeInputs } from '../components/robotLab/input.ts'
import type { ControlId } from '../game/controller.ts'
import { NO_INPUT, type LabInput } from '../game/robotLab/bindings.ts'
import { FREE_PLAY_CODE, parseLabCode, type LabRegions } from '../game/robotLab/labCode.ts'
import { checkMission, LAB_MISSIONS, type MissionResult } from '../game/robotLab/missions.ts'
import type { LabMode } from '../game/robotLab/scenario.ts'
import { FieldMap2D } from '../components/robotLab/FieldMap2D.tsx'
import { OwnershipStrip } from '../components/robotLab/OwnershipStrip.tsx'
import type { CameraPreset, RobotScene } from '../components/robotLab/RobotScene.ts'
import { createQualityMeter } from '../components/robotLab/qualityMeter.ts'
import { type LabSpeed, useLabRunner } from '../components/robotLab/useLabRunner.ts'
import { Badge, Button, RichText, Spinner } from '../components/ui.tsx'
import { usePrefersReducedMotion } from '../hooks/useAppState.ts'

declare global {
  interface Window {
    /** Test hook: advance the Robot Lab simulation without waiting for frames. */
    __robotLab?: { advance(seconds: number): void; setInput(input: Partial<LabInput> & { buttons?: string[] }): void }
  }
}

type QualityChoice = 'auto' | 'full' | 'light' | '2d'
type Effective = 'full' | 'light' | '2d'

const QUALITY_KEY = 'cq-robot-lab-quality'
const FIELD_URL = `${import.meta.env.BASE_URL}models/field-2026.glb`
const PATHPLANNER_BUILD = 'PathplannerLib 2027.0.0-alpha-7-commandsv3-2'

const REASON = {
  noWebgl: "This browser can't show 3D here, so the lab is showing a 2D view.",
  loadFailed: "Couldn't load the 3D field, so the lab is showing a 2D view. Reload the page to try again.",
  slow: 'This computer draws the 3D field slowly, so the lab switched to a 2D view. Pick Full or Light under Quality to try 3D again.',
}

const isChoice = (v: unknown): v is QualityChoice => v === 'auto' || v === 'full' || v === 'light' || v === '2d'

function storedChoice(): QualityChoice | null {
  try {
    const v = localStorage.getItem(QUALITY_KEY)
    return isChoice(v) ? v : null
  } catch {
    return null
  }
}

function storeChoice(v: QualityChoice) {
  try {
    localStorage.setItem(QUALITY_KEY, v)
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}

const CAMERAS: { id: CameraPreset; label: string }[] = [
  { id: 'field', label: 'Field' },
  { id: 'chase', label: 'Follow robot' },
  { id: 'driver', label: 'Driver station' },
  { id: 'top', label: 'Top down' },
]
const SPEEDS: { value: LabSpeed; label: string }[] = [
  { value: 1, label: '1×' },
  { value: 0.5, label: '½×' },
  { value: 0.25, label: '¼×' },
]
const QUALITIES: { id: QualityChoice; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'full', label: 'Full' },
  { id: 'light', label: 'Light' },
  { id: '2d', label: '2D' },
]

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id?: T; value?: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="mr-1 text-xs text-ink-faint">{label}</span>
      {options.map((o) => {
        const v = (o.id ?? o.value) as T
        return (
          <button
            key={String(v)}
            type="button"
            aria-pressed={v === value}
            onClick={() => onChange(v)}
            className={clsx(
              'rounded border px-2.5 py-1 text-xs font-medium',
              v === value ? 'border-signal bg-signal/10 text-signal' : 'border-steel text-ink-muted hover:border-steel-bright hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const FREE_PLAY = 'free'
const MODES: { id: LabMode; label: string }[] = [
  { id: 'teleop', label: 'Teleop' },
  { id: 'auto', label: 'Autonomous' },
]
const sameRegions = (a: LabRegions, b: LabRegions) => a.driveRequirements === b.driveRequirements && a.defaultCommand === b.defaultCommand && a.bindings === b.bindings
const inputKey = (i: LabInput) => `${i.leftX.toFixed(2)},${i.leftY.toFixed(2)},${i.rightX.toFixed(2)},${i.rightY.toFixed(2)},${i.leftTrigger.toFixed(2)},${i.rightTrigger.toFixed(2)},${[...i.buttons].sort().join('')}`
const REVEAL_AFTER = 3

export default function RobotLabPage() {
  const [params] = useSearchParams()
  const forced = params.get('quality')
  const [choice, setChoice] = useState<QualityChoice>(() => (isChoice(forced) ? forced : (storedChoice() ?? 'auto')))
  const [effective, setEffective] = useState<Effective>(() => (choice === 'auto' ? 'full' : choice))
  const [reason, setReason] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(0)
  const [camera, setCamera] = useState<CameraPreset>('field')
  const [speed, setSpeed] = useState<LabSpeed>(1)
  const reducedMotion = usePrefersReducedMotion()

  // Code: what's in the editor, and what's deployed to the robot.
  const [missionId, setMissionId] = useState(FREE_PLAY)
  const mission = LAB_MISSIONS.find((m) => m.id === missionId) ?? null
  const [regions, setRegions] = useState<LabRegions>(FREE_PLAY_CODE)
  const [deployed, setDeployed] = useState<LabRegions>(FREE_PLAY_CODE)
  /** The code as loaded (mission start, free play, or the fix): edits are changes from this. */
  const [loaded, setLoaded] = useState<LabRegions>(FREE_PLAY_CODE)
  const [docKey, setDocKey] = useState(0)
  const [result, setResult] = useState<MissionResult | null>(null)
  const [failures, setFailures] = useState(0)
  const parsed = useMemo(() => parseLabCode(regions), [regions])
  const dirty = !sameRegions(regions, deployed)

  const { runner, refresh } = useLabRunner(parseLabCode(FREE_PLAY_CODE).config!, 'teleop')

  // Input: the on-page controller, a paired gamepad, and the keyboard.
  const pointerInput = useRef<LabInput>(NO_INPUT)
  const testInput = useRef<LabInput>(NO_INPUT)
  const keys = useRef(new Set<string>())
  const [shownInput, setShownInput] = useState<LabInput>(NO_INPUT)
  const shownKey = useRef(inputKey(NO_INPUT))
  const [gamepadName, setGamepadName] = useState<string | null>(null)
  const onPointerInput = useCallback((i: LabInput) => {
    pointerInput.current = i
  }, [])

  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const calloutRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<RobotScene | null>(null)
  const choiceRef = useRef(choice)
  const effectiveRef = useRef(effective)
  choiceRef.current = choice
  effectiveRef.current = effective
  const is3d = effective !== '2d'

  // Create the 3D scene (three.js loads only here) or fall back to 2D.
  useEffect(() => {
    if (!is3d) return
    let disposed = false
    let observer: ResizeObserver | null = null
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    if (!canvas || !viewport) return
    setProgress(0)
    import('../components/robotLab/RobotScene.ts')
      .then(({ RobotScene }) => {
        if (disposed) return
        let scene: RobotScene
        try {
          scene = new RobotScene(canvas, effectiveRef.current === 'light' ? 'light' : 'full')
        } catch {
          setReason(REASON.noWebgl)
          setEffective('2d')
          return
        }
        sceneRef.current = scene
        const fit = () => scene.resize(viewport.clientWidth, viewport.clientHeight)
        fit()
        observer = new ResizeObserver(fit)
        observer.observe(viewport)
        return scene
          .load(FIELD_URL, (p) => !disposed && setProgress(p))
          .then(() => !disposed && setProgress(null))
          .catch(() => {
            if (disposed) return
            setReason(REASON.loadFailed)
            setEffective('2d')
          })
      })
      .catch(() => {
        if (disposed) return
        setReason(REASON.loadFailed)
        setEffective('2d')
      })
    return () => {
      disposed = true
      observer?.disconnect()
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [is3d])

  useEffect(() => {
    if (effective !== '2d') sceneRef.current?.setQuality(effective)
  }, [effective])

  useEffect(() => {
    sceneRef.current?.setCamera(camera, reducedMotion)
  }, [camera, reducedMotion, progress])

  useEffect(() => runner.setSpeed(speed), [runner, speed])

  // Keyboard driving. Keys typed in the editor (or any field) are typing, not driving.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (!LAB_KEYS.has(e.code)) return
      // Space and the arrows would scroll the page, and Space would press a focused button.
      e.preventDefault()
      keys.current.add(e.code)
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    const clear = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  // Real gamepads: the browser only reports one after a button is pressed on it.
  useEffect(() => {
    const update = () => {
      const pad = navigator.getGamepads?.().find((g) => g && g.connected) ?? null
      setGamepadName(pad ? pad.id : null)
    }
    window.addEventListener('gamepadconnected', update)
    window.addEventListener('gamepaddisconnected', update)
    return () => {
      window.removeEventListener('gamepadconnected', update)
      window.removeEventListener('gamepaddisconnected', update)
    }
  }, [])

  // The live loop: read the controller, step the scheduler at 50 Hz, and draw.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const meter = createQualityMeter()
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      let pad: Gamepad | null = null
      try {
        pad = navigator.getGamepads?.().find((g) => g && g.connected) ?? null
      } catch {
        // Blocked by a permissions policy: no gamepad.
      }
      const input = mergeInputs(pointerInput.current, fromGamepad(pad), fromKeys(keys.current), testInput.current)
      runner.input = input
      const key = inputKey(input)
      if (key !== shownKey.current) {
        shownKey.current = key
        setShownInput(input)
      }
      const loops = runner.advanceFrame(dt)
      const scene = sceneRef.current
      if (scene) {
        scene.render(runner.state, runner.enabled ? dt * speed : dt)
        const callout = calloutRef.current
        const viewport = viewportRef.current
        if (callout && viewport) {
          const show = runner.state.driveConflict
          callout.hidden = !show
          if (show) {
            const p = scene.project(runner.state.pose.x, runner.state.pose.y, 0.9, viewport.clientWidth, viewport.clientHeight)
            callout.style.left = `${p.x}px`
            callout.style.top = `${p.y}px`
          }
        }
        // Auto quality: decide within the first seconds at each level, once the field has loaded.
        const level = effectiveRef.current
        if (choiceRef.current === 'auto' && progress === null && level !== '2d') {
          const next = meter.add(dt, level)
          if (next === 'light') setEffective('light')
          else if (next === '2d') {
            setReason(REASON.slow)
            setEffective('2d')
          }
        }
      }
      if (loops > 0) refresh()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [runner, refresh, speed, progress])

  // Test hooks: advance the simulation without waiting for frames, and hold controls.
  useEffect(() => {
    window.__robotLab = {
      advance: (seconds: number) => {
        runner.input = mergeInputs(pointerInput.current, fromKeys(keys.current), testInput.current)
        runner.advance(seconds)
        refresh()
      },
      setInput: (i) => {
        testInput.current = { ...NO_INPUT, ...i, buttons: new Set((i.buttons ?? []) as ControlId[]) }
      },
    }
    return () => {
      delete window.__robotLab
    }
  }, [runner, refresh])

  const deploy = (code: LabRegions) => {
    const { config } = parseLabCode(code)
    if (!config) return false
    runner.deploy(config)
    setDeployed(code)
    refresh()
    return true
  }
  const loadCode = (code: LabRegions) => {
    setRegions(code)
    setLoaded(code)
    setDocKey((k) => k + 1)
    deploy(code)
  }
  const pickMission = (id: string) => {
    if (!sameRegions(regions, loaded) && !window.confirm('Switch missions? Your changes to RobotContainer.java will be lost.')) return
    const m = LAB_MISSIONS.find((x) => x.id === id) ?? null
    setMissionId(id)
    setResult(null)
    setFailures(0)
    runner.setStartPose(m?.startPose)
    runner.setMode(m?.mode ?? 'teleop')
    loadCode(m ? m.start : FREE_PLAY_CODE)
  }
  const check = () => {
    if (!mission) return
    const r = checkMission(mission, regions)
    if (parsed.config) deploy(regions)
    setResult(r)
    if (!r.passed) setFailures((f) => f + 1)
  }
  const setMode = (m: LabMode) => {
    runner.setMode(m)
    refresh()
  }
  const pickQuality = (q: QualityChoice) => {
    setChoice(q)
    storeChoice(q)
    setReason(null)
    setEffective(q === 'auto' ? 'full' : q)
  }

  const state = runner.state
  const enabled = runner.enabled
  const periodSeconds = runner.mode === 'auto' ? 20 : 135

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">Robot Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Drive team 5829's robot on the 2026 REBUILT field. Change <code className="inline-code">RobotContainer.java</code>, deploy, and watch the Commands v3 scheduler run your code every 20 ms.
          </p>
        </div>
        <Badge tone="warn">Community PathPlanner build: {PATHPLANNER_BUILD}</Badge>
      </header>

      <section className="panel mt-4 grid gap-3 p-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]" aria-label="Mission">
        <label className="grid content-start gap-1 text-xs text-ink-faint">
          Mission
          <select
            value={missionId}
            onChange={(e) => {
              pickMission(e.target.value)
              // Hand the keyboard back to driving: a focused select would take 1-4, F, W... as type-ahead and switch missions.
              e.target.blur()
            }}
            className="h-10 rounded-lg border border-steel-bright bg-pit-raised px-3 text-sm text-ink"
            data-testid="lab-mission"
          >
            <option value={FREE_PLAY}>Free play</option>
            {LAB_MISSIONS.map((m, i) => (
              <option key={m.id} value={m.id}>
                {i + 1}. {m.title}
              </option>
            ))}
          </select>
        </label>
        {mission ? (
          <div className="grid min-w-0 gap-2 text-sm">
            <p className="text-ink-muted">{mission.story}</p>
            <p>
              <span className="font-semibold text-ink">Goal: </span>
              {mission.goal}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={check} data-testid="lab-check">
                Check my code
              </Button>
              {failures >= REVEAL_AFTER && !result?.passed && (
                <Button size="sm" onClick={() => loadCode(mission.solution)} data-testid="lab-show-fix">
                  <Lightbulb className="size-4" aria-hidden /> Show the fix
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => pickMission(mission.id)}>
                <RotateCcw className="size-4" aria-hidden /> Start over
              </Button>
            </div>
            {result && (
              <p
                className={clsx('flex items-start gap-2 rounded-lg border px-3 py-2', result.passed ? 'border-go/50 bg-go/10 text-go' : 'border-fault/50 bg-fault/10 text-ink')}
                data-testid="lab-check-result"
                role="status"
              >
                {result.passed ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0 text-fault" aria-hidden />}
                <RichText text={(result.passed ? 'Mission complete. ' : '') + result.message} />
              </p>
            )}
          </div>
        ) : (
          <p className="self-center text-sm text-ink-muted">
            Free play: the code is correct. Enable the robot and drive. Try adding a binding in <code className="inline-code">configureBindings()</code>, then press Deploy. Pick a mission to fix a real bug.
          </p>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,760px)]">
        <div className="grid min-w-0 content-start gap-3">
          <div ref={viewportRef} className="relative h-[48vh] min-h-[300px] overflow-hidden rounded-lg border border-steel bg-field-deep lg:h-[54vh]">
            {is3d ? (
              <canvas ref={canvasRef} className="block h-full w-full" data-testid="field-3d" aria-label="3D view of the robot on the 2026 field" role="img" />
            ) : (
              <FieldMap2D state={state} />
            )}
            {is3d && progress !== null && (
              <div className="absolute inset-0 grid place-items-center bg-field-deep/90">
                <div className="w-64 text-center text-sm text-ink-muted">
                  <Spinner label="Loading the 2026 field" />
                  <div className="mt-3 h-1.5 overflow-hidden rounded bg-steel">
                    <div className="h-full bg-signal transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                </div>
              </div>
            )}
            {is3d && (
              <div
                ref={calloutRef}
                hidden
                data-testid="lab-conflict-callout"
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded bg-fault px-2.5 py-1 text-xs font-semibold text-field-deep"
              >
                Two commands are driving: the robot twitches in place
              </div>
            )}
            <div className="absolute top-3 right-3 rounded-lg border border-steel bg-pit/85 px-3 py-2 text-right backdrop-blur">
              <div className="font-display text-3xl leading-none font-bold text-trophy" data-testid="lab-score">
                {state.scored}
              </div>
              <div className="text-xs text-ink-muted">fuel scored</div>
              <div className="mt-1 font-mono text-xs text-ink-faint">
                hopper <span data-testid="lab-hopper">{state.hopper}</span>
              </div>
              <div className="font-mono text-xs text-ink-faint" data-testid="lab-clock">
                t = {(state.cycle * 0.02).toFixed(2)} s, loop {state.cycle}
              </div>
              <div className="font-mono text-xs text-ink-faint" data-testid="lab-pose">
                x {state.pose.x.toFixed(2)} y {state.pose.y.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="panel grid gap-3 p-3" aria-label="Driver Station">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-steel bg-field-deep p-0.5" role="group" aria-label="Robot mode">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={runner.mode === m.id}
                    onClick={() => setMode(m.id)}
                    data-testid={`lab-mode-${m.id}`}
                    className={clsx('rounded-md px-3 py-1.5 text-sm font-semibold', runner.mode === m.id ? 'bg-signal/15 text-signal' : 'text-ink-muted hover:text-ink')}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Button
                variant={enabled ? 'secondary' : 'primary'}
                onClick={() => {
                  runner.enable()
                  refresh()
                }}
                disabled={enabled}
                data-testid="lab-enable"
              >
                <Power className="size-4" aria-hidden /> Enable
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  runner.disable()
                  refresh()
                }}
                disabled={!enabled}
                data-testid="lab-disable"
              >
                Disable
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  runner.reset()
                  refresh()
                }}
                data-testid="lab-reset"
              >
                <RotateCcw className="size-4" aria-hidden /> Reset robot
              </Button>
              <span className={clsx('ml-auto font-mono text-xs', enabled ? 'text-go' : 'text-ink-faint')} data-testid="lab-status">
                {enabled ? `Enabled · ${runner.mode === 'auto' ? 'Autonomous' : 'Teleop'}` : runner.finished ? 'Period over' : 'Disabled'} · {Math.max(0, periodSeconds - state.cycle * 0.02).toFixed(0)} s left
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
              <LabController input={shownInput} onPointerInput={onPointerInput} gamepadName={gamepadName} />
              <div className="grid content-start gap-2.5">
                <Segmented label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} />
                {is3d && <Segmented label="Camera" options={CAMERAS} value={camera} onChange={setCamera} />}
                <Segmented label="Quality" options={QUALITIES} value={choice} onChange={pickQuality} />
                {reason && (
                  <p className="rounded border border-warn/50 bg-warn/10 px-3 py-2 text-xs text-warn" data-testid="lab-fallback-reason">
                    {reason}
                  </p>
                )}
                <p className="text-xs text-ink-faint">
                  {is3d ? 'Drag the field to orbit, scroll to zoom. ' : ''}In autonomous, the dashed cyan robot shows where the path wants the robot to be.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:max-h-[900px]">
          <LabEditor regions={regions} docKey={`${missionId}:${docKey}`} onChange={setRegions} problems={parsed.problems} onDeploy={() => deploy(regions)} dirty={dirty} />
        </div>
      </div>

      <section className="panel mt-4 p-4" aria-label="Scheduler state">
        <OwnershipStrip scenario={runner.scenario} snapshot={runner.snapshot} events={runner.events} driveConflict={state.driveConflict} />
      </section>
    </div>
  )
}
