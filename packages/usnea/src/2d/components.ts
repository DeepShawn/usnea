// SPDX-License-Identifier: Apache-2.0
import { defineComponent } from "../component.js";
import { asset, bool, f32, i32, str, u32 } from "../fields.js";

/** World position in pixels, y down. */
export const Position = defineComponent("Position", { x: f32, y: f32 });

/** Rotation in radians, clockwise. */
export const Rotation = defineComponent("Rotation", { angle: f32 });

/** Scale factors; 1 means unscaled. */
export const Scale = defineComponent("Scale", { x: f32.default(1), y: f32.default(1) });

/** A textured quad: an image or an atlas frame. */
export const Sprite = defineComponent("Sprite", {
  image: asset,
  width: f32,
  height: f32,
  anchorX: f32.default(0.5),
  anchorY: f32.default(0.5),
  color: u32.default(0xffffffff),
  flipX: bool,
  flipY: bool,
  layer: i32,
  order: f32,
  visible: bool.default(true),
});

/** Nine-slice insets in source pixels; applies to the entity's Sprite. */
export const NineSlice = defineComponent("NineSlice", {
  left: f32,
  top: f32,
  right: f32,
  bottom: f32,
});

/** Text drawn from a bitmap font or a platform-rasterised font family. */
export const Text = defineComponent("Text", {
  text: str,
  font: str.default("sans-serif"),
  size: f32.default(16),
  color: u32.default(0xffffffff),
  align: str.default("left"),
  wrapWidth: f32,
  anchorX: f32,
  anchorY: f32,
  layer: i32,
  order: f32,
  visible: bool.default(true),
});

/** A camera; the first active one with a Position defines the view. */
export const Camera = defineComponent("Camera", {
  zoom: f32.default(1),
  active: bool.default(true),
});
