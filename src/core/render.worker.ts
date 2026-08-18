/// <reference lib="webworker" />

/**
 * Render worker.
 *
 * Resizing 70+ icons — several of them 1024px with a multi-step halving chain —
 * takes long enough to drop frames on the main thread. Doing it here keeps the
 * progress bar smooth. Source `ImageBitmap`s are transferred in (zero copy) and
 * each encoded PNG is transferred back out.
 */

import { encodePng, renderIcon, renderScaled } from './render';
import type { RenderJob, WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

function draw(
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

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { bitmaps, jobs, background } = event.data;
  try {
    let done = 0;
    for (const job of jobs) {
      const png = await encodePng(draw(job, bitmaps, background));
      done += 1;
      // `png.buffer` is a fresh ArrayBuffer per job, so transferring is safe.
      post({ type: 'result', id: job.id, png, done }, [png.buffer]);
    }
    post({ type: 'complete' });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    for (const bitmap of bitmaps) bitmap.close();
  }
};
