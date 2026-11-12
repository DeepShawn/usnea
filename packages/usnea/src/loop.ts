// SPDX-License-Identifier: Apache-2.0

import type { Kernel, StepResult } from "./kernel.js";
import type { Inbox } from "./record.js";
import type { Platform, PlatformEvent } from "./types.js";

const MAX_FRAME = 0.25;
const MAX_STEPS = 4;
const EPS = 1e-9;

/** Internal: what the loop needs from the app. */
export interface LoopHost {
  readonly platform: Platform;
  readonly kernel: Kernel;
  readonly inbox: Inbox;
  readonly interpolate: boolean;
  readonly alwaysRender: boolean;
  /** Delivers queued events, runs one logic step and counts it. */
  step(): StepResult;
  /** Sets `Time.alpha`, runs the render phase and counts it. */
  draw(alpha: number): void;
}

/** Internal: the platform-driven frame loop (design section 4). */
export interface Loop {
  start(): void;
  stop(): void;
  /** Leaves idle if idle (wake source: `world.wake()`, asset ready, `inject`). */
  wake(): void;
  /** Queues an event and reacts to it (wake, visibility, resize). */
  receive(event: PlatformEvent): void;
  readonly idle: boolean;
}

/** Internal: creates the loop. */
export function createLoop(host: LoopHost): Loop {
  const { platform, kernel, inbox } = host;
  const time = kernel.time;
  let running = false;
  let hidden = false;
  let idle = false;
  let fresh = false;
  let forceDraw = false;
  let interpolating = false;
  let lastAwake = true;
  let acc = 0;
  let last = 0;
  let idleSince = 0;
  let wakeAt = Number.POSITIVE_INFINITY;
  let frameId: number | undefined;
  let timerId: number | undefined;
  let unsubscribe: (() => void) | undefined;

  function ensureFrame(): void {
    if (frameId === undefined && running && !hidden) frameId = platform.requestFrame(frame);
  }

  function cancelPending(): void {
    if (frameId !== undefined) platform.cancelFrame(frameId);
    if (timerId !== undefined) platform.clearTimer(timerId);
    frameId = timerId = undefined;
  }

  /** Leaves idle (or starts); the first frame runs exactly one step. */
  function resume(advance: boolean): void {
    const t = platform.now();
    if (advance) {
      time.step += Math.floor((t - idleSince) / time.dt + EPS);
      time.elapsed = time.step * time.dt;
    }
    idle = false;
    if (timerId !== undefined) platform.clearTimer(timerId);
    timerId = undefined;
    fresh = true;
    acc = time.dt;
    last = t;
    ensureFrame();
  }

  function onTimer(): void {
    timerId = undefined;
    wakeAt = Number.POSITIVE_INFINITY;
    if (running && idle && !hidden) resume(true);
  }

  function frame(now: number): void {
    frameId = undefined;
    if (!running || hidden) return;
    if (fresh) {
      last = now;
      fresh = false;
    }
    const dt = time.dt;
    acc += Math.min(now - last, MAX_FRAME);
    last = now;
    let k = Math.floor(acc / dt + EPS);
    if (k > MAX_STEPS) {
      k = MAX_STEPS;
      acc = MAX_STEPS * dt;
    }
    let dirty = false;
    for (let i = 0; i < k; i++) {
      const r = host.step();
      dirty = dirty || r.dirty;
      lastAwake = r.awake;
      acc -= dt;
    }
    if (k > 0 && wakeAt <= now) wakeAt = Number.POSITIVE_INFINITY;
    const delay = kernel.takeWakeAfter();
    if (delay < Number.POSITIVE_INFINITY) wakeAt = Math.min(wakeAt, now + delay);

    let alpha = Math.min(1, Math.max(0, acc / dt));
    let draw = false;
    if (dirty) {
      draw = true;
      interpolating = host.interpolate;
    } else if (interpolating) {
      draw = true;
      if (k > 0) {
        interpolating = false;
        alpha = 1;
      }
    }
    if (kernel.takeRenderRequest() || forceDraw || host.alwaysRender) draw = true;
    forceDraw = false;
    if (draw) host.draw(host.interpolate ? alpha : 1);

    const woke = kernel.takeWake();
    if (lastAwake || woke || inbox.size > 0 || interpolating || host.alwaysRender) {
      ensureFrame();
    } else {
      idle = true;
      idleSince = last;
      if (wakeAt < Number.POSITIVE_INFINITY) {
        timerId = platform.setTimer(onTimer, Math.max(0, wakeAt - platform.now()));
      }
    }
  }

  function setVisible(visible: boolean): void {
    if (!visible) {
      hidden = true;
      cancelPending();
    } else if (hidden) {
      hidden = false;
      forceDraw = true;
      resume(false);
    }
  }

  return {
    get idle() {
      return running && (idle || hidden);
    },
    start() {
      if (running) return;
      running = true;
      hidden = false;
      interpolating = false;
      lastAwake = true;
      forceDraw = true; // the first frame always draws, so earlier structural changes add nothing
      kernel.world.structuralDirty = false;
      unsubscribe = platform.onEvent((event) => this.receive(event));
      resume(false);
    },
    stop() {
      if (!running) return;
      running = false;
      hidden = idle = false;
      cancelPending();
      unsubscribe?.();
      unsubscribe = undefined;
    },
    wake() {
      if (running && idle && !hidden) resume(true);
    },
    receive(event) {
      inbox.push(event);
      if (!running) return;
      if (event.type === "visibility") return setVisible(event.visible);
      if (event.type === "resize") forceDraw = true;
      if (hidden) return;
      if (idle) resume(true);
      else ensureFrame();
    },
  };
}
