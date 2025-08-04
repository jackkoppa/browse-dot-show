import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppV3 from './App-v3.tsx'
import './index.css'
import './homepage-theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppV3 />
  </StrictMode>,
)