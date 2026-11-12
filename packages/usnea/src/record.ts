// SPDX-License-Identifier: Apache-2.0
import { RawInput } from "./events.js";
import type { Kernel } from "./kernel.js";
import type { PlatformEvent, Recording } from "./types.js";

/** Internal: queue of platform events plus the optional recording. */
export interface Inbox {
  /** Queues an event for the next logic step. */
  push(event: PlatformEvent): void;
  /** Number of queued events. */
  readonly size: number;
  /** Moves queued events into the `RawInput` channel (and the recording). */
  deliver(): void;
  /** Copy of the recording so far. */
  recording(): Recording;
}

/** Internal: creates the inbox of an app. */
export function createInbox(kernel: Kernel, seed: number, record: boolean): Inbox {
  const queue: PlatformEvent[] = [];
  const events: { step: number; event: PlatformEvent }[] = [];
  return {
    push: (event) => {
      queue.push(event);
    },
    get size() {
      return queue.length;
    },
    deliver() {
      if (queue.length === 0) return;
      for (let i = 0; i < queue.length; i++) {
        const event = queue[i] as PlatformEvent;
        kernel.world.emit(RawInput, event);
        if (record) events.push({ step: kernel.time.step, event });
      }
      queue.length = 0;
    },
    recording: () => ({
      usnea: "0.1",
      seed,
      step: kernel.time.dt,
      steps: kernel.time.step,
      events: events.map((e) => ({ step: e.step, event: e.event })),
    }),
  };
}
