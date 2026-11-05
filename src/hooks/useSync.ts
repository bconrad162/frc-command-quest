import { useCallback, useEffect, useRef, useState } from 'react'
import { appStore } from '../lib/appStore.ts'
import { isBackendConfigured } from '../lib/supabase.ts'
import { backoffMs, flushOutbox, type SyncStatus } from '../lib/sync.ts'
import { useActiveProfile, useAppState } from './useAppState.ts'

/** Keeps the active team's outbox flowing to the server. Safe to mount once in the shell. */
export function useOutboxSync(): { status: SyncStatus; pending: number; rejected: number; retry: () => void } {
  const profile = useActiveProfile()
  const items = useAppState((s) => s.outbox)
  const mine = profile ? items.filter((o) => o.profileId === profile.id) : []
  const pending = mine.filter((o) => !o.rejected).length
  const rejected = mine.filter((o) => o.rejected).length
  const [status, setStatus] = useState<SyncStatus>('idle')
  const running = useRef(false)
  const failures = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runRef = useRef<() => void>(() => undefined)
  const profileId = profile?.classroom ? profile.id : null

  const run = useCallback(async () => {
    if (!isBackendConfigured || !profileId || running.current) return
    if (appStore.outboxFor(profileId).filter((o) => !o.rejected).length === 0) {
      setStatus('idle')
      return
    }
    running.current = true
    setStatus('syncing')
    const result = await flushOutbox(appStore, profileId)
    running.current = false
    setStatus(result)
    if (result === 'idle') failures.current = 0
    else {
      failures.current += 1
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => runRef.current(), backoffMs(failures.current))
    }
  }, [profileId])

  useEffect(() => {
    runRef.current = () => void run()
  }, [run])

  useEffect(() => {
    void run()
  }, [run, pending])

  useEffect(() => {
    const online = () => {
      failures.current = 0
      void run()
    }
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('online', online)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [run])

  return { status, pending, rejected, retry: () => void run() }
}
