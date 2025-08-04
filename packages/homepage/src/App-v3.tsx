import HomePageV3 from './routes/HomePage-v3'
import { useTheme } from './hooks/useTheme'

/**
 * Main App component for the browse.show homepage v3.
 */
function AppV3() {
  useTheme()

  return <HomePageV3 />
}

export default AppV3