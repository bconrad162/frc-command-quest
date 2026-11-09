import { BoxGeometry, DataTexture, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial } from 'three'
import { expect, test } from 'vitest'
import { disposeObject3D } from '../../src/components/robotLab/dispose.ts'

test('frees every geometry, material and texture under a root, once each', () => {
  const disposed: string[] = []
  const track = <T extends { addEventListener(t: 'dispose', f: () => void): void }>(name: string, o: T) => {
    o.addEventListener('dispose', () => disposed.push(name))
    return o
  }
  const sharedGeometry = track('geometry', new BoxGeometry())
  const map = track('texture', new DataTexture(new Uint8Array(4), 1, 1))
  const material = track('material', new MeshStandardMaterial({ map }))
  const other = track('material2', new MeshStandardMaterial())
  const root = new Group()
  const child = new Group()
  child.add(new Mesh(sharedGeometry, material), new Mesh(sharedGeometry, [other, material]))
  root.add(child)
  root.add(new LineSegments(track('edges', new EdgesGeometry(new BoxGeometry())), track('lineMaterial', new LineBasicMaterial())))

  disposeObject3D(root)

  expect(disposed.sort()).toEqual(['edges', 'geometry', 'lineMaterial', 'material', 'material2', 'texture'])
})
