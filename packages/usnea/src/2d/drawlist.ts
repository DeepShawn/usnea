// SPDX-License-Identifier: Apache-2.0
import type { DrawList } from "./types.js";

const INITIAL_QUADS = 256;

/** Creates an empty draw list with room for a few hundred quads. */
export function createDrawList(): DrawList {
  return {
    count: 0,
    vertices: new Float32Array(INITIAL_QUADS * 16),
    colors: new Uint32Array(INITIAL_QUADS),
    textures: new Uint32Array(INITIAL_QUADS),
  };
}

/** Grows the list arrays by doubling so that `quads` quads fit; contents are kept. */
export function ensureQuads(list: DrawList, quads: number): void {
  let cap = list.colors.length;
  if (quads <= cap) return;
  while (cap < quads) cap *= 2;
  const vertices = new Float32Array(cap * 16);
  vertices.set(list.vertices);
  const colors = new Uint32Array(cap);
  colors.set(list.colors);
  const textures = new Uint32Array(cap);
  textures.set(list.textures);
  list.vertices = vertices;
  list.colors = colors;
  list.textures = textures;
}

/** A 2D transform applied to local quad corners: scale, then clockwise rotation, then move. */
export interface Xform {
  x: number;
  y: number;
  cos: number;
  sin: number;
  sx: number;
  sy: number;
}

/** Creates an identity transform. */
export function createXform(): Xform {
  return { x: 0, y: 0, cos: 1, sin: 0, sx: 1, sy: 1 };
}

/** Sets a transform from position, clockwise angle in radians and scale. */
export function setXform(xf: Xform, x: number, y: number, angle: number, sx: number, sy: number) {
  xf.x = x;
  xf.y = y;
  xf.cos = Math.cos(angle);
  xf.sin = Math.sin(angle);
  xf.sx = sx;
  xf.sy = sy;
}

/**
 * Appends one quad. (l0, t0)-(l1, t1) is the local rectangle, (u0, v0)-(u1, v1) the
 * texture rectangle of its top-left and bottom-right corners.
 */
export function writeQuad(
  list: DrawList,
  xf: Xform,
  l0: number,
  t0: number,
  l1: number,
  t1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  color: number,
  texture: number,
): void {
  const q = list.count;
  ensureQuads(list, q + 1);
  const v = list.vertices;
  const a = xf.cos * xf.sx;
  const b = xf.sin * xf.sx;
  const c = -xf.sin * xf.sy;
  const d = xf.cos * xf.sy;
  const o = q * 16;
  v[o] = xf.x + l0 * a + t0 * c;
  v[o + 1] = xf.y + l0 * b + t0 * d;
  v[o + 2] = u0;
  v[o + 3] = v0;
  v[o + 4] = xf.x + l1 * a + t0 * c;
  v[o + 5] = xf.y + l1 * b + t0 * d;
  v[o + 6] = u1;
  v[o + 7] = v0;
  v[o + 8] = xf.x + l1 * a + t1 * c;
  v[o + 9] = xf.y + l1 * b + t1 * d;
  v[o + 10] = u1;
  v[o + 11] = v1;
  v[o + 12] = xf.x + l0 * a + t1 * c;
  v[o + 13] = xf.y + l0 * b + t1 * d;
  v[o + 14] = u0;
  v[o + 15] = v1;
  list.colors[q] = color >>> 0;
  list.textures[q] = texture;
  list.count = q + 1;
}
