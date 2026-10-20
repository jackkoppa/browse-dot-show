import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@browse-dot-show/blocks/fonts'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
