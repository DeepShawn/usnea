// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { defineComponent } from "./component.js";
import { UsneaError } from "./errors.js";
import { defineEvent } from "./events.js";
import { bool, f32, i32, str } from "./fields.js";
import { createKernel } from "./kernel.js";
import { Time } from "./resources.js";
import { createRng } from "./rng.js";
import { defineSystem } from "./system.js";

const Position = defineComponent("Position", { x: f32, y: f32 });
const Velocity = defineComponent("Velocity", { x: f32, y: f32 });

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof UsneaError ? e.code : "other";
  }
  return undefined;
}

describe("PLAN 4.2 example", () => {
  it("moves an entity", () => {
    const movement = defineSystem({
      name: "movement",
      query: [Position, Velocity],
      writes: [Position],
      run(_world, dt, entities) {
        for (const e of entities) {
          Position.x[e] += Velocity.x[e] * dt;
          Position.y[e] += Velocity.y[e] * dt;
        }
      },
    });
    const k = createKernel({ components: [Position, Velocity], systems: [movement], step: 0.5 });
    const e = k.world.spawn();
    k.world.add(e, Position, { x: 1 });
    k.world.add(e, Velocity, { x: 2, y: 4 });
    k.runLogicStep();
    expect(Position.x[e]).toBe(2);
    expect(Position.y[e]).toBe(2);
    expect(k.world.res(Time).step).toBe(1);
    expect(k.world.res(Time).elapsed).toBe(0.5);
    k.dispose();
  });
});

describe("fields and storage", () => {
  const C = defineComponent("C", {
    n: f32.default(5),
    flag: bool.default(true),
    name: str.default("hi"),
    k: i32,
  });

  it("applies defaults, resets on re-add and on remove", () => {
    const k = createKernel({ components: [C] });
    const e = k.world.spawn();
    k.world.add(e, C);
    expect([C.n[e], C.flag[e], C.name[e], C.k[e]]).toEqual([5, 1, "hi", 0]);
    k.world.add(e, C, { n: 1, flag: false, name: "x", k: -3 });
    expect([C.n[e], C.flag[e], C.name[e], C.k[e]]).toEqual([1, 0, "x", -3]);
    k.world.add(e, C, { k: 9 });
    expect([C.n[e], C.flag[e], C.name[e], C.k[e]]).toEqual([5, 1, "hi", 9]);
    k.world.add(e, C, { n: 2, name: "y", flag: false });
    k.world.remove(e, C);
    expect([C.n[e], C.flag[e], C.name[e]]).toEqual([5, 1, "hi"]);
    expect(k.world.has(e, C)).toBe(false);
    k.dispose();
  });

  it("grows beyond 1024 keeping data and equal capacities", () => {
    const k = createKernel({ components: [Position, C] });
    const list: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const e = k.world.spawn();
      k.world.add(e, Position, { x: i });
      k.world.add(e, C, { name: `n${i}` });
      list.push(e);
    }
    list.forEach((e, i) => {
      expect(Position.x[e]).toBe(i);
      expect(C.name[e]).toBe(`n${i}`);
    });
    expect(Position.x.length).toBe(4096);
    expect(new Set([Position.y.length, C.n.length, C.name.length, C.flag.length])).toEqual(
      new Set([4096]),
    );
    k.dispose();
  });

  it("binds to one kernel at a time (USN-E004)", () => {
    const a = createKernel({ components: [Position] });
    expect(codeOf(() => createKernel({ components: [Position] }))).toBe("USN-E004");
    a.world.add(a.world.spawn(), Position, { x: 3 });
    a.dispose();
    expect(Position.x[1]).toBe(0);
    const b = createKernel({ components: [Position] });
    b.dispose();
  });

  it("rejects duplicate component names and unregistered components", () => {
    const Other = defineComponent("Position", { z: f32 });
    expect(codeOf(() => createKernel({ components: [Position, Other] }))).toBe("USN-E001");
    const k = createKernel({ components: [Position] });
    expect(codeOf(() => k.world.add(k.world.spawn(), Velocity))).toBe("USN-E003");
    expect(codeOf(() => defineComponent("Bad", { $x: f32 }))).toBe("USN-E002");
    k.dispose();
  });
});

describe("handles and slots", () => {
  it("resolves to 0 after despawn and after reuse", () => {
    const k = createKernel({ components: [Position] });
    const e = k.world.spawn();
    const h = k.world.handle(e);
    expect(k.world.resolve(h)).toBe(e);
    k.world.despawn(e);
    expect(k.world.resolve(h)).toBe(0);
    expect(k.world.isAlive(e)).toBe(false);
    k.runLogicStep();
    const e2 = k.world.spawn();
    expect(e2).toBe(e);
    expect(k.world.resolve(h)).toBe(0);
    expect(k.world.resolve(k.world.handle(e2))).toBe(e2);
    expect(codeOf(() => k.world.handle(999))).toBe("USN-E005");
    k.dispose();
  });

  it("does not reuse a slot within the logic step", () => {
    let spawned = 0;
    let victim = 0;
    const sys = defineSystem({
      name: "s",
      run(world) {
        world.despawn(victim);
        spawned = world.spawn();
      },
    });
    const k = createKernel({ systems: [sys] });
    victim = k.world.spawn();
    k.runLogicStep();
    expect(spawned).not.toBe(victim);
    expect(k.world.spawn()).toBe(victim);
    k.dispose();
  });

  it("finds entities by scene id", () => {
    const k = createKernel({});
    const e = k.world.spawn();
    k.setEntityId(e, "hero");
    expect(k.world.find("hero")).toBe(e);
    k.world.despawn(e);
    expect(k.world.find("hero")).toBe(0);
    k.dispose();
  });

  it("despawnAll restarts numbering", () => {
    const k = createKernel({});
    k.world.spawn();
    k.world.spawn();
    k.despawnAll();
    expect(k.world.spawn()).toBe(1);
    k.dispose();
  });
});

describe("queries", () => {
  it("tracks add, remove, despawn and without", () => {
    const k = createKernel({ components: [Position, Velocity] });
    const w = k.world;
    const a = w.spawn();
    const b = w.spawn();
    w.add(a, Position);
    w.add(b, Position);
    w.add(b, Velocity);
    expect([...w.query([Position])].sort()).toEqual([a, b]);
    expect([...w.query([Position], [Velocity])]).toEqual([a]);
    w.remove(b, Velocity);
    expect([...w.query([Position], [Velocity])].sort()).toEqual([a, b]);
    w.despawn(a);
    expect([...w.query([Position])]).toEqual([b]);
    expect([...w.query([])]).toEqual([b]);
    k.dispose();
  });

  it("gives running systems a snapshot", () => {
    const seen: number[] = [];
    const sys = defineSystem({
      name: "s",
      query: [Position],
      run(world, _dt, entities) {
        for (const e of entities) {
          seen.push(e);
          world.remove(e, Position);
        }
        world.add(world.spawn(), Position);
      },
    });
    const k = createKernel({ components: [Position], systems: [sys] });
    k.world.add(k.world.spawn(), Position);
    k.world.add(k.world.spawn(), Position);
    k.runLogicStep();
    expect(seen.length).toBe(2);
    expect(k.world.query([Position]).length).toBe(1);
    k.dispose();
  });
});

describe("ordering", () => {
  const log: string[] = [];
  const mk = (name: string, extra: Partial<Parameters<typeof defineSystem>[0]> = {}) =>
    defineSystem({ name, run: () => void log.push(name), ...extra });
  const orderOf = (systems: ReturnType<typeof mk>[]) => {
    const k = createKernel({ components: [Position, Velocity], systems });
    const o = k.order("update");
    k.dispose();
    return o;
  };

  it("runs writers before readers regardless of registration", () => {
    const reader = mk("reader", { reads: [Position] });
    const writer = mk("writer", { writes: [Position] });
    expect(orderOf([reader, writer])).toEqual(["writer", "reader"]);
  });

  it("falls back to registration order on mutual read/write", () => {
    const a = mk("a", { writes: [Position], reads: [Velocity] });
    const b = mk("b", { writes: [Velocity], reads: [Position] });
    expect(orderOf([b, a])).toEqual(["b", "a"]);
    expect(orderOf([a, b])).toEqual(["a", "b"]);
  });

  it("honours explicit before/after over rule 2", () => {
    const reader = mk("reader", { reads: [Position], before: ["writer"] });
    const writer = mk("writer", { writes: [Position] });
    expect(orderOf([writer, reader])).toEqual(["reader", "writer"]);
    const x = mk("x", { after: ["y"] });
    const y = mk("y");
    expect(orderOf([x, y])).toEqual(["y", "x"]);
  });

  it("throws USN-E007 on explicit cycles and USN-E008 on unknown names", () => {
    const a = mk("a", { before: ["b"] });
    const b = mk("b", { before: ["a"] });
    expect(codeOf(() => orderOf([a, b]))).toBe("USN-E007");
    expect(codeOf(() => orderOf([mk("a", { after: ["nope"] })]))).toBe("USN-E008");
    expect(codeOf(() => orderOf([mk("a", { after: ["r"] }), mk("r", { phase: "render" })]))).toBe(
      "USN-E008",
    );
    expect(codeOf(() => orderOf([mk("a"), mk("a")]))).toBe("USN-E006");
  });
});

describe("dispatch", () => {
  it("skips empty queries and always runs systems without a query", () => {
    let withQuery = 0;
    let without = 0;
    const q = defineSystem({ name: "q", query: [Position], run: () => void withQuery++ });
    const n = defineSystem({
      name: "n",
      run: (_w, _dt, entities) => {
        without++;
        expect(entities.length).toBe(0);
      },
    });
    const k = createKernel({ components: [Position], systems: [q, n] });
    k.runLogicStep();
    expect([withQuery, without]).toEqual([0, 1]);
    k.world.add(k.world.spawn(), Position);
    k.runLogicStep();
    expect([withQuery, without]).toEqual([1, 2]);
    k.dispose();
  });

  it("reuses the snapshot buffer while the count is unchanged", () => {
    const buffers: unknown[] = [];
    const s = defineSystem({
      name: "s",
      query: [Position],
      run: (_w, _d, e) => void buffers.push(e),
    });
    const k = createKernel({ components: [Position], systems: [s] });
    k.world.add(k.world.spawn(), Position);
    k.runLogicStep();
    k.runLogicStep();
    expect(buffers[0]).toBe(buffers[1]);
    k.dispose();
  });

  it("tracks awake and dirty", () => {
    const Hidden = defineComponent("Hidden", { v: f32 });
    const render = defineSystem({
      name: "draw",
      phase: "render",
      query: [Position],
      run: () => {},
    });
    let result: boolean | undefined;
    const sys = (writes: (typeof Position)[] | (typeof Hidden)[]) =>
      defineSystem({ name: "w", writes, run: () => result });
    const run = (s: ReturnType<typeof sys>) => {
      const k = createKernel({ components: [Position, Hidden], systems: [render, s] });
      const r = { ...k.runLogicStep() };
      k.dispose();
      return r;
    };
    result = undefined;
    expect(run(sys([Position]))).toEqual({ awake: true, dirty: true });
    expect(run(sys([Hidden]))).toEqual({ awake: true, dirty: false });
    result = false;
    expect(run(sys([Position]))).toEqual({ awake: false, dirty: false });
  });

  it("marks structural changes of visible components dirty and supports wake flags", () => {
    const Hidden = defineComponent("Hidden2", { v: f32 });
    const render = defineSystem({
      name: "draw",
      phase: "render",
      reads: [Position],
      run: () => {},
    });
    const k = createKernel({ components: [Position, Hidden], systems: [render] });
    const e = k.world.spawn();
    k.world.add(e, Hidden);
    expect(k.runLogicStep()).toEqual({ awake: false, dirty: false });
    k.world.add(e, Position);
    expect(k.runLogicStep().dirty).toBe(true);
    k.world.remove(e, Position);
    expect(k.runLogicStep().dirty).toBe(true);
    k.world.wake();
    k.world.wakeAfter(2);
    k.world.wakeAfter(1);
    k.world.requestRender();
    expect([k.takeWake(), k.takeWakeAfter(), k.takeRenderRequest()]).toEqual([true, 1, true]);
    expect([k.takeWake(), k.takeWakeAfter(), k.takeRenderRequest()]).toEqual([
      false,
      Number.POSITIVE_INFINITY,
      false,
    ]);
    k.dispose();
  });
});

describe("events and rng", () => {
  it("reads events during the step and clears them afterwards", () => {
    const Ping = defineEvent<number>("Ping");
    const got: number[][] = [];
    const emitter = defineSystem({ name: "a", run: (w) => void w.emit(Ping, 7) });
    const reader = defineSystem({
      name: "b",
      after: ["a"],
      run: (w) => void got.push([...w.read(Ping)]),
    });
    const k = createKernel({ events: [Ping], systems: [emitter, reader] });
    k.runLogicStep();
    expect(got).toEqual([[7]]);
    expect(k.world.read(Ping)).toEqual([]);
    expect(codeOf(() => k.world.emit(defineEvent<number>("X"), 1))).toBe("USN-E010");
    k.dispose();
  });

  it("is reproducible for a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(seqA).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createRng(43).next()).not.toBe(seqA[0]);
    expect(createRng(1).int(10)).toBeLessThan(10);
  });

  it("world.instantiate and snapshot throw until wired", () => {
    const k = createKernel({});
    expect(() => k.world.snapshot()).toThrow(/not wired/);
    k.setHooks({ snapshot: () => ({ step: 0, entities: [] }) });
    expect(k.world.snapshot().step).toBe(0);
    k.dispose();
  });
});
