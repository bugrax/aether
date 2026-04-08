import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Add platform class to body for CSS targeting
if (window.__TAURI_INTERNALS__) {
  document.body.classList.add('platform-desktop');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
