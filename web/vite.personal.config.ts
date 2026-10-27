import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'personal',
  cacheDir: '../.vite-personal',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    fs: { allow: ['..', '../..'] },
    proxy: {
      '/api': 'http://localhost:8788',
    },
  },
});
