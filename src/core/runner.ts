/**
 * Worker orchestration shared by the app-icon and image-set pipelines.
 *
 * Both feed the same worker: a list of source bitmaps plus a list of jobs that
 * index into them. Keeping this in one place means the fallback path, the
 * timeout and the transfer-list bookkeeping are written once.
 */

import { zip } from 'fflate';

import type { RenderJob, WorkerRequest, WorkerResponse } from './protocol';
import { encodePng, renderIcon, renderScaled } from './render';

export type ProgressFn = (done: number, total: number) => void;

const RENDER_TIMEOUT_MS = 120_000;

function createWorker(): Worker {
  return new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
}

function drawOnMainThread(
  job: RenderJob,
  bitmaps: readonly ImageBitmap[],
  background: string,
): OffscreenCanvas {
  const source = bitmaps[job.source];
  if (!source) throw new Error(`Job ${job.id} references missing source ${job.source}`);
  return job.kind === 'icon'
    ? renderIcon(source, job.px, job.mode, background)
    : renderScaled(source, job.w, job.h);
}

/**
 * Runs every job and returns `id -> PNG bytes`.
 *
 * Falls back to the main thread when worker construction throws, which happens
 * under strict CSP and in a few in-app browsers. Slower, but the alternative is
 * a dead button.
 */
export async function runJobs(
  bitmaps: readonly ImageBitmap[],
  jobs: readonly RenderJob[],
  background: string,
  onProgress: ProgressFn,
): Promise<Map<string, Uint8Array>> {
  const total = jobs.length;

  let worker: Worker;
  try {
    worker = createWorker();
  } catch {
    const out = new Map<string, Uint8Array>();
    let done = 0;
    for (const job of jobs) {
      out.set(job.id, await encodePng(drawOnMainThread(job, bitmaps, background)));
      onProgress((done += 1), total);
    }
    for (const bitmap of bitmaps) bitmap.close();
    return out;
  }

  return new Promise<Map<string, Uint8Array>>((resolve, reject) => {
    const out = new Map<string, Uint8Array>();
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Rendering timed out'));
    }, RENDER_TIMEOUT_MS);

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

    const request: WorkerRequest = { type: 'render', bitmaps, background, jobs };
    worker.postMessage(request, [...bitmaps]);
  });
}

/**
 * fflate's callback API, promisified.
 *
 * Statically imported on purpose: a dynamic import would split fflate into a
 * lazy chunk, and the page claims to work offline. A first-time offline user
 * would get all the way to a rendered set of icons and then fail at the zip.
 */
export function zipAsync(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // level 6: PNGs are already DEFLATE-compressed, so a higher level costs CPU
    // for well under 1% size. The win is in storing them, not squeezing them.
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/** Wraps archive bytes in a Blob backed by its own ArrayBuffer. */
export function toZipBlob(archive: Uint8Array): Blob {
  return new Blob([archive.slice().buffer as ArrayBuffer], { type: 'application/zip' });
}
