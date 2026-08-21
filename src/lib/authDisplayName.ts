/** Neon Auth maps the profile name to user_metadata.displayName; legacy used display_name. */
export function authDisplayName(
  user:
    | {
        email?: string | null;
        user_metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined,
  fallback = "—",
): string {
  const meta = user?.user_metadata ?? {};
  for (const key of ["display_name", "displayName", "name"] as const) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (typeof user?.email === "string" && user.email.trim()) return user.email.trim();
  return fallback;
}
