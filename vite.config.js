import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['sb-49k3c7l4leb4.vercel.run'],
  },
  build: {
    outDir: 'dist',
  },
});