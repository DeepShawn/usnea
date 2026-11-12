// SPDX-License-Identifier: Apache-2.0
import type { Entities } from "./types.js";

/** Internal: slot state shared between the world and its query cache. */
export interface SlotState {
  alive: Uint8Array;
  /** Per component index: 1 where the entity has the component. */
  present: Uint8Array[];
  /** Next never-used slot index. */
  next: number;
  capacity: number;
}

/** Internal: a sparse set of the entities matching one query signature. */
export class QuerySet {
  dense: Uint32Array;
  sparse: Int32Array;
  count = 0;

  constructor(
    readonly include: readonly number[],
    readonly exclude: readonly number[],
    capacity: number,
  ) {
    this.dense = new Uint32Array(capacity);
    this.sparse = new Int32Array(capacity).fill(-1);
  }

  add(e: number): void {
    if ((this.sparse[e] as number) >= 0) return;
    this.sparse[e] = this.count;
    this.dense[this.count++] = e;
  }

  remove(e: number): void {
    const i = this.sparse[e] as number;
    if (i < 0) return;
    const last = this.dense[--this.count] as number;
    this.dense[i] = last;
    this.sparse[last] = i;
    this.sparse[e] = -1;
  }

  grow(capacity: number): void {
    const dense = new Uint32Array(capacity);
    dense.set(this.dense);
    const sparse = new Int32Array(capacity).fill(-1);
    sparse.set(this.sparse);
    this.dense = dense;
    this.sparse = sparse;
  }

  /** A view over the dense array; its length is fixed when called. */
  view(): Entities {
    return this.dense.subarray(0, this.count);
  }
}

/** Internal: queries cached by signature and updated incrementally. */
export class QueryCache {
  private readonly sets: QuerySet[] = [];
  private readonly byKey = new Map<string, QuerySet>();
  private readonly byComp: QuerySet[][];
  private readonly universal: QuerySet[] = [];

  constructor(
    componentCount: number,
    private readonly state: SlotState,
  ) {
    this.byComp = Array.from({ length: componentCount }, () => []);
  }

  get(include: readonly number[], exclude: readonly number[]): QuerySet {
    const inc = [...new Set(include)].sort((a, b) => a - b);
    const exc = [...new Set(exclude)].sort((a, b) => a - b);
    const key = `${inc.join(",")}|${exc.join(",")}`;
    let set = this.byKey.get(key);
    if (set) return set;
    set = new QuerySet(inc, exc, this.state.capacity);
    this.byKey.set(key, set);
    this.sets.push(set);
    for (const c of new Set([...inc, ...exc])) this.byComp[c]?.push(set);
    if (inc.length === 0) this.universal.push(set);
    for (let e = 1; e < this.state.next; e++) this.refresh(set, e);
    return set;
  }

  private refresh(set: QuerySet, e: number): void {
    let match = this.state.alive[e] === 1;
    for (let i = 0; match && i < set.include.length; i++) {
      match = this.state.present[set.include[i] as number]?.[e] === 1;
    }
    for (let i = 0; match && i < set.exclude.length; i++) {
      match = this.state.present[set.exclude[i] as number]?.[e] !== 1;
    }
    if (match) set.add(e);
    else set.remove(e);
  }

  /** Call after `present` changed for component `c` on entity `e`. */
  onChange(c: number, e: number): void {
    for (const set of this.byComp[c] as QuerySet[]) this.refresh(set, e);
  }

  onSpawn(e: number): void {
    for (const set of this.universal) this.refresh(set, e);
  }

  onDespawn(e: number): void {
    for (const set of this.sets) set.remove(e);
  }

  grow(capacity: number): void {
    for (const set of this.sets) set.grow(capacity);
  }
}
