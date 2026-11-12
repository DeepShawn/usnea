# AGENTS.md

Operating manual for AI coding agents and new contributors. Read it before changing anything.

## Project

Usnea is an open-source 2D game engine (TypeScript, Apache-2.0), built as a pnpm monorepo.
Current state: **v0.0 bootstrap**. Packages are empty skeletons; there is no engine code yet.
The authoritative plan is [docs/PLAN.md](docs/PLAN.md) (written in Chinese). When this file and
the plan disagree about the future, the plan wins; this file only states what is true today.

## Layout

- `packages/usnea` -> `usnea` (core: ECS, scheduler, events, scenes)
- `packages/render-webgl2` -> `@usnea/render-webgl2`
- `packages/headless` -> `@usnea/headless`
- `packages/platform-web` -> `@usnea/platform-web`
- `packages/cli` -> `@usnea/cli`
- `packages/create-usnea` -> `create-usnea`
- `plugins/{input,audio,physics2d,ui,tween,device,tilemap,particles}` -> `@usnea/<name>`
- `compat/{cocos,phaser,godot,unity}` -> `@usnea/compat-<name>`
- `importers/{core,cocos,phaser,godot,unity}` -> `@usnea/importer-<name>`
- `shells/`, `runtime-native/`, `examples/`, `benchmarks/` (placeholder), `docs/`
- `scripts/` CI check scripts

## Commands

Run from the repository root. Requires Node >= 22 and pnpm.

| Command | Purpose |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm check` | Biome lint + format check |
| `pnpm format` | Auto-fix lint and formatting |
| `pnpm typecheck` | `tsc` for the root and every package that defines `typecheck` |
| `pnpm test` | Vitest, all tests (passes with no tests) |
| `pnpm vitest run <path>` | Run a single test file |
| `pnpm build` | Build every package that defines `build` |
| `node scripts/check-spdx.mjs` | Verify SPDX license headers |
| `node scripts/check-licenses.mjs` | Verify dependency licenses against the allowlist |
| `pnpm changeset` | Record a changeset for a release note |

Before committing, these must all pass: `pnpm check`, `pnpm typecheck`, `pnpm test`,
`node scripts/check-spdx.mjs`, `node scripts/check-licenses.mjs`. Run `pnpm build` too when you
touched build config or package exports.

## Dependency direction

Game -> compat -> plugins -> core. Dependencies only point downward.
Core depends on no plugin, no render backend and no platform layer. Render backends
(`render-webgl2`, `headless`) and the platform layer (`platform-web`) implement interfaces
defined by core.

## Rules

Do:
- Start every source file with `// SPDX-License-Identifier: Apache-2.0` as line 1.
- Keep components as pure data and systems as plain functions; one system per file, max 200 lines
  per file.
- Access data only through `world`.
- Store numeric data in TypedArrays.
- Give every public export a type and a one-sentence doc comment.
- Give every error a code (`USN-Exxx`), the cause, and the fix.
- Use only permissive-licensed dependencies (MIT, Apache-2.0, BSD, ISC, Zlib); keep core at zero
  runtime dependencies where possible.
- Route everything platform-specific through the platform layer.

Don't:
- Use browser globals (`window`, `document`, `navigator`, `requestAnimationFrame`,
  `localStorage`, ...) in core, plugins, compat or game code. Only `packages/platform-web` and
  `packages/render-webgl2` may.
- Introduce implicit global state.
- Allocate temporary objects in hot paths.
- Export more than 60 public symbols from core.
- Use `any` or `@ts-ignore` (TypeScript strict mode is on).
- Copy source code or assets from other engines.
- Skip or delete tests to make CI green.

## Workflow

- Make small changes, one concern at a time.
- Write the test or example first, then the implementation.
- Tests live in `src/**/*.test.ts` or `test/**/*.test.ts` inside a package (see `vitest.config.ts`).
- A package `tsconfig.json` extends `../../tsconfig.base.json` (use the matching relative depth).
  If a package needs Node types, add `@types/node` to that package and set `types` itself.
- Add a changeset (`pnpm changeset`) for any public API change.
- Sign off every commit (`git commit -s`, DCO). AI-generated code gets the same review and CI.
- Formatting: Biome, 2-space indent, line width 100. Markdown and `docs/PLAN.md` are not checked.

## Verifying your work

Today, verification is the command list above: `pnpm check`, `pnpm typecheck`, `pnpm test`,
the two `scripts/` checks. The engine's own AI-verification CLI is **planned for v0.1** and does
not exist yet: `usnea test`, `usnea run --headless`, `usnea shot`, `usnea inspect`. Do not call
them.

## Design contract

- `docs/design/core.md` is the behavioural contract for the core, the loop and 2D rendering. Read it
  before touching `packages/usnea`, `packages/platform-web`, `packages/render-webgl2` or
  `packages/headless`.
- `packages/usnea/src/types.ts` and `packages/usnea/src/2d/types.ts` are the type contract. Do not
  edit them as part of an implementation task; report problems instead.
- Packages import each other by package name. The `usnea-src` export condition resolves those
  imports to TypeScript sources, so no build is needed before `pnpm typecheck` or `pnpm test`.
- `pnpm verify` runs every check CI runs except the audit.
- Browser tests use the `playwright` dev dependency with headless Chromium.
- Lines-per-file limit (200) does not apply to tests, generated files or the two contract files.
- `// biome-ignore` and `@ts-expect-error` are allowed only with a stated reason.
