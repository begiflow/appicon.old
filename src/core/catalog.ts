/**
 * `Contents.json` generation for Apple asset catalogs.
 *
 * Key ordering matters only for diff readability, not for Xcode, but we match
 * Xcode's own alphabetical ordering so generated catalogs diff cleanly against
 * ones Xcode rewrites.
 */

import type { IconSpec } from '../specs/types';

interface CatalogImage {
  filename: string;
  idiom: string;
  role?: string;
  scale?: string;
  size: string;
  subtype?: string;
}

const AUTHOR = { author: 'appicon-clone', version: 1 } as const;

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/**
 * Builds `Contents.json` for one `.appiconset` from the specs that land in it.
 *
 * Duplicate *entries* (same idiom + size + scale + role + subtype) are removed
 * — that happens when iPhone and iPad are both selected and contribute the same
 * catalog row. Duplicate *filenames* across different idioms are intentional
 * and preserved.
 */
export function buildContentsJson(specs: readonly IconSpec[]): string {
  const seen = new Set<string>();
  const images: CatalogImage[] = [];

  for (const spec of specs) {
    if (!spec.catalog) continue;
    const { idiom, size, scale, role, subtype } = spec.catalog;
    const key = `${idiom}|${size}|${scale ?? ''}|${role ?? ''}|${subtype ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const image: CatalogImage = { filename: basename(spec.path), idiom, size };
    if (role) image.role = role;
    if (scale) image.scale = scale;
    if (subtype) image.subtype = subtype;

    images.push({
      filename: image.filename,
      idiom: image.idiom,
      ...(image.role ? { role: image.role } : {}),
      ...(image.scale ? { scale: image.scale } : {}),
      size: image.size,
      ...(image.subtype ? { subtype: image.subtype } : {}),
    });
  }

  return `${JSON.stringify({ images, info: AUTHOR }, null, 2)}\n`;
}

/** The stub `Contents.json` Xcode expects at the root of an `.xcassets` bundle. */
export function buildRootContentsJson(): string {
  return `${JSON.stringify({ info: AUTHOR }, null, 2)}\n`;
}
