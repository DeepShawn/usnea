# Core design (v0.1)

This is the behavioural contract for the core package. The type contract is in
`packages/usnea/src/types.ts` and `packages/usnea/src/2d/types.ts`. Where this
document and the plan (`docs/PLAN.md`) differ, this document wins; the
differences are listed in the last section.

Do not change the two `types.ts` files while implementing. If the contract is
wrong or incomplete, stop and report it.

## 1. Packages and entry points

| Entry | Contents |
|---|---|
| `usnea` | ECS, scheduler, events, resources, scenes, assets, app and loop, platform interface |
| `usnea/2d` | Standard 2D components, draw-list builder, render backend interface |
| `@usnea/platform-web` | `Platform` for browsers |
| `@usnea/render-webgl2` | `RenderBackend` for WebGL2 |
| `@usnea/headless` | `Platform` and `RenderBackend` for Node, plus replay helpers |

`usnea` main entry exports (budget: 60, counting types):

- Field types: `f32 f64 i32 u32 u16 u8 bool eid str asset`
- Functions: `defineComponent defineSystem defineEvent defineResource definePlugin createApp`
- Values: `Time` (resource), `Assets` (resource), `RawInput` (event of `PlatformEvent`), `UsneaError`
- Every type exported from `types.ts`

The core has no runtime dependencies and never touches host globals
(`window`, `document`, `process`, `performance`, `setTimeout`, ...). Everything
comes through `Platform`.

## 2. Entities and storage

- An `Entity` is a slot index. Slot 0 is never allocated, so a zeroed `eid`
  column means "no entity".
- An `EntityHandle` packs the slot index in the low 20 bits and the generation
  in the high 12 bits. `resolve()` returns 0 when the generation does not match.
- A slot freed by `despawn` is reused only after the current logic step ends.
  This keeps the `entities` snapshot of a running system free of impostors.
- Component storage belongs to the component definition (`Position.x`). A
  definition can be bound to one live app at a time. Creating a second app with
  the same definition throws USN-E004 until the first is disposed.
  `app.dispose()` unbinds and zeroes the columns.
- All columns of all components bound to an app have the same capacity. It
  starts at 1024 and doubles when a spawn exceeds it. Growing replaces every
  column, which is why columns must not be cached across a spawn.
- Numeric fields are TypedArray columns. `bool` is a `Uint8Array` of 0 or 1.
  `str` and `asset` are plain `string[]` columns. `asset` marks the string as a
  project-relative file path so scene loading can preload and retain it.
- `add` on an entity that already has the component resets every field (given
  values, then defaults). `remove` and `despawn` reset the fields to defaults.
- Structural changes (`spawn`, `despawn`, `add`, `remove`) take effect
  immediately. A running system keeps iterating the snapshot it was given;
  check `world.isAlive(e)` or `world.has(e, C)` if the system itself removes
  things from its own query.
- Queries are cached by signature and kept up to date incrementally (sparse
  set). `world.query()` returns a view that is valid until the next structural
  change; call it again afterwards. The `entities` argument of `run` is a
  snapshot copy held in a per-system buffer that is reused.
- Hot paths (system dispatch, query maintenance, event read) allocate nothing
  per step once warmed up.

## 3. Systems and scheduling

- Phases: `input`, `fixed`, `update`, `render`. Default phase is `update`.
- Order inside a phase is a stable topological sort:
  1. explicit `before` / `after`;
  2. a system that writes component C runs before a system that reads C
     (`query` and `reads`) without writing it;
  3. otherwise registration order (plugins in list order, then the app's own).
  If rule 2 produces a cycle, the edges in the cycle are dropped and
  registration order decides. A cycle in rule 1 throws USN-E007.
- A system with a `query` is skipped when the query is empty. A system without
  a `query` always runs and receives an empty `entities`.
- `dt` is always the fixed step (`Time.dt`) in `input`, `fixed` and `update`.
  In `render` it is the same value; render systems should use `Time.alpha`.
- A system is **active** in a step when it ran and did not return `false`.

## 4. Main loop

One **logic step**:

1. Move queued platform events into the `RawInput` event channel (and into the
   recording if enabled). `resize` and `visibility` are also handled by the
   core itself.
2. Run `input`, `fixed`, `update` systems.
3. Clear all event channels. Release freed entity slots.
4. `Time.step += 1`, `Time.elapsed = Time.step * Time.dt`.

A step is **dirty** when any of these happened during it:

- an active system declares `writes` that intersect the *visible set*;
- `add`, `remove` or `despawn` touched a component in the visible set (this
  also covers code outside systems, such as scene loading);
- `world.requestRender()` was called.

The **visible set** is the union of `query` and `reads` over all registered
`render`-phase systems. With no render systems nothing is ever drawn.

A step is **awake** when any non-render system was active, or `world.wake()`
was called during it.

One **frame** (called by `platform.requestFrame`, argument `now` in seconds):

```
acc += min(now - last, 0.25); last = now
k = floor(acc / dt)
if k > 4: k = 4 and acc = 4 * dt          // drop the backlog
repeat k times: logicStep(); acc -= dt
alpha = acc / dt

draw = false
if any step in this frame was dirty:        draw = true; interpolating = true
else if k > 0 and interpolating:            draw = true; interpolating = false; alpha = 1
else if k == 0 and interpolating:           draw = true
if renderRequested or alwaysRender:         draw = true
if draw: Time.alpha = interpolate ? alpha : 1; run render phase; stats.renders += 1

if last step awake, or events are queued, or interpolating: requestFrame
else: go idle
```

With `interpolate: false`, `interpolating` is never set, so frames between
steps are not drawn.

**Idle.** The loop holds no frame request. It leaves idle when a platform
event arrives, `world.wake()` / `app.inject()` is called, or a `wakeAfter`
deadline passes (armed with `platform.setTimer` on entering idle). On leaving
idle: `Time.step += floor(idleSeconds / dt)` (simulated time follows wall time
while idle), `last = now`, `acc = dt` so exactly one step runs on the first
frame. Skipping steps is sound because a system that returns `false` promises
it changed nothing.

**Hidden.** On `visibility: false` the loop stops and time does not advance.
On `visibility: true` it resumes like leaving idle but without advancing
`Time.step`, and forces a draw.

**Resize** forces a draw.

**Manual stepping.** `app.step(n)` runs n logic steps, then draws once if any
of them was dirty (with `alpha = 1`). It never idles and never skips steps.
It works with or without a platform. `app.inject(event)` queues an event for
the next step.

**Determinism.** State after N steps depends only on the seed, the scene and
the injected events with their step numbers. Game logic must take randomness
from `world.rng` and time from `Time`. A `Recording` lists events with the
step they were delivered in; replaying means `inject` before the matching
`step`. `world.rng` is a small seeded generator (for example mulberry32).

**Snapshot.** `world.snapshot()` lists live entities in ascending slot order,
components sorted by name, fields in schema order. `eid` fields are written as
the target's scene `id` when it has one, otherwise the numeric handle. Numbers
are written as-is (no rounding).

## 5. Scenes

`app.loadScene(pathOrData)`:

1. Read and parse (path) or take the object.
2. Validate everything before changing anything: format version, shape,
   required plugins, component names, field names, value types, duplicate ids,
   `eid` targets. Unknown names get a "did you mean" suggestion (edit distance).
3. Load prefabs (those referenced by entities and those in `prefabs`) and
   retain every `asset` path found; wait for all of them to load.
4. Despawn the entities of the previous scene; release its assets; unload
   assets whose reference count reached zero.
5. Spawn entities in file order. Prefab components first, then overrides
   field by field. Resolve `eid` strings to handles.
6. Request a render and wake the loop.

Scene file convention: `scenes/<name>.scene.json`. Prefab files hold one
entity (`PrefabData`). `world.instantiate(path, overrides)` is synchronous and
requires the prefab to be loaded already (USN-E018 otherwise).

`app.sceneSchema()` returns a JSON Schema (draft 2020-12) for `SceneData`
built from the registered components, with `additionalProperties: false` on
component and field maps. Serialised output always uses a fixed key order.

## 6. Assets

The `Assets` resource holds an `AssetStore`. Loaders are chosen by the longest
matching file suffix. The core registers `.json` (parsed) and falls back to
text for `.txt`. `get()` on an unloaded path starts the load and returns
`undefined`; when the load finishes the store calls `requestRender()` and
`wake()`. A failed load throws USN-E020 from `load()` and is reported once
through `get()`.

## 7. Errors

Every error is a `UsneaError` with `code` (`USN-Exxx`) and a message of the
form: what happened, where, how to fix it. Messages are in English.

| Code | Meaning |
|---|---|
| E000 | Invalid definition (empty name, missing function) or internal wiring error |
| E001 | Duplicate component name |
| E002 | Invalid field name or field type in a schema |
| E003 | Component is not registered with this app |
| E004 | Component is bound to another live app |
| E005 | Entity is not alive |
| E006 | Duplicate system name |
| E007 | Cycle in `before` / `after` |
| E008 | `before` / `after` names an unknown system |
| E009 | Duplicate event, resource or plugin name |
| E010 | Event or resource is not registered |
| E011 | Scene or prefab file is not valid (JSON, shape, version) |
| E012 | Scene uses an unregistered component |
| E013 | Scene uses an unknown field |
| E014 | Scene field has the wrong value type |
| E015 | Duplicate entity id in a scene |
| E016 | `eid` field refers to an unknown id |
| E017 | Scene requires a plugin that is not registered |
| E018 | Prefab is not loaded |
| E019 | No asset loader for this file type |
| E020 | Asset failed to load |
| E021 | `app.start()` needs a platform |
| E022 | Recording is not enabled |
| E023 | App was used after `dispose()` |
| E024 | Too many entities (slot index exceeds 20 bits) |
| E040 | Atlas frame not found |
| E041 | Text needs `platform.rasterizeText` or a bitmap font |
| E042 | The 2D plugin needs a platform to load images |

## 8. 2D rendering (`usnea/2d`)

Exports: `Position Rotation Scale Sprite NineSlice Text Camera render2d` and
the types in `2d/types.ts`. `render2d(options)` returns a `Plugin` named
`"usnea/2d"`.

Coordinates are in world pixels, y down. Colours are `0xRRGGBBAA`.

| Component | Fields (default) |
|---|---|
| `Position` | `x` f32 (0), `y` f32 (0) |
| `Rotation` | `angle` f32 radians, clockwise (0) |
| `Scale` | `x` f32 (1), `y` f32 (1) |
| `Sprite` | `image` asset (""), `width` f32 (0 = natural), `height` f32 (0 = natural), `anchorX` f32 (0.5), `anchorY` f32 (0.5), `color` u32 (0xffffffff), `flipX` bool, `flipY` bool, `layer` i32 (0), `order` f32 (0), `visible` bool (true) |
| `NineSlice` | `left top right bottom` f32 (0): insets in source pixels; applies to the entity's `Sprite` |
| `Text` | `text` str, `font` str ("sans-serif"), `size` f32 (16), `color` u32 (0xffffffff), `align` str ("left"), `wrapWidth` f32 (0), `anchorX` f32 (0), `anchorY` f32 (0), `layer` i32 (0), `order` f32 (0), `visible` bool (true) |
| `Camera` | `zoom` f32 (1), `active` bool (true) |

- `Sprite.image` is an image path, or `path/to.atlas.json#frameName`.
- `Text.font` ending in `.font.json` is a bitmap font (one quad per glyph);
  anything else is a font family rasterised by `platform.rasterizeText` into a
  texture cached per entity and rebuilt when text, font, size, wrap or align
  change.
- Draw order: `layer` ascending, then `order` ascending, then entity slot.
- Camera: the first entity with an active `Camera` and a `Position` defines
  the view centre and zoom (and `Rotation` if present). Without one, the view's
  top-left corner is the world origin.
- View transform: the design resolution (`width` x `height`) is fitted inside
  the surface, preserving aspect ratio and centred ("contain").
- The plugin registers asset loaders for `.png .jpg .jpeg .webp` (texture),
  `.atlas.json` and `.font.json`.
- Interpolation: an `input`-phase system copies `Position`, `Rotation` and
  `Scale` columns to private "previous" arrays at the start of each step and
  returns `false`. The draw-list builder blends previous and current with
  `Time.alpha`.
- One `render`-phase system builds the `DrawList` and calls
  `backend.render(frame)`. The draw-list arrays grow by doubling and are reused.

Backends only draw quads. Consecutive quads with the same texture must become
one draw call.

## 9. Source layout for `packages/usnea/src`

```
types.ts            contract (do not edit)
errors.ts           UsneaError, message helpers, edit distance
fields.ts           field types
component.ts        defineComponent, storage binding and growth
world.ts            entities, structural changes, handles, queries
system.ts           defineSystem
schedule.ts         ordering, dispatch, active and dirty tracking
events.ts           defineEvent, channels
resources.ts        defineResource, Time, Assets, RawInput
rng.ts              seeded generator
assets.ts           AssetStore
scene/validate.ts   validation and suggestions
scene/load.ts       loading, prefabs, instantiate
scene/schema.ts     JSON Schema generation
scene/snapshot.ts   world.snapshot
plugin.ts           definePlugin
loop.ts             frame, idle, wake, visibility
app.ts              createApp
index.ts            main entry
2d/types.ts         contract (do not edit)
2d/components.ts    standard components
2d/assets.ts        texture, atlas and font loaders
2d/text.ts          text layout and caching
2d/drawlist.ts      draw-list builder and view transform
2d/index.ts         entry for usnea/2d
```

Files stay under 200 lines; split further when needed. Tests live next to the
code as `*.test.ts`.

## 10. Differences from the plan

1. **`update` runs at the fixed rate.** The plan implies a variable-rate
   `update` phase. Here `input`, `fixed` and `update` all run once per logic
   step with the same `dt`; only `render` follows the display. This makes
   every run exactly reproducible from its recording, and smoothness comes
   from interpolation.
2. **Entity vs handle.** The plan's "32-bit integer (index + generation)" is
   the `EntityHandle`. Systems work with the slot index so that
   `Position.x[e]` stays a plain array access.
3. **Systems are awake by default.** A system that ran keeps the loop awake
   and, if it writes visible components, marks the frame dirty, unless it
   returns `false`. The safe default is "keeps working"; returning `false` is
   how a system opts into sleeping.
4. **Standard 2D components live in `usnea/2d`**, a second entry point of the
   core package. Backends receive a ready-made quad list, so a future native
   or WebGPU backend needs no knowledge of components.
5. **`noUncheckedIndexedAccess` is off**, because it would make
   `Position.x[e] += ...` a type error.
