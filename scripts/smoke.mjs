/**
 * Headless end-to-end check.
 *
 * Run `npm run build` first. This serves `dist/` under the GitHub Pages
 * sub-path, drives a real Chromium through the full flow, then unzips the
 * result and asserts pixel dimensions, catalog integrity and container formats.
 */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const PORT = 4173;

/**
 * Serve under whatever `base` the build actually used, read back out of the
 * emitted markup. Hard-coding it here means a repo rename silently turns this
 * suite into a 404 check.
 */
const BASE = (() => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const match = html.match(/(?:src|href)="(\/[^"]*\/)assets\//);
  if (!match) throw new Error('Could not infer base path from dist/index.html');
  return match[1];
})();
console.log(`      serving dist under ${BASE}`);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};

/* ----------------------------------------------------------- tiny server */

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!rel.startsWith(BASE)) return void res.writeHead(404).end();
  rel = rel.slice(BASE.length) || 'index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return void res.writeHead(404).end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

/* ------------------------------------------------------- PNG test fixture */

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA PNG with a coloured disc, so downscale artefacts would be visible. */
function makePng(size, height = size) {
  const raw = Buffer.alloc((size * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const inside = (x - size / 2) ** 2 + (y - height / 2) ** 2 < (size * 0.4) ** 2;
      raw[o++] = inside ? 40 : 250;
      raw[o++] = inside ? 110 : 80;
      raw[o++] = inside ? 240 : 60;
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const srcPng = path.join(root, '.tmp-source.png');
fs.writeFileSync(srcPng, makePng(1024));

/* ------------------------------------------------------------- assertions */

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

/* ------------------------------------------------------------ browser run */

// The container ships a pinned Chromium that may not match the npm package's
// expected revision; PW_CHROMIUM_PATH lets CI/local point at whatever is there.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(`http://localhost:${PORT}${BASE}`, { waitUntil: 'networkidle' });

check((await page.locator('.platform').count()) === 7, 'seven platform cards rendered');
check(await page.locator('#generate-btn').isDisabled(), 'generate disabled before upload');

await page.locator('#file-input').setInputFiles(srcPng);
await page.waitForSelector('#dropzone.has-file');
check((await page.locator('#source-dims').textContent()).includes('1024'), 'source dimensions read');
await page.waitForSelector('#preview-wrap:not([hidden])');
check((await page.locator('.preview-item').count()) === 5, 'preview grid rendered');

// The checkbox itself is visually hidden; clicking the wrapping label is what a
// real user does and exercises the same code path.
for (let i = 0; i < 7; i++) {
  const card = page.locator('.platform').nth(i);
  if (!(await card.locator('input').isChecked())) await card.click();
}
check(
  (await page.locator('.platform input:checked').count()) === 7,
  'all seven platforms selectable by clicking the card',
);
console.log('      summary:', (await page.locator('#summary').textContent()).trim());
check(!(await page.locator('#generate-btn').isDisabled()), 'generate enabled after upload');

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 60_000 }),
  page.locator('#generate-btn').click(),
]);
const zipPath = path.join(root, '.tmp-AppIcons.zip');
await download.saveAs(zipPath);
check(download.suggestedFilename() === 'AppIcons.zip', 'download named AppIcons.zip');

await page.waitForFunction(
  () => document.getElementById('progress-text')?.textContent?.startsWith('Done'),
  null,
  { timeout: 30_000 },
);
console.log('      ', (await page.locator('#progress-text').textContent()).trim());

check(
  consoleErrors.length === 0,
  `no console errors${consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''}`,
);
await browser.close();
server.close();

/* ------------------------------------------------------ archive contents */

const list = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n');
console.log(`      ${list.length} entries in archive`);
const read = (p) => execFileSync('unzip', ['-p', zipPath, p], { maxBuffer: 32 * 1024 * 1024 });

for (const p of [
  'ios/AppIcon.appiconset/Contents.json',
  'ios/AppIcon.appiconset/Icon-App-60x60@3x.png',
  'ios/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png',
  'ios/AppIcon.appiconset/Icon-App-1024x1024@1x.png',
  'macos/AppIcon.appiconset/Contents.json',
  'watchos/AppIcon.appiconset/Contents.json',
  'android/res/mipmap-xxxhdpi/ic_launcher.png',
  'android/res/mipmap-xxxhdpi/ic_launcher_round.png',
  'android/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
  'android/res/mipmap-anydpi-v26/ic_launcher.xml',
  'play-store/icon-512.png',
  'web/favicon.ico',
  'web/site.webmanifest',
  'web/apple-touch-icon.png',
  'README.txt',
]) {
  check(list.includes(p), `archive contains ${p}`);
}

for (const cat of ['ios', 'macos', 'watchos']) {
  const p = `${cat}/AppIcon.appiconset/Contents.json`;
  let json = null;
  try {
    json = JSON.parse(read(p).toString());
  } catch {
    /* reported by the check below */
  }
  check(json !== null, `${p} is valid JSON`);
  if (!json) continue;

  check(Array.isArray(json.images) && json.images.length > 0, `${p} has images`);

  const present = new Set(
    list.filter((f) => f.startsWith(`${cat}/AppIcon.appiconset/`)).map((f) => f.split('/').pop()),
  );
  const missing = json.images.filter((i) => !present.has(i.filename)).map((i) => i.filename);
  check(
    missing.length === 0,
    `${p} references only existing files${missing.length ? ' — missing ' + missing.join(',') : ''}`,
  );

  const seen = new Set();
  const clashes = [];
  for (const i of json.images) {
    const key = [i.idiom, i.size, i.scale, i.role, i.subtype].join('|');
    if (seen.has(key)) clashes.push(key);
    seen.add(key);
  }
  check(clashes.length === 0, `${p} has no duplicate catalog entries`);
}

const iosJson = JSON.parse(read('ios/AppIcon.appiconset/Contents.json').toString());
check(
  iosJson.images.some((i) => i.idiom === 'iphone') && iosJson.images.some((i) => i.idiom === 'ipad'),
  'iOS catalog merges iphone + ipad idioms',
);
check(
  iosJson.images.some((i) => i.idiom === 'ios-marketing' && i.size === '1024x1024'),
  'iOS catalog has the marketing icon',
);
check(
  iosJson.images.some((i) => i.idiom === 'ipad' && i.size === '83.5x83.5' && i.scale === '2x'),
  'iOS catalog has the 83.5pt iPad Pro entry',
);

const watchJson = JSON.parse(read('watchos/AppIcon.appiconset/Contents.json').toString());
check(
  watchJson.images.filter((i) => i.idiom === 'watch').every((i) => Boolean(i.role)),
  'every watch entry carries a role',
);
check(
  watchJson.images.length === 17,
  `watch catalog has 17 entries (got ${watchJson.images.length})`,
);

/* --------------------------------------------------- pixel + container ✔ */

const dims = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
for (const [p, want] of [
  ['ios/AppIcon.appiconset/Icon-App-60x60@3x.png', 180],
  ['ios/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png', 167],
  ['ios/AppIcon.appiconset/Icon-App-1024x1024@1x.png', 1024],
  ['macos/AppIcon.appiconset/icon-512x512@2x.png', 1024],
  ['watchos/AppIcon.appiconset/Icon-Watch-27.5x27.5@2x.png', 55],
  ['android/res/mipmap-mdpi/ic_launcher.png', 48],
  ['android/res/mipmap-hdpi/ic_launcher.png', 72],
  ['android/res/mipmap-xxxhdpi/ic_launcher.png', 192],
  ['android/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432],
  ['play-store/icon-512.png', 512],
  ['web/apple-touch-icon.png', 180],
  ['web/maskable-icon-512x512.png', 512],
]) {
  const [w, h] = dims(read(p));
  check(w === want && h === want, `${p} is ${want}x${want} (got ${w}x${h})`);
}

const ico = read('web/favicon.ico');
check(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1, 'favicon.ico has a valid ICONDIR');
check(ico.readUInt16LE(4) === 3, `favicon.ico embeds 3 sizes (got ${ico.readUInt16LE(4)})`);
const firstOffset = ico.readUInt32LE(6 + 12);
check(
  ico
    .subarray(firstOffset, firstOffset + 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'favicon.ico entry 1 points at a PNG payload',
);

check(
  JSON.parse(read('web/site.webmanifest').toString()).icons.length === 3,
  'webmanifest lists 3 icons',
);
check(
  read('android/res/mipmap-anydpi-v26/ic_launcher.xml').toString().includes('<adaptive-icon'),
  'adaptive-icon XML well formed',
);


/* ============================================================ image sets */

console.log('\n--- Image Sets ---');

// 800x400 at 4x means 1x is 200x100 — a clean non-square case that also proves
// aspect ratio survives, which a square fixture could never show.
// In a temp directory, not prefixed on the file itself: the filename *is* the
// resource name under test, so a `.tmp-` prefix would silently change it.
const fixtures = path.join(root, '.tmp-fixtures');
fs.mkdirSync(fixtures, { recursive: true });
const wideA = path.join(fixtures, 'Hero Banner@4x.png');
const wideB = path.join(fixtures, 'hero-banner.png');
fs.writeFileSync(wideA, makePng(800, 400));
fs.writeFileSync(wideB, makePng(800, 400));

const server2 = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!rel.startsWith(BASE)) return void res.writeHead(404).end();
  rel = rel.slice(BASE.length) || 'index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return void res.writeHead(404).end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server2.listen(PORT + 1, r));

const browser2 = await chromium.launch(executablePath ? { executablePath } : {});
const page2 = await browser2.newPage();
const errors2 = [];
page2.on('console', (m) => m.type() === 'error' && errors2.push(m.text()));
page2.on('pageerror', (e) => errors2.push(String(e)));

// Deep-link straight into the tab, which also exercises hash routing.
await page2.goto(`http://localhost:${PORT + 1}${BASE}#image-sets`, { waitUntil: 'networkidle' });

check(await page2.locator('#view-imagesets').isVisible(), '#image-sets hash opens the Image Sets tab');
check(await page2.locator('#view-appicon').isHidden(), 'App Icon view hidden while on Image Sets');
check(await page2.locator('#is-generate-btn').isDisabled(), 'image-set generate disabled when empty');
check(await page2.locator('input[name="base-scale"][value="4"]').isChecked(), '4x is the default base');

await page2.locator('#is-file-input').setInputFiles([wideA, wideB]);
await page2.waitForSelector('.is-item');
check((await page2.locator('.is-item').count()) === 2, 'both images listed');
console.log('      summary:', (await page2.locator('#is-summary').textContent()).trim());

// 4x base covers xxxhdpi, so no upscale warning.
check(await page2.locator('#is-warn').isHidden(), 'no upscale warning at 4x base');
// The radio is visually hidden; a user clicks the label. `.base-opt` index 0
// is 3x, index 1 is 4x.
await page2.locator('.base-opt').nth(0).click();
await page2.waitForTimeout(100);
check(!(await page2.locator('#is-warn').isHidden()), 'upscale warning appears at 3x base with Android');
await page2.locator('.base-opt').nth(1).click();
await page2.waitForTimeout(100);
check(await page2.locator('#is-warn').isHidden(), 'warning clears when base returns to 4x');

/* --------------------------------------------------------- inline rename */

// Row 0 is `Hero Banner@4x.png`, row 1 is `hero-banner.png`. Both sanitise to
// `hero_banner` on Android, so the labels must already show the `_2` suffix the
// archive will apply — otherwise the UI promises a name it does not deliver.
const subline = (n) => page2.locator('.is-item').nth(n).locator('.is-item-dims').textContent();
check((await subline(0)).includes('hero_banner'), 'row 0 shows its derived Android name');
check(
  (await subline(1)).includes('hero_banner_2'),
  `row 1 shows the collision-suffixed name (got "${(await subline(1)).trim()}")`,
);

const row0 = page2.locator('.is-item').nth(0);
await row0.locator('.is-icon-btn').first().click();
check((await page2.locator('.is-rename').count()) === 1, 'pencil opens exactly one rename input');
check(
  await page2.evaluate(() => document.activeElement?.classList.contains('is-rename') === true),
  'rename input is focused on open',
);

// Typing a space must not reach the dropzone's keydown handler, which would
// swallow the keystroke and open a file picker.
await page2.locator('.is-rename').fill('Promo Banner Wide');
await page2.locator('.is-rename').press('Space');
check(
  (await page2.locator('.is-rename').inputValue()).endsWith(' '),
  'space types into the field instead of triggering the dropzone',
);

await page2.locator('.is-rename').fill('Promo Banner');
await page2.locator('.is-rename').press('Enter');
await page2.waitForSelector('.is-rename', { state: 'detached' });
check(
  (await page2.locator('.is-item').nth(0).locator('.is-item-name').textContent()) === 'Promo Banner',
  'Enter commits the new name',
);
check(
  (await subline(0)).includes('promo_banner'),
  'derived Android name updates live after rename',
);
check(
  !(await subline(1)).includes('_2'),
  'the other row drops its collision suffix once the clash is gone',
);

// Escape must discard, not commit.
await page2.locator('.is-item').nth(1).locator('.is-icon-btn').first().click();
await page2.locator('.is-rename').fill('should-not-stick');
await page2.locator('.is-rename').press('Escape');
await page2.waitForSelector('.is-rename', { state: 'detached' });
check(
  (await page2.locator('.is-item').nth(1).locator('.is-item-name').textContent()) ===
    'hero-banner.png',
  'Escape cancels the rename',
);

// An emptied field would sanitise to the literal fallback "image"; keep the old
// name instead of inventing one.
await page2.locator('.is-item').nth(1).locator('.is-icon-btn').first().click();
await page2.locator('.is-rename').fill('   ');
await page2.locator('.is-rename').press('Enter');
await page2.waitForSelector('.is-rename', { state: 'detached' });
check(
  (await page2.locator('.is-item').nth(1).locator('.is-item-name').textContent()) ===
    'hero-banner.png',
  'a blank name is rejected rather than becoming "image"',
);

const [dl2] = await Promise.all([
  page2.waitForEvent('download', { timeout: 60_000 }),
  page2.locator('#is-generate-btn').click(),
]);
const isZip = path.join(root, '.tmp-ImageSets.zip');
await dl2.saveAs(isZip);
check(dl2.suggestedFilename() === 'ImageSets.zip', 'download named ImageSets.zip');

await page2.waitForFunction(
  () => document.getElementById('is-progress-text')?.textContent?.startsWith('Done'),
  null,
  { timeout: 30_000 },
);
console.log('      ', (await page2.locator('#is-progress-text').textContent()).trim());
check(errors2.length === 0, `no console errors${errors2.length ? ': ' + errors2.join(' | ') : ''}`);

await browser2.close();
server2.close();

const list2 = execFileSync('unzip', ['-Z1', isZip], { encoding: 'utf8' }).trim().split('\n');
const read2 = (p) => {
  try {
    return execFileSync('unzip', ['-p', isZip, p], { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return Buffer.alloc(0);
  }
};
console.log(`      ${list2.length} entries in archive`);

// `Hero Banner@4x.png` -> iOS keeps the readable stem, Android must not.
for (const p of [
  'ios/Promo Banner.imageset/Contents.json',
  'ios/Promo Banner.imageset/Promo Banner.png',
  'ios/Promo Banner.imageset/Promo Banner@2x.png',
  'ios/Promo Banner.imageset/Promo Banner@3x.png',
  'android/res/drawable-mdpi/promo_banner.png',
  'android/res/drawable-hdpi/promo_banner.png',
  'android/res/drawable-xhdpi/promo_banner.png',
  'android/res/drawable-xxhdpi/promo_banner.png',
  'android/res/drawable-xxxhdpi/promo_banner.png',
  'README.txt',
]) {
  check(list2.includes(p), `image sets contain ${p}`);
}

check(
  !list2.some((f) => f.startsWith('android/') && /[A-Z ]/.test(f.split('/').pop())),
  'no Android resource name has uppercase or spaces (aapt would reject)',
);
check(
  list2.includes('android/res/drawable-mdpi/hero_banner.png'),
  'the un-renamed image keeps its own derived name',
);

const isJson = JSON.parse(read2('ios/Promo Banner.imageset/Contents.json').toString());
check(isJson.images.length === 3, `imageset Contents.json lists 3 scales (got ${isJson.images.length})`);
check(
  isJson.images.every((i) => i.idiom === 'universal'),
  'every imageset entry uses idiom universal',
);
check(
  ['1x', '2x', '3x'].every((s) => isJson.images.some((i) => i.scale === s)),
  'imageset covers 1x, 2x and 3x',
);
{
  const present = new Set(
    list2.filter((f) => f.startsWith('ios/Promo Banner.imageset/')).map((f) => f.split('/').pop()),
  );
  const missing = isJson.images.filter((i) => !present.has(i.filename)).map((i) => i.filename);
  check(missing.length === 0, `imageset references only existing files${missing.length ? ' — missing ' + missing.join(',') : ''}`);
}

// Source is 800x400 declared as 4x, so 1x = 200x100 and aspect ratio must hold.
for (const [p, w, h] of [
  ['ios/Promo Banner.imageset/Promo Banner.png', 200, 100],
  ['ios/Promo Banner.imageset/Promo Banner@2x.png', 400, 200],
  ['ios/Promo Banner.imageset/Promo Banner@3x.png', 600, 300],
  ['android/res/drawable-mdpi/promo_banner.png', 200, 100],
  ['android/res/drawable-hdpi/promo_banner.png', 300, 150],
  ['android/res/drawable-xhdpi/promo_banner.png', 400, 200],
  ['android/res/drawable-xxhdpi/promo_banner.png', 600, 300],
  ['android/res/drawable-xxxhdpi/promo_banner.png', 800, 400],
]) {
  const buf = read2(p);
  const [gw, gh] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  check(gw === w && gh === h, `${p} is ${w}x${h} (got ${gw}x${gh})`);
}

fs.rmSync(fixtures, { recursive: true, force: true });
fs.rmSync(isZip, { force: true });

/* ================================== drag-and-drop with Unicode filenames */

console.log('\n--- Drag & drop / Unicode names ---');

// Two things `setInputFiles` cannot cover:
//   1. The real `drop` event path, which has its own DataTransfer handling.
//   2. Non-ASCII filenames — Playwright marshals paths through the OS locale,
//      and in a POSIX-locale container the file is silently dropped before it
//      ever reaches the page. Building the File in-page sidesteps that, and is
//      also closer to what a browser actually hands the app.
const server3 = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!rel.startsWith(BASE)) return void res.writeHead(404).end();
  rel = rel.slice(BASE.length) || 'index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return void res.writeHead(404).end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server3.listen(PORT + 2, r));

const browser3 = await chromium.launch(executablePath ? { executablePath } : {});
const page3 = await browser3.newPage();
const errors3 = [];
page3.on('console', (m) => m.type() === 'error' && errors3.push(m.text()));
page3.on('pageerror', (e) => errors3.push(String(e)));
await page3.goto(`http://localhost:${PORT + 2}${BASE}#image-sets`, { waitUntil: 'networkidle' });

await page3.evaluate(async () => {
  const make = async (w, h, colour) => {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
    ctx.fill();
    return canvas.convertToBlob({ type: 'image/png' });
  };
  const dt = new DataTransfer();
  dt.items.add(new File([await make(1200, 900, '#1e2846')], 'Ảnh Nền@4x.png', { type: 'image/png' }));
  dt.items.add(new File([await make(800, 800, '#0d7a5f')], 'Biểu tượng.png', { type: 'image/png' }));
  dt.items.add(new File([await make(1600, 600, '#3b6cf6')], 'Đăng nhập@4x.png', { type: 'image/png' }));
  document
    .getElementById('is-dropzone')
    .dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await page3.waitForSelector('.is-item');

check((await page3.locator('.is-item').count()) === 3, 'drop event accepts all three files');

const subs = await page3.locator('.is-item-dims').allTextContents();
for (const [i, want] of [
  [0, 'anh_nen'],
  [1, 'bieu_tuong'],
  [2, 'dang_nhap'],
]) {
  check(
    (subs[i] ?? '').includes(want),
    `Vietnamese filename folds to ${want} (got "${(subs[i] ?? '').trim()}")`,
  );
}

const [dl3] = await Promise.all([
  page3.waitForEvent('download', { timeout: 60_000 }),
  page3.locator('#is-generate-btn').click(),
]);
const vnZip = path.join(root, '.tmp-Unicode.zip');
await dl3.saveAs(vnZip);
check(errors3.length === 0, `no console errors${errors3.length ? ': ' + errors3.join(' | ') : ''}`);
await browser3.close();
server3.close();

const list3 = execFileSync('unzip', ['-Z1', vnZip], { encoding: 'utf8' }).trim().split('\n');
for (const p of [
  'android/res/drawable-xxxhdpi/anh_nen.png',
  'android/res/drawable-xxxhdpi/bieu_tuong.png',
  'android/res/drawable-xxxhdpi/dang_nhap.png',
  'ios/Ảnh Nền.imageset/Contents.json',
]) {
  check(list3.includes(p), `unicode archive contains ${p}`);
}
check(
  list3
    .filter((f) => f.startsWith('android/'))
    .every((f) => /^[a-z_][a-z0-9_]*\.png$/.test(f.split('/').pop())),
  'every Android filename from Unicode input is a legal aapt resource name',
);
fs.rmSync(vnZip, { force: true });

fs.rmSync(srcPng, { force: true });
fs.rmSync(zipPath, { force: true });

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
