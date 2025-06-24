import HomePage from './routes/HomePage'
import { useTheme } from './hooks/useTheme'

/**
 * Main App component for the browse.show homepage.
 */
function App() {
  useTheme()

  return <HomePage />
}

export default App
