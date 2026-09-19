import { defineConfig } from 'vitest/config';

// Tests skip the Cloudflare Vite plugin; React tests opt into happy-dom per file.
export default defineConfig({
  test: {
    include: ['worker/**/*.test.ts', 'shared/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
