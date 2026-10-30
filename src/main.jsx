import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// IBM Plex Sans, bundled with the app (works offline and inside the Android app).
// Only the character sets a page actually uses are downloaded.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import './index.css'
import App from './App.jsx'
import { initTheme } from './utils/theme'

// Apply the saved light/dark choice before the first render (no flash of the wrong theme).
initTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
