import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import fs from 'node:fs';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'strip-msw-worker',
      apply: 'build',
      closeBundle() {
        const swPath = path.resolve(__dirname, 'dist/mockServiceWorker.js');
        if (fs.existsSync(swPath)) {
          fs.unlinkSync(swPath);
        }
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'lightweight-charts': ['lightweight-charts'],
        },
      },
    },
  },
});
