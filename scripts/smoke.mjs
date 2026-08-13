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
const BASE = '/appicon-clone/';
const PORT = 4173;

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
function makePng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const inside = (x - size / 2) ** 2 + (y - size / 2) ** 2 < (size * 0.4) ** 2;
      raw[o++] = inside ? 40 : 250;
      raw[o++] = inside ? 110 : 80;
      raw[o++] = inside ? 240 : 60;
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
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

fs.rmSync(srcPng, { force: true });
fs.rmSync(zipPath, { force: true });

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
