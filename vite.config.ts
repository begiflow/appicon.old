import { defineConfig } from 'vite';

// Cloudflare serves the Worker from the domain root, so the GitHub Pages
// sub-path would 404 every hashed asset there. Both Workers Builds and Pages
// set these in the build container.
const onCloudflare = Boolean(process.env.WORKERS_CI ?? process.env.CF_PAGES);

/**
 * `base` must match the GitHub Pages sub-path (`/<repo>/`) or every hashed asset
 * 404s. Overridable via `BASE_PATH` so a custom domain (or a fork under another
 * repo name) can build with `BASE_PATH=/ npm run build`.
 */
const base = process.env.BASE_PATH ?? (onCloudflare ? '/' : '/appicon.old/');

export default defineConfig({
  base,
  // Empty, but `wrangler deploy` refuses to run its Vite setup without it.
  plugins: [],
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
