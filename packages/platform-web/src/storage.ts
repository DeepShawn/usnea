// SPDX-License-Identifier: Apache-2.0
import type { PlatformStorage } from "usnea";

const PREFIX = "usnea:";

/** Creates localStorage-backed storage that tolerates unavailable storage. */
export function createStorage(): PlatformStorage {
  const store = (): Storage | undefined => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  };
  return {
    async get(key) {
      try {
        return store()?.getItem(PREFIX + key) ?? undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      try {
        store()?.setItem(PREFIX + key, value);
      } catch {
        // Quota exceeded or storage blocked: ignore.
      }
    },
    async remove(key) {
      try {
        store()?.removeItem(PREFIX + key);
      } catch {
        // Storage blocked: ignore.
      }
    },
  };
}
