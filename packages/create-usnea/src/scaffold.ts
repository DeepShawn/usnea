// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** An error the user can fix; `hint` says how. */
export class ScaffoldError extends Error {
  readonly hint: string;

  constructor(message: string, hint: string) {
    super(message);
    this.name = "ScaffoldError";
    this.hint = hint;
  }
}

/** Options for `scaffold`. */
export interface ScaffoldOptions {
  /** Folder to create or fill. */
  readonly targetDir: string;
  /** npm package name of the new project. */
  readonly name: string;
  /** Version range base for `usnea` and `@usnea/cli`, for example `0.1.0`. */
  readonly engineVersion: string;
  /** Write into a non-empty folder, overwriting files with the same name. */
  readonly force?: boolean;
}

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "template");
const FILLED = new Set(["package.json", "usnea.json", "README.md", "AGENTS.md"]);
const NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Checks an npm package name (lower case, no spaces, at most 214 characters); throws if invalid. */
export function assertPackageName(name: string): void {
  if (name.length > 0 && name.length <= 214 && NAME.test(name)) return;
  const fixed = name
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^[-._]+|-+$/g, "");
  throw new ScaffoldError(
    `"${name}" is not a valid npm package name (use lower case letters, digits and "-", no spaces)`,
    fixed
      ? `name the folder "${fixed}"`
      : "choose a folder name made of lower case letters and digits",
  );
}

async function list(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await list(path.join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out.sort();
}

/** Copies the template into `targetDir` and fills in the placeholders; returns the files written. */
export async function scaffold(options: ScaffoldOptions): Promise<string[]> {
  const { targetDir, name, engineVersion, force = false } = options;
  assertPackageName(name);
  const existing = await readdir(targetDir).catch(() => []);
  if (existing.length > 0 && !force) {
    throw new ScaffoldError(
      `target folder ${targetDir} is not empty`,
      "choose another folder, or pass --force to write into it (files with the same name are overwritten)",
    );
  }
  const written: string[] = [];
  for (const rel of await list(TEMPLATE)) {
    const dest = rel === "_gitignore" ? ".gitignore" : rel;
    let data: string | Buffer = await readFile(path.join(TEMPLATE, rel));
    if (FILLED.has(rel)) {
      data = data
        .toString("utf8")
        .replaceAll("{{name}}", name)
        .replaceAll("{{engineVersion}}", engineVersion);
    }
    await mkdir(path.dirname(path.join(targetDir, dest)), { recursive: true });
    await writeFile(path.join(targetDir, dest), data);
    written.push(dest);
  }
  return written.sort();
}
