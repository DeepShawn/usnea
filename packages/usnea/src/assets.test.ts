// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { createAssetStore } from "./assets.js";
import { UsneaError } from "./errors.js";
import type { AssetLoader, Platform } from "./types.js";

function fakePlatform(files: Record<string, string>): Platform {
  return {
    readText: async (p: string) => {
      const t = files[p];
      if (t === undefined) throw new Error(`no file ${p}`);
      return t;
    },
  } as unknown as Platform;
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof UsneaError ? `${e.code}|${e.message}` : "other";
  }
  return "none";
}

function store(files: Record<string, string> = {}) {
  const s = createAssetStore();
  const onReady = vi.fn();
  s.attach({ platform: fakePlatform(files), onReady });
  return { s, onReady };
}

describe("asset store", () => {
  it("loads json and txt", async () => {
    const { s } = store({ "a.json": '{"x":1}', "b.TXT": "hi" });
    expect(await s.load("a.json")).toEqual({ x: 1 });
    expect(await s.load("b.TXT")).toBe("hi");
    expect(s.get("a.json")).toEqual({ x: 1 });
  });

  it("chooses the longest suffix, case-insensitively, and later registration replaces", async () => {
    const { s } = store({ "x.atlas.json": "{}", "y.json": "{}" });
    const atlas: AssetLoader<string> = {
      extensions: [".ATLAS.json"],
      load: async () => "atlas",
    };
    s.register(atlas);
    expect(await s.load("x.atlas.json")).toBe("atlas");
    expect(await s.load("y.json")).toEqual({});
    s.register({ extensions: [".atlas.json"], load: async () => "second" });
    s.dispose();
    expect(await s.load("x.atlas.json")).toBe("second");
  });

  it("deduplicates concurrent loads", async () => {
    const { s } = store();
    const load = vi.fn(async () => "v");
    s.register({ extensions: [".png"], load });
    const [a, b] = await Promise.all([s.load("a.png"), s.load("a.png")]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(load).toHaveBeenCalledTimes(1);
    await s.load("a.png");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("get starts a load lazily and calls onReady once", async () => {
    const { s, onReady } = store({ "a.json": "[1]" });
    expect(s.get("a.json")).toBeUndefined();
    expect(s.get("a.json")).toBeUndefined();
    await s.load("a.json");
    await Promise.resolve();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(s.get("a.json")).toEqual([1]);
  });

  it("remembers a failed get-load and throws once", async () => {
    const { s, onReady } = store({ "bad.json": "{oops" });
    expect(s.get("bad.json")).toBeUndefined();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(onReady).toHaveBeenCalledTimes(1);
    let err: unknown;
    try {
      s.get("bad.json");
    } catch (e) {
      err = e;
    }
    expect((err as UsneaError).code).toBe("USN-E020");
    expect((err as UsneaError).message).toContain("bad.json");
    expect(s.get("bad.json")).toBeUndefined();
    expect(onReady).toHaveBeenCalledTimes(1);
    s.collect();
    expect(s.get("bad.json")).toBeUndefined();
  });

  it("retain, release and collect call unload", async () => {
    const { s } = store();
    const unload = vi.fn();
    s.register({ extensions: [".bin"], load: async (p) => `asset:${p}`, unload });
    await s.load("a.bin");
    await s.load("b.bin");
    s.retain("a.bin");
    s.retain("a.bin");
    s.release("a.bin");
    expect(s.refs("a.bin")).toBe(1);
    s.release("b.bin");
    expect(s.refs("b.bin")).toBe(0);
    s.collect();
    expect(unload).toHaveBeenCalledTimes(1);
    expect(unload).toHaveBeenCalledWith("asset:b.bin");
    s.release("a.bin");
    s.release("a.bin");
    expect(s.refs("a.bin")).toBe(0);
    s.collect();
    expect(unload).toHaveBeenCalledTimes(2);
    s.dispose();
  });

  it("reports E019, E020 and missing platform", async () => {
    const { s } = store({ "a.json": "{bad", "ok.png": "" });
    expect(await codeOf(s.load("a.weird"))).toMatch(/^USN-E019/);
    const bad = await codeOf(s.load("a.json"));
    expect(bad).toMatch(/^USN-E020/);
    expect(bad).toContain("a.json");
    s.register({
      extensions: [".png"],
      load: async () => {
        throw new Error("decode failed");
      },
    });
    const failed = await codeOf(s.load("ok.png"));
    expect(failed).toMatch(/^USN-E020/);
    expect(failed).toContain("decode failed");
    expect(failed).toContain("ok.png");
    const bare = createAssetStore();
    expect(await codeOf(bare.load("a.json"))).toMatch(/^USN-E020/);
  });
});
