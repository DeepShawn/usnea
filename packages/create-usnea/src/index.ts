#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { assertPackageName, ScaffoldError, scaffold } from "./scaffold.js";

export { assertPackageName, ScaffoldError, type ScaffoldOptions, scaffold } from "./scaffold.js";

const USAGE = `create-usnea: create a new Usnea game project

Usage: create-usnea <folder> [--force]

  <folder>   Folder to create; its name becomes the package name
  --force    Write into a folder that is not empty (same-named files are overwritten)
`;

/** Runs the command line for `argv` (without node and script); resolves to the exit code. */
export async function main(argv: string[], cwd: string): Promise<number> {
  const out = (text: string): void => void process.stdout.write(text);
  const err = (text: string): void => void process.stderr.write(text);
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { force: { type: "boolean" }, help: { type: "boolean", short: "h" } },
    });
    const [folder] = positionals;
    if (values.help || folder === undefined || positionals.length > 1) {
      (values.help ? out : err)(USAGE);
      return values.help ? 0 : 2;
    }
    const targetDir = path.resolve(cwd, folder);
    const name = path.basename(targetDir);
    assertPackageName(name);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    await scaffold({
      targetDir,
      name,
      engineVersion: String(pkg.version),
      force: values.force === true,
    });
    const rel = path.relative(cwd, targetDir) || ".";
    out(`Created ${name} in ${targetDir}\n\nNext steps:\n`);
    out(`${rel === "." ? "" : `  cd ${rel}\n`}  npm install\n  npm run dev\n`);
    return 0;
  } catch (error) {
    if (error instanceof ScaffoldError) {
      err(`error: ${error.message}\nhint: ${error.hint}\n`);
      return 1;
    }
    err(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const entry = process.argv[1];
if (entry !== undefined && realpathSync(entry) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.cwd());
}
