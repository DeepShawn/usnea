// SPDX-License-Identifier: Apache-2.0
import {
  bindComponent,
  growComponent,
  initComponent,
  resetComponent,
  unbindComponent,
} from "./component.js";
import { usneaError } from "./errors.js";
import { IdRegistry } from "./ids.js";
import { QueryCache, type QuerySet, type SlotState } from "./query.js";
import { Slots } from "./slots.js";
import type {
  AnyComponent,
  ComponentDef,
  ComponentValues,
  Entities,
  Entity,
  EntityHandle,
  Schema,
} from "./types.js";

/** Internal: entity slots, generations, structural changes, handles, scene ids and queries. */
export class WorldBase {
  static readonly INITIAL_CAPACITY = 1024;

  readonly state: SlotState;
  /** Set by the kernel: 1 for components in the visible set. */
  visible = new Uint8Array(0);
  /** True when a structural change touched a visible component since last reset. */
  structuralDirty = false;
  /** True while a logic step runs; slots are released only at its end. */
  inStep = false;

  private readonly slots: Slots;
  private readonly ids = new IdRegistry();
  private readonly compIndex = new Map<AnyComponent, number>();
  private readonly queries: QueryCache;

  constructor(readonly components: readonly AnyComponent[]) {
    const cap = WorldBase.INITIAL_CAPACITY;
    this.state = { alive: new Uint8Array(cap), present: [], next: 1, capacity: cap };
    this.slots = new Slots(this.state);
    this.queries = new QueryCache(components.length, this.state);
    const bound: AnyComponent[] = [];
    try {
      components.forEach((c, i) => {
        bindComponent(c, this, cap);
        bound.push(c);
        this.compIndex.set(c, i);
        this.state.present.push(new Uint8Array(cap));
      });
    } catch (error) {
      for (const c of bound) unbindComponent(c, this);
      throw error;
    }
  }

  /** Index of a registered component; throws USN-E003 otherwise. */
  indexOf(component: AnyComponent): number {
    const i = this.compIndex.get(component);
    if (i === undefined) {
      throw usneaError(
        "USN-E003",
        `Component "${component?.$name}" is not registered with this app`,
        "world",
        "add it to the components list of the app or plugin",
      );
    }
    return i;
  }

  spawn(): Entity {
    const e = this.slots.alloc((cap) => {
      this.state.present = this.state.present.map((p) => {
        const n = new Uint8Array(cap);
        n.set(p);
        return n;
      });
      for (const c of this.components) growComponent(c, cap);
      this.queries.grow(cap);
    });
    this.queries.onSpawn(e);
    return e;
  }

  isAlive(entity: Entity): boolean {
    return this.slots.isAlive(entity);
  }

  private requireAlive(entity: Entity, where: string): void {
    if (!this.isAlive(entity)) {
      throw usneaError(
        "USN-E005",
        `Entity ${entity} is not alive`,
        where,
        "check world.isAlive(entity) or resolve a handle first",
      );
    }
  }

  despawn(entity: Entity): void {
    if (!this.isAlive(entity)) return;
    const { present } = this.state;
    for (let c = 0; c < this.components.length; c++) {
      const p = present[c] as Uint8Array;
      if (p[entity] === 1) {
        resetComponent(this.components[c] as AnyComponent, entity);
        p[entity] = 0;
        if (this.visible[c] === 1) this.structuralDirty = true;
      }
    }
    this.queries.onDespawn(entity);
    this.slots.kill(entity);
    this.setEntityId(entity, undefined);
  }

  add<S extends Schema>(
    entity: Entity,
    component: ComponentDef<S>,
    values?: ComponentValues<S>,
  ): void {
    const c = this.indexOf(component);
    this.requireAlive(entity, "world.add");
    initComponent(component, entity, values as ComponentValues<Schema> | undefined);
    const p = this.state.present[c] as Uint8Array;
    if (p[entity] !== 1) {
      p[entity] = 1;
      this.queries.onChange(c, entity);
    }
    if (this.visible[c] === 1) this.structuralDirty = true;
  }

  remove(entity: Entity, component: AnyComponent): void {
    const c = this.indexOf(component);
    const p = this.state.present[c] as Uint8Array;
    if (!this.isAlive(entity) || p[entity] !== 1) return;
    resetComponent(component, entity);
    p[entity] = 0;
    this.queries.onChange(c, entity);
    if (this.visible[c] === 1) this.structuralDirty = true;
  }

  has(entity: Entity, component: AnyComponent): boolean {
    return this.state.present[this.indexOf(component)]?.[entity] === 1;
  }

  handle(entity: Entity): EntityHandle {
    this.requireAlive(entity, "world.handle");
    return this.slots.handle(entity);
  }

  resolve(handle: EntityHandle): Entity {
    return this.slots.resolve(handle);
  }

  find(id: string): Entity {
    const e = this.ids.find(id);
    return this.isAlive(e) ? e : 0;
  }

  /** Internal: sets or clears (undefined) the scene id used by `find`. */
  setEntityId(entity: Entity, id: string | undefined): void {
    if (id !== undefined) this.requireAlive(entity, "setEntityId");
    this.ids.set(entity, id);
  }

  entityId(entity: Entity): string | undefined {
    return this.ids.get(entity);
  }

  /** Internal: the cached query set for a signature. */
  querySet(include: readonly AnyComponent[], without: readonly AnyComponent[] = []): QuerySet {
    return this.queries.get(
      include.map((c) => this.indexOf(c)),
      without.map((c) => this.indexOf(c)),
    );
  }

  query(components: readonly AnyComponent[], without?: readonly AnyComponent[]): Entities {
    return this.querySet(components, without).view();
  }

  releaseFreed(): void {
    this.slots.release();
  }

  /** Internal: despawns everything; outside a step also restarts slot numbering at 1. */
  despawnAll(): void {
    for (let e = 1; e < this.state.next; e++) this.despawn(e);
    if (this.inStep) return;
    this.slots.restart();
  }

  /** Internal: zeroes and unbinds every component. */
  dispose(): void {
    for (const c of this.components) unbindComponent(c, this);
  }
}
