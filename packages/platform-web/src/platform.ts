// SPDX-License-Identifier: Apache-2.0
import type { Platform, PlatformEvent, PlatformImage } from "usnea";
import { attachInputListeners } from "./events.js";
import { createStorage } from "./storage.js";
import { createSurface } from "./surface.js";
import { rasterizeText } from "./text.js";

/** Options for `createWebPlatform`. */
export interface WebPlatformOptions {
  /** Existing canvas to draw into; one is created when omitted. */
  canvas?: HTMLCanvasElement;
  /** Parent for a created canvas; defaults to `document.body`. */
  parent?: HTMLElement;
  /** Base URL for project files; defaults to the document base URL. */
  root?: string;
}

/** A `Platform` backed by the browser, with explicit teardown. */
export interface WebPlatform extends Platform {
  /** Removes every DOM listener and observer created by this platform. */
  dispose(): void;
}

function ensureCanvas(options: WebPlatformOptions): HTMLCanvasElement {
  if (options.canvas) {
    options.canvas.style.touchAction = "none";
    return options.canvas;
  }
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  (options.parent ?? document.body).appendChild(canvas);
  return canvas;
}

/** Creates a browser-backed platform. */
export function createWebPlatform(options: WebPlatformOptions = {}): WebPlatform {
  const canvas = ensureCanvas(options);
  const base = options.root ?? document.baseURI;
  const listeners = new Set<(event: PlatformEvent) => void>();
  const emit = (event: PlatformEvent): void => {
    for (const l of [...listeners]) l(event);
  };
  let detachInput: (() => void) | undefined;

  const { surface, dispose: disposeSurface } = createSurface(canvas, (width, height, pixelRatio) =>
    emit({ type: "resize", width, height, pixelRatio }),
  );

  const fetchOk = async (path: string): Promise<Response> => {
    const url = new URL(path, base).href;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (cause) {
      throw new Error(`Failed to fetch "${path}" (${url}): ${String(cause)}`);
    }
    if (!res.ok) throw new Error(`Failed to load "${path}" (${url}): HTTP ${res.status}`);
    return res;
  };

  return {
    name: "web",
    now: () => performance.now() / 1000,
    requestFrame: (cb) => requestAnimationFrame((ms) => cb(ms / 1000)),
    cancelFrame: (id) => cancelAnimationFrame(id),
    setTimer: (cb, seconds) => window.setTimeout(cb, seconds * 1000),
    clearTimer: (id) => window.clearTimeout(id),
    onEvent(listener) {
      listeners.add(listener);
      detachInput ??= attachInputListeners(canvas, emit);
      return () => {
        listeners.delete(listener);
      };
    },
    surface,
    async readText(path) {
      return (await fetchOk(path)).text();
    },
    async readBytes(path) {
      return new Uint8Array(await (await fetchOk(path)).arrayBuffer());
    },
    async loadImage(path): Promise<PlatformImage> {
      const blob = await (await fetchOk(path)).blob();
      const bitmap = await createImageBitmap(blob);
      return { width: bitmap.width, height: bitmap.height, source: bitmap };
    },
    rasterizeText,
    storage: createStorage(),
    dispose() {
      detachInput?.();
      detachInput = undefined;
      listeners.clear();
      disposeSurface();
    },
  };
}
