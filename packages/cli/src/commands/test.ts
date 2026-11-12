// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../config.js";
import { openHost } from "../headless.js";
import type { Io } from "../io.js";
import { findCases, runCase } from "./test-cases.js";

const SKIP = new Set(["node_modules", "dist", ".git", ".vite"]);

async function hasTestFiles(dir: string): Promise<boolean> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name) && (await hasTestFiles(path.join(dir, entry.name)))) return true;
    } else if (entry.name.endsWith(".test.ts")) {
      return true;
    }
  }
  return false;
}

/** Runs the project's own Vitest; returns true when it passed. */
async function runVitest(io: Io): Promise<boolean> {
  let entry: string;
  try {
    const require = createRequire(path.join(io.cwd, "package.json"));
    const pkgPath = require.resolve("vitest/package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.vitest;
    if (!bin) throw new Error("no bin");
    entry = path.join(path.dirname(pkgPath), bin);
  } catch {
    io.stdout("FAIL vitest: the project has *.test.ts files but vitest is not installed\n");
    io.stderr("hint: run `npm install -D vitest` in the project folder\n");
    return false;
  }
  io.stdout("running vitest\n");
  return new Promise<boolean>((resolve) => {
    const child = spawn(process.execPath, [entry, "run"], {
      cwd: io.cwd,
      env: { ...process.env, USNEA_TEST_NESTED: "1" },
    });
    child.stdout.on("data", (d: Buffer) => io.stdout(d.toString()));
    child.stderr.on("data", (d: Buffer) => io.stderr(d.toString()));
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** `usnea test [--update]`: runs replay cases in tests/, then the project's Vitest files. */
export async function testCommand(args: string[], io: Io): Promise<number> {
  const { values } = parseArgs({ args, options: { update: { type: "boolean" } } });
  const root = path.resolve(io.cwd);
  await loadConfig(root);
  const cases = await findCases(root);
  // A nested run is the project's own Vitest calling `usnea test`: replay cases only.
  const nested = process.env.USNEA_TEST_NESTED === "1";
  const unitTests = !nested && (await hasTestFiles(root));
  if (cases.length === 0 && !unitTests) {
    io.stdout(
      "no tests found. Add replay cases as tests/<name>.case.json " +
        '({"scene": "scenes/main.scene.json", "steps": 60}) and run `usnea test --update` to record hashes.\n',
    );
    return 0;
  }
  let failed = 0;
  if (cases.length > 0) {
    const host = await openHost(io);
    try {
      for (const file of cases)
        if (!(await runCase(host, io, file, values.update === true))) failed++;
    } finally {
      await host.close();
    }
    io.stdout(`${cases.length - failed}/${cases.length} replay cases passed\n`);
  }
  if (unitTests && !(await runVitest(io))) failed++;
  return failed > 0 ? 1 : 0;
}
