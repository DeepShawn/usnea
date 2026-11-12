// SPDX-License-Identifier: Apache-2.0
import type { Entity } from "../types.js";
import type { FontAsset } from "./assets.js";
import { Text } from "./components.js";
import type { DrawContext } from "./context.js";
import { writeQuad } from "./drawlist.js";
import { layoutBitmapText } from "./text.js";

/** Appends the quads of a Text entity; `ctx.xf` must hold its transform. */
export function emitText(ctx: DrawContext, e: Entity): void {
  const font = Text.font[e] as string;
  const color = Text.color[e] as number;
  const ax = Text.anchorX[e] as number;
  const ay = Text.anchorY[e] as number;
  if (font.endsWith(".font.json")) {
    const asset = ctx.assets.get<FontAsset>(font);
    if (asset === undefined) return;
    const layout = ctx.layout;
    layoutBitmapText(
      layout,
      asset.data,
      Text.text[e] as string,
      Text.size[e] as number,
      Text.wrapWidth[e] as number,
      Text.align[e] as string,
    );
    const ox = -ax * layout.width;
    const oy = -ay * layout.height;
    const { id, width: tw, height: th } = asset.texture;
    const g = layout.glyphs;
    for (let i = 0; i < layout.count; i++) {
      const o = i * 8;
      const x = ox + (g[o] as number);
      const y = oy + (g[o + 1] as number);
      const sx = g[o + 4] as number;
      const sy = g[o + 5] as number;
      writeQuad(
        ctx.list,
        ctx.xf,
        x,
        y,
        x + (g[o + 2] as number),
        y + (g[o + 3] as number),
        sx / tw,
        sy / th,
        (sx + (g[o + 6] as number)) / tw,
        (sy + (g[o + 7] as number)) / th,
        color,
        id,
      );
    }
    return;
  }
  const texts = ctx.texts;
  if (texts === undefined) return;
  const tex = texts.acquire(ctx.platform, e);
  const x = -ax * tex.width;
  const y = -ay * tex.height;
  writeQuad(ctx.list, ctx.xf, x, y, x + tex.width, y + tex.height, 0, 0, 1, 1, color, tex.id);
}
