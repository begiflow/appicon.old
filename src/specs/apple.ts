/**
 * Apple asset-catalog specs.
 *
 * Sizes are the full legacy set. Xcode 15+ only *requires* a single 1024pt
 * universal entry for iOS, but the complete set remains valid, keeps older
 * projects building, and is what the original generator emitted — so we keep it.
 *
 * Filenames follow the `Icon-App-{pt}x{pt}@{scale}x.png` convention used by the
 * Flutter/`appicon` toolchain. iPhone and iPad deliberately share filenames
 * where the pixel size is identical: `Contents.json` then carries two entries
 * (one per idiom) pointing at the same file, which is exactly what Xcode's own
 * templates do.
 */

import type { CatalogEntry, IconSpec, Platform, WatchRole, WatchSubtype } from './types';

/** Apple writes fractional point sizes verbatim, e.g. `83.5x83.5`. */
function ptLabel(pt: number): string {
  return `${pt}x${pt}`;
}

/** Helper for an `.appiconset` member. */
function apple(
  namePrefix: string,
  pt: number,
  scale: 1 | 2 | 3,
  catalog: Omit<CatalogEntry, 'size' | 'scale'>,
): IconSpec {
  const px = Math.round(pt * scale);
  return {
    path: `AppIcon.appiconset/${namePrefix}-${ptLabel(pt)}@${scale}x.png`,
    px,
    catalog: { ...catalog, size: ptLabel(pt), scale: `${scale}x` as const },
  };
}

const IOS = 'Icon-App';
const MAC = 'icon';
const WATCH = 'Icon-Watch';

/* ------------------------------------------------------------------ iPhone */

const IPHONE_SPECS: readonly IconSpec[] = [
  apple(IOS, 20, 2, { idiom: 'iphone' }), //  40 — notification
  apple(IOS, 20, 3, { idiom: 'iphone' }), //  60
  apple(IOS, 29, 2, { idiom: 'iphone' }), //  58 — settings
  apple(IOS, 29, 3, { idiom: 'iphone' }), //  87
  apple(IOS, 40, 2, { idiom: 'iphone' }), //  80 — spotlight
  apple(IOS, 40, 3, { idiom: 'iphone' }), // 120
  apple(IOS, 60, 2, { idiom: 'iphone' }), // 120 — home screen
  apple(IOS, 60, 3, { idiom: 'iphone' }), // 180
  {
    path: `AppIcon.appiconset/${IOS}-1024x1024@1x.png`,
    px: 1024,
    mode: 'opaque', // App Store Connect rejects alpha on the marketing icon.
    catalog: { idiom: 'ios-marketing', size: '1024x1024', scale: '1x' },
  },
];

/* -------------------------------------------------------------------- iPad */

const IPAD_SPECS: readonly IconSpec[] = [
  apple(IOS, 20, 1, { idiom: 'ipad' }), //  20
  apple(IOS, 20, 2, { idiom: 'ipad' }), //  40
  apple(IOS, 29, 1, { idiom: 'ipad' }), //  29
  apple(IOS, 29, 2, { idiom: 'ipad' }), //  58
  apple(IOS, 40, 1, { idiom: 'ipad' }), //  40
  apple(IOS, 40, 2, { idiom: 'ipad' }), //  80
  apple(IOS, 76, 1, { idiom: 'ipad' }), //  76
  apple(IOS, 76, 2, { idiom: 'ipad' }), // 152
  apple(IOS, 83.5, 2, { idiom: 'ipad' }), // 167 — iPad Pro 12.9"
  {
    path: `AppIcon.appiconset/${IOS}-1024x1024@1x.png`,
    px: 1024,
    mode: 'opaque',
    catalog: { idiom: 'ios-marketing', size: '1024x1024', scale: '1x' },
  },
];

/* ------------------------------------------------------------------- macOS */

const MACOS_SPECS: readonly IconSpec[] = [
  apple(MAC, 16, 1, { idiom: 'mac' }), //   16
  apple(MAC, 16, 2, { idiom: 'mac' }), //   32
  apple(MAC, 32, 1, { idiom: 'mac' }), //   32
  apple(MAC, 32, 2, { idiom: 'mac' }), //   64
  apple(MAC, 128, 1, { idiom: 'mac' }), //  128
  apple(MAC, 128, 2, { idiom: 'mac' }), //  256
  apple(MAC, 256, 1, { idiom: 'mac' }), //  256
  apple(MAC, 256, 2, { idiom: 'mac' }), //  512
  apple(MAC, 512, 1, { idiom: 'mac' }), //  512
  apple(MAC, 512, 2, { idiom: 'mac' }), // 1024
];

/* ----------------------------------------------------------------- watchOS */

function watch(pt: number, role: WatchRole, subtype: WatchSubtype): IconSpec {
  return apple(WATCH, pt, 2, { idiom: 'watch', role, subtype });
}

const WATCHOS_SPECS: readonly IconSpec[] = [
  watch(24, 'notificationCenter', '38mm'), //  48
  watch(27.5, 'notificationCenter', '42mm'), //  55
  watch(33, 'notificationCenter', '45mm'), //  66
  apple(WATCH, 29, 2, { idiom: 'watch', role: 'companionSettings' }), //  58
  apple(WATCH, 29, 3, { idiom: 'watch', role: 'companionSettings' }), //  87
  watch(40, 'appLauncher', '38mm'), //  80
  watch(44, 'appLauncher', '40mm'), //  88
  watch(46, 'appLauncher', '41mm'), //  92
  watch(50, 'appLauncher', '44mm'), // 100
  watch(51, 'appLauncher', '45mm'), // 102
  watch(54, 'appLauncher', '49mm'), // 108
  watch(86, 'quickLook', '38mm'), // 172
  watch(98, 'quickLook', '42mm'), // 196
  watch(108, 'quickLook', '44mm'), // 216
  watch(117, 'quickLook', '45mm'), // 234
  watch(129, 'quickLook', '49mm'), // 258
  {
    path: `AppIcon.appiconset/${WATCH}-1024x1024@1x.png`,
    px: 1024,
    mode: 'opaque',
    catalog: { idiom: 'watch-marketing', size: '1024x1024', scale: '1x' },
  },
];

/* --------------------------------------------------------------- Platforms */

const APPLE_GLYPH =
  'M17.05 12.04c-.03-2.9 2.37-4.3 2.48-4.37-1.35-1.98-3.45-2.25-4.2-2.28-1.79-.18-3.5 1.05-4.4 1.05-.91 0-2.31-1.03-3.8-1-1.95.03-3.76 1.14-4.76 2.89-2.03 3.52-.52 8.73 1.46 11.59.97 1.4 2.12 2.97 3.63 2.91 1.46-.06 2.01-.94 3.77-.94 1.76 0 2.26.94 3.8.91 1.57-.03 2.56-1.42 3.52-2.83 1.11-1.62 1.57-3.19 1.6-3.27-.04-.02-3.07-1.18-3.1-4.66zM14.2 3.5c.8-.97 1.34-2.32 1.19-3.66-1.15.05-2.55.77-3.38 1.73-.74.86-1.39 2.23-1.22 3.55 1.29.1 2.6-.65 3.41-1.62z';

export const IPHONE: Platform = {
  id: 'iphone',
  label: 'iPhone',
  hint: 'iOS · 9 sizes · AppIcon.appiconset',
  glyph: APPLE_GLYPH,
  defaultOn: true,
  specs: IPHONE_SPECS,
};

export const IPAD: Platform = {
  id: 'ipad',
  label: 'iPad',
  hint: 'iPadOS · 10 sizes · shares the iOS catalog',
  glyph: APPLE_GLYPH,
  defaultOn: true,
  specs: IPAD_SPECS,
};

export const MACOS: Platform = {
  id: 'macos',
  label: 'macOS',
  hint: '10 sizes · 16pt → 512pt @2x',
  glyph: APPLE_GLYPH,
  defaultOn: false,
  specs: MACOS_SPECS,
};

export const WATCHOS: Platform = {
  id: 'watchos',
  label: 'watchOS',
  hint: '17 sizes · 38mm → 49mm',
  glyph: APPLE_GLYPH,
  defaultOn: false,
  specs: WATCHOS_SPECS,
};
