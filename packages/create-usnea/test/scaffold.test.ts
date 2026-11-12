// SPDX-License-Identifier: Apache-2.0
process.env.USNEA_SRC = "1";

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { main as usnea } from "@usnea/cli";
import { createHeadlessBackend, createHeadlessPlatform, replay } from "@usnea/headless";
import { createApp } from "usnea";
import { Position, render2d } from "usnea/2d";
import { afterAll, describe, expect, it } from "vitest";
import { main as createUsnea } from "../src/index.js";
import { scaffold } from "../src/scaffold.js";
import { Player, Target } from "../template/components/game.js";
import { collect } from "../template/systems/collect.js";
import { move } from "../template/systems/move.js";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = path.join(PKG, "test", ".tmp");
afterAll(() => rm(TMP, { recursive: true, force: true }));

async function fresh(name = "my-game"): Promise<string> {
  await mkdir(TMP, { recursive: true });
  return path.join(await mkdtemp(path.join(TMP, "p-")), name);
}

async function cli(cwd: string, ...argv: string[]) {
  let [out, err] = ["", ""];
  const io = {
    cwd,
    stdout: (t: string) => {
      out += t;
    },
    stderr: (t: string) => {
      err += t;
    },
  };
  return { code: await usnea(argv, io), out: () => out, err: () => err };
}

async function made(name = "my-game"): Promise<string> {
  const targetDir = await fresh(name);
  await scaffold({ targetDir, name, engineVersion: "1.2.3" });
  return targetDir;
}

describe("scaffold", { timeout: 120_000 }, () => {
  it("copies the template and fills in the placeholders", async () => {
    const dir = await made();
    const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
      .sort();
    expect(files).toEqual([
      ".gitignore",
      "AGENTS.md",
      "README.md",
      "components/game.ts",
      "package.json",
      "scenes/main.scene.json",
      "systems/collect.ts",
      "systems/move.ts",
      "tests/smoke.case.json",
      "tsconfig.json",
      "usnea.json",
    ]);
    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("my-game");
    expect(pkg.dependencies).toEqual({ usnea: "^1.2.3", "@usnea/cli": "^1.2.3" });
    expect(pkg.scripts.dev).toBe("usnea dev");
    expect(JSON.parse(await readFile(path.join(dir, "usnea.json"), "utf8")).name).toBe("my-game");
    for (const f of ["README.md", "AGENTS.md"]) {
      const text = await readFile(path.join(dir, f), "utf8");
      expect(text).toContain("my-game");
      expect(text).not.toContain("{{");
    }
    expect(await readFile(path.join(dir, ".gitignore"), "utf8")).toContain("node_modules");
  });

  it("refuses a non-empty folder unless forced", async () => {
    const dir = await made();
    await expect(scaffold({ targetDir: dir, name: "my-game", engineVersion: "1" })).rejects.toThrow(
      /not empty/,
    );
    await writeFile(path.join(dir, "usnea.json"), "changed");
    await scaffold({ targetDir: dir, name: "my-game", engineVersion: "1", force: true });
    expect(await readFile(path.join(dir, "usnea.json"), "utf8")).toContain('"scene"');
  });

  it("rejects names that are not npm package names", async () => {
    const targetDir = await fresh();
    for (const name of ["My Game", "UPPER", ".hidden"]) {
      await expect(scaffold({ targetDir, name, engineVersion: "1" })).rejects.toThrow(
        /not a valid npm package name/,
      );
    }
  });

  it("the command line prints next steps and exits 1 on a non-empty folder", async () => {
    const dir = await fresh("cli-game");
    const [out, err] = [vi(), vi()];
    const stdout = process.stdout.write.bind(process.stdout);
    const stderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = out.write as typeof process.stdout.write;
    process.stderr.write = err.write as typeof process.stderr.write;
    try {
      expect(await createUsnea(["cli-game"], path.dirname(dir))).toBe(0);
      expect(await createUsnea(["cli-game"], path.dirname(dir))).toBe(1);
      expect(await createUsnea(["cli-game", "--force"], path.dirname(dir))).toBe(0);
      expect(await createUsnea([], path.dirname(dir))).toBe(2);
      expect(await createUsnea(["Bad Name"], path.dirname(dir))).toBe(1);
    } finally {
      process.stdout.write = stdout;
      process.stderr.write = stderr;
    }
    expect(out.text()).toContain("cd cli-game");
    expect(out.text()).toContain("npm install");
    expect(out.text()).toContain("npm run dev");
    expect(err.text()).toContain("is not empty");
    expect(err.text()).toContain("--force");
  });
});

function vi() {
  let text = "";
  return {
    write: (chunk: string | Uint8Array) => {
      text += String(chunk);
      return true;
    },
    text: () => text,
  };
}

describe("scaffolded project", { timeout: 120_000 }, () => {
  it("runs headless, passes its committed test and shows the player", async () => {
    const dir = await made();
    const run = await cli(dir, "run", "--headless", "--frames", "120");
    expect(run.code, run.err()).toBe(0);
    expect(JSON.parse(run.out())).toMatchObject({ steps: 120, entities: 2 });
    const test = await cli(dir, "test");
    expect(test.code, test.out() + test.err()).toBe(0);
    expect(test.out()).toContain("ok   smoke");
    const inspect = await cli(dir, "inspect", "--frames", "10");
    expect(inspect.code).toBe(0);
    const snap = JSON.parse(inspect.out());
    const player = snap.entities.find((e: { id?: string }) => e.id === "player");
    expect(player.components.Player.speed).toBe(240);
    expect(player.components.Position).toEqual({ x: 400, y: 300 });
  });

  it("moves the player and collects the target when keys are replayed", async () => {
    const backend = createHeadlessBackend();
    const app = createApp({
      plugins: [render2d({ backend, width: 800, height: 600, background: 0 })],
      components: [Player, Target],
      systems: [collect, move],
      platform: createHeadlessPlatform({
        root: path.join(PKG, "template"),
        width: 800,
        height: 600,
      }),
    });
    try {
      await app.loadScene("scenes/main.scene.json");
      const key = (step: number, code: string, down: boolean) => ({
        step,
        event: { type: "key" as const, code, down, repeat: false },
      });
      const events = [
        key(0, "ArrowRight", true),
        key(30, "ArrowRight", false),
        key(30, "ArrowUp", true),
      ];
      replay(app, { usnea: "0.1", seed: 1, step: 1 / 60, steps: 60, events });
      const position = (id: string) =>
        app.world.snapshot().entities.find((e) => e.id === id)?.components.Position;
      expect(position("player")).toMatchObject({
        x: expect.closeTo(520, 1),
        y: expect.closeTo(180, 1),
      });
      expect(position("target")).toEqual({ x: 600, y: 160 });
      app.world.add(app.world.find("target"), Position, { x: 520, y: 180 });
      app.step(1);
      expect(position("target")).not.toEqual({ x: 520, y: 180 });
      const score = app.world.snapshot().entities[0]?.components.Player?.score;
      expect(score).toBe(1);
    } finally {
      app.dispose();
    }
  });

  it("keeps the game logic within 50 lines", async () => {
    let total = 0;
    for (const folder of ["components", "systems"]) {
      for (const f of await readdir(path.join(PKG, "template", folder))) {
        const text = await readFile(path.join(PKG, "template", folder, f), "utf8");
        total += text
          .split("\n")
          .filter(
            (l) => l.trim() !== "" && !l.trim().startsWith("//") && !l.trim().startsWith("/**"),
          ).length;
      }
    }
    expect(total).toBeLessThanOrEqual(50);
  });

  it("type-checks", async () => {
    const dir = await made();
    await writeFile(
      path.join(dir, "tsconfig.check.json"),
      JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: { customConditions: ["usnea-src"] },
      }),
    );
    const tsc = path.join(
      path.dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
      "bin",
      "tsc",
    );
    const run = promisify(execFile);
    await expect(
      run(process.execPath, [tsc, "--noEmit", "-p", path.join(dir, "tsconfig.check.json")]),
    ).resolves.toBeDefined();
  });
});
