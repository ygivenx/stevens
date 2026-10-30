import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dataDir = process.env.STEVENS_DATA_DIR;

export default defineConfig({
  root: 'firm',
  cacheDir: dataDir ? dataDir + '/.vite-firm' : '../.vite-firm',
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.FIRM_WEB_PORT ?? 5174),
    fs: { allow: ['..', '../..'] },
    proxy: {
      '/api': process.env.FIRM_API_URL ?? 'http://localhost:8787',
    },
  },
});
