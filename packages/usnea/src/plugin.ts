// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "./errors.js";
import type { Plugin } from "./types.js";

/** Validates a plugin and returns it. */
export function definePlugin(plugin: Plugin): Plugin {
  if (typeof plugin.name !== "string" || plugin.name === "") {
    throw usneaError("USN-E000", "Plugin name is empty", "definePlugin", "pass a name");
  }
  for (const key of ["components", "systems", "events", "resources"] as const) {
    const list = plugin[key];
    if (list !== undefined && !Array.isArray(list)) {
      throw usneaError(
        "USN-E000",
        `Plugin "${plugin.name}" has a non-array "${key}"`,
        "definePlugin",
        `pass an array for ${key}`,
      );
    }
  }
  return plugin;
}
