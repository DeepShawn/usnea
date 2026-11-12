// SPDX-License-Identifier: Apache-2.0
import { usneaError } from "../errors.js";
import type { AssetLoader, AssetStore, Platform } from "../types.js";
import type { AtlasData, BitmapFontData, RenderBackend, TextureInfo } from "./types.js";

/** A loaded atlas: the texture of its image and the named frames. */
export interface AtlasAsset {
  readonly image: string;
  readonly texture: TextureInfo;
  readonly frames: AtlasData["frames"];
}

/** A loaded bitmap font: the texture of its image and the glyph table. */
export interface FontAsset {
  readonly image: string;
  readonly texture: TextureInfo;
  readonly data: BitmapFontData;
}

async function readJson(platform: Platform, path: string, key: string): Promise<unknown> {
  let data: unknown;
  try {
    data = JSON.parse(await platform.readText(path));
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw usneaError(
      "USN-E020",
      `Asset "${path}" is not valid JSON: ${cause}`,
      "2d loader",
      "fix the file",
    );
  }
  const record = data as Record<string, unknown> | null;
  if (
    typeof record !== "object" ||
    record === null ||
    typeof record.image !== "string" ||
    typeof record[key] !== "object"
  ) {
    throw usneaError(
      "USN-E020",
      `Asset "${path}" needs an "image" string and a "${key}" object`,
      "2d loader",
      "check the file against the AtlasData / BitmapFontData format",
    );
  }
  return data;
}

/** Registers the texture, atlas and bitmap font loaders with an asset store. */
export function registerLoaders(assets: AssetStore, backend: RenderBackend): void {
  const image: AssetLoader<TextureInfo> = {
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    async load(path, platform) {
      if (platform === undefined) {
        throw usneaError(
          "USN-E042",
          `Cannot load image "${path}" without a platform`,
          "2d image loader",
          "pass a platform to createApp()",
        );
      }
      return backend.createTexture(await platform.loadImage(path));
    },
    unload: (texture) => backend.destroyTexture(texture),
  };
  const atlas: AssetLoader<AtlasAsset> = {
    extensions: [".atlas.json"],
    async load(path, platform) {
      const data = (await readJson(platform, path, "frames")) as AtlasData;
      const texture = await assets.load<TextureInfo>(data.image);
      assets.retain(data.image);
      return { image: data.image, texture, frames: data.frames };
    },
    unload: (a) => assets.release(a.image),
  };
  const font: AssetLoader<FontAsset> = {
    extensions: [".font.json"],
    async load(path, platform) {
      const data = (await readJson(platform, path, "glyphs")) as BitmapFontData;
      const texture = await assets.load<TextureInfo>(data.image);
      assets.retain(data.image);
      return { image: data.image, texture, data };
    },
    unload: (f) => assets.release(f.image),
  };
  assets.register(image);
  assets.register(atlas);
  assets.register(font);
}
