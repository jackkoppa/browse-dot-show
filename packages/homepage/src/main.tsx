import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Space Mono (--font-mono in the base theme), self-hosted
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/400-italic.css'
import '@fontsource/space-mono/700.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
