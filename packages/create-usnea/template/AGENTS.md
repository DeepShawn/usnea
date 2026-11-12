# AGENTS.md: {{name}}

A 2D game on the Usnea engine (`usnea` {{engineVersion}}). Read this first; it only describes what exists today.

## Layout

- `usnea.json`: `name`, `scene`, `width`, `height`, `background` (`#rrggbb`), `stepHz`, `seed`, `pixelArt`.
- `components/*.ts`: `defineComponent` definitions. `systems/*.ts`: `defineSystem` definitions.
  The CLI loads every exported component and system from these two folders (nothing else).
- `scenes/*.scene.json`, `prefabs/*.prefab.json`: entities as JSON. `tests/*.case.json`: replay cases.

## Verify loop (run after every change; no human needed)

1. `npx usnea test`: replay cases (and `*.test.ts` through Vitest if present). `--update` rewrites hashes.
2. `npx usnea run --headless --frames 120`: prints one JSON line (steps, renders, entities, hash); errors exit 1.
3. `npx usnea inspect [scene] --frames N [-o file]`: world state as JSON; check the numbers.
4. `npx usnea shot -o shot.png [--frames N]`: screenshot via Chromium (needs `playwright`); look at it.

Also: `npx usnea dev [--port N]` serves the game. URL switches: `usnea-scene=<path>`,
`usnea-debug=redraw` (overlay with draw and step counts), `usnea-debug=always-render`, `usnea-record`
(then `window.usnea.saveRecording()` in the console gives text for `tests/<name>.rec`).
A case is `{"scene": "...", "recording": "x.rec", "steps": 600, "expect": {"hash": "..."}}`.
`build`, `import`, `plugin`, `doctor` print "not implemented yet".

## Rules

- Components hold data only. Systems are plain functions. One system per file, under 200 lines.
- All state lives in the world (components). No module-level variables.
- Randomness only from `world.rng`; time only from `dt` and `Time`. Never `Math.random` or `Date`.
- No browser or Node globals (`window`, `document`, `console`, `setTimeout`, `process`, ...) in game code.
- A system that changed nothing must `return false`; that lets the loop idle and skip drawing.
  Any other return value (including none) means "active".
- Scenes are JSON validated on load; errors carry codes `USN-Exxx` with cause and fix (E012 unknown
  component, E013 unknown field, E014 wrong value type). Fix the JSON, do not work around it.
- Start every source file with `// SPDX-License-Identifier: Apache-2.0`.

## API cheat sheet

```ts
import { defineComponent, defineSystem, f32, i32, bool, str, RawInput, Time } from "usnea";
import { Position, Sprite, Text, Camera, Rotation, Scale } from "usnea/2d";
```
- `defineComponent(name, schema)`. Field types: `f32 f64 i32 u32 u16 u8 bool eid str asset`;
  `f32.default(5)` sets a default. A field is a column: `Player.speed[e]`; booleans are 0 or 1.
  Do not keep a column in a variable across a spawn (columns are replaced when storage grows).
- `defineSystem({ name, phase?, query?, without?, reads?, writes?, before?, after?, run })`.
  `phase`: `"input" | "fixed" | "update" | "render"`; the first three run once per step at the same
  fixed `dt` (default `"update"`). `run(world, dt, entities): boolean | void`. A system with a `query`
  is skipped when nothing matches. `writes` of visible components (Position, Sprite, Text) trigger a redraw.
- `world`: `spawn() despawn(e) isAlive(e) add(e, C, values?) remove(e, C) has(e, C)
  find(sceneId) handle(e) resolve(h) query([C...], without?) instantiate(prefabPath, overrides?)
  emit(Event, payload) read(Event) res(Resource) wake() wakeAfter(sec) requestRender() snapshot()`,
  and `world.rng.next()` / `world.rng.int(maxExclusive)`. `world.find` returns 0 if absent.
- Input: `world.read(RawInput)` gives this step's `PlatformEvent`s:
  `{type:"key", code, down, repeat}` (`code` like `"ArrowLeft"`, `"Space"`, `"KeyA"`),
  `{type:"pointer", phase:"down"|"move"|"up"|"cancel", kind, id, button, x, y}` (surface pixels),
  `{type:"wheel", dx, dy}`, `{type:"resize", width, height, pixelRatio}`, `{type:"visibility", visible}`.
  Keep held-key state in a component; events last one step.
- `Time` via `world.res(Time)`: `{ dt, step, elapsed, alpha }`.
- `usnea/2d` (world pixels, y down, colours `0xRRGGBBAA`; in JSON write the number, e.g. `4278190335`):
  `Position {x,y}`, `Rotation {angle}`, `Scale {x:1,y:1}`,
  `Sprite {image:"", width:0, height:0, anchorX:.5, anchorY:.5, color:0xffffffff, flipX, flipY, layer:0, order:0, visible:true}`,
  `Text {text:"", font:"sans-serif", size:16, color, align:"left", wrapWidth:0, anchorX:0, anchorY:0, layer, order, visible}`,
  `Camera {zoom:1, active:true}` (the view follows its `Position`; without one the origin is top-left).
  A `Sprite` with an empty `image` draws a solid rectangle of `width` x `height` in `color`.
  Draw order: `layer`, then `order`, then entity. The design size from `usnea.json` is fitted into the window.
- Scene: `{"usnea":"0.1","name":"main","prefabs":["prefabs/x.prefab.json"],"entities":[
  {"id":"player","prefab":"prefabs/x.prefab.json","components":{"Position":{"x":1,"y":2}}}]}`.
  `id` is optional and unique; `world.find("player")` returns its entity. Prefab: `{"usnea":"0.1","components":{...}}`;
  entity `components` override prefab fields. Spawn at runtime with `world.instantiate("prefabs/x.prefab.json", {Position:{x:5}})`
  (list the prefab in the scene's `prefabs` first, or it throws USN-E018). Switch scene with `usnea-scene` or `usnea.json`.

## Not available yet

Input, audio, physics, UI, tween and tilemap plugins; resources and events defined with
`defineResource` / `defineEvent` are not registered by the CLI, so use components for state;
no build or packaging for Web, desktop or Android; no pointer-to-world conversion helper.
