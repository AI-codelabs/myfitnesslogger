/**
 * Parse a user-entered decimal string that may use either "," (NL/EU)
 * or "." (US) as decimal separator. Also strips any thousands separators.
 * Returns null when the input is empty or not a finite number.
 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const raw = input.trim();
  if (!raw) return null;
  // If both separators exist, treat the last one as the decimal separator
  // and strip the other (thousands). Otherwise just swap "," → ".".
  let normalized = raw;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
