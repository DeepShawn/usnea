// SPDX-License-Identifier: Apache-2.0

import type { PlatformEvent, Recording } from "usnea";

const ORDER: Record<string, readonly string[]> = {
  key: ["type", "code", "down", "repeat"],
  pointer: ["type", "phase", "kind", "id", "button", "x", "y"],
  wheel: ["type", "dx", "dy"],
  resize: ["type", "width", "height", "pixelRatio"],
  visibility: ["type", "visible"],
};

function ordered(event: PlatformEvent): Record<string, unknown> {
  const src = event as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ORDER[event.type] ?? Object.keys(src)) out[k] = src[k];
  return out;
}

/** Serialises a recording: a JSON header line, then one line per event. */
export function saveRecording(recording: Recording): string {
  const lines = [
    JSON.stringify({
      usnea: recording.usnea,
      seed: recording.seed,
      step: recording.step,
      steps: recording.steps,
    }),
  ];
  for (const e of recording.events) {
    lines.push(JSON.stringify({ step: e.step, event: ordered(e.event) }));
  }
  return `${lines.join("\n")}\n`;
}

type Obj = Record<string, unknown>;

function check(obj: Obj, spec: Record<string, string>, line: number, what: string): void {
  for (const [k, t] of Object.entries(spec)) {
    if (typeof obj[k] !== t) {
      throw new Error(`Recording line ${line}: ${what} field "${k}" must be a ${t}`);
    }
  }
}

const EVENT_SPEC: Record<string, Record<string, string>> = {
  key: { code: "string", down: "boolean", repeat: "boolean" },
  pointer: {
    phase: "string",
    kind: "string",
    id: "number",
    button: "number",
    x: "number",
    y: "number",
  },
  wheel: { dx: "number", dy: "number" },
  resize: { width: "number", height: "number", pixelRatio: "number" },
  visibility: { visible: "boolean" },
};

function parseLine(text: string, line: number): Obj {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`Recording line ${line}: invalid JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Recording line ${line}: expected a JSON object`);
  }
  return value as Obj;
}

/** Parses text made by `saveRecording`; errors name the offending line. */
export function parseRecording(text: string): Recording {
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) throw new Error("Recording line 1: empty recording, header missing");
  const head = parseLine(lines[0] as string, 1);
  check(head, { usnea: "string", seed: "number", step: "number", steps: "number" }, 1, "header");
  const events: { step: number; event: PlatformEvent }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const n = i + 1;
    const row = parseLine(lines[i] as string, n);
    check(row, { step: "number", event: "object" }, n, "event line");
    const ev = row.event as Obj | null;
    const spec = ev ? EVENT_SPEC[ev.type as string] : undefined;
    if (!ev || !spec)
      throw new Error(`Recording line ${n}: unknown event type "${String(ev?.type)}"`);
    check(ev, spec, n, `"${ev.type}" event`);
    events.push({ step: row.step as number, event: ev as unknown as PlatformEvent });
  }
  return {
    usnea: head.usnea as string,
    seed: head.seed as number,
    step: head.step as number,
    steps: head.steps as number,
    events,
  };
}
