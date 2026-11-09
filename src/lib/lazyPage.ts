import { lazy, type ComponentType } from 'react'

const RELOAD_KEY = 'cq-stale-chunk-reload'
/** Do not reload again within this window, so a real outage cannot loop. */
const RELOAD_GUARD_MS = 30_000

/**
 * Each deploy renames the code-split files. A tab opened before a deploy still
 * asks for the old names, which now 404. Reload once to pick up the new build.
 * Returns true when a reload was started.
 */
export function reloadForNewBuild(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (now - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // Without storage we cannot guard against a reload loop, so do not reload.
    return false
  }
  window.location.reload()
  return true
}

/** React.lazy that reloads the page once if the chunk is gone after a deploy. */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((error: unknown) => {
      // Keep suspending while the page reloads instead of flashing an error.
      if (reloadForNewBuild()) return new Promise<never>(() => {})
      throw error
    }),
  )
}
