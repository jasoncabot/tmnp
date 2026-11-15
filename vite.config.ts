import { defineConfig } from 'vite';

export default defineConfig({
  // Listen on all interfaces so phones and tablets on the same Wi-Fi can join (see the Network URL vite prints).
  server: { host: true },
  preview: { host: true },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
