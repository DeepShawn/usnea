// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHeadlessPlatform } from "./index.js";

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number): number[] => [n >> 8, n & 255];
const u16le = (n: number): number[] => [n & 255, n >> 8];
const u32 = (n: number): number[] => [...u16(n >>> 16), ...u16(n & 0xffff)];
const u32le = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const u24le = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const riff = (kind: string, body: number[]): number[] => [
  ...ascii("RIFF"),
  ...u32le(4 + 8 + body.length),
  ...ascii("WEBP"),
  ...ascii(kind),
  ...u32le(body.length),
  ...body,
];

const files: Record<string, number[]> = {
  "a.png": [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    ...ascii("IHDR"),
    ...u32(30),
    ...u32(20),
  ],
  "a.gif": [...ascii("GIF89a"), ...u16le(31), ...u16le(21), 0, 0, 0],
  "a.jpg": [
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...u16(4),
    0,
    0,
    0xff,
    0xc0,
    ...u16(11),
    8,
    ...u16(22),
    ...u16(32),
    3,
    1,
    0x11,
    0,
  ],
  "lossy.webp": riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(33), ...u16le(23), 0, 0]),
  "lossless.webp": riff("VP8L", [0x2f, ...u32le(34 - 1 + ((24 - 1) << 14)), 0, 0, 0, 0]),
  "ext.webp": riff("VP8X", [0, 0, 0, 0, ...u24le(35 - 1), ...u24le(25 - 1)]),
  "bad.bin": ascii("not an image at all, just text........"),
};

describe("loadImage", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "usnea-img-"));
    for (const [name, bytes] of Object.entries(files)) {
      await writeFile(path.join(dir, name), Uint8Array.from(bytes));
    }
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  const cases: [string, number, number][] = [
    ["a.png", 30, 20],
    ["a.gif", 31, 21],
    ["a.jpg", 32, 22],
    ["lossy.webp", 33, 23],
    ["lossless.webp", 34, 24],
    ["ext.webp", 35, 25],
  ];
  it.each(cases)("reads the size of %s", async (name, width, height) => {
    const p = createHeadlessPlatform({ root: dir });
    expect(await p.loadImage(name)).toEqual({ width, height, source: undefined });
  });

  it("rejects unsupported formats with a clear message", async () => {
    const p = createHeadlessPlatform({ root: dir });
    await expect(p.loadImage("bad.bin")).rejects.toThrow(/"bad\.bin".*unsupported format/);
  });
});
