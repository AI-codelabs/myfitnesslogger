/**
 * In-memory JWT cache so every /api/* call does not re-hit Neon Auth.
 *
 * IMPORTANT: Better Auth `signIn` / `get-session` body `session.token` is a
 * short session id. The API verifies JWTs only. Neon puts the JWT on the
 * `set-auth-jwt` response header (also available via GET /neon-auth/token).
 * Never cache a non-JWT or API calls 401 and the home screen goes empty.
 */

import { supabase, neonEnabled } from "@/integrations/supabase/client";

let cachedJwt: string | null = null;
let inflightJwt: Promise<string | null> | null = null;

function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

export function setCachedAccessToken(token: string | null) {
  if (token && looksLikeJwt(token)) {
    cachedJwt = token;
    return;
  }
  if (!token) cachedJwt = null;
  // Ignore short Better Auth session tokens — they are not API JWTs.
}

export function getCachedAccessToken(): string | null {
  return cachedJwt;
}

async function fetchJwtFromNeonAuth(): Promise<string | null> {
  if (typeof window === "undefined" || !neonEnabled) return null;
  try {
    const res = await fetch(`${window.location.origin}/neon-auth/token`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { token?: string } | null;
    const token = body?.token;
    return typeof token === "string" && looksLikeJwt(token) ? token : null;
  } catch {
    return null;
  }
}

async function resolveAccessTokenOnce(): Promise<string | null> {
  if (cachedJwt && looksLikeJwt(cachedJwt)) return cachedJwt;

  const fromEndpoint = await fetchJwtFromNeonAuth();
  if (fromEndpoint) {
    cachedJwt = fromEndpoint;
    return fromEndpoint;
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  if (token && looksLikeJwt(token)) {
    cachedJwt = token;
    return token;
  }
  return null;
}

export async function getAccessToken(
  getSession: () => Promise<{ data: { session: { access_token?: string } | null } }>,
): Promise<string | null> {
  if (cachedJwt && looksLikeJwt(cachedJwt)) return cachedJwt;

  if (!inflightJwt) {
    inflightJwt = resolveAccessTokenOnce().finally(() => {
      inflightJwt = null;
    });
  }

  return inflightJwt;
}

/** Call before the first authenticated API request (login boot, role fetch). */
export async function ensureAccessToken(maxAttempts = 6): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = await getAccessToken(() => supabase.auth.getSession());
    if (token) return token;
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
      cachedJwt = null;
    }
  }
  return null;
}

export async function authHeaders(
  getSession: () => Promise<{ data: { session: { access_token?: string } | null } }>,
): Promise<Record<string, string>> {
  const token = await getAccessToken(getSession);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
