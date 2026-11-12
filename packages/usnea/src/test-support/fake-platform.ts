// SPDX-License-Identifier: Apache-2.0
import type { Platform, PlatformEvent } from "../types.js";

/** Test platform with a virtual clock; unused members throw. */
export class FakePlatform implements Platform {
  readonly name = "fake";
  readonly surface = { width: 100, height: 100, pixelRatio: 1, native: undefined };
  time = 0;
  private nextId = 1;
  private readonly frames = new Map<number, (now: number) => void>();
  private readonly timers = new Map<number, { at: number; cb: () => void }>();
  private readonly listeners = new Set<(event: PlatformEvent) => void>();

  /** @param interval display refresh interval in seconds */
  constructor(readonly interval = 1 / 60) {}

  get pendingFrames(): number {
    return this.frames.size;
  }
  get pendingTimers(): number {
    return this.timers.size;
  }
  get listenerCount(): number {
    return this.listeners.size;
  }

  now(): number {
    return this.time;
  }
  requestFrame(callback: (now: number) => void): number {
    const id = this.nextId++;
    this.frames.set(id, callback);
    return id;
  }
  cancelFrame(id: number): void {
    this.frames.delete(id);
  }
  setTimer(callback: () => void, seconds: number): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + seconds, cb: callback });
    return id;
  }
  clearTimer(id: number): void {
    this.timers.delete(id);
  }
  onEvent(listener: (event: PlatformEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: PlatformEvent): void {
    for (const l of [...this.listeners]) l(event);
  }

  /** Advances virtual time, firing timers and display frames in time order. */
  advance(seconds: number): void {
    const end = this.time + seconds;
    for (;;) {
      const tick = (Math.floor(this.time / this.interval + 1e-9) + 1) * this.interval;
      let timerAt = Number.POSITIVE_INFINITY;
      let timerId = -1;
      for (const [id, t] of this.timers) {
        if (t.at < timerAt) {
          timerAt = t.at;
          timerId = id;
        }
      }
      const frameAt = this.frames.size > 0 ? tick : Number.POSITIVE_INFINITY;
      const next = Math.min(timerAt, frameAt);
      if (next > end + 1e-12) break;
      this.time = Math.max(this.time, next);
      if (timerAt <= frameAt) {
        const t = this.timers.get(timerId);
        this.timers.delete(timerId);
        t?.cb();
      } else {
        const batch = [...this.frames.values()];
        this.frames.clear();
        for (const cb of batch) cb(this.time);
      }
    }
    this.time = end;
  }

  readText(): Promise<string> {
    throw new Error("not implemented");
  }
  readBytes(): Promise<Uint8Array> {
    throw new Error("not implemented");
  }
  loadImage(): never {
    throw new Error("not implemented");
  }
  get storage(): never {
    throw new Error("not implemented");
  }
}
