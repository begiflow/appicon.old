import { defineConfig } from 'vite';

/**
 * `base` must match the GitHub Pages sub-path (`/<repo>/`) or every hashed asset
 * 404s. Overridable via `BASE_PATH` so a custom domain (or a fork under another
 * repo name) can build with `BASE_PATH=/ npm run build`.
 */
const base = process.env.BASE_PATH ?? '/appicon.old/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: true,
    // Ship a single JS chunk plus the worker; there is nothing to code-split
    // in a page this size, and one fewer request beats a marginally smaller one.
    chunkSizeWarningLimit: 700,
  },
  worker: {
    format: 'es',
  },
});
