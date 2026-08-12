import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest } from "@vercel/node";

export type AuthUser = {
  id: string;
  email: string | null;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const projectId = process.env.NEON_AUTH_PROJECT_ID;
    if (!projectId) throw new Error("NEON_AUTH_PROJECT_ID is not set");
    jwks = createRemoteJWKSet(
      new URL(
        `https://api.stack-auth.com/api/v1/projects/${projectId}/.well-known/jwks.json`,
      ),
    );
  }
  return jwks;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Verifies the Neon Auth (Stack Auth) access token on the Authorization header. */
export async function requireUser(req: VercelRequest): Promise<AuthUser> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing access token");

  try {
    const { payload } = await jwtVerify(token, getJwks());
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
