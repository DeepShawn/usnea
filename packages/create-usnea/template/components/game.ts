// SPDX-License-Identifier: Apache-2.0
import { bool, defineComponent, f32, i32 } from "usnea";

/** The box you move: held arrow keys, speed in pixels per second, and the targets collected. */
export const Player = defineComponent("Player", {
  left: bool,
  right: bool,
  up: bool,
  down: bool,
  speed: f32.default(240),
  score: i32,
});

/** Marks the thing to collect; it jumps to a random place when touched. */
export const Target = defineComponent("Target", {});
