// SPDX-License-Identifier: Apache-2.0
import { bool, defineComponent, f32, i32 } from "usnea";

/** The player's paddle; `speed` is in pixels per second. */
export const Paddle = defineComponent("Paddle", { speed: f32.default(480) });

/** A falling block; `speed` is in pixels per second. */
export const Block = defineComponent("Block", { speed: f32.default(160) });

/** Score, lives and spawn timing; lives on the HUD entity. `every` is seconds between blocks. */
export const Game = defineComponent("Game", {
  score: i32,
  lives: i32.default(3),
  over: bool,
  every: f32.default(0.8),
  timer: f32,
});

/** Held keys and the latest pointer target (world x; -1 when none), filled by `input`. */
export const Controls = defineComponent("Controls", {
  left: bool,
  right: bool,
  x: f32.default(-1),
});
