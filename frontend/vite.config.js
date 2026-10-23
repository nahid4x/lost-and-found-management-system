import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: proxy /api and /socket.io to the gateway so the browser stays same-origin (no CORS, cookies work).
const target = process.env.VITE_DEV_GATEWAY ?? 'https://localhost';
export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false, target: 'es2020', chunkSizeWarningLimit: 700 },
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true, secure: false },
      '/socket.io': { target, changeOrigin: true, secure: false, ws: true },
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.js'], include: ['src/**/*.test.{js,jsx}'], globals: true },
});
