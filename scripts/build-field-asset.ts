/**
 * Builds the Robot Lab's 2026 REBUILT field from AdvantageScope's field model.
 *
 *   npm run assets:field
 *
 * Source (first that exists):
 *   1. $ADVANTAGESCOPE_FIELD_GLB
 *   2. ~/.config/AdvantageScope/autoAssets/Field3d_2026FRCFieldV1/model.glb
 *   3. Field3d_2026FRCFieldV1.zip from the archive-v1 release of
 *      Mechanical-Advantage/AdvantageScopeAssets, downloaded into .cache/
 *
 * Output:
 *   public/models/field-2026.glb      merged by material, meshopt-compressed, fuel removed
 *   src/game/robotLab/fieldFuel.json  fuel ball positions in the WPILib field frame
 *
 * The model is BSD 3-clause licensed (Littleton Robotics); see
 * public/models/LICENSE-AdvantageScopeAssets.txt.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join as joinPath } from 'node:path'
import { NodeIO, type Node } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, getBounds, join, meshopt, prune, simplify, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const FIELD_L = 16.541
const FIELD_W = 8.069
const OUT_GLB = 'public/models/field-2026.glb'
const OUT_FUEL = 'src/game/robotLab/fieldFuel.json'
const RELEASE_ZIP =
  'https://github.com/Mechanical-Advantage/AdvantageScopeAssets/releases/download/archive-v1/Field3d_2026FRCFieldV1.zip'

async function sourcePath(): Promise<string> {
  const env = process.env.ADVANTAGESCOPE_FIELD_GLB
  if (env && existsSync(env)) return env
  const local = joinPath(homedir(), '.config/AdvantageScope/autoAssets/Field3d_2026FRCFieldV1/model.glb')
  if (existsSync(local)) return local
  const dir = '.cache/field-2026'
  const glb = joinPath(dir, 'Field3d_2026FRCFieldV1/model.glb')
  if (existsSync(glb)) return glb
  mkdirSync(dir, { recursive: true })
  console.log(`Downloading ${RELEASE_ZIP}`)
  const res = await fetch(RELEASE_ZIP)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const zip = joinPath(dir, 'field.zip')
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir])
  if (!existsSync(glb)) throw new Error(`Expected ${glb} inside the zip`)
  return glb
}

const isFuel = (n: Node) => /fuel/i.test(n.getName())

async function main() {
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  await MeshoptSimplifier.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
  const src = await sourcePath()
  console.log(`Reading ${src}`)
  const doc = await io.read(src)
  const root = doc.getRoot()

  // Fuel: a node named like fuel whose ancestors are not. Record centers, then remove.
  const fuelRoots: Node[] = []
  for (const node of root.listNodes()) {
    if (!isFuel(node)) continue
    let parent = node.getParentNode()
    let nested = false
    while (parent) {
      if (isFuel(parent)) nested = true
      parent = parent.getParentNode()
    }
    if (!nested) fuelRoots.push(node)
  }
  const round = (v: number) => Math.round(v * 1000) / 1000
  const fuel = fuelRoots.map((node) => {
    const { min, max } = getBounds(node)
    const [X, Y, Z] = [0, 1, 2].map((i) => (min[i] + max[i]) / 2)
    return { x: round(FIELD_L / 2 - X), y: round(Z + FIELD_W / 2), z: round(Y) }
  })
  for (const node of fuelRoots) {
    node.traverse((n) => n.dispose())
  }

  // The CAD export marks everything as polished metal; make most of it matte.
  for (const mat of root.listMaterials()) {
    const [r, g, b, a] = mat.getBaseColorFactor()
    const gray = Math.abs(r - g) < 0.03 && Math.abs(g - b) < 0.03
    if (a < 1) {
      mat.setAlphaMode('BLEND').setMetallicFactor(0).setRoughnessFactor(0.1)
    } else if (gray && r > 0.3) {
      mat.setMetallicFactor(0.55).setRoughnessFactor(0.42)
    } else {
      mat.setMetallicFactor(0.05).setRoughnessFactor(0.72)
    }
  }

  await doc.transform(
    dedup(),
    flatten(),
    join({ keepNamed: false }),
    weld(),
    // CAD tessellation is ~3M triangles; keep ~1 cm accuracy (error is a fraction of each mesh's size).
    simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: 0.0008 }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )

  mkdirSync('public/models', { recursive: true })
  mkdirSync('src/game/robotLab', { recursive: true })
  await io.write(OUT_GLB, doc)
  writeFileSync(OUT_FUEL, JSON.stringify(fuel) + '\n')
  console.log(
    `Wrote ${OUT_GLB}: ${(statSync(OUT_GLB).size / 1e6).toFixed(2)} MB, ${root.listMeshes().length} meshes, ` +
      `${root.listMaterials().length} materials. Wrote ${OUT_FUEL}: ${fuel.length} fuel.`,
  )
}

await main()
