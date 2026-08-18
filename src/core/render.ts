/**
 * Canvas rendering primitives. Deliberately free of DOM APIs so this module can
 * be imported from both the main thread and a Web Worker.
 */

import type { RenderMode } from '../specs/types';
import { ADAPTIVE_DP } from '../specs/android';

/**
 * Fraction of an adaptive-icon layer that is guaranteed visible under every
 * OEM mask. Android's spec: a 108dp layer with a 72dp safe zone.
 */
const ADAPTIVE_SAFE_FRACTION = 72 / ADAPTIVE_DP;

type Drawable = ImageBitmap | OffscreenCanvas;

function ctx2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const c = canvas.getContext('2d', { alpha: true });
  if (!c) throw new Error('2D canvas context unavailable');
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  return c;
}

/**
 * Box-filtered downscale via repeated halving.
 *
 * A single `drawImage` from 1024px to 40px produces visible aliasing in every
 * browser because the bilinear sampler only reads a 2x2 neighbourhood. Halving
 * until we are within 2x of the target averages the whole footprint instead,
 * which is what makes small notification icons legible.
 */
function progressiveResize(src: Drawable, dw: number, dh: number): Drawable {
  let cur: Drawable = src;
  let cw = src.width;
  let ch = src.height;

  while (cw >= dw * 2 && ch >= dh * 2 && cw > 1 && ch > 1) {
    const nw = Math.max(dw, cw >> 1);
    const nh = Math.max(dh, ch >> 1);
    const step = new OffscreenCanvas(nw, nh);
    ctx2d(step).drawImage(cur, 0, 0, nw, nh);
    cur = step;
    cw = nw;
    ch = nh;
  }

  if (cw === dw && ch === dh) return cur;

  const out = new OffscreenCanvas(dw, dh);
  ctx2d(out).drawImage(cur, 0, 0, dw, dh);
  return out;
}

/** Aspect-preserving contain box inside a `size` x `size` square. */
function containBox(src: Drawable, size: number): { w: number; h: number; x: number; y: number } {
  const ratio = Math.min(size / src.width, size / src.height);
  const w = Math.max(1, Math.round(src.width * ratio));
  const h = Math.max(1, Math.round(src.height * ratio));
  return { w, h, x: Math.round((size - w) / 2), y: Math.round((size - h) / 2) };
}

function drawContained(
  target: OffscreenCanvasRenderingContext2D,
  src: Drawable,
  size: number,
  contentSize: number,
): void {
  const box = containBox(src, contentSize);
  const scaled = progressiveResize(src, box.w, box.h);
  const offset = Math.round((size - contentSize) / 2);
  target.drawImage(scaled, offset + box.x, offset + box.y);
}

/** Renders one icon variant. Returns the canvas so callers choose the encoding. */
export function renderIcon(
  src: Drawable,
  px: number,
  mode: RenderMode,
  background: string,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(px, px);
  const ctx = ctx2d(canvas);

  switch (mode) {
    case 'adaptive-bg':
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, px, px);
      return canvas;

    case 'adaptive-fg':
      // Transparent 108dp layer, artwork confined to the 72dp safe zone.
      drawContained(ctx, src, px, Math.round(px * ADAPTIVE_SAFE_FRACTION));
      return canvas;

    case 'opaque':
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, px, px);
      drawContained(ctx, src, px, px);
      return canvas;

    case 'circle': {
      ctx.save();
      ctx.beginPath();
      ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      drawContained(ctx, src, px, px);
      ctx.restore();
      return canvas;
    }

    case 'contain':
    default:
      drawContained(ctx, src, px, px);
      return canvas;
  }
}

export async function encodePng(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Straight aspect-preserving resample to an exact pixel size.
 *
 * Unlike `renderIcon`, this never pads to a square and never composites a
 * background — an image-set asset is a plain bitmap that has to keep its own
 * aspect ratio and alpha. The caller computes `dw`/`dh` from the scale factor,
 * so any rounding policy lives in one place rather than here.
 */
export function renderScaled(src: Drawable, dw: number, dh: number): OffscreenCanvas {
  const w = Math.max(1, Math.round(dw));
  const h = Math.max(1, Math.round(dh));
  const scaled = progressiveResize(src, w, h);
  if (scaled instanceof OffscreenCanvas && scaled.width === w && scaled.height === h) {
    return scaled;
  }
  const out = new OffscreenCanvas(w, h);
  ctx2d(out).drawImage(scaled, 0, 0, w, h);
  return out;
}
