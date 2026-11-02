declare const process: { env: { VERCEL?: string } };
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VERCEL ? '/' : '/Rukam/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
