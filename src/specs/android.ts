/**
 * Android launcher-icon specs.
 *
 * Two independent platforms:
 *
 * - `android`          — legacy raster launcher icons (`ic_launcher.png` +
 *                        `ic_launcher_round.png`) plus the 512px Play Store
 *                        listing icon. Still required as the API < 26 fallback.
 * - `android-adaptive` — API 26+ adaptive icons: a 108dp foreground layer with
 *                        the artwork inset into the central 72dp safe area, a
 *                        108dp background layer, and the `anydpi-v26` XML that
 *                        binds them.
 *
 * Density multipliers are the platform constants: mdpi = 1x (baseline),
 * hdpi = 1.5x, xhdpi = 2x, xxhdpi = 3x, xxxhdpi = 4x.
 */

import type { IconSpec, Platform, TextFile } from './types';

const DENSITIES = [
  { dir: 'mdpi', scale: 1 },
  { dir: 'hdpi', scale: 1.5 },
  { dir: 'xhdpi', scale: 2 },
  { dir: 'xxhdpi', scale: 3 },
  { dir: 'xxxhdpi', scale: 4 },
] as const;

/** Legacy launcher icon baseline is 48dp. */
const LEGACY_DP = 48;
/** Adaptive icon layers are 108dp; only the central 72dp is guaranteed visible. */
const ADAPTIVE_DP = 108;

/* ------------------------------------------------------- legacy (raster) */

const ANDROID_SPECS: readonly IconSpec[] = [
  ...DENSITIES.flatMap(({ dir, scale }): IconSpec[] => {
    const px = Math.round(LEGACY_DP * scale);
    return [
      { path: `res/mipmap-${dir}/ic_launcher.png`, px },
      { path: `res/mipmap-${dir}/ic_launcher_round.png`, px, mode: 'circle' },
    ];
  }),
  {
    // Google Play listing asset. 32-bit PNG, no alpha permitted. Lives outside
    // the project tree, hence `absolutePath`.
    path: 'play_store_512.png',
    absolutePath: 'play-store/icon-512.png',
    px: 512,
    mode: 'opaque',
  },
];

/* ----------------------------------------------------------- adaptive */

const ADAPTIVE_SPECS: readonly IconSpec[] = DENSITIES.flatMap(({ dir, scale }): IconSpec[] => {
  const px = Math.round(ADAPTIVE_DP * scale);
  return [
    { path: `res/mipmap-${dir}/ic_launcher_foreground.png`, px, mode: 'adaptive-fg' },
    { path: `res/mipmap-${dir}/ic_launcher_background.png`, px, mode: 'adaptive-bg' },
  ];
});

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;

function adaptiveExtras(): readonly TextFile[] {
  return [
    { path: 'res/mipmap-anydpi-v26/ic_launcher.xml', contents: ADAPTIVE_XML },
    { path: 'res/mipmap-anydpi-v26/ic_launcher_round.xml', contents: ADAPTIVE_XML },
  ];
}

/* --------------------------------------------------------------- Platforms */

const ANDROID_GLYPH =
  'M17.6 9.48l1.84-3.18a.38.38 0 00-.14-.52.38.38 0 00-.52.14l-1.87 3.23a11.4 11.4 0 00-9.82 0L5.22 5.92a.38.38 0 00-.52-.14.38.38 0 00-.14.52L6.4 9.48A10.8 10.8 0 001 18h22a10.8 10.8 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z';

export const ANDROID: Platform = {
  id: 'android',
  label: 'Android',
  hint: 'mipmap-mdpi → xxxhdpi + Play Store 512',
  glyph: ANDROID_GLYPH,
  defaultOn: true,
  specs: ANDROID_SPECS,
};

export const ANDROID_ADAPTIVE: Platform = {
  id: 'android-adaptive',
  label: 'Android Adaptive',
  hint: 'API 26+ · foreground/background layers + XML',
  glyph: ANDROID_GLYPH,
  defaultOn: false,
  specs: ADAPTIVE_SPECS,
  extras: adaptiveExtras,
};

export { ADAPTIVE_DP };
