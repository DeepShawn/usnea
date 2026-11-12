// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssetStore } from "../assets.js";
import { defineComponent } from "../component.js";
import { UsneaError } from "../errors.js";
import { asset, bool, eid, f32, i32, str, u8 } from "../fields.js";
import { createKernel, type Kernel } from "../kernel.js";
import type { AssetLoader, Platform, SceneData } from "../types.js";
import { createSceneManager } from "./index.js";

const Position = defineComponent("Position", { x: f32, y: f32 });
const Velocity = defineComponent("Velocity", { x: f32, y: f32 });
const Sprite = defineComponent("Sprite", {
  image: asset,
  layer: i32,
  visible: bool.default(true),
  tint: u8,
});
const Link = defineComponent("Link", { target: eid, label: str });

let kernels: Kernel[] = [];
afterEach(() => {
  for (const k of kernels) k.dispose();
  kernels = [];
});

function setup(files: Record<string, unknown | string> = {}, plugins: string[] = ["physics"]) {
  const platform = {
    readText: async (p: string) => {
      const f = files[p];
      if (f === undefined) throw new Error(`missing ${p}`);
      return typeof f === "string" ? f : JSON.stringify(f);
    },
  } as unknown as Platform;
  const kernel = createKernel({ components: [Position, Velocity, Sprite, Link] });
  kernels.push(kernel);
  const assets = createAssetStore();
  assets.attach({ platform, onReady: () => {} });
  const unload = vi.fn();
  const loader: AssetLoader<string> = {
    extensions: [".png"],
    load: async (p) => {
      if (p.includes("broken")) throw new Error("boom");
      return `img:${p}`;
    },
    unload,
  };
  assets.register(loader);
  const scenes = createSceneManager({ kernel, assets, platform, pluginNames: plugins });
  return { kernel, assets, scenes, unload, world: kernel.world };
}

async function failure(p: Promise<unknown> | (() => unknown)): Promise<UsneaError> {
  try {
    if (typeof p === "function") p();
    else await p;
  } catch (e) {
    if (e instanceof UsneaError) return e;
    throw e;
  }
  throw new Error("expected failure");
}

const enemy = { usnea: "0.1", components: { Position: { x: 1, y: 2 }, Velocity: { x: 5 } } };
const main = {
  usnea: "0.1",
  name: "main",
  plugins: ["physics"],
  entities: [
    {
      id: "player",
      components: {
        Position: { x: 100, y: 200 },
        Velocity: { x: 0, y: 0 },
        Sprite: { image: "assets/player.png" },
      },
    },
    { id: "enemy-1", prefab: "prefabs/enemy.json", components: { Position: { x: 400 } } },
  ],
};

describe("loading", () => {
  it("loads the PLAN 4.3 example from a path", async () => {
    const t = setup({ "scenes/main.scene.json": main, "prefabs/enemy.json": enemy });
    await t.scenes.load("scenes/main.scene.json");
    const p = t.world.find("player");
    const en = t.world.find("enemy-1");
    expect(p).toBe(1);
    expect(en).toBe(2);
    expect(Position.x[p]).toBe(100);
    expect(Position.x[en]).toBe(400);
    expect(Position.y[en]).toBe(2);
    expect(Velocity.x[en]).toBe(5);
    expect(t.world.has(p, Sprite)).toBe(true);
    expect(t.assets.get("assets/player.png")).toBe("img:assets/player.png");
    expect(t.assets.refs("assets/player.png")).toBe(1);
  });

  it("resolves eid, including forward references", async () => {
    const t = setup();
    await t.scenes.load({
      usnea: "0.1",
      name: "s",
      entities: [
        { id: "a", components: { Link: { target: "b" } } },
        { id: "b", components: { Link: { target: "a" } } },
        { components: { Link: { target: 0 } } },
      ],
    });
    const a = t.world.find("a");
    const b = t.world.find("b");
    expect(t.world.resolve(Link.target[a] as number)).toBe(b);
    expect(t.world.resolve(Link.target[b] as number)).toBe(a);
    expect(Link.target[3]).toBe(0);
  });

  it("merges prefab components under the entity's own", async () => {
    const t = setup({ "p.json": enemy });
    await t.scenes.load({
      usnea: "0.1",
      name: "s",
      entities: [{ prefab: "p.json", components: { Velocity: { y: 9 }, Sprite: { layer: 2 } } }],
    });
    expect([Position.x[1], Position.y[1], Velocity.x[1], Velocity.y[1]]).toEqual([1, 2, 5, 9]);
    expect(Sprite.layer[1]).toBe(2);
    expect(Sprite.visible[1]).toBe(1);
  });

  it("replaces the previous scene and keeps shared assets", async () => {
    const t = setup({ "p.json": { usnea: "0.1", components: { Sprite: { image: "c.png" } } } });
    const scene = (name: string, images: string[]): SceneData => ({
      usnea: "0.1",
      name,
      entities: images.map((image) => ({ components: { Sprite: { image } } })),
    });
    await t.scenes.load(scene("one", ["a.png", "b.png"]));
    await t.scenes.load(scene("two", ["b.png", "d.png"]));
    expect(t.unload).toHaveBeenCalledTimes(1);
    expect(t.unload).toHaveBeenCalledWith("img:a.png");
    expect(t.assets.refs("a.png")).toBe(0);
    expect(t.assets.refs("b.png")).toBe(1);
    expect(t.world.query([Sprite]).length).toBe(2);
    expect(t.world.snapshot().entities.map((e) => e.entity)).toEqual([1, 2]);
  });

  it("leaves the old scene intact when an asset fails", async () => {
    const t = setup();
    await t.scenes.load({
      usnea: "0.1",
      name: "one",
      entities: [{ id: "old", components: { Sprite: { image: "a.png" } } }],
    });
    const err = await failure(
      t.scenes.load({
        usnea: "0.1",
        name: "two",
        entities: [
          { components: { Sprite: { image: "new.png" } } },
          { components: { Sprite: { image: "broken.png" } } },
        ],
      }),
    );
    expect(err.code).toBe("USN-E020");
    expect(err.message).toContain("broken.png");
    expect(t.world.find("old")).toBe(1);
    expect(t.assets.refs("a.png")).toBe(1);
    expect(t.assets.refs("new.png")).toBe(0);
    expect(t.assets.get("a.png")).toBe("img:a.png");
  });

  it("reports unreadable and invalid files as E011", async () => {
    const noPlatform = setup({ "bad.json": "{nope" });
    const e = await failure(noPlatform.scenes.load("bad.json"));
    expect(e.code).toBe("USN-E011");
    expect(e.message).toContain("bad.json");
    const bare = createSceneManager({
      kernel: noPlatform.kernel,
      assets: noPlatform.assets,
      platform: undefined,
      pluginNames: [],
    });
    expect((await failure(bare.load("x.json"))).code).toBe("USN-E011");
  });
});

describe("validation", () => {
  const base = (entities: unknown[], extra: object = {}) =>
    ({ usnea: "0.1", name: "v", entities, ...extra }) as unknown as SceneData;
  const cases: [string, SceneData, string, string[]][] = [
    ["version", { ...base([]), usnea: "0.2" }, "USN-E011", ['"v"', "0.2"]],
    ["shape", { usnea: "0.1", name: "v" } as unknown as SceneData, "USN-E011", ["entities"]],
    ["plugin", base([], { plugins: ["phyics"] }), "USN-E017", ['Did you mean "physics"']],
    [
      "component",
      base([{ id: "p", components: { Positon: {} } }]),
      "USN-E012",
      ['Did you mean "Position"', 'entity "p"', 'add the plugin to the scene\'s "plugins".'],
    ],
    [
      "field",
      base([{ components: { Position: { z: 1, xx: 1 } } }]),
      "USN-E013",
      ['"z"', "entity #0", 'component "Position"'],
    ],
    [
      "field typo",
      base([{ components: { Position: { xx: 1 } } }]),
      "USN-E013",
      ['Did you mean "x"'],
    ],
    ["number type", base([{ components: { Position: { x: "1" } } }]), "USN-E014", ['"x"']],
    ["int range", base([{ components: { Sprite: { tint: 256 } } }]), "USN-E014", ["tint"]],
    ["int kind", base([{ components: { Sprite: { layer: 1.5 } } }]), "USN-E014", ["layer"]],
    ["bool type", base([{ components: { Sprite: { visible: 1 } } }]), "USN-E014", ["visible"]],
    ["str type", base([{ components: { Link: { label: 3 } } }]), "USN-E014", ["label"]],
    ["eid number", base([{ components: { Link: { target: 7 } } }]), "USN-E014", ["target"]],
    ["duplicate", base([{ id: "a" }, { id: "a" }]), "USN-E015", ['"a"', "entity"]],
    [
      "eid unknown",
      base([{ id: "boss", components: { Link: { target: "bos" } } }]),
      "USN-E016",
      ['Did you mean "boss"'],
    ],
  ];
  for (const [name, scene, code, parts] of cases) {
    it(`${name} -> ${code}`, async () => {
      const t = setup();
      await t.scenes.load(base([{ id: "keep", components: { Position: { x: 9 } } }]));
      const err = await failure(t.scenes.load(scene));
      expect(err.code).toBe(code);
      for (const part of parts) expect(err.message).toContain(part);
      expect(t.world.find("keep")).toBe(1);
      expect(t.world.snapshot().entities).toHaveLength(1);
    });
  }

  it("validates prefabs before touching the world", async () => {
    const t = setup({
      "bad.json": { usnea: "0.1", components: { Link: { target: "x" } } },
      "unk.json": { usnea: "0.1", components: { Nope: {} } },
      "ver.json": { usnea: "9", components: {} },
    });
    await t.scenes.load(base([{ id: "keep" }]));
    for (const [path, code] of [
      ["bad.json", "USN-E014"],
      ["unk.json", "USN-E012"],
      ["ver.json", "USN-E011"],
    ] as const) {
      const err = await failure(t.scenes.load(base([{ prefab: path }])));
      expect(err.code).toBe(code);
      expect(err.message).toContain(path);
      expect(t.world.find("keep")).toBe(1);
    }
  });
});

describe("instantiate", () => {
  it("spawns from a cached prefab with overrides and retains assets", async () => {
    const t = setup({
      "p.json": {
        usnea: "0.1",
        components: { Position: { x: 1 }, Sprite: { image: "a.png" } },
      },
    });
    await t.scenes.load(base2({ prefabs: ["p.json"] }));
    expect(t.assets.refs("a.png")).toBe(1);
    const e = t.world.instantiate("p.json", { Position: { y: 4 }, Link: { target: 1 } });
    expect([Position.x[e], Position.y[e], Link.target[e]]).toEqual([1, 4, 1]);
    expect(t.assets.refs("a.png")).toBe(2);
  });

  it("fails with E018 and validates overrides", async () => {
    const t = setup({ "p.json": { usnea: "0.1", components: {} } });
    const missing = await failure(() => t.world.instantiate("p.json"));
    expect(missing.code).toBe("USN-E018");
    expect(missing.message).toContain('"prefabs"');
    await t.scenes.load(base2({ prefabs: ["p.json"] }));
    const codes = [
      { Positon: {} },
      { Position: { z: 1 } },
      { Position: { x: "a" } },
      { Link: { target: "name" } },
    ].map((o) => failure(() => t.world.instantiate("p.json", o)));
    expect((await Promise.all(codes)).map((e) => e.code)).toEqual([
      "USN-E012",
      "USN-E013",
      "USN-E014",
      "USN-E014",
    ]);
    expect(t.world.snapshot().entities).toHaveLength(0);
  });
});

function base2(extra: object): SceneData {
  return { usnea: "0.1", name: "i", entities: [], ...extra } as SceneData;
}

describe("snapshot", () => {
  const scene: SceneData = {
    usnea: "0.1",
    name: "snap",
    entities: [
      {
        id: "a",
        components: { Sprite: { visible: false }, Link: { target: "b" }, Position: { x: 0.5 } },
      },
      { components: { Link: { target: "a", label: "x" } } },
      { id: "b", components: { Link: {} } },
    ],
  };

  it("orders entities, components and fields; eid prints ids", async () => {
    const t = setup();
    await t.scenes.load(scene);
    const snap = t.world.snapshot();
    expect(snap.step).toBe(0);
    expect(snap.entities.map((e) => e.entity)).toEqual([1, 2, 3]);
    const [a, anon, b] = snap.entities;
    expect(Object.keys(a?.components ?? {})).toEqual(["Link", "Position", "Sprite"]);
    expect(Object.keys(a?.components.Sprite ?? {})).toEqual(["image", "layer", "visible", "tint"]);
    expect(a?.components.Sprite?.visible).toBe(false);
    expect(a?.components.Link?.target).toBe("b");
    expect(anon && "id" in anon).toBe(false);
    expect(anon?.components.Link).toEqual({ target: "a", label: "x" });
    expect(b?.components.Link?.target).toBe(0);
  });

  it("is deterministic across identical loads", async () => {
    const t = setup();
    await t.scenes.load(scene);
    const first = JSON.stringify(t.world.snapshot());
    await t.scenes.load(scene);
    expect(JSON.stringify(t.world.snapshot())).toBe(first);
  });

  it("prints the numeric handle for targets without an id", () => {
    const t = setup();
    const a = t.world.spawn();
    const b = t.world.spawn();
    t.world.add(a, Link, { target: t.world.handle(b) });
    const snap = t.world.snapshot();
    expect(snap.entities[0]?.components.Link?.target).toBe(t.world.handle(b));
  });
});

describe("schema", () => {
  it("is stable, closed, and includes defaults", () => {
    const t = setup();
    const a = JSON.stringify(t.scenes.schema());
    expect(JSON.stringify(t.scenes.schema())).toBe(a);
    const schema = JSON.parse(a);
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    const comps = schema.properties.entities.items.properties.components;
    expect(comps.additionalProperties).toBe(false);
    expect(Object.keys(comps.properties)).toEqual(["Link", "Position", "Sprite", "Velocity"]);
    const sprite = schema.$defs.Sprite;
    expect(sprite.additionalProperties).toBe(false);
    expect(sprite.properties.visible).toEqual({ type: "boolean", default: true });
    expect(sprite.properties.tint).toEqual({
      type: "integer",
      minimum: 0,
      maximum: 255,
      default: 0,
    });
    expect(sprite.properties.image).toEqual({ type: "string", default: "" });
    expect(schema.$defs.Link.properties.target.type).toEqual(["string", "integer"]);
    expect(schema.$defs.Position.properties.x).toEqual({ type: "number", default: 0 });
  });
});
