// SPDX-License-Identifier: Apache-2.0
import type { Entity, World } from "../types.js";
import { Position, Rotation, Scale } from "./components.js";

/** An interpolated transform sample (reused). */
export interface Pose {
  x: number;
  y: number;
  angle: number;
  sx: number;
  sy: number;
}

/** Creates a zeroed pose. */
export function createPose(): Pose {
  return { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };
}

/** Previous-step copies of the transform columns, for interpolation. */
export class PrevState {
  px: Float32Array = new Float32Array(0);
  py: Float32Array = new Float32Array(0);
  angle: Float32Array = new Float32Array(0);
  sx: Float32Array = new Float32Array(0);
  sy: Float32Array = new Float32Array(0);
  /** Entity handle seen at snapshot time per slot; a mismatch means "spawned since". */
  handles: Uint32Array = new Uint32Array(0);

  /** Copies the current columns and records the handles of the given entities. */
  capture(world: World, entities: ArrayLike<Entity>): void {
    this.px = copy(this.px, Position.x);
    this.py = copy(this.py, Position.y);
    this.angle = copy(this.angle, Rotation.angle);
    this.sx = copy(this.sx, Scale.x);
    this.sy = copy(this.sy, Scale.y);
    if (this.handles.length !== Position.x.length) {
      const next = new Uint32Array(Position.x.length);
      next.set(this.handles);
      this.handles = next;
    }
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i] as Entity;
      this.handles[e] = world.handle(e);
    }
  }

  /** Samples the (possibly interpolated) transform of an entity into `pose`. */
  sample(world: World, e: Entity, alpha: number, pose: Pose): void {
    const x = Position.x[e] as number;
    const y = Position.y[e] as number;
    const angle = world.has(e, Rotation) ? (Rotation.angle[e] as number) : 0;
    const hasScale = world.has(e, Scale);
    const sx = hasScale ? (Scale.x[e] as number) : 1;
    const sy = hasScale ? (Scale.y[e] as number) : 1;
    const blend = alpha < 1 && this.handles[e] === world.handle(e) && this.handles[e] !== 0;
    if (blend) {
      pose.x = mix(this.px[e] as number, x, alpha);
      pose.y = mix(this.py[e] as number, y, alpha);
      pose.angle = world.has(e, Rotation) ? mix(this.angle[e] as number, angle, alpha) : 0;
      pose.sx = hasScale ? mix(this.sx[e] as number, sx, alpha) : 1;
      pose.sy = hasScale ? mix(this.sy[e] as number, sy, alpha) : 1;
    } else {
      pose.x = x;
      pose.y = y;
      pose.angle = angle;
      pose.sx = sx;
      pose.sy = sy;
    }
  }
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function copy(prev: Float32Array, column: Float32Array): Float32Array {
  const target = prev.length === column.length ? prev : new Float32Array(column.length);
  target.set(column);
  return target;
}
