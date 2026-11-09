/**
 * A procedural swerve robot sized from team 5829's PathPlanner settings
 * (0.87 m with bumpers, modules at ±0.2937 m, 0.0381 m wheels). Local frame:
 * +x forward, +y up, −z left (three.js), matching yawOf() in coords.ts.
 */
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'

export const WHEEL_RADIUS = 0.0381
export const MODULE_OFFSET = 0.2937
export const BALL_RADIUS = 0.075
export const HOPPER_SLOTS = 48

export interface RobotParts {
  root: Group
  /** Per module: yaw group, wheel spin group, and robot-relative position (x forward, y left). */
  modules: { yaw: Group; spin: Group; x: number; y: number }[]
  flywheels: Group[]
  rollers: Group[]
  pushout: Group
  hopperBalls: Mesh[]
  leds: Mesh[]
  ledMaterial: MeshStandardMaterial
}

export function fuelMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0xf2d22e, roughness: 0.85, metalness: 0 })
}

export const ballGeometry = new SphereGeometry(BALL_RADIUS, 20, 14)

function numberTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = '#1d4fd6'
    g.fillRect(0, 0, 512, 128)
    g.fillStyle = '#ffffff'
    g.font = '700 96px "Chakra Petch", Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 256, 70)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function buildRobot(teamNumber = '5829'): RobotParts {
  const M = {
    alu: new MeshStandardMaterial({ color: 0xc3ccd6, metalness: 0.9, roughness: 0.32 }),
    aluDark: new MeshStandardMaterial({ color: 0x59636f, metalness: 0.85, roughness: 0.4 }),
    dark: new MeshStandardMaterial({ color: 0x1b2129, metalness: 0.35, roughness: 0.55 }),
    rubber: new MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.92 }),
    orange: new MeshStandardMaterial({ color: 0xf07a12, metalness: 0.3, roughness: 0.45 }),
    green: new MeshStandardMaterial({ color: 0x46b04f, roughness: 0.7 }),
    red: new MeshStandardMaterial({ color: 0xc8302c, roughness: 0.5 }),
    bumper: new MeshStandardMaterial({ color: 0x1d4fd6, roughness: 0.96 }),
    poly: new MeshPhysicalMaterial({ color: 0xd7ecff, roughness: 0.08, transparent: true, opacity: 0.16, depthWrite: false }),
  }
  const ledMaterial = new MeshStandardMaterial({ color: 0x111111, emissive: 0x3cc8f0, emissiveIntensity: 2.2 })
  const box = (w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }
  const cyl = (r: number, len: number, mat: Material, seg = 28) => {
    const m = new Mesh(new CylinderGeometry(r, r, len, seg), mat)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  const root = new Group()
  root.name = 'robot'
  const FRAME = 0.69, BUMP = 0.09, OUT = FRAME + 2 * BUMP
  const by = 0.095, bh = 0.125
  root.add(box(OUT, bh, BUMP, M.bumper, 0, by, -(FRAME / 2 + BUMP / 2)))
  root.add(box(OUT, bh, BUMP, M.bumper, 0, by, FRAME / 2 + BUMP / 2))
  root.add(box(BUMP, bh, FRAME, M.bumper, FRAME / 2 + BUMP / 2, by, 0))
  root.add(box(BUMP, bh, FRAME, M.bumper, -(FRAME / 2 + BUMP / 2), by, 0))
  const numMat = new MeshStandardMaterial({ map: numberTexture(teamNumber), roughness: 0.95 })
  for (const side of [-1, 1]) {
    const p = new Mesh(new PlaneGeometry(0.52, 0.11), numMat)
    p.position.set(0, by, side * (OUT / 2 + 0.002))
    if (side < 0) p.rotation.y = Math.PI
    root.add(p)
  }
  root.add(box(FRAME, 0.008, FRAME, M.aluDark, 0, 0.055, 0))
  for (const s of [-1, 1]) {
    root.add(box(FRAME, 0.05, 0.025, M.alu, 0, 0.085, s * (FRAME / 2 - 0.0125)))
    root.add(box(0.025, 0.05, FRAME, M.alu, s * (FRAME / 2 - 0.0125), 0.085, 0))
  }
  root.add(box(0.025, 0.05, FRAME, M.alu, 0.05, 0.085, 0))
  root.add(box(0.18, 0.17, 0.08, M.rubber, -0.18, 0.15, 0.22)) // battery
  root.add(box(0.15, 0.03, 0.11, M.dark, 0.12, 0.075, -0.2)) // controller
  root.add(box(0.14, 0.04, 0.09, M.red, 0.12, 0.08, 0.18)) // power distribution

  const modules: RobotParts['modules'] = []
  for (const [mx, mz] of [
    [MODULE_OFFSET, -MODULE_OFFSET],
    [MODULE_OFFSET, MODULE_OFFSET],
    [-MODULE_OFFSET, -MODULE_OFFSET],
    [-MODULE_OFFSET, MODULE_OFFSET],
  ]) {
    const mod = new Group()
    mod.position.set(mx, 0, mz)
    const yaw = new Group()
    mod.add(yaw)
    yaw.add(box(0.1, 0.07, 0.1, M.dark, 0, 0.115, 0))
    const motor = cyl(0.03, 0.09, M.aluDark)
    motor.position.set(0, 0.19, 0)
    yaw.add(motor)
    yaw.add(box(0.09, 0.07, 0.012, M.alu, 0, 0.06, 0.03))
    yaw.add(box(0.09, 0.07, 0.012, M.alu, 0, 0.06, -0.03))
    const spin = new Group()
    spin.position.y = WHEEL_RADIUS
    yaw.add(spin)
    const tire = cyl(WHEEL_RADIUS, 0.038, M.rubber, 36)
    tire.rotation.x = Math.PI / 2
    spin.add(tire)
    const hub = cyl(0.026, 0.04, M.orange, 6)
    hub.rotation.x = Math.PI / 2
    spin.add(hub)
    root.add(mod)
    modules.push({ yaw, spin, x: mx, y: -mz })
  }

  // Hopper with visible fuel.
  const hop = new Group()
  hop.position.set(0.03, 0.17, 0)
  root.add(hop)
  const hw = 0.42, hd = 0.58, hh = 0.42
  for (const [w, h, d, x, y, z] of [
    [hw, hh, 0.004, 0, hh / 2, hd / 2],
    [hw, hh, 0.004, 0, hh / 2, -hd / 2],
    [0.004, hh, hd, hw / 2, hh / 2, 0],
    [0.004, hh, hd, -hw / 2, hh / 2, 0],
  ]) {
    const p = new Mesh(new BoxGeometry(w, h, d), M.poly)
    p.position.set(x, y, z)
    hop.add(p)
  }
  for (const [x, z] of [
    [hw / 2, hd / 2],
    [hw / 2, -hd / 2],
    [-hw / 2, hd / 2],
    [-hw / 2, -hd / 2],
  ])
    hop.add(box(0.022, hh, 0.022, M.alu, x, hh / 2, z))
  const leds = [box(hw, 0.012, 0.012, ledMaterial, 0, hh + 0.01, hd / 2), box(hw, 0.012, 0.012, ledMaterial, 0, hh + 0.01, -hd / 2)]
  leds.forEach((l) => hop.add(l))
  const fuel = fuelMaterial()
  const hopperBalls: Mesh[] = []
  for (let layer = 0; layer < 4; layer++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 4; j++) {
        const m = new Mesh(ballGeometry, fuel)
        m.position.copy(new Vector3(-0.13 + i * 0.13 + (layer % 2) * 0.03, 0.08 + layer * 0.13, -0.21 + j * 0.14))
        m.castShadow = true
        hop.add(m)
        hopperBalls.push(m)
      }

  // Shooter at the back: two flywheels and a hood.
  const shooter = new Group()
  shooter.position.set(-0.3, 0.42, 0)
  root.add(shooter)
  shooter.add(box(0.012, 0.32, 0.5, M.alu))
  const flywheels: Group[] = []
  for (const [y, r] of [
    [0.06, 0.05],
    [-0.07, 0.045],
  ]) {
    const fw = new Group()
    fw.position.set(-0.04, y, 0)
    shooter.add(fw)
    const w = cyl(r, 0.46, M.rubber, 32)
    w.rotation.x = Math.PI / 2
    fw.add(w)
    for (const z of [-0.18, 0, 0.18]) {
      const stripe = cyl(r + 0.002, 0.02, M.orange, 32)
      stripe.rotation.x = Math.PI / 2
      stripe.position.z = z
      fw.add(stripe)
    }
    flywheels.push(fw)
  }
  for (const s of [-1, 1]) shooter.add(box(0.16, 0.26, 0.01, M.aluDark, -0.06, 0, s * 0.245))
  const hood = box(0.18, 0.012, 0.47, M.dark, -0.1, 0.15, 0)
  hood.rotation.z = -0.5
  shooter.add(hood)

  // Intake pushout at the front.
  const pushout = new Group()
  root.add(pushout)
  for (const s of [-1, 1]) pushout.add(box(0.26, 0.03, 0.02, M.alu, 0.33, 0.13, s * 0.3))
  const rollers: Group[] = []
  for (const [x, y] of [
    [0.46, 0.11],
    [0.4, 0.2],
  ]) {
    const r = new Group()
    r.position.set(x, y, 0)
    pushout.add(r)
    const shaft = cyl(0.008, 0.62, M.alu, 12)
    shaft.rotation.x = Math.PI / 2
    r.add(shaft)
    for (let i = -3; i <= 3; i++) {
      const w = cyl(0.032, 0.05, M.green, 18)
      w.rotation.x = Math.PI / 2
      w.position.z = i * 0.085
      r.add(w)
    }
    rollers.push(r)
  }
  return { root, modules, flywheels, rollers, pushout, hopperBalls, leds, ledMaterial }
}
