// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Where a command reads its project from and writes its output to. */
export interface Io {
  /** Working directory; the project folder unless the command says otherwise. */
  readonly cwd: string;
  stdout(text: string): void;
  stderr(text: string): void;
}

/** A problem the user can fix; `hint` says how, `exitCode` is the process exit code. */
export class CliError extends Error {
  readonly hint: string | undefined;
  readonly exitCode: number;

  constructor(message: string, hint?: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

/** Formats any thrown value as `error: message` plus an optional `hint:` line. */
export function formatError(err: unknown): string {
  if (err instanceof CliError) {
    return `error: ${err.message}${err.hint ? `\nhint: ${err.hint}` : ""}\n`;
  }
  if (err instanceof Error) return `error: ${err.message}\n`;
  return `error: ${String(err)}\n`;
}

/** Parses a non-negative integer option, or throws a `CliError` naming the option. */
export function intOption(
  raw: string | undefined,
  name: string,
  fallback: number,
  min = 0,
): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    throw new CliError(
      `${name} must be an integer >= ${min}, got "${raw}"`,
      `pass a whole number, for example ${name} ${Math.max(min, fallback)}`,
      2,
    );
  }
  return n;
}

/** Reads a recording file given on the command line, or throws a `CliError` with a fix. */
export async function readRecordingFile(io: Io, name: string): Promise<string> {
  try {
    return await readFile(path.resolve(io.cwd, name), "utf8");
  } catch {
    throw new CliError(
      `recording file not found: ${name}`,
      "pass the path of a file made by saveRecording()",
    );
  }
}
