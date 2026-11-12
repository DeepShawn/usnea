// SPDX-License-Identifier: Apache-2.0

export type { FrameCopy, HeadlessBackend } from "./backend.js";
export { createHeadlessBackend } from "./backend.js";
export { hashSnapshot } from "./hash.js";
export type { HeadlessPlatform, HeadlessPlatformOptions } from "./platform.js";
export { createHeadlessPlatform } from "./platform.js";
export { parseRecording, saveRecording } from "./recording.js";
export type { ReplayOptions } from "./replay.js";
export { replay } from "./replay.js";
