// SPDX-License-Identifier: Apache-2.0
import type { AssetStoreInternal } from "../assets.js";
import { usneaError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import type { Entity, Platform, PrefabData, SceneComponents, SceneData } from "../types.js";
import {
  applyComponents,
  collectAssetPaths,
  mergeComponents,
  type PendingEid,
  resolvePending,
} from "./build.js";
import { type Lookup, validateComponents, validatePrefab, validateScene } from "./validate.js";

/** Internal: shared state of a scene manager. */
export interface SceneContext {
  readonly kernel: Kernel;
  readonly assets: AssetStoreInternal;
  readonly platform: Platform | undefined;
  readonly pluginNames: readonly string[];
  readonly lookup: Lookup;
  /** Validated prefabs by path; replaced on each scene load. */
  prefabs: ReadonlyMap<string, PrefabData>;
  /** Asset paths retained for the current scene (one entry per retain). */
  retained: string[];
}

async function readJson(ctx: SceneContext, path: string, what: string): Promise<unknown> {
  const platform = ctx.platform;
  if (platform === undefined) {
    throw usneaError(
      "USN-E011",
      `Cannot read ${what} "${path}" without a platform`,
      "scene loading",
      "pass a platform to createApp(), or pass the scene as data",
    );
  }
  let text: string;
  try {
    text = await platform.readText(path);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw usneaError(
      "USN-E011",
      `Cannot read ${what} "${path}": ${cause}`,
      "scene loading",
      "check the path",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw usneaError(
      "USN-E011",
      `${what} "${path}" is not valid JSON: ${cause}`,
      "scene loading",
      "fix the JSON",
    );
  }
}

/** Internal: steps 1 to 5 of the scene loading procedure. */
export async function loadScene(ctx: SceneContext, scene: string | SceneData): Promise<void> {
  const { kernel, assets, lookup } = ctx;
  const raw = typeof scene === "string" ? await readJson(ctx, scene, "scene") : scene;
  const label =
    typeof scene === "string" ? `scene "${scene}"` : `scene "${String((raw as SceneData)?.name)}"`;
  const data = validateScene(raw, label, lookup, ctx.pluginNames);

  const prefabPaths = [
    ...new Set([
      ...(data.prefabs ?? []),
      ...data.entities.flatMap((e) => (e.prefab ? [e.prefab] : [])),
    ]),
  ];
  const loadedPrefabs = await Promise.all(
    prefabPaths.map(async (p) => validatePrefab(await readJson(ctx, p, "prefab"), p, lookup)),
  );
  const prefabs = new Map(prefabPaths.map((p, i) => [p, loadedPrefabs[i] as PrefabData]));

  const paths = [
    ...data.entities.flatMap((e) => collectAssetPaths(e.components, lookup)),
    ...loadedPrefabs.flatMap((p) => collectAssetPaths(p.components, lookup)),
  ];
  for (const p of paths) assets.retain(p);
  try {
    await Promise.all(paths.map((p) => assets.load(p)));
  } catch (error) {
    for (const p of paths) assets.release(p);
    throw error;
  }

  kernel.despawnAll();
  for (const p of ctx.retained) assets.release(p);
  ctx.retained = paths;
  ctx.prefabs = prefabs;
  assets.collect();

  const pending: PendingEid[] = [];
  for (const entry of data.entities) {
    const e = kernel.world.spawn();
    if (entry.id !== undefined) kernel.setEntityId(e, entry.id);
    const base = entry.prefab === undefined ? undefined : prefabs.get(entry.prefab)?.components;
    applyComponents(kernel.world, lookup, e, mergeComponents(base, entry.components), pending);
  }
  resolvePending(kernel.world, pending);
}

/** Internal: `world.instantiate`. */
export function instantiate(
  ctx: SceneContext,
  path: string,
  overrides: SceneComponents | undefined,
): Entity {
  const prefab = ctx.prefabs.get(path);
  if (prefab === undefined) {
    throw usneaError(
      "USN-E018",
      `Prefab "${path}" is not loaded`,
      "world.instantiate",
      'list it in the scene\'s "prefabs" or reference it from an entity',
    );
  }
  const where = `world.instantiate("${path}")`;
  const over = validateComponents(overrides ?? {}, ctx.lookup, "handle", where);
  for (const p of collectAssetPaths(prefab.components, ctx.lookup)) {
    ctx.assets.retain(p);
    ctx.retained.push(p);
  }
  const e = ctx.kernel.world.spawn();
  applyComponents(ctx.kernel.world, ctx.lookup, e, mergeComponents(prefab.components, over), []);
  return e;
}
