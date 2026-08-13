// Shared helpers for the background/service endpoints that were ported from
// the legacy edge functions. Unlike the feature endpoints in `endpoint()`,
// these run with service-level database access (they used the service role
// key before) and are protected either by a verified user JWT or a cron secret.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, requireUser, type AuthUser } from "./auth.js";
import { withService } from "./rls.js";
import type { SqlClient } from "./db.js";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-admin-secret, x-ingest-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function applyCors(res: VercelResponse) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
}

export function json(res: VercelResponse, data: unknown, status = 200) {
  applyCors(res);
  return res.status(status).json(data);
}

export { HttpError, requireUser, withService };
export type { AuthUser, SqlClient };

/** Throws unless the caller holds the `coach` role. */
export async function requireCoach(
  sql: SqlClient,
  user: AuthUser,
): Promise<void> {
  const r = await sql.query<{ ok: boolean }>(
    `SELECT public.has_role($1::uuid, 'coach') AS ok`,
    [user.id],
  );
  if (!r.rows[0]?.ok) throw new HttpError(403, "Coach role required");
}

/** Throws unless `clientId` is one of the caller's clients. */
export async function requireOwnClient(
  sql: SqlClient,
  user: AuthUser,
  clientId: string,
): Promise<void> {
  if (clientId === user.id) return;
  const r = await sql.query<{ ok: boolean }>(
    `SELECT public.is_coach_of($1::uuid, $2::uuid) AS ok`,
    [user.id, clientId],
  );
  if (!r.rows[0]?.ok) throw new HttpError(403, "Not your client");
}

/**
 * Cron/shared-secret authentication. Accepts the `x-cron-secret` header, the
 * `Authorization: Bearer <CRON_SECRET>` header that Vercel Cron sends, or the
 * `cron_token` row in `internal_secrets` (same contract as the legacy jobs).
 */
export async function isCronAuthorized(
  req: VercelRequest,
  sql: SqlClient,
): Promise<boolean> {
  const header = req.headers["x-cron-secret"];
  const provided =
    (Array.isArray(header) ? header[0] : header) ??
    (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!provided) return false;

  const envSecret = process.env.CRON_SECRET;
  if (envSecret && provided === envSecret) return true;

  const r = await sql.query<{ value: string }>(
    `SELECT value FROM public.internal_secrets WHERE name = 'cron_token' LIMIT 1`,
  );
  return !!r.rows[0]?.value && provided === r.rows[0].value;
}

type ServiceHandler = (ctx: {
  req: VercelRequest;
  res: VercelResponse;
  sql: SqlClient;
  user: AuthUser | null;
}) => Promise<unknown>;

type ServiceOptions = {
  /** "user" = valid JWT required, "cron" = shared secret, "either" = both accepted. */
  auth: "user" | "cron" | "either" | "public";
  methods?: string[];
  /** Return `false` from the handler's response helpers to take over the response. */
  raw?: boolean;
};

/**
 * Wraps a ported background function: CORS, method check, authentication and a
 * service-level SQL connection. Return a JSON-serialisable value, or handle the
 * response yourself (e.g. redirects) and return `undefined` with `raw: true`.
 */
export function serviceEndpoint(
  options: ServiceOptions,
  handler: ServiceHandler,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    applyCors(res);
    if (req.method === "OPTIONS") return res.status(204).end();
    const methods = options.methods ?? ["POST"];
    if (!methods.includes(req.method ?? "")) {
      return json(res, { error: "method_not_allowed" }, 405);
    }

    try {
      const result = await withService(async (sql) => {
        let user: AuthUser | null = null;

        if (options.auth === "user" || options.auth === "either") {
          try {
            user = await requireUser(req);
          } catch (err) {
            if (options.auth === "user") throw err;
          }
        }
        if (!user && (options.auth === "cron" || options.auth === "either")) {
          const ok = await isCronAuthorized(req, sql);
          if (!ok) throw new HttpError(403, "Forbidden");
        }

        return handler({ req, res, sql, user });
      });

      if (options.raw || res.writableEnded) return;
      return json(res, result ?? { ok: true });
    } catch (err) {
      if (res.writableEnded) return;
      if (err instanceof HttpError) {
        return json(res, { error: err.message }, err.status);
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[api] service handler failed", message);
      return json(res, { error: "server_error", message }, 500);
    }
  };
}
