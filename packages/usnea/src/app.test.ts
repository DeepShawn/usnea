// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { defineComponent } from "./component.js";
import { UsneaError } from "./errors.js";
import { defineEvent, RawInput } from "./events.js";
import { f32, u32 } from "./fields.js";
import { definePlugin } from "./plugin.js";
import { defineResource, Time } from "./resources.js";
import { defineSystem } from "./system.js";
import { FakePlatform } from "./test-support/fake-platform.js";
import type { App, PlatformEvent } from "./types.js";

const Pos = defineComponent("Pos", { x: f32 });
const Noise = defineComponent("Noise", { n: u32, keys: u32 });

const apps: App[] = [];
afterEach(() => {
  for (const a of apps.splice(0)) a.dispose();
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof UsneaError ? e.code : "other";
  }
  return undefined;
}

function drawSystem(counter: { n: number }) {
  return defineSystem({
    name: "draw",
    phase: "render",
    query: [Pos],
    run() {
      counter.n += 1;
    },
  });
}

describe("manual stepping", () => {
  it("12. runs without a platform and draws only when dirty", () => {
    const draws = { n: 0 };
    const received: PlatformEvent[] = [];
    const mover = defineSystem({
      name: "mover",
      query: [Pos],
      writes: [Pos],
      run(w, _dt, es) {
        received.push(...w.read(RawInput));
        for (const e of es) Pos.x[e] += 1;
        return es.length > 0 && Pos.x[es[0] as number] < 3;
      },
    });
    const app = createApp({ components: [Pos], systems: [mover, drawSystem(draws)] });
    apps.push(app);
    const e = app.world.spawn();
    app.world.add(e, Pos);
    app.step();
    expect(app.stats.steps).toBe(1);
    expect(app.stats.renders).toBe(1);
    app.step(2);
    expect(app.stats.steps).toBe(3);
    expect(app.stats.renders).toBe(2);
    app.step(); // x reaches 3 on the step before, so this one returns false
    const renders = app.stats.renders;
    expect(Pos.x[e]).toBe(4);
    app.step();
    app.step();
    expect(app.stats.renders).toBe(renders); // mover returns false: clean steps do not draw
    expect(draws.n).toBe(app.stats.renders);
    expect(app.world.res(Time).alpha).toBe(1);
    const key = { type: "key", code: "Q", down: true, repeat: false } as const;
    app.inject(key);
    expect(received).toEqual([]);
    app.step();
    expect(received).toEqual([key]);
    app.step();
    expect(received).toEqual([key]);
  });

  it("does not draw or count renders without render systems", () => {
    const app = createApp({ components: [Pos], alwaysRender: true });
    apps.push(app);
    app.step(3);
    expect(app.stats.renders).toBe(0);
    expect(app.stats.steps).toBe(3);
  });
});

describe("determinism", () => {
  const Rolls = defineComponent("Rolls", { sum: f32, keys: f32 });
  const roller = defineSystem({
    name: "roller",
    query: [Rolls],
    writes: [Rolls],
    run(w, _dt, es) {
      const keys = w.read(RawInput).length;
      for (const e of es) {
        Rolls.sum[e] += w.rng.next();
        Rolls.keys[e] += keys * w.rng.int(10);
      }
    },
  });
  const key = (code: string): PlatformEvent => ({ type: "key", code, down: true, repeat: false });
  const script = new Map<number, PlatformEvent>([
    [5, key("A")],
    [77, key("B")],
    [200, key("C")],
  ]);

  function run(seed: number, replay?: App["recording"] extends () => infer R ? R : never) {
    const app = createApp({ components: [Rolls], systems: [roller], seed, record: true });
    const e = app.world.spawn();
    app.world.add(e, Rolls);
    const events = replay ? new Map(replay.events.map((x) => [x.step, x.event])) : script;
    for (let i = 0; i < 300; i++) {
      const ev = events.get(i);
      if (ev) app.inject(ev);
      app.step();
    }
    const out = { snap: app.world.snapshot(), rec: app.recording() };
    app.dispose();
    return out;
  }

  it("13. same seed and events give equal state; replay equals; other seed differs", () => {
    const a = run(7);
    const b = run(7);
    expect(a.snap).toEqual(b.snap);
    expect(a.rec.events.map((x) => x.step)).toEqual([5, 77, 200]);
    expect(a.rec.steps).toBe(300);
    expect(a.rec.seed).toBe(7);
    const c = run(7, a.rec);
    expect(c.snap).toEqual(a.snap);
    expect(run(8).snap).not.toEqual(a.snap);
  });
});

describe("plugins and scenes", () => {
  it("14. registers plugin contents, calls setup in order, loads scenes", async () => {
    const Ping = defineEvent<number>("Ping");
    const Counter = defineResource("Counter", () => ({ n: 0 }));
    const order: string[] = [];
    const draws = { n: 0 };
    const sys = defineSystem({
      name: "pinger",
      run(w) {
        w.emit(Ping, 1);
        w.res(Counter).n += w.read(Ping).length;
        return false;
      },
    });
    const a = definePlugin({
      name: "a",
      components: [Pos],
      systems: [sys],
      events: [Ping],
      resources: [Counter],
      setup: () => void order.push("a"),
    });
    const b = definePlugin({
      name: "b",
      systems: [drawSystem(draws)],
      setup: (app) => void order.push(`b:${app.world.res(Counter).n}`),
    });
    const app = createApp({ plugins: [a, b], components: [Noise] });
    apps.push(app);
    expect(order).toEqual(["a", "b:0"]);
    app.step();
    expect(app.world.res(Counter).n).toBe(1);
    expect(app.stats.renders).toBe(0);
    await app.loadScene({
      usnea: "0.1",
      name: "s",
      plugins: ["a", "b"],
      entities: [{ components: { Pos: { x: 3 } } }, { components: { Noise: { n: 2 } } }],
    });
    expect(app.world.snapshot().entities.length).toBe(2);
    app.step();
    expect(app.stats.renders).toBe(1);
    expect(draws.n).toBe(1);
    expect(Object.keys(app.sceneSchema()).length).toBeGreaterThan(0);
  });

  it("duplicate plugin name is USN-E009", () => {
    expect(codeOf(() => createApp({ plugins: [{ name: "x" }, { name: "x" }] }))).toBe("USN-E009");
  });
});

describe("errors and lifecycle", () => {
  it("15. start without platform is E021; recording without record is E022", () => {
    const app = createApp();
    apps.push(app);
    expect(codeOf(() => app.start())).toBe("USN-E021");
    expect(codeOf(() => app.recording())).toBe("USN-E022");
  });

  it("15. use after dispose is E023 and components can be reused", () => {
    const app = createApp({ components: [Pos], platform: new FakePlatform() });
    app.dispose();
    app.dispose();
    expect(codeOf(() => app.step())).toBe("USN-E023");
    expect(codeOf(() => app.start())).toBe("USN-E023");
    expect(codeOf(() => app.stop())).toBe("USN-E023");
    expect(codeOf(() => app.inject({ type: "wheel", dx: 0, dy: 0 }))).toBe("USN-E023");
    expect(codeOf(() => app.sceneSchema())).toBe("USN-E023");
    expect(codeOf(() => app.loadScene({ usnea: "0.1", name: "x", entities: [] }))).toBe("USN-E023");
    expect(codeOf(() => app.recording())).toBe("USN-E023");
    expect(codeOf(() => app.world.wake())).toBe("USN-E023");
    const again = createApp({ components: [Pos] });
    apps.push(again);
    const e = again.world.spawn();
    again.world.add(e, Pos, { x: 2 });
    expect(Pos.x[e]).toBe(2);
  });

  it("recording returns a copy with step count", () => {
    const app = createApp({ record: true, step: 0.5 });
    apps.push(app);
    app.inject({ type: "wheel", dx: 1, dy: 0 });
    app.step(2);
    const r = app.recording();
    expect(r).toMatchObject({ usnea: "0.1", seed: 1, step: 0.5, steps: 2 });
    expect(r.events).toEqual([{ step: 0, event: { type: "wheel", dx: 1, dy: 0 } }]);
    expect(r.events).not.toBe(app.recording().events);
  });
});
