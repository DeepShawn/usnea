// SPDX-License-Identifier: Apache-2.0

import type { PlatformImage } from "usnea";
import type { TextureInfo } from "usnea/2d";

/** Returns a copy of straight-alpha RGBA8 bytes with colour premultiplied by alpha. */
function premultiply(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    const a = bytes[i + 3] as number;
    out[i] = Math.round(((bytes[i] as number) * a) / 255);
    out[i + 1] = Math.round(((bytes[i + 1] as number) * a) / 255);
    out[i + 2] = Math.round(((bytes[i + 2] as number) * a) / 255);
    out[i + 3] = a;
  }
  return out;
}

/** Owns GL textures and their ids (starting at 1, never reused while alive). */
export class TextureStore {
  private readonly textures = new Map<number, WebGLTexture>();
  private nextId = 1;

  constructor(
    private gl: WebGL2RenderingContext,
    private readonly pixelArt: boolean,
  ) {}

  /** Uploads an image with premultiplied alpha and returns its texture info. */
  create(image: PlatformImage): TextureInfo {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error("render-webgl2: could not create a texture.");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (image.source instanceof Uint8Array) {
      // The premultiply flag does not apply to ArrayBufferView uploads, so do it by hand.
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        image.width,
        image.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        premultiply(image.source),
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image.source as TexImageSource,
      );
    }
    const filter = this.pixelArt ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const id = this.nextId++;
    this.textures.set(id, tex);
    return { id, width: image.width, height: image.height };
  }

  /** Returns the GL texture for an id, or undefined when unknown. */
  get(id: number): WebGLTexture | undefined {
    return this.textures.get(id);
  }

  /** Deletes one texture; unknown ids are ignored. */
  destroy(id: number): void {
    const tex = this.textures.get(id);
    if (!tex) return;
    this.gl.deleteTexture(tex);
    this.textures.delete(id);
  }

  /** Drops every texture; with `free` the GL objects are deleted too (not after context loss). */
  clear(free: boolean): void {
    if (free) for (const tex of this.textures.values()) this.gl.deleteTexture(tex);
    this.textures.clear();
  }
}
