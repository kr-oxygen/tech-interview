import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const api = process.env.API_URL ?? 'http://localhost:3001';
const proxy = {
  '/api': { target: api, changeOrigin: true },
  '/socket.io': { target: api, ws: true, changeOrigin: true },
};
// Tunnels used to share a local instance with a candidate (see CLAUDE.md, "Sharing over the internet").
const allowedHosts = ['.ngrok-free.app', '.ngrok.app', '.ngrok.io', '.trycloudflare.com'];

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Consume shared contracts from source: HMR + no CJS interop in the browser.
    alias: { '@ti/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy,
    allowedHosts,
  },
  // `pnpm --filter @ti/web preview` serves the production build with the same proxy.
  preview: { port: 4173, proxy, allowedHosts },
  test: {
    environment: 'jsdom',
  },
});
