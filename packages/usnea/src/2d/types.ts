// SPDX-License-Identifier: Apache-2.0
//
// 2D rendering contract (`usnea/2d`). Types only.
// Behaviour is specified in docs/design/core.md, section "2D rendering".

import type { PlatformImage } from "../types.js";

/** A texture owned by a render backend. */
export interface TextureInfo {
  /** Backend-assigned id, unique while the texture is alive. Never 0. */
  readonly id: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A backend-independent list of textured quads, already sorted back to front.
 * The arrays are reused between frames; only the first `count` quads are valid.
 */
export interface DrawList {
  /** Number of quads. */
  count: number;
  /**
   * 16 floats per quad: four vertices of (x, y, u, v), in the order top-left,
   * top-right, bottom-right, bottom-left. Positions are in world pixels, y down.
   */
  vertices: Float32Array;
  /** One 0xRRGGBBAA tint per quad (straight alpha). */
  colors: Uint32Array;
  /** One texture id per quad. */
  textures: Uint32Array;
}

/** What to draw and how to look at it. */
export interface Frame {
  readonly list: DrawList;
  /**
   * Affine transform from world pixels to clip space (-1..1, y up), as
   * [a, b, c, d, tx, ty]: clipX = a*x + c*y + tx, clipY = b*x + d*y + ty.
   */
  readonly view: Float32Array;
  /** Background colour as 0xRRGGBBAA. */
  readonly clearColor: number;
}

/** Pixels read back from the last drawn frame, top row first, RGBA8. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * A replaceable renderer. It draws quads; it knows nothing about entities,
 * components, sorting or cameras.
 */
export interface RenderBackend {
  readonly name: string;
  /** Uploads an image and returns its texture. */
  createTexture(image: PlatformImage): TextureInfo;
  destroyTexture(texture: TextureInfo): void;
  /** Called when the drawable size changes. Sizes are in physical pixels. */
  resize(width: number, height: number): void;
  /** Draws one frame, merging consecutive quads that share a texture into one draw call. */
  render(frame: Frame): void;
  /** Number of draw calls issued by the last `render`. */
  readonly drawCalls: number;
  /** Reads back the last drawn frame; absent on backends that do not rasterise. */
  readPixels?(): Pixels;
  dispose(): void;
}

/** Options for the 2D plugin. */
export interface Render2DOptions {
  readonly backend: RenderBackend;
  /** Design resolution in world pixels. Defaults to 800 by 600. */
  readonly width?: number;
  readonly height?: number;
  /** Background colour as 0xRRGGBBAA. Defaults to opaque black. */
  readonly background?: number;
}

/**
 * Contents of the `View` resource: the design size, the last known surface size and the last
 * view transform, so game code can convert surface pixels to world coordinates.
 */
export interface ViewState {
  /** Design width in world pixels (from the plugin options). */
  width: number;
  /** Design height in world pixels (from the plugin options). */
  height: number;
  /** Last known surface width in physical pixels. */
  surfaceWidth: number;
  /** Last known surface height in physical pixels. */
  surfaceHeight: number;
  /** World to clip transform `[a, b, c, d, tx, ty]`, the same numbers as `Frame.view`. */
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/** An atlas file (`*.atlas.json`): named frames within one image. */
export interface AtlasData {
  readonly usnea: string;
  /** Image path relative to the project root. */
  readonly image: string;
  readonly frames: Readonly<
    Record<
      string,
      { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
    >
  >;
}

/** A bitmap font file (`*.font.json`). */
export interface BitmapFontData {
  readonly usnea: string;
  readonly image: string;
  /** Pixel size the glyphs were drawn at. */
  readonly size: number;
  readonly lineHeight: number;
  readonly glyphs: Readonly<
    Record<
      string,
      {
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
        readonly xoffset: number;
        readonly yoffset: number;
        readonly xadvance: number;
      }
    >
  >;
}
