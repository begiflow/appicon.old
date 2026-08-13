/**
 * Favicon / PWA specs.
 *
 * `favicon.ico` is assembled separately in the pipeline: it is an ICO container
 * wrapping 16/32/48px PNG payloads, which every browser back to IE11 accepts.
 */

import type { GenerateOptions, IconSpec, Platform, TextFile } from './types';

/** Sizes embedded inside the multi-resolution `favicon.ico`. */
export const ICO_SIZES = [16, 32, 48] as const;

const WEB_SPECS: readonly IconSpec[] = [
  { path: 'favicon-16x16.png', px: 16 },
  { path: 'favicon-32x32.png', px: 32 },
  { path: 'favicon-96x96.png', px: 96 },
  // Safari flattens alpha to black, so the touch icon ships opaque.
  { path: 'apple-touch-icon.png', px: 180, mode: 'opaque' },
  { path: 'android-chrome-192x192.png', px: 192 },
  { path: 'android-chrome-512x512.png', px: 512 },
  { path: 'maskable-icon-512x512.png', px: 512, mode: 'adaptive-fg' },
  { path: 'mstile-150x150.png', px: 150, mode: 'opaque' },
];

function manifest(o: GenerateOptions): string {
  return `${JSON.stringify(
    {
      name: o.appName,
      short_name: o.appName,
      icons: [
        { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        {
          src: 'maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
      theme_color: o.background,
      background_color: o.background,
      display: 'standalone',
    },
    null,
    2,
  )}\n`;
}

function snippet(o: GenerateOptions): string {
  return `<!-- Paste into <head> -->
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="${o.background}">
<meta name="msapplication-TileColor" content="${o.background}">
<meta name="msapplication-TileImage" content="/mstile-150x150.png">
`;
}

function webExtras(o: GenerateOptions): readonly TextFile[] {
  return [
    { path: 'site.webmanifest', contents: manifest(o) },
    { path: 'head-snippet.html', contents: snippet(o) },
  ];
}

export const WEB: Platform = {
  id: 'web',
  label: 'Web / PWA',
  hint: 'favicon.ico, touch icon, maskable, manifest',
  glyph:
    'M12 2a10 10 0 100 20 10 10 0 000-20zm7.94 9h-3.02a15.7 15.7 0 00-1.2-5.42A8.02 8.02 0 0119.94 11zM12 4.04c.83 1.2 1.63 3.3 1.85 6.96h-3.7c.22-3.66 1.02-5.76 1.85-6.96zM4.06 13h3.02c.13 2.03.53 3.87 1.2 5.42A8.02 8.02 0 014.06 13zm3.02-2H4.06a8.02 8.02 0 014.22-5.42A15.7 15.7 0 007.08 11zM12 19.96c-.83-1.2-1.63-3.3-1.85-6.96h3.7c-.22 3.66-1.02 5.76-1.85 6.96zm3.72-1.54c.67-1.55 1.07-3.39 1.2-5.42h3.02a8.02 8.02 0 01-4.22 5.42z',
  defaultOn: false,
  specs: WEB_SPECS,
  extras: webExtras,
};
