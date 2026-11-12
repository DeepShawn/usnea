// SPDX-License-Identifier: Apache-2.0
// Tests for scripts/check-globals.mjs. Run: node scripts/check-globals.test.mjs

import assert from "node:assert/strict";
import { findGlobals } from "./check-globals.mjs";

// window.innerWidth on line 1, column 1
assert.deepEqual(findGlobals("window.innerWidth"), [{ line: 1, column: 1, name: "window" }]);

// Right line and column on a later line
{
  const src = "const a = 1;\n  const w = window.innerWidth;";
  assert.deepEqual(findGlobals(src), [
    { line: 2, column: src.split("\n")[1].indexOf("window") + 1, name: "window" },
  ]);
}

// Member access is not a global use
assert.deepEqual(findGlobals("foo.document; world.performance; a?.fetch"), []);

// Forbidden words inside strings, template literals, and comments are ignored
assert.deepEqual(
  findGlobals(
    [
      'const a = "window";',
      "const b = 'document';",
      "const c = `fetch`;",
      "// setTimeout here",
      "/* console.log(window) */ const d = 1;",
    ].join("\n"),
  ),
  [],
);

// Object keys and type members are not global uses
assert.deepEqual(findGlobals("const o = { document: 1 };"), []);
assert.deepEqual(findGlobals("interface X { window: number; navigator?: string }"), []);

// Calls are reported
assert.deepEqual(findGlobals("setTimeout(() => {}, 1)"), [
  { line: 1, column: 1, name: "setTimeout" },
]);

// console.log is reported
assert.deepEqual(findGlobals('console.log("x")'), [{ line: 1, column: 1, name: "console" }]);

// Allow comment on the same line suppresses the finding
assert.deepEqual(findGlobals("window.innerWidth; // usnea-allow-global: viewport size"), []);

// Allow comment on the line directly above suppresses the finding
assert.deepEqual(findGlobals("// usnea-allow-global: viewport size\nwindow.innerWidth"), []);

// Allow comment two lines above does not suppress it
assert.deepEqual(findGlobals("// usnea-allow-global: viewport size\n\nwindow.innerWidth"), [
  { line: 3, column: 1, name: "window" },
]);

// Identifiers that only contain a forbidden word are not reported
assert.deepEqual(findGlobals("const windowSize = 1; const myDocument = 2; processInput();"), []);

// Local declarations and import or export specifiers are not uses
assert.deepEqual(findGlobals("const window = 1;"), []);
assert.deepEqual(findGlobals('import { fetch } from "./net.js";'), []);
assert.deepEqual(findGlobals('import Image from "./image.js";'), []);
assert.deepEqual(findGlobals("export { console, process };"), []);

// A regex literal containing a quote does not hide later code
{
  const src = "const r = /[\"']/g;\nconst q = document;";
  assert.deepEqual(findGlobals(src), [
    { line: 2, column: src.split("\n")[1].indexOf("document") + 1, name: "document" },
  ]);
}

console.log("ok");
