import { useEffect, useState, useSyncExternalStore } from 'react'
import { appStore } from '../lib/appStore.ts'
import type { AppState, TeamProfile } from '../types/app.ts'

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.getState()))
}

export function useActiveProfile(): TeamProfile | undefined {
  const state = useSyncExternalStore(appStore.subscribe, appStore.getState)
  return state.profiles.find((p) => p.id === state.activeProfileId)
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function usePrefersReducedMotion(): boolean {
  const forced = useAppState((s) => s.settings.reducedMotion)
  const [system, setSystem] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  )
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fn = () => setSystem(mq.matches)
    mq.addEventListener?.('change', fn)
    return () => mq.removeEventListener?.('change', fn)
  }, [])
  return forced || system
}
