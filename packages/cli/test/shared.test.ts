// SPDX-License-Identifier: Apache-2.0
import { parseRecording, saveRecording } from "@usnea/headless";
import { defineComponent, defineSystem, f32 } from "usnea";
import { describe, expect, it } from "vitest";
import { collectModules, formatRecording, parseColor } from "../src/runtime/shared.js";

describe("runtime/shared", () => {
  it("formatRecording matches saveRecording and parses", () => {
    const rec = {
      usnea: "0.1",
      seed: 7,
      step: 0,
      steps: 30,
      events: [
        { step: 1, event: { type: "key" as const, code: "KeyA", down: true, repeat: false } },
        { step: 2, event: { type: "wheel" as const, dx: 0, dy: -4 } },
        {
          step: 3,
          event: {
            type: "pointer" as const,
            phase: "down" as const,
            kind: "mouse" as const,
            id: 1,
            button: 0,
            x: 3,
            y: 4,
          },
        },
        { step: 4, event: { type: "resize" as const, width: 1, height: 2, pixelRatio: 1 } },
        { step: 5, event: { type: "visibility" as const, visible: false } },
      ],
    };
    expect(formatRecording(rec)).toBe(saveRecording(rec));
    expect(parseRecording(formatRecording(rec))).toEqual(rec);
  });

  it("collects each component and system once, in path order", () => {
    const C = defineComponent("SharedTestC", { v: f32 });
    const S = defineSystem({ name: "shared-test-s", run: () => undefined });
    const found = collectModules({
      "/systems/b.ts": { S, C, other: 3 },
      "/components/a.ts": { C },
    });
    expect(found.components).toEqual([C]);
    expect(found.systems).toEqual([S]);
  });

  it("parses colours", () => {
    expect(parseColor("#101820")).toBe(0x101820ff);
    expect(parseColor("#10182080")).toBe(0x10182080);
  });
});
