// SPDX-License-Identifier: Apache-2.0
import { didYouMean, usneaError } from "./errors.js";
import type { AnyComponent, Phase, SystemDef } from "./types.js";

function closure(n: number, edge: boolean[][]): boolean[][] {
  const reach = edge.map((row) => [...row]);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (!reach[i]?.[k]) continue;
      for (let j = 0; j < n; j++) if (reach[k]?.[j]) (reach[i] as boolean[])[j] = true;
    }
  }
  return reach;
}

/**
 * Internal: stable topological order of one phase (see docs/design/core.md section 3).
 * `systems` are in registration order; `phases` maps every registered name to its phase.
 */
export function orderPhase(
  systems: readonly SystemDef[],
  phases: ReadonlyMap<string, Phase>,
): SystemDef[] {
  const n = systems.length;
  const index = new Map(systems.map((s, i) => [s.name, i]));
  const grid = () => Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const edge = grid();
  const lookup = (from: SystemDef, name: string): number => {
    const i = index.get(name);
    if (i !== undefined) return i;
    const other = phases.get(name);
    throw usneaError(
      "USN-E008",
      `System "${from.name}" refers to ${other ? `"${name}", which runs in phase "${other}"` : `unknown system "${name}"`}`,
      `before/after of "${from.name}" (phase "${from.phase}")`,
      other
        ? "before/after only order systems within one phase"
        : `use a registered system name.${didYouMean(name, index.keys())}`,
    );
  };
  systems.forEach((s, i) => {
    for (const name of s.after ?? []) (edge[lookup(s, name)] as boolean[])[i] = true;
    for (const name of s.before ?? []) (edge[i] as boolean[])[lookup(s, name)] = true;
  });
  const explicit = closure(n, edge);
  const cyclic = systems.filter((_, i) => explicit[i]?.[i]).map((s) => s.name);
  if (cyclic.length > 0) {
    throw usneaError(
      "USN-E007",
      `Cycle in before/after between ${cyclic.map((c) => `"${c}"`).join(", ")}`,
      `phase "${systems[0]?.phase}"`,
      "remove one of the before/after constraints in the cycle",
    );
  }
  const reads = systems.map((s) => new Set<AnyComponent>([...(s.query ?? []), ...(s.reads ?? [])]));
  const writes = systems.map((s) => new Set<AnyComponent>(s.writes ?? []));
  const implied: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      for (const c of writes[i] as Set<AnyComponent>) {
        if ((reads[j] as Set<AnyComponent>).has(c) && !(writes[j] as Set<AnyComponent>).has(c)) {
          implied.push([i, j]);
          break;
        }
      }
    }
  }
  const all = edge.map((row) => [...row]);
  for (const [i, j] of implied) (all[i] as boolean[])[j] = true;
  const full = closure(n, all);
  for (const [i, j] of implied) if (!full[j]?.[i]) (edge[i] as boolean[])[j] = true;
  const placed = new Array<boolean>(n).fill(false);
  const out: SystemDef[] = [];
  while (out.length < n) {
    let pick = -1;
    for (let j = 0; j < n && pick < 0; j++) {
      if (placed[j]) continue;
      let ready = true;
      for (let i = 0; i < n && ready; i++) if (!placed[i] && edge[i]?.[j]) ready = false;
      if (ready) pick = j;
    }
    placed[pick] = true;
    out.push(systems[pick] as SystemDef);
  }
  return out;
}
