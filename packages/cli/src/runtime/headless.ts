// SPDX-License-Identifier: Apache-2.0
// Headless runtime glue. Loaded through Vite's ssrLoadModule so that project modules and the
// engine share one module graph.

import { config, modules, plugins } from "virtual:usnea-project";
import {
  createHeadlessBackend,
  createHeadlessPlatform,
  hashSnapshot,
  parseRecording,
  replay,
} from "@usnea/headless";
import type { App, Recording, WorldSnapshot } from "usnea";
import type { ProjectConfig } from "../config.js";
import { buildApp } from "./shared.js";

/** Options for `createHeadlessRuntime`. */
export interface HeadlessOptions {
  /** Absolute project folder; files are read relative to it. */
  readonly root: string;
  /** Scene path relative to the project; defaults to `config.scene`. */
  readonly scene?: string | undefined;
  /** Recording file text to replay; its seed replaces the configured seed. */
  readonly recording?: string | undefined;
}

/** The numbers `usnea run` reports. */
export interface RunStats {
  readonly scene: string;
  readonly steps: number;
  readonly renders: number;
  readonly drawCalls: number;
  readonly entities: number;
  readonly hash: string;
}

/** A headless app with the project's scene loaded. */
export interface HeadlessRuntime {
  readonly app: App;
  readonly config: ProjectConfig;
  readonly scene: string;
  readonly recording: Recording | undefined;
  /** Runs logic steps. */
  step(count: number): void;
  /** Replays the recording (if any), then runs until `totalSteps` steps have been executed. */
  play(totalSteps?: number): void;
  snapshot(): WorldSnapshot;
  stats(): RunStats;
  /** Releases the app so another one can use the same component definitions. */
  dispose(): void;
}

/** Builds an app on the headless platform and backend, and loads the scene. */
export async function createHeadlessRuntime(options: HeadlessOptions): Promise<HeadlessRuntime> {
  const recording = options.recording === undefined ? undefined : parseRecording(options.recording);
  const scene = options.scene ?? config.scene;
  const platform = createHeadlessPlatform({
    root: options.root,
    width: config.width,
    height: config.height,
  });
  const backend = createHeadlessBackend();
  const app = buildApp({ config, modules, plugins, platform, backend, seed: recording?.seed });
  try {
    await app.loadScene(scene);
  } catch (err) {
    app.dispose();
    throw err;
  }
  const snapshot = (): WorldSnapshot => app.world.snapshot();
  return {
    app,
    config,
    scene,
    recording,
    step: (count) => app.step(count),
    play(totalSteps) {
      if (recording) {
        const extra = totalSteps === undefined ? 0 : Math.max(0, totalSteps - recording.steps);
        replay(app, recording, { extraSteps: extra });
      } else if (totalSteps !== undefined) {
        app.step(totalSteps);
      }
    },
    snapshot,
    stats() {
      const snap = snapshot();
      return {
        scene,
        steps: app.stats.steps,
        renders: app.stats.renders,
        drawCalls: backend.drawCalls,
        entities: snap.entities.length,
        hash: hashSnapshot(snap),
      };
    },
    dispose: () => app.dispose(),
  };
}
