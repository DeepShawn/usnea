// SPDX-License-Identifier: Apache-2.0
import { defineSystem } from "usnea";
import { Text } from "usnea/2d";
import { Game } from "../components/game.js";

/** Writes score and lives (or the game-over message) into the HUD text. */
export const hud = defineSystem({
  name: "hud",
  phase: "update",
  query: [Game, Text],
  writes: [Text],
  run(_world, _dt, [e]) {
    const text = Game.over[e]
      ? `Game over - press Space (score ${Game.score[e]})`
      : `Score ${Game.score[e]}   Lives ${Game.lives[e]}`;
    if (Text.text[e] === text) return false;
    Text.text[e] = text;
  },
});
