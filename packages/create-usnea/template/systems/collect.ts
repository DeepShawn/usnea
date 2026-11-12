// SPDX-License-Identifier: Apache-2.0
import { defineSystem } from "usnea";
import { Position } from "usnea/2d";
import { Player, Target } from "../components/game.js";

/** When the player touches the target, scores and moves the target somewhere random. */
export const collect = defineSystem({
  name: "collect",
  query: [Target, Position],
  writes: [Position, Player],
  run(world, _dt, [t]) {
    const p = world.find("player");
    const gap = Math.hypot(Position.x[t] - Position.x[p], Position.y[t] - Position.y[p]);
    if (gap > 28) return false;
    Player.score[p] += 1;
    Position.x[t] = 24 + world.rng.int(752);
    Position.y[t] = 24 + world.rng.int(552);
  },
});
