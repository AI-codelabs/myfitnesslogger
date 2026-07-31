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

// Pseudo cookie slot used to carry the Cronometer numeric user id alongside the
// session cookies (both are persisted together, encrypted).
const USER_ID_KEY = "__crono_user_id";


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
  return Object.entries(jar)
    .filter(([k]) => k !== USER_ID_KEY)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
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

  // 1. Warm session — /login/ sets JSESSIONID + a per-session anticsrf cookie,
  //    and embeds the matching token in a hidden input.
  const page = await req("/login/", { method: "GET", jar, ua }, args.log);
  const csrfMatch = page.text.match(
    /name=["']anticsrf["']\s+value=["']([^"']+)["']/i,
  ) ?? page.text.match(/value=["']([^"']+)["']\s+name=["']anticsrf["']/i);
  const anticsrf = csrfMatch?.[1];
  if (!anticsrf) return { ok: false, error: "csrf_token_missing" };

  await jitter(300, 700);

  // 2. Submit credentials exactly like the browser form (jQuery .serialize()).
  const form = new URLSearchParams();
  form.set("username", args.email);
  form.set("password", args.password);
  form.set("userCode", args.totpCode ?? "");
  form.set("anticsrf", anticsrf);

  const res = await req("/login", {
    method: "POST",
    jar,
    ua,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Origin": BASE,
      "Referer": `${BASE}/login/`,
    },
    body: form.toString(),
  }, args.log);

  // Cronometer answers with JSON: {error: "..."} or {redirect, id, ...}
  let payload: { error?: string; redirect?: string; id?: string | number } | null = null;
  try {
    payload = JSON.parse(res.text);
  } catch {
    payload = null;
  }

  const err = payload?.error ?? null;
  if (err) {
    const up = String(err).toUpperCase();
    if (up.includes("TOTP")) {
      return {
        ok: false,
        error: up.includes("INCORRECT") ? "totp_incorrect" : "totp_required",
        needsTotp: true,
      };
    }
    if (up.includes("TOO MANY") || up.includes("RATE")) {
      return { ok: false, error: "rate_limited" };
    }
    if (up.includes("CSRF")) return { ok: false, error: "csrf_rejected" };
    if (
      up.includes("PASSWORD") || up.includes("USERNAME") ||
      up.includes("CREDENTIAL") || up.includes("LOGIN_FAILED") ||
      up.includes("NO_SUCH_USER") || up.includes("INCORRECT")
    ) {
      return { ok: false, error: "bad_credentials" };
    }
    return { ok: false, error: `login_error_${err}` };
  }

  const loggedIn = !!jar["sesnonce"] && (!!payload?.redirect || res.status === 200);
  if (!loggedIn) {
    if (res.status === 429) return { ok: false, error: "rate_limited" };
    return { ok: false, error: `login_failed_${res.status}` };
  }

  const userId = Number(payload?.id);
  if (Number.isFinite(userId) && userId > 0) jar[USER_ID_KEY] = String(userId);

  // 3. Warm the app so subsequent target POSTs have full session context.
  await jitter(500, 1200);
  await req("/", { method: "GET", jar, ua }, args.log);
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

// Cronometer's web app is GWT. Targets are stored as user preferences and set
// through a single RPC: CronometerService.setUserPreference(nonce, userId, key, value).
// The payload format below was captured from the live app.
const GWT_MODULE_BASE = "https://cronometer.com/cronometer/";
const GWT_SERVICE = "com.cronometer.shared.rpc.CronometerService";
const GWT_STRING = "java.lang.String/2004016611";

/** Discover the current permutation strong name (policy hash) from the app loader. */
async function fetchGwtIds(
  jar: CookieJar,
  ua: string,
  log?: LogFn,
): Promise<{ permutation: string; policy: string }> {
  const nocache = await req("/cronometer/cronometer.nocache.js", { method: "GET", jar, ua }, log);
  const permutation = nocache.text.match(/[0-9A-F]{32}/)?.[0];
  if (!permutation) throw new Error("gwt_permutation_not_found");
  const cache = await req(`/cronometer/${permutation}.cache.js`, { method: "GET", jar, ua }, log);
  // The service policy is registered as: Uyj.call(this,...,'app','<POLICY>',...)
  const policy = cache.text.match(/'app'\s*,\s*'([0-9A-F]{32})'/)?.[1];
  if (!policy) throw new Error("gwt_policy_not_found");
  return { permutation, policy };
}

function buildSetPreferencePayload(
  policy: string,
  nonce: string,
  userId: number,
  key: string,
  value: string,
): string {
  const strings: string[] = [];
  const idx = (s: string) => {
    const at = strings.indexOf(s);
    if (at >= 0) return at + 1;
    strings.push(s);
    return strings.length;
  };
  const url = idx(GWT_MODULE_BASE);
  const pol = idx(policy);
  const svc = idx(GWT_SERVICE);
  const method = idx("setUserPreference");
  const strType = idx(GWT_STRING);
  const intType = idx("I");
  const nonceRef = idx(nonce);
  const keyRef = idx(key);
  const valRef = idx(value);
  return [
    "7",
    "0",
    String(strings.length),
    ...strings,
    String(url),
    String(pol),
    String(svc),
    String(method),
    "4", // arg count
    String(strType),
    String(intType),
    String(strType),
    String(strType),
    String(nonceRef),
    String(userId),
    String(keyRef),
    String(valRef),
  ].join("|") + "|";
}

/**
 * Push targets to Cronometer by writing the same user preferences the
 * "Targets + Profile → Fixed Targets" screen writes. Min and max are set to the
 * same value so the client sees an exact 1:1 target.
 */
export async function pushTargets(args: {
  cookies: CookieJar;
  userAgent: string;
  targets: NutritionTargets;
  /**
   * Cronometer numeric user id to write to. Omit to write to the session owner.
   * A Pro coach session can write to any of its managed clients' ids.
   */
  targetUserId?: number;
  log?: LogFn;
}): Promise<{ ok: boolean; error?: string; endpoint?: string; cookies: CookieJar }> {
  const jar = { ...args.cookies };
  const ua = args.userAgent || UA;

  const nonce = jar["sesnonce"];
  const userId = Number.isFinite(args.targetUserId) && (args.targetUserId ?? 0) > 0
    ? Number(args.targetUserId)
    : Number(jar[USER_ID_KEY]);
  if (!nonce) return { ok: false, error: "session_expired", cookies: jar };
  if (!Number.isFinite(userId) || userId <= 0) {
    return { ok: false, error: "session_expired", cookies: jar };
  }

  let ids: { permutation: string; policy: string };
  try {
    ids = await fetchGwtIds(jar, ua, args.log);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), cookies: jar };
  }

  const kcal = Math.round(args.targets.calories);
  const protein = Math.round(args.targets.protein_g);
  const carbs = Math.round(args.targets.carbs_g);
  const fat = Math.round(args.targets.fat_g);

  // Force the "Fixed Targets" mode, then write each macro (min + max) and the
  // custom energy target. Order matters: mode first, energy last.
  const prefs: Array<[string, string]> = [
    ["targets.macros", "targets.macros.fixedvalues.grams"],
    ["targets.fixed.protein", String(protein)],
    ["targets.fixed.protein.max", String(protein)],
    ["targets.fixed.net.carbs", String(carbs)],
    ["targets.fixed.net.carbs.max", String(carbs)],
    ["targets.fixed.total.carbs", String(carbs)],
    ["targets.fixed.total.carbs.max", String(carbs)],
    ["targets.fixed.fats", String(fat)],
    ["targets.fixed.fats.max", String(fat)],
    ["targets.custom.energy.target", String(kcal)],
    ["targets.custom.energy.target.max", String(kcal)],
  ];

  for (const [key, value] of prefs) {
    await jitter(150, 400);
    let res;
    try {
      res = await req("/cronometer/app", {
        method: "POST",
        jar,
        ua,
        headers: {
          "Content-Type": "text/x-gwt-rpc; charset=UTF-8",
          "Accept": "*/*",
          "X-GWT-Permutation": ids.permutation,
          "X-GWT-Module-Base": GWT_MODULE_BASE,
          "Origin": BASE,
          "Referer": `${BASE}/`,
        },
        body: buildSetPreferencePayload(ids.policy, nonce, userId, key, value),
      }, args.log);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), cookies: jar };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "session_expired", cookies: jar };
    }
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: `rpc_${key}_${res.status}`, cookies: jar };
    }
    // GWT answers "//OK[...]" on success and "//EX[...]" on a server exception.
    if (res.text.startsWith("//EX")) {
      const expired = /NotLoggedIn|SessionExpired|Authentication/i.test(res.text);
      return {
        ok: false,
        error: expired ? "session_expired" : `rpc_exception_${key}`,
        cookies: jar,
      };
    }
  }

  return { ok: true, endpoint: "gwt:setUserPreference", cookies: jar };
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
