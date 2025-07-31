import { useState, useEffect, useCallback } from 'react'
import { useRenderTracker } from './useRenderTracker'

/**
 * Throttle function execution
 */
const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean
  return function(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

/**
 * Optimized scroll hook with throttling
 */
export const useOptimizedScroll = (threshold: number = 10, throttleMs: number = 16) => {
  const [scrolled, setScrolled] = useState(false)
  
  useRenderTracker('useOptimizedScroll')

  const handleScroll = useCallback(() => {
    const isScrolled = window.scrollY > threshold
    setScrolled(prev => {
      if (prev !== isScrolled) {
        return isScrolled
      }
      return prev
    })
  }, [threshold])

  // Create throttled version of the handler
  const throttledScrollHandler = useCallback(
    throttle(handleScroll, throttleMs),
    [handleScroll, throttleMs]
  )

  useEffect(() => {
    // Add the throttled event listener
    window.addEventListener('scroll', throttledScrollHandler, { passive: true })
    
    // Check initial scroll position
    handleScroll()
    
    return () => {
      window.removeEventListener('scroll', throttledScrollHandler)
    }
  }, [throttledScrollHandler, handleScroll])

  return scrolled
}