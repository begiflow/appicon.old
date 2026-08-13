/**
 * Orchestrates: source image -> worker renders -> zip.
 *
 * Everything runs in the browser. No byte of the user's artwork is ever sent
 * anywhere — the network is not touched after the page loads.
 */

import { zip } from 'fflate';
import type { GenerateOptions, PlatformId } from '../specs/types';
import { buildPlan, type Plan } from './plan';
import { buildIco } from './ico';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { encodePng, renderIcon } from './render';

export interface GenerateResult {
  readonly blob: Blob;
  readonly fileCount: number;
  readonly bytes: number;
  readonly elapsedMs: number;
}

export type ProgressFn = (done: number, total: number) => void;

const READY_STATE_TIMEOUT_MS = 60_000;
const encoder = new TextEncoder();

function createWorker(): Worker {
  return new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * Runs the plan's jobs. Uses a worker when available and falls back to the main
 * thread if worker construction fails (strict CSP, some in-app browsers).
 */
async function renderAll(
  bitmap: ImageBitmap,
  plan: Plan,
  opts: GenerateOptions,
  onProgress: ProgressFn,
): Promise<Map<string, Uint8Array>> {
  const total = plan.jobs.length;

  let worker: Worker;
  try {
    worker = createWorker();
  } catch {
    const out = new Map<string, Uint8Array>();
    let done = 0;
    for (const job of plan.jobs) {
      out.set(job.id, await encodePng(renderIcon(bitmap, job.px, job.mode, opts.background)));
      onProgress((done += 1), total);
    }
    bitmap.close();
    return out;
  }

  return new Promise<Map<string, Uint8Array>>((resolve, reject) => {
    const out = new Map<string, Uint8Array>();
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Rendering timed out'));
    }, READY_STATE_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      worker.terminate();
      fn();
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'result') {
        out.set(msg.id, msg.png);
        onProgress(msg.done, total);
      } else if (msg.type === 'complete') {
        finish(() => resolve(out));
      } else {
        finish(() => reject(new Error(msg.message)));
      }
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'Worker failed')));

    const request: WorkerRequest = {
      type: 'render',
      bitmap,
      background: opts.background,
      jobs: plan.jobs,
    };
    worker.postMessage(request, [bitmap]);
  });
}

function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // level 6: PNGs are already DEFLATE-compressed, so a higher level costs CPU
    // for well under 1% size. The win is in storing them, not squeezing them.
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

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
  const rendered = await renderAll(bitmap, plan, opts, onProgress);

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

  const archive = await zipAsync(entries);
  // Copy into a fresh ArrayBuffer so the Blob is not backed by a view into a
  // larger pooled buffer.
  const blob = new Blob([archive.slice().buffer as ArrayBuffer], { type: 'application/zip' });

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
