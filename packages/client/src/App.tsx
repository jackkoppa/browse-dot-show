import { Routes, Route, Navigate } from 'react-router'
import HomePage from './routes/HomePage'
import EpisodeRoute from './routes/EpisodeRoute'
import { useTheme } from './hooks/useTheme'
import { SubscriberProvider } from './subscriber/SubscriberContext'
import AuthCallbackRoute from './subscriber/AuthCallbackRoute'

/**
 * Main App component that sets up routing configuration.
 */
function App() {
  useTheme()

  return (
    <SubscriberProvider>
      <Routes>
        <Route path="/" element={<HomePage />}>
          {/* Child route for episode sheet overlay */}
          <Route path="episode/:eID" element={<EpisodeRoute />} />
        </Route>
        {/* Where subscriber login links return to (sites with subscriber access) */}
        <Route path="/auth/callback" element={<AuthCallbackRoute />} />
        {/* Redirect invalid episode route to home */}
        <Route path="/episode" element={<Navigate to="/" replace />} />
      </Routes>
    </SubscriberProvider>
  )
}

export default App
