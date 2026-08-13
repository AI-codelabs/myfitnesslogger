// Initiates Gmail OAuth: generates state, stores it, returns the Google consent URL.
import { z } from "zod";
import { serviceEndpoint, HttpError } from "../_lib/fn.js";
import { googleCredentials } from "../_lib/gmail.js";

const schema = z.object({ returnTo: z.string().max(2048).optional() });

/** Public base URL of this deployment, used to build the OAuth redirect URI. */
export function apiBaseUrl(host: string | undefined): string {
  const configured = process.env.PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  return `https://${host ?? ""}`;
}

export default serviceEndpoint({ auth: "user" }, async ({ req, sql, user }) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Invalid input");
  const rawReturnTo = parsed.data.returnTo ?? "";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : (() => {
          try {
            const url = new URL(rawReturnTo);
            const host = req.headers.host?.split(":")[0];
            const allowed = new Set([
              "myfitnesslogger.vercel.app",
              "myfitnesslogger-ai-codelab.vercel.app",
              ...(host ? [host] : []),
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
            return allowed.has(url.host) ? url.toString() : "";
          } catch {
            return "";
          }
        })();

  const { clientId } = googleCredentials();

  const state = globalThis.crypto.randomUUID();
  await sql.query(
    `INSERT INTO public.oauth_states (state, coach_id) VALUES ($1, $2)`,
    [state, user!.id],
  );

  const redirectUri = `${apiBaseUrl(req.headers.host)}/api/gmail/oauth-callback`;
  const packedState = Buffer.from(
    JSON.stringify({ s: state, r: returnTo }),
    "utf8",
  ).toString("base64");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope:
      "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
    state: packedState,
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  };
});
