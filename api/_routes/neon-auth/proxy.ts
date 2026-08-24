import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NEON_AUTH_BASE_URL } from "../_lib/auth.js";

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
 * Same-origin proxy for Neon Auth. Vercel external rewrites forward our
 * hostname and Neon rejects them with HTTP 400 INVALID_HOSTNAME. Fetching
 * from this function uses the Neon host while Set-Cookie stays first-party
 * for myfitnesslogger.vercel.app (no Domain attribute).
 */
export default async function proxyNeonAuth(req: VercelRequest, res: VercelResponse) {
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
    // Keep cookies host-only (first-party on our domain). Drop Domain=… if present.
    res.setHeader(
      "set-cookie",
      setCookies.map((cookie) =>
        cookie
          .split(";")
          .map((part) => part.trim())
          .filter((part) => !/^domain=/i.test(part))
          .join("; "),
      ),
    );
  } else {
    const single = upstream.headers.get("set-cookie");
    if (single) {
      res.setHeader(
        "set-cookie",
        single
          .split(";")
          .map((part) => part.trim())
          .filter((part) => !/^domain=/i.test(part))
          .join("; "),
      );
    }
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  return res.send(buf);
}
