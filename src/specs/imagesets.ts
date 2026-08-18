/**
 * Image-set specs — regular in-app assets, not launcher icons.
 *
 * The mental model differs from app icons in three ways, and each one is a
 * place where a naive implementation goes wrong:
 *
 * 1. **Aspect ratio is preserved.** These are buttons, illustrations, logos.
 *    Padding them to a square would be actively wrong.
 * 2. **The upload is the *largest* variant**, not a canonical 1024 master. The
 *    user declares which scale it represents ("design base size"), and every
 *    output is derived by dividing down from there.
 * 3. **Names are resource identifiers.** `Contents.json` filenames must match
 *    what is on disk, and Android resource names have a stricter grammar than
 *    the filesystem does.
 */

/** The scale the uploaded artwork represents. */
export type BaseScale = 3 | 4;

export const BASE_SCALES: readonly BaseScale[] = [3, 4];

export type ImageSetPlatformId = 'ios' | 'android';

/** One output variant, expressed as a multiple of the 1x logical size. */
export interface Variant {
  /** e.g. `2` for @2x / xhdpi. Android hdpi is the only fractional one. */
  readonly factor: number;
  /** Label shown in the UI and used to build the path. */
  readonly label: string;
}

export interface ImageSetPlatform {
  readonly id: ImageSetPlatformId;
  readonly label: string;
  /** Sub-label listing the variants, matching the original site's wording. */
  readonly hint: string;
  readonly glyph: string;
  readonly variants: readonly Variant[];
}

const IOS_VARIANTS: readonly Variant[] = [
  { factor: 1, label: '1x' },
  { factor: 2, label: '2x' },
  { factor: 3, label: '3x' },
];

const ANDROID_VARIANTS: readonly Variant[] = [
  { factor: 1, label: 'mdpi' },
  { factor: 1.5, label: 'hdpi' },
  { factor: 2, label: 'xhdpi' },
  { factor: 3, label: 'xxhdpi' },
  { factor: 4, label: 'xxxhdpi' },
];

const APPLE_GLYPH =
  'M17.05 12.04c-.03-2.9 2.37-4.3 2.48-4.37-1.35-1.98-3.45-2.25-4.2-2.28-1.79-.18-3.5 1.05-4.4 1.05-.91 0-2.31-1.03-3.8-1-1.95.03-3.76 1.14-4.76 2.89-2.03 3.52-.52 8.73 1.46 11.59.97 1.4 2.12 2.97 3.63 2.91 1.46-.06 2.01-.94 3.77-.94 1.76 0 2.26.94 3.8.91 1.57-.03 2.56-1.42 3.52-2.83 1.11-1.62 1.57-3.19 1.6-3.27-.04-.02-3.07-1.18-3.1-4.66zM14.2 3.5c.8-.97 1.34-2.32 1.19-3.66-1.15.05-2.55.77-3.38 1.73-.74.86-1.39 2.23-1.22 3.55 1.29.1 2.6-.65 3.41-1.62z';

const ANDROID_GLYPH =
  'M17.6 9.48l1.84-3.18a.38.38 0 00-.14-.52.38.38 0 00-.52.14l-1.87 3.23a11.4 11.4 0 00-9.82 0L5.22 5.92a.38.38 0 00-.52-.14.38.38 0 00-.14.52L6.4 9.48A10.8 10.8 0 001 18h22a10.8 10.8 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z';

export const IMAGE_SET_PLATFORMS: readonly ImageSetPlatform[] = [
  {
    id: 'ios',
    label: 'iOS',
    hint: '1x, 2x, 3x',
    glyph: APPLE_GLYPH,
    variants: IOS_VARIANTS,
  },
  {
    id: 'android',
    label: 'Android',
    hint: 'mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi',
    glyph: ANDROID_GLYPH,
    variants: ANDROID_VARIANTS,
  },
];

export const IMAGE_SET_PLATFORM_BY_ID: ReadonlyMap<ImageSetPlatformId, ImageSetPlatform> = new Map(
  IMAGE_SET_PLATFORMS.map((p) => [p.id, p]),
);

/**
 * The largest factor any selected platform needs.
 *
 * With a 3x base and Android selected, xxxhdpi (4x) would have to be *upscaled*
 * — the source simply does not contain those pixels. The UI surfaces this
 * rather than silently shipping a blurry asset.
 */
export function maxFactor(platforms: readonly ImageSetPlatformId[]): number {
  let max = 0;
  for (const id of platforms) {
    const platform = IMAGE_SET_PLATFORM_BY_ID.get(id);
    if (!platform) continue;
    for (const v of platform.variants) max = Math.max(max, v.factor);
  }
  return max;
}
