// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuadSpec, Result, Spec } from "./fixtures/page.js";

declare global {
  interface Window {
    runSpec(spec: Spec): Result;
  }
}

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};
let browser: Browser;
let server: Server;
let page: Page;
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "usnea-webgl2-"));
  await build({
    root: fileURLToPath(new URL("./fixtures/", import.meta.url)),
    logLevel: "silent",
    configFile: false,
    resolve: { conditions: ["usnea-src"] },
    build: { outDir, emptyOutDir: true },
  });
  server = createServer((req, res) => {
    const path = req.url === "/" || !req.url ? "/index.html" : (req.url.split("?")[0] as string);
    try {
      const body = readFileSync(join(outDir, path));
      res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  browser = await chromium.launch();
  page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  await page.waitForFunction(() => typeof window.runSpec === "function");
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  if (outDir) rmSync(outDir, { recursive: true, force: true });
}, 30_000);

const SOLID = { kind: "solid", color: [255, 255, 255, 255] } as const;

function draw(spec: Partial<Spec> & Pick<Spec, "quads">): Promise<Result> {
  const full: Spec = { width: 16, height: 16, clear: 0x000000ff, textures: [SOLID], ...spec };
  return page.evaluate((s) => window.runSpec(s), full);
}

function px(r: Result, x: number, y: number): number[] {
  const i = (y * r.width + x) * 4;
  return r.data.slice(i, i + 4);
}

function near(actual: number[], expected: number[], tol = 2): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((e, i) => {
    expect(Math.abs((actual[i] as number) - e)).toBeLessThanOrEqual(tol);
  });
}

const quad = (o: Partial<QuadSpec> = {}): QuadSpec => ({ x: 0, y: 0, w: 4, h: 4, tex: 1, ...o });

describe("webgl2 backend", () => {
  it("applies the clear colour", async () => {
    const r = await draw({ clear: 0x336699ff, quads: [] });
    expect(r.width).toBe(16);
    near(px(r, 0, 0), [0x33, 0x66, 0x99, 255]);
    near(px(r, 15, 15), [0x33, 0x66, 0x99, 255]);
    expect(r.drawCalls).toBe(0);
  });

  it("covers the exact rectangle with y down", async () => {
    const r = await draw({ quads: [quad({ x: 2, y: 1, w: 5, h: 3 })] });
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const inside = x >= 2 && x < 7 && y >= 1 && y < 4;
        near(px(r, x, y), inside ? [255, 255, 255, 255] : [0, 0, 0, 255], 0);
      }
    }
  });

  it("honours UVs", async () => {
    const r = await draw({
      textures: [{ kind: "halves" }],
      quads: [quad({ x: 0, y: 0, w: 16, h: 16 })],
    });
    near(px(r, 2, 8), [255, 0, 0, 255]);
    near(px(r, 13, 8), [0, 0, 255, 255]);
    const flipped = await draw({
      textures: [{ kind: "halves" }],
      quads: [quad({ x: 0, y: 0, w: 16, h: 16, uv: [1, 0, 0, 1] })],
    });
    near(px(flipped, 2, 8), [0, 0, 255, 255]);
    near(px(flipped, 13, 8), [255, 0, 0, 255]);
  });

  it("multiplies the tint and blends alpha", async () => {
    const tinted = await draw({ quads: [quad({ color: 0x80c040ff })] });
    near(px(tinted, 1, 1), [0x80, 0xc0, 0x40, 255]);
    const blended = await draw({
      clear: 0x0000ffff,
      quads: [quad({ color: 0xff000080 })],
    });
    near(px(blended, 1, 1), [128, 0, 127, 255]);
  });

  it("batches by texture id", async () => {
    const quads = Array.from({ length: 100 }, (_, i) => quad({ x: i % 16, y: 0, w: 1, h: 1 }));
    expect((await draw({ quads })).drawCalls).toBe(1);
    const t = [SOLID, { kind: "solid", color: [0, 255, 0, 255] }] as const;
    const seq = [1, 1, 2, 2, 1].map((tex, i) => quad({ x: i, tex, w: 1, h: 1 }));
    expect((await draw({ textures: t, quads: seq })).drawCalls).toBe(3);
  });

  it("draws in list order", async () => {
    const t = [
      { kind: "solid", color: [255, 0, 0, 255] },
      { kind: "solid", color: [0, 255, 0, 255] },
    ] as const;
    const r = await draw({
      textures: t,
      quads: [quad({ tex: 1, w: 8, h: 8 }), quad({ tex: 2, x: 4, y: 4, w: 8, h: 8 })],
    });
    near(px(r, 2, 2), [255, 0, 0, 255]);
    near(px(r, 6, 6), [0, 255, 0, 255]);
    near(px(r, 10, 10), [0, 255, 0, 255]);
  });

  it("resizes the output", async () => {
    const r = await draw({ resize: [32, 8], quads: [quad({ x: 30, y: 6, w: 2, h: 2 })] });
    expect(r.width).toBe(32);
    expect(r.height).toBe(8);
    near(px(r, 31, 7), [255, 255, 255, 255], 0);
    near(px(r, 0, 0), [0, 0, 0, 255], 0);
  });

  it("skips unknown texture ids", async () => {
    const r = await draw({
      quads: [quad({ tex: 0, rawTex: 9999 }), quad({ x: 8, y: 8 })],
    });
    expect(r.drawCalls).toBe(1);
    near(px(r, 1, 1), [0, 0, 0, 255], 0);
    near(px(r, 9, 9), [255, 255, 255, 255], 0);
  });
});
