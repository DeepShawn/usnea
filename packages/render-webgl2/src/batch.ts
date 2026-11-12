// SPDX-License-Identifier: Apache-2.0
import type { DrawList } from "usnea/2d";
import { createProgram, type Program } from "./shader.js";
import type { TextureStore } from "./texture.js";

const FLOATS_PER_VERTEX = 5;
const STRIDE = FLOATS_PER_VERTEX * 4;

/** Dynamic vertex buffer, static index buffer and the draw loop for quads. */
export class QuadBatch {
  private prog!: Program;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private capacity = 0;
  private floats = new Float32Array(0);
  private words = new Uint32Array(0);

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly textures: TextureStore,
  ) {
    this.init();
  }

  /** (Re)creates program and buffers; also used after context restore. */
  init(): void {
    const gl = this.gl;
    this.prog = createProgram(gl);
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    const cap = this.capacity;
    this.capacity = 0;
    if (cap > 0) this.reserve(cap);
  }

  /** Grows buffers (by doubling) to hold at least `quads` quads. */
  private reserve(quads: number): void {
    if (quads <= this.capacity) return;
    const gl = this.gl;
    let cap = Math.max(256, this.capacity);
    while (cap < quads) cap *= 2;
    this.floats = new Float32Array(cap * 4 * FLOATS_PER_VERTEX);
    this.words = new Uint32Array(this.floats.buffer);
    const indices = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) {
      const v = q * 4;
      const i = q * 6;
      indices[i] = v;
      indices[i + 1] = v + 1;
      indices[i + 2] = v + 2;
      indices[i + 3] = v;
      indices[i + 4] = v + 2;
      indices[i + 5] = v + 3;
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.floats.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.capacity = cap;
  }

  /** Draws the list with the given view; returns the number of draw calls. */
  draw(list: DrawList, view: Float32Array): number {
    const gl = this.gl;
    const count = list.count;
    if (count <= 0) return 0;
    this.reserve(count);
    const f = this.floats;
    const w = this.words;
    const src = list.vertices;
    const colors = list.colors;
    for (let q = 0; q < count; q++) {
      const c = colors[q] as number;
      for (let v = 0; v < 4; v++) {
        const s = q * 16 + v * 4;
        const d = (q * 4 + v) * FLOATS_PER_VERTEX;
        f[d] = src[s] as number;
        f[d + 1] = src[s + 1] as number;
        f[d + 2] = src[s + 2] as number;
        f[d + 3] = src[s + 3] as number;
        w[d + 4] = c;
      }
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f, 0, count * 4 * FLOATS_PER_VERTEX);
    gl.useProgram(this.prog.program);
    gl.uniform4f(this.prog.uView, view[0] ?? 1, view[1] ?? 0, view[2] ?? 0, view[3] ?? 1);
    gl.uniform2f(this.prog.uTrans, view[4] ?? 0, view[5] ?? 0);
    gl.uniform1i(this.prog.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    const ids = list.textures;
    let calls = 0;
    let runStart = 0;
    let runId = 0;
    for (let q = 0; q <= count; q++) {
      const id = q < count ? (ids[q] as number) : 0;
      if (q > 0 && (q === count || id !== runId)) {
        const tex = this.textures.get(runId);
        if (tex) {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.drawElements(gl.TRIANGLES, (q - runStart) * 6, gl.UNSIGNED_INT, runStart * 24);
          calls++;
        }
        runStart = q;
      }
      runId = id;
    }
    return calls;
  }

  /** Deletes GL objects (skipped after context loss). */
  dispose(free: boolean): void {
    if (free) {
      this.gl.deleteBuffer(this.vbo);
      this.gl.deleteBuffer(this.ibo);
      this.gl.deleteVertexArray(this.vao);
      this.gl.deleteProgram(this.prog.program);
    }
    this.vao = this.vbo = this.ibo = null;
  }
}
