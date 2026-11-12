// SPDX-License-Identifier: Apache-2.0
// A 2x3 PNG with one opaque red pixel colour (generated with zlib-free stored blocks).
/** Builds a tiny 2x3 RGB PNG (stored zlib block, no compression). */
export function makePng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(3, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const rows = Buffer.concat(
    Array.from({ length: 3 }, () => Buffer.from([0, 255, 0, 0, 255, 0, 0])),
  );
  // zlib stream with a single stored block.
  const adler = (() => {
    let a = 1;
    let b = 0;
    for (const v of rows) {
      a = (a + v) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  })();
  const head = Buffer.from([0x78, 0x01, 0x01]);
  const lens = Buffer.alloc(4);
  lens.writeUInt16LE(rows.length, 0);
  lens.writeUInt16LE(~rows.length & 0xffff, 2);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(adler);
  const idat = Buffer.concat([head, lens, rows, tail]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
