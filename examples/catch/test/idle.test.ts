// SPDX-License-Identifier: Apache-2.0
// Real browser check of the power behaviour: a finished game must stop stepping and drawing.
process.env.USNEA_SRC = "1";

import { startDev } from "@usnea/cli";
import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT } from "./harness.js";

const nested = process.env.CATCH_NESTED === "1";
let browser: Browser;
beforeAll(async () => {
  if (!nested) browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function counters(page: Page): Promise<{ draws: number; steps: number }> {
  const text = (await page.locator("#usnea-redraw").textContent()) ?? "";
  return {
    draws: Number(/draws (\d+)/.exec(text)?.[1]),
    steps: Number(/steps (\d+)/.exec(text)?.[1]),
  };
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

describe.skipIf(nested)("idle in the browser", { timeout: 90_000 }, () => {
  it("stops stepping and drawing at game over, and wakes on Space", async () => {
    const io = { cwd: ROOT, stdout: () => undefined, stderr: () => undefined };
    const dev = await startDev(io, 0, "127.0.0.1");
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${dev.url}?usnea-scene=scenes/quick.scene.json&usnea-debug=redraw`);
      await page.locator("#usnea-redraw").waitFor();

      let last = await counters(page);
      let still = 0;
      for (const start = Date.now(); still < 3; await sleep(400)) {
        expect(Date.now() - start, "game over not reached in 40 s").toBeLessThan(40_000);
        const now = await counters(page);
        still = now.steps === last.steps && now.steps > 100 ? still + 1 : 0;
        last = now;
      }

      await sleep(1000);
      expect(await counters(page)).toEqual(last);

      await page.keyboard.press("Space");
      await page.waitForFunction(
        ([s, d]) => {
          const m = /draws (\d+) steps (\d+)/.exec(
            document.querySelector("#usnea-redraw")?.textContent ?? "",
          );
          return Number(m?.[1]) > (d ?? 0) && Number(m?.[2]) > (s ?? 0);
        },
        [last.steps, last.draws],
      );
      expect(errors).toEqual([]);
    } finally {
      await dev.close();
    }
  });
});
