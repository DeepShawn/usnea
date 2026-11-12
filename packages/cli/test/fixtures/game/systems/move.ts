// SPDX-License-Identifier: Apache-2.0
import { defineSystem } from "usnea";
import { Position } from "usnea/2d";
import { Velocity } from "../components/motion.js";

/** Moves every entity by its velocity each step. */
export const move = defineSystem({
  name: "move",
  phase: "update",
  query: [Position, Velocity],
  writes: [Position],
  run(_world, dt, entities) {
    for (const e of entities) {
      Position.x[e] += Velocity.vx[e] * dt;
      Position.y[e] += Velocity.vy[e] * dt;
    }
  },
});
