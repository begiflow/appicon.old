/// <reference lib="webworker" />

/**
 * Render worker.
 *
 * Resizing 70+ icons — several of them 1024px with a multi-step halving chain —
 * takes long enough to drop frames on the main thread. Doing it here keeps the
 * progress bar smooth. The source `ImageBitmap` is transferred in (zero copy)
 * and each encoded PNG is transferred back out.
 */

import { encodePng, renderIcon } from './render';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { bitmap, jobs, background } = event.data;
  try {
    let done = 0;
    for (const job of jobs) {
      const png = await encodePng(renderIcon(bitmap, job.px, job.mode, background));
      done += 1;
      // `png.buffer` is a fresh ArrayBuffer per job, so transferring is safe.
      post({ type: 'result', id: job.id, png, done }, [png.buffer]);
    }
    post({ type: 'complete' });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    bitmap.close();
  }
};
