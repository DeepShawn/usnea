// SPDX-License-Identifier: Apache-2.0
//
// INTERNAL kernel API (not exported from index.ts); app.ts and loop.ts build on it.
//
//   const kernel = createKernel({ components, systems, events, resources, seed, step });
//
//   kernel.world          World implementation (also exposes WorldBase internals)
//   kernel.time           the Time resource (mutable TimeState)
//   kernel.runLogicStep() runs input, fixed, update; clears events; releases freed slots;
//                         Time.step += 1, Time.elapsed = step * dt. Returns a REUSED
//                         { awake, dirty } object: copy the values before the next call.
//                         Flags of structural changes made between steps count toward
//                         the next step.
//   kernel.runRenderPhase() runs render systems with dt = Time.dt (no tracking)
//   kernel.setEntityId(e, id | undefined), kernel.entityId(e)   scene ids for world.find
//   kernel.despawnAll()   despawns all entities; outside a step, slot numbering restarts at 1
//   kernel.takeWake() / takeWakeAfter() / takeRenderRequest()
//                         consume the flags set by world.wake(), world.wakeAfter() (smallest
//                         pending delay in seconds, Infinity if none) and world.requestRender()
//   kernel.setHooks({ instantiate, snapshot })   wires world.instantiate and world.snapshot
//   kernel.hasRenderSystems, kernel.order(phase) (system names in run order)
//   kernel.dispose()      unbinds and zeroes component storage
import { usneaError } from "./errors.js";
import { EventBus } from "./events.js";
import { type KernelHooks, KernelWorld } from "./kernel-world.js";
import { ResourceStore, Time } from "./resources.js";
import { Schedule } from "./schedule.js";
import type {
  AnyComponent,
  Entity,
  EventDef,
  Phase,
  ResourceDef,
  SystemDef,
  TimeState,
} from "./types.js";

export { type KernelHooks, KernelWorld } from "./kernel-world.js";

/** Internal: inputs of `createKernel`. */
export interface KernelConfig {
  readonly components?: readonly AnyComponent[];
  readonly systems?: readonly SystemDef[];
  readonly events?: readonly EventDef<unknown>[];
  readonly resources?: readonly ResourceDef<unknown>[];
  /** Seed for `world.rng`; defaults to 1. */
  readonly seed?: number;
  /** Fixed logic step in seconds; defaults to 1/60. */
  readonly step?: number;
}

/** Internal: result of a logic step (the object is reused). */
export interface StepResult {
  awake: boolean;
  dirty: boolean;
}

/** Internal: the kernel handle returned by `createKernel`. */
export interface Kernel {
  readonly world: KernelWorld;
  readonly time: TimeState;
  readonly hasRenderSystems: boolean;
  runLogicStep(): StepResult;
  runRenderPhase(): void;
  setEntityId(entity: Entity, id: string | undefined): void;
  entityId(entity: Entity): string | undefined;
  despawnAll(): void;
  takeWake(): boolean;
  takeWakeAfter(): number;
  takeRenderRequest(): boolean;
  setHooks(hooks: KernelHooks): void;
  order(phase: Phase): string[];
  dispose(): void;
}

function dedupeComponents(list: readonly AnyComponent[]): AnyComponent[] {
  const byName = new Map<string, AnyComponent>();
  for (const c of list) {
    const other = byName.get(c.$name);
    if (other !== undefined && other !== c) {
      throw usneaError(
        "USN-E001",
        `Duplicate component name "${c.$name}"`,
        "component registration",
        "give each component definition a unique name",
      );
    }
    byName.set(c.$name, c);
  }
  return [...byName.values()];
}

/** Internal: builds a world, schedule, events and resources and returns the kernel handle. */
export function createKernel(config: KernelConfig = {}): Kernel {
  const events = new EventBus(config.events ?? []);
  const resources = new ResourceStore(config.resources ?? []);
  const world = new KernelWorld(
    dedupeComponents(config.components ?? []),
    config.seed ?? 1,
    events,
    resources,
  );
  let schedule: Schedule;
  try {
    schedule = new Schedule(config.systems ?? [], world);
  } catch (error) {
    world.dispose();
    throw error;
  }
  const time = resources.get(Time);
  time.dt = config.step ?? 1 / 60;
  const result: StepResult = { awake: false, dirty: false };

  return {
    world,
    time,
    hasRenderSystems: schedule.hasPhase("render"),
    runLogicStep() {
      world.inStep = true;
      try {
        schedule.run("input", world, time.dt, true);
        schedule.run("fixed", world, time.dt, true);
        schedule.run("update", world, time.dt, true);
      } finally {
        world.inStep = false;
      }
      events.clear();
      world.releaseFreed();
      time.step += 1;
      time.elapsed = time.step * time.dt;
      result.awake = schedule.awake || world.stepAwake;
      result.dirty = schedule.dirty || world.structuralDirty || world.stepDirty;
      schedule.awake = schedule.dirty = false;
      world.stepAwake = world.stepDirty = world.structuralDirty = false;
      return result;
    },
    runRenderPhase() {
      schedule.run("render", world, time.dt, false);
    },
    setEntityId: (entity, id) => world.setEntityId(entity, id),
    entityId: (entity) => world.entityId(entity),
    despawnAll: () => world.despawnAll(),
    takeWake() {
      const v = world.wakeFlag;
      world.wakeFlag = false;
      return v;
    },
    takeWakeAfter() {
      const v = world.wakeDelay;
      world.wakeDelay = Number.POSITIVE_INFINITY;
      return v;
    },
    takeRenderRequest() {
      const v = world.renderFlag;
      world.renderFlag = false;
      return v;
    },
    setHooks(hooks) {
      world.hooks = { ...world.hooks, ...hooks };
    },
    order: (phase) => schedule.order(phase),
    dispose: () => world.dispose(),
  };
}
