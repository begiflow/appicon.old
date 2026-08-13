/** Message contract between the UI thread and the render worker. */

import type { RenderMode } from '../specs/types';

/** One deduplicated render unit. Several zip entries may reference the same id. */
export interface RenderJob {
  readonly id: string;
  readonly px: number;
  readonly mode: RenderMode;
}

export type WorkerRequest = {
  readonly type: 'render';
  readonly bitmap: ImageBitmap;
  readonly background: string;
  readonly jobs: readonly RenderJob[];
};

export type WorkerResponse =
  | { readonly type: 'result'; readonly id: string; readonly png: Uint8Array; readonly done: number }
  | { readonly type: 'complete' }
  | { readonly type: 'error'; readonly message: string };
