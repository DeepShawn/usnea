// SPDX-License-Identifier: Apache-2.0
import { parseRecording } from "@usnea/headless";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { devCommand, startDev } from "../src/commands/dev.js";
import { capture, copyFixture } from "./helpers.js";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function draws(page: Page): Promise<number> {
  const text = await page.locator("#usnea-redraw").textContent();
  return Number(/draws (\d+)/.exec(text ?? "")?.[1]);
}

describe("usnea dev", { timeout: 60_000 }, () => {
  it("draws once for a static scene, and every frame with always-render", async () => {
    const dev = await startDev(capture((await import("./helpers.js")).FIXTURE), 0, "127.0.0.1");
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const base = `${dev.url}?usnea-scene=scenes/static.scene.json&usnea-debug=redraw`;
      await page.goto(base);
      await page.locator("canvas").waitFor();
      await page.locator("#usnea-redraw").waitFor();
      await page.waitForFunction(() =>
        /draws [1-9]/.test(document.querySelector("#usnea-redraw")?.textContent ?? ""),
      );
      await page.waitForTimeout(400);
      const first = await draws(page);
      expect(first).toBeGreaterThan(0);
      await page.waitForTimeout(1000);
      expect(await draws(page)).toBe(first);

      await page.goto(`${base},always-render`);
      await page.waitForFunction(() =>
        /draws [1-9]/.test(document.querySelector("#usnea-redraw")?.textContent ?? ""),
      );
      const before = await draws(page);
      await page.waitForTimeout(1000);
      expect(await draws(page)).toBeGreaterThan(before + 10);
      expect(errors).toEqual([]);
    } finally {
      await dev.close();
    }
  });

  it("exposes a recording that parseRecording accepts", async () => {
    const dev = await startDev(capture((await import("./helpers.js")).FIXTURE), 0, "127.0.0.1");
    try {
      const page = await browser.newPage();
      await page.goto(`${dev.url}?usnea-record`);
      await page.waitForFunction(() => window.usnea !== undefined);
      await page.evaluate(() => {
        window.usnea?.app.inject({ type: "key", code: "Space", down: true, repeat: false });
      });
      await page.waitForFunction(() => (window.usnea?.app.stats.steps ?? 0) > 3);
      const text = await page.evaluate(() => window.usnea?.saveRecording() ?? "");
      const rec = parseRecording(text);
      expect(rec.events.some((e) => e.event.type === "key")).toBe(true);
      expect(rec.steps).toBeGreaterThan(0);
    } finally {
      await dev.close();
    }
  });

  it("reloads the page when a project file changes", async () => {
    const dir = await copyFixture();
    const dev = await startDev(capture(dir), 0, "127.0.0.1");
    try {
      const page = await browser.newPage();
      await page.goto(dev.url);
      await page.locator("canvas").waitFor();
      await page.evaluate(() => {
        (window as unknown as { marker: number }).marker = 1;
      });
      const { writeFile } = await import("node:fs/promises");
      const path = await import("node:path");
      await writeFile(path.join(dir, "scenes", "new.scene.json"), "{}");
      await page.waitForFunction(
        () => (window as unknown as { marker?: number }).marker === undefined,
      );
    } finally {
      await dev.close();
    }
  });

  it("runs as a command until it is aborted", async () => {
    const io = capture((await import("./helpers.js")).FIXTURE);
    const abort = new AbortController();
    const done = devCommand(["--port", "0"], io, {
      signal: abort.signal,
      onReady: (h) => {
        expect(io.out()).toContain(h.url);
        abort.abort();
      },
    });
    expect(await done).toBe(0);
    expect(io.out()).toMatch(/Local: http:\/\/localhost:\d+\//);
  });
});
