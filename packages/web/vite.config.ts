import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  base: './',
  plugins: [UnoCSS(), react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
