// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "./errors.js";
import type { EventDef } from "./types.js";

/** Defines a typed event channel; events are cleared at the end of each logic step. */
export function defineEvent<T>(name: string): EventDef<T> {
  if (typeof name !== "string" || name === "") {
    throw usneaError("USN-E000", "Event name is empty", "defineEvent", "pass a name");
  }
  return { $name: name };
}

/** Internal: per-world event channels. */
export class EventBus {
  private readonly channels = new Map<object, unknown[]>();

  constructor(defs: readonly EventDef<unknown>[]) {
    const names = new Set<string>();
    for (const def of defs) {
      if (this.channels.has(def)) continue;
      if (names.has(def.$name)) {
        throw usneaError(
          "USN-E009",
          `Duplicate event name "${def.$name}"`,
          "event registration",
          "give each event a unique name",
        );
      }
      names.add(def.$name);
      this.channels.set(def, []);
    }
  }

  private channel(def: EventDef<unknown>): unknown[] {
    const channel = this.channels.get(def);
    if (!channel) {
      throw usneaError(
        "USN-E010",
        `Event "${def.$name}" is not registered`,
        "world.emit / world.read",
        "add it to the events list of the app or plugin",
      );
    }
    return channel;
  }

  emit<T>(def: EventDef<T>, payload: T): void {
    this.channel(def).push(payload);
  }

  read<T>(def: EventDef<T>): readonly T[] {
    return this.channel(def) as T[];
  }

  clear(): void {
    for (const channel of this.channels.values()) channel.length = 0;
  }
}
