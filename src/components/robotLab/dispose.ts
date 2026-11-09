import { type BufferGeometry, Line, type Material, Mesh, type Object3D, Points, type Texture } from 'three'

/**
 * Frees the GPU resources (geometries, materials and their textures) of every
 * mesh, line and point cloud under `root`, each once. WebGLRenderer.dispose() does not do this.
 */
export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  root.traverse((o) => {
    if (!(o instanceof Mesh || o instanceof Line || o instanceof Points)) return
    geometries.add(o.geometry)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m)
  })
  for (const m of materials) {
    for (const value of Object.values(m)) {
      if (value && typeof value === 'object' && (value as Texture).isTexture) textures.add(value as Texture)
    }
  }
  geometries.forEach((g) => g.dispose())
  materials.forEach((m) => m.dispose())
  textures.forEach((t) => t.dispose())
}
