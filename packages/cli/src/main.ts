// SPDX-License-Identifier: Apache-2.0
import { devCommand } from "./commands/dev.js";
import { inspectCommand } from "./commands/inspect.js";
import { runCommand } from "./commands/run.js";
import { shotCommand } from "./commands/shot.js";
import { plannedCommand } from "./commands/stub.js";
import { testCommand } from "./commands/test.js";
import { CliError, formatError, type Io } from "./io.js";
import { USAGE } from "./usage.js";

/** A command: arguments after its name, output channels; resolves to the exit code. */
export type Command = (args: string[], io: Io) => Promise<number>;

/** All commands by name. */
export const COMMANDS: Readonly<Record<string, Command>> = {
  dev: (args, io) => devCommand(args, io),
  run: runCommand,
  inspect: inspectCommand,
  shot: shotCommand,
  test: testCommand,
  build: plannedCommand("build"),
  import: plannedCommand("import"),
  plugin: plannedCommand("plugin"),
  doctor: plannedCommand("doctor"),
};

/** Runs the CLI for `argv` (without node and script) and returns the exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === "--help" || name === "-h" || name === "help") {
    io.stdout(USAGE);
    return 0;
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!command) {
    io.stderr(
      `error: unknown command "${name}"\nhint: run \`usnea --help\` to list the commands\n\n${USAGE}`,
    );
    return 2;
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }
  try {
    return await command(rest, io);
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.startsWith("ERR_PARSE_ARGS")) {
      io.stderr(
        formatError(new CliError((err as Error).message, `run \`usnea ${name} --help\``, 2)),
      );
      return 2;
    }
    io.stderr(formatError(err));
    return err instanceof CliError ? err.exitCode : 1;
  }
}
