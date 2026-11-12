// SPDX-License-Identifier: Apache-2.0
import type { ColumnTypes, FieldType, ValueTypes } from "./types.js";

function make<K extends keyof ColumnTypes>(kind: K, defaultValue: ValueTypes[K]): FieldType<K> {
  return Object.freeze({
    kind,
    defaultValue,
    default: (value: ValueTypes[K]) => make(kind, value),
  });
}

/** 32-bit float field, default 0. */
export const f32 = make("f32", 0);
/** 64-bit float field, default 0. */
export const f64 = make("f64", 0);
/** Signed 32-bit integer field, default 0. */
export const i32 = make("i32", 0);
/** Unsigned 32-bit integer field, default 0. */
export const u32 = make("u32", 0);
/** Unsigned 16-bit integer field, default 0. */
export const u16 = make("u16", 0);
/** Unsigned 8-bit integer field, default 0. */
export const u8 = make("u8", 0);
/** Boolean field stored as 0 or 1, default false. */
export const bool = make("bool", false);
/** Entity handle field, default 0 (no entity). */
export const eid = make("eid", 0);
/** String field, default "". */
export const str = make("str", "");
/** Project-relative asset path field, default "". */
export const asset = make("asset", "");
