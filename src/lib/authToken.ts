/**
 * In-memory access-token cache so every /api/* call does not await
 * supabase.auth.getSession() (Neon Auth round-trip / storage read).
 * useAuth keeps this in sync on boot, sign-in, and sign-out.
 */
let cachedAccessToken: string | null = null;

export function setCachedAccessToken(token: string | null) {
  cachedAccessToken = token;
}

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export async function getAccessToken(
  getSession: () => Promise<{ data: { session: { access_token?: string } | null } }>,
): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  const { data } = await getSession();
  cachedAccessToken = data.session?.access_token ?? null;
  return cachedAccessToken;
}

export async function authHeaders(
  getSession: () => Promise<{ data: { session: { access_token?: string } | null } }>,
): Promise<Record<string, string>> {
  const token = await getAccessToken(getSession);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
