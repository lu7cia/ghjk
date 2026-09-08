import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves a project site from /<repo-name>/, not /. The Pages
  // workflow sets GHJK_BASE for that build; local dev and every other host
  // (Vercel, Netlify, a custom domain) keep serving from root.
  base: process.env.GHJK_BASE || '/',
  server: { port: 5173, host: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
