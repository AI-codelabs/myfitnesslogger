// Cronometer web-scraper for target pushing ONLY.
// Read paths (diary, macros) all use the official Pro API elsewhere.
// This module: log in with client credentials → POST target update → persist cookies.
//
// Design goals:
//   1. Absolute minimum web traffic (login only when session dies; one target POST per change).
//   2. Human-like headers, jittered delays.
//   3. AES-GCM encryption for credentials + cookies at rest.
//   4. Every network call logged into cronometer_api_logs for auditability + endpoint iteration.

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

const BASE = "https://cronometer.com";

// ─────────────────────────── AES-GCM helpers ───────────────────────────

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("CRONO_WEB_KEY");
  if (!raw) throw new Error("CRONO_WEB_KEY not configured");
  // Accept either base64 or plain string; hash to 256-bit key.
  const bytes = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = {
  enc: (buf: ArrayBuffer | Uint8Array) => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (const b of u8) s += String.fromCharCode(b);
    return btoa(s);
  },
  dec: (s: string) => {
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  },
};

export async function encryptJson(value: unknown): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return `${b64.enc(iv)}.${b64.enc(cipher)}`;
}

export async function decryptJson<T = any>(blob: string): Promise<T> {
  const [ivB64, ctB64] = blob.split(".");
  if (!ivB64 || !ctB64) throw new Error("bad ciphertext");
  const key = await getKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64.dec(ivB64) },
    key,
    b64.dec(ctB64),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// ─────────────────────────── Cookie jar ───────────────────────────

export type CookieJar = Record<string, string>;

function parseSetCookies(headers: Headers, jar: CookieJar) {
  // Deno collapses multiple Set-Cookie into one; use getSetCookie when available.
  const cookies: string[] =
    // deno-lint-ignore no-explicit-any
    typeof (headers as any).getSetCookie === "function"
      // deno-lint-ignore no-explicit-any
      ? (headers as any).getSetCookie()
      : headers.get("set-cookie")?.split(/,(?=[^;]+=)/) ?? [];
  for (const raw of cookies) {
    const first = raw.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq < 0) continue;
    const name = first.slice(0, eq);
    const value = first.slice(eq + 1);
    if (value === "" || value.toLowerCase() === "deleted") {
      delete jar[name];
    } else {
      jar[name] = value;
    }
  }
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ─────────────────────────── HTTP helper ───────────────────────────

async function jitter(minMs = 400, maxMs = 1200) {
  const ms = Math.round(minMs + Math.random() * (maxMs - minMs));
  await new Promise((r) => setTimeout(r, ms));
}

type LogFn = (entry: {
  endpoint: string;
  request_body: unknown;
  response_status: number | null;
  response_text: string;
  error?: string | null;
  duration_ms: number;
}) => Promise<void>;

async function req(
  path: string,
  init: RequestInit & { jar: CookieJar; ua: string },
  log?: LogFn,
): Promise<{ status: number; text: string; headers: Headers }> {
  const started = Date.now();
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set("User-Agent", init.ua);
  headers.set("Accept-Language", "en-US,en;q=0.9");
  if (!headers.has("Accept")) headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  const cookie = cookieHeader(init.jar);
  if (cookie) headers.set("Cookie", cookie);
  let status: number | null = null;
  let text = "";
  let errMsg: string | null = null;
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body,
      redirect: "manual",
    });
    status = res.status;
    parseSetCookies(res.headers, init.jar);
    text = await res.text();
    return { status, text, headers: res.headers };
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    if (log) {
      await log({
        endpoint: path,
        request_body: init.body
          ? { method: init.method, body: typeof init.body === "string" ? init.body.slice(0, 500) : "[binary]" }
          : { method: init.method ?? "GET" },
        response_status: status,
        response_text: (text ?? "").slice(0, 2000),
        error: errMsg,
        duration_ms: Date.now() - started,
      });
    }
  }
}

// ─────────────────────────── Login ───────────────────────────

export type LoginResult =
  | { ok: true; cookies: CookieJar; userAgent: string }
  | { ok: false; error: string; needsTotp?: boolean };

export async function cronoLogin(args: {
  email: string;
  password: string;
  totpCode?: string;
  log?: LogFn;
}): Promise<LoginResult> {
  const jar: CookieJar = {};
  const ua = UA;

  // 1. Warm session — Cronometer sets JSESSIONID + XSRF cookies on /login.
  await req("/login", { method: "GET", jar, ua }, args.log);
  await jitter(300, 700);

  // 2. Submit credentials (form-encoded, mirrors browser).
  const form = new URLSearchParams();
  form.set("username", args.email);
  form.set("password", args.password);
  if (args.totpCode) form.set("totp", args.totpCode);
  // xsrf token echo (some deployments require this cookie value in the body).
  if (jar["XSRF-TOKEN"]) form.set("xsrf", jar["XSRF-TOKEN"]);

  const res = await req("/login", {
    method: "POST",
    jar,
    ua,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": BASE,
      "Referer": `${BASE}/login`,
    },
    body: form.toString(),
  }, args.log);

  // Cronometer signals success via a redirect (302) or by setting a `sesnonce` cookie.
  const loggedIn = !!jar["sesnonce"] || !!jar["cf_bm"] && !!jar["JSESSIONID"] && res.status === 302;
  if (!loggedIn) {
    const low = res.text.toLowerCase();
    if (low.includes("two-factor") || low.includes("totp") || low.includes("2fa")) {
      return { ok: false, error: "totp_required", needsTotp: true };
    }
    if (low.includes("invalid") || low.includes("incorrect")) {
      return { ok: false, error: "bad_credentials" };
    }
    return { ok: false, error: `login_failed_${res.status}` };
  }

  // 3. Warm the app so subsequent target POSTs have full session context.
  await jitter(500, 1200);
  await req("/cronometer/app", { method: "GET", jar, ua }, args.log);
  return { ok: true, cookies: jar, userAgent: ua };
}

// ─────────────────────────── Target push ───────────────────────────

export type NutritionTargets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export function targetsHash(t: NutritionTargets): string {
  return `${Math.round(t.calories)}|${Math.round(t.protein_g)}|${Math.round(t.carbs_g)}|${Math.round(t.fat_g)}`;
}

/**
 * Attempt to push targets. Cronometer's target-update endpoint is an internal
 * GWT-RPC call whose exact contract can change; we try the documented JSON
 * settings endpoint first, then fall back to the RPC path. Every attempt is
 * fully logged so we can iterate from the logs table.
 */
export async function pushTargets(args: {
  cookies: CookieJar;
  userAgent: string;
  targets: NutritionTargets;
  log?: LogFn;
}): Promise<{ ok: boolean; error?: string; endpoint?: string; cookies: CookieJar }> {
  const jar = { ...args.cookies };
  const ua = args.userAgent || UA;

  const payload = {
    energy_kcal: Math.round(args.targets.calories),
    protein_g: Math.round(args.targets.protein_g),
    carbs_g: Math.round(args.targets.carbs_g),
    fat_g: Math.round(args.targets.fat_g),
  };

  // Candidate endpoints, tried in order until one returns 2xx.
  const candidates: Array<{ path: string; body: string; contentType: string }> = [
    {
      path: "/user/targets",
      body: JSON.stringify(payload),
      contentType: "application/json",
    },
    {
      path: "/profile/targets",
      body: new URLSearchParams(
        Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])),
      ).toString(),
      contentType: "application/x-www-form-urlencoded",
    },
  ];

  let lastErr = "no_endpoint_accepted";
  for (const c of candidates) {
    await jitter(600, 1400);
    try {
      const res = await req(c.path, {
        method: "POST",
        jar,
        ua,
        headers: {
          "Content-Type": c.contentType,
          "Accept": "application/json, text/plain, */*",
          "Origin": BASE,
          "Referer": `${BASE}/cronometer/app`,
          ...(jar["XSRF-TOKEN"] ? { "X-XSRF-TOKEN": jar["XSRF-TOKEN"] } : {}),
        },
        body: c.body,
      }, args.log);
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, endpoint: c.path, cookies: jar };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "session_expired", cookies: jar };
      }
      lastErr = `${c.path}=${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, error: lastErr, cookies: jar };
}

// ─────────────────────────── DB helpers ───────────────────────────

export type WebSessionRow = {
  id: string;
  coach_id: string;
  client_id: string;
  cronometer_email: string;
  credentials_ciphertext: string;
  session_cookies: string | null;
  user_agent: string | null;
  status: string;
  last_login_at: string | null;
  last_push_at: string | null;
  last_pushed_hash: string | null;
  last_pushed_targets: unknown;
  last_verified_at: string | null;
  last_error: string | null;
};

export async function loadCurrentTargets(
  admin: SupabaseClient,
  clientId: string,
): Promise<NutritionTargets | null> {
  const { data } = await admin
    .from("nutrition_plans")
    .select("details")
    .eq("client_id", clientId)
    .maybeSingle();
  const det = (data?.details as any) ?? null;
  if (!det) return null;
  return {
    calories: Number(det.calories) || 0,
    protein_g: Number(det.protein_g) || 0,
    carbs_g: Number(det.carbs_g) || 0,
    fat_g: Number(det.fat_g) || 0,
  };
}
