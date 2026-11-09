/**
 * Draws the Robot Lab: the 2026 REBUILT field model, team 5829's robot, the
 * planned paths, the ghost robot, fuel and shots. It only draws RobotState;
 * all behavior lives in src/game/robotLab (scheduler + RobotWorld).
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  DirectionalLight,
  EdgesGeometry,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  type Texture,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { TEAM_PATHS } from '../../game/robotLab/pathplanner.ts'
import type { RobotState } from '../../game/robotLab/world.ts'
import { FIELD_FUEL, HUB } from '../../game/robotLab/world.ts'
import { toThree, yawOf } from './coords.ts'
import { disposeObject3D } from './dispose.ts'
import { ballGeometry, buildRobot, fuelMaterial, HOPPER_SLOTS, type RobotParts, WHEEL_RADIUS } from './robotModel.ts'

export type Quality = 'full' | 'light'
export type CameraPreset = 'field' | 'chase' | 'driver' | 'top'

const LED = { conflict: 0xff5d6c, running: 0x3ddc97, idle: 0x3cc8f0 }
const BACKGROUND = 0x070f1f

/** Camera position and target in field coordinates (x, y, z). */
const CAMERAS: Record<Exclude<CameraPreset, 'chase'>, { pos: [number, number, number]; at: [number, number, number] }> = {
  field: { pos: [1.2, -1.6, 4.3], at: [2.3, 4.6, 0] },
  driver: { pos: [-1.0, 4.03, 1.9], at: [3.6, 4.03, 0.4] },
  top: { pos: [3.1, 4.03, 9.5], at: [3.1, 4.031, 0] },
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export class RobotScene {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(42, 1, 0.05, 120)
  private readonly controls: OrbitControls
  private readonly sun = new DirectionalLight(0xfff4e6, 2.4)
  private readonly robot: RobotParts
  private readonly ghost = new Group()
  private readonly fieldFuel: InstancedMesh
  private readonly ballPool: Mesh[] = []
  private readonly ballMaterial = fuelMaterial()
  private readonly hubLight = new PointLight(0x3cc8f0, 0, 6)
  private readonly wheelDistance = [0, 0, 0, 0]
  private environment: Texture | null = null
  private field: Group | null = null
  private quality: Quality
  private preset: CameraPreset = 'field'
  private reducedMotion = false
  private shownFuelTaken = -1
  private lastScored = 0
  private hubFlash = 0

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.robot = buildRobot()
    this.fieldFuel = new InstancedMesh(ballGeometry, this.ballMaterial, FIELD_FUEL.length)
    this.quality = quality
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = (88 * Math.PI) / 180
    this.controls.minDistance = 0.8
    this.controls.maxDistance = 30
    try {
      this.setUp()
    } catch (err) {
      // Don't leave a half-built context behind (e.g. if the environment map fails).
      this.renderer.dispose()
      this.renderer.forceContextLoss()
      throw err
    }
  }

  private setUp(): void {
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.scene.background = new Color(BACKGROUND)

    this.scene.add(new HemisphereLight(0xdde8ff, 0x1a2233, 0.7))
    this.sun.position.copy(toThree(2, -2, 14))
    this.sun.target.position.copy(toThree(4, 4, 0))
    this.sun.shadow.mapSize.set(2048, 2048)
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 })
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.02
    this.scene.add(this.sun, this.sun.target)
    const rim = new DirectionalLight(0x9fd8ff, 0.6)
    rim.position.copy(toThree(14, 10, 8))
    this.scene.add(rim)
    this.hubLight.position.copy(toThree(HUB.x, HUB.y, 2.1))
    this.scene.add(this.hubLight)

    const floor = new Mesh(new PlaneGeometry(80, 80), new MeshStandardMaterial({ color: 0x0b1322, roughness: 1 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.02
    floor.receiveShadow = true
    this.scene.add(floor)

    this.scene.add(this.robot.root)
    this.buildGhost()
    this.buildPaths()

    this.fieldFuel.castShadow = true
    this.fieldFuel.receiveShadow = true
    this.scene.add(this.fieldFuel)

    this.applyQuality()
    this.placeCamera('field')
    // Use the context once before anything resizes the canvas: WebKit (seen in
    // Playwright's WebKit on Linux) crashes when a never-drawn WebGL canvas is resized.
    this.renderer.clear()
  }

  load(url: string, onProgress: (fraction: number) => void): Promise<void> {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          this.field = gltf.scene
          this.scene.add(this.field)
          this.applyQuality()
          resolve()
        },
        (e) => {
          if (e.total) onProgress(e.loaded / e.total)
        },
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
      )
    })
  }

  setQuality(q: Quality): void {
    this.quality = q
    this.applyQuality()
  }

  setCamera(p: CameraPreset, reducedMotion: boolean): void {
    this.preset = p
    this.reducedMotion = reducedMotion
    if (p !== 'chase') this.placeCamera(p)
  }

  private placeCamera(p: Exclude<CameraPreset, 'chase'>) {
    const { pos, at } = CAMERAS[p]
    this.camera.position.copy(toThree(...pos))
    this.controls.target.copy(toThree(...at))
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  render(state: RobotState, dt: number): void {
    this.placeRobot(state, dt)
    this.placeGhost(state)
    this.placeBalls(state)
    this.updateFieldFuel(state)
    if (state.scored > this.lastScored) this.hubFlash = 1
    this.lastScored = state.scored
    this.hubFlash = Math.max(0, this.hubFlash - dt * 2.5)
    this.hubLight.intensity = this.hubFlash * 25

    if (this.preset === 'chase') {
      const { x, y, theta } = state.pose
      const want = toThree(x - Math.cos(theta) * 2.4, y - Math.sin(theta) * 2.4, 1.5)
      const target = toThree(x, y, 0.3)
      if (this.reducedMotion) {
        this.camera.position.copy(want)
        this.controls.target.copy(target)
      } else {
        this.camera.position.lerp(want, Math.min(1, dt * 3))
        this.controls.target.lerp(target, Math.min(1, dt * 5))
      }
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /** Projects a field point to canvas pixels (for the conflict callout). */
  project(x: number, y: number, z: number, width: number, height: number): { x: number; y: number; visible: boolean } {
    const p = toThree(x, y, z).project(this.camera)
    return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height, visible: p.z < 1 }
  }

  /** Frees GPU memory (field, robot, paths, fuel) and releases the WebGL context. */
  dispose(): void {
    this.controls.dispose()
    disposeObject3D(this.scene)
    this.environment?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }

  private applyQuality() {
    const full = this.quality === 'full'
    this.renderer.setPixelRatio(full ? Math.min(window.devicePixelRatio, 2) : 1)
    this.renderer.shadowMap.enabled = full
    this.sun.castShadow = full
    this.scene.fog = full ? new Fog(BACKGROUND, 22, 55) : null
    if (full && !this.environment) {
      const pmrem = new PMREMGenerator(this.renderer)
      this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      pmrem.dispose()
    }
    this.scene.environment = full ? this.environment : null
    this.scene.environmentIntensity = 0.55
    this.field?.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = full
        o.receiveShadow = full
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m) => (m.needsUpdate = true))
      }
    })
  }

  private buildGhost() {
    const fill = new MeshBasicMaterial({ color: 0x3cc8f0, transparent: true, opacity: 0.22, depthWrite: false })
    const plate = new Mesh(new BoxGeometry(0.87, 0.14, 0.87), fill)
    plate.position.y = 0.07
    const edges = new LineSegments(new EdgesGeometry(new BoxGeometry(0.87, 0.14, 0.87)), new LineBasicMaterial({ color: 0x3cc8f0 }))
    edges.position.y = 0.07
    const arrow = new Mesh(new ConeGeometry(0.08, 0.2, 3), fill)
    arrow.rotation.z = -Math.PI / 2
    arrow.position.set(0.55, 0.07, 0)
    this.ghost.add(plate, edges, arrow)
    this.ghost.visible = false
    this.scene.add(this.ghost)
  }

  private buildPaths() {
    const mat = new MeshBasicMaterial({ color: 0x3cc8f0, transparent: true, opacity: 0.75 })
    for (const traj of Object.values(TEAM_PATHS)) {
      const points: Vector3[] = []
      const n = 60
      for (let i = 0; i <= n; i++) {
        const s = traj.sample((traj.totalTime * i) / n)
        points.push(toThree(s.x, s.y, 0.025))
      }
      this.scene.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 200, 0.018, 8, false), mat))
    }
  }

  private placeRobot(state: RobotState, dt: number) {
    const r = this.robot
    const { x, y, theta } = state.pose
    // A conflicted drivetrain shakes a centimeter back and forth.
    const jitter = state.driveConflict ? (state.cycle % 2 ? 0.012 : -0.012) : 0
    r.root.position.copy(toThree(x + jitter * Math.cos(theta), y + jitter * Math.sin(theta), 0))
    r.root.rotation.y = yawOf(theta)
    r.pushout.position.x = state.pushout - 0.26
    r.hopperBalls.forEach((m, i) => (m.visible = i < Math.min(state.hopper, HOPPER_SLOTS)))

    const v = state.velocity
    r.modules.forEach((m, i) => {
      const mvx = v.vx - v.omega * m.y
      const mvy = v.vy + v.omega * m.x
      const speed = Math.hypot(mvx, mvy)
      if (speed > 0.01) {
        const want = Math.atan2(mvy, mvx)
        const current = m.yaw.rotation.y
        let d = wrap(want - current)
        let dir = 1
        if (Math.abs(d) > Math.PI / 2) {
          d = wrap(d + Math.PI)
          dir = -1
        }
        m.yaw.rotation.y = current + d * (state.driveConflict ? 1 : Math.min(1, dt * 25))
        this.wheelDistance[i] += dir * speed * dt
      }
      m.spin.rotation.z = -this.wheelDistance[i] / WHEEL_RADIUS
    })
    for (const f of r.flywheels) f.rotation.z -= (state.shooterOn ? 90 : 0) * dt
    for (const roller of r.rollers) roller.rotation.z -= (state.intakeOn ? 40 : 0) * dt
    const color = state.driveConflict ? LED.conflict : state.ghost || state.shooterOn ? LED.running : LED.idle
    r.ledMaterial.emissive.setHex(color)
    r.ledMaterial.emissiveIntensity = state.driveConflict ? 1.2 + Math.sin(performance.now() / 60) : 2.2
  }

  private placeGhost(state: RobotState) {
    const g = state.ghost
    this.ghost.visible = !!g
    if (g) {
      this.ghost.position.copy(toThree(g.x, g.y, 0))
      this.ghost.rotation.y = yawOf(g.theta)
    }
  }

  private placeBalls(state: RobotState) {
    while (this.ballPool.length < state.balls.length) {
      const m = new Mesh(ballGeometry, this.ballMaterial)
      m.castShadow = true
      this.scene.add(m)
      this.ballPool.push(m)
    }
    this.ballPool.forEach((m, i) => {
      const b = state.balls[i]
      m.visible = !!b
      if (b) m.position.copy(toThree(b.x, b.y, b.z))
    })
  }

  private updateFieldFuel(state: RobotState) {
    const taken = state.fuelTaken.reduce((n, t) => n + (t ? 1 : 0), 0)
    if (taken === this.shownFuelTaken) return
    this.shownFuelTaken = taken
    const m = new Matrix4()
    const hidden = new Matrix4().makeScale(0, 0, 0)
    FIELD_FUEL.forEach((f, i) => {
      if (state.fuelTaken[i]) this.fieldFuel.setMatrixAt(i, hidden)
      else {
        const p = toThree(f.x, f.y, f.z)
        this.fieldFuel.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z))
      }
    })
    this.fieldFuel.instanceMatrix.needsUpdate = true
  }
}
