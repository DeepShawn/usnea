// SPDX-License-Identifier: Apache-2.0
import type { AssetStoreInternal } from "../assets.js";
import type { Kernel } from "../kernel.js";
import type { Platform, SceneData } from "../types.js";
import { instantiate, loadScene, type SceneContext } from "./load.js";
import { buildSceneSchema } from "./schema.js";
import { takeSnapshot } from "./snapshot.js";

/** Internal: loads scenes and prefabs into a kernel's world. */
export interface SceneManager {
  /** Steps 1 to 5 of design section 5. The caller does step 6 (request render, wake). */
  load(scene: string | SceneData): Promise<void>;
  /** JSON Schema (draft 2020-12) for scene files, from the registered components. */
  schema(): Record<string, unknown>;
}

/** Internal: creates the scene manager and wires `world.instantiate` and `world.snapshot`. */
export function createSceneManager(options: {
  kernel: Kernel;
  assets: AssetStoreInternal;
  platform: Platform | undefined;
  /** Names of the registered plugins, for the scene's `plugins` check. */
  pluginNames: readonly string[];
}): SceneManager {
  const { kernel } = options;
  const ctx: SceneContext = {
    ...options,
    lookup: new Map(kernel.world.components.map((c) => [c.$name, c])),
    prefabs: new Map(),
    retained: [],
  };
  kernel.setHooks({
    instantiate: (path, overrides) => instantiate(ctx, path, overrides),
    snapshot: () => takeSnapshot(kernel),
  });
  return {
    load: (scene) => loadScene(ctx, scene),
    schema: () => buildSceneSchema(kernel.world.components),
  };
}
