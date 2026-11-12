// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { defineSystem } from "../system.js";
import type { App, Platform } from "../types.js";
import { Camera, Position, Rotation, render2d, screenToWorld, View } from "./index.js";
import type { Frame, RenderBackend } from "./types.js";

function backend(frames: Frame[]): RenderBackend {
  return {
    name: "fake",
    drawCalls: 0,
    createTexture: (i) => ({ id: 1, width: i.width, height: i.height }),
    destroyTexture() {},
    resize() {},
    render: (f) => void frames.push({ ...f, view: Float32Array.from(f.view) }),
    dispose() {},
  };
}

let live: App[] = [];
afterEach(() => {
  for (const a of live) a.dispose();
  live = [];
});

function make(surface?: { width: number; height: number }) {
  const frames: Frame[] = [];
  const platform = surface
    ? ({ surface: { ...surface, pixelRatio: 1, native: null } } as unknown as Platform)
    : undefined;
  const app = createApp({
    plugins: [render2d({ backend: backend(frames), width: 800, height: 600 })],
    ...(platform ? { platform } : {}),
  });
  live.push(app);
  return { app, frames, platform };
}

describe("screenToWorld", () => {
  it("is the identity on a surface equal to the design size", () => {
    const { app } = make({ width: 800, height: 600 });
    const p = screenToWorld(app.world, 123, 45);
    expect(p.x).toBeCloseTo(123, 4);
    expect(p.y).toBeCloseTo(45, 4);
  });

  it("scales a surface twice as large", () => {
    const { app } = make({ width: 1600, height: 1200 });
    const out = { x: 0, y: 0 };
    expect(screenToWorld(app.world, 246, 90, out)).toBe(out);
    expect(out.x).toBeCloseTo(123, 4);
    expect(out.y).toBeCloseTo(45, 4);
  });

  it("removes the letterbox offset on a wider surface", () => {
    const { app } = make({ width: 1000, height: 600 });
    const p = screenToWorld(app.world, 300, 60);
    expect(p.x).toBeCloseTo(200, 4);
    expect(p.y).toBeCloseTo(60, 4);
  });

  it("exposes the design size before the first draw", () => {
    const { app } = make({ width: 1000, height: 600 });
    let seen: number[] = [];
    const sys = defineSystem({
      name: "probe",
      run(world) {
        const v = world.res(View);
        seen = [v.width, v.height, v.surfaceWidth, v.surfaceHeight];
      },
    });
    app.dispose();
    live = [];
    const frames: Frame[] = [];
    const a = createApp({
      plugins: [render2d({ backend: backend(frames), width: 800, height: 600 })],
      systems: [sys],
    });
    live.push(a);
    a.step(1);
    expect(seen).toEqual([800, 600, 800, 600]);
  });

  it("inverts a camera with position, zoom and rotation", () => {
    const { app, frames } = make({ width: 1200, height: 700 });
    const cam = app.world.spawn();
    app.world.add(cam, Position, { x: 300, y: -120 });
    app.world.add(cam, Rotation, { angle: 0.6 });
    app.world.add(cam, Camera, { zoom: 1.7, active: true });
    app.step(1);
    const frame = frames[frames.length - 1] as Frame;
    const [a, b, c, d, tx, ty] = frame.view as unknown as number[] as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (const [wx, wy] of [
      [0, 0],
      [310, 77],
      [-50, 400],
    ] as const) {
      const cx = a * wx + c * wy + tx;
      const cy = b * wx + d * wy + ty;
      const px = ((cx + 1) / 2) * 1200;
      const py = ((1 - cy) / 2) * 700;
      const p = screenToWorld(app.world, px, py);
      expect(p.x).toBeCloseTo(wx, 3);
      expect(p.y).toBeCloseTo(wy, 3);
    }
  });
});
