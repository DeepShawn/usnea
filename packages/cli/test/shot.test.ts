// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../src/main.js";
import { capture, cleanTmp, copyFixture, decodePng } from "./helpers.js";

afterAll(cleanTmp);

describe("usnea shot", { timeout: 60_000 }, () => {
  it("renders the sprite where it is, and is deterministic", async () => {
    const dir = await copyFixture();
    const shoot = async (file: string, ...extra: string[]) => {
      const io = capture(dir);
      const code = await main(["shot", "-o", file, ...extra], io);
      expect({ code, err: io.err() }).toEqual({ code: 0, err: "" });
      return readFile(path.join(dir, file));
    };
    const a = await shoot("a.png");
    const b = await shoot("b.png");
    expect(Buffer.compare(a, b)).toBe(0);

    const png = decodePng(a);
    expect([png.width, png.height]).toEqual([320, 240]);
    // Player: 32x32 box centred at (41, 100) after one step; background is #101820.
    const [r, g, bl] = png.pixel(41, 100);
    expect([r, g, bl]).not.toEqual([0x10, 0x18, 0x20]);
    expect(r).toBeGreaterThan(200);
    expect(png.pixel(315, 235).slice(0, 3)).toEqual([0x10, 0x18, 0x20]);
    // Coin: 16x16 box at (200, 60) from the prefab.
    expect(png.pixel(200, 60)[0]).toBeGreaterThan(200);
  });

  it("honours --frames, --width/--height and a scene argument", async () => {
    const dir = await copyFixture();
    const io = capture(dir);
    expect(
      await main(
        ["shot", "-o", "late.png", "--frames", "60", "--width", "160", "--height", "120"],
        io,
      ),
    ).toBe(0);
    const png = decodePng(await readFile(path.join(dir, "late.png")));
    expect([png.width, png.height]).toEqual([160, 120]);
    expect(await main(["shot", "scenes/static.scene.json", "-o", "s.png"], io)).toBe(0);
    const still = decodePng(await readFile(path.join(dir, "s.png")));
    expect(still.pixel(160, 120)[0]).toBeGreaterThan(200);
    expect(still.pixel(10, 10).slice(0, 3)).toEqual([0x10, 0x18, 0x20]);
  });

  it("asks for -o", async () => {
    const io = capture(await copyFixture());
    expect(await main(["shot"], io)).toBe(2);
    expect(io.err()).toContain("-o out.png");
  });
});
