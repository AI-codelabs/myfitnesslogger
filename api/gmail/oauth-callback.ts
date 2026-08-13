// Handles Google's redirect: exchanges the code for tokens, stores the
// connection and redirects back into the app.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withService } from "../_lib/rls.js";
import { googleCredentials } from "../_lib/gmail.js";
import { apiBaseUrl } from "./oauth-start.js";

function allowedReturnTo(returnTo: string, host: string | undefined): string {
  const fallback = process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "/";
  if (!returnTo) return fallback;
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  try {
    const url = new URL(returnTo);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    const allowed = new Set<string>([
      "myfitnesslogger.vercel.app",
      "myfitnesslogger-ai-codelab.vercel.app",
    ]);
    for (const envName of ["PUBLIC_APP_URL", "PUBLIC_API_URL"] as const) {
      const raw = process.env[envName];
      if (!raw) continue;
      try {
        allowed.add(new URL(raw).host);
      } catch {
        /* ignore */
      }
    }
    if (host) allowed.add(host.split(":")[0]);
    if (allowed.has(url.host)) return url.toString();
  } catch {
    /* fall through */
  }
  return fallback;
}

function redirect(
  res: VercelResponse,
  returnTo: string,
  errorCode: string | null,
  host?: string,
) {
  const safe = allowedReturnTo(returnTo, host);
  const sep = safe.includes("?") ? "&" : "?";
  const target = errorCode
    ? `${safe}${sep}gmail_error=${encodeURIComponent(errorCode)}`
    : `${safe}${sep}gmail_connected=1`;
  res.setHeader("Location", target);
  return res.status(302).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = req.query as Record<string, string | string[] | undefined>;
  const pick = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const code = pick(q.code);
  const packedState = pick(q.state);
  const oauthError = pick(q.error);

  let stateValue = "";
  let returnTo = "";
  try {
    const decoded = JSON.parse(
      Buffer.from(packedState, "base64").toString("utf8"),
    ) as { s?: string; r?: string };
    stateValue = decoded.s ?? "";
    returnTo = decoded.r ?? "";
  } catch {
    return redirect(res, "", "invalid_state", req.headers.host);
  }

  if (oauthError) return redirect(res, returnTo, oauthError, req.headers.host);
  if (!code || !stateValue) return redirect(res, returnTo, "missing_code", req.headers.host);

  try {
    const { clientId, clientSecret } = googleCredentials();

    const outcome = await withService(async (sql) => {
      const stateRow = await sql.query<{ coach_id: string; created_at: string }>(
        `SELECT coach_id, created_at::text FROM public.oauth_states WHERE state = $1 LIMIT 1`,
        [stateValue],
      );
      const row = stateRow.rows[0];
      if (!row) return "invalid_state";

      const ageMs = Date.now() - new Date(row.created_at).getTime();
      await sql.query(`DELETE FROM public.oauth_states WHERE state = $1`, [
        stateValue,
      ]);
      if (ageMs > 10 * 60 * 1000) return "state_expired";

      const redirectUri = `${apiBaseUrl(req.headers.host)}/api/gmail/oauth-callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = (await tokenRes.json()) as {
        refresh_token?: string;
        access_token?: string;
        expires_in?: number;
        scope?: string;
      };
      if (!tokenRes.ok || !tokenData.refresh_token) {
        console.error("[gmail] token exchange failed", JSON.stringify(tokenData));
        return "token_exchange_failed";
      }

      const infoRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
      );
      const info = (await infoRes.json()) as { email?: string };
      if (!infoRes.ok || !info.email) return "userinfo_failed";

      const expiresAt = new Date(
        Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      ).toISOString();

      await sql.query(
        `INSERT INTO public.coach_email_connections
           (coach_id, email, refresh_token, access_token, token_expires_at, scope)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (coach_id) DO UPDATE
           SET email = EXCLUDED.email,
               refresh_token = EXCLUDED.refresh_token,
               access_token = EXCLUDED.access_token,
               token_expires_at = EXCLUDED.token_expires_at,
               scope = EXCLUDED.scope,
               updated_at = now()`,
        [
          row.coach_id,
          info.email,
          tokenData.refresh_token,
          tokenData.access_token ?? null,
          expiresAt,
          tokenData.scope ?? null,
        ],
      );

      return null;
    });

    return redirect(res, returnTo, outcome, req.headers.host);
  } catch (err) {
    console.error("[gmail] callback failed", err);
    return redirect(res, returnTo, "save_failed", req.headers.host);
  }
}
