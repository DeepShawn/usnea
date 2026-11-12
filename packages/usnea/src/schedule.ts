// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "./errors.js";
import { orderPhase } from "./order.js";
import type { QuerySet } from "./query.js";
import type { Entities, Phase, SystemDef, World } from "./types.js";
import type { WorldBase } from "./world.js";

const PHASES: readonly Phase[] = ["input", "fixed", "update", "render"];
const NONE: Entities = new Uint32Array(0);

interface Scheduled {
  readonly def: SystemDef;
  readonly set: QuerySet | undefined;
  readonly writesVisible: boolean;
  buf: Uint32Array;
  view: Uint32Array;
  viewCount: number;
}

/** Internal: ordered systems per phase, dispatch, and awake/dirty tracking. */
export class Schedule {
  /** True when a non-render system was active since the last reset. */
  awake = false;
  /** True when an active system wrote a visible component since the last reset. */
  dirty = false;
  private readonly phases: Record<Phase, Scheduled[]> = {
    input: [],
    fixed: [],
    update: [],
    render: [],
  };

  constructor(systems: readonly SystemDef[], world: WorldBase) {
    const names = new Map<string, Phase>();
    for (const s of systems) {
      if (names.has(s.name)) {
        throw usneaError(
          "USN-E006",
          `Duplicate system name "${s.name}"`,
          "system registration",
          "give each system a unique name",
        );
      }
      names.set(s.name, s.phase);
    }
    const visible = new Uint8Array(world.components.length);
    for (const s of systems) {
      if (s.phase !== "render") continue;
      for (const c of [...(s.query ?? []), ...(s.reads ?? [])]) visible[world.indexOf(c)] = 1;
    }
    world.visible = visible;
    for (const phase of PHASES) {
      const ordered = orderPhase(
        systems.filter((s) => s.phase === phase),
        names,
      );
      for (const def of ordered) {
        const buf = new Uint32Array(16);
        this.phases[phase].push({
          def,
          set: def.query || def.without ? world.querySet(def.query ?? [], def.without) : undefined,
          writesVisible: (def.writes ?? []).some((c) => visible[world.indexOf(c)] === 1),
          buf,
          view: buf.subarray(0, 0),
          viewCount: 0,
        });
        for (const c of def.reads ?? []) world.indexOf(c);
      }
    }
  }

  /** Names of the systems in a phase, in execution order. */
  order(phase: Phase): string[] {
    return this.phases[phase].map((s) => s.def.name);
  }

  hasPhase(phase: Phase): boolean {
    return this.phases[phase].length > 0;
  }

  /** Runs one phase; `track` records awake/dirty from the systems that stay active. */
  run(phase: Phase, world: World, dt: number, track: boolean): void {
    for (const s of this.phases[phase]) {
      let entities: Entities = NONE;
      if (s.set) {
        const n = s.set.count;
        if (n === 0) continue;
        if (n > s.buf.length) {
          s.buf = new Uint32Array(Math.max(n, s.buf.length * 2));
          s.viewCount = -1;
        }
        const { buf } = s;
        const dense = s.set.dense;
        for (let i = 0; i < n; i++) buf[i] = dense[i] as number;
        if (s.viewCount !== n) {
          s.view = s.buf.subarray(0, n);
          s.viewCount = n;
        }
        entities = s.view;
      }
      if (s.def.run(world, dt, entities) !== false && track) {
        this.awake = true;
        if (s.writesVisible) this.dirty = true;
      }
    }
  }
}
