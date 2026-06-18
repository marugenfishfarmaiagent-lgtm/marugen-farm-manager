import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import { initMonitoring } from './lib/monitoring.js'
import './lib/connectionManager.js'

initMonitoring()

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)

// Dismiss splash once React has painted
requestAnimationFrame(() => {
  const splash = document.getElementById('splash')
  if (!splash) return
  splash.style.opacity = '0'
  setTimeout(() => splash.remove(), 380)
})
