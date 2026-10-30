import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Your FastAPI backend
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',        // matches Capacitor's Android WebView and every current browser
    cssCodeSplit: true,
    reportCompressedSize: false,
  },
})
