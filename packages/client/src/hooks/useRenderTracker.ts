import { useRef } from 'react'

/**
 * Minimal render tracking hook for debugging
 */
export const useRenderTracker = (componentName: string) => {
  // Only track if profiling is enabled via URL parameter
  const shouldTrack = typeof window !== 'undefined' && window.location.search.includes('profile=true')
  
  if (!shouldTrack) return

  const renderCount = useRef(0)
  renderCount.current++
  
  console.log(`🔄 [${componentName}] Render #${renderCount.current}`)
}