// SPDX-License-Identifier: Apache-2.0

import type { DrawList, Frame } from "usnea/2d";
import { describe, expect, it } from "vitest";
import { createHeadlessBackend } from "./index.js";

function frame(textures: number[], capacity = textures.length + 2): Frame {
  const list: DrawList = {
    count: textures.length,
    vertices: new Float32Array(capacity * 16).fill(7),
    colors: new Uint32Array(capacity).fill(0xffffffff),
    textures: new Uint32Array(capacity),
  };
  textures.forEach((t, i) => {
    list.textures[i] = t;
  });
  return { list, view: new Float32Array([1, 0, 0, 1, 0, 0]), clearColor: 0x112233ff };
}

describe("headless backend", () => {
  it("hands out increasing texture ids", () => {
    const b = createHeadlessBackend();
    const t1 = b.createTexture({ width: 4, height: 5, source: undefined });
    const t2 = b.createTexture({ width: 1, height: 1, source: undefined });
    expect(t1).toEqual({ id: 1, width: 4, height: 5 });
    expect(t2.id).toBe(2);
    expect(b.name).toBe("headless");
    expect(b.readPixels).toBeUndefined();
  });

  it("counts frames and texture runs", () => {
    const b = createHeadlessBackend();
    expect(b.lastFrame()).toBeUndefined();
    b.render(frame([1, 1, 2, 2, 1]));
    expect(b.drawCalls).toBe(3);
    b.render(frame([]));
    expect(b.drawCalls).toBe(0);
    expect(b.frames).toBe(2);
  });

  it("counts only the first count quads and keeps a trimmed copy", () => {
    const b = createHeadlessBackend();
    const f = frame([1, 2]);
    f.list.textures[2] = 9; // beyond count: ignored
    b.render(f);
    expect(b.drawCalls).toBe(2);
    const last = b.lastFrame();
    expect(last?.count).toBe(2);
    expect(last?.vertices.length).toBe(32);
    expect(last?.colors.length).toBe(2);
    expect(Array.from(last?.textures ?? [])).toEqual([1, 2]);
    expect(last?.clearColor).toBe(0x112233ff);
    // mutate the source: the copy must not change
    f.list.vertices[0] = 99;
    f.list.textures[0] = 5;
    f.view[0] = 3;
    expect(last?.vertices[0]).toBe(7);
    expect(last?.textures[0]).toBe(1);
    expect(last?.view[0]).toBe(1);
  });

  it("records resize", () => {
    const b = createHeadlessBackend();
    b.resize(10, 20);
    expect(b.size).toEqual({ width: 10, height: 20 });
  });
});
