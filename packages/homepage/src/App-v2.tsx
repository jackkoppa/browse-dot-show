import HomePageV2 from './routes/HomePage-v2'
import { useTheme } from './hooks/useTheme'

/**
 * Main App component for the browse.show homepage v2.
 */
function AppV2() {
  useTheme()

  return <HomePageV2 />
}

export default AppV2