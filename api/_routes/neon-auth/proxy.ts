import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NEON_AUTH_BASE_URL } from "../../_lib/auth.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function requestPath(req: VercelRequest): string {
  const routed = req.query.__route;
  const raw =
    typeof routed === "string"
      ? routed
      : Array.isArray(routed)
        ? routed.join("/")
        : (req.url ?? "").split("?")[0] ?? "";
  return raw.replace(/^\/?neon-auth\/?/, "").replace(/^\/+/, "");
}

function requestQuery(req: VercelRequest): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (key === "__route") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else if (value != null) {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Neon issues third-party cookie flags (`SameSite=None; Partitioned`). Through
 * our same-origin proxy those become first-party — Safari often refuses to
 * store Partitioned cookies on a first-party response, which leaves login
 * stuck / blank. Rewrite to a normal first-party session cookie.
 */
function rewriteSessionCookie(cookie: string): string {
  const parts = cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^domain=/i.test(part))
    .filter((part) => !/^partitioned$/i.test(part));

  const rewritten: string[] = [];
  let sawSameSite = false;
  for (const part of parts) {
    if (/^samesite=/i.test(part)) {
      rewritten.push("SameSite=Lax");
      sawSameSite = true;
      continue;
    }
    rewritten.push(part);
  }
  if (!sawSameSite) rewritten.push("SameSite=Lax");
  return rewritten.join("; ");
}

/**
 * Same-origin proxy for Neon Auth. Vercel external rewrites forward our
 * hostname and Neon rejects them with HTTP 400 INVALID_HOSTNAME. Fetching
 * from this function uses the Neon host while Set-Cookie stays first-party
 * for myfitnesslogger.vercel.app.
 */
export default async function proxyNeonAuth(req: VercelRequest, res: VercelResponse) {
  try {
    const path = requestPath(req);
    const target = `${NEON_AUTH_BASE_URL.replace(/\/$/, "")}/${path}${requestQuery(req)}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue;
      if (key.toLowerCase().startsWith("x-vercel-") || key.toLowerCase().startsWith("x-forwarded-")) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else {
        headers.set(key, value);
      }
    }

    const method = req.method ?? "GET";
    const init: RequestInit = {
      method,
      headers,
      redirect: "manual",
    };

    if (method !== "GET" && method !== "HEAD") {
      if (Buffer.isBuffer(req.body)) {
        init.body = req.body;
      } else if (typeof req.body === "string") {
        init.body = req.body;
      } else if (req.body != null) {
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
        init.body = JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(target, init);

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "transfer-encoding" || lower === "content-encoding" || lower === "content-length") {
        return;
      }
      if (lower === "set-cookie") return;
      res.setHeader(key, value);
    });

    const setCookies =
      typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : [];
    if (setCookies.length > 0) {
      res.setHeader("set-cookie", setCookies.map(rewriteSessionCookie));
    } else {
      const single = upstream.headers.get("set-cookie");
      if (single) res.setHeader("set-cookie", rewriteSessionCookie(single));
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    const message = err instanceof Error ? err.message : "proxy_failed";
    console.error("[neon-auth proxy]", message);
    return res.status(502).json({ error: "neon_auth_proxy_failed", message });
  }
}
