// SPDX-License-Identifier: Apache-2.0
import { defineResource } from "../resources.js";
import type { World } from "../types.js";
import type { ViewState } from "./types.js";

/** Resource holding the design size, surface size and last view transform. */
export const View = defineResource<ViewState>("View", () => ({
  width: 800,
  height: 600,
  surfaceWidth: 800,
  surfaceHeight: 600,
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
}));

/** Copies the surface size and the world-to-clip numbers of `view` into the resource. */
export function storeView(
  state: ViewState,
  view: ArrayLike<number>,
  surfaceW: number,
  surfaceH: number,
): void {
  state.surfaceWidth = surfaceW;
  state.surfaceHeight = surfaceH;
  state.a = view[0] as number;
  state.b = view[1] as number;
  state.c = view[2] as number;
  state.d = view[3] as number;
  state.tx = view[4] as number;
  state.ty = view[5] as number;
}

/** The object `screenToWorld` accepts to avoid allocating. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Converts surface pixel coordinates (as in pointer events) to world coordinates, inverting the
 * last view transform. Allocates only when `out` is omitted.
 */
export function screenToWorld(
  world: World,
  x: number,
  y: number,
  out: Point = { x: 0, y: 0 },
): Point {
  const v = world.res(View);
  const sw = v.surfaceWidth > 0 ? v.surfaceWidth : v.width;
  const sh = v.surfaceHeight > 0 ? v.surfaceHeight : v.height;
  const cx = (2 * x) / sw - 1 - v.tx;
  const cy = 1 - (2 * y) / sh - v.ty;
  const det = v.a * v.d - v.b * v.c;
  out.x = (v.d * cx - v.c * cy) / det;
  out.y = (v.a * cy - v.b * cx) / det;
  return out;
}
