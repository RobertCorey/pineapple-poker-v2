import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code (Firebase SDK, React) into their own
        // chunks so they cache across deploys and the app chunk shrinks.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase'
            if (id.includes('/react') || id.includes('/scheduler/')) return 'react-vendor'
          }
        },
      },
    },
  },
})
