// SPDX-License-Identifier: Apache-2.0
import type { AnyComponent, FieldType, Schema } from "../types.js";
import { SCENE_VERSION } from "./validate.js";

const RANGES: Readonly<Record<string, readonly [number, number]>> = {
  i32: [-2147483648, 2147483647],
  u32: [0, 4294967295],
  u16: [0, 65535],
  u8: [0, 255],
};

type Json = Record<string, unknown>;

function fieldSchema(field: FieldType): Json {
  const range = RANGES[field.kind];
  let base: Json;
  if (range) base = { type: "integer", minimum: range[0], maximum: range[1] };
  else if (field.kind === "f32" || field.kind === "f64") base = { type: "number" };
  else if (field.kind === "bool") base = { type: "boolean" };
  else if (field.kind === "eid") base = { type: ["string", "integer"] };
  else base = { type: "string" };
  return { ...base, default: field.defaultValue };
}

function ref(name: string): string {
  return `#/$defs/${encodeURIComponent(name.replace(/~/g, "~0").replace(/\//g, "~1"))}`;
}

/** Internal: JSON Schema (draft 2020-12) for scene files, with a fixed key order. */
export function buildSceneSchema(components: readonly AnyComponent[]): Json {
  const sorted = [...components].sort((a, b) =>
    a.$name < b.$name ? -1 : a.$name > b.$name ? 1 : 0,
  );
  const defs: Json = {};
  const props: Json = {};
  for (const c of sorted) {
    const schema = c.$schema as Schema;
    const fields: Json = {};
    for (const key of Object.keys(schema)) fields[key] = fieldSchema(schema[key] as FieldType);
    defs[c.$name] = { type: "object", properties: fields, additionalProperties: false };
    props[c.$name] = { $ref: ref(c.$name) };
  }
  const componentMap = { type: "object", properties: props, additionalProperties: false };
  const strings = { type: "array", items: { type: "string" } };
  const entity = {
    type: "object",
    properties: {
      id: { type: "string", minLength: 1 },
      prefab: { type: "string" },
      components: componentMap,
    },
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Usnea scene",
    type: "object",
    properties: {
      usnea: { const: SCENE_VERSION },
      name: { type: "string" },
      plugins: strings,
      prefabs: strings,
      entities: { type: "array", items: entity },
    },
    required: ["usnea", "name", "entities"],
    $defs: defs,
  };
}
