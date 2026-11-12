// SPDX-License-Identifier: Apache-2.0
import { defineSystem } from "usnea";
import { Position, View } from "usnea/2d";
import { Controls as C, Game, Paddle } from "../components/game.js";

/** Moves the paddle with the held keys, or jumps it to the pointer. */
export const paddle = defineSystem({
  name: "paddle",
  phase: "fixed",
  query: [Paddle, C, Position],
  reads: [Game],
  writes: [Position, C],
  run(world, dt, [e]) {
    const dir = C.right[e] - C.left[e];
    if (Game.over[world.find("hud")] || (dir === 0 && C.x[e] < 0)) return false;
    const x = C.x[e] >= 0 ? C.x[e] : Position.x[e] + dir * Paddle.speed[e] * dt;
    Position.x[e] = Math.min(world.res(View).width - 50, Math.max(50, x));
    C.x[e] = -1;
  },
});
