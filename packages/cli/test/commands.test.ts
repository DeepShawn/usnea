// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../src/main.js";
import { capture, cleanTmp, copyFixture, FIXTURE } from "./helpers.js";

afterAll(cleanTmp);

async function cli(cwd: string, ...argv: string[]) {
  const io = capture(cwd);
  const code = await main(argv, io);
  return { code, out: io.out(), err: io.err() };
}

describe("usage and errors", { timeout: 60_000 }, () => {
  it("lists every command in the usage text", async () => {
    const r = await cli(FIXTURE, "--help");
    expect(r.code).toBe(0);
    for (const c of [
      "dev",
      "run",
      "inspect",
      "shot",
      "test",
      "build",
      "import",
      "plugin",
      "doctor",
    ]) {
      expect(r.out).toContain(`  ${c}`);
    }
  });

  it("exits 2 for an unknown command", async () => {
    const r = await cli(FIXTURE, "frobnicate");
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown command "frobnicate"');
  });

  it("exits 2 for unimplemented commands and names the milestone", async () => {
    const planned = { build: "v0.3", import: "v0.4", plugin: "v0.2", doctor: "v0.2" };
    for (const [name, milestone] of Object.entries(planned)) {
      const r = await cli(FIXTURE, name);
      expect(r.code).toBe(2);
      expect(r.err).toContain(`not implemented yet (planned for ${milestone})`);
    }
  });

  it("hints at `usnea dev` when --headless is missing", async () => {
    const r = await cli(FIXTURE, "run");
    expect(r.code).toBe(2);
    expect(r.err).toContain("usnea dev");
  });

  it("reports a missing scene file with a fix", async () => {
    const r = await cli(FIXTURE, "run", "--headless", "--scene", "scenes/nope.scene.json");
    expect(r.code).toBe(1);
    expect(r.err).toContain('scene file "scenes/nope.scene.json" not found');
    expect(r.err).toContain("scenes/main.scene.json");
  });

  it("reports a project without usnea.json and a wrongly typed field", async () => {
    const dir = await copyFixture();
    await writeFile(path.join(dir, "usnea.json"), '{ "width": "wide" }');
    const r = await cli(dir, "run", "--headless");
    expect(r.code).toBe(1);
    expect(r.err).toContain('"width" must be a positive number');
    const none = await cli(path.dirname(dir), "run", "--headless");
    expect(none.err).toContain("usnea.json not found");
  });

  it("prints the engine error for a scene with an unknown component", async () => {
    const dir = await copyFixture();
    await writeFile(
      path.join(dir, "scenes", "broken.scene.json"),
      JSON.stringify({ usnea: "0.1", name: "b", entities: [{ components: { Velocty: {} } }] }),
    );
    const r = await cli(dir, "run", "--headless", "--scene", "scenes/broken.scene.json");
    expect(r.code).toBe(1);
    expect(r.err).toContain("USN-E012");
    expect(r.err).toContain('Did you mean "Velocity"');
  });
});

describe("run --headless", { timeout: 60_000 }, () => {
  it("prints one JSON line that is stable between runs", async () => {
    const a = await cli(FIXTURE, "run", "--headless", "--frames", "120");
    const b = await cli(FIXTURE, "run", "--headless", "--frames", "120");
    const c = await cli(FIXTURE, "run", "--headless", "--frames", "121");
    expect(a.code).toBe(0);
    const stats = JSON.parse(a.out) as Record<string, unknown>;
    expect(stats).toMatchObject({ scene: "scenes/main.scene.json", steps: 120, entities: 2 });
    expect(stats.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(b.out).hash).toBe(stats.hash);
    expect(JSON.parse(c.out)).toMatchObject({ steps: 121 });
    expect(JSON.parse(c.out).hash).not.toBe(stats.hash);
  });

  it("selects a scene with --scene", async () => {
    const r = await cli(
      FIXTURE,
      "run",
      "--headless",
      "--frames",
      "5",
      "--scene",
      "scenes/static.scene.json",
    );
    expect(JSON.parse(r.out)).toMatchObject({ scene: "scenes/static.scene.json", entities: 1 });
  });
});

describe("inspect", { timeout: 60_000 }, () => {
  it("lists entity ids and component values", async () => {
    const r = await cli(FIXTURE, "inspect");
    expect(r.code).toBe(0);
    expect(r.out).toContain('\n  "entities": [');
    const snap = JSON.parse(r.out);
    const player = snap.entities.find((e: { id?: string }) => e.id === "player");
    const coin = snap.entities.find((e: { id?: string }) => e.id === "coin");
    expect(player.components.Position).toEqual({ x: 40, y: 100 });
    expect(player.components.Velocity.vx).toBe(60);
    expect(coin.components.Position).toEqual({ x: 200, y: 60 });
    expect(coin.components.Sprite.image).toBe("assets/box.png");
  });

  it("advances the mover by velocity * time", async () => {
    const r = await cli(FIXTURE, "inspect", "--frames", "60");
    const player = JSON.parse(r.out).entities.find((e: { id?: string }) => e.id === "player");
    expect(player.components.Position.x).toBeCloseTo(100, 3);
    expect(player.components.Position.y).toBe(100);
  });

  it("writes to a file with -o", async () => {
    const dir = await copyFixture();
    const r = await cli(dir, "inspect", "scenes/static.scene.json", "-o", "out.json");
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
    expect(JSON.parse(await readFile(path.join(dir, "out.json"), "utf8")).entities).toHaveLength(1);
  });
});
