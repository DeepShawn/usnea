// SPDX-License-Identifier: Apache-2.0
import type { ColumnTypes } from "../types.js";

/** Internal: how `eid` values are written: scene ids, prefab (0 only) or numeric handles. */
export type EidMode = "scene" | "prefab" | "handle";

const INT_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  i32: [-2147483648, 2147483647],
  u32: [0, 4294967295],
  u16: [0, 65535],
  u8: [0, 255],
};

/** Internal: describes what a field of this kind accepts, for error messages. */
export function expectedValue(kind: keyof ColumnTypes, mode: EidMode): string {
  const range = INT_RANGES[kind];
  if (range) return `an integer from ${range[0]} to ${range[1]}`;
  switch (kind) {
    case "f32":
    case "f64":
      return "a finite number";
    case "bool":
      return "true or false";
    case "eid":
      if (mode === "scene") return 'the id string of an entity in this scene, or 0 for "none"';
      if (mode === "prefab") return '0 (prefabs cannot refer to entities); use 0 for "none"';
      return "an entity handle (a non-negative integer)";
    default:
      return "a string";
  }
}

/** Internal: whether a JSON value is acceptable for a field of this kind. */
export function checkValue(kind: keyof ColumnTypes, value: unknown, mode: EidMode): boolean {
  const range = INT_RANGES[kind];
  if (range) {
    return (
      Number.isInteger(value) && (value as number) >= range[0] && (value as number) <= range[1]
    );
  }
  switch (kind) {
    case "f32":
    case "f64":
      return typeof value === "number" && Number.isFinite(value);
    case "bool":
      return typeof value === "boolean";
    case "eid":
      if (value === 0) return true;
      if (mode === "scene") return typeof value === "string";
      if (mode === "handle")
        return Number.isInteger(value) && (value as number) > 0 && (value as number) <= 4294967295;
      return false;
    default:
      return typeof value === "string";
  }
}
