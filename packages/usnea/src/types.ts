// SPDX-License-Identifier: Apache-2.0
//
// Core interface contract. Types only: no runtime code lives in this file.
// Behaviour that the types cannot express is specified in docs/design/core.md.

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * A live entity: the slot index used to address component columns
 * (`Position.x[e]`). Valid from spawn until despawn. Slot 0 is never used.
 */
export type Entity = number;

/**
 * A storable reference to an entity: slot index plus generation packed in a
 * 32-bit integer. Safe to keep across steps; turn it back into an `Entity`
 * with `world.resolve()`. `0` means "no entity".
 */
export type EntityHandle = number;

// ---------------------------------------------------------------------------
// Fields and components
// ---------------------------------------------------------------------------

/** Column type backing each kind of field. */
export interface ColumnTypes {
  f32: Float32Array;
  f64: Float64Array;
  i32: Int32Array;
  u32: Uint32Array;
  u16: Uint16Array;
  u8: Uint8Array;
  bool: Uint8Array;
  eid: Uint32Array;
  str: string[];
  asset: string[];
}

/** Value type accepted by `world.add()` for each kind of field. */
export interface ValueTypes {
  f32: number;
  f64: number;
  i32: number;
  u32: number;
  u16: number;
  u8: number;
  bool: boolean;
  eid: EntityHandle;
  str: string;
  asset: string;
}

/** A field descriptor: storage kind plus default value. */
export interface FieldType<K extends keyof ColumnTypes = keyof ColumnTypes> {
  readonly kind: K;
  readonly defaultValue: ValueTypes[K];
  /** Returns a copy of this field type with another default value. */
  default(value: ValueTypes[K]): FieldType<K>;
}

/** A component schema: field name to field type. Names must not start with `$`. */
export type Schema = Readonly<Record<string, FieldType>>;

/** Values accepted when adding a component; omitted fields take their default. */
export type ComponentValues<S extends Schema> = {
  [K in keyof S]?: ValueTypes[S[K]["kind"]];
};

/**
 * A component definition. Each schema field is exposed as a column indexed by
 * entity. Columns are replaced when storage grows, so do not keep a column in
 * a variable across a spawn.
 */
export type ComponentDef<S extends Schema = Schema> = {
  /** Unique component name, as used in scene files. */
  readonly $name: string;
  /** The schema this component was defined with. */
  readonly $schema: S;
} & {
  readonly [K in keyof S]: ColumnTypes[S[K]["kind"]];
};

/** Any component definition, for lists that mix schemas. */
// biome-ignore lint/suspicious/noExplicitAny: variance escape hatch for heterogeneous component lists
export type AnyComponent = ComponentDef<any>;

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

/**
 * Scheduling phase. `input`, `fixed` and `update` run once per logic step, in
 * that order, at the fixed step rate. `render` runs only when a frame is drawn.
 */
export type Phase = "input" | "fixed" | "update" | "render";

/** The entities matched by a query, as a snapshot taken when the system starts. */
export interface Entities extends Iterable<Entity> {
  readonly length: number;
  readonly [index: number]: Entity;
}

/** Declaration of a system: what it matches, what it writes, and its function. */
export interface SystemConfig {
  /** Unique system name. */
  readonly name: string;
  /** Phase to run in. Defaults to `"update"`. */
  readonly phase?: Phase;
  /** Components an entity must have. A system with a query is skipped when nothing matches. */
  readonly query?: readonly AnyComponent[];
  /** Components an entity must not have. */
  readonly without?: readonly AnyComponent[];
  /** Components read besides those in `query`; used for ordering and redraw tracking. */
  readonly reads?: readonly AnyComponent[];
  /** Components this system modifies; drives ordering and redraw tracking. */
  readonly writes?: readonly AnyComponent[];
  /** Names of systems in the same phase that must run after this one. */
  readonly before?: readonly string[];
  /** Names of systems in the same phase that must run before this one. */
  readonly after?: readonly string[];
  /**
   * The system function. Return `false` to report "nothing changed": the step
   * then neither requests a redraw nor keeps the loop awake on this system's
   * account. Any other return value counts as active.
   */
  run(world: World, dt: number, entities: Entities): boolean | undefined | void;
}

/** A defined system, ready to register with an app or plugin. */
export interface SystemDef extends SystemConfig {
  readonly phase: Phase;
}

// ---------------------------------------------------------------------------
// Events and resources
// ---------------------------------------------------------------------------

/** A typed event channel. Events are cleared at the end of each logic step. */
export interface EventDef<T> {
  readonly $name: string;
  /** Type carrier only; never read at runtime. */
  readonly $type?: T;
}

/** A typed global singleton held by the world. */
export interface ResourceDef<T> {
  readonly $name: string;
  /** Creates the initial value for a new world. */
  readonly init: () => T;
}

/** Contents of the built-in `Time` resource. */
export interface TimeState {
  /** Fixed logic step in seconds. */
  dt: number;
  /** Number of logic steps completed. */
  step: number;
  /** Simulated seconds elapsed (`step * dt`). */
  elapsed: number;
  /** Interpolation factor between the previous and current step, 0 to 1. */
  alpha: number;
}

/** Seeded random number generator; the only randomness game logic may use. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

/** All game state: entities, components, events and resources. */
export interface World {
  /** Seeded random number generator. */
  readonly rng: Rng;

  /** Creates an entity with no components. */
  spawn(): Entity;
  /** Creates an entity from a loaded prefab file, applying component overrides. */
  instantiate(prefabPath: string, overrides?: SceneComponents): Entity;
  /** Destroys an entity and all its components. */
  despawn(entity: Entity): void;
  /** Whether the entity slot is currently alive. */
  isAlive(entity: Entity): boolean;

  /** Adds a component (or resets it if present) with the given values. */
  add<S extends Schema>(
    entity: Entity,
    component: ComponentDef<S>,
    values?: ComponentValues<S>,
  ): void;
  /** Removes a component; does nothing if absent. */
  remove(entity: Entity, component: AnyComponent): void;
  /** Whether the entity has the component. */
  has(entity: Entity, component: AnyComponent): boolean;

  /** Returns a storable handle for a live entity. */
  handle(entity: Entity): EntityHandle;
  /** Returns the entity a handle refers to, or 0 if it no longer exists. */
  resolve(handle: EntityHandle): Entity;
  /** Finds an entity by its scene `id`; returns 0 if there is none. */
  find(id: string): Entity;

  /** Live view of the entities having all the given components. */
  query(components: readonly AnyComponent[], without?: readonly AnyComponent[]): Entities;

  /** Queues an event for the rest of the current logic step. */
  emit<T>(event: EventDef<T>, payload: T): void;
  /** Events of this type emitted so far in the current logic step. */
  read<T>(event: EventDef<T>): readonly T[];

  /** Returns a resource value. */
  res<T>(resource: ResourceDef<T>): T;

  /** Asks the loop to run another logic step even if every system is idle. */
  wake(): void;
  /** Asks the loop to run a logic step after this many simulated seconds. */
  wakeAfter(seconds: number): void;
  /** Forces the next frame to be drawn. */
  requestRender(): void;

  /** Exports the full world state as plain JSON, with stable key order. */
  snapshot(): WorldSnapshot;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

/** JSON value of a single component field in a scene file. */
export type SceneValue = number | boolean | string;

/** Component name to field values, as written in scene and prefab files. */
export type SceneComponents = Readonly<Record<string, Readonly<Record<string, SceneValue>>>>;

/** One entity entry in a scene file. */
export interface SceneEntity {
  /** Optional name, unique within the scene; `eid` fields refer to it. */
  readonly id?: string;
  /** Optional prefab file path, relative to the project root. */
  readonly prefab?: string;
  /** Components, overriding those of the prefab. */
  readonly components?: SceneComponents;
}

/** A scene file. */
export interface SceneData {
  /** Scene format version, currently `"0.1"`. */
  readonly usnea: string;
  readonly name: string;
  /** Names of plugins the scene requires. */
  readonly plugins?: readonly string[];
  /** Prefab files to preload for `world.instantiate()`. */
  readonly prefabs?: readonly string[];
  readonly entities: readonly SceneEntity[];
}

/** A prefab file: one entity's components. */
export interface PrefabData {
  readonly usnea: string;
  readonly components: SceneComponents;
}

/** Result of `world.snapshot()`: the state needed to compare two runs. */
export interface WorldSnapshot {
  readonly step: number;
  readonly entities: readonly {
    readonly entity: Entity;
    readonly id?: string;
    readonly components: SceneComponents;
  }[];
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** Turns a file into a usable asset, and frees it again. */
export interface AssetLoader<T> {
  /** File name suffixes handled, e.g. `[".png", ".jpg"]`. Longest match wins. */
  readonly extensions: readonly string[];
  load(path: string, platform: Platform): Promise<T>;
  unload?(asset: T): void;
}

/** Contents of the built-in `Assets` resource: lazy, reference-counted loading. */
export interface AssetStore {
  /** Returns the asset if loaded; otherwise starts loading and returns undefined. */
  get<T>(path: string): T | undefined;
  /** Loads an asset and resolves when it is ready. */
  load<T>(path: string): Promise<T>;
  /** Adds a reference; assets with no references are unloaded on scene change. */
  retain(path: string): void;
  /** Drops a reference. */
  release(path: string): void;
  /** Registers a loader for file extensions. */
  register<T>(loader: AssetLoader<T>): void;
}

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

/** An opaque decoded image owned by the platform. */
export interface PlatformImage {
  readonly width: number;
  readonly height: number;
  /** Platform-specific pixel source; only render backends look inside. */
  readonly source: unknown;
}

/** Style for text rasterised by the platform. */
export interface TextStyle {
  readonly font: string;
  readonly size: number;
  /** Wrap width in pixels; 0 disables wrapping. */
  readonly wrapWidth: number;
  readonly align: "left" | "center" | "right";
}

/** An event delivered by the platform. Coordinates are in surface pixels. */
export type PlatformEvent =
  | {
      readonly type: "key";
      readonly code: string;
      readonly down: boolean;
      readonly repeat: boolean;
    }
  | {
      readonly type: "pointer";
      readonly phase: "down" | "move" | "up" | "cancel";
      readonly kind: "mouse" | "touch" | "pen";
      readonly id: number;
      readonly button: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: "wheel"; readonly dx: number; readonly dy: number }
  | {
      readonly type: "resize";
      readonly width: number;
      readonly height: number;
      readonly pixelRatio: number;
    }
  | { readonly type: "visibility"; readonly visible: boolean };

/** Persistent key-value storage. */
export interface PlatformStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Everything the engine needs from its host. The only code allowed to touch
 * host APIs (browser, Node, native) is an implementation of this interface.
 */
export interface Platform {
  readonly name: string;
  /** Monotonic time in seconds. */
  now(): number;
  /** Calls back before the next display refresh. */
  requestFrame(callback: (now: number) => void): number;
  cancelFrame(id: number): void;
  /** Calls back once after a delay in seconds. */
  setTimer(callback: () => void, seconds: number): number;
  clearTimer(id: number): void;
  /** Subscribes to platform events; returns an unsubscribe function. */
  onEvent(listener: (event: PlatformEvent) => void): () => void;
  /** Current drawable size. */
  readonly surface: {
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
    /** Platform-specific drawing target (a canvas on the web); only render backends use it. */
    readonly native: unknown;
  };
  /** Reads a project file as text. Paths are relative to the project root. */
  readText(path: string): Promise<string>;
  /** Reads a project file as bytes. */
  readBytes(path: string): Promise<Uint8Array>;
  /** Decodes an image file. */
  loadImage(path: string): Promise<PlatformImage>;
  /** Rasterises text to an image; absent on platforms without font support. */
  rasterizeText?(text: string, style: TextStyle): PlatformImage;
  readonly storage: PlatformStorage;
}

// ---------------------------------------------------------------------------
// Plugins and app
// ---------------------------------------------------------------------------

/** A bundle of components, systems, events and resources. */
export interface Plugin {
  readonly name: string;
  readonly components?: readonly AnyComponent[];
  readonly systems?: readonly SystemDef[];
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous list
  readonly events?: readonly EventDef<any>[];
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous list
  readonly resources?: readonly ResourceDef<any>[];
  /** Optional initialisation, called once after registration. */
  setup?(app: App): void;
}

/** Options for `createApp`. Everything is optional. */
export interface AppConfig extends Omit<Plugin, "name" | "setup"> {
  readonly plugins?: readonly Plugin[];
  /** Host platform. Without one the app can only be stepped manually. */
  readonly platform?: Platform;
  /** Logic step in seconds. Defaults to 1/60. */
  readonly step?: number;
  /** Seed for `world.rng`. Defaults to 1. */
  readonly seed?: number;
  /** Record injected platform events for replay. Defaults to false. */
  readonly record?: boolean;
  /** Draw every frame regardless of changes (debugging). Defaults to false. */
  readonly alwaysRender?: boolean;
}

/** Counters describing what the loop has done; used by tests and benchmarks. */
export interface AppStats {
  /** Logic steps executed. */
  readonly steps: number;
  /** Frames drawn (render phase executions). */
  readonly renders: number;
  /** Whether the loop is currently stopped waiting for a wake source. */
  readonly idle: boolean;
}

/** A recorded input session: replaying it reproduces the run exactly. */
export interface Recording {
  readonly usnea: string;
  readonly seed: number;
  readonly step: number;
  /** Total logic steps recorded. */
  readonly steps: number;
  readonly events: readonly { readonly step: number; readonly event: PlatformEvent }[];
}

/** A running engine instance: a world plus its loop, platform and plugins. */
export interface App {
  readonly world: World;
  readonly platform: Platform | undefined;
  readonly stats: AppStats;

  /** Replaces the current scene with one loaded from a path or from data. */
  loadScene(scene: string | SceneData): Promise<void>;
  /** JSON Schema for scene files, generated from the registered components. */
  sceneSchema(): Record<string, unknown>;

  /** Starts the platform-driven loop. Requires a platform. */
  start(): void;
  /** Stops the loop. */
  stop(): void;
  /** Runs logic steps immediately, drawing afterwards if needed. For tests and headless runs. */
  step(count?: number): void;
  /** Delivers a platform event as if the platform had produced it. */
  inject(event: PlatformEvent): void;
  /** The events recorded so far; requires `record: true`. */
  recording(): Recording;

  /** Stops the loop and releases the world's component storage. */
  dispose(): void;
}
