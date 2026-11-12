// SPDX-License-Identifier: Apache-2.0

/** Camera state used to build the view transform. */
export interface ViewCamera {
  /** False when the scene has no active camera: world origin is the top-left corner. */
  active: boolean;
  x: number;
  y: number;
  zoom: number;
  /** Clockwise radians. */
  angle: number;
}

/** Creates a camera state meaning "no camera". */
export function createViewCamera(): ViewCamera {
  return { active: false, x: 0, y: 0, zoom: 1, angle: 0 };
}

/**
 * Writes [a, b, c, d, tx, ty] mapping world pixels to clip space (y up) into `out`.
 * The design rectangle is fitted ("contain") inside the surface and centred.
 */
export function computeView(
  out: Float32Array,
  designW: number,
  designH: number,
  surfaceW: number,
  surfaceH: number,
  camera: ViewCamera,
): void {
  const sw = surfaceW > 0 ? surfaceW : designW;
  const sh = surfaceH > 0 ? surfaceH : designH;
  // world -> design pixels
  let a1 = 1;
  let b1 = 0;
  let c1 = 0;
  let d1 = 1;
  let tx1 = 0;
  let ty1 = 0;
  if (camera.active) {
    const cos = Math.cos(camera.angle) * camera.zoom;
    const sin = Math.sin(camera.angle) * camera.zoom;
    a1 = cos;
    b1 = -sin;
    c1 = sin;
    d1 = cos;
    tx1 = designW / 2 - (a1 * camera.x + c1 * camera.y);
    ty1 = designH / 2 - (b1 * camera.x + d1 * camera.y);
  }
  // design pixels -> surface pixels (contain) -> clip
  const s = Math.min(sw / designW, sh / designH);
  const ox = (sw - designW * s) / 2;
  const oy = (sh - designH * s) / 2;
  const kx = (2 * s) / sw;
  const ky = (-2 * s) / sh;
  out[0] = kx * a1;
  out[1] = ky * b1;
  out[2] = kx * c1;
  out[3] = ky * d1;
  out[4] = kx * tx1 + (2 * ox) / sw - 1;
  out[5] = ky * ty1 + 1 - (2 * oy) / sh;
}
