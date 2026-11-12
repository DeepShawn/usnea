// SPDX-License-Identifier: Apache-2.0
// Test helpers. `USNEA_SRC` must be set before any command starts a Vite server.
process.env.USNEA_SRC = "1";

import { cp, mkdir, mkdtemp, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import type { Io } from "../src/io.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The committed fixture project. */
export const FIXTURE = path.join(HERE, "fixtures", "game");
const TMP = path.join(HERE, ".tmp");
const made: string[] = [];

/** An `Io` that records what was written. */
export interface CapturedIo extends Io {
  readonly out: () => string;
  readonly err: () => string;
}

/** Creates an `Io` for `cwd` that collects stdout and stderr. */
export function capture(cwd: string): CapturedIo {
  let out = "";
  let err = "";
  return {
    cwd,
    stdout: (t) => {
      out += t;
    },
    stderr: (t) => {
      err += t;
    },
    out: () => out,
    err: () => err,
  };
}

/** Copies the fixture into `test/.tmp` (inside the package so `usnea` resolves); returns the copy. */
export async function copyFixture(): Promise<string> {
  await mkdir(TMP, { recursive: true });
  const dir = await mkdtemp(path.join(TMP, "game-"));
  made.push(dir);
  await cp(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Removes the copies made by this test file (other files may run in parallel). */
export async function cleanTmp(): Promise<void> {
  for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true });
  await rmdir(TMP).catch(() => undefined);
}

/** A decoded PNG: 8-bit RGBA, top row first. */
export interface Png {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  pixel(x: number, y: number): [number, number, number, number];
}

/** Minimal PNG decoder for 8-bit RGB/RGBA, non-interlaced images. */
export function decodePng(buf: Uint8Array): Png {
  const b = Buffer.from(buf);
  let pos = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  const idat: Buffer[] = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const name = b.toString("latin1", pos + 4, pos + 8);
    const body = b.subarray(pos + 8, pos + 8 + len);
    if (name === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("unsupported PNG");
      type = body[9] as number;
    } else if (name === "IDAT") idat.push(body);
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (bpp === 0) throw new Error(`unsupported PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i] as number;
      const left = i >= bpp ? (px[y * stride + i - bpp] as number) : 0;
      const up = y > 0 ? (px[(y - 1) * stride + i] as number) : 0;
      const ul = y > 0 && i >= bpp ? (px[(y - 1) * stride + i - bpp] as number) : 0;
      let v = x;
      if (filter === 1) v = x + left;
      else if (filter === 2) v = x + up;
      else if (filter === 3) v = x + ((left + up) >> 1);
      else if (filter === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - ul);
        v = x + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul);
      }
      px[y * stride + i] = v & 255;
    }
  }
  return {
    width,
    height,
    data: px,
    pixel(x, y) {
      const o = y * stride + x * bpp;
      return [
        px[o] as number,
        px[o + 1] as number,
        px[o + 2] as number,
        bpp === 4 ? (px[o + 3] as number) : 255,
      ];
    },
  };
}
