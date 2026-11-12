// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { defineComponent } from "./component.js";
import { RawInput } from "./events.js";
import { f32 } from "./fields.js";
import { Time } from "./resources.js";
import { defineSystem } from "./system.js";
import { FakePlatform } from "./test-support/fake-platform.js";
import type { App, AppConfig } from "./types.js";

const Pos = defineComponent("Pos", { x: f32 });
const Hid = defineComponent("Hid", { v: f32 });

const apps: App[] = [];
afterEach(() => {
  for (const a of apps.splice(0)) a.dispose();
});

interface Rig {
  app: App;
  p: FakePlatform;
  ctl: { moving: boolean; hidden: boolean };
  alphas: number[];
  seen: number[];
}

function rig(
  opts: { interval?: number; systems?: boolean; config?: Partial<AppConfig> } = {},
): Rig {
  const p = new FakePlatform(opts.interval);
  const ctl = { moving: true, hidden: false };
  const alphas: number[] = [];
  const seen: number[] = [];
  const mover = defineSystem({
    name: "mover",
    query: [Pos],
    writes: [Pos],
    run(_w, dt, es) {
      if (!ctl.moving) return false;
      for (const e of es) Pos.x[e] += dt;
    },
  });
  const hiddenWriter = defineSystem({
    name: "hiddenWriter",
    query: [Hid],
    writes: [Hid],
    run(_w, _dt, es) {
      if (!ctl.hidden) return false;
      for (const e of es) Hid.v[e] += 1;
    },
  });
  const reader = defineSystem({
    name: "reader",
    run(w) {
      seen.push(w.read(RawInput).length);
      return false;
    },
  });
  const drawer = defineSystem({
    name: "drawer",
    phase: "render",
    query: [Pos],
    run(w) {
      alphas.push(w.res(Time).alpha);
    },
  });
  const app = createApp({
    platform: p,
    components: [Pos, Hid],
    systems: opts.systems === false ? [drawer] : [mover, hiddenWriter, reader, drawer],
    ...opts.config,
  });
  apps.push(app);
  const e = app.world.spawn();
  app.world.add(e, Pos);
  app.world.add(e, Hid);
  return { app, p, ctl, alphas, seen };
}

const key = { type: "key", code: "A", down: true, repeat: false } as const;

describe("idle behaviour", () => {
  it("1. static scene draws once and idles", () => {
    const { app, p } = rig({ systems: false });
    app.start();
    p.advance(2);
    expect(app.stats.renders).toBe(1);
    expect(app.stats.idle).toBe(true);
    expect(p.pendingFrames).toBe(0);
  });

  it("2. moving entity draws every frame, then one final frame and idle", () => {
    const { app, p, ctl } = rig();
    app.start();
    p.advance(1);
    expect(app.stats.idle).toBe(false);
    expect(app.stats.renders).toBeGreaterThanOrEqual(59);
    ctl.moving = false;
    p.advance(0.1);
    expect(app.stats.idle).toBe(true);
    const r = app.stats.renders;
    p.advance(1);
    expect(app.stats.renders).toBe(r);
    expect(p.pendingFrames).toBe(0);
  });

  it("3. active system on non-visible data steps without drawing", () => {
    const { app, p, ctl } = rig();
    ctl.moving = false;
    ctl.hidden = true;
    app.start();
    p.advance(1);
    expect(app.stats.renders).toBe(1);
    expect(app.stats.steps).toBeGreaterThanOrEqual(59);
    expect(app.stats.idle).toBe(false);
  });

  it("4. platform event wakes: one step, event readable in that step only", () => {
    const { app, p, ctl, seen } = rig();
    ctl.moving = false;
    app.start();
    p.advance(0.5);
    const steps = app.stats.steps;
    seen.length = 0;
    p.emit(key);
    expect(app.stats.idle).toBe(false);
    p.advance(0.5);
    expect(app.stats.steps - steps).toBe(1);
    expect(seen).toEqual([1]);
    expect(app.stats.idle).toBe(true);
  });

  it("5. leaving idle advances Time.step by floor(idle / dt)", () => {
    const { app, p, ctl } = rig();
    ctl.moving = false;
    app.start();
    p.advance(1);
    const t = app.world.res(Time);
    const before = t.step;
    p.advance(2);
    expect(t.step).toBe(before);
    const emitAt = p.time;
    p.emit(key);
    p.advance(0.1);
    // idle began after the first frame (1/60 s); one step runs after leaving idle
    expect(Math.abs(t.step - before - 1 - Math.floor((emitAt - 1 / 60) * 60))).toBeLessThanOrEqual(
      1,
    );
    expect(t.elapsed).toBeCloseTo(t.step / 60, 9);
  });

  it("6. wakeAfter idles and steps again later without events", () => {
    const p = new FakePlatform();
    const stepsAt: number[] = [];
    const sys = defineSystem({
      name: "sleeper",
      run(w) {
        stepsAt.push(p.time);
        if (stepsAt.length === 1) w.wakeAfter(0.5);
        return false;
      },
    });
    const app = createApp({ platform: p, systems: [sys] });
    apps.push(app);
    app.start();
    p.advance(0.4);
    expect(app.stats.idle).toBe(true);
    expect(p.pendingTimers).toBe(1);
    p.advance(0.3);
    expect(stepsAt.length).toBe(2);
    expect(stepsAt[1] as number).toBeGreaterThanOrEqual(0.5);
    expect(stepsAt[1] as number).toBeLessThan(0.55);
    expect(app.stats.idle).toBe(true);
    expect(p.pendingTimers).toBe(0);
  });

  it("7. hidden stops stepping and drawing; visible resumes with a draw", () => {
    const { app, p } = rig();
    app.start();
    p.advance(0.5);
    p.emit({ type: "visibility", visible: false });
    const steps = app.stats.steps;
    const renders = app.stats.renders;
    p.advance(3);
    expect(app.stats.steps).toBe(steps);
    expect(app.stats.renders).toBe(renders);
    expect(p.pendingFrames).toBe(0);
    const t = app.world.res(Time);
    const step = t.step;
    p.emit({ type: "visibility", visible: true });
    expect(t.step).toBe(step);
    p.advance(1 / 60);
    expect(app.stats.renders).toBe(renders + 1);
    expect(t.step - step).toBeLessThanOrEqual(2);
  });

  it("8. resize forces a draw while idle", () => {
    const { app, p, ctl } = rig();
    ctl.moving = false;
    app.start();
    p.advance(1);
    const r = app.stats.renders;
    p.emit({ type: "resize", width: 10, height: 10, pixelRatio: 1 });
    p.advance(0.1);
    expect(app.stats.renders).toBe(r + 1);
    expect(app.stats.idle).toBe(true);
  });
});

describe("timing", () => {
  it("9. 120 Hz display with 60 Hz steps interpolates", () => {
    const { app, p, alphas } = rig({ interval: 1 / 120 });
    app.start();
    p.advance(1);
    expect(Math.abs(app.stats.steps - 60)).toBeLessThanOrEqual(2);
    expect(Math.abs(app.stats.renders - 120)).toBeLessThanOrEqual(3);
    expect(alphas.some((a) => a > 0.1 && a < 0.9)).toBe(true);
    expect(alphas.every((a) => a >= 0 && a <= 1)).toBe(true);
  });

  it("9b. interpolate:false draws once per step with alpha 1", () => {
    const { app, p, alphas } = rig({ interval: 1 / 120, config: { interpolate: false } });
    app.start();
    p.advance(1);
    expect(Math.abs(app.stats.steps - 60)).toBeLessThanOrEqual(2);
    expect(Math.abs(app.stats.renders - 60)).toBeLessThanOrEqual(2);
    expect(alphas.every((a) => a === 1)).toBe(true);
  });

  it("10. 30 Hz display runs two steps per frame; stall is clamped to 4", () => {
    const { app, p } = rig({ interval: 1 / 30 });
    app.start();
    p.advance(1 / 30);
    p.advance(1 / 30);
    const s0 = app.stats.steps;
    p.advance(1 / 30);
    expect(app.stats.steps - s0).toBe(2);
    p.time += 1;
    const s1 = app.stats.steps;
    p.advance(1 / 30);
    expect(app.stats.steps - s1).toBe(4);
  });

  it("11. alwaysRender draws every frame", () => {
    const { app, p, ctl } = rig({ config: { alwaysRender: true } });
    ctl.moving = false;
    app.start();
    p.advance(1);
    expect(app.stats.renders).toBeGreaterThanOrEqual(59);
    expect(app.stats.idle).toBe(false);
  });
});

describe("start and stop", () => {
  it("start twice is a no-op; stop cancels everything; restart works", () => {
    const { app, p } = rig();
    app.start();
    app.start();
    expect(p.listenerCount).toBe(1);
    p.advance(0.1);
    app.stop();
    expect(p.pendingFrames).toBe(0);
    expect(p.listenerCount).toBe(0);
    const s = app.stats.steps;
    p.advance(1);
    expect(app.stats.steps).toBe(s);
    app.start();
    p.advance(0.1);
    expect(app.stats.steps).toBeGreaterThan(s);
  });

  it("world.wake() and inject wake an idle loop", () => {
    const { app, p, ctl } = rig();
    ctl.moving = false;
    app.start();
    p.advance(1);
    expect(app.stats.idle).toBe(true);
    app.world.wake();
    expect(app.stats.idle).toBe(false);
    p.advance(0.1);
    expect(app.stats.idle).toBe(true);
    app.inject(key);
    expect(app.stats.idle).toBe(false);
  });
});
