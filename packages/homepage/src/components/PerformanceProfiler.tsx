import { Profiler, ReactNode, ProfilerOnRenderCallback } from 'react'

interface PerformanceProfilerProps {
  id: string
  children: ReactNode
  enabled?: boolean
}

/**
 * Minimal React Profiler wrapper
 */
export const PerformanceProfiler = ({ id, children, enabled = false }: PerformanceProfilerProps) => {
  if (!enabled) return <>{children}</>

  const onRender: ProfilerOnRenderCallback = (
    profileId,
    phase,
    actualDuration
  ) => {
    console.log(`⚡ [${profileId}] ${phase}: ${actualDuration.toFixed(2)}ms`)
    
    if (actualDuration > 16.67) {
      console.warn(`🐌 Slow render in ${profileId}: ${actualDuration.toFixed(2)}ms`)
    }
  }

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  )
}