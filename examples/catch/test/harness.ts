// SPDX-License-Identifier: Apache-2.0
// Helpers for the example's tests: run the CLI in-process and read the game state from `inspect`.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "@usnea/cli";

/** The example project folder. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Runs `usnea <argv>` in the example folder and collects its output. */
export async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let [out, err] = ["", ""];
  const io = {
    cwd: ROOT,
    stdout: (t: string) => {
      out += t;
    },
    stderr: (t: string) => {
      err += t;
    },
  };
  const code = await main(argv, io);
  return { code, out, err };
}

/** The HUD's game fields and the paddle x, read from an `inspect` snapshot. */
export function readState(snapshot: string): {
  score: number;
  lives: number;
  over: boolean;
  x: number;
} {
  const entities = (
    JSON.parse(snapshot) as {
      entities: { id?: string; components: Record<string, Record<string, unknown>> }[];
    }
  ).entities;
  const hud = entities.find((e) => e.id === "hud")?.components;
  const pad = entities.find((e) => e.id === "paddle")?.components;
  return {
    score: Number(hud?.Game?.score),
    lives: Number(hud?.Game?.lives),
    over: hud?.Game?.over === true,
    x: Number(pad?.Position?.x),
  };
}
