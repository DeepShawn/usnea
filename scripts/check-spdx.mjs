// SPDX-License-Identifier: Apache-2.0
// Verifies that every source file starts with the SPDX license header.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const HEADER = "// SPDX-License-Identifier: Apache-2.0";
const EXTENSIONS = /\.(?:ts|tsx|js|mjs|cjs|rs)$/;
const EXCLUDED = /(?:^|\/)(?:node_modules|dist|coverage|target)\//;

const listing = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  },
);

const files = [...new Set(listing.split("\0").filter(Boolean))].filter(
  (f) => EXTENSIONS.test(f) && !EXCLUDED.test(f) && existsSync(f),
);

const violations = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines[0]?.startsWith("#!") ? lines[1] : lines[0];
  if (first?.trim() !== HEADER) violations.push(file);
}

if (violations.length > 0) {
  console.error(
    `Missing or wrong SPDX header (expected "${HEADER}") in ${violations.length} file(s):`,
  );
  for (const f of violations) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`SPDX check passed: ${files.length} files checked.`);
