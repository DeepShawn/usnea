// SPDX-License-Identifier: Apache-2.0
// Builds the game in-process on the headless platform, for tests that need to read state while
// replaying a recording (the CLI can print a replay's hash but not its state).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHeadlessBackend, createHeadlessPlatform } from "@usnea/headless";
import { type App, createApp } from "usnea";
import { render2d } from "usnea/2d";
import * as game from "../components/game.js";
import * as fall from "../systems/fall.js";
import * as hud from "../systems/hud.js";
import * as input from "../systems/input.js";
import * as paddle from "../systems/paddle.js";
import * as restart from "../systems/restart.js";
import * as spawn from "../systems/spawn.js";

/** The example project folder. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Creates the app with the given scene loaded; dispose it before creating the next one. */
export async function openGame(scene = "scenes/main.scene.json", seed = 7): Promise<App> {
  const backend = createHeadlessBackend();
  const platform = createHeadlessPlatform({ root: ROOT, width: 800, height: 600 });
  const app = createApp({
    plugins: [render2d({ backend, width: 800, height: 600, background: 0x14181fff })],
    components: [game.Paddle, game.Block, game.Game, game.Controls],
    systems: [fall.fall, hud.hud, input.input, paddle.paddle, restart.restart, spawn.spawn],
    platform,
    seed,
    record: true,
  });
  await app.loadScene(scene);
  return app;
}

/** Reads the HUD entity's game fields and the paddle x. */
export function readState(app: App): { score: number; lives: number; over: boolean; x: number } {
  const snap = app.world.snapshot().entities;
  const hudC = snap.find((e) => e.id === "hud")?.components;
  const pad = snap.find((e) => e.id === "paddle")?.components;
  return {
    score: Number(hudC?.Game?.score),
    lives: Number(hudC?.Game?.lives),
    over: hudC?.Game?.over === true,
    x: Number(pad?.Position?.x),
  };
}
