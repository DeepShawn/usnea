// SPDX-License-Identifier: Apache-2.0
import { defineSystem, RawInput } from "usnea";
import { Velocity } from "../components/motion.js";
import { Player } from "../components/player.js";

/** Reacts to keys: Space adds a random score, ArrowDown makes the player fall. */
export const control = defineSystem({
  name: "control",
  phase: "input",
  query: [Player, Velocity],
  writes: [Player, Velocity],
  run(world, _dt, entities) {
    const events = world.read(RawInput);
    if (events.length === 0) return false;
    for (const ev of events) {
      if (ev.type !== "key" || !ev.down) continue;
      for (const e of entities) {
        if (ev.code === "Space") Player.score[e] += 1 + world.rng.int(5);
        if (ev.code === "ArrowDown") Velocity.vy[e] = Player.speed[e];
      }
    }
  },
});
