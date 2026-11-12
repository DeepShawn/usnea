// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./io.js";

/** The resolved contents of `usnea.json`, with defaults applied. */
export interface ProjectConfig {
  readonly name: string;
  readonly scene: string;
  readonly width: number;
  readonly height: number;
  /** CSS hex colour, `#rrggbb` or `#rrggbbaa`. */
  readonly background: string;
  readonly stepHz: number;
  readonly seed: number;
  readonly pixelArt: boolean;
  readonly plugins: readonly string[];
}

const FILE = "usnea.json";
const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

type Raw = Record<string, unknown>;

function bad(field: string, want: string, got: unknown): CliError {
  return new CliError(
    `${FILE}: "${field}" must be ${want}, got ${JSON.stringify(got)}`,
    `edit ${FILE} and change "${field}" to ${want}`,
  );
}

function pick<T>(raw: Raw, field: string, want: string, ok: (v: unknown) => v is T, def: T): T {
  const v = raw[field];
  if (v === undefined) return def;
  if (!ok(v)) throw bad(field, want, v);
  return v;
}

const isStr = (v: unknown): v is string => typeof v === "string" && v !== "";
const isPos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
const isStrList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && x !== "");

/** Reads and validates `usnea.json` in `root`; a missing file or a wrong field type is a `CliError`. */
export async function loadConfig(root: string): Promise<ProjectConfig> {
  let text: string;
  try {
    text = await readFile(path.join(root, FILE), "utf8");
  } catch {
    throw new CliError(
      `${FILE} not found in ${root}`,
      `run the command from your project folder, or create ${FILE} with {} to use the defaults`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new CliError(
      `${FILE} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      `fix the syntax in ${FILE}`,
    );
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw bad("(root)", "an object", raw);
  }
  const r = raw as Raw;
  return {
    name: pick(r, "name", "a non-empty string", isStr, path.basename(path.resolve(root))),
    scene: pick(r, "scene", "a file path string", isStr, "scenes/main.scene.json"),
    width: pick(r, "width", "a positive number", isPos, 800),
    height: pick(r, "height", "a positive number", isPos, 600),
    background: pick(r, "background", 'a colour like "#101820"', isHex, "#101820"),
    stepHz: pick(r, "stepHz", "a positive number", isPos, 60),
    seed: pick(r, "seed", "an integer", isInt, 1),
    pixelArt: pick(r, "pixelArt", "true or false", isBool, false),
    plugins: pick(r, "plugins", "a list of package names", isStrList, []),
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** Picks the scene to load (override, then config) and checks the file exists. */
export async function resolveScene(
  root: string,
  config: ProjectConfig,
  override?: string,
): Promise<string> {
  const scene = (override ?? config.scene).split(path.sep).join("/").replace(/^\.\//, "");
  if (await exists(path.join(root, scene))) return scene;
  let found: string[] = [];
  try {
    found = (await readdir(path.join(root, "scenes"))).filter((f) => f.endsWith(".scene.json"));
  } catch {
    // no scenes folder
  }
  if (found.length === 0) {
    throw new CliError(
      `scene file "${scene}" not found and the project has no scenes`,
      `create ${scene} (a scene file with {"usnea":"0.1","name":"main","entities":[]}) or set "scene" in ${FILE}`,
    );
  }
  throw new CliError(
    `scene file "${scene}" not found in ${root}`,
    `use one of: ${found.map((f) => `scenes/${f}`).join(", ")}, or fix "scene" in ${FILE}`,
  );
}
