// SPDX-License-Identifier: Apache-2.0

import type { App, Recording } from "usnea";

/** Options for `replay`. */
export interface ReplayOptions {
  /** Extra steps to run after the recording ends. */
  readonly extraSteps?: number;
}

/** Replays a recording into an app: injects each step's events, then steps once. */
export function replay(app: App, recording: Recording, options: ReplayOptions = {}): void {
  if (recording.usnea !== "0.1") {
    throw new Error(
      `Cannot replay: recording format version "${recording.usnea}" is not supported (expected "0.1"). Re-record with a matching Usnea version.`,
    );
  }
  let cursor = 0;
  const events = recording.events;
  for (let step = 0; step < recording.steps; step++) {
    while (cursor < events.length && (events[cursor] as { step: number }).step <= step) {
      const entry = events[cursor++] as Recording["events"][number];
      if (entry.step === step) app.inject(entry.event);
    }
    app.step(1);
  }
  const extra = options.extraSteps ?? 0;
  for (let i = 0; i < extra; i++) app.step(1);
}
