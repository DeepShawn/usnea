// SPDX-License-Identifier: Apache-2.0
import { defineComponent, f32 } from "usnea";

/** Velocity in pixels per second. */
export const Velocity = defineComponent("Velocity", { vx: f32.default(0), vy: f32.default(0) });
