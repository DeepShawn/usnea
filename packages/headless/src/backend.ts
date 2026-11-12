// SPDX-License-Identifier: Apache-2.0

import type { PlatformImage } from "usnea";
import type { Frame, RenderBackend, TextureInfo } from "usnea/2d";

/** A copy of the last rendered frame, trimmed to its quad count. */
export interface FrameCopy {
  readonly count: number;
  readonly vertices: Float32Array;
  readonly colors: Uint32Array;
  readonly textures: Uint32Array;
  readonly view: Float32Array;
  readonly clearColor: number;
}

/** A render backend that counts instead of drawing. */
export interface HeadlessBackend extends RenderBackend {
  /** Frames rendered so far. */
  readonly frames: number;
  /** Last size passed to `resize`, if any. */
  readonly size: { readonly width: number; readonly height: number } | undefined;
  /** A copy of the last frame, or undefined before the first render. */
  lastFrame(): FrameCopy | undefined;
}

/** Creates a backend that records frames and draw-call counts without rasterising. */
export function createHeadlessBackend(): HeadlessBackend {
  let nextId = 1;
  let frames = 0;
  let drawCalls = 0;
  let last: FrameCopy | undefined;
  let size: { width: number; height: number } | undefined;
  const textures = new Map<number, TextureInfo>();

  return {
    name: "headless",
    get frames() {
      return frames;
    },
    get drawCalls() {
      return drawCalls;
    },
    get size() {
      return size;
    },
    createTexture(image: PlatformImage): TextureInfo {
      const info = { id: nextId++, width: image.width, height: image.height };
      textures.set(info.id, info);
      return info;
    },
    destroyTexture(texture) {
      textures.delete(texture.id);
    },
    resize(width, height) {
      size = { width, height };
    },
    render(frame: Frame) {
      const { list } = frame;
      const n = list.count;
      let runs = 0;
      let prev = -1;
      for (let i = 0; i < n; i++) {
        const t = list.textures[i] as number;
        if (t !== prev) runs++;
        prev = t;
      }
      frames++;
      drawCalls = runs;
      last = {
        count: n,
        vertices: list.vertices.slice(0, n * 16),
        colors: list.colors.slice(0, n),
        textures: list.textures.slice(0, n),
        view: frame.view.slice(),
        clearColor: frame.clearColor,
      };
    },
    lastFrame: () => last,
    dispose() {
      textures.clear();
      last = undefined;
    },
  };
}
