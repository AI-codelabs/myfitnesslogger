// Centralised resolution of a client's display name.
// Used across the coach UI so we never fall back to email when a name exists.

export type NameSource = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

export function clientFullName(p: NameSource | null | undefined): string {
  if (!p) return "Client";
  const first = (p.first_name ?? "").trim();
  const last = (p.last_name ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (p.full_name && p.full_name.trim()) return p.full_name.trim();
  if (p.display_name && p.display_name.trim()) return p.display_name.trim();
  if (p.email) return p.email;
  return "Client";
}

export function clientInitials(p: NameSource | null | undefined): string {
  const name = clientFullName(p);
  if (name === "Client") return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Split a free-form full name into first + last.
export function splitFullName(full: string | null | undefined): {
  first_name: string | null;
  last_name: string | null;
} {
  if (!full) return { first_name: null, last_name: null };
  const trimmed = full.trim().replace(/\s+/g, " ");
  if (!trimmed) return { first_name: null, last_name: null };
  const i = trimmed.indexOf(" ");
  if (i === -1) return { first_name: trimmed, last_name: null };
  return {
    first_name: trimmed.slice(0, i),
    last_name: trimmed.slice(i + 1) || null,
  };
}
