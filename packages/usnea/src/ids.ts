// SPDX-License-Identifier: Apache-2.0
import type { Entity } from "./types.js";

/** Internal: bidirectional registry of scene ids and entities. */
export class IdRegistry {
  private readonly byId = new Map<string, Entity>();
  private readonly byEntity = new Map<Entity, string>();

  /** Entity registered under `id`, or 0. */
  find(id: string): Entity {
    return this.byId.get(id) ?? 0;
  }

  get(entity: Entity): string | undefined {
    return this.byEntity.get(entity);
  }

  /** Sets the entity's id, replacing its old one; `undefined` clears it. */
  set(entity: Entity, id: string | undefined): void {
    const old = this.byEntity.get(entity);
    if (old !== undefined) {
      this.byEntity.delete(entity);
      if (this.byId.get(old) === entity) this.byId.delete(old);
    }
    if (id === undefined) return;
    this.byId.set(id, entity);
    this.byEntity.set(entity, id);
  }
}
