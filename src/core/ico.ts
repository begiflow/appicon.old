/**
 * Minimal ICO container writer.
 *
 * We embed PNG payloads rather than BMP/DIB. Every browser since IE11 — and
 * Windows since Vista — decodes PNG-in-ICO, and it avoids hand-rolling a DIB
 * encoder with its bottom-up row order and AND-mask padding rules.
 */

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;

export interface IcoImage {
  /** Edge length in pixels. 256 is encoded as 0 per the ICO spec. */
  readonly size: number;
  readonly png: Uint8Array;
}

export function buildIco(images: readonly IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error('buildIco: no images');

  const headerSize = ICONDIR_SIZE + ICONDIRENTRY_SIZE * images.length;
  const total = images.reduce((sum, img) => sum + img.png.byteLength, headerSize);

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: 1 = icon
  view.setUint16(4, images.length, true);

  let entryOffset = ICONDIR_SIZE;
  let dataOffset = headerSize;

  for (const { size, png } of images) {
    const dim = size >= 256 ? 0 : size;
    view.setUint8(entryOffset, dim); // width
    view.setUint8(entryOffset + 1, dim); // height
    view.setUint8(entryOffset + 2, 0); // palette colour count
    view.setUint8(entryOffset + 3, 0); // reserved
    view.setUint16(entryOffset + 4, 1, true); // colour planes
    view.setUint16(entryOffset + 6, 32, true); // bits per pixel
    view.setUint32(entryOffset + 8, png.byteLength, true);
    view.setUint32(entryOffset + 12, dataOffset, true);

    bytes.set(png, dataOffset);

    entryOffset += ICONDIRENTRY_SIZE;
    dataOffset += png.byteLength;
  }

  return bytes;
}
