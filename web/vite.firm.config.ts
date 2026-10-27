import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'firm',
  cacheDir: '../.vite-firm',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    fs: { allow: ['..', '../..'] },
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
