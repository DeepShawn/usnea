// SPDX-License-Identifier: Apache-2.0
import { defineSystem, RawInput } from "usnea";
import { Player } from "../components/player.js";
import { Bonus, Tally } from "../resources/tally.js";

/** Space emits a `Bonus` of 7; each bonus is added to the `Tally` resource and to Player.speed. */
export const bonus = defineSystem({
  name: "bonus",
  phase: "input",
  query: [Player],
  writes: [Player],
  run(world, _dt, entities) {
    for (const ev of world.read(RawInput)) {
      if (ev.type === "key" && ev.down && ev.code === "Space") world.emit(Bonus, { n: 7 });
    }
    for (const { n } of world.read(Bonus)) {
      world.res(Tally).total += n;
      for (const e of entities) Player.speed[e] = 60 + world.res(Tally).total;
    }
  },
});
