// SPDX-License-Identifier: Apache-2.0
// CI guard: engine and game code must not use browser or host globals directly.
// Only the platform layer may touch host APIs.
//
// Usage: node scripts/check-globals.mjs
// Detection is token-based (no parser): comments and string/template/regex literal
// contents are blanked first, then forbidden names are matched as whole words.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FORBIDDEN_GLOBALS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "performance",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Image",
  "Audio",
  "AudioContext",
  "HTMLCanvasElement",
  "OffscreenCanvas",
  "process",
  "globalThis",
  "console",
];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [
  "packages/usnea/src",
  "plugins",
  "compat",
  "examples",
  "packages/create-usnea/template",
];
const SKIP_DIR_NAMES = new Set(["node_modules", "dist"]);
const ALLOW_RE = /\/\/\s*usnea-allow-global:\s*\S/;

// Whole word, not after "." (member access or optional chaining) or "#" (private field),
// not followed by ":" or "?:" (object key or type member), not the name of a local declaration.
const NAME_RE = new RegExp(
  String.raw`(?<![\w$#])(?<!\.\s*#?)(?<!\b(?:const|let|var|function|class|interface|type|enum)\s+)(${FORBIDDEN_GLOBALS.join("|")})(?![\w$])(?!\??\s*:)`,
  "g",
);

// Import clauses and export specifier lists, whose names are not uses.
const IMPORT_RE =
  /\bimport\s*(?:type\s+)?(?:[\w$]+\s*,?\s*)?(?:\*\s*as\s+[\w$]+\s*)?(?:\{[^}]*\}\s*)?\bfrom\b|\bexport\s*(?:type\s+)?\{[^}]*\}/g;

const WORD_RE = /[A-Za-z_$][\w$]*/y;
const REGEX_AFTER_WORDS = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "void",
  "yield",
  "await",
  "instanceof",
  "new",
  "delete",
  "throw",
]);
const REGEX_AFTER_CHARS = "(,=:[!&|?{};+-*%<>~^";

function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

function regexAllowedAfter(prevChar) {
  return prevChar === "" || REGEX_AFTER_CHARS.includes(prevChar) || prevChar === ";";
}

// Returns a string of the same length and line structure as the input, with comments and
// the contents of string, template and regex literals replaced by spaces.
function maskNonCode(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  // Last significant emitted char: '' at start, 'v' for a value (identifier, literal, closer).
  let prevChar = "";

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "/" && next === "/") {
      let end = src.indexOf("\n", i);
      if (end === -1) end = n;
      out.push(blank(src.slice(i, end)));
      i = end;
      continue;
    }

    if (c === "/" && next === "*") {
      const close = src.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      out.push(blank(src.slice(i, end)));
      i = end;
      prevChar = "v";
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      const end = Math.min(j + 1, n);
      out.push(blank(src.slice(i, end)));
      i = end;
      prevChar = "v";
      continue;
    }

    if (c === "`") {
      // Limitation: a template's ${...} expressions are blanked along with the text.
      let j = i + 1;
      while (j < n && src[j] !== "`") j += src[j] === "\\" ? 2 : 1;
      const end = Math.min(j + 1, n);
      out.push(blank(src.slice(i, end)));
      i = end;
      prevChar = "v";
      continue;
    }

    if (c === "/" && regexAllowedAfter(prevChar)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n && src[j] !== "\n") {
        const d = src[j];
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (inClass) {
          if (d === "]") inClass = false;
        } else if (d === "[") {
          inClass = true;
        } else if (d === "/") {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        let end = j + 1;
        while (end < n && /[A-Za-z]/.test(src[end])) end++;
        out.push(blank(src.slice(i, end)));
        i = end;
        prevChar = "v";
        continue;
      }
    }

    if (/[A-Za-z_$]/.test(c)) {
      WORD_RE.lastIndex = i;
      const word = WORD_RE.exec(src)[0];
      out.push(word);
      i += word.length;
      prevChar = REGEX_AFTER_WORDS.has(word) ? ";" : "v";
      continue;
    }

    out.push(c);
    if (!/\s/.test(c)) prevChar = c === ")" || c === "]" || c === "}" ? "v" : c;
    i++;
  }

  return out.join("");
}

function importRanges(masked) {
  const ranges = [];
  for (const m of masked.matchAll(IMPORT_RE)) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

// Finds forbidden global uses in TypeScript source. Returns 1-based line and column.
// A finding is exempt when `// usnea-allow-global: <reason>` is on its line or the line above.
export function findGlobals(sourceText) {
  const masked = maskNonCode(sourceText);
  const rawLines = sourceText.split("\n");
  const lineStarts = [0];
  for (let k = 0; k < sourceText.length; k++) {
    if (sourceText[k] === "\n") lineStarts.push(k + 1);
  }
  const ranges = importRanges(masked);
  const findings = [];

  for (const m of masked.matchAll(NAME_RE)) {
    const index = m.index;
    if (ranges.some(([start, end]) => index >= start && index < end)) continue;

    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    const line = lo + 1;
    const column = index - lineStarts[lo] + 1;

    const here = rawLines[line - 1] ?? "";
    const above = line >= 2 ? (rawLines[line - 2] ?? "") : "";
    if (ALLOW_RE.test(here) || ALLOW_RE.test(above)) continue;

    findings.push({ line, column, name: m[1] });
  }
  return findings;
}

function collectFiles(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) collectFiles(full, root, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    // Tests: *.test.ts, and *.test.tsx by the same intent.
    if (/\.test\.tsx?$/.test(entry.name)) continue;
    const rel = path.relative(root, full).split(path.sep).join("/");
    const slashed = `/${rel}`;
    if (slashed.includes("/test/") || slashed.includes("/fixtures/")) continue;
    out.push({ abs: full, rel });
  }
}

export function main(root = REPO_ROOT) {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (existsSync(abs) && statSync(abs).isDirectory()) collectFiles(abs, root, files);
  }

  let findingCount = 0;
  const badFiles = new Set();
  for (const file of files) {
    const text = readFileSync(file.abs, "utf8");
    for (const f of findGlobals(text)) {
      findingCount++;
      badFiles.add(file.rel);
      process.stdout.write(`${file.rel}:${f.line}:${f.column}  forbidden global "${f.name}"\n`);
    }
  }

  if (findingCount > 0) {
    process.stdout.write(
      `\n${findingCount} finding(s) in ${badFiles.size} file(s). Scanned ${files.length} file(s).\n`,
    );
    return 1;
  }
  process.stdout.write(`No forbidden globals found. Scanned ${files.length} file(s).\n`);
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  process.exitCode = main();
}
