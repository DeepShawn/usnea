// SPDX-License-Identifier: Apache-2.0

import type { App, PlatformEvent, Recording, WorldSnapshot } from "usnea";
import { describe, expect, it } from "vitest";
import { hashSnapshot, parseRecording, replay, saveRecording } from "./index.js";

const key = (code: string, down: boolean): PlatformEvent => ({
  type: "key",
  code,
  down,
  repeat: false,
});
const rec: Recording = {
  usnea: "0.1",
  seed: 7,
  step: 0.016666666666666666,
  steps: 4,
  events: [
    { step: 1, event: key("A", true) },
    {
      step: 1,
      event: { type: "pointer", phase: "down", kind: "mouse", id: 0, button: 0, x: 1.5, y: 2 },
    },
    { step: 3, event: { type: "wheel", dx: 0, dy: -1 } },
    { step: 3, event: { type: "resize", width: 2, height: 3, pixelRatio: 1 } },
    { step: 3, event: { type: "visibility", visible: false } },
  ],
};

function fakeApp(log: string[]): App {
  return {
    inject: (e: PlatformEvent) => log.push(`inject:${e.type}`),
    step: (n?: number) => log.push(`step:${n}`),
  } as unknown as App;
}

describe("replay", () => {
  it("injects then steps, in order", () => {
    const log: string[] = [];
    replay(fakeApp(log), rec);
    expect(log).toEqual([
      "step:1",
      "inject:key",
      "inject:pointer",
      "step:1",
      "step:1",
      "inject:wheel",
      "inject:resize",
      "inject:visibility",
      "step:1",
    ]);
  });

  it("runs extra steps", () => {
    const log: string[] = [];
    replay(fakeApp(log), { ...rec, steps: 1, events: [] }, { extraSteps: 2 });
    expect(log).toEqual(["step:1", "step:1", "step:1"]);
  });

  it("rejects other versions", () => {
    expect(() => replay(fakeApp([]), { ...rec, usnea: "0.2" })).toThrow(/"0.2".*not supported/);
  });
});

describe("recording text", () => {
  it("round-trips", () => {
    const text = saveRecording(rec);
    expect(text.split("\n")[0]).toBe(`{"usnea":"0.1","seed":7,"step":${rec.step},"steps":4}`);
    expect(text.split("\n")[1]).toBe(
      '{"step":1,"event":{"type":"key","code":"A","down":true,"repeat":false}}',
    );
    expect(parseRecording(text)).toEqual(rec);
    expect(saveRecording(parseRecording(text))).toBe(text);
  });

  it("uses a fixed key order regardless of input order", () => {
    const shuffled = {
      step: 0,
      event: { repeat: false, down: true, code: "B", type: "key" } as PlatformEvent,
    };
    const text = saveRecording({ ...rec, events: [shuffled] });
    expect(text.split("\n")[1]).toBe(
      '{"step":0,"event":{"type":"key","code":"B","down":true,"repeat":false}}',
    );
  });

  it("reports line numbers", () => {
    const head = '{"usnea":"0.1","seed":1,"step":0.5,"steps":2}';
    expect(() => parseRecording("")).toThrow(/line 1/);
    expect(() => parseRecording("nope")).toThrow(/line 1: invalid JSON/);
    expect(() => parseRecording('{"usnea":"0.1"}')).toThrow(/line 1.*"seed"/);
    expect(() =>
      parseRecording(`${head}\n{"step":0,"event":{"type":"wheel","dx":1,"dy":2}}\n{bad`),
    ).toThrow(/line 3: invalid JSON/);
    expect(() => parseRecording(`${head}\n{"step":0,"event":{"type":"zap"}}`)).toThrow(
      /line 2.*zap/,
    );
    expect(() => parseRecording(`${head}\n{"step":0,"event":{"type":"key","code":1}}`)).toThrow(
      /line 2.*"code"/,
    );
  });
});

describe("hashSnapshot", () => {
  const snap = {
    step: 3,
    entities: [{ entity: 1, id: "a", components: { P: { x: 1, y: 2 } } }],
  } as unknown as WorldSnapshot;

  it("is stable under key order and changes with values", () => {
    const reordered = {
      entities: [{ components: { P: { y: 2, x: 1 } }, id: "a", entity: 1 }],
      step: 3,
    } as unknown as WorldSnapshot;
    expect(hashSnapshot(snap)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSnapshot(reordered)).toBe(hashSnapshot(snap));
    const changed = { ...snap, step: 4 } as WorldSnapshot;
    expect(hashSnapshot(changed)).not.toBe(hashSnapshot(snap));
  });
});
