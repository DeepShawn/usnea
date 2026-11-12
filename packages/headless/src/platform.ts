// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Platform, PlatformEvent, PlatformImage, TextStyle } from "usnea";
import { createVirtualClock } from "./clock.js";
import { readImageSize } from "./image-size.js";
import { createStorage } from "./storage.js";

/** Options for `createHeadlessPlatform`. */
export interface HeadlessPlatformOptions {
  /** Project root directory; defaults to `process.cwd()`. */
  readonly root?: string;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  /** Seconds between frame ticks; defaults to 1/60. */
  readonly frameInterval?: number;
  /** JSON file used to persist storage; in-memory only when absent. */
  readonly storageFile?: string;
}

/** A Node platform driven by a virtual clock. */
export interface HeadlessPlatform extends Platform {
  /** Moves virtual time forward, firing timers and frames in time order. */
  advance(seconds: number): void;
  /** Delivers an event to all listeners. */
  emit(event: PlatformEvent): void;
  /** Changes the surface size and emits a `resize` event. */
  resize(width: number, height: number, pixelRatio?: number): void;
}

/** Creates a deterministic platform for tests, CI and tools. */
export function createHeadlessPlatform(options: HeadlessPlatformOptions = {}): HeadlessPlatform {
  const root = path.resolve(options.root ?? process.cwd());
  const clock = createVirtualClock(options.frameInterval ?? 1 / 60);
  const listeners = new Set<(event: PlatformEvent) => void>();
  const size = {
    width: options.width ?? 800,
    height: options.height ?? 600,
    pixelRatio: options.pixelRatio ?? 1,
  };

  const resolve = (p: string): string => {
    const full = path.resolve(root, p);
    const rel = path.relative(root, full);
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new Error(`Path "${p}" escapes the project root "${root}"`);
    }
    return full;
  };
  const read = async (p: string): Promise<Uint8Array> => {
    const full = resolve(p);
    try {
      return await readFile(full);
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Cannot read file "${p}" (${full}): ${why}`);
    }
  };
  const emit = (event: PlatformEvent): void => {
    for (const l of [...listeners]) l(event);
  };

  return {
    name: "headless",
    now: clock.now,
    advance: clock.advance,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit,
    surface: {
      get width() {
        return size.width;
      },
      get height() {
        return size.height;
      },
      get pixelRatio() {
        return size.pixelRatio;
      },
      native: undefined,
    },
    resize(width, height, pixelRatio) {
      size.width = width;
      size.height = height;
      if (pixelRatio !== undefined) size.pixelRatio = pixelRatio;
      emit({ type: "resize", width, height, pixelRatio: size.pixelRatio });
    },
    readText: async (p) => new TextDecoder().decode(await read(p)),
    readBytes: read,
    async loadImage(p): Promise<PlatformImage> {
      const { width, height } = readImageSize(await read(p), p);
      return { width, height, source: undefined };
    },
    rasterizeText(text: string, style: TextStyle): PlatformImage {
      const charWidth = 0.6 * style.size;
      const maxChars =
        style.wrapWidth > 0 ? Math.max(1, Math.floor(style.wrapWidth / charWidth)) : 0;
      let lines = 0;
      let longest = 0;
      for (const line of text.split("\n")) {
        const len = [...line].length;
        const rows = maxChars > 0 ? Math.max(1, Math.ceil(len / maxChars)) : 1;
        lines += rows;
        longest = Math.max(longest, maxChars > 0 ? Math.min(len, maxChars) : len);
      }
      return {
        width: Math.max(1, Math.ceil(longest * charWidth)),
        height: Math.max(1, Math.ceil(lines * 1.25 * style.size)),
        source: undefined,
      };
    },
    storage: createStorage(options.storageFile),
  };
}
