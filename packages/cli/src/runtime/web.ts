// SPDX-License-Identifier: Apache-2.0
// Browser entry, served through the virtual module "virtual:usnea-entry". This is browser glue
// and may use DOM APIs. URL parameters: usnea-scene, usnea-debug (redraw, always-render),
// usnea-record, usnea-shot (step count; manual stepping for `usnea shot`).

import { config, modules, plugins } from "virtual:usnea-project";
import { createWebPlatform } from "@usnea/platform-web";
import { createWebGL2Backend } from "@usnea/render-webgl2";
import type { App } from "usnea";
import { buildApp, formatRecording } from "./shared.js";

declare global {
  interface Window {
    usnea?: { app: App; saveRecording(): string };
    __usneaShot?: string;
  }
}

function showRedrawOverlay(app: App): void {
  const el = document.createElement("div");
  el.id = "usnea-redraw";
  el.style.cssText =
    "position:fixed;top:4px;left:4px;padding:2px 6px;font:12px monospace;color:#fff;" +
    "background:rgba(0,0,0,.6);pointer-events:none;z-index:2147483647";
  document.body.appendChild(el);
  let last = "";
  const update = (): void => {
    const text = `draws ${app.stats.renders} steps ${app.stats.steps}`;
    if (text === last) return;
    last = text;
    el.textContent = text;
  };
  update();
  window.setInterval(update, 200);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const debug = new Set((params.get("usnea-debug") ?? "").split(","));
  const shot = params.get("usnea-shot");
  const record = params.has("usnea-record");
  const platform = createWebPlatform();
  const backend = createWebGL2Backend(platform.surface.native as HTMLCanvasElement, {
    pixelArt: config.pixelArt,
  });
  const app = buildApp({
    config,
    modules,
    plugins,
    platform,
    backend,
    record,
    alwaysRender: debug.has("always-render"),
  });
  if (record) window.usnea = { app, saveRecording: () => formatRecording(app.recording()) };
  await app.loadScene(params.get("usnea-scene") ?? config.scene);
  if (shot !== null) {
    app.step(Math.max(1, Number(shot) || 1));
    window.__usneaShot = "done";
    return;
  }
  app.start();
  if (debug.has("redraw")) showRedrawOverlay(app);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  window.__usneaShot = `error: ${message}`;
  console.error(message);
  const pre = document.createElement("pre");
  pre.style.cssText = "position:fixed;inset:0;margin:0;padding:12px;color:#f88;background:#200";
  pre.textContent = message;
  document.body.appendChild(pre);
});
