// SPDX-License-Identifier: Apache-2.0
import { didYouMean, usneaError } from "./errors.js";
import type {
  AnyComponent,
  ColumnTypes,
  ComponentDef,
  ComponentValues,
  FieldType,
  Schema,
} from "./types.js";

type Column = ColumnTypes[keyof ColumnTypes];
type Stored = number | string;
type Writable = { [index: number]: Stored };

interface Info {
  name: string;
  keys: string[];
  fields: FieldType[];
  /** Default value as stored in the column (booleans as 0 or 1). */
  stored: Stored[];
  owner: object | undefined;
}

const infos = new WeakMap<object, Info>();
const KINDS = ["f32", "f64", "i32", "u32", "u16", "u8", "bool", "eid", "str", "asset"];

function createColumn(kind: keyof ColumnTypes, capacity: number, fill: Stored): Column {
  switch (kind) {
    case "f32":
      return new Float32Array(capacity);
    case "f64":
      return new Float64Array(capacity);
    case "i32":
      return new Int32Array(capacity);
    case "u32":
    case "eid":
      return new Uint32Array(capacity);
    case "u16":
      return new Uint16Array(capacity);
    case "u8":
    case "bool":
      return new Uint8Array(capacity);
    default:
      return new Array<string>(capacity).fill(fill as string);
  }
}

function info(def: AnyComponent): Info {
  const found = infos.get(def);
  if (!found) {
    throw usneaError(
      "USN-E003",
      "Value is not a component definition",
      "component lookup",
      "create it with defineComponent()",
    );
  }
  return found;
}

/** Defines a component: pure data stored as one column per schema field. */
export function defineComponent<S extends Schema>(name: string, schema: S): ComponentDef<S> {
  if (typeof name !== "string" || name === "") {
    throw usneaError("USN-E002", "Component name is empty", "defineComponent", "pass a name");
  }
  const keys = Object.keys(schema);
  const fields: FieldType[] = [];
  const stored: Stored[] = [];
  const def: Record<string, unknown> = { $name: name, $schema: schema };
  for (const key of keys) {
    const field = schema[key] as FieldType | undefined;
    if (key.startsWith("$") || !field || !KINDS.includes(field.kind)) {
      throw usneaError(
        "USN-E002",
        `Invalid field "${key}"`,
        `component "${name}"`,
        `name fields without a leading "$" and use a type such as f32, bool or str.${didYouMean(
          String(field?.kind ?? ""),
          KINDS,
        )}`,
      );
    }
    fields.push(field);
    stored.push(
      field.kind === "bool" ? (field.defaultValue ? 1 : 0) : (field.defaultValue as Stored),
    );
    def[key] = createColumn(field.kind, 0, stored[stored.length - 1] as Stored);
  }
  infos.set(def, { name, keys, fields, stored, owner: undefined });
  return def as unknown as ComponentDef<S>;
}

function allocate(def: AnyComponent, i: Info, capacity: number, keep: boolean): void {
  const target = def as unknown as Record<string, Column>;
  i.keys.forEach((key, n) => {
    const field = i.fields[n] as FieldType;
    const next = createColumn(field.kind, capacity, i.stored[n] as Stored);
    const old = keep ? (target[key] as Column) : next;
    if (Array.isArray(next)) {
      for (let k = 0; k < old.length; k++) next[k] = (old as string[])[k] as string;
    } else (next as Uint32Array).set(old as Uint32Array);
    target[key] = next;
  });
}

/** Internal: binds the component to `owner` with fresh columns; throws USN-E004 if already bound. */
export function bindComponent(def: AnyComponent, owner: object, capacity: number): void {
  const i = info(def);
  if (i.owner !== undefined && i.owner !== owner) {
    throw usneaError(
      "USN-E004",
      `Component "${i.name}" is already bound to another live app`,
      "app creation",
      "call dispose() on the other app first, or define separate components per app",
    );
  }
  i.owner = owner;
  allocate(def, i, capacity, false);
}

/** Internal: replaces every column with a larger one, keeping the data. */
export function growComponent(def: AnyComponent, capacity: number): void {
  allocate(def, info(def), capacity, true);
}

/** Internal: zeroes the columns and releases the binding if `owner` holds it. */
export function unbindComponent(def: AnyComponent, owner: object): void {
  const i = info(def);
  if (i.owner !== owner) return;
  const target = def as unknown as Record<string, Column>;
  i.keys.forEach((key, n) => {
    const col = target[key] as Column;
    if (Array.isArray(col)) col.fill(i.stored[n] as string);
    else (col as Uint8Array).fill(0);
  });
  i.owner = undefined;
}

/** Internal: writes given values, then defaults, into the entity's row. */
export function initComponent(
  def: AnyComponent,
  entity: number,
  values?: ComponentValues<Schema>,
): void {
  const i = info(def);
  const target = def as unknown as Record<string, Writable>;
  for (let n = 0; n < i.keys.length; n++) {
    const key = i.keys[n] as string;
    const given = values?.[key];
    let v: Stored = i.stored[n] as Stored;
    if (given !== undefined) v = typeof given === "boolean" ? (given ? 1 : 0) : given;
    (target[key] as Writable)[entity] = v;
  }
}

/** Internal: resets the entity's row to the defaults. */
export function resetComponent(def: AnyComponent, entity: number): void {
  initComponent(def, entity);
}

/** Internal: the component's name. */
export function componentName(def: AnyComponent): string {
  return info(def).name;
}
