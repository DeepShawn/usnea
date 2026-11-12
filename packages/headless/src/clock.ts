// SPDX-License-Identifier: Apache-2.0
//
// Virtual clock: nothing advances unless `advance` is called.

const EPS = 1e-9;

interface Timer {
  readonly id: number;
  readonly due: number;
  readonly callback: () => void;
}

/** A deterministic clock driving timers and frame callbacks. */
export interface VirtualClock {
  now(): number;
  advance(seconds: number): void;
  requestFrame(callback: (now: number) => void): number;
  cancelFrame(id: number): void;
  setTimer(callback: () => void, seconds: number): number;
  clearTimer(id: number): void;
}

/** Creates a virtual clock whose frames tick every `frameInterval` seconds. */
export function createVirtualClock(frameInterval = 1 / 60): VirtualClock {
  let time = 0;
  let nextId = 1;
  const timers = new Map<number, Timer>();
  const frames = new Map<number, (now: number) => void>();

  const nextTimer = (): Timer | undefined => {
    let best: Timer | undefined;
    for (const t of timers.values()) {
      if (!best || t.due < best.due || (t.due === best.due && t.id < best.id)) best = t;
    }
    return best;
  };
  const nextTick = (): number => (Math.floor(time / frameInterval + EPS) + 1) * frameInterval;

  return {
    now: () => time,
    requestFrame(callback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    setTimer(callback, seconds) {
      const id = nextId++;
      timers.set(id, { id, due: time + Math.max(0, seconds), callback });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(seconds) {
      if (!(seconds >= 0)) throw new Error(`advance(): seconds must be >= 0, got ${seconds}`);
      const target = time + seconds;
      for (;;) {
        const timer = nextTimer();
        const tick = frames.size > 0 ? nextTick() : Number.POSITIVE_INFINITY;
        const timerDue = timer ? timer.due : Number.POSITIVE_INFINITY;
        if (timerDue > target + EPS && tick > target + EPS) break;
        if (timer && timerDue <= tick + EPS) {
          time = Math.max(time, timerDue);
          timers.delete(timer.id);
          timer.callback();
        } else {
          time = Math.max(time, tick);
          for (const [id, cb] of [...frames]) {
            // A callback earlier in this tick may have cancelled a later one.
            if (!frames.delete(id)) continue;
            cb(time);
          }
        }
      }
      time = Math.max(time, target);
    },
  };
}
