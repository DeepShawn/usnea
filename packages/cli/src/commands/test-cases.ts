// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HeadlessHost } from "../headless.js";
import type { Io } from "../io.js";

/** A replay test case, `tests/<name>.case.json`. */
export interface CaseFile {
  scene: string;
  recording?: string;
  steps?: number;
  expect?: { hash?: string };
  [extra: string]: unknown;
}

/** Lists case files in `tests/`, sorted by name. */
export async function findCases(root: string): Promise<string[]> {
  try {
    return (await readdir(path.join(root, "tests"))).filter((f) => f.endsWith(".case.json")).sort();
  } catch {
    return [];
  }
}

function parseCase(text: string): CaseFile {
  const value: unknown = JSON.parse(text);
  const c = value as CaseFile;
  if (value === null || typeof value !== "object" || typeof c.scene !== "string") {
    throw new Error('case file needs a "scene" string, for example "scenes/main.scene.json"');
  }
  if (c.recording !== undefined && typeof c.recording !== "string") {
    throw new Error('"recording" must be a file name relative to tests/');
  }
  if (c.steps !== undefined && !(Number.isInteger(c.steps) && c.steps >= 0)) {
    throw new Error('"steps" must be a whole number');
  }
  return c;
}

/** Writes a case with a stable key order, 2-space indent and a trailing newline. */
function serialize(c: CaseFile): string {
  const known = ["scene", "recording", "steps", "expect"];
  const out: Record<string, unknown> = {};
  for (const k of known) if (c[k] !== undefined) out[k] = c[k];
  for (const k of Object.keys(c).sort()) if (!known.includes(k)) out[k] = c[k];
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** Runs one case; returns true when it passed (or was updated). */
export async function runCase(
  host: HeadlessHost,
  io: Io,
  file: string,
  update: boolean,
): Promise<boolean> {
  const name = file.replace(/\.case\.json$/, "");
  const full = path.join(io.cwd, "tests", file);
  const actualFile = path.join(io.cwd, "tests", `${name}.actual.json`);
  let runtime: Awaited<ReturnType<HeadlessHost["open"]>> | undefined;
  try {
    const c = parseCase(await readFile(full, "utf8"));
    const recording = c.recording
      ? await readFile(path.join(io.cwd, "tests", c.recording), "utf8").catch(() => {
          throw new Error(`recording "${c.recording}" not found next to the case in tests/`);
        })
      : undefined;
    runtime = await host.open({ scene: c.scene, recording });
    runtime.play(c.steps ?? runtime.recording?.steps ?? 60);
    const { hash } = runtime.stats();
    const expected = c.expect?.hash;
    if (update || expected === hash) {
      if (update && expected !== hash) {
        await writeFile(full, serialize({ ...c, expect: { ...c.expect, hash } }));
        io.stdout(`updated ${name}: ${hash}\n`);
      } else {
        io.stdout(`ok   ${name}\n`);
      }
      await rm(actualFile, { force: true });
      return true;
    }
    await writeFile(actualFile, `${JSON.stringify(runtime.snapshot(), null, 2)}\n`);
    io.stdout(
      `FAIL ${name}\n  expected: ${expected ?? "(none)"}\n  actual:   ${hash}\n` +
        `  snapshot: tests/${name}.actual.json (run \`usnea test --update\` to accept)\n`,
    );
    return false;
  } catch (err) {
    io.stdout(`FAIL ${name}\n  ${err instanceof Error ? err.message : String(err)}\n`);
    return false;
  } finally {
    runtime?.dispose();
  }
}
