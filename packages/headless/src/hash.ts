// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import type { WorldSnapshot } from "usnea";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of Object.keys(o).sort()) {
      if (o[k] !== undefined) parts.push(`${JSON.stringify(k)}:${canonical(o[k])}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Returns a stable SHA-256 hex digest of a snapshot's canonical JSON (keys sorted). */
export function hashSnapshot(snapshot: WorldSnapshot): string {
  return createHash("sha256").update(canonical(snapshot)).digest("hex");
}
