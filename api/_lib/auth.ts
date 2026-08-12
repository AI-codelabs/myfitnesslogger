import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest } from "@vercel/node";

export type AuthUser = {
  id: string;
  email: string | null;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Neon Auth publishes a JWKS endpoint per project, e.g.
 * https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth/.well-known/jwks.json
 */
function getJwks() {
  if (!jwks) {
    const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
    if (!jwksUrl) throw new Error("NEON_AUTH_JWKS_URL is not set");
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Verifies the Neon Auth access token on the Authorization header. */
export async function requireUser(req: VercelRequest): Promise<AuthUser> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing access token");

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: process.env.NEON_AUTH_ISSUER || undefined,
    });
    const id = typeof payload.sub === "string" ? payload.sub : null;
    if (!id) throw new HttpError(401, "Token has no subject");
    const email =
      typeof (payload as Record<string, unknown>).email === "string"
        ? ((payload as Record<string, unknown>).email as string)
        : null;
    return { id, email };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, "Invalid or expired access token");
  }
}
