// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import type { Platform, PlatformEvent } from "usnea";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makePng } from "./png.js";

declare global {
  interface Window {
    platform: Platform;
    events: PlatformEvent[];
  }
}

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".txt": "text/plain",
  ".png": "image/png",
};

let outDir: string;
let server: Server;
let browser: Browser;
let page: Page;
let url: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "usnea-platform-web-"));
  await build({
    root: fileURLToPath(new URL("./fixtures", import.meta.url)),
    base: "./",
    logLevel: "silent",
    configFile: false,
    resolve: { conditions: ["usnea-src"] },
    build: { outDir, emptyOutDir: true },
  });
  await writeFile(join(outDir, "hello.txt"), "hello usnea");
  await writeFile(join(outDir, "tiny.png"), makePng());

  server = createServer((req, res) => {
    const path = normalize(new URL(req.url ?? "/", "http://x").pathname).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    const file = path === "/" ? "/index.html" : path;
    readFile(join(outDir, file)).then(
      (data) => {
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        res.end(data);
      },
      () => {
        res.writeHead(404);
        res.end("not found");
      },
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 400, height: 300 },
    deviceScaleFactor: 2,
  });
  page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.platform !== undefined);
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  await rm(outDir, { recursive: true, force: true });
}, 30_000);

const lastEvent = (type: string) =>
  page.evaluate((t) => window.events.filter((e) => e.type === t).at(-1), type);

describe("web platform", { timeout: 30_000 }, () => {
  it("creates a canvas with physical surface size", async () => {
    const info = await page.evaluate(() => ({
      tag: document.querySelector("canvas")?.tagName,
      w: window.platform.surface.width,
      h: window.platform.surface.height,
      r: window.platform.surface.pixelRatio,
      native: window.platform.surface.native === document.querySelector("canvas"),
    }));
    expect(info).toEqual({ tag: "CANVAS", w: 800, h: 600, r: 2, native: true });
  });

  it("emits resize when the viewport changes", async () => {
    await page.setViewportSize({ width: 300, height: 200 });
    await page.waitForFunction(() => window.platform.surface.width === 600);
    expect(await lastEvent("resize")).toEqual({
      type: "resize",
      width: 600,
      height: 400,
      pixelRatio: 2,
    });
  });

  it("delivers keyboard events", async () => {
    await page.keyboard.down("KeyA");
    await page.keyboard.down("KeyA");
    await page.keyboard.up("KeyA");
    const keys = await page.evaluate(() => window.events.filter((e) => e.type === "key"));
    expect(keys).toEqual([
      { type: "key", code: "KeyA", down: true, repeat: false },
      { type: "key", code: "KeyA", down: true, repeat: true },
      { type: "key", code: "KeyA", down: false, repeat: false },
    ]);
  });

  it("delivers pointer events scaled by pixel ratio", async () => {
    await page.mouse.move(10, 20);
    await page.mouse.down();
    await page.mouse.up();
    const ptr = await page.evaluate(() => window.events.filter((e) => e.type === "pointer"));
    const down = ptr.find((e) => e.type === "pointer" && e.phase === "down");
    expect(down).toMatchObject({ kind: "mouse", button: 0, x: 20, y: 40 });
    expect(ptr.some((e) => e.type === "pointer" && e.phase === "up")).toBe(true);
  });

  it("delivers wheel events", async () => {
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => window.events.some((e) => e.type === "wheel"));
    const wheel = await lastEvent("wheel");
    expect(wheel).toMatchObject({ type: "wheel", dx: 0 });
    expect((wheel as { dy: number }).dy).toBeGreaterThan(0);
  });

  it("delivers visibility events", async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await lastEvent("visibility")).toEqual({ type: "visibility", visible: false });
  });

  it("provides frames and timers in seconds", async () => {
    const r = await page.evaluate(
      () =>
        new Promise<{ a: number; b: number; now: number; timer: boolean }>((resolve) => {
          const p = window.platform;
          let timer = false;
          p.setTimer(() => {
            timer = true;
          }, 0.05);
          p.requestFrame((a) => {
            p.requestFrame((b) => {
              p.setTimer(() => resolve({ a, b, now: p.now(), timer }), 0.1);
            });
          });
        }),
    );
    expect(r.b).toBeGreaterThan(r.a);
    expect(r.a).toBeLessThan(r.now);
    expect(r.now).toBeLessThan(600);
    expect(r.timer).toBe(true);
  });

  it("reads text and loads images, rejecting on missing files", async () => {
    const r = await page.evaluate(async () => {
      const p = window.platform;
      const text = await p.readText("hello.txt");
      const bytes = (await p.readBytes("hello.txt")).length;
      const img = await p.loadImage("tiny.png");
      const err = await p.readText("missing.txt").catch((e: Error) => e.message);
      return {
        text,
        bytes,
        w: img.width,
        h: img.height,
        bitmap: img.source instanceof ImageBitmap,
        err,
      };
    });
    expect(r).toMatchObject({ text: "hello usnea", bytes: 11, w: 2, h: 3, bitmap: true });
    expect(r.err).toContain("missing.txt");
    expect(r.err).toContain("404");
  });

  it("rasterizes text", async () => {
    const r = await page.evaluate(() => {
      const p = window.platform;
      const base = { font: "sans-serif", size: 20, wrapWidth: 0, align: "left" as const };
      const short = p.rasterizeText?.("Hi", base);
      const long = p.rasterizeText?.("Hello there world", base);
      const wrapped = p.rasterizeText?.("Hello there world", { ...base, wrapWidth: 60 });
      const empty = p.rasterizeText?.("", base);
      const src = short?.source as OffscreenCanvas;
      const data = src.getContext("2d")?.getImageData(0, 0, src.width, src.height).data;
      return {
        short: [short?.width, short?.height],
        long: [long?.width, long?.height],
        wrapped: [wrapped?.width, wrapped?.height],
        empty: [empty?.width, empty?.height],
        ink: data ? data.some((v, i) => i % 4 === 3 && v > 0) : false,
      };
    });
    expect(r.ink).toBe(true);
    expect(r.long[0]).toBeGreaterThan(r.short[0] as number);
    expect(r.wrapped[1]).toBeGreaterThan(r.long[1] as number);
    expect(r.empty[0]).toBeGreaterThanOrEqual(1);
    expect(r.empty[1]).toBeGreaterThanOrEqual(1);
  });

  it("round-trips storage", async () => {
    const r = await page.evaluate(async () => {
      const s = window.platform.storage;
      await s.set("k", "v");
      const got = await s.get("k");
      const raw = localStorage.getItem("usnea:k");
      await s.remove("k");
      return { got, raw, after: await s.get("k") };
    });
    expect(r).toEqual({ got: "v", raw: "v", after: undefined });
  });
});
