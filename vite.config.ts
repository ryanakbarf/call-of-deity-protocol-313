import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
  build: {
    target: 'esnext',
    minify: 'terser',
  },
})
