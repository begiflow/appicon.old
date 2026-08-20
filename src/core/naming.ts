/**
 * Turning a filename into a resource name.
 *
 * Xcode is permissive: an `.imageset` can be called almost anything. Android is
 * not — `aapt` rejects any file under `res/` whose name is not
 * `[a-z_][a-z0-9_]*`, and the failure surfaces as a build error far away from
 * the asset that caused it. So the two platforms get different names derived
 * from the same source, rather than one lowest-common-denominator name.
 */

/**
 * Folds accented Latin letters to ASCII: `Biểu tượng` -> `Bieu tuong`.
 *
 * Without this, every diacritic falls into the "illegal character" bucket and a
 * perfectly ordinary Vietnamese or French filename comes out as `bi_u_t_ng`.
 * NFD splits a letter from its combining marks so the marks can be dropped; đ
 * and ø have no decomposition and need naming explicitly.
 */
function foldDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .replace(/[øØ]/g, (c) => (c === 'ø' ? 'o' : 'O'))
    .replace(/[æÆ]/g, (c) => (c === 'æ' ? 'ae' : 'AE'))
    .replace(/[ßẞ]/g, 'ss');
}

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
  let name = foldDiacritics(baseName(fileName))
    // Split camelCase BEFORE lowercasing — afterwards there are no capitals
    // left to match on, and `emptyState` would flatten to `emptystate`.
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // Also split an acronym run followed by a word: `PDFViewer` -> `PDF_Viewer`.
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
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
