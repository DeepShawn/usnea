// SPDX-License-Identifier: Apache-2.0
import type { DrawList } from "usnea/2d";
import { createWebGL2Backend } from "../../src/index.js";

export interface TextureSpec {
  readonly kind: "solid" | "halves" | "bytes";
  /** For `bytes`: RGBA8 pixels uploaded as a `Uint8Array`. */
  readonly pixels?: readonly number[];
  readonly w?: number;
  readonly h?: number;
  readonly color?: readonly number[];
}
export interface QuadSpec {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** 1-based index into `textures`, or a raw id when `rawTex` is set. */
  readonly tex: number;
  readonly rawTex?: number;
  readonly color?: number;
  readonly uv?: readonly [number, number, number, number];
}
export interface Spec {
  readonly width: number;
  readonly height: number;
  readonly clear: number;
  readonly textures: readonly TextureSpec[];
  readonly quads: readonly QuadSpec[];
  readonly resize?: readonly [number, number];
}
export interface Result {
  readonly width: number;
  readonly height: number;
  readonly data: number[];
  readonly drawCalls: number;
}

function makeImage(spec: TextureSpec) {
  if (spec.kind === "bytes") {
    return { width: spec.w ?? 1, height: spec.h ?? 1, source: new Uint8Array(spec.pixels ?? []) };
  }
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const g = c.getContext("2d");
  if (!g) throw new Error("no 2d context");
  if (spec.kind === "solid") {
    const [r, gr, b, a] = spec.color ?? [255, 255, 255, 255];
    g.fillStyle = `rgba(${r},${gr},${b},${(a ?? 255) / 255})`;
    g.fillRect(0, 0, 8, 8);
  } else {
    g.fillStyle = "rgb(255,0,0)";
    g.fillRect(0, 0, 4, 8);
    g.fillStyle = "rgb(0,0,255)";
    g.fillRect(4, 0, 4, 8);
  }
  return { width: 8, height: 8, source: c };
}

function run(spec: Spec): Result {
  const canvas = document.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  document.body.appendChild(canvas);
  const backend = createWebGL2Backend(canvas, { pixelArt: true });
  const ids = spec.textures.map((t) => backend.createTexture(makeImage(t)).id);
  if (spec.resize) backend.resize(spec.resize[0], spec.resize[1]);
  const n = spec.quads.length;
  const list: DrawList = {
    count: n,
    vertices: new Float32Array(n * 16),
    colors: new Uint32Array(n),
    textures: new Uint32Array(n),
  };
  spec.quads.forEach((q, i) => {
    const [u0, v0, u1, v1] = q.uv ?? [0, 0, 1, 1];
    list.vertices.set(
      [
        q.x,
        q.y,
        u0,
        v0,
        q.x + q.w,
        q.y,
        u1,
        v0,
        q.x + q.w,
        q.y + q.h,
        u1,
        v1,
        q.x,
        q.y + q.h,
        u0,
        v1,
      ],
      i * 16,
    );
    list.colors[i] = q.color ?? 0xffffffff;
    list.textures[i] = q.rawTex ?? (ids[q.tex - 1] as number);
  });
  const [w, h] = spec.resize ?? [spec.width, spec.height];
  const view = new Float32Array([2 / w, 0, 0, -2 / h, -1, 1]);
  backend.render({ list, view, clearColor: spec.clear });
  const px = backend.readPixels?.();
  const drawCalls = backend.drawCalls;
  backend.dispose();
  canvas.remove();
  if (!px) throw new Error("readPixels missing");
  return { width: px.width, height: px.height, data: Array.from(px.data), drawCalls };
}

(window as unknown as { runSpec: typeof run }).runSpec = run;
