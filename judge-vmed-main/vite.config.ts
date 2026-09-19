import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), cloudflare()],
  // Minify the Worker bundle for a smaller upload and faster cold starts.
  environments: { judge: { build: { minify: true } } },
});
