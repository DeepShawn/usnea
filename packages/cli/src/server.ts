// SPDX-License-Identifier: Apache-2.0
import type { AddressInfo } from "node:net";
import {
  createServer,
  defaultClientConditions,
  defaultServerConditions,
  type Logger,
  searchForWorkspaceRoot,
  type ViteDevServer,
} from "vite";
import type { Io } from "./io.js";
import { CLI_ROOT, usneaPlugin } from "./vite-plugin.js";

/** Options for `startServer`. */
export interface ServerOptions {
  readonly root: string;
  readonly io: Io;
  /** Serve the browser page and listen on a port; otherwise middleware mode for `ssrLoadModule`. */
  readonly listen?: { readonly port: number; readonly host: string | boolean };
}

function logger(io: Io): Logger {
  const seen = new Set<string>();
  const warn = (msg: string): void => io.stderr(`${msg}\n`);
  return {
    hasWarned: false,
    info: () => undefined,
    warn: warn,
    warnOnce: (msg) => {
      if (!seen.has(msg)) warn(msg);
      seen.add(msg);
    },
    error: (msg) => io.stderr(`${msg}\n`),
    clearScreen: () => undefined,
    hasErrorLogged: () => false,
  };
}

/** Starts a Vite server for the project; engine sources resolve through `usnea-src` when `USNEA_SRC=1`. */
export async function startServer(o: ServerOptions): Promise<ViteDevServer> {
  const src = process.env.USNEA_SRC === "1";
  const server = await createServer({
    root: o.root,
    configFile: false,
    envDir: false,
    appType: "custom",
    clearScreen: false,
    customLogger: logger(o.io),
    plugins: [usneaPlugin(o.root, o.listen !== undefined)],
    resolve: {
      dedupe: ["usnea"],
      ...(src ? { conditions: [...defaultClientConditions, "usnea-src"] } : {}),
    },
    ssr: {
      noExternal: ["usnea", /^@usnea\//],
      resolve: { ...(src ? { conditions: [...defaultServerConditions, "usnea-src"] } : {}) },
    },
    optimizeDeps: o.listen ? {} : { noDiscovery: true, include: [] },
    server: o.listen
      ? {
          port: o.listen.port,
          host: o.listen.host,
          fs: { allow: [o.root, searchForWorkspaceRoot(o.root), CLI_ROOT] },
        }
      : { middlewareMode: true, watch: null, ws: false },
  });
  if (o.listen) await server.listen();
  return server;
}

/** The port a listening server ended up on. */
export function serverPort(server: ViteDevServer): number {
  const addr = server.httpServer?.address();
  return (addr as AddressInfo | null)?.port ?? 0;
}
