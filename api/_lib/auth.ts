import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest } from "@vercel/node";

export type AuthUser = {
  id: string;
  email: string | null;
  userMetadata: Record<string, unknown>;
};

let neonJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let supabaseJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Neon Auth publishes a JWKS endpoint per project, e.g.
 * https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth/.well-known/jwks.json
 */
export const NEON_AUTH_BASE_URL =
  process.env.NEON_AUTH_URL ??
  "https://ep-super-butterfly-b1u1cypj.neonauth.c-5.eu-central-1.aws.neon.tech/neondb/auth";

/**
 * Bridge issuer: legacy Supabase tokens stay valid for any sessions that were
 * issued before the Neon Auth cutover. Safe to remove once those sessions expire.
 */
export const LEGACY_AUTH_URL =
  process.env.LEGACY_AUTH_URL ?? process.env.VITE_SUPABASE_URL ?? "";

function getNeonJwks() {
  if (!neonJwks) {
    const jwksUrl =
      process.env.NEON_AUTH_JWKS_URL ??
      `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`;
    neonJwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return neonJwks;
}

function getLegacyJwks() {
  if (!LEGACY_AUTH_URL) return null;
  if (!supabaseJwks) {
    supabaseJwks = createRemoteJWKSet(
      new URL(`${LEGACY_AUTH_URL.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`),
    );
  }
  return supabaseJwks;
}


export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Build app-facing metadata from a JWT payload.
 * Neon Auth puts `name` on the token root (no custom claims / user_metadata).
 * Legacy Supabase tokens nest fields under `user_metadata`.
 */
function metadataFromClaims(claims: Record<string, unknown>): Record<string, unknown> {
  const meta = claims.user_metadata;
  const fromNested =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? { ...(meta as Record<string, unknown>) }
      : {};

  const name =
    (typeof fromNested.display_name === "string" && fromNested.display_name) ||
    (typeof fromNested.displayName === "string" && fromNested.displayName) ||
    (typeof fromNested.name === "string" && fromNested.name) ||
    (typeof claims.name === "string" && claims.name) ||
    null;

  if (name) {
    fromNested.display_name = name;
    fromNested.displayName = name;
    fromNested.name = name;
  }

  // Neon JWT `role` is always "authenticated" — never treat it as app_role.
  if (fromNested.role === "authenticated") delete fromNested.role;

  return fromNested;
}

/**
 * Verifies the access token on the Authorization header. Neon Auth tokens are
 * tried first; legacy tokens are still accepted for pre-cutover sessions.
 */
export async function requireUser(req: VercelRequest): Promise<AuthUser> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing access token");

  const candidates: Array<{ keys: ReturnType<typeof createRemoteJWKSet>; issuer?: string }> = [
    { keys: getNeonJwks(), issuer: process.env.NEON_AUTH_ISSUER || undefined },
  ];
  const legacy = getLegacyJwks();
  if (legacy) candidates.push({ keys: legacy });

  for (const candidate of candidates) {
    try {
      const { payload } = await jwtVerify(token, candidate.keys, {
        issuer: candidate.issuer,
      });
      const id = typeof payload.sub === "string" ? payload.sub : null;
      if (!id) throw new HttpError(401, "Token has no subject");
      const claims = payload as Record<string, unknown>;
      const email = typeof claims.email === "string" ? claims.email : null;
      return { id, email, userMetadata: metadataFromClaims(claims) };
    } catch {
      /* try the next issuer */
    }
  }

  throw new HttpError(401, "Invalid or expired access token");
}

