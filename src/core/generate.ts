/**
 * App-icon pipeline: source image -> worker renders -> zip.
 *
 * Everything runs in the browser. No byte of the user's artwork is ever sent
 * anywhere — the network is not touched after the page loads.
 */

import type { GenerateOptions, PlatformId } from '../specs/types';
import { buildPlan, type Plan } from './plan';
import { buildIco } from './ico';
import { runJobs, toZipBlob, zipAsync, type ProgressFn } from './runner';

export interface GenerateResult {
  readonly blob: Blob;
  readonly fileCount: number;
  readonly bytes: number;
  readonly elapsedMs: number;
}

export type { ProgressFn };

const encoder = new TextEncoder();

export async function generate(
  source: Blob,
  selected: readonly PlatformId[],
  opts: GenerateOptions,
  onProgress: ProgressFn = () => {},
): Promise<GenerateResult> {
  if (selected.length === 0) throw new Error('Select at least one platform');

  const started = performance.now();
  const plan = buildPlan(selected, opts);
  const bitmap = await createImageBitmap(source);
  const rendered = await runJobs([bitmap], plan.jobs, opts.background, onProgress);

  const entries: Record<string, Uint8Array> = {};

  for (const file of plan.files) {
    const png = rendered.get(file.jobId);
    if (png) entries[file.zipPath] = png;
  }

  for (const ico of plan.icos) {
    const members = ico.members
      .map(({ size, jobId }) => ({ size, png: rendered.get(jobId) }))
      .filter((m): m is { size: number; png: Uint8Array } => m.png !== undefined);
    if (members.length > 0) entries[ico.zipPath] = buildIco(members);
  }

  for (const text of plan.texts) {
    entries[text.path] = encoder.encode(text.contents);
  }

  entries['README.txt'] = encoder.encode(readme(plan, opts));

  const blob = toZipBlob(await zipAsync(entries));

  return {
    blob,
    fileCount: Object.keys(entries).length,
    bytes: blob.size,
    elapsedMs: Math.round(performance.now() - started),
  };
}

function readme(plan: Plan, opts: GenerateOptions): string {
  return `App Icons
=========

Generated entirely in your browser — the source image never left this device.

Layout      : ${opts.layout}
Files       : ${plan.outputCount}
Background  : ${opts.background}

Apple
-----
Drag the .appiconset (or the whole Assets.xcassets) into your Xcode project.
Contents.json is included and covers every idiom you selected.

Android
-------
Copy res/ over app/src/main/res/. Adaptive icons additionally ship
mipmap-anydpi-v26/ic_launcher.xml, which overrides the raster icon on API 26+.

Web
---
Drop the files at your site root and paste head-snippet.html into <head>.
`;
}
