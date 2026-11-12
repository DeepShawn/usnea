// SPDX-License-Identifier: Apache-2.0
import { defineSystem } from "usnea";
import { Position } from "usnea/2d";
import { Block, Game } from "../components/game.js";

/** Moves blocks down; the paddle catches them (score), the bottom edge costs a life. */
export const fall = defineSystem({
  name: "fall",
  phase: "update",
  query: [Block, Position],
  writes: [Position, Game],
  run(world, dt, entities) {
    const [g, paddle] = [world.find("hud"), world.find("paddle")];
    if (Game.over[g]) return false;
    for (const e of entities) {
      Position.y[e] += Block.speed[e] * dt;
      const y = Position.y[e];
      const caught = y >= 548 && y < 590 && Math.abs(Position.x[e] - Position.x[paddle]) < 62;
      if (caught) Game.score[g] += 1;
      else if (y > 612) Game.over[g] = Number(--Game.lives[g] <= 0);
      if (caught || y > 612) world.despawn(e);
    }
  },
});
