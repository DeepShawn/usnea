// SPDX-License-Identifier: Apache-2.0
import { inflateSync } from "node:zlib";

/** Decodes an 8-bit RGB or RGBA non-interlaced PNG; returns a pixel reader (top row first). */
export function decodePng(file: Uint8Array): (x: number, y: number) => number[] {
  const b = Buffer.from(file);
  const idat: Buffer[] = [];
  let [width, bpp] = [0, 4];
  for (let pos = 8; pos < b.length; pos += 12 + b.readUInt32BE(pos)) {
    const name = b.toString("latin1", pos + 4, pos + 8);
    const body = b.subarray(pos + 8, pos + 8 + b.readUInt32BE(pos));
    if (name === "IHDR") [width, bpp] = [body.readUInt32BE(0), body[9] === 6 ? 4 : 3];
    if (name === "IDAT") idat.push(body);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = new Uint8Array((raw.length / (stride + 1)) * stride);
  for (let y = 0; y < px.length / stride; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? px[y * stride + i - bpp] : 0;
      const up = y > 0 ? px[(y - 1) * stride + i] : 0;
      const ul = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      const p = left + up - ul;
      const paeth = [left, up, ul].reduce((best, v) =>
        Math.abs(p - v) < Math.abs(p - best) ? v : best,
      );
      const add = [0, left, up, (left + up) >> 1, paeth][filter] ?? 0;
      px[y * stride + i] = (raw[y * (stride + 1) + 1 + i] + add) & 255;
    }
  }
  return (x, y) => Array.from(px.subarray(y * stride + x * bpp, y * stride + x * bpp + bpp));
}
