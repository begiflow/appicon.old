/**
 * Unit checks for the resource-name sanitiser.
 *
 * Separate from the browser suite because it needs no browser, and because this
 * is the piece most likely to regress silently: a wrong name still produces a
 * valid-looking zip, and only fails later inside someone's Android build.
 *
 * Run with: node --experimental-strip-types scripts/naming.test.mjs
 */

import { androidName, baseName, uniqueName, xcodeName } from '../src/core/naming.ts';

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};
const eq = (got, want, label) =>
  check(got === want, `${label} → ${JSON.stringify(got)}${got === want ? '' : ` (want ${JSON.stringify(want)})`}`);

/* ------------------------------------------------------------ androidName */

for (const [input, want] of [
  // camelCase must split before lowercasing, or it flattens to `emptystate`.
  ['emptyState.png', 'empty_state'],
  ['MyIcon@2x.svg', 'my_icon'],
  // An acronym run followed by a word is its own boundary.
  ['PDFViewer.png', 'pdf_viewer'],
  ['Hero Banner@4x.png', 'hero_banner'],
  ['checkout button.png', 'checkout_button'],
  ['icon-Arrow_Left@3x.png', 'icon_arrow_left'],
  // aapt needs an identifier, and identifiers cannot start with a digit.
  ['2fa-code.png', 'img_2fa_code'],
  ['  spaced  .png', 'spaced'],
  // Nothing usable left: fall back rather than emit an empty name.
  ['....png', 'image'],
  ['nav/deep/Logo Mark.webp', 'logo_mark'],
  // Diacritics fold to ASCII rather than falling into the illegal-character
  // bucket, which would turn an ordinary Vietnamese filename into `bi_u_t_ng`.
  ['Ünïcödé Name.png', 'unicode_name'],
  ['Biểu tượng.png', 'bieu_tuong'],
  ['Ảnh Nền@4x.png', 'anh_nen'],
  ['Đăng nhập.png', 'dang_nhap'],
  ['Größe.png', 'grosse'],
]) {
  eq(androidName(input), want, `androidName(${JSON.stringify(input)})`);
}

check(
  ['emptyState.png', 'PDFViewer.png', '2fa-code.png', 'Biểu tượng.png', 'Đăng nhập.png', '....png']
    .map(androidName)
    .every((n) => /^[a-z_][a-z0-9_]*$/.test(n)),
  'every androidName output matches aapt grammar [a-z_][a-z0-9_]*',
);

/* -------------------------------------------------------------- xcodeName */

eq(xcodeName('Hero Banner@4x.png'), 'Hero Banner', "xcodeName('Hero Banner@4x.png')");
eq(xcodeName('nav/deep/Logo Mark.webp'), 'Logo Mark', "xcodeName('nav/deep/Logo Mark.webp')");
eq(xcodeName('emptyState.png'), 'emptyState', 'xcodeName preserves case');

/* --------------------------------------------------------------- baseName */

eq(baseName('sprite@3x.png'), 'sprite', 'baseName strips @3x');
eq(baseName('sprite_2x.png'), 'sprite', 'baseName strips _2x');
eq(baseName('sprite-1.5x.png'), 'sprite', 'baseName strips a fractional -1.5x');
// `x` alone is not a scale suffix, and `matrix` must survive intact.
eq(baseName('matrix.png'), 'matrix', 'baseName does not eat a trailing x');

/* ------------------------------------------------------------- uniqueName */

{
  const taken = new Set();
  eq(uniqueName('logo', taken), 'logo', 'first use keeps the name');
  eq(uniqueName('logo', taken), 'logo_2', 'second use gets _2');
  eq(uniqueName('logo', taken), 'logo_3', 'third use gets _3');
  eq(uniqueName('other', taken), 'other', 'unrelated name unaffected');
}

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
