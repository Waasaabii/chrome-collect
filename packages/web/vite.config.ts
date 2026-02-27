import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [UnoCSS(), react()],
  build: {
    outDir: '../server/web/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3210',
      '/pages': 'http://localhost:3210',
      '/export': 'http://localhost:3210',
    },
  },
})
