
import HomePage from './routes/HomePage'
import { useOptimizedTheme } from './hooks/useOptimizedTheme'
import { PerformanceProfiler } from './components/PerformanceProfiler'

// Enable profiling when explicitly requested
const PROFILING_ENABLED = (typeof window !== 'undefined' && window.location.search.includes('profile=true')) || 
                          import.meta.env.VITE_ENABLE_PROFILING === 'true'

/**
 * Main App component for the browse.show homepage.
 */
function App() {
  // Use optimized theme hook
  useOptimizedTheme()

  return (
    <PerformanceProfiler id="App" enabled={PROFILING_ENABLED}>
      <HomePage />
    </PerformanceProfiler>
  )
}

export default App
