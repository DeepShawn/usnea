// SPDX-License-Identifier: Apache-2.0
import { defineComponent, i32 } from "usnea";

/** Marks the player-controlled entity and counts its jumps. */
export const Player = defineComponent("Player", { score: i32, speed: i32.default(60) });
