// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, resolveScene } from "../config.js";
import { CliError, type Io, intOption } from "../io.js";
import { serverPort, startServer } from "../server.js";

/** A running dev server. */
export interface DevHandle {
  /** Address of the page, for example `http://localhost:5173/`. */
  readonly url: string;
  close(): Promise<void>;
}

/** Starts the dev server (port 0 picks a free port). */
export async function startDev(io: Io, port: number, host: string | boolean): Promise<DevHandle> {
  const root = path.resolve(io.cwd);
  await loadConfig(root);
  const server = await startServer({ root, io, listen: { port, host } });
  const shown = typeof host === "string" ? host : "localhost";
  return { url: `http://${shown}:${serverPort(server)}/`, close: () => server.close() };
}

/** Extra hooks so tests can stop the server and learn its address. */
export interface DevHooks {
  /** Stops the server when aborted. */
  readonly signal?: AbortSignal;
  /** Called once the server listens. */
  readonly onReady?: (handle: DevHandle) => void;
}

/** `usnea dev [--port N] [--host]`: serves the game in the browser; any file change reloads the page. */
export async function devCommand(args: string[], io: Io, hooks: DevHooks = {}): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { port: { type: "string" }, host: { type: "boolean" } },
  });
  const port = intOption(values.port, "--port", 5173);
  const config = await loadConfig(path.resolve(io.cwd));
  try {
    await resolveScene(path.resolve(io.cwd), config);
  } catch (err) {
    if (err instanceof CliError) io.stderr(`warning: ${err.message}\nhint: ${err.hint ?? ""}\n`);
  }
  const handle = await startDev(io, port, values.host ? true : "localhost");
  io.stdout(`usnea dev: ${config.name}\n  Local: ${handle.url}\n`);
  hooks.onReady?.(handle);
  await new Promise<void>((resolve) => {
    const done = (): void => {
      process.off("SIGINT", done);
      process.off("SIGTERM", done);
      hooks.signal?.removeEventListener("abort", done);
      resolve();
    };
    if (hooks.signal?.aborted) return done();
    hooks.signal?.addEventListener("abort", done);
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
  await handle.close();
  return 0;
}
