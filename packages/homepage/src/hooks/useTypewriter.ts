import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface TypewriterOptions {
  /** ms per character typed */
  typeMs?: number
  /** ms to hold the full string before deleting it */
  holdMs?: number
  /** ms per character deleted */
  deleteMs?: number
  /** Stops on the current string */
  paused?: boolean
}

/**
 * Types each string out, holds it, deletes it, and moves to the next.
 * With reduced motion, shows each string whole instead.
 */
export function useTypewriter(strings: string[], { typeMs = 80, holdMs = 3200, deleteMs = 30, paused = false }: TypewriterOptions = {}) {
  const reducedMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [length, setLength] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const current = strings[index % strings.length] ?? ''

  useEffect(() => {
    if (paused) return
    if (reducedMotion) {
      const timer = setTimeout(() => setIndex(i => i + 1), holdMs * 1.5)
      return () => clearTimeout(timer)
    }
    if (deleting && length === 0) {
      setDeleting(false)
      setIndex(i => i + 1)
      return
    }
    const timer = deleting
      ? setTimeout(() => setLength(l => l - 1), deleteMs)
      : length < current.length
        ? setTimeout(() => setLength(l => l + 1), typeMs)
        : setTimeout(() => setDeleting(true), holdMs)
    return () => clearTimeout(timer)
  }, [paused, reducedMotion, deleting, length, current, typeMs, holdMs, deleteMs])

  return { text: reducedMotion ? current : current.slice(0, length), index: index % strings.length }
}
