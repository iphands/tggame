import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  base: './',
  publicDir: 'public',
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  }
});
