// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PlatformEvent } from "usnea";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHeadlessPlatform } from "./index.js";

describe("virtual clock", () => {
  it("fires nothing without advance", () => {
    const p = createHeadlessPlatform();
    const log: string[] = [];
    p.setTimer(() => log.push("t"), 0);
    p.requestFrame(() => log.push("f"));
    expect(log).toEqual([]);
    expect(p.now()).toBe(0);
  });

  it("fires timers and frames in time order", () => {
    const p = createHeadlessPlatform();
    const log: string[] = [];
    p.requestFrame((t) => log.push(`f${t.toFixed(4)}`));
    p.setTimer(() => log.push("b"), 0.01);
    p.setTimer(() => log.push("a"), 0.005);
    p.setTimer(() => log.push("c"), 0.02);
    p.advance(0.025);
    expect(log).toEqual(["a", "b", "f0.0167", "c"]);
    expect(p.now()).toBeCloseTo(0.025);
  });

  it("honours nested scheduling within one advance", () => {
    const p = createHeadlessPlatform();
    const log: number[] = [];
    const loop = (t: number): void => {
      log.push(Math.round(t * 60));
      p.requestFrame(loop);
    };
    p.requestFrame(loop);
    p.setTimer(() => p.setTimer(() => log.push(-1), 0.01), 0.01);
    p.advance(4 / 60);
    expect(log).toEqual([1, -1, 2, 3, 4]);
  });

  it("supports cancel", () => {
    const p = createHeadlessPlatform();
    const log: string[] = [];
    const f = p.requestFrame(() => log.push("f"));
    const t = p.setTimer(() => log.push("t"), 0.001);
    p.cancelFrame(f);
    p.clearTimer(t);
    let second = 0;
    p.requestFrame(() => {
      p.cancelFrame(second);
    });
    second = p.requestFrame(() => log.push("never"));
    p.advance(1);
    expect(log).toEqual([]);
  });

  it("honours frameInterval", () => {
    const p = createHeadlessPlatform({ frameInterval: 0.5 });
    const times: number[] = [];
    p.requestFrame((t) => times.push(t));
    p.advance(0.4);
    expect(times).toEqual([]);
    p.advance(0.2);
    expect(times).toEqual([0.5]);
  });
});

describe("events and surface", () => {
  it("emits to listeners and unsubscribes", () => {
    const p = createHeadlessPlatform();
    const got: PlatformEvent[] = [];
    const off = p.onEvent((e) => got.push(e));
    p.emit({ type: "wheel", dx: 1, dy: 2 });
    off();
    p.emit({ type: "wheel", dx: 3, dy: 4 });
    expect(got).toEqual([{ type: "wheel", dx: 1, dy: 2 }]);
  });

  it("resizes and emits", () => {
    const p = createHeadlessPlatform({ pixelRatio: 2 });
    expect(p.surface).toMatchObject({ width: 800, height: 600, pixelRatio: 2, native: undefined });
    const got: PlatformEvent[] = [];
    p.onEvent((e) => got.push(e));
    p.resize(320, 240);
    p.resize(100, 50, 3);
    expect(p.surface).toMatchObject({ width: 100, height: 50, pixelRatio: 3 });
    expect(got).toEqual([
      { type: "resize", width: 320, height: 240, pixelRatio: 2 },
      { type: "resize", width: 100, height: 50, pixelRatio: 3 },
    ]);
  });
});

describe("files and storage", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "usnea-headless-"));
    await mkdir(path.join(dir, "root"));
    await writeFile(path.join(dir, "root", "a.txt"), "hello");
    await writeFile(path.join(dir, "secret.txt"), "no");
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("reads text and bytes", async () => {
    const p = createHeadlessPlatform({ root: path.join(dir, "root") });
    expect(await p.readText("a.txt")).toBe("hello");
    expect(Array.from(await p.readBytes("a.txt"))).toEqual([104, 101, 108, 108, 111]);
  });

  it("rejects traversal and missing files with the path", async () => {
    const p = createHeadlessPlatform({ root: path.join(dir, "root") });
    await expect(p.readText("../secret.txt")).rejects.toThrow(/\.\.\/secret\.txt.*escapes/);
    await expect(p.readBytes("/etc/passwd")).rejects.toThrow(/escapes/);
    await expect(p.readText("missing.txt")).rejects.toThrow(/"missing\.txt"/);
  });

  it("stores in memory and persists to a file", async () => {
    const mem = createHeadlessPlatform().storage;
    await mem.set("k", "v");
    expect(await mem.get("k")).toBe("v");
    await mem.remove("k");
    expect(await mem.get("k")).toBeUndefined();

    const storageFile = path.join(dir, "store.json");
    const a = createHeadlessPlatform({ storageFile }).storage;
    await a.set("x", "1");
    await a.set("y", "2");
    await a.remove("y");
    expect(JSON.parse(await readFile(storageFile, "utf8"))).toEqual({ x: "1" });
    const b = createHeadlessPlatform({ storageFile }).storage;
    expect(await b.get("x")).toBe("1");
  });
});

describe("rasterizeText", () => {
  const p = createHeadlessPlatform();
  const style = { font: "x", size: 10, wrapWidth: 0, align: "left" } as const;

  it("estimates size", () => {
    expect(p.rasterizeText?.("abcd", style)).toEqual({ width: 24, height: 13, source: undefined });
    expect(p.rasterizeText?.("ab\nabcdef", style)).toMatchObject({ width: 36, height: 25 });
    expect(p.rasterizeText?.("", style)).toMatchObject({ width: 1, height: 13 });
    expect(p.rasterizeText?.("", { ...style, size: 0 })).toMatchObject({ width: 1, height: 1 });
  });

  it("wraps at wrapWidth", () => {
    // 12px wrap fits 2 chars of 6px: "abcde" -> 3 lines, width 12.
    expect(p.rasterizeText?.("abcde", { ...style, wrapWidth: 12 })).toMatchObject({
      width: 12,
      height: 38,
    });
  });
});
