# App Icon Generator

A faithful, open-source rebuild of the classic **appicon.co** — the simple
drag-in-a-1024px-PNG, get-a-zip-of-every-size tool, before the site was replaced
with an AI product.

**→ https://begiflow.github.io/appicon.old/**

Everything runs in your browser. The source image is decoded, resized, and
zipped locally; nothing is uploaded, and the page works offline once cached.

---

## What it produces

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
npm run test           # headless end-to-end check (55 assertions)
```

The test suite builds the site, serves it under the Pages sub-path, drives real
Chromium through upload → select-all → generate, then unzips the result and
asserts PNG dimensions from the IHDR chunk, catalog/file cross-references, ICO
container structure, and manifest contents.

```bash
# If your Chromium lives somewhere Playwright doesn't expect:
PW_CHROMIUM_PATH=/path/to/chrome npm run test
```

## Deploying

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds with `BASE_PATH=/<repo-name>/` and publishes to Pages. For a custom
domain, build with `BASE_PATH=/`.

## Licence

MIT
