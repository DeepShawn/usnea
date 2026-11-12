// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "./errors.js";
import type { ResourceDef, TimeState } from "./types.js";

/** Defines a global singleton resource created by `init` for each world. */
export function defineResource<T>(name: string, init: () => T): ResourceDef<T> {
  if (typeof name !== "string" || name === "") {
    throw usneaError("USN-E000", "Resource name is empty", "defineResource", "pass a name");
  }
  return { $name: name, init };
}

/** Built-in resource with the fixed step, step count, elapsed time and render alpha. */
export const Time: ResourceDef<TimeState> = defineResource<TimeState>("Time", () => ({
  dt: 1 / 60,
  step: 0,
  elapsed: 0,
  alpha: 1,
}));

/** Internal: per-world resource values. */
export class ResourceStore {
  private readonly values = new Map<object, unknown>();

  constructor(defs: readonly ResourceDef<unknown>[]) {
    const names = new Set<string>();
    for (const def of [Time, ...defs]) {
      if (this.values.has(def)) continue;
      if (names.has(def.$name)) {
        throw usneaError(
          "USN-E009",
          `Duplicate resource name "${def.$name}"`,
          "resource registration",
          "give each resource a unique name",
        );
      }
      names.add(def.$name);
      this.values.set(def, def.init());
    }
  }

  get<T>(def: ResourceDef<T>): T {
    if (!this.values.has(def)) {
      throw usneaError(
        "USN-E010",
        `Resource "${def.$name}" is not registered`,
        "world.res",
        "add it to the resources list of the app or plugin",
      );
    }
    return this.values.get(def) as T;
  }
}
