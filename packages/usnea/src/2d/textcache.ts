// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "../errors.js";
import type { Entity, Platform, TextStyle, World } from "../types.js";
import { Text } from "./components.js";
import type { RenderBackend, TextureInfo } from "./types.js";

interface Entry {
  text: string;
  font: string;
  size: number;
  wrapWidth: number;
  align: string;
  texture: TextureInfo;
}

/** Per-entity cache of platform-rasterised text textures. */
export class TextCache {
  private readonly entries = new Map<Entity, Entry>();

  constructor(private readonly backend: RenderBackend) {}

  /** Returns the texture for the entity's text, rasterising when the key changed. */
  acquire(platform: Platform | undefined, e: Entity): TextureInfo {
    const text = Text.text[e] as string;
    const font = Text.font[e] as string;
    const size = Text.size[e] as number;
    const wrapWidth = Text.wrapWidth[e] as number;
    const align = Text.align[e] as string;
    const old = this.entries.get(e);
    if (
      old !== undefined &&
      old.text === text &&
      old.font === font &&
      old.size === size &&
      old.wrapWidth === wrapWidth &&
      old.align === align
    ) {
      return old.texture;
    }
    if (platform === undefined || platform.rasterizeText === undefined) {
      throw usneaError(
        "USN-E041",
        `Text "${text}" with font "${font}" cannot be rasterised: the platform has no rasterizeText`,
        "2d text drawing",
        'use a bitmap font ("*.font.json") or a platform with font support',
      );
    }
    const style: TextStyle = {
      font,
      size,
      wrapWidth,
      align: align === "center" || align === "right" ? align : "left",
    };
    const texture = this.backend.createTexture(platform.rasterizeText(text, style));
    if (old !== undefined) this.backend.destroyTexture(old.texture);
    this.entries.set(e, { text, font, size, wrapWidth, align, texture });
    return texture;
  }

  /** Destroys textures of entities that are gone, lost their Text, or no longer use it. */
  sweep(world: World): void {
    for (const [e, entry] of this.entries) {
      const keep =
        world.isAlive(e) &&
        world.has(e, Text) &&
        (Text.text[e] as string) !== "" &&
        !(Text.font[e] as string).endsWith(".font.json");
      if (!keep) {
        this.backend.destroyTexture(entry.texture);
        this.entries.delete(e);
      }
    }
  }
}
