// SPDX-License-Identifier: Apache-2.0
// `usnea test` runs this file's folder through Vitest too. CATCH_NESTED marks that nested run so
// that it skips everything and does not start `usnea test` again.
process.env.USNEA_SRC = "1";

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { main } from "@usnea/cli";
import { parseRecording, replay } from "@usnea/headless";
import { afterAll, describe, expect, it } from "vitest";
import { openGame, ROOT, readState } from "./harness.js";
import { decodePng } from "./png.js";

const nested = process.env.CATCH_NESTED === "1";
const TMP = path.join(ROOT, "test", ".tmp");
afterAll(() => rm(TMP, { recursive: true, force: true }));

async function cli(...argv: string[]) {
  let [out, err] = ["", ""];
  const io = {
    cwd: ROOT,
    stdout: (t: string) => {
      out += t;
    },
    stderr: (t: string) => {
      err += t;
    },
  };
  const code = await main(argv, io);
  return { code, out, err };
}

async function inspect(frames: number) {
  const r = await cli("inspect", "--frames", String(frames));
  expect(r.code, r.err).toBe(0);
  const snap = JSON.parse(r.out) as {
    step: number;
    entities: { id?: string; components: Record<string, Record<string, unknown>> }[];
  };
  const game = snap.entities.find((e) => e.id === "hud")?.components.Game;
  return { game, entities: JSON.stringify(snap.entities), step: snap.step };
}

describe.skipIf(nested)("catch", { timeout: 120_000 }, () => {
  it("passes `usnea test` (replay cases and Vitest)", async () => {
    process.env.CATCH_NESTED = "1";
    try {
      const r = await cli("test");
      expect(r.out).toContain("2/2 replay cases passed");
      expect(r.code, r.out + r.err).toBe(0);
    } finally {
      delete process.env.CATCH_NESTED;
    }
  });

  it("runs 600 frames headless to the same hash twice", async () => {
    const a = await cli("run", "--headless", "--frames", "600");
    const b = await cli("run", "--headless", "--frames", "600");
    expect(a.code).toBe(0);
    expect(JSON.parse(a.out).hash).toBe(JSON.parse(b.out).hash);
  });

  it("scores when the recording catches a block", async () => {
    const recording = parseRecording(await readFile(path.join(ROOT, "tests", "play.rec"), "utf8"));
    const app = await openGame("scenes/main.scene.json", recording.seed);
    try {
      expect(readState(app)).toMatchObject({ score: 0, lives: 3, x: 400 });
      replay(app, recording);
      const state = readState(app);
      expect(state.score).toBeGreaterThanOrEqual(1);
      expect(state.x).not.toBe(400);
    } finally {
      app.dispose();
    }
  });

  it("loses lives without input and ends in a static game over", async () => {
    expect((await inspect(0)).game).toMatchObject({ lives: 3, over: false });
    expect((await inspect(300)).game).toMatchObject({ lives: 2, over: false });
    const over = await inspect(600);
    expect(over.game).toMatchObject({ lives: 0, over: true, score: 0 });
    const later = await inspect(1500);
    expect(later.step).toBeGreaterThan(over.step);
    expect(later.entities).toBe(over.entities);
  });

  it("draws nothing after game over when stepping headless", async () => {
    const renders = async (n: number) =>
      JSON.parse((await cli("run", "--headless", "--frames", String(n))).out).renders as number;
    expect(await renders(700)).toBe(await renders(1500));
  });

  it("draws the paddle in its colour at its position", { timeout: 90_000 }, async () => {
    await mkdir(TMP, { recursive: true });
    const dir = await mkdtemp(path.join(TMP, "shot-"));
    const out = path.join(dir, "shot.png");
    const r = await cli("shot", "-o", out, "--frames", "5");
    expect(r.code, r.err).toBe(0);
    const pixel = decodePng(await readFile(out));
    expect(pixel(400, 570).slice(0, 3)).toEqual([0x4f, 0xc3, 0xf7]);
    expect(pixel(100, 300).slice(0, 3)).toEqual([0x14, 0x18, 0x1f]);
  });
});
