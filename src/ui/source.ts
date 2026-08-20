/**
 * Source-image intake: file picking, drag & drop, paste, SVG rasterisation.
 */

export interface SourceImage {
  readonly name: string;
  /** Blob handed to `createImageBitmap` — a rasterised PNG for SVG inputs. */
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  /** Object URL for the preview `<img>`. Revoked by `disposeSource`. */
  readonly previewUrl: string;
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const SVG_RASTER_SIZE = 1024;
const MAX_BYTES = 25 * 1024 * 1024;

export function disposeSource(source: SourceImage | null): void {
  if (source) URL.revokeObjectURL(source.previewUrl);
}

/**
 * SVG has no intrinsic pixel size, and `createImageBitmap` refuses SVG blobs in
 * Firefox and Safari. Rasterising through an `<img>` at a fixed 1024px gives a
 * consistent, high-quality starting point on every engine.
 */
async function rasteriseSvg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not parse that SVG'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = SVG_RASTER_SIZE;
    canvas.height = SVG_RASTER_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.imageSmoothingQuality = 'high';

    // Preserve aspect ratio; SVGs with a viewBox but no width/height report 0.
    const w = img.naturalWidth || SVG_RASTER_SIZE;
    const h = img.naturalHeight || SVG_RASTER_SIZE;
    const ratio = Math.min(SVG_RASTER_SIZE / w, SVG_RASTER_SIZE / h);
    const dw = Math.round(w * ratio);
    const dh = Math.round(h * ratio);
    ctx.drawImage(img, Math.round((SVG_RASTER_SIZE - dw) / 2), Math.round((SVG_RASTER_SIZE - dh) / 2), dw, dh);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('SVG rasterise failed'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readSource(file: File): Promise<SourceImage> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Unsupported file type. Use PNG, JPEG, WebP or SVG.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('That file is over 25 MB. Export a smaller PNG first.');
  }

  const blob = file.type === 'image/svg+xml' ? await rasteriseSvg(file) : file;

  const bitmap = await createImageBitmap(blob).catch(() => {
    throw new Error('That image could not be decoded.');
  });
  const { width, height } = bitmap;
  bitmap.close();

  if (width < 2 || height < 2) throw new Error('That image is too small.');

  return { name: file.name, blob, width, height, previewUrl: URL.createObjectURL(blob) };
}

/** Human-readable caveats about the chosen source, shown under the preview. */
export function sourceWarning(source: SourceImage): string | null {
  if (source.width !== source.height) {
    return `Not square (${source.width}×${source.height}). It will be letterboxed, not stretched.`;
  }
  if (source.width < 1024) {
    return `Smaller than 1024×1024. The 1024px App Store icon will be upscaled and look soft.`;
  }
  return null;
}

/**
 * Wires click, keyboard and drag-and-drop onto a dropzone.
 *
 * Deliberately does NOT bind a document-level paste handler: two dropzones now
 * exist and a global listener in here would fire both. Paste is routed by the
 * active view instead — see `attachPaste`.
 */
export function attachDropzone(
  dropzone: HTMLElement,
  input: HTMLInputElement,
  onFiles: (files: File[]) => void,
  isFull: () => boolean = () => false,
): void {
  const openPicker = () => input.click();

  dropzone.addEventListener('click', (event) => {
    // Let buttons inside the zone (remove, "choose another") handle themselves.
    if ((event.target as HTMLElement).closest('button')) return;
    if (!isFull()) openPicker();
  });

  dropzone.addEventListener('keydown', (event) => {
    // Only when the zone itself has focus. The zone can contain text inputs
    // (inline rename), and typing a space in one of those bubbles up here —
    // which would swallow the keystroke and pop open a file picker.
    if (event.target !== dropzone) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  });

  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    if (files.length > 0) onFiles(files);
    input.value = ''; // allow re-picking the same file
  });

  const stop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  dropzone.addEventListener('dragenter', (event) => {
    stop(event);
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragover', (event) => {
    stop(event);
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragleave', (event) => {
    stop(event);
    if (!dropzone.contains(event.relatedTarget as Node)) dropzone.classList.remove('is-over');
  });
  dropzone.addEventListener('drop', (event) => {
    stop(event);
    dropzone.classList.remove('is-over');
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) onFiles(files);
  });
}

/** One document-level paste listener, dispatched by the caller. */
export function attachPaste(onFiles: (files: File[]) => void): void {
  document.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length > 0) onFiles(files);
  });
}

/** Stop the browser navigating away when a drop lands outside a dropzone. */
export function guardWindowDrops(): void {
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());
}
