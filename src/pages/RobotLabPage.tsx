import { clsx } from 'clsx'
import { Play, RotateCcw } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FieldMap2D } from '../components/robotLab/FieldMap2D.tsx'
import { OwnershipStrip } from '../components/robotLab/OwnershipStrip.tsx'
import type { CameraPreset, RobotScene } from '../components/robotLab/RobotScene.ts'
import { createQualityMeter } from '../components/robotLab/qualityMeter.ts'
import { type LabSpeed, useLabRunner } from '../components/robotLab/useLabRunner.ts'
import { Badge, Button, Spinner } from '../components/ui.tsx'
import { usePrefersReducedMotion } from '../hooks/useAppState.ts'
import { lazyPage } from '../lib/lazyPage.ts'

declare global {
  interface Window {
    /** Test hook: advance the Robot Lab simulation without waiting for frames. */
    __robotLab?: { advance(seconds: number): void }
  }
}

const CodeView = lazyPage(() => import('../components/code/CodeView.tsx'))

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

function configureCode(passDrivetrain: boolean): string {
  // Lines stay within ~36 characters so they fit the side panel without scrolling.
  const tail = passDrivetrain
    ? '    () -> isRedAlliance(),\n    // the drive requirement:\n    drivetrain);'
    : "    () -> isRedAlliance());\n// No drivetrain! It still compiles:\n// last parameter is Mechanism...,\n// so leaving it out is allowed."
  return `// com.pathplanner.lib.command3
AutoBuilder.configure(
    drivetrain::getPose,
    drivetrain::resetPose,
    drivetrain::getRobotVelocity,
    drivetrain::driveRobotRelative,
    pathController,
    robotConfig,
${tail}`
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
  const { runner, refresh } = useLabRunner({ passDrivetrain: true })

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
          .load(FIELD_URL, setProgress)
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

  // The live loop: step the scheduler at 50 Hz and draw.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const meter = createQualityMeter()
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const loops = runner.advanceFrame(dt)
      const scene = sceneRef.current
      if (scene) {
        scene.render(runner.state, runner.running ? dt * speed : dt)
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

  // Test hook: advance the simulation without waiting for frames.
  useEffect(() => {
    window.__robotLab = {
      advance: (seconds: number) => {
        runner.advance(seconds)
        refresh()
      },
    }
    return () => {
      delete window.__robotLab
    }
  }, [runner, refresh])

  const setPass = (passDrivetrain: boolean) => {
    runner.setup = { passDrivetrain }
    runner.reset()
    refresh()
  }
  const pickQuality = (q: QualityChoice) => {
    setChoice(q)
    storeChoice(q)
    setReason(null)
    setEffective(q === 'auto' ? 'full' : q)
  }

  const pass = runner.setup.passDrivetrain
  const state = runner.state

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">Auto #7: Straight Back Depot</h1>
          <p className="mt-1 text-sm text-ink-muted">Team 5829's real PathPlanner auto on the 2026 REBUILT field, run by the Commands v3 scheduler.</p>
        </div>
        <Badge tone="warn">Community PathPlanner build: {PATHPLANNER_BUILD}</Badge>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div ref={viewportRef} className="relative h-[52vh] min-h-[320px] overflow-hidden rounded-lg border border-steel bg-field-deep lg:h-[62vh]">
          {is3d ? (
            <canvas ref={canvasRef} className="block h-full w-full touch-none" data-testid="field-3d" aria-label="3D view of the robot on the 2026 field" role="img" />
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
          </div>
        </div>

        <aside className="panel grid content-start gap-3 p-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-steel bg-field-deep p-1" role="group" aria-label="AutoBuilder setup">
            <button
              type="button"
              aria-pressed={pass}
              onClick={() => setPass(true)}
              data-testid="lab-mode-pass"
              className={clsx('rounded px-2 py-2 text-sm font-semibold', pass ? 'bg-go/15 text-go' : 'text-ink-muted hover:text-ink')}
            >
              Passes drivetrain
            </button>
            <button
              type="button"
              aria-pressed={!pass}
              onClick={() => setPass(false)}
              data-testid="lab-mode-forgot"
              className={clsx('rounded px-2 py-2 text-sm font-semibold', !pass ? 'bg-fault/15 text-fault' : 'text-ink-muted hover:text-ink')}
            >
              Forgot drivetrain
            </button>
          </div>
          <div data-testid="lab-code" className="min-w-0">
            <Suspense fallback={<pre className="font-mono text-xs">{configureCode(pass)}</pre>}>
              <CodeView code={configureCode(pass)} label="AutoBuilder.configure call" />
            </Suspense>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                runner.run()
                refresh()
              }}
              data-testid="lab-run"
            >
              <Play className="size-4" aria-hidden /> Run auto
            </Button>
            <Button
              onClick={() => {
                runner.reset()
                refresh()
              }}
              data-testid="lab-reset"
            >
              <RotateCcw className="size-4" aria-hidden /> Reset
            </Button>
          </div>
          <Segmented label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} />
          {is3d && <Segmented label="Camera" options={CAMERAS} value={camera} onChange={setCamera} />}
          <Segmented label="Quality" options={QUALITIES} value={choice} onChange={pickQuality} />
          {reason && (
            <p className="rounded border border-warn/50 bg-warn/10 px-3 py-2 text-xs text-warn" data-testid="lab-fallback-reason">
              {reason}
            </p>
          )}
          <p className="text-xs text-ink-faint">
            {is3d ? 'Drag to orbit, scroll to zoom. ' : ''}The dashed cyan robot shows where the path wants the robot to be.
          </p>
        </aside>
      </div>

      <section className="panel mt-4 p-4" aria-label="Scheduler state">
        <OwnershipStrip scenario={runner.scenario} snapshot={runner.snapshot} events={runner.events} driveConflict={state.driveConflict} />
      </section>
    </div>
  )
}
