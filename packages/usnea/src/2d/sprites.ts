// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "../errors.js";
import type { Entity } from "../types.js";
import type { AtlasAsset } from "./assets.js";
import { NineSlice, Sprite } from "./components.js";
import type { DrawContext, SourceRect } from "./context.js";
import { writeQuad } from "./drawlist.js";
import type { TextureInfo } from "./types.js";

interface ImageRef {
  readonly base: string;
  readonly frame: string | undefined;
}

const DX = new Float64Array(4);
const DY = new Float64Array(4);
const SX = new Float64Array(4);
const SY = new Float64Array(4);
/** Memo of the pure `parseRef` function. */
const refs = new Map<string, ImageRef>();

function parseRef(path: string): ImageRef {
  let ref = refs.get(path);
  if (ref === undefined) {
    const hash = path.indexOf("#");
    ref =
      hash < 0
        ? { base: path, frame: undefined }
        : { base: path.slice(0, hash), frame: path.slice(hash + 1) };
    refs.set(path, ref);
  }
  return ref;
}

/** Resolves `image` or `atlas.json#frame` into `out`; false while the asset is not loaded. */
export function resolveSource(ctx: DrawContext, path: string, out: SourceRect): boolean {
  if (path === "") {
    ctx.white ??= ctx.backend.createTexture({
      width: 1,
      height: 1,
      source: new Uint8Array([255, 255, 255, 255]),
    });
    setRect(out, ctx.white, 0, 0, 1, 1);
    return true;
  }
  const ref = parseRef(path);
  const asset = ctx.assets.get<TextureInfo | AtlasAsset>(ref.base);
  if (asset === undefined) return false;
  if (ref.frame === undefined) {
    const tex = asset as TextureInfo;
    setRect(out, tex, 0, 0, tex.width, tex.height);
    return true;
  }
  const atlas = asset as AtlasAsset;
  const frame = atlas.frames[ref.frame];
  if (frame === undefined) {
    throw usneaError(
      "USN-E040",
      `Atlas "${ref.base}" has no frame "${ref.frame}"`,
      "2d sprite drawing",
      `use one of: ${Object.keys(atlas.frames).join(", ")}`,
    );
  }
  setRect(out, atlas.texture, frame.x, frame.y, frame.w, frame.h);
  return true;
}

function setRect(out: SourceRect, tex: TextureInfo, x: number, y: number, w: number, h: number) {
  out.tex = tex.id;
  out.texW = tex.width;
  out.texH = tex.height;
  out.x = x;
  out.y = y;
  out.w = w;
  out.h = h;
}

/** Appends the quad (or nine quads) of a sprite; `ctx.xf` must hold its transform. */
export function emitSprite(ctx: DrawContext, e: Entity): void {
  const src = ctx.src;
  if (!resolveSource(ctx, Sprite.image[e] as string, src)) return;
  const w = (Sprite.width[e] as number) || src.w;
  const h = (Sprite.height[e] as number) || src.h;
  const x0 = -(Sprite.anchorX[e] as number) * w;
  const y0 = -(Sprite.anchorY[e] as number) * h;
  const color = Sprite.color[e] as number;
  if (ctx.world.has(e, NineSlice)) {
    emitNine(ctx, x0, y0, w, h, color, e);
    return;
  }
  let u0 = src.x / src.texW;
  let u1 = (src.x + src.w) / src.texW;
  let v0 = src.y / src.texH;
  let v1 = (src.y + src.h) / src.texH;
  if (Sprite.flipX[e]) [u0, u1] = [u1, u0];
  if (Sprite.flipY[e]) [v0, v1] = [v1, v0];
  writeQuad(ctx.list, ctx.xf, x0, y0, x0 + w, y0 + h, u0, v0, u1, v1, color, src.tex);
}

function emitNine(
  ctx: DrawContext,
  x0: number,
  y0: number,
  w: number,
  h: number,
  color: number,
  e: Entity,
) {
  const src = ctx.src;
  const l = NineSlice.left[e] as number;
  const t = NineSlice.top[e] as number;
  const r = NineSlice.right[e] as number;
  const b = NineSlice.bottom[e] as number;
  // Local (destination) and source boundaries of the three columns and rows.
  const dx = DX;
  const dy = DY;
  const sx = SX;
  const sy = SY;
  dx.set([x0, x0 + l, x0 + w - r, x0 + w]);
  dy.set([y0, y0 + t, y0 + h - b, y0 + h]);
  sx.set([src.x, src.x + l, src.x + src.w - r, src.x + src.w]);
  sy.set([src.y, src.y + t, src.y + src.h - b, src.y + src.h]);
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const dw = (dx[i + 1] as number) - (dx[i] as number);
      const dh = (dy[j + 1] as number) - (dy[j] as number);
      const sw = (sx[i + 1] as number) - (sx[i] as number);
      const sh = (sy[j + 1] as number) - (sy[j] as number);
      if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) continue;
      writeQuad(
        ctx.list,
        ctx.xf,
        dx[i] as number,
        dy[j] as number,
        dx[i + 1] as number,
        dy[j + 1] as number,
        (sx[i] as number) / src.texW,
        (sy[j] as number) / src.texH,
        (sx[i + 1] as number) / src.texW,
        (sy[j + 1] as number) / src.texH,
        color,
        src.tex,
      );
    }
  }
}
