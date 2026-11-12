// SPDX-License-Identifier: Apache-2.0
import type { Kernel } from "../kernel.js";
import type { AnyComponent, SceneValue, Schema, WorldSnapshot } from "../types.js";

type Cell = Record<number, number | string>;

/** Internal: builds `world.snapshot()`: live entities by slot, components by name, fields in order. */
export function takeSnapshot(kernel: Kernel): WorldSnapshot {
  const { world } = kernel;
  const defs = [...world.components].sort((a, b) =>
    a.$name < b.$name ? -1 : a.$name > b.$name ? 1 : 0,
  );
  const entities: {
    entity: number;
    id?: string;
    components: Record<string, Record<string, SceneValue>>;
  }[] = [];
  for (let e = 1; e < world.state.next; e++) {
    if (!world.isAlive(e)) continue;
    const components: Record<string, Record<string, SceneValue>> = {};
    for (const def of defs) {
      if (world.has(e, def)) components[def.$name] = readFields(kernel, def, e);
    }
    const id = kernel.entityId(e);
    entities.push(id === undefined ? { entity: e, components } : { entity: e, id, components });
  }
  return { step: kernel.time.step, entities };
}

function readFields(kernel: Kernel, def: AnyComponent, e: number): Record<string, SceneValue> {
  const schema = def.$schema as Schema;
  const columns = def as unknown as Record<string, Cell>;
  const out: Record<string, SceneValue> = {};
  for (const key of Object.keys(schema)) {
    const value = (columns[key] as Cell)[e] as number | string;
    const kind = (schema[key] as { kind: string }).kind;
    if (kind === "bool") out[key] = value === 1;
    else if (kind === "eid" && typeof value === "number" && value !== 0) {
      const target = kernel.world.resolve(value);
      out[key] = (target === 0 ? undefined : kernel.entityId(target)) ?? value;
    } else out[key] = value;
  }
  return out;
}
