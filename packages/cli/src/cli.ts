#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { main } from "./main.js";

process.exitCode = await main(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
