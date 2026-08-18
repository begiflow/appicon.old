/**
 * Image-set pipeline: N source images -> per-scale variants -> zip.
 *
 * Runs on the same worker as the app-icon path; the only structural difference
 * is that jobs here reference one of several source bitmaps instead of a single
 * master.
 */

import {
  IMAGE_SET_PLATFORM_BY_ID,
  maxFactor,
  type BaseScale,
  type ImageSetPlatformId,
} from '../specs/imagesets';
import type { TextFile } from '../specs/types';
import type { RenderJob } from './protocol';
import { runJobs, toZipBlob, zipAsync, type ProgressFn } from './runner';
import { androidName, uniqueName, xcodeName } from './naming';

/** A single image the user dropped in. */
export interface ImageSetSource {
  readonly name: string;
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

export interface ImageSetOptions {
  readonly base: BaseScale;
  readonly platforms: readonly ImageSetPlatformId[];
}

interface PlannedFile {
  readonly zipPath: string;
  readonly jobId: string;
}

export interface ImageSetPlan {
  readonly jobs: readonly RenderJob[];
  readonly files: readonly PlannedFile[];
  readonly texts: readonly TextFile[];
  readonly outputCount: number;
  /** Variants whose factor exceeds the declared base, i.e. real upscaling. */
  readonly upscaledCount: number;
}

export interface ImageSetResult {
  readonly blob: Blob;
  readonly fileCount: number;
  readonly bytes: number;
  readonly elapsedMs: number;
}

const encoder = new TextEncoder();
const CATALOG_INFO = { author: 'appicon-clone', version: 1 } as const;

/**
 * `Contents.json` for a `.imageset`.
 *
 * `idiom: universal` with three scales is what Xcode's own "New Image Set"
 * template emits. Every listed filename must exist in the folder, or the asset
 * resolves to nothing at runtime with no build-time complaint.
 */
function imagesetContents(files: readonly { filename: string; scale: string }[]): string {
  return `${JSON.stringify(
    {
      images: files.map((f) => ({ filename: f.filename, idiom: 'universal', scale: f.scale })),
      info: CATALOG_INFO,
    },
    null,
    2,
  )}\n`;
}

export function buildImageSetPlan(
  sources: readonly ImageSetSource[],
  opts: ImageSetOptions,
): ImageSetPlan {
  const jobs = new Map<string, RenderJob>();
  const files: PlannedFile[] = [];
  const texts: TextFile[] = [];
  let upscaledCount = 0;

  // Per-platform, because the two sanitisers can map distinct inputs onto the
  // same output name (`My-Logo.png` and `my_logo.png` both become `my_logo`).
  const takenXcode = new Set<string>();
  const takenAndroid = new Set<string>();

  const addJob = (source: number, w: number, h: number): string => {
    const id = `s${source}:${w}x${h}`;
    if (!jobs.has(id)) jobs.set(id, { kind: 'scale', id, source, w, h });
    return id;
  };

  sources.forEach((source, index) => {
    const iosName = uniqueName(xcodeName(source.name), takenXcode);
    const androidRes = uniqueName(androidName(source.name), takenAndroid);

    for (const platformId of opts.platforms) {
      const platform = IMAGE_SET_PLATFORM_BY_ID.get(platformId);
      if (!platform) continue;

      const catalogEntries: { filename: string; scale: string }[] = [];

      for (const variant of platform.variants) {
        const ratio = variant.factor / opts.base;
        if (ratio > 1) upscaledCount += 1;

        const w = Math.max(1, Math.round(source.width * ratio));
        const h = Math.max(1, Math.round(source.height * ratio));
        const jobId = addJob(index, w, h);

        if (platformId === 'ios') {
          const filename = variant.factor === 1 ? `${iosName}.png` : `${iosName}@${variant.label}.png`;
          files.push({ zipPath: `ios/${iosName}.imageset/${filename}`, jobId });
          catalogEntries.push({ filename, scale: variant.label });
        } else {
          files.push({
            zipPath: `android/res/drawable-${variant.label}/${androidRes}.png`,
            jobId,
          });
        }
      }

      if (platformId === 'ios') {
        texts.push({
          path: `ios/${iosName}.imageset/Contents.json`,
          contents: imagesetContents(catalogEntries),
        });
      }
    }
  });

  return {
    jobs: [...jobs.values()],
    files,
    texts,
    outputCount: files.length + texts.length,
    upscaledCount,
  };
}

export async function generateImageSets(
  sources: readonly ImageSetSource[],
  opts: ImageSetOptions,
  onProgress: ProgressFn = () => {},
): Promise<ImageSetResult> {
  if (sources.length === 0) throw new Error('Add at least one image');
  if (opts.platforms.length === 0) throw new Error('Select at least one platform');

  const started = performance.now();
  const plan = buildImageSetPlan(sources, opts);

  const bitmaps = await Promise.all(sources.map((s) => createImageBitmap(s.blob)));
  // `background` is unused by 'scale' jobs but the worker contract requires it.
  const rendered = await runJobs(bitmaps, plan.jobs, '#ffffff', onProgress);

  const entries: Record<string, Uint8Array> = {};
  for (const file of plan.files) {
    const png = rendered.get(file.jobId);
    if (png) entries[file.zipPath] = png;
  }
  for (const text of plan.texts) {
    entries[text.path] = encoder.encode(text.contents);
  }
  entries['README.txt'] = encoder.encode(readme(sources, plan, opts));

  const blob = toZipBlob(await zipAsync(entries));

  return {
    blob,
    fileCount: Object.keys(entries).length,
    bytes: blob.size,
    elapsedMs: Math.round(performance.now() - started),
  };
}

function readme(
  sources: readonly ImageSetSource[],
  plan: ImageSetPlan,
  opts: ImageSetOptions,
): string {
  const needed = maxFactor(opts.platforms);
  const warning =
    plan.upscaledCount > 0
      ? `
WARNING
-------
${plan.upscaledCount} variant(s) had to be upscaled: you declared the source as
${opts.base}x but the selected platforms need up to ${needed}x. Re-export the
artwork at ${needed}x to avoid soft assets.
`
      : '';

  return `Image Sets
==========

Generated entirely in your browser — your images never left this device.

Base scale  : ${opts.base}x
Images      : ${sources.length}
Files       : ${plan.outputCount}
Platforms   : ${opts.platforms.join(', ')}
${warning}
iOS
---
Drag each .imageset folder into your asset catalog in Xcode. Contents.json is
included, so the 1x/2x/3x slots are filled in for you.

Android
-------
Copy res/ over app/src/main/res/. File names were lowercased and had illegal
characters replaced, because aapt rejects anything outside [a-z_][a-z0-9_]*.
`;
}
