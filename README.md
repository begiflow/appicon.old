# App Icon Generator

A faithful, open-source rebuild of the classic **appicon.co** — the simple
drag-in-a-1024px-PNG, get-a-zip-of-every-size tool, before the site was replaced
with an AI product. Both tabs: **App Icon** and **Image Sets**.

**→ https://begiflow.github.io/appicon.old/**

Everything runs in your browser. The source image is decoded, resized, and
zipped locally; nothing is uploaded, and the page works offline once cached.

---

## App Icon

| Platform             | Files | Output                                                                   |
| -------------------- | ----- | ------------------------------------------------------------------------ |
| **iPhone**           | 9     | `AppIcon.appiconset` + `Contents.json`, 20pt→60pt plus the 1024 marketing icon |
| **iPad**             | 10    | merged into the same iOS catalog, including 83.5pt @2x                   |
| **Android**          | 11    | `mipmap-mdpi`…`xxxhdpi`, `ic_launcher` + `ic_launcher_round`, Play Store 512 |
| **Android Adaptive** | 12    | 108dp foreground/background layers + `mipmap-anydpi-v26` XML             |
| **macOS**            | 10    | `icon_16x16` → `icon_512x512@2x`                                          |
| **watchOS**          | 17    | every role/subtype from 38mm to 49mm                                     |
| **Web / PWA**        | 10    | multi-size `favicon.ico`, touch icon, maskable icon, `site.webmanifest`, `<head>` snippet |

Selecting everything yields **80 files from 56 renders** — shared sizes are
rendered once and fanned out.

### Project layouts

The same pixels, three folder structures:

- **Standard** — `ios/`, `android/`, `macos/`, `watchos/`, `web/`
- **Flutter** — `ios/Runner/Assets.xcassets/`, `android/app/src/main/`, `web/icons/`
- **React Native** — `ios/Images.xcassets/`, `android/app/src/main/`

---

## Image Sets

For ordinary in-app assets — buttons, illustrations, logos — rather than
launcher icons. Drop in a batch of images, declare which scale they represent,
and get every density back with the aspect ratio intact.

| | Output |
| --- | --- |
| **iOS** | `<Name>.imageset/` with `<Name>.png`, `<Name>@2x.png`, `<Name>@3x.png` and a `Contents.json` wired to all three scales |
| **Android** | `res/drawable-mdpi` … `drawable-xxxhdpi` at 1 / 1.5 / 2 / 3 / 4× |

**Design base size** — say whether your export is 3x or 4x. Everything is
derived by dividing down from there, so nothing is ever upscaled silently. Pick
3x with Android selected and the UI tells you `xxxhdpi` (4x) cannot be satisfied
rather than shipping you a soft asset.

**Rename inline.** Every row has a pencil: click it and edit the name in place.
Enter commits, Escape discards, blur commits. The subline under each filename
shows the two names that asset will actually ship under — iOS first, Android
second — recomputed live as you type, collision suffix included.

**Resource names are sanitised per platform.** `Hero Banner@4x.png` becomes the
`Hero Banner` imageset on iOS and `hero_banner.png` on Android, because `aapt`
rejects any file under `res/` outside `[a-z_][a-z0-9_]*` — and it fails at build
time, far from the asset that caused it. The trailing `@4x` is stripped, camel
case is split *before* lowercasing (`emptyState` → `empty_state`, not
`emptystate`), acronym runs break correctly (`PDFViewer` → `pdf_viewer`), and
collisions get a numeric suffix.

**Diacritics fold to ASCII.** `Biểu tượng.png` → `bieu_tuong`, `Größe.png` →
`grosse`. Without this every accented character lands in the illegal-character
bucket and an ordinary Vietnamese filename comes out as `bi_u_t_ng`.

---

## Why it's built this way

**Type-safe spec tables.** The failure mode of an icon generator is not a broken
UI, it's a `Contents.json` that Xcode silently rejects. Every field Apple
validates — `idiom`, `scale`, `role`, `subtype` — is a literal union in
[`src/specs/types.ts`](src/specs/types.ts), so a typo is a compile error.

**Progressive-halving downscale.** A single `drawImage` from 1024px to 40px
aliases badly, because the bilinear sampler only reads a 2×2 neighbourhood.
[`src/core/render.ts`](src/core/render.ts) halves repeatedly until within 2× of
the target, which averages the full footprint and keeps small icons legible.

**Web Worker + OffscreenCanvas.** 56 renders including several 1024px chains is
enough to drop frames. The source `ImageBitmap` is transferred into a worker and
each encoded PNG transferred back, so the progress bar stays smooth. There is a
main-thread fallback for environments that block worker construction.

**Deduplicated render plan.** iPhone 20pt@2x and iPad 40pt@1x are both 40px;
iPhone, iPad and watchOS all want a 1024px marketing icon.
[`src/core/plan.ts`](src/core/plan.ts) renders each `(size, mode)` pair once.

**Correct catalog merging.** iPhone and iPad share one `AppIcon.appiconset`.
Their specs are merged before `Contents.json` is written — otherwise the second
platform silently overwrites the first, which is a bug several generators ship.

**Hand-rolled ICO writer.** [`src/core/ico.ts`](src/core/ico.ts) wraps PNG
payloads in an ICO container rather than encoding DIBs, avoiding bottom-up row
order and AND-mask padding entirely.

**One worker, two pipelines.** [`src/core/runner.ts`](src/core/runner.ts) takes
a list of source bitmaps plus jobs that index into them, so the app-icon path
(one source, square output) and the image-set path (many sources, aspect
preserved) share the transfer bookkeeping, timeout and fallback rather than
duplicating them.

**fflate is imported statically on purpose.** A dynamic import would split it
into a lazy chunk, and this page claims to work offline — a first-time offline
user would get all the way to a rendered set of icons and then fail at the zip.

---

## Stack

Vite 8 + TypeScript (strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), [fflate](https://github.com/101arrowz/fflate) for
zipping, no UI framework. Ships **~34 kB JS / 14 kB gzipped**.

## Development

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # tsc + vite build → dist/
npm run test           # unit + end-to-end (138 assertions)
npm run test:unit      # resource-name sanitiser, no browser needed
npm run test:e2e       # browser suite (requires a prior build)
```

[`scripts/naming.test.mjs`](scripts/naming.test.mjs) covers the sanitiser
directly — it needs no browser, and it is the piece most likely to regress
silently, because a wrong name still produces a valid-looking zip and only fails
later inside somebody's Android build.

[`scripts/smoke.mjs`](scripts/smoke.mjs) builds the site, serves it under the
Pages sub-path, and drives real Chromium through both tabs, then unzips each
result and asserts PNG dimensions read from the IHDR chunk, catalog/file
cross-references, ICO container structure, manifest contents, hash routing, the
upscale warning appearing and clearing, aspect ratio held across all eight
densities, the rename flow (commit, cancel, blank rejection), and that no
Android resource name would make `aapt` fail.

The last scenario builds its `File` objects inside the page and fires a real
`drop` event, rather than using `setInputFiles`. That covers the drag-and-drop
path, and it is the only way to test non-ASCII filenames: Playwright marshals
paths through the OS locale, so in a POSIX-locale container a file called
`Ảnh Nền@4x.png` is dropped before it ever reaches the page.

```bash
# If your Chromium lives somewhere Playwright doesn't expect:
PW_CHROMIUM_PATH=/path/to/chrome npm run test
```

## Deploying

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds with `BASE_PATH=/<repo-name>/` and publishes to Pages. For a custom
domain, build with `BASE_PATH=/`.

Cloudflare deploys the same `dist/` as an assets-only Worker via
[`wrangler.jsonc`](wrangler.jsonc) — `npm run deploy` locally, or the dashboard's
build command in CI. The build container sets `WORKERS_CI`/`CF_PAGES`, which
flips `base` to `/` since a Worker serves from the domain root.

## Licence

MIT
