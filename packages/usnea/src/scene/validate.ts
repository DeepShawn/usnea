// SPDX-License-Identifier: Apache-2.0
import { didYouMean, usneaError } from "../errors.js";
import type { AnyComponent, PrefabData, SceneComponents, SceneData, Schema } from "../types.js";
import { checkValue, type EidMode, expectedValue } from "./values.js";

/** Internal: the only scene format version accepted. */
export const SCENE_VERSION = "0.1";

/** Internal: registered components by name. */
export type Lookup = ReadonlyMap<string, AnyComponent>;

const PLUGIN_HINT =
  'If this component comes from a plugin, add the plugin to the scene\'s "plugins".';

/** Internal: whether a value is a plain JSON object. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function shape(where: string, what: string, fix: string): never {
  throw usneaError("USN-E011", what, where, fix);
}

function header(data: unknown, where: string): Record<string, unknown> {
  if (!isRecord(data))
    return shape(where, "File must contain a JSON object", "see the format docs");
  if (data.usnea !== SCENE_VERSION) {
    return shape(
      where,
      `Unsupported format version ${JSON.stringify(data.usnea) ?? "(missing)"}`,
      `set "usnea": "${SCENE_VERSION}"`,
    );
  }
  return data;
}

function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/** Internal: validates a component map; returns it typed. `ids` is needed in "scene" mode. */
export function validateComponents(
  value: unknown,
  lookup: Lookup,
  mode: EidMode,
  where: string,
  ids?: ReadonlySet<string>,
): SceneComponents {
  if (!isRecord(value))
    return shape(where, '"components" must be an object', "use { Name: {...} }");
  for (const [name, fields] of Object.entries(value)) {
    const def = lookup.get(name);
    if (def === undefined) {
      throw usneaError(
        "USN-E012",
        `Unknown component "${name}"`,
        where,
        `use a registered component name.${didYouMean(name, lookup.keys())} ${PLUGIN_HINT}`,
      );
    }
    const here = `${where}, component "${name}"`;
    if (!isRecord(fields))
      return shape(here, "Component values must be an object", "use { field: value }");
    const schema = def.$schema as Schema;
    for (const [key, v] of Object.entries(fields)) {
      const field = Object.hasOwn(schema, key) ? schema[key] : undefined;
      if (field === undefined) {
        throw usneaError(
          "USN-E013",
          `Unknown field "${key}"`,
          here,
          `use one of: ${Object.keys(schema).join(", ")}.${didYouMean(key, Object.keys(schema))}`,
        );
      }
      if (!checkValue(field.kind, v, mode)) {
        throw usneaError(
          "USN-E014",
          `Field "${key}" has the wrong value ${show(v)}: expected ${expectedValue(field.kind, mode)}`,
          here,
          `write a value of type ${field.kind}`,
        );
      }
      if (field.kind === "eid" && typeof v === "string" && ids && !ids.has(v)) {
        throw usneaError(
          "USN-E016",
          `Field "${key}" refers to unknown entity id "${v}"`,
          here,
          `use the "id" of an entity in this scene.${didYouMean(v, ids)}`,
        );
      }
    }
  }
  return value as SceneComponents;
}

function stringList(d: Record<string, unknown>, key: string, where: string): string[] {
  const list = d[key];
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.some((x) => typeof x !== "string")) {
    return shape(where, `"${key}" must be an array of strings`, `fix "${key}"`);
  }
  return list as string[];
}

function entityWhere(label: string, raw: Record<string, unknown>, index: number): string {
  return `${label}, entity ${typeof raw.id === "string" ? `"${raw.id}"` : `#${index}`}`;
}

/** Internal: validates a whole scene file (every check before anything changes). */
export function validateScene(
  data: unknown,
  label: string,
  lookup: Lookup,
  pluginNames: readonly string[],
): SceneData {
  const d = header(data, label);
  if (typeof d.name !== "string") return shape(label, 'Missing string "name"', 'add "name"');
  for (const plugin of stringList(d, "plugins", label)) {
    if (!pluginNames.includes(plugin)) {
      throw usneaError(
        "USN-E017",
        `Scene requires plugin "${plugin}", which is not registered`,
        label,
        `add the plugin to createApp({ plugins }).${didYouMean(plugin, pluginNames)}`,
      );
    }
  }
  stringList(d, "prefabs", label);
  if (!Array.isArray(d.entities))
    return shape(label, '"entities" must be an array', 'add "entities"');
  const entities = d.entities as unknown[];
  const ids = new Set<string>();
  for (let i = 0; i < entities.length; i++) {
    const raw = entities[i];
    if (!isRecord(raw)) shape(`${label}, entity #${i}`, "Entity must be an object", "fix it");
    const where = entityWhere(label, raw, i);
    if (raw.id !== undefined) {
      if (typeof raw.id !== "string" || raw.id === "") {
        shape(where, '"id" must be a non-empty string', "fix the id");
      }
      if (ids.has(raw.id)) {
        throw usneaError("USN-E015", `Duplicate entity id "${raw.id}"`, where, "give each id once");
      }
      ids.add(raw.id);
    }
    if (raw.prefab !== undefined && typeof raw.prefab !== "string") {
      shape(where, '"prefab" must be a string path', "fix the prefab path");
    }
  }
  entities.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    if (e.components !== undefined) {
      validateComponents(e.components, lookup, "scene", entityWhere(label, e, i), ids);
    }
  });
  return d as unknown as SceneData;
}

/** Internal: validates a prefab file. */
export function validatePrefab(data: unknown, path: string, lookup: Lookup): PrefabData {
  const where = `prefab "${path}"`;
  const d = header(data, where);
  validateComponents(d.components, lookup, "prefab", where);
  return d as unknown as PrefabData;
}
