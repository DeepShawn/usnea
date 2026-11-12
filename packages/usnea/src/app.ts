// SPDX-License-Identifier: Apache-2.0
import { type AssetStoreInternal, Assets } from "./assets.js";
import { usneaError } from "./errors.js";
import { RawInput } from "./events.js";
import { createKernel } from "./kernel.js";
import { createLoop } from "./loop.js";
import { createInbox } from "./record.js";
import { createSceneManager } from "./scene/index.js";
import type {
  AnyComponent,
  App,
  AppConfig,
  EventDef,
  Plugin,
  ResourceDef,
  SystemDef,
} from "./types.js";

function gather(config: AppConfig): {
  components: AnyComponent[];
  systems: SystemDef[];
  events: EventDef<unknown>[];
  resources: ResourceDef<unknown>[];
  plugins: readonly Plugin[];
} {
  const plugins = config.plugins ?? [];
  const names = new Set<string>();
  for (const p of plugins) {
    if (names.has(p.name)) {
      throw usneaError(
        "USN-E009",
        `Duplicate plugin name "${p.name}"`,
        "createApp",
        "list each plugin once",
      );
    }
    names.add(p.name);
  }
  const parts: Pick<Plugin, "components" | "systems" | "events" | "resources">[] = [
    ...plugins,
    config,
  ];
  return {
    plugins,
    components: parts.flatMap((p) => [...(p.components ?? [])]),
    systems: parts.flatMap((p) => [...(p.systems ?? [])]),
    events: [RawInput as EventDef<unknown>, ...parts.flatMap((p) => [...(p.events ?? [])])],
    resources: [Assets as ResourceDef<unknown>, ...parts.flatMap((p) => [...(p.resources ?? [])])],
  };
}

/** Creates an app: registers plugins, wires the kernel, assets, scenes and the loop. */
export function createApp(config: AppConfig = {}): App {
  const step = config.step ?? 1 / 60;
  if (!(step > 0) || !Number.isFinite(step)) {
    throw usneaError("USN-E000", `Invalid step ${step}`, "createApp", "pass a positive step");
  }
  const seed = config.seed ?? 1;
  const reg = gather(config);
  const kernel = createKernel({ ...reg, seed, step });
  const { world, time, hasRenderSystems } = kernel;
  const inbox = createInbox(kernel, seed, config.record === true);
  const counters = { steps: 0, renders: 0 };
  const platform = config.platform;
  const alwaysRender = config.alwaysRender === true;
  let disposed = false;

  const assertLive = (where: string): void => {
    if (disposed) {
      throw usneaError("USN-E023", "App was used after dispose()", where, "create a new app");
    }
  };
  const runStep = (): ReturnType<typeof kernel.runLogicStep> => {
    inbox.deliver();
    const result = kernel.runLogicStep();
    counters.steps += 1;
    return result;
  };
  const draw = (alpha: number): void => {
    time.alpha = alpha;
    if (!hasRenderSystems) return;
    kernel.runRenderPhase();
    counters.renders += 1;
  };
  const loop = platform
    ? createLoop({
        platform,
        kernel,
        inbox,
        interpolate: config.interpolate !== false,
        alwaysRender,
        step: runStep,
        draw,
      })
    : undefined;

  const baseWake = world.wake.bind(world);
  const baseRender = world.requestRender.bind(world);
  world.wake = () => {
    assertLive("world.wake");
    baseWake();
    loop?.wake();
  };
  world.requestRender = () => {
    assertLive("world.requestRender");
    baseRender();
    loop?.wake();
  };
  const kick = (): void => {
    if (disposed) return;
    world.requestRender();
    world.wake();
  };
  const assets = world.res(Assets) as AssetStoreInternal;
  assets.attach({ platform, onReady: kick });
  const scenes = createSceneManager({
    kernel,
    assets,
    platform,
    pluginNames: reg.plugins.map((p) => p.name),
  });

  const app: App = {
    world,
    platform,
    stats: {
      get steps() {
        return counters.steps;
      },
      get renders() {
        return counters.renders;
      },
      get idle() {
        return loop?.idle ?? false;
      },
    },
    loadScene(scene) {
      assertLive("app.loadScene");
      return scenes.load(scene).then(kick);
    },
    sceneSchema() {
      assertLive("app.sceneSchema");
      return scenes.schema();
    },
    start() {
      assertLive("app.start");
      if (!loop) {
        throw usneaError(
          "USN-E021",
          "app.start() needs a platform",
          "app.start",
          "pass `platform` to createApp, or drive the app with app.step()",
        );
      }
      loop.start();
    },
    stop() {
      assertLive("app.stop");
      loop?.stop();
    },
    step(count = 1) {
      assertLive("app.step");
      let dirty = false;
      for (let i = 0; i < count; i++) dirty = runStep().dirty || dirty;
      if (kernel.takeRenderRequest() || dirty || alwaysRender) draw(1);
    },
    inject(event) {
      assertLive("app.inject");
      if (loop) loop.receive(event);
      else inbox.push(event);
    },
    recording() {
      assertLive("app.recording");
      if (config.record !== true) {
        throw usneaError(
          "USN-E022",
          "Recording is not enabled",
          "app.recording",
          "pass `record: true` to createApp",
        );
      }
      return inbox.recording();
    },
    dispose() {
      if (disposed) return;
      loop?.stop();
      disposed = true;
      assets.dispose();
      kernel.dispose();
    },
  };
  try {
    for (const p of reg.plugins) p.setup?.(app);
  } catch (error) {
    app.dispose();
    throw error;
  }
  return app;
}
