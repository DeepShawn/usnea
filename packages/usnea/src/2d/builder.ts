// SPDX-License-Identifier: Apache-2.0
import type { AnyComponent, Entity } from "../types.js";
import { Camera, Position, Sprite, Text } from "./components.js";
import type { DrawContext } from "./context.js";
import { setXform } from "./drawlist.js";
import { createPose, type Pose, type PrevState } from "./interp.js";
import { emitSprite } from "./sprites.js";
import { emitText } from "./textdraw.js";
import type { ViewCamera } from "./view.js";

const SPRITES: readonly AnyComponent[] = [Sprite, Position];
const TEXTS: readonly AnyComponent[] = [Text, Position];
const CAMERAS: readonly AnyComponent[] = [Camera, Position];

/** Items are `entity * 2 + kind`, kind 0 = sprite, 1 = text. Reused between frames. */
const items: number[] = [];
const pose: Pose = createPose();

function compare(a: number, b: number): number {
  const ea = a >> 1;
  const eb = b >> 1;
  const la = (a & 1 ? Text.layer[ea] : Sprite.layer[ea]) as number;
  const lb = (b & 1 ? Text.layer[eb] : Sprite.layer[eb]) as number;
  if (la !== lb) return la - lb;
  const oa = (a & 1 ? Text.order[ea] : Sprite.order[ea]) as number;
  const ob = (b & 1 ? Text.order[eb] : Sprite.order[eb]) as number;
  if (oa !== ob) return oa - ob;
  return a - b;
}

/** Fills `cam` from the first (lowest slot) active camera that has a Position. */
export function findCamera(
  ctx: DrawContext,
  prev: PrevState,
  alpha: number,
  cam: ViewCamera,
): void {
  const found = ctx.world.query(CAMERAS);
  let best = 0;
  for (let i = 0; i < found.length; i++) {
    const e = found[i] as Entity;
    if (Camera.active[e] && (best === 0 || e < best)) best = e;
  }
  cam.active = best !== 0;
  if (best === 0) return;
  prev.sample(ctx.world, best, alpha, pose);
  cam.x = pose.x;
  cam.y = pose.y;
  cam.angle = pose.angle;
  cam.zoom = Camera.zoom[best] as number;
}

/** Collects, sorts and emits all visible sprites and texts into `ctx.list`. */
export function buildDrawList(ctx: DrawContext, prev: PrevState, alpha: number): void {
  const world = ctx.world;
  ctx.list.count = 0;
  items.length = 0;
  const sprites = world.query(SPRITES);
  for (let i = 0; i < sprites.length; i++) {
    const e = sprites[i] as Entity;
    if (Sprite.visible[e]) items.push(e * 2);
  }
  const texts = world.query(TEXTS);
  for (let i = 0; i < texts.length; i++) {
    const e = texts[i] as Entity;
    if (Text.visible[e] && (Text.text[e] as string) !== "") items.push(e * 2 + 1);
  }
  items.sort(compare);
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as number;
    const e = item >> 1;
    prev.sample(world, e, alpha, pose);
    setXform(ctx.xf, pose.x, pose.y, pose.angle, pose.sx, pose.sy);
    if (item & 1) emitText(ctx, e);
    else emitSprite(ctx, e);
  }
  ctx.texts?.sweep(world);
}
