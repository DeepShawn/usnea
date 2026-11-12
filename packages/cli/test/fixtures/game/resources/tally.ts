// SPDX-License-Identifier: Apache-2.0
import { defineEvent, defineResource } from "usnea";

/** Running total of bonuses, kept outside the components. */
export const Tally = defineResource("Tally", () => ({ total: 0 }));

/** Emitted when the player earns a bonus; `n` is its size. */
export const Bonus = defineEvent<{ n: number }>("Bonus");
