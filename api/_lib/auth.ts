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
 * Bridge issuer: while the app is migrated feature by feature the frontend is
 * still signed in through the legacy auth provider, so its tokens must keep
 * working against the Neon-backed API. Remove once auth itself is cut over.
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
 * Verifies the access token on the Authorization header. Neon Auth tokens are
 * tried first; legacy tokens are accepted while the cutover is in progress.
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
      const meta = claims.user_metadata;
      const userMetadata =
        meta && typeof meta === "object" && !Array.isArray(meta)
          ? (meta as Record<string, unknown>)
          : {};
      return { id, email, userMetadata };
    } catch {
      /* try the next issuer */
    }
  }

  throw new HttpError(401, "Invalid or expired access token");
}

