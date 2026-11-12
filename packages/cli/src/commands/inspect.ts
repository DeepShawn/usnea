// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { withRuntime } from "../headless.js";
import { type Io, intOption, readRecordingFile } from "../io.js";

/**
 * `usnea inspect [scene]`: prints the world snapshot as pretty JSON, after replaying `--replay`
 * (with its seed) and/or running `--frames` total steps.
 */
export async function inspectCommand(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      frames: { type: "string" },
      output: { type: "string", short: "o" },
      replay: { type: "string" },
      seed: { type: "string" },
    },
  });
  const frames = intOption(values.frames, "--frames", 0);
  const seed = values.seed === undefined ? undefined : intOption(values.seed, "--seed", 0);
  const recording =
    values.replay === undefined ? undefined : await readRecordingFile(io, values.replay);
  const options = { scene: positionals[0], recording, seed };
  return withRuntime(io, options, async (runtime) => {
    runtime.play(values.frames === undefined && recording !== undefined ? undefined : frames);
    const text = `${JSON.stringify(runtime.snapshot(), null, 2)}\n`;
    if (values.output === undefined) {
      io.stdout(text);
    } else {
      await writeFile(path.resolve(io.cwd, values.output), text);
      io.stderr(`wrote ${values.output}\n`);
    }
    return 0;
  });
}
