import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dataDir = process.env.STEVENS_DATA_DIR;

export default defineConfig({
  root: 'personal',
  cacheDir: dataDir ? dataDir + '/.vite-personal' : '../.vite-personal',
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PERSONAL_WEB_PORT ?? 5173),
    fs: { allow: ['..', '../..'] },
    proxy: {
      '/api': process.env.PERSONAL_API_URL ?? 'http://localhost:8788',
    },
  },
});
