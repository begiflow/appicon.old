/**
 * Turning a filename into a resource name.
 *
 * Xcode is permissive: an `.imageset` can be called almost anything. Android is
 * not — `aapt` rejects any file under `res/` whose name is not
 * `[a-z_][a-z0-9_]*`, and the failure surfaces as a build error far away from
 * the asset that caused it. So the two platforms get different names derived
 * from the same source, rather than one lowest-common-denominator name.
 */

/** Strips the directory, the extension, and a trailing `@2x` / `_3x` / `-4x`. */
export function baseName(fileName: string): string {
  const withoutDir = fileName.slice(fileName.lastIndexOf('/') + 1);
  const withoutExt = withoutDir.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/[@_-]\d+(\.\d+)?x$/i, '').trim() || 'image';
}

/** Xcode asset-catalog name. Only path separators and dots are a problem. */
export function xcodeName(fileName: string): string {
  return baseName(fileName).replace(/[/\\:]/g, '_') || 'image';
}

/** Android resource name: `[a-z_][a-z0-9_]*`, as enforced by aapt. */
export function androidName(fileName: string): string {
  let name = baseName(fileName)
    .toLowerCase()
    // Split camelCase before flattening, so `myIcon` -> `my_icon` not `myicon`.
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (name === '') name = 'image';
  if (/^[0-9]/.test(name)) name = `img_${name}`;
  return name;
}

/**
 * Makes `name` unique within `taken`, appending `_2`, `_3`, … as needed.
 * Mutates `taken`. Two files called `logo.png` and `Logo.png` collide on
 * Android even though they do not on disk, so this has to run per platform.
 */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  for (let n = 2; ; n++) {
    const candidate = `${name}_${n}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}
