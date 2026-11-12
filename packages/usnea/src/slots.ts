// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "./errors.js";
import type { SlotState } from "./query.js";
import type { Entity, EntityHandle } from "./types.js";

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
const GEN_MASK = 0xfff;

/** Internal: slot allocation, generations, deferred reuse and handle packing. */
export class Slots {
  private gen: Uint16Array;
  private freed: number[] = [];
  private free: number[] = [];

  constructor(readonly state: SlotState) {
    this.gen = new Uint16Array(state.capacity);
  }

  /** Allocates a slot; `grow(capacity)` is called first when storage must double. */
  alloc(grow: (capacity: number) => void): Entity {
    let e = this.free.pop();
    if (e === undefined) {
      e = this.state.next;
      if (e > INDEX_MASK) {
        throw usneaError(
          "USN-E024",
          "Too many entities: slot index exceeds 20 bits",
          "world.spawn",
          "despawn entities you no longer need",
        );
      }
      if (e >= this.state.capacity) {
        let cap = this.state.capacity;
        while (e >= cap) cap *= 2;
        const alive = new Uint8Array(cap);
        alive.set(this.state.alive);
        this.state.alive = alive;
        const gen = new Uint16Array(cap);
        gen.set(this.gen);
        this.gen = gen;
        grow(cap);
        this.state.capacity = cap;
      }
      this.state.next++;
    }
    this.state.alive[e] = 1;
    return e;
  }

  isAlive(entity: Entity): boolean {
    return this.state.alive[entity] === 1;
  }

  /** Marks the slot dead and bumps its generation; it is reusable after `release()`. */
  kill(entity: Entity): void {
    this.state.alive[entity] = 0;
    this.gen[entity] = ((this.gen[entity] as number) + 1) & GEN_MASK;
    this.freed.push(entity);
  }

  /** Makes slots killed so far reusable. */
  release(): void {
    for (const e of this.freed) this.free.push(e);
    this.freed.length = 0;
  }

  /** Forgets all free slots and restarts numbering at 1 (all entities must be dead). */
  restart(): void {
    this.freed.length = 0;
    this.free.length = 0;
    this.state.next = 1;
  }

  handle(entity: Entity): EntityHandle {
    return (((this.gen[entity] as number) << INDEX_BITS) | entity) >>> 0;
  }

  resolve(handle: EntityHandle): Entity {
    const e = handle & INDEX_MASK;
    if (e === 0 || this.state.alive[e] !== 1) return 0;
    return this.gen[e] === handle >>> INDEX_BITS ? e : 0;
  }
}
