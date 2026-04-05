import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In Docker builds, @capacitor-firebase/authentication is not installed.
// Mark it external only when DOCKER_BUILD env is set.
const isDocker = process.env.DOCKER_BUILD === '1'

export default defineConfig({
  plugins: [react()],
  envDir: '../',
  build: {
    rollupOptions: {
      external: isDocker ? [
        '@capacitor-firebase/authentication',
        '@capacitor-firebase/analytics',
        '@capacitor-firebase/messaging',
        '@capacitor/local-notifications',
      ] : [],
    },
  },
})
