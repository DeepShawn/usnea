// SPDX-License-Identifier: Apache-2.0

/** Error thrown by the engine; `code` is a stable `USN-Exxx` identifier. */
export class UsneaError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "UsneaError";
    this.code = code;
  }
}

/** Builds a `UsneaError` whose message says what happened, where, and how to fix it. */
export function usneaError(code: string, what: string, where: string, fix: string): UsneaError {
  return new UsneaError(code, `${what} (in ${where}). Fix: ${fix}`);
}

/** Levenshtein edit distance between two strings. */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** Returns the candidate closest to `name` when it is close enough to be a typo, else undefined. */
export function closestMatch(name: string, candidates: Iterable<string>): string | undefined {
  const limit = Math.max(2, Math.floor(name.length / 3));
  let best: string | undefined;
  let bestDistance = limit + 1;
  for (const candidate of candidates) {
    const d = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

/** Formats a ` Did you mean "x"?` suffix, or an empty string when nothing is close. */
export function didYouMean(name: string, candidates: Iterable<string>): string {
  const match = closestMatch(name, candidates);
  return match === undefined ? "" : ` Did you mean "${match}"?`;
}
