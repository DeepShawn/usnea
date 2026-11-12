// SPDX-License-Identifier: Apache-2.0
import type { AssetStore, Platform, World } from "../types.js";
import { createXform, type Xform } from "./drawlist.js";
import { createTextLayout, type TextLayout } from "./text.js";
import type { TextCache } from "./textcache.js";
import type { DrawList, RenderBackend } from "./types.js";

/** A source rectangle within a texture, in pixels. */
export interface SourceRect {
  tex: number;
  texW: number;
  texH: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per-frame state shared by the sprite and text emitters (reused between frames). */
export interface DrawContext {
  world: World;
  assets: AssetStore;
  backend: RenderBackend;
  platform: Platform | undefined;
  list: DrawList;
  xf: Xform;
  src: SourceRect;
  layout: TextLayout;
  texts: TextCache | undefined;
}

/** Creates a draw context; `world`, `assets`, `backend` and `list` are filled by the caller. */
export function createContext(
  backend: RenderBackend,
  list: DrawList,
  world: World,
  assets: AssetStore,
): DrawContext {
  return {
    world,
    assets,
    backend,
    platform: undefined,
    list,
    xf: createXform(),
    src: { tex: 0, texW: 1, texH: 1, x: 0, y: 0, w: 0, h: 0 },
    layout: createTextLayout(),
    texts: undefined,
  };
}
