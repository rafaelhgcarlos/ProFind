import { useSyncExternalStore } from 'react'

import { serviceDateInTimeZone } from '../services/service-period-policy'

const listeners = new Set<() => void>()
let timer: number | undefined

function notify() {
  listeners.forEach((listener) => listener())
}

function schedule() {
  // Align checks to the minute so midnight in São Paulo updates all visible labels together.
  timer = window.setTimeout(() => {
    notify()
    if (listeners.size > 0) schedule()
  }, 60_000 - Date.now() % 60_000)
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    schedule()
    document.addEventListener('visibilitychange', notify)
    window.addEventListener('focus', notify)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', notify)
    window.removeEventListener('focus', notify)
  }
}

export function useServiceToday() {
  return useSyncExternalStore(subscribe, serviceDateInTimeZone, serviceDateInTimeZone)
}
