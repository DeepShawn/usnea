// SPDX-License-Identifier: Apache-2.0
import { Assets } from "../assets.js";
import { definePlugin } from "../plugin.js";
import { Time } from "../resources.js";
import { defineSystem } from "../system.js";
import type { App, Platform, Plugin, World } from "../types.js";
import { registerLoaders } from "./assets.js";
import { buildDrawList, findCamera } from "./builder.js";
import { Camera, NineSlice, Position, Rotation, Scale, Sprite, Text } from "./components.js";
import { createContext } from "./context.js";
import { createDrawList } from "./drawlist.js";
import { PrevState } from "./interp.js";
import { TextCache } from "./textcache.js";
import type { Frame, Render2DOptions } from "./types.js";
import { computeView, createViewCamera } from "./view.js";

const ALL = [Position, Rotation, Scale, Sprite, NineSlice, Text, Camera];

/** Creates the 2D plugin: components, loaders, snapshot and render systems. */
export function render2d(options: Render2DOptions): Plugin {
  const backend = options.backend;
  const designW = options.width ?? 800;
  const designH = options.height ?? 600;
  const clearColor = options.background ?? 0x000000ff;
  const prev = new PrevState();
  const list = createDrawList();
  const frame = { list, view: new Float32Array(6), clearColor };
  const cam = createViewCamera();
  const texts = new TextCache(backend);
  let platform: Platform | undefined;
  let lastW = -1;
  let lastH = -1;
  let ctx: ReturnType<typeof createContext> | undefined;

  const snapshot = defineSystem({
    name: "usnea2d.snapshot",
    phase: "input",
    query: [Position],
    run(world, _dt, entities) {
      prev.capture(world, entities as unknown as ArrayLike<number>);
      return false;
    },
  });

  function context(world: World): ReturnType<typeof createContext> {
    if (ctx === undefined || ctx.world !== world) {
      ctx = createContext(backend, list, world, world.res(Assets));
      ctx.texts = texts;
    }
    ctx.platform = platform;
    return ctx;
  }

  const render = defineSystem({
    name: "usnea2d.render",
    phase: "render",
    reads: ALL,
    run(world) {
      const c = context(world);
      const w = platform?.surface.width ?? designW;
      const h = platform?.surface.height ?? designH;
      if (w !== lastW || h !== lastH) {
        lastW = w;
        lastH = h;
        backend.resize(w, h);
      }
      const alpha = world.res(Time).alpha;
      findCamera(c, prev, alpha, cam);
      computeView(frame.view, designW, designH, w, h, cam);
      buildDrawList(c, prev, alpha);
      backend.render(frame as Frame);
    },
  });

  return definePlugin({
    name: "usnea/2d",
    components: ALL,
    systems: [snapshot, render],
    resources: [Assets],
    setup(app: App) {
      platform = app.platform;
      registerLoaders(app.world.res(Assets), backend);
    },
  });
}
