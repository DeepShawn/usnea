// SPDX-License-Identifier: Apache-2.0
import { UsneaError, usneaError } from "./errors.js";
import { defineResource } from "./resources.js";
import type { AssetLoader, AssetStore, Platform, ResourceDef } from "./types.js";

/** Internal: the asset store with the hooks the app needs. */
export interface AssetStoreInternal extends AssetStore {
  /** Connects the store to its host; called once by the app. */
  attach(host: { platform: Platform | undefined; onReady: () => void }): void;
  /** Unloads every loaded asset whose reference count is zero. */
  collect(): void;
  /** Reference count of a path (0 if unknown). For tests and tools. */
  refs(path: string): number;
  /** Unloads everything. */
  dispose(): void;
}

interface Loaded {
  value: unknown;
  loader: AssetLoader<unknown>;
}

interface Failure {
  error: UsneaError;
  reported: boolean;
}

const jsonLoader: AssetLoader<unknown> = {
  extensions: [".json"],
  async load(path, platform) {
    const text = await platform.readText(path);
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw usneaError(
        "USN-E020",
        `Asset "${path}" is not valid JSON: ${cause}`,
        "asset loading",
        "fix the JSON syntax in the file",
      );
    }
  },
};

const textLoader: AssetLoader<unknown> = {
  extensions: [".txt"],
  load: (path, platform) => platform.readText(path),
};

/** Creates an empty asset store with the built-in `.json` and `.txt` loaders. */
export function createAssetStore(): AssetStoreInternal {
  const loaders = new Map<string, AssetLoader<unknown>>();
  const loaded = new Map<string, Loaded>();
  const pending = new Map<string, Promise<unknown>>();
  const failures = new Map<string, Failure>();
  const counts = new Map<string, number>();
  let platform: Platform | undefined;
  let onReady: () => void = () => {};
  let epoch = 0;

  const register = (loader: AssetLoader<unknown>): void => {
    for (const ext of loader.extensions) loaders.set(ext.toLowerCase(), loader);
  };
  register(jsonLoader);
  register(textLoader);

  function findLoader(path: string): AssetLoader<unknown> | undefined {
    const lower = path.toLowerCase();
    let best: string | undefined;
    for (const ext of loaders.keys()) {
      if (lower.endsWith(ext) && (best === undefined || ext.length > best.length)) best = ext;
    }
    return best === undefined ? undefined : loaders.get(best);
  }

  function run(path: string): Promise<unknown> {
    const loader = findLoader(path);
    if (loader === undefined) {
      return Promise.reject(
        usneaError(
          "USN-E019",
          `No asset loader for "${path}"`,
          "asset loading",
          "use a supported file type or register a loader with assets.register()",
        ),
      );
    }
    if (platform === undefined) {
      return Promise.reject(
        usneaError(
          "USN-E020",
          `Asset "${path}" cannot be loaded without a platform`,
          "asset loading",
          "pass a platform to createApp()",
        ),
      );
    }
    const mine = epoch;
    return loader.load(path, platform).then(
      (value) => {
        if (mine !== epoch) {
          loader.unload?.(value);
          return value;
        }
        loaded.set(path, { value, loader });
        return value;
      },
      (error: unknown) => {
        if (error instanceof UsneaError && error.code === "USN-E020") throw error;
        const cause = error instanceof Error ? error.message : String(error);
        throw usneaError(
          "USN-E020",
          `Asset "${path}" failed to load: ${cause}`,
          "asset loading",
          "check that the file exists and is valid",
        );
      },
    );
  }

  function start(path: string, viaGet: boolean): Promise<unknown> {
    const promise = run(path);
    pending.set(path, promise);
    const done = (): void => {
      pending.delete(path);
      onReady();
    };
    promise.then(done, (error: unknown) => {
      pending.delete(path);
      if (viaGet && error instanceof UsneaError) failures.set(path, { error, reported: false });
      onReady();
    });
    return promise;
  }

  return {
    attach(host) {
      platform = host.platform;
      onReady = host.onReady;
    },
    register<T>(loader: AssetLoader<T>) {
      register(loader as AssetLoader<unknown>);
    },
    load<T>(path: string): Promise<T> {
      const have = loaded.get(path);
      if (have) return Promise.resolve(have.value as T);
      return (pending.get(path) ?? start(path, false)) as Promise<T>;
    },
    get<T>(path: string): T | undefined {
      const have = loaded.get(path);
      if (have) return have.value as T;
      const failure = failures.get(path);
      if (failure) {
        if (failure.reported) return undefined;
        failure.reported = true;
        throw failure.error;
      }
      if (!pending.has(path)) start(path, true).catch(() => {});
      return undefined;
    },
    retain(path) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    },
    release(path) {
      const n = counts.get(path) ?? 0;
      if (n > 0) counts.set(path, n - 1);
    },
    collect() {
      for (const [path, entry] of loaded) {
        if ((counts.get(path) ?? 0) > 0) continue;
        entry.loader.unload?.(entry.value);
        loaded.delete(path);
      }
      failures.clear();
    },
    refs: (path) => counts.get(path) ?? 0,
    dispose() {
      epoch += 1;
      for (const entry of loaded.values()) entry.loader.unload?.(entry.value);
      loaded.clear();
      failures.clear();
      counts.clear();
    },
  };
}

/** Built-in resource holding the asset store. */
export const Assets: ResourceDef<AssetStore> = defineResource<AssetStore>("Assets", () =>
  createAssetStore(),
);
