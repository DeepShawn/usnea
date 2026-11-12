// SPDX-License-Identifier: Apache-2.0
import { defineSystem, RawInput } from "usnea";
import { Position } from "usnea/2d";
import { Player } from "../components/game.js";

const KEYS: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** Tracks the held arrow keys and moves the player; idle (returns false) when no key is held. */
export const move = defineSystem({
  name: "move",
  phase: "fixed",
  query: [Player, Position],
  writes: [Position, Player],
  run(world, dt, [p]) {
    for (const e of world.read(RawInput))
      if (e.type === "key" && e.code in KEYS) Player[KEYS[e.code]][p] = +e.down;
    const [dx, dy] = [Player.right[p] - Player.left[p], Player.down[p] - Player.up[p]];
    Position.x[p] += dx * Player.speed[p] * dt;
    Position.y[p] += dy * Player.speed[p] * dt;
    return dx !== 0 || dy !== 0;
  },
});
