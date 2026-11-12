// SPDX-License-Identifier: Apache-2.0
import { createWebPlatform } from "../../src/index.js";

const platform = createWebPlatform();
const events: unknown[] = [];
platform.onEvent((e) => events.push(e));
Object.assign(window, { platform, events });
