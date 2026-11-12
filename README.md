# Usnea

English | [简体中文](README.zh-CN.md)

A lightweight 2D game engine built for vibe coding. One codebase is meant to run on Web, Windows, Linux and Android, with TypeScript + ECS, plain-text scenes, an npm plugin ecosystem, on-demand rendering to save power, and the ability to convert projects from other engines.

> **Status: v0.1 in development, nothing published yet.** The core (ECS, scheduler, scenes, on-demand render loop), the WebGL2 and headless backends, the web platform layer, the `usnea` command line (`dev`, `run`, `inspect`, `shot`, `test`) and one example game exist and are tested. Plugins, multi-platform packaging and importers are **not implemented yet**; those parts of this page describe the roadmap. The name "Usnea" (松萝) is provisional.

## Goals

Each goal has an acceptance criterion in [docs/PLAN.md](docs/PLAN.md) (written in Chinese).

- Convenient: no editor to install; one command to start.
- Easy to write: few interfaces and few concepts.
- Good for vibe coding: an AI can read the docs, change the code and verify the result itself.
- Low energy use by default, without the user tuning anything.
- Ecosystem: plugins are ordinary npm packages; official and third-party plugins use the same interfaces.
- Cross-platform: the same project packages to Web, Windows, Linux and Android.
- Convertible: import 2D projects from Cocos Creator, Phaser, Godot and Unity.

## Non-goals (before 1.0)

- 3D rendering.
- A graphical editor (scenes are edited as text, by hand or by AI).
- Console platforms (PlayStation, Xbox, Switch).
- Native packaging for Apple platforms (macOS, iOS). The web build may open in Apple browsers, but it is not tested or guaranteed.
- Writing our own physics, audio decoding or network protocol; existing open-source libraries will be wrapped.
- Visual shader editors, skeletal animation editors and similar content tools.

## Design principles

1. Everything is text. Scenes, prefabs, config and asset manifests are JSON.
2. Tiny core. Anything that can be a plugin is not in the core.
3. Data and logic are separate. Components hold data; systems are functions; one system per file.
4. Low power by default. Do not redraw an unchanged frame; stop the main loop when idle.
5. AI can verify its own work. Every feature can run headless, take screenshots and export state.
6. Errors teach. Each error message states the cause and the fix.
7. One codebase, all platforms. Game code, plugins and the core never call browser APIs directly; everything goes through a platform layer.

## Interface sketch (draft)

This runs today. The API may still change before 1.0. See [examples/catch](examples/catch) for a complete small game and [docs/design/core.md](docs/design/core.md) for how the core behaves.

```ts
import { defineComponent, defineSystem, f32 } from "usnea";

export const Position = defineComponent("Position", { x: f32, y: f32 });
export const Velocity = defineComponent("Velocity", { x: f32, y: f32 });

export const movement = defineSystem({
  name: "movement",
  query: [Position, Velocity],
  writes: [Position],
  run(world, dt, entities) {
    for (const e of entities) {
      Position.x[e] += Velocity.x[e] * dt;
      Position.y[e] += Velocity.y[e] * dt;
    }
  },
});
```

## Target platforms

Web, Windows, Linux and Android. The planned first stage wraps the web build in a native shell; an experimental native runtime is a later possibility. Only the Web target works today.

## Roadmap

Sizes are relative effort; no dates are promised.

- v0.0 Start (small): repository layout, license files, bilingual README, `AGENTS.md`, CI, npm placeholder package.
- v0.1 Core (large): ECS, scheduler, events, JSON scenes, platform layer, WebGL2 sprites, on-demand render loop, headless mode, basic CLI, one example game.
- v0.2 Ecosystem (medium): plugin interface, official plugins (input, audio, physics, UI, tween), generated `llms.txt`, recipes, error codes.
- v0.3 Multi-platform packaging (medium): `usnea build --target` for Web, Windows, Linux and Android, plus a device plugin.
- v0.4 Import, phase 1 (large): importer framework and report, Cocos Creator and Phaser importers, compatibility layers, tilemap plugin.
- v0.5 Energy and mini-game platforms (medium): benchmarks, measurements on four platforms, WeChat and Douyin mini-games, particles, WebGPU evaluation.
- v0.6 Import, phase 2 (large): Godot and Unity importers with compatibility layers.
- v0.7 Native runtime (large, experimental): Rust + wgpu runtime; may be postponed past 1.0.
- v1.0 Stable (medium): frozen core API, full documentation, migration guide, data mods.

## Repository structure

Packages under `plugins/`, `compat/` and `importers/` are still empty skeletons.

```
usnea/
├─ packages/    core, render-webgl2, headless, platform-web, cli, create-usnea
├─ shells/      per-platform shells (tauri, electron)
├─ runtime-native/   native runtime (v0.7, Rust)
├─ plugins/     input, audio, physics2d, ui, tween, device, tilemap ...
├─ compat/      cocos, phaser, godot, unity
├─ importers/   core, cocos, phaser, godot, unity
├─ examples/    example games
├─ benchmarks/  energy and performance benchmarks
└─ docs/        documentation, recipes, llms.txt generator
```

## Development

Requires Node >= 22 and pnpm. `pnpm verify` runs everything CI runs except the audit. Try the example with `pnpm --filter @usnea/example-catch dev`.

```
pnpm install
pnpm check       # lint and format (Biome)
pnpm typecheck
pnpm test
pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before sending changes.

## License

- Code: Apache-2.0.
- Documentation and example assets: CC BY 4.0.

Other engines (Cocos Creator, Phaser, Godot, Unity) are mentioned only to describe what the importers are for. This does not imply any official partnership.

## More

The full plan (Chinese): [docs/PLAN.md](docs/PLAN.md).
