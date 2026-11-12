// SPDX-License-Identifier: Apache-2.0
process.env.USNEA_SRC = "1";

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cli, ROOT, readState } from "./harness.js";
import { decodePng } from "./png.js";

const TMP = path.join(ROOT, "test", ".tmp");
afterAll(() => rm(TMP, { recursive: true, force: true }));

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

describe("catch", { timeout: 120_000 }, () => {
  it("passes `usnea test` (replay cases and Vitest)", async () => {
    const r = await cli("test");
    expect(r.out).toContain("2/2 replay cases passed");
    expect(r.code, r.out + r.err).toBe(0);
  });

  it("runs 600 frames headless to the same hash twice", async () => {
    const a = await cli("run", "--headless", "--frames", "600");
    const b = await cli("run", "--headless", "--frames", "600");
    expect(a.code).toBe(0);
    expect(JSON.parse(a.out).hash).toBe(JSON.parse(b.out).hash);
  });

  it("scores when the recording catches a block", async () => {
    expect(readState((await cli("inspect")).out)).toMatchObject({ score: 0, lives: 3, x: 400 });
    const r = await cli("inspect", "--replay", "tests/play.rec");
    expect(r.code, r.err).toBe(0);
    const state = readState(r.out);
    expect(state.score).toBeGreaterThanOrEqual(1);
    expect(state.x).not.toBe(400);
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
