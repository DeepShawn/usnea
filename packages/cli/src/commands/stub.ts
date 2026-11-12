// SPDX-License-Identifier: Apache-2.0
import type { Io } from "../io.js";

/** Milestone of docs/PLAN.md section 11 that delivers each command that does not exist yet. */
export const PLANNED: Readonly<Record<string, string>> = {
  build: "v0.3",
  import: "v0.4",
  plugin: "v0.2",
  doctor: "v0.2",
};

/** Creates a command that reports it is not implemented yet and exits with code 2. */
export function plannedCommand(name: string): (args: string[], io: Io) => Promise<number> {
  return async (_args, io) => {
    io.stderr(`usnea ${name}: not implemented yet (planned for ${PLANNED[name]})\n`);
    return 2;
  };
}
