// SPDX-License-Identifier: Apache-2.0
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashSnapshot, saveRecording } from "@usnea/headless";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../src/main.js";
import { capture, cleanTmp, copyFixture } from "./helpers.js";

afterAll(cleanTmp);

async function cli(cwd: string, ...argv: string[]) {
  const io = capture(cwd);
  const code = await main(argv, io);
  return { code, out: io.out(), err: io.err() };
}

const key = (step: number, code: string) => ({
  step,
  event: { type: "key" as const, code, down: true, repeat: false },
});

describe("usnea test", { timeout: 60_000 }, () => {
  it("fails on a wrong hash, writes the snapshot, and --update fixes it", async () => {
    const dir = await copyFixture();
    await mkdir(path.join(dir, "tests"));
    const file = path.join(dir, "tests", "main.case.json");
    await writeFile(
      file,
      JSON.stringify({ scene: "scenes/main.scene.json", steps: 60, expect: { hash: "bad" } }),
    );

    const fail = await cli(dir, "test");
    expect(fail.code).toBe(1);
    expect(fail.out).toContain("FAIL main");
    expect(fail.out).toContain("expected: bad");
    const actual = JSON.parse(await readFile(path.join(dir, "tests", "main.actual.json"), "utf8"));
    expect(actual.step).toBe(60);

    const upd = await cli(dir, "test", "--update");
    expect(upd.code).toBe(0);
    const text = await readFile(file, "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    const hash = JSON.parse(text).expect.hash as string;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(text).toBe(
      `${JSON.stringify({ scene: "scenes/main.scene.json", steps: 60, expect: { hash } }, null, 2)}\n`,
    );

    const ok = await cli(dir, "test");
    expect(ok.code).toBe(0);
    expect(ok.out).toContain("ok   main");
    await expect(stat(path.join(dir, "tests", "main.actual.json"))).rejects.toThrow();
  });

  it("applies recorded input", async () => {
    const dir = await copyFixture();
    await mkdir(path.join(dir, "tests"));
    const recording = saveRecording({
      usnea: "0.1",
      seed: 1,
      step: 0,
      steps: 60,
      events: [key(5, "Space"), key(10, "Space"), key(20, "ArrowDown")],
    });
    await writeFile(path.join(dir, "tests", "keys.rec"), recording);
    const base = { scene: "scenes/main.scene.json", steps: 60 };
    await writeFile(path.join(dir, "tests", "plain.case.json"), JSON.stringify(base));
    await writeFile(
      path.join(dir, "tests", "keys.case.json"),
      JSON.stringify({ ...base, recording: "keys.rec" }),
    );
    expect((await cli(dir, "test")).code).toBe(1);
    expect((await cli(dir, "test", "--update")).code).toBe(0);
    const hashOf = async (n: string) =>
      JSON.parse(await readFile(path.join(dir, "tests", n), "utf8")).expect.hash;
    const plain = await hashOf("plain.case.json");
    const keys = await hashOf("keys.case.json");
    expect(keys).not.toBe(plain);
    expect((await cli(dir, "test")).code).toBe(0);

    const run = await cli(dir, "run", "--headless", "--replay", "tests/keys.rec");
    expect(JSON.parse(run.out)).toMatchObject({ steps: 60, hash: keys });
    const longer = await cli(
      dir,
      "run",
      "--headless",
      "--replay",
      "tests/keys.rec",
      "--frames",
      "70",
    );
    expect(JSON.parse(longer.out)).toMatchObject({ steps: 70 });
    const inspected = await cli(dir, "inspect");
    expect([inspected.code, inspected.err]).toEqual([0, ""]);
  });

  it("inspect --replay plays a recording with its seed, --frames extends it", async () => {
    const dir = await copyFixture();
    const space = Array.from({ length: 8 }, (_, i) => key(3 + i * 4, "Space"));
    const write = (name: string, seed: number) =>
      writeFile(
        path.join(dir, name),
        saveRecording({ usnea: "0.1", seed, step: 1 / 60, steps: 60, events: space }),
      );
    await write("a.rec", 1);
    await write("b.rec", 2);
    const snap = async (...argv: string[]) => {
      const r = await cli(dir, "inspect", ...argv);
      expect([r.code, r.err]).toEqual([0, ""]);
      return JSON.parse(r.out);
    };
    const player = (s: {
      entities: { id?: string; components: Record<string, Record<string, unknown>> }[];
    }) => s.entities.find((e) => e.id === "player")?.components;
    const a = await snap("--replay", "a.rec");
    expect(a.step).toBe(60);
    expect(player(a)?.Player.speed).toBe(60 + 8 * 7);
    expect(player(a)?.Player.score).toBeGreaterThanOrEqual(8);
    const run = await cli(dir, "run", "--headless", "--replay", "a.rec");
    expect(hashSnapshot(a)).toBe(JSON.parse(run.out).hash);
    const b = await snap("--replay", "b.rec");
    expect(player(b)?.Player.score).not.toBe(player(a)?.Player.score);
    expect(await snap("--replay", "a.rec", "--seed", "2")).toEqual(a);
    expect((await snap("--replay", "a.rec", "--frames", "75")).step).toBe(75);
    expect((await snap("--seed", "5", "--frames", "3")).step).toBe(3);
    const bad = await cli(dir, "inspect", "--replay", "missing.rec");
    expect(bad.code).toBe(1);
    expect(bad.err).toContain("recording file not found");
  });

  it("explains what to do when there is nothing to test", async () => {
    const dir = await copyFixture();
    const r = await cli(dir, "test");
    expect(r.code).toBe(0);
    expect(r.out).toContain("no tests found");
  });

  it("runs the project's vitest files", async () => {
    const dir = await copyFixture();
    await writeFile(
      path.join(dir, "systems", "sample.test.ts"),
      'import { expect, it } from "vitest";\nit("adds", () => { expect(1 + 1).toBe(2); });\n',
    );
    const pass = await cli(dir, "test");
    expect(pass.code).toBe(0);
    expect(pass.out).toContain("running vitest");
    await writeFile(
      path.join(dir, "systems", "sample.test.ts"),
      'import { expect, it } from "vitest";\nit("fails", () => { expect(1).toBe(2); });\n',
    );
    expect((await cli(dir, "test")).code).toBe(1);
  });
});
