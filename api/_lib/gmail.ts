// Gmail sending helpers shared by the invite / reminder / test-email endpoints.
import type { SqlClient } from "./db.js";

export type CoachConnection = {
  coach_id: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  token_expires_at: string | null;
};

export function googleCredentials() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }
  return { clientId, clientSecret };
}

/** Returns a valid access token for the coach, refreshing + persisting it when stale. */
export async function ensureAccessToken(
  sql: SqlClient,
  conn: CoachConnection,
): Promise<string | null> {
  const expired =
    !conn.token_expires_at ||
    new Date(conn.token_expires_at).getTime() < Date.now() + 60_000;
  if (conn.access_token && !expired) return conn.access_token;

  const { clientId, clientSecret } = googleCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !data.access_token) {
    console.error("[gmail] token refresh failed", JSON.stringify(data));
    return null;
  }

  const expiresAt = new Date(
    Date.now() + (data.expires_in ?? 3600) * 1000,
  ).toISOString();
  await sql.query(
    `UPDATE public.coach_email_connections
        SET access_token = $1, token_expires_at = $2, updated_at = now()
      WHERE coach_id = $3`,
    [data.access_token, expiresAt, conn.coach_id],
  );
  return data.access_token;
}

export async function loadConnection(
  sql: SqlClient,
  coachId: string,
): Promise<CoachConnection | null> {
  const r = await sql.query<CoachConnection>(
    `SELECT coach_id, email, refresh_token, access_token, token_expires_at::text
       FROM public.coach_email_connections WHERE coach_id = $1 LIMIT 1`,
    [coachId],
  );
  return r.rows[0] ?? null;
}

export function base64UrlEncode(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

/** Sends an HTML email through the Gmail API. Throws on failure. */
export async function sendGmail(params: {
  accessToken: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
}): Promise<string> {
  const message = [
    `From: ${params.fromName} <${params.fromEmail}>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    params.html,
  ].join("\r\n");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64UrlEncode(message) }),
    },
  );
  const data = (await res.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      data.error?.message || `Gmail send failed (${res.status})`,
    );
  }
  return data.id ?? "";
}

/** Looks up a user's email address from the auth user table. */
export async function userEmail(
  sql: SqlClient,
  userId: string,
): Promise<string | null> {
  const r = await sql.query<{ email: string | null }>(
    `SELECT email FROM auth.users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0]?.email ?? null;
}
