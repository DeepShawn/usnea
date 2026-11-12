// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { loadConfig, type ProjectConfig } from "./config.js";

const ENTRY = "virtual:usnea-entry";
const PROJECT = "virtual:usnea-project";
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path of a runtime glue file: the `.ts` source in the repo, the `.js` build otherwise. */
export function runtimeFile(name: "headless" | "web" | "shared"): string {
  const ts = path.join(HERE, "runtime", `${name}.ts`);
  return existsSync(ts) ? ts : path.join(HERE, "runtime", `${name}.js`);
}

/** Directory of this package, which the dev server must be allowed to serve from. */
export const CLI_ROOT = path.dirname(HERE).endsWith("dist")
  ? path.dirname(path.dirname(HERE))
  : path.dirname(HERE);

/** Source of the virtual module that lists the project's files and plugins. */
export function projectModuleSource(config: ProjectConfig): string {
  const imports = config.plugins.map((p, i) => `import plugin${i} from ${JSON.stringify(p)};`);
  return [
    ...imports,
    `export const config = ${JSON.stringify(config)};`,
    "export const modules = import.meta.glob(",
    '  ["/components/**/*.ts", "/systems/**/*.ts", "!/**/*.test.ts", "!/**/*.d.ts"],',
    "  { eager: true },",
    ");",
    `export const plugins = [${config.plugins.map((_, i) => `plugin${i}`).join(", ")}];`,
  ].join("\n");
}

/** The page served at `/`: a full-window canvas on the configured background. */
export function indexHtml(config: ProjectConfig): string {
  const title = config.name.replace(/[<&]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:${config.background}}canvas{display:block;width:100%;height:100%}</style>
</head>
<body>
<script type="module">import "${ENTRY}";</script>
</body>
</html>
`;
}

/** Vite plugin providing the virtual entry/project modules, and for the dev server the page and reloads. */
export function usneaPlugin(root: string, serveHtml: boolean): Plugin {
  return {
    name: "usnea",
    resolveId(id) {
      return id === ENTRY || id === PROJECT ? `\0${id}` : undefined;
    },
    async load(id) {
      if (id === `\0${ENTRY}`) return `import ${JSON.stringify(`/@fs${runtimeFile("web")}`)};`;
      if (id === `\0${PROJECT}`) return projectModuleSource(await loadConfig(root));
      return undefined;
    },
    configureServer(server) {
      if (!serveHtml) return;
      const reload = (): void => server.ws.send({ type: "full-reload", path: "*" });
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? "/").split("?")[0];
        if (url !== "/" && url !== "/index.html") return next();
        try {
          const html = await server.transformIndexHtml(
            "/index.html",
            indexHtml(await loadConfig(root)),
            req.originalUrl,
          );
          res.setHeader("content-type", "text/html");
          res.end(html);
        } catch (err) {
          next(err);
        }
      });
    },
    handleHotUpdate({ file, server }) {
      if (!serveHtml) return undefined;
      if (path.basename(file) === "usnea.json") {
        const mod = server.moduleGraph.getModuleById(`\0${PROJECT}`);
        if (mod) server.moduleGraph.invalidateModule(mod);
      }
      server.ws.send({ type: "full-reload", path: "*" });
      return [];
    },
  };
}
