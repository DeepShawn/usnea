// SPDX-License-Identifier: Apache-2.0

import { readFile, writeFile } from "node:fs/promises";
import type { PlatformStorage } from "usnea";

/** Creates in-memory storage, persisted as a JSON file when `file` is given. */
export function createStorage(file?: string): PlatformStorage {
  const data = new Map<string, string>();
  let loaded: Promise<void> | undefined;
  const load = (): Promise<void> => {
    loaded ??= (async () => {
      if (!file) return;
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch {
        return;
      }
      const parsed: unknown = JSON.parse(text);
      for (const [k, v] of Object.entries(parsed as Record<string, string>)) data.set(k, v);
    })();
    return loaded;
  };
  const save = async (): Promise<void> => {
    if (file) await writeFile(file, JSON.stringify(Object.fromEntries(data), null, 2));
  };
  return {
    async get(key) {
      await load();
      return data.get(key);
    },
    async set(key, value) {
      await load();
      data.set(key, value);
      await save();
    },
    async remove(key) {
      await load();
      data.delete(key);
      await save();
    },
  };
}
