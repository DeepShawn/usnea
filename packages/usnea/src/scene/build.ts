// SPDX-License-Identifier: Apache-2.0
import type {
  AnyComponent,
  ComponentValues,
  Entity,
  SceneComponents,
  SceneValue,
  Schema,
  World,
} from "../types.js";
import type { Lookup } from "./validate.js";

/** Internal: an `eid` field waiting for its target to exist. */
export interface PendingEid {
  entity: Entity;
  def: AnyComponent;
  key: string;
  id: string;
}

/** Internal: prefab components first, then the overrides field by field. */
export function mergeComponents(
  base: SceneComponents | undefined,
  over: SceneComponents | undefined,
): SceneComponents {
  const out: Record<string, Record<string, SceneValue>> = {};
  for (const src of [base, over]) {
    for (const [name, values] of Object.entries(src ?? {})) out[name] = { ...out[name], ...values };
  }
  return out;
}

/** Internal: every non-empty `asset` field value, once per occurrence. */
export function collectAssetPaths(
  components: SceneComponents | undefined,
  lookup: Lookup,
): string[] {
  const paths: string[] = [];
  for (const [name, values] of Object.entries(components ?? {})) {
    const schema = lookup.get(name)?.$schema as Schema | undefined;
    for (const [key, v] of Object.entries(values)) {
      if (schema?.[key]?.kind === "asset" && typeof v === "string" && v !== "") paths.push(v);
    }
  }
  return paths;
}

/** Internal: adds the components to the entity; scene-id `eid` strings are queued in `pending`. */
export function applyComponents(
  world: World,
  lookup: Lookup,
  entity: Entity,
  components: SceneComponents,
  pending: PendingEid[],
): void {
  for (const [name, values] of Object.entries(components)) {
    const def = lookup.get(name) as AnyComponent;
    const schema = def.$schema as Schema;
    const plain: Record<string, SceneValue> = {};
    for (const [key, v] of Object.entries(values)) {
      if (schema[key]?.kind === "eid" && typeof v === "string")
        pending.push({ entity, def, key, id: v });
      else plain[key] = v;
    }
    world.add(entity, def, plain as ComponentValues<Schema>);
  }
}

/** Internal: writes the queued `eid` handles once every entity exists. */
export function resolvePending(world: World, pending: readonly PendingEid[]): void {
  for (const p of pending) {
    const target = world.find(p.id);
    const column = (p.def as unknown as Record<string, Uint32Array>)[p.key] as Uint32Array;
    column[p.entity] = target === 0 ? 0 : world.handle(target);
  }
}
