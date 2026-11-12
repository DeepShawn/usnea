// SPDX-License-Identifier: Apache-2.0
import type { PlatformImage, TextStyle } from "usnea";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function fontString(style: TextStyle): string {
  return `${style.size}px ${style.font}`;
}

/** Splits text into lines: explicit newlines always break, words wrap at `wrapWidth`. */
function layout(ctx: Ctx, text: string, wrapWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (wrapWidth <= 0) {
      lines.push(paragraph);
      continue;
    }
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (line !== "" && ctx.measureText(candidate).width > wrapWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Draws text in white to an offscreen canvas sized tightly to the laid-out text. */
export function rasterizeText(text: string, style: TextStyle): PlatformImage {
  const probe = makeCanvas(1, 1).getContext("2d") as Ctx;
  probe.font = fontString(style);
  const lines = layout(probe, text, style.wrapWidth);
  const lineHeight = style.size * 1.25;
  const textWidth = Math.max(...lines.map((l) => probe.measureText(l).width));
  const width = Math.max(1, Math.ceil(textWidth));
  const height = Math.max(1, Math.ceil(lines.length * lineHeight));

  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d") as Ctx;
  ctx.font = fontString(style);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;
  const x = style.align === "left" ? 0 : style.align === "center" ? width / 2 : width;
  lines.forEach((l, i) => {
    ctx.fillText(l, x, (i + 0.5) * lineHeight);
  });
  return { width, height, source: canvas };
}
