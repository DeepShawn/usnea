// SPDX-License-Identifier: Apache-2.0

import type { PlatformImage } from "usnea";
import type { Frame, Pixels, RenderBackend, TextureInfo } from "usnea/2d";
import { QuadBatch } from "./batch.js";
import { TextureStore } from "./texture.js";

/** Options for `createWebGL2Backend`. */
export interface WebGL2BackendOptions {
  /** Keep the drawing buffer between frames. Default false. */
  readonly preserveDrawingBuffer?: boolean;
  /** Sample textures with NEAREST instead of LINEAR. Default false. */
  readonly pixelArt?: boolean;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Creates a WebGL2 `RenderBackend` on a canvas. After a context loss and restore the
 * program and buffers are rebuilt, but all textures are gone: the caller must recreate them.
 */
export function createWebGL2Backend(
  canvas: AnyCanvas,
  options: WebGL2BackendOptions = {},
): RenderBackend {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  }) as WebGL2RenderingContext | null;
  if (!gl) {
    throw new Error(
      "render-webgl2: WebGL2 is not available on this canvas. Use a browser with WebGL2 enabled or another backend.",
    );
  }
  const textures = new TextureStore(gl, options.pixelArt ?? false);
  const batch = new QuadBatch(gl, textures);
  let drawCalls = 0;
  let lost = false;
  let disposed = false;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);
  gl.viewport(0, 0, canvas.width, canvas.height);

  const onLost = (e: Event): void => {
    e.preventDefault();
    lost = true;
    textures.clear(false);
  };
  const onRestored = (): void => {
    batch.init();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    lost = false;
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    name: "webgl2",
    get drawCalls(): number {
      return drawCalls;
    },
    createTexture(image: PlatformImage): TextureInfo {
      return textures.create(image);
    },
    destroyTexture(texture: TextureInfo): void {
      textures.destroy(texture.id);
    },
    resize(width: number, height: number): void {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    },
    render(frame: Frame): void {
      drawCalls = 0;
      if (lost || disposed) return;
      const c = frame.clearColor >>> 0;
      gl.clearColor(
        ((c >>> 24) & 255) / 255,
        ((c >>> 16) & 255) / 255,
        ((c >>> 8) & 255) / 255,
        (c & 255) / 255,
      );
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawCalls = batch.draw(frame.list, frame.view);
    },
    readPixels(): Pixels {
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const raw = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const data = new Uint8Array(raw.length);
      const row = width * 4;
      for (let y = 0; y < height; y++) {
        data.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
      }
      return { width, height, data };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      textures.clear(!lost);
      batch.dispose(!lost);
    },
  };
}
