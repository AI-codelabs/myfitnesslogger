// Per-set reps/rest model with backwards-compatible parser & serializer
// for the existing free-form `sets_reps` text column.

export type SetSpec = {
  reps: string; // e.g. "8" or "6-8"; may be empty
  rest: number; // seconds; default 120
};

export const DEFAULT_REST = 120;

// Try to parse a plan string like:
//   - new format:   "6-8x @120s, 10-12x @90s"
//   - legacy expanded: "8x 10x 12x"  → 3 sets
//   - legacy "NxM":  "4x 8-10" or "3x10" → N sets of M reps
//   - "3 sets"     → 3 empty sets
// Falls back to a single empty set with default rest.
export function parseSetsReps(input: string | null | undefined): SetSpec[] {
  const s = (input ?? "").trim();
  if (!s) return [];

  // New format: comma-separated entries, each may include "@<seconds>s"
  if (s.includes(",")) {
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
    const parsed = parts.map(parseOneEntry).filter(Boolean) as SetSpec[];
    if (parsed.length) return parsed;
  }

  // Tokens like "8x 10x 12x" → one set per token
  const tokens = s.match(/\d+(?:\s*-\s*\d+)?\s*x(?:\s*@\s*\d+\s*s)?/gi);
  if (tokens && tokens.length > 1) {
    return tokens.map(parseOneEntry).filter(Boolean) as SetSpec[];
  }

  // "NxM" or "Nx M-K" legacy: N sets of M (or M-K) reps
  const m = s.match(/^(\d+)\s*x\s*(\d+(?:\s*-\s*\d+)?)/i);
  if (m) {
    const n = Math.max(1, Math.min(20, parseInt(m[1], 10)));
    const reps = m[2].replace(/\s+/g, "");
    return Array.from({ length: n }, () => ({ reps, rest: DEFAULT_REST }));
  }

  // "3 sets"
  const m2 = s.match(/(\d+)\s*sets?/i);
  if (m2) {
    const n = Math.max(1, Math.min(20, parseInt(m2[1], 10)));
    return Array.from({ length: n }, () => ({ reps: "", rest: DEFAULT_REST }));
  }

  // Single "Nx" or just "N-M"
  const one = parseOneEntry(s);
  if (one) return [one];

  return [];
}

function parseOneEntry(raw: string): SetSpec | null {
  const r = raw.trim();
  if (!r) return null;
  const repsMatch = r.match(/(\d+\s*-\s*\d+|\d+)/);
  const restMatch = r.match(/@\s*(\d+)\s*s/i);
  const reps = repsMatch ? repsMatch[1].replace(/\s+/g, "") : "";
  const rest = restMatch ? Math.max(0, parseInt(restMatch[1], 10)) : DEFAULT_REST;
  if (!reps && !restMatch) return null;
  return { reps, rest };
}

export function serializeSetsReps(sets: SetSpec[]): string {
  return sets
    .map((s) => `${s.reps || "0"}x @${Number.isFinite(s.rest) ? s.rest : DEFAULT_REST}s`)
    .join(", ");
}
