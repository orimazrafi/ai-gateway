import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const GATEWAY = 'http://localhost:3002'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/v1': { target: GATEWAY, changeOrigin: true },
      '/api': { target: GATEWAY, changeOrigin: true },
      '/auth': { target: GATEWAY, changeOrigin: true },
      '/health': { target: GATEWAY, changeOrigin: true },
    },
  },
})
