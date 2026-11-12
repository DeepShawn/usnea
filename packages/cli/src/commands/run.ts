// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { withRuntime } from "../headless.js";
import { CliError, type Io, intOption } from "../io.js";

/** `usnea run --headless`: runs the scene without a display and prints one JSON line of results. */
export async function runCommand(args: string[], io: Io): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      headless: { type: "boolean" },
      frames: { type: "string" },
      scene: { type: "string" },
      replay: { type: "string" },
    },
  });
  if (!values.headless) {
    io.stderr("usnea run needs --headless. To run the game with a window use `usnea dev`.\n");
    return 2;
  }
  let recording: string | undefined;
  if (values.replay !== undefined) {
    const file = path.resolve(io.cwd, values.replay);
    try {
      recording = await readFile(file, "utf8");
    } catch {
      throw new CliError(
        `recording file not found: ${values.replay}`,
        "pass the path of a file made by saveRecording()",
      );
    }
  }
  const frames = intOption(values.frames, "--frames", 600);
  const total = values.frames === undefined && recording !== undefined ? undefined : frames;
  return withRuntime(io, { scene: values.scene, recording }, (runtime) => {
    runtime.play(total);
    io.stdout(`${JSON.stringify(runtime.stats())}\n`);
    return 0;
  });
}
