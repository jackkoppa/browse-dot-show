import { Routes, Route, Navigate } from 'react-router'
import HomePage from './routes/HomePage'
import EpisodeRoute from './routes/EpisodeRoute'
import { useOptimizedTheme } from './hooks/useOptimizedTheme'
import { PerformanceProfiler } from './components/PerformanceProfiler'

// Enable profiling when explicitly requested
const PROFILING_ENABLED = (typeof window !== 'undefined' && window.location.search.includes('profile=true')) || 
                          import.meta.env.VITE_ENABLE_PROFILING === 'true'

/**
 * Main App component that sets up routing configuration.
 */
function App() {
  useOptimizedTheme()

  return (
    <PerformanceProfiler id="App" enabled={PROFILING_ENABLED}>
      <Routes>
        <Route path="/" element={<HomePage />}>
          {/* Child route for episode sheet overlay */}
          <Route path="episode/:eID" element={<EpisodeRoute />} />
        </Route>
        {/* Redirect invalid episode route to home */}
        <Route path="/episode" element={<Navigate to="/" replace />} />
      </Routes>
    </PerformanceProfiler>
  )
}

export default App
