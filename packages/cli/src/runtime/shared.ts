// SPDX-License-Identifier: Apache-2.0
// Runtime glue shared by the headless and browser entries. Loaded through Vite, never imported
// by the CLI's own Node code.
import {
  type AnyComponent,
  type App,
  type AppConfig,
  createApp,
  type Platform,
  type Plugin,
  type Recording,
  type SystemDef,
} from "usnea";
import { type RenderBackend, render2d } from "usnea/2d";
import type { ProjectConfig } from "../config.js";

/** Components and systems found among a project's modules. */
export interface CollectedModules {
  readonly components: AnyComponent[];
  readonly systems: SystemDef[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function isComponent(v: unknown): v is AnyComponent {
  return isObject(v) && typeof v.$name === "string" && isObject(v.$schema);
}

function isSystem(v: unknown): v is SystemDef {
  return (
    isObject(v) &&
    typeof v.name === "string" &&
    typeof v.phase === "string" &&
    typeof v.run === "function"
  );
}

/** Collects every exported component and system definition, in file path order. */
export function collectModules(modules: Record<string, Record<string, unknown>>): CollectedModules {
  const components = new Set<AnyComponent>();
  const systems = new Set<SystemDef>();
  for (const file of Object.keys(modules).sort()) {
    for (const value of Object.values(modules[file] ?? {})) {
      if (isComponent(value)) components.add(value);
      else if (isSystem(value)) systems.add(value);
    }
  }
  return { components: [...components], systems: [...systems] };
}

/** Converts `#rrggbb` or `#rrggbbaa` to 0xRRGGBBAA. */
export function parseColor(hex: string): number {
  const digits = hex.slice(1);
  return Number.parseInt(digits.length === 6 ? `${digits}ff` : digits, 16) >>> 0;
}

/** Everything `buildApp` needs. */
export interface BuildOptions {
  readonly config: ProjectConfig;
  readonly modules: Record<string, Record<string, unknown>>;
  readonly plugins?: readonly Plugin[];
  readonly platform?: Platform | undefined;
  readonly backend: RenderBackend;
  readonly record?: boolean;
  readonly alwaysRender?: boolean;
  /** Overrides `config.seed`, for replaying a recording made with another seed. */
  readonly seed?: number | undefined;
}

/** Creates the app: the 2D plugin first, then project plugins, then the project's own code. */
export function buildApp(o: BuildOptions): App {
  const { config } = o;
  const render = render2d({
    backend: o.backend,
    width: config.width,
    height: config.height,
    background: parseColor(config.background),
  });
  const owned = new Set<AnyComponent>(render.components);
  const found = collectModules(o.modules);
  const appConfig: AppConfig = {
    plugins: [render, ...(o.plugins ?? [])],
    components: found.components.filter((c) => !owned.has(c)),
    systems: found.systems,
    step: 1 / config.stepHz,
    seed: o.seed ?? config.seed,
    record: o.record ?? false,
    alwaysRender: o.alwaysRender ?? false,
    ...(o.platform ? { platform: o.platform } : {}),
  };
  return createApp(appConfig);
}

/** Serialises a recording in the format of `saveRecording` from `@usnea/headless`. */
export function formatRecording(recording: Recording): string {
  const order: Record<string, readonly string[]> = {
    key: ["type", "code", "down", "repeat"],
    pointer: ["type", "phase", "kind", "id", "button", "x", "y"],
    wheel: ["type", "dx", "dy"],
    resize: ["type", "width", "height", "pixelRatio"],
    visibility: ["type", "visible"],
  };
  const head = {
    usnea: recording.usnea,
    seed: recording.seed,
    step: recording.step,
    steps: recording.steps,
  };
  const lines = [JSON.stringify(head)];
  for (const { step, event } of recording.events) {
    const src = event as unknown as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of order[event.type] ?? Object.keys(src)) ordered[key] = src[key];
    lines.push(JSON.stringify({ step, event: ordered }));
  }
  return `${lines.join("\n")}\n`;
}
