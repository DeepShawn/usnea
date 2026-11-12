// SPDX-License-Identifier: Apache-2.0
//
// Image size from file headers; no pixel decoding.

/** Reads width and height from a PNG, GIF, JPEG or WebP header; throws on anything else. */
export function readImageSize(bytes: Uint8Array, path: string): { width: number; height: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, n: number): string =>
    String.fromCharCode(...bytes.subarray(at, at + n));
  const bad = (why: string): Error => new Error(`Cannot read image size of "${path}": ${why}`);

  if (bytes.length >= 24 && v.getUint32(0) === 0x89504e47 && ascii(12, 4) === "IHDR") {
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (bytes.length >= 10 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) {
    return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p] !== 0xff) {
        p++;
        continue;
      }
      const marker = bytes[p + 1] as number;
      if (marker === 0xff) {
        p++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        p += 2;
        continue;
      }
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        if (p + 9 > bytes.length) break;
        return { width: v.getUint16(p + 7), height: v.getUint16(p + 5) };
      }
      p += 2 + v.getUint16(p + 2);
    }
    throw bad("JPEG has no frame header");
  }
  if (bytes.length >= 25 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const kind = ascii(12, 4);
    if (kind === "VP8 " && bytes.length >= 30) {
      return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    }
    if (kind === "VP8L") {
      const bits = v.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8X" && bytes.length >= 30) {
      const u24 = (at: number): number =>
        (bytes[at] as number) |
        ((bytes[at + 1] as number) << 8) |
        ((bytes[at + 2] as number) << 16);
      return { width: u24(24) + 1, height: u24(27) + 1 };
    }
    throw bad(`unsupported WebP chunk "${kind}"`);
  }
  throw bad("unsupported format (supported: PNG, GIF, JPEG, WebP)");
}
