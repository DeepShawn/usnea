// SPDX-License-Identifier: Apache-2.0
import { defineSystem, RawInput } from "usnea";
import { screenToWorld } from "usnea/2d";
import { Controls as C } from "../components/game.js";

/** Turns key and pointer events into the paddle's Controls. */
export const input = defineSystem({
  name: "input",
  phase: "input",
  query: [C],
  writes: [C],
  run(world, _dt, [c]) {
    const events = world.read(RawInput);
    if (events.length === 0) return false;
    for (const e of events) {
      if (e.type === "key") {
        if (e.code === "ArrowLeft" || e.code === "KeyA") C.left[c] = Number(e.down);
        if (e.code === "ArrowRight" || e.code === "KeyD") C.right[c] = Number(e.down);
      } else if (e.type === "pointer" && (e.phase === "down" || e.phase === "move")) {
        C.x[c] = Math.max(0, screenToWorld(world, e.x, e.y).x);
      }
    }
  },
});
