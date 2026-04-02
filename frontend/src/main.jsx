import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'

// StatusBar overlay config is handled by capacitor.config.ts at startup.
// No need to re-apply here — doing so causes a layout reflow on Android.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
