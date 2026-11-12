// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "./errors.js";
import type { SystemConfig, SystemDef } from "./types.js";

/** Defines a system; the phase defaults to "update". */
export function defineSystem(config: SystemConfig): SystemDef {
  if (typeof config.name !== "string" || config.name === "") {
    throw usneaError("USN-E000", "System name is empty", "defineSystem", "pass a name");
  }
  if (typeof config.run !== "function") {
    throw usneaError(
      "USN-E000",
      `System "${config.name}" has no run function`,
      "defineSystem",
      "add run(world, dt, entities)",
    );
  }
  return { ...config, phase: config.phase ?? "update" };
}
