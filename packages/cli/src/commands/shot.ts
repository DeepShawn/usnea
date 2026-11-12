// SPDX-License-Identifier: Apache-2.0
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, resolveScene } from "../config.js";
import { CliError, type Io, intOption } from "../io.js";
import { startDev } from "./dev.js";

const TIMEOUT_MS = 30_000;

type Playwright = typeof import("playwright");

async function loadPlaywright(): Promise<Playwright> {
  try {
    return await import("playwright");
  } catch {
    throw new CliError(
      "usnea shot needs Playwright, which is not installed",
      "run `npm install -D playwright` and then `npx playwright install chromium`",
    );
  }
}

/** `usnea shot [scene] -o out.png`: steps the scene in Chromium and saves the canvas as a PNG. */
export async function shotCommand(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      frames: { type: "string" },
      width: { type: "string" },
      height: { type: "string" },
    },
  });
  if (values.output === undefined) {
    io.stderr("usnea shot needs an output file: usnea shot [scene] -o out.png\n");
    return 2;
  }
  const root = path.resolve(io.cwd);
  const config = await loadConfig(root);
  const scene = await resolveScene(root, config, positionals[0]);
  const frames = intOption(values.frames, "--frames", 1, 1);
  const width = intOption(values.width, "--width", config.width, 1);
  const height = intOption(values.height, "--height", config.height, 1);
  const out = path.resolve(root, values.output);
  const pw = await loadPlaywright();
  const dev = await startDev(io, 0, "127.0.0.1");
  let browser: Awaited<ReturnType<Playwright["chromium"]["launch"]>> | undefined;
  try {
    try {
      browser = await pw.chromium.launch();
    } catch (cause) {
      const why = cause instanceof Error ? (cause.message.split("\n")[0] ?? "") : String(cause);
      throw new CliError(
        `could not start Chromium: ${why}`,
        "run `npx playwright install chromium`",
      );
    }
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(e.message));
    const query = `usnea-shot=${frames}&usnea-scene=${encodeURIComponent(scene)}`;
    await page.goto(`${dev.url}?${query}`);
    try {
      await page.waitForFunction(() => window.__usneaShot !== undefined, undefined, {
        timeout: TIMEOUT_MS,
      });
    } catch {
      throw new CliError(
        `the page did not finish rendering within ${TIMEOUT_MS / 1000}s${problems.length ? `: ${problems.join("; ")}` : ""}`,
        "run `usnea dev` and open the page to see the error",
      );
    }
    const state = await page.evaluate(() => window.__usneaShot);
    if (state !== "done") {
      throw new CliError(
        `rendering failed: ${String(state).replace(/^error: /, "")}`,
        "fix the error above, then retry",
      );
    }
    await mkdir(path.dirname(out), { recursive: true });
    await page.locator("canvas").screenshot({ path: out });
    io.stdout(`${values.output}\n`);
    return 0;
  } finally {
    await browser?.close();
    await dev.close();
  }
}

declare global {
  interface Window {
    __usneaShot?: string;
  }
}
