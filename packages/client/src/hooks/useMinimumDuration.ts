import { useEffect, useRef, useState } from 'react'

/**
 * Follows `active`, but once it turns on, stays on for at least `minMs`, so an indicator for
 * something quick (like a fast search) is still on screen long enough to see.
 */
export function useMinimumDuration(active: boolean, minMs: number): boolean {
  const [shown, setShown] = useState(active)
  const startedAt = useRef<number | null>(active ? Date.now() : null)

  useEffect(() => {
    if (active) {
      startedAt.current ??= Date.now()
      setShown(true)
      return
    }
    if (startedAt.current === null) return

    const remaining = minMs - (Date.now() - startedAt.current)
    const timeout = setTimeout(() => {
      startedAt.current = null
      setShown(false)
    }, Math.max(0, remaining))
    return () => clearTimeout(timeout)
  }, [active, minMs])

  return shown
}
