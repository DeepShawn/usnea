// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from "vitest";
import type { AssetStoreInternal } from "../assets.js";
import { Assets } from "../assets.js";
import { UsneaError } from "../errors.js";
import { createKernel, type Kernel } from "../kernel.js";
import type { App, Entity, Platform, PlatformImage, TextStyle } from "../types.js";
import { Camera, NineSlice, Position, Rotation, render2d, Scale, Sprite, Text } from "./index.js";
import type { Frame, RenderBackend, TextureInfo } from "./types.js";

const IMAGES: Record<string, [number, number]> = {
  "hero.png": [32, 16],
  "tiles.png": [64, 64],
  "ui.png": [48, 48],
  "font.png": [64, 32],
};
const FILES: Record<string, string> = {
  "tiles.atlas.json": JSON.stringify({
    usnea: "0.1",
    image: "tiles.png",
    frames: { a: { x: 16, y: 32, w: 16, h: 8 } },
  }),
  "f.font.json": JSON.stringify({
    usnea: "0.1",
    image: "font.png",
    size: 16,
    lineHeight: 20,
    glyphs: {
      A: { x: 0, y: 0, w: 8, h: 10, xoffset: 1, yoffset: 2, xadvance: 10 },
      B: { x: 8, y: 0, w: 6, h: 10, xoffset: 0, yoffset: 2, xadvance: 8 },
      " ": { x: 0, y: 0, w: 0, h: 0, xoffset: 0, yoffset: 0, xadvance: 4 },
    },
  }),
};

interface Snap {
  count: number;
  v: number[];
  colors: number[];
  textures: number[];
  view: number[];
  clear: number;
  list: object;
  arrays: object[];
}

function makeBackend() {
  let nextId = 1;
  const created: TextureInfo[] = [];
  const sources: unknown[] = [];
  const destroyed: TextureInfo[] = [];
  const resizes: number[][] = [];
  const frames: Snap[] = [];
  const backend: RenderBackend = {
    name: "fake",
    drawCalls: 0,
    createTexture(image: PlatformImage) {
      const t = { id: nextId++, width: image.width, height: image.height };
      created.push(t);
      sources.push(image.source);
      return t;
    },
    destroyTexture: (t) => void destroyed.push(t),
    resize: (w, h) => void resizes.push([w, h]),
    render(frame: Frame) {
      const l = frame.list;
      frames.push({
        count: l.count,
        v: [...l.vertices.subarray(0, l.count * 16)],
        colors: [...l.colors.subarray(0, l.count)],
        textures: [...l.textures.subarray(0, l.count)],
        view: [...frame.view],
        clear: frame.clearColor,
        list: l,
        arrays: [l.vertices, l.colors, l.textures, frame.view],
      });
    },
    dispose() {},
  };
  return { backend, created, sources, destroyed, resizes, frames };
}

interface Opts {
  surface?: { width: number; height: number };
  raster?: boolean;
  platform?: boolean;
  width?: number;
  height?: number;
}

function setup(opts: Opts = {}) {
  const b = makeBackend();
  const surface = { width: 800, height: 600, pixelRatio: 1, native: null, ...opts.surface };
  const platform = {
    surface,
    loadImage: async (p: string) => {
      const s = IMAGES[p];
      if (!s) throw new Error(`no image ${p}`);
      return { width: s[0], height: s[1], source: null };
    },
    readText: async (p: string) => {
      const t = FILES[p];
      if (t === undefined) throw new Error(`no file ${p}`);
      return t;
    },
    rasterizeText:
      opts.raster === false
        ? undefined
        : (text: string, style: TextStyle) => ({
            width: text.length * 8,
            height: style.size,
            source: null,
          }),
  } as unknown as Platform;
  const plugin = render2d({
    backend: b.backend,
    width: opts.width ?? 800,
    height: opts.height ?? 600,
  });
  const k = createKernel({
    components: plugin.components ?? [],
    systems: plugin.systems ?? [],
    resources: plugin.resources ?? [],
  });
  const p = opts.platform === false ? undefined : platform;
  plugin.setup?.({ world: k.world, platform: p } as unknown as App);
  const store = k.world.res(Assets) as AssetStoreInternal;
  store.attach({ platform: p, onReady: () => {} });
  const draw = (alpha = 1): Snap => {
    k.time.alpha = alpha;
    k.runRenderPhase();
    return b.frames[b.frames.length - 1] as Snap;
  };
  const load = async (...paths: string[]) => {
    for (const path of paths) await store.load(path);
  };
  return { ...b, k, plugin, platform, surface, store, draw, load };
}

type H = ReturnType<typeof setup>;
let live: Kernel[] = [];
afterEach(() => {
  for (const k of live) k.dispose();
  live = [];
});
function make(opts?: Opts): H {
  const h = setup(opts);
  live.push(h.k);
  return h;
}

function sprite(h: H, props: Record<string, unknown> = {}, x = 0, y = 0): Entity {
  const e = h.k.world.spawn();
  h.k.world.add(e, Position, { x, y });
  h.k.world.add(e, Sprite, { image: "hero.png", ...props });
  return e;
}

function quad(s: Snap, i = 0): number[] {
  return s.v.slice(i * 16, i * 16 + 16);
}
function pts(s: Snap, i = 0): number[] {
  const q = quad(s, i);
  return [0, 4, 8, 12].flatMap((o) => [q[o] as number, q[o + 1] as number]);
}
function uvs(s: Snap, i = 0): number[] {
  const q = quad(s, i);
  return [0, 4, 8, 12].flatMap((o) => [q[o + 2] as number, q[o + 3] as number]);
}
function close(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  for (const [i, v] of expected.entries()) expect(actual[i]).toBeCloseTo(v, 4);
}
function map(view: number[], x: number, y: number): [number, number] {
  const [a, b, c, d, tx, ty] = view as [number, number, number, number, number, number];
  return [a * x + c * y + tx, b * x + d * y + ty];
}
function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof UsneaError ? e.code : "other";
  }
  return "none";
}

describe("components", () => {
  it("have the documented defaults", () => {
    const h = make();
    const e = h.k.world.spawn();
    for (const c of h.plugin.components ?? []) h.k.world.add(e, c as typeof Position);
    expect([Position.x[e], Position.y[e], Rotation.angle[e], Scale.x[e], Scale.y[e]]).toEqual([
      0, 0, 0, 1, 1,
    ]);
    expect([
      Sprite.image[e],
      Sprite.width[e],
      Sprite.height[e],
      Sprite.anchorX[e],
      Sprite.anchorY[e],
    ]).toEqual(["", 0, 0, 0.5, 0.5]);
    expect([
      Sprite.color[e],
      Sprite.flipX[e],
      Sprite.flipY[e],
      Sprite.layer[e],
      Sprite.order[e],
      Sprite.visible[e],
    ]).toEqual([0xffffffff, 0, 0, 0, 0, 1]);
    expect([NineSlice.left[e], NineSlice.top[e], NineSlice.right[e], NineSlice.bottom[e]]).toEqual([
      0, 0, 0, 0,
    ]);
    expect([
      Text.text[e],
      Text.font[e],
      Text.size[e],
      Text.color[e],
      Text.align[e],
      Text.wrapWidth[e],
    ]).toEqual(["", "sans-serif", 16, 0xffffffff, "left", 0]);
    expect([
      Text.anchorX[e],
      Text.anchorY[e],
      Text.layer[e],
      Text.order[e],
      Text.visible[e],
    ]).toEqual([0, 0, 0, 0, 1]);
    expect([Camera.zoom[e], Camera.active[e]]).toEqual([1, 1]);
  });
});

describe("sprites", () => {
  it("draws centred and top-left anchored quads", async () => {
    const h = make();
    sprite(h, {}, 100, 50);
    sprite(h, { anchorX: 0, anchorY: 0 }, 100, 50);
    await h.load("hero.png");
    h.draw();
    const s = h.draw();
    expect(s.count).toBe(2);
    close(pts(s, 0), [84, 42, 116, 42, 116, 58, 84, 58]);
    close(pts(s, 1), [100, 50, 132, 50, 132, 66, 100, 66]);
    close(uvs(s, 0), [0, 0, 1, 0, 1, 1, 0, 1]);
    expect(s.colors[0]).toBe(0xffffffff);
    expect(s.textures[0]).toBe(1);
    expect(s.clear).toBe(0x000000ff);
  });

  it("uses explicit size, scale, colour and rotation", async () => {
    const h = make();
    sprite(h, { width: 64, height: 8, anchorX: 0, anchorY: 0, color: 0x11223344 });
    const sc = sprite(h);
    h.k.world.add(sc, Scale, { x: 2, y: 3 });
    const r = sprite(h);
    h.k.world.add(r, Rotation, { angle: Math.PI / 2 });
    await h.load("hero.png");
    h.draw();
    const s = h.draw();
    close(pts(s, 0), [0, 0, 64, 0, 64, 8, 0, 8]);
    expect(s.colors[0]).toBe(0x11223344);
    close(pts(s, 1), [-32, -24, 32, -24, 32, 24, -32, 24]);
    // clockwise with y down: top-left (-16,-8) goes to (8,-16)
    close(pts(s, 2), [8, -16, 8, 16, -8, 16, -8, -16]);
  });

  it("swaps UVs when flipped", async () => {
    const h = make();
    sprite(h, { flipX: true });
    sprite(h, { flipY: true });
    await h.load("hero.png");
    h.draw();
    const s = h.draw();
    close(uvs(s, 0), [1, 0, 0, 0, 0, 1, 1, 1]);
    close(uvs(s, 1), [0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it("uses atlas frames and throws USN-E040 for unknown ones", async () => {
    const h = make();
    sprite(h, { image: "tiles.atlas.json#a", anchorX: 0, anchorY: 0 });
    await h.load("tiles.atlas.json");
    h.draw();
    const s = h.draw();
    close(uvs(s), [0.25, 0.5, 0.5, 0.5, 0.5, 0.625, 0.25, 0.625]);
    close(pts(s), [0, 0, 16, 0, 16, 8, 0, 8]);
    sprite(h, { image: "tiles.atlas.json#nope" });
    expect(codeOf(() => h.draw())).toBe("USN-E040");
  });

  it("skips unloaded images until they arrive, and invisible sprites", async () => {
    const h = make();
    sprite(h);
    sprite(h, { visible: false });
    expect(h.draw().count).toBe(0);
    await h.load("hero.png");
    expect(h.draw().count).toBe(1);
  });

  it("sorts by layer, order, slot with interleaved textures", async () => {
    const h = make();
    const e1 = sprite(h, { layer: 1 }, 1);
    const e2 = sprite(h, { image: "tiles.png", order: 2 }, 2);
    const e3 = sprite(h, { order: 1 }, 3);
    const e4 = sprite(h, { image: "tiles.png", order: 1 }, 4);
    await h.load("hero.png", "tiles.png");
    h.draw();
    const s = h.draw();
    const centres = [0, 1, 2, 3].map(
      (i) => (pts(s, i)[0] as number) + (s.textures[i] === 2 ? 32 : 16),
    );
    expect(centres).toEqual([3, 4, 2, 1]);
    expect(s.textures).toEqual([1, 2, 2, 1]);
    expect([e1, e2, e3, e4]).toEqual([1, 2, 3, 4]);
  });
});

describe("nine-slice", () => {
  it("emits nine quads with fixed corners and a stretched centre", async () => {
    const h = make();
    const e = sprite(h, { image: "ui.png", width: 100, height: 60, anchorX: 0, anchorY: 0 });
    h.k.world.add(e, NineSlice, { left: 8, top: 8, right: 8, bottom: 8 });
    await h.load("ui.png");
    h.draw();
    const s = h.draw();
    expect(s.count).toBe(9);
    close(pts(s, 0), [0, 0, 8, 0, 8, 8, 0, 8]);
    close(pts(s, 4), [8, 8, 92, 8, 92, 52, 8, 52]);
    close(pts(s, 8), [92, 52, 100, 52, 100, 60, 92, 60]);
    close(uvs(s, 4).slice(0, 2), [8 / 48, 8 / 48]);
    close(uvs(s, 4).slice(4, 6), [40 / 48, 40 / 48]);
  });

  it("skips zero-area slices", async () => {
    const h = make();
    const e = sprite(h, { image: "ui.png", width: 100, height: 60, anchorX: 0, anchorY: 0 });
    h.k.world.add(e, NineSlice, { left: 8, right: 8 });
    await h.load("ui.png");
    h.draw();
    expect(h.draw().count).toBe(3);
    h.k.world.add(e, NineSlice);
    expect(h.draw().count).toBe(1);
  });
});

describe("bitmap text", () => {
  async function text(h: H, props: Record<string, unknown>, x = 10, y = 20) {
    const e = h.k.world.spawn();
    h.k.world.add(e, Position, { x, y });
    h.k.world.add(e, Text, { font: "f.font.json", ...props });
    await h.load("f.font.json");
    h.draw();
    return e;
  }

  it("places glyphs, scaling by size / font size", async () => {
    const h = make();
    await text(h, { text: "AB", color: 0xff0000ff });
    const s = h.draw();
    expect(s.count).toBe(2);
    close(pts(s, 0), [11, 22, 19, 22, 19, 32, 11, 32]);
    close(pts(s, 1), [20, 22, 26, 22, 26, 32, 20, 32]);
    close(uvs(s, 0), [0, 0, 8 / 64, 0, 8 / 64, 10 / 32, 0, 10 / 32]);
    expect(s.colors[0]).toBe(0xff0000ff);
    Text.size[1] = 32;
    close(pts(h.draw(), 0), [12, 24, 28, 24, 28, 44, 12, 44]);
  });

  it("handles newlines, wrapping, alignment and anchors", async () => {
    const h = make();
    const e = await text(h, { text: "A\nB" });
    close(pts(h.draw(), 1).slice(0, 2), [10, 42]);
    h.k.world.add(e, Text, { font: "f.font.json", text: "A B A", wrapWidth: 25 });
    let s = h.draw();
    expect(s.count).toBe(3);
    close(pts(s, 2).slice(0, 2), [11, 42]);
    h.k.world.add(e, Text, { font: "f.font.json", text: "AB\nA", align: "center" });
    close(pts(h.draw(), 2).slice(0, 2), [15, 42]);
    h.k.world.add(e, Text, { font: "f.font.json", text: "AB\nA", align: "right" });
    close(pts(h.draw(), 2).slice(0, 2), [19, 42]);
    h.k.world.add(e, Text, { font: "f.font.json", text: "AB\nA", align: "right", wrapWidth: 40 });
    close(pts(h.draw(), 2).slice(0, 2), [41, 42]);
    h.k.world.add(e, Text, { font: "f.font.json", text: "AB", anchorX: 1, anchorY: 1 });
    s = h.draw();
    close(pts(s, 0).slice(0, 2), [-7, 2]);
    h.k.world.add(e, Text, { font: "f.font.json", text: "A?B" });
    expect(h.draw().count).toBe(2);
    h.k.world.add(e, Text, { font: "f.font.json", text: "" });
    expect(h.draw().count).toBe(0);
  });
});

describe("platform text", () => {
  function ptext(h: H, text: string) {
    const e = h.k.world.spawn();
    h.k.world.add(e, Position, { x: 5, y: 6 });
    h.k.world.add(e, Text, { text });
    return e;
  }

  it("caches one texture, rebuilds on change and destroys on despawn", () => {
    const h = make();
    const e = ptext(h, "hi");
    h.draw();
    h.draw();
    const s = h.draw();
    expect(h.created).toHaveLength(1);
    close(pts(s), [5, 6, 21, 6, 21, 22, 5, 22]);
    expect(s.textures[0]).toBe(1);
    Text.text[e] = "hello";
    h.draw();
    expect(h.created).toHaveLength(2);
    expect(h.destroyed.map((t) => t.id)).toEqual([1]);
    h.k.world.despawn(e);
    expect(h.draw().count).toBe(0);
    expect(h.destroyed.map((t) => t.id)).toEqual([1, 2]);
  });

  it("throws USN-E041 without rasterizeText", () => {
    const h = make({ raster: false });
    ptext(h, "hi");
    expect(codeOf(() => h.draw())).toBe("USN-E041");
  });
});

describe("view", () => {
  it("fits the design resolution without a camera", () => {
    const h = make();
    const v = h.draw().view;
    close(map(v, 0, 0), [-1, 1]);
    close(map(v, 800, 600), [1, -1]);
  });

  it("centres the design rectangle on a wider surface", () => {
    const h = make({ surface: { width: 1600, height: 600 } });
    const v = h.draw().view;
    close(map(v, 0, 0), [-0.5, 1]);
    close(map(v, 800, 600), [0.5, -1]);
  });

  it("follows camera position, zoom and rotation", () => {
    const h = make();
    const c = h.k.world.spawn();
    h.k.world.add(c, Position, { x: 100, y: 50 });
    h.k.world.add(c, Camera);
    close(map(h.draw().view, 100, 50), [0, 0]);
    close(map(h.draw().view, 110, 50), [20 / 800, 0]);
    h.k.world.add(c, Camera, { zoom: 2 });
    close(map(h.draw().view, 110, 50), [40 / 800, 0]);
    h.k.world.add(c, Camera);
    h.k.world.add(c, Rotation, { angle: Math.PI / 2 });
    close(map(h.draw().view, 110, 50), [0, 20 / 600]);
  });

  it("uses the lowest-slot active camera", () => {
    const h = make();
    const a = h.k.world.spawn();
    const b = h.k.world.spawn();
    h.k.world.add(a, Position, { x: 400 });
    h.k.world.add(a, Camera, { active: false });
    h.k.world.add(b, Position, { x: 100, y: 50 });
    h.k.world.add(b, Camera);
    close(map(h.draw().view, 100, 50), [0, 0]);
  });
});

describe("interpolation", () => {
  it("blends between the previous and current step", async () => {
    const h = make();
    const e = sprite(h, { anchorX: 0, anchorY: 0 });
    await h.load("hero.png");
    h.k.runLogicStep();
    Position.x[e] = 10;
    expect(pts(h.draw(0.5))[0]).toBeCloseTo(5);
    expect(pts(h.draw(1))[0]).toBeCloseTo(10);
  });

  it("does not interpolate a sprite spawned after the snapshot", async () => {
    const h = make();
    sprite(h);
    await h.load("hero.png");
    h.k.runLogicStep();
    sprite(h, { anchorX: 0, anchorY: 0 }, 10);
    expect(pts(h.draw(0.5), 1)[0]).toBeCloseTo(10);
  });

  it("snapshot returns false and does not keep the step awake", () => {
    const h = make();
    sprite(h);
    expect(h.k.runLogicStep().awake).toBe(false);
    const sys = h.plugin.systems?.find((s) => s.name === "usnea2d.snapshot");
    expect(sys?.phase).toBe("input");
    expect(sys?.run(h.k.world, 0, h.k.world.query([Position]))).toBe(false);
  });
});

describe("frame plumbing", () => {
  it("reuses the draw-list arrays once warmed up", async () => {
    const h = make();
    for (let i = 0; i < 300; i++) sprite(h, {}, i);
    await h.load("hero.png");
    h.draw();
    const a = h.draw();
    const b = h.draw();
    expect(a.count).toBe(300);
    expect(b.list).toBe(a.list);
    for (const [i, arr] of a.arrays.entries()) expect(b.arrays[i]).toBe(arr);
  });

  it("resizes the backend only when the surface changes", () => {
    const h = make();
    h.draw();
    h.draw();
    expect(h.resizes).toEqual([[800, 600]]);
    h.surface.width = 1000;
    h.draw();
    h.draw();
    expect(h.resizes).toEqual([
      [800, 600],
      [1000, 600],
    ]);
  });

  it("works without a platform using the design resolution and the background", () => {
    const h = make({ platform: false, width: 320, height: 240 });
    const s = h.draw();
    expect(h.resizes).toEqual([[320, 240]]);
    close(map(s.view, 320, 240), [1, -1]);
  });

  it("draws empty-image sprites as rectangles sharing one white texture", () => {
    const h = make({ platform: false });
    expect(h.created).toHaveLength(0);
    for (const x of [0, 100]) {
      const e = h.k.world.spawn();
      h.k.world.add(e, Position, { x });
      h.k.world.add(e, Sprite, { width: 40, height: 20, anchorX: 0, anchorY: 0 });
    }
    const s = h.draw();
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ width: 1, height: 1 });
    expect(h.sources[0]).toEqual(new Uint8Array([255, 255, 255, 255]));
    expect(s.count).toBe(2);
    expect(s.textures).toEqual([h.created[0]?.id, h.created[0]?.id]);
    expect(s.v[4] - (s.v[0] as number)).toBe(40);
    expect(s.v[9] - (s.v[1] as number)).toBe(20);
    h.draw();
    expect(h.created).toHaveLength(1);
  });
});
