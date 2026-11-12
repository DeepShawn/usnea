// SPDX-License-Identifier: Apache-2.0
import type { BitmapFontData } from "./types.js";

/** Glyph quads of a laid-out text block (reused between calls). */
export interface TextLayout {
  /** Number of glyph quads. */
  count: number;
  /** 8 numbers per glyph: local x, y, w, h, then source x, y, w, h. */
  glyphs: number[];
  /** Block size in local pixels. */
  width: number;
  height: number;
  /** Scratch: line start, end (exclusive) and width, three numbers per line. */
  lines: number[];
}

/** Creates an empty layout. */
export function createTextLayout(): TextLayout {
  return { count: 0, glyphs: [], width: 0, height: 0, lines: [] };
}

function advance(font: BitmapFontData, ch: string, scale: number): number {
  const g = font.glyphs[ch];
  return g === undefined ? 0 : g.xadvance * scale;
}

function measure(font: BitmapFontData, text: string, from: number, to: number, scale: number) {
  let w = 0;
  for (let k = from; k < to; k++) w += advance(font, text[k] as string, scale);
  return w;
}

function pushLine(
  out: TextLayout,
  font: BitmapFontData,
  text: string,
  a: number,
  b: number,
  scale: number,
) {
  out.lines.push(a, b, measure(font, text, a, b, scale));
}

function wrapParagraph(
  out: TextLayout,
  font: BitmapFontData,
  text: string,
  s: number,
  e: number,
  wrap: number,
  scale: number,
) {
  let start = s;
  let w = 0;
  let lastSpace = -1;
  for (let k = s; k < e; k++) {
    const ch = text[k] as string;
    if (ch === " ") lastSpace = k;
    const adv = advance(font, ch, scale);
    if (w + adv > wrap && k > start) {
      if (lastSpace >= start) {
        pushLine(out, font, text, start, lastSpace, scale);
        start = lastSpace + 1;
      } else {
        pushLine(out, font, text, start, k, scale);
        start = k;
      }
      k = start - 1;
      w = 0;
      lastSpace = -1;
      continue;
    }
    w += adv;
  }
  pushLine(out, font, text, start, e, scale);
}

/**
 * Lays out `text` with a bitmap font into `out`. Scale is `size / font.size`; "\n" breaks lines;
 * `wrapWidth` > 0 wraps at spaces; unknown glyphs are skipped. The block's top-left is (0, 0).
 */
export function layoutBitmapText(
  out: TextLayout,
  font: BitmapFontData,
  text: string,
  size: number,
  wrapWidth: number,
  align: string,
): void {
  const scale = font.size > 0 ? size / font.size : 1;
  out.lines.length = 0;
  out.glyphs.length = 0;
  out.count = 0;
  let from = 0;
  for (;;) {
    const nl = text.indexOf("\n", from);
    const end = nl < 0 ? text.length : nl;
    if (wrapWidth > 0) wrapParagraph(out, font, text, from, end, wrapWidth, scale);
    else pushLine(out, font, text, from, end, scale);
    if (nl < 0) break;
    from = nl + 1;
  }
  let widest = 0;
  for (let i = 2; i < out.lines.length; i += 3) widest = Math.max(widest, out.lines[i] as number);
  const blockW = wrapWidth > 0 ? wrapWidth : widest;
  const lineH = font.lineHeight * scale;
  const rows = out.lines.length / 3;
  for (let row = 0; row < rows; row++) {
    const a = out.lines[row * 3] as number;
    const b = out.lines[row * 3 + 1] as number;
    const lw = out.lines[row * 3 + 2] as number;
    let pen = align === "center" ? (blockW - lw) / 2 : align === "right" ? blockW - lw : 0;
    for (let k = a; k < b; k++) {
      const g = font.glyphs[text[k] as string];
      if (g === undefined) continue;
      if (g.w > 0 && g.h > 0) {
        out.glyphs.push(
          pen + g.xoffset * scale,
          row * lineH + g.yoffset * scale,
          g.w * scale,
          g.h * scale,
          g.x,
          g.y,
          g.w,
          g.h,
        );
        out.count += 1;
      }
      pen += g.xadvance * scale;
    }
  }
  out.width = blockW;
  out.height = rows * lineH;
}
