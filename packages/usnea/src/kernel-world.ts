// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "./errors.js";
import type { EventBus } from "./events.js";
import type { ResourceStore } from "./resources.js";
import { createRng } from "./rng.js";
import type {
  AnyComponent,
  Entity,
  EventDef,
  ResourceDef,
  Rng,
  SceneComponents,
  World,
  WorldSnapshot,
} from "./types.js";
import { WorldBase } from "./world.js";

/** Internal: functions the app wires into the world. */
export interface KernelHooks {
  instantiate?: (prefabPath: string, overrides?: SceneComponents) => Entity;
  snapshot?: () => WorldSnapshot;
}

function notWired(what: string): never {
  throw usneaError(
    "USN-E000",
    `${what} is not wired`,
    "kernel",
    "create the world through createApp(), which wires scenes",
  );
}

/** Internal: the World implementation. */
export class KernelWorld extends WorldBase implements World {
  readonly rng: Rng;
  hooks: KernelHooks = {};
  wakeFlag = false;
  wakeDelay = Number.POSITIVE_INFINITY;
  renderFlag = false;
  stepAwake = false;
  stepDirty = false;

  constructor(
    components: readonly AnyComponent[],
    seed: number,
    private readonly events: EventBus,
    private readonly resources: ResourceStore,
  ) {
    super(components);
    this.rng = createRng(seed);
  }

  instantiate(prefabPath: string, overrides?: SceneComponents): Entity {
    return (this.hooks.instantiate ?? (() => notWired("world.instantiate")))(prefabPath, overrides);
  }

  snapshot(): WorldSnapshot {
    return (this.hooks.snapshot ?? (() => notWired("world.snapshot")))();
  }

  emit<T>(event: EventDef<T>, payload: T): void {
    this.events.emit(event, payload);
  }

  read<T>(event: EventDef<T>): readonly T[] {
    return this.events.read(event);
  }

  res<T>(resource: ResourceDef<T>): T {
    return this.resources.get(resource);
  }

  wake(): void {
    this.wakeFlag = true;
    if (this.inStep) this.stepAwake = true;
  }

  wakeAfter(seconds: number): void {
    if (seconds >= 0 && seconds < this.wakeDelay) this.wakeDelay = seconds;
  }

  requestRender(): void {
    this.renderFlag = true;
    if (this.inStep) this.stepDirty = true;
  }
}
