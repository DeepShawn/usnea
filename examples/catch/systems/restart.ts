// SPDX-License-Identifier: Apache-2.0
import { defineSystem, RawInput } from "usnea";
import { Block, Game } from "../components/game.js";

/** After game over, Space clears the blocks and resets score and lives. */
export const restart = defineSystem({
  name: "restart",
  phase: "update",
  query: [Game],
  writes: [Game],
  run(world, _dt, [g]) {
    const space = world
      .read(RawInput)
      .some((e) => e.type === "key" && e.down && e.code === "Space");
    if (!Game.over[g] || !space) return false;
    for (const b of [...world.query([Block])]) world.despawn(b);
    world.add(g, Game);
  },
});
