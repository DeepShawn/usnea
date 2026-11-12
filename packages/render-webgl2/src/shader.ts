// SPDX-License-Identifier: Apache-2.0

const VERTEX = `#version 300 es
in vec2 aPos;
in vec2 aUv;
in vec4 aColor;
uniform vec4 uView;
uniform vec2 uTrans;
out vec2 vUv;
out vec4 vColor;
void main() {
  vec2 p = vec2(uView.x * aPos.x + uView.z * aPos.y + uTrans.x,
                uView.y * aPos.x + uView.w * aPos.y + uTrans.y);
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = aUv;
  vColor = aColor.abgr;
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vColor;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  vec4 tint = vec4(vColor.rgb * vColor.a, vColor.a);
  outColor = texture(uTex, vUv) * tint;
}`;

/** A linked shader program with its uniform locations. */
export interface Program {
  readonly program: WebGLProgram;
  readonly uView: WebGLUniformLocation | null;
  readonly uTrans: WebGLUniformLocation | null;
  readonly uTex: WebGLUniformLocation | null;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("render-webgl2: could not create a shader object.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`render-webgl2: shader compile failed: ${log}`);
  }
  return shader;
}

/** Compiles and links the quad shader; attribute locations are 0 (pos), 1 (uv), 2 (colour). */
export function createProgram(gl: WebGL2RenderingContext): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!program) throw new Error("render-webgl2: could not create a program object.");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.bindAttribLocation(program, 1, "aUv");
  gl.bindAttribLocation(program, 2, "aColor");
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`render-webgl2: program link failed: ${log}`);
  }
  return {
    program,
    uView: gl.getUniformLocation(program, "uView"),
    uTrans: gl.getUniformLocation(program, "uTrans"),
    uTex: gl.getUniformLocation(program, "uTex"),
  };
}
