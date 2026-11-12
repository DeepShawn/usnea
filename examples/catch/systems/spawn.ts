// SPDX-License-Identifier: Apache-2.0
import { defineSystem } from "usnea";
import { Game } from "../components/game.js";

/** Drops a block at a random x every `Game.every` seconds, until the game is over. */
export const spawn = defineSystem({
  name: "spawn",
  phase: "fixed",
  query: [Game],
  writes: [Game],
  run(world, dt, [g]) {
    if (Game.over[g]) return false;
    Game.timer[g] += dt;
    if (Game.timer[g] < Game.every[g]) return;
    Game.timer[g] = 0;
    world.instantiate("prefabs/block.prefab.json", { Position: { x: 20 + world.rng.int(760) } });
  },
});
