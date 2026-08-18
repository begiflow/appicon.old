/** Message contract between the UI thread and the render worker. */

import type { RenderMode } from '../specs/types';

/**
 * One deduplicated render unit. Several archive entries may reference the same
 * id — that is the point of deduplicating.
 *
 * `source` indexes into `WorkerRequest.bitmaps`. App icons always derive from a
 * single source, but image sets process a whole batch in one worker round-trip,
 * so the job has to say which image it belongs to.
 */
export type RenderJob =
  | {
      readonly kind: 'icon';
      readonly id: string;
      readonly source: number;
      /** Output edge length; icons are always square. */
      readonly px: number;
      readonly mode: RenderMode;
    }
  | {
      readonly kind: 'scale';
      readonly id: string;
      readonly source: number;
      /** Image sets keep the source aspect ratio, so width and height differ. */
      readonly w: number;
      readonly h: number;
    };

export type WorkerRequest = {
  readonly type: 'render';
  /** Transferred, not copied. The worker closes every one when it finishes. */
  readonly bitmaps: readonly ImageBitmap[];
  readonly background: string;
  readonly jobs: readonly RenderJob[];
};

export type WorkerResponse =
  | { readonly type: 'result'; readonly id: string; readonly png: Uint8Array; readonly done: number }
  | { readonly type: 'complete' }
  | { readonly type: 'error'; readonly message: string };
