// SPDX-License-Identifier: Apache-2.0

declare module "virtual:usnea-project" {
  import type { Plugin } from "usnea";
  import type { ProjectConfig } from "../config.js";

  /** The project's resolved `usnea.json`. */
  export const config: ProjectConfig;
  /** Namespaces of every file under `components/` and `systems/`, keyed by project path. */
  export const modules: Record<string, Record<string, unknown>>;
  /** Default exports of the packages listed in `config.plugins`. */
  export const plugins: Plugin[];
}
