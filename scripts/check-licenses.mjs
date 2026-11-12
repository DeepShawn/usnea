// SPDX-License-Identifier: Apache-2.0
// Fails if any installed dependency uses a license outside the allowlist.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "ISC",
  "Zlib",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  "CC-BY-4.0",
]);

// package name -> reason it is allowed despite a non-allowlisted license.
export const EXCEPTIONS = {
  lightningcss:
    "MPL-2.0 (file-level copyleft); dev-only transitive dep of vite/vitest, used unmodified and not redistributed",
  "lightningcss-linux-x64-gnu":
    "MPL-2.0; platform binary of lightningcss (dev-only, unmodified, not redistributed)",
  "lightningcss-linux-x64-musl":
    "MPL-2.0; platform binary of lightningcss (dev-only, unmodified, not redistributed)",
};

function tokenize(expr) {
  return expr.match(/\(|\)|[^\s()]+/g) ?? [];
}

/** Returns true if the SPDX expression is satisfied by the allowlist. */
export function isAllowed(expression, allowed = ALLOWED) {
  const tokens = tokenize(expression);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseOr() {
    let result = parseAnd();
    while (peek()?.toUpperCase() === "OR") {
      next();
      const rhs = parseAnd();
      result = result || rhs;
    }
    return result;
  }
  function parseAnd() {
    let result = parseAtom();
    while (peek()?.toUpperCase() === "AND") {
      next();
      const rhs = parseAtom();
      result = result && rhs;
    }
    return result;
  }
  function parseAtom() {
    const tok = next();
    if (tok === undefined) throw new Error(`Unexpected end of license expression: ${expression}`);
    if (tok === "(") {
      const value = parseOr();
      if (next() !== ")") throw new Error(`Unbalanced parentheses: ${expression}`);
      return value;
    }
    if (tok === ")") throw new Error(`Unbalanced parentheses: ${expression}`);
    // "+" suffix (or-later) and WITH exceptions are not on the allowlist unless exact.
    let id = tok;
    if (peek()?.toUpperCase() === "WITH") {
      next();
      id = `${id} WITH ${next()}`;
    }
    return allowed.has(id);
  }

  try {
    const value = parseOr();
    return pos === tokens.length && value;
  } catch {
    return false;
  }
}

function main() {
  const out = execFileSync("pnpm", ["licenses", "list", "--json"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const byLicense = JSON.parse(out);

  const counts = {};
  const violations = [];
  const excepted = [];
  for (const [license, packages] of Object.entries(byLicense)) {
    counts[license] = (counts[license] ?? 0) + packages.length;
    if (isAllowed(license)) continue;
    for (const pkg of packages) {
      if (Object.hasOwn(EXCEPTIONS, pkg.name)) {
        excepted.push(pkg.name);
        continue;
      }
      for (const version of pkg.versions ?? ["?"]) {
        violations.push({ name: pkg.name, version, license });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `Found ${violations.length} dependency version(s) with non-allowlisted licenses:`,
    );
    for (const v of violations) console.error(`  ${v.name}@${v.version}  ${v.license}`);
    process.exit(1);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`License check passed: ${total} packages (${excepted.length} via EXCEPTIONS).`);
}

const self = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (self === realpathSync(fileURLToPath(import.meta.url))) main();
