import { Routes, Route, Navigate } from 'react-router'
import HomePage from './routes/HomePage'
import EpisodeRoute from './routes/EpisodeRoute'
import { useTheme } from './hooks/useTheme'

/**
 * Main App component that sets up routing configuration.
 */
function App() {
  useTheme()

  return (
    <Routes>
      <Route path="/" element={<HomePage />}>
        {/* Child route for episode sheet overlay */}
        <Route path="episode/:eID" element={<EpisodeRoute />} />
      </Route>
      {/* Redirect invalid episode route to home */}
      <Route path="/episode" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
