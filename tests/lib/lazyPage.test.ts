// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadForNewBuild } from '../../src/lib/lazyPage.ts'

describe('reloadForNewBuild', () => {
  const reload = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    reload.mockClear()
    vi.stubGlobal('location', { ...window.location, reload })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reloads once after a deploy renamed the chunks', () => {
    expect(reloadForNewBuild(100_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not loop when the chunk is still missing right after the reload', () => {
    reloadForNewBuild(100_000)
    expect(reloadForNewBuild(110_000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again for a later deploy', () => {
    reloadForNewBuild(100_000)
    expect(reloadForNewBuild(200_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
