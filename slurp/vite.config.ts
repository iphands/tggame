import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  base: './',
  publicDir: 'public',
  server: {
    port: 5178,
    strictPort: true,
    host: true, // reachable from phones on the LAN
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
