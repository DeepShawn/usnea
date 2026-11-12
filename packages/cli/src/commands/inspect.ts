// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { withRuntime } from "../headless.js";
import { type Io, intOption } from "../io.js";

/** `usnea inspect [scene]`: prints the world snapshot after N steps as pretty JSON. */
export async function inspectCommand(args: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { frames: { type: "string" }, output: { type: "string", short: "o" } },
  });
  const frames = intOption(values.frames, "--frames", 0);
  return withRuntime(io, { scene: positionals[0] }, async (runtime) => {
    runtime.step(frames);
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
