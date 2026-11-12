// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { loadConfig, resolveScene } from "./config.js";
import type { Io } from "./io.js";
import type { HeadlessRuntime } from "./runtime/headless.js";
import { startServer } from "./server.js";
import { runtimeFile } from "./vite-plugin.js";

/** Options for one headless app. */
export interface OpenOptions {
  /** Scene path relative to the project; defaults to the configured scene. */
  readonly scene?: string | undefined;
  /** Text of a recording file to replay. */
  readonly recording?: string | undefined;
}

/** A Vite server with the project and runtime loaded; apps are created from it one at a time. */
export interface HeadlessHost {
  /** Creates a fresh app with the scene loaded. Dispose the previous one first. */
  open(options?: OpenOptions): Promise<HeadlessRuntime>;
  close(): Promise<void>;
}

/** Starts the Vite server in middleware mode and loads the runtime glue through it. */
export async function openHost(io: Io): Promise<HeadlessHost> {
  const root = path.resolve(io.cwd);
  const config = await loadConfig(root);
  const server = await startServer({ root, io });
  try {
    const mod = (await server.ssrLoadModule(runtimeFile("headless"))) as {
      createHeadlessRuntime: (o: {
        root: string;
        scene?: string | undefined;
        recording?: string | undefined;
      }) => Promise<HeadlessRuntime>;
    };
    return {
      async open(options = {}) {
        const scene = await resolveScene(root, config, options.scene);
        return mod.createHeadlessRuntime({ root, scene, recording: options.recording });
      },
      close: () => server.close(),
    };
  } catch (err) {
    await server.close();
    throw err;
  }
}

/** Runs `fn` with a freshly opened headless app, and always cleans up. */
export async function withRuntime<T>(
  io: Io,
  options: OpenOptions,
  fn: (runtime: HeadlessRuntime) => Promise<T> | T,
): Promise<T> {
  const host = await openHost(io);
  let runtime: HeadlessRuntime | undefined;
  try {
    runtime = await host.open(options);
    return await fn(runtime);
  } finally {
    runtime?.dispose();
    await host.close();
  }
}
