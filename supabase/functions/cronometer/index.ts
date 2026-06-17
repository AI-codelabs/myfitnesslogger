import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CRONOMETER_LOGIN_PAGE = "https://cronometer.com/login/";
const CRONOMETER_LOGIN_API = "https://cronometer.com/login";
const GWT_BASE_URL = "https://cronometer.com/cronometer/app";
const EXPORT_URL = "https://cronometer.com/export";

const GWT_CONTENT_TYPE = "text/x-gwt-rpc; charset=UTF-8";
const GWT_MODULE_BASE = "https://cronometer.com/cronometer/";
const GWT_NOCACHE_JS_URL = "https://cronometer.com/cronometer/cronometer.nocache.js";

// These values change with Cronometer deploys. We scrape them dynamically,
// falling back to known values when discovery fails.
let cachedGwtPermutation = "4F2E46C723ED6E81F4C1402DD938E421";
let cachedGwtHeader = "08048AF8BA7E897E74754A658DF1BEC5";
let gwtValuesLastFetched = 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class CronometerUserError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "CronometerUserError";
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Scrape current GWT permutation & header from Cronometer's bootstrap JS.
// Pattern matches cronometer-mcp v2 discovery logic.
async function refreshGwtValues(force = false) {
  if (!force && Date.now() - gwtValuesLastFetched < 3600_000) return; // cache 1hr
  try {
    const noCacheResp = await fetch(GWT_NOCACHE_JS_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!noCacheResp.ok) {
      throw new Error(`nocache.js returned ${noCacheResp.status}`);
    }
    const noCacheJs = await noCacheResp.text();

    const permMatch = noCacheJs.match(/='([A-F0-9]{32})'/);
    if (!permMatch) {
      throw new Error("Could not extract GWT permutation from nocache.js");
    }
    const permutation = permMatch[1];

    const cacheUrl = `https://cronometer.com/cronometer/${permutation}.cache.js`;
    const cacheResp = await fetch(cacheUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!cacheResp.ok) {
      throw new Error(`cache.js returned ${cacheResp.status}`);
    }
    const cacheJs = await cacheResp.text();

    // Serialization policy hash for the 'app' GWT endpoint.
    const headerMatch = cacheJs.match(/'app','([A-F0-9]{32})'/);
    if (!headerMatch) {
      console.warn("Could not extract GWT header; updating permutation only");
      cachedGwtPermutation = permutation;
      gwtValuesLastFetched = Date.now();
      return;
    }

    cachedGwtPermutation = permutation;
    cachedGwtHeader = headerMatch[1];
    gwtValuesLastFetched = Date.now();
    console.log(`GWT values refreshed: perm=${cachedGwtPermutation}, header=${cachedGwtHeader}`);
  } catch (e) {
    console.error("Failed to refresh GWT values, using cached:", e);
  }
}

// Extract set-cookie headers (works in Deno edge runtime)
function extractCookies(resp: Response, jar: Map<string, string>) {
  // Try getSetCookie first (Deno 1.37+), fall back to manual parsing
  const cookies: string[] = resp.headers.getSetCookie?.() || [];
  if (cookies.length === 0) {
    // Fallback: iterate all headers
    resp.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        cookies.push(value);
      }
    });
  }
  for (const cookie of cookies) {
    const [kv] = cookie.split(";");
    const eqIdx = kv.indexOf("=");
    if (eqIdx > 0) {
      const k = kv.substring(0, eqIdx).trim();
      const v = kv.substring(eqIdx + 1).trim();
      if (k && v) jar.set(k, v);
    }
  }
}

// Step 1: Get anti-CSRF token from login page
async function getAntiCsrf(cookieJar: Map<string, string>): Promise<string> {
  console.log("Step 1: Fetching login page for anti-CSRF token...");
  const resp = await fetch(CRONOMETER_LOGIN_PAGE, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    redirect: "follow",
  });

  console.log(`Login page status: ${resp.status}`);
  extractCookies(resp, cookieJar);
  console.log(`Cookies after login page: ${Array.from(cookieJar.keys()).join(", ")}`);

  const html = await resp.text();
  
  // Try multiple patterns for the CSRF token
  let match = html.match(/name="anticsrf"\s+value="([^"]+)"/);
  if (!match) match = html.match(/name='anticsrf'\s+value='([^']+)'/);
  if (!match) match = html.match(/anticsrf['"]\s+value=['"]([\w-]+)['"]/);
  
  if (!match) {
    console.error("Could not find anti-CSRF token. Page snippet:", html.substring(0, 1000));
    throw new Error("Could not find anti-CSRF token on login page");
  }
  
  console.log(`Anti-CSRF token found: ${match[1].substring(0, 10)}...`);
  return match[1];
}

function cookieString(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

// Step 2: Login
async function login(username: string, password: string, cookieJar: Map<string, string>, totpCode?: string) {
  const csrf = await getAntiCsrf(cookieJar);

  console.log("Step 2: Posting login credentials...");
  const body = new URLSearchParams({
    anticsrf: csrf,
    username,
    password,
    userCode: totpCode?.trim() || "",
  });
  const resp = await fetch(CRONOMETER_LOGIN_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Cookie": cookieString(cookieJar),
      "Origin": "https://cronometer.com",
      "Referer": "https://cronometer.com/login/",
    },
    body: body.toString(),
    redirect: "manual",
  });

  console.log(`Login response status: ${resp.status}`);
  extractCookies(resp, cookieJar);
  console.log(`Cookies after login: ${Array.from(cookieJar.keys()).join(", ")}`);
  console.log(`Has sesnonce: ${cookieJar.has("sesnonce")}`);

  const text = await resp.text();
  console.log(`Login response body: ${text.substring(0, 300)}`);
  
  // Handle redirect responses (302) - login succeeded if redirected
  if (resp.status >= 300 && resp.status < 400) {
    console.log("Login succeeded (redirect response)");
    return;
  }
  
  let result: { success?: boolean; error?: string; redirect?: string };
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Login response was not JSON (status ${resp.status}): ${text.substring(0, 300)}`);
  }

  if (result.error === "TOTP_CODE_REQUIRED") {
    throw new CronometerUserError(
      "totp_required",
      "Cronometer requires the 6-digit code from your authenticator app.",
      409,
    );
  }
  if (result.error === "TOTP_CODE_INCORRECT") {
    throw new CronometerUserError(
      "totp_incorrect",
      "That Cronometer authentication code is wrong or expired. Please try a fresh 6-digit code.",
      409,
    );
  }
  if (result.error) {
    throw new CronometerUserError("login_failed", `Cronometer login error: ${result.error}`, 401);
  }
  if (!result.success && !result.redirect) throw new Error(`Login failed. Response: ${JSON.stringify(result)}`);
}

// Step 3: GWT Authenticate to get user ID
async function gwtAuthenticate(cookieJar: Map<string, string>): Promise<string> {
  const payload = `7|0|5|${GWT_MODULE_BASE}|${cachedGwtHeader}|com.cronometer.shared.rpc.CronometerService|authenticate|java.lang.Integer/3438268394|1|2|3|4|1|5|5|-300|`;

  const resp = await fetch(GWT_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": GWT_CONTENT_TYPE,
      "X-GWT-Module-Base": GWT_MODULE_BASE,
      "X-GWT-Permutation": cachedGwtPermutation,
      "User-Agent": "Mozilla/5.0",
      Cookie: cookieString(cookieJar),
    },
    body: payload,
  });

  extractCookies(resp, cookieJar);
  const text = await resp.text();

  // Response like: //OK[123456,...]
  const match = text.match(/OK\[(\d+)/);
  if (!match) throw new Error(`GWT authenticate failed: ${text.substring(0, 200)}`);

  return match[1];
}

// Step 4: Generate auth token for export
async function generateAuthToken(
  cookieJar: Map<string, string>,
  userId: string
): Promise<string> {
  const sesnonce = cookieJar.get("sesnonce") || "";
  const payload = `7|0|8|${GWT_MODULE_BASE}|${cachedGwtHeader}|com.cronometer.shared.rpc.CronometerService|generateAuthorizationToken|java.lang.String/2004016611|I|com.cronometer.shared.user.AuthScope/2065601159|${sesnonce}|1|2|3|4|4|5|6|6|7|8|${userId}|3600|7|2|`;

  const resp = await fetch(GWT_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": GWT_CONTENT_TYPE,
      "X-GWT-Module-Base": GWT_MODULE_BASE,
      "X-GWT-Permutation": cachedGwtPermutation,
      "User-Agent": "Mozilla/5.0",
      Cookie: cookieString(cookieJar),
    },
    body: payload,
  });

  extractCookies(resp, cookieJar);
  const text = await resp.text();

  // Response contains the token in quotes
  const match = text.match(/"([^"]+)"/);
  if (!match) throw new Error(`Failed to get auth token: ${text.substring(0, 200)}`);

  return match[1];
}

// Step 5: Export servings CSV
async function exportServings(
  cookieJar: Map<string, string>,
  userId: string,
  startDate: string,
  endDate: string
): Promise<string> {
  const nonce = await generateAuthToken(cookieJar, userId);

  const url = `${EXPORT_URL}?nonce=${encodeURIComponent(nonce)}&generate=servings&start=${startDate}&end=${endDate}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Cookie: cookieString(cookieJar),
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    // 403 from /export means the session is valid but the account is not
    // permitted to use CSV export — this is a Cronometer Gold-only feature.
    // Surface a dedicated error so we don't ask the user to re-login forever.
    if (resp.status === 403) {
      throw new CronometerUserError(
        "gold_required",
        "Cronometer's CSV export is only available to Cronometer Gold subscribers. The connection is fine, but nutrition data can't be synced until this account upgrades to Gold on cronometer.com.",
        402,
      );
    }
    throw new Error(`Export failed (${resp.status}): ${text.substring(0, 200)}`);
  }

  return await resp.text();
}

// Parse CSV into structured data
function parseServingsCSV(csv: string) {
  // Cronometer exports may use CRLF; split on either and strip stray \r.
  const lines = csv.replace(/\uFEFF/g, "").trim().split(/\r?\n/);
  if (lines.length < 2) return { days: [], raw: csv };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));

  const col = (name: string) => headers.indexOf(name);
  const dayIdx = col("Day");
  const nameIdx = col("Food Name");
  const amountIdx = col("Amount");
  const energyIdx = col("Energy (kcal)");
  const proteinIdx = col("Protein (g)");
  const carbsIdx = col("Carbs (g)");
  const fatIdx = col("Fat (g)");
  const sugarIdx = col("Sugars (g)");
  const sodiumIdx = col("Sodium (mg)");
  const fiberIdx = col("Fiber (g)");
  const groupIdx = col("Group");
  const categoryIdx = col("Category");

  const daysMap: Record<string, Array<Record<string, unknown>>> = {};

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse (handles quoted fields with commas)
    const row = parseCSVRow(lines[i]);
    if (row.length < 3) continue;

    const day = dayIdx >= 0 ? row[dayIdx] : "Unknown";
    const entry = {
      name: nameIdx >= 0 ? row[nameIdx] : "",
      amount: amountIdx >= 0 ? row[amountIdx] : "",
      calories: energyIdx >= 0 ? parseFloat(row[energyIdx]) || 0 : 0,
      protein: proteinIdx >= 0 ? parseFloat(row[proteinIdx]) || 0 : 0,
      carbohydrates: carbsIdx >= 0 ? parseFloat(row[carbsIdx]) || 0 : 0,
      fat: fatIdx >= 0 ? parseFloat(row[fatIdx]) || 0 : 0,
      sugar: sugarIdx >= 0 ? parseFloat(row[sugarIdx]) || 0 : 0,
      sodium: sodiumIdx >= 0 ? parseFloat(row[sodiumIdx]) || 0 : 0,
      fiber: fiberIdx >= 0 ? parseFloat(row[fiberIdx]) || 0 : 0,
      group: groupIdx >= 0 ? row[groupIdx] : "",
      category: categoryIdx >= 0 ? row[categoryIdx] : "",
    };

    if (!daysMap[day]) daysMap[day] = [];
    daysMap[day].push(entry);
  }

  const days = Object.entries(daysMap)
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([date, entries]) => {
      const totals = {
        calories: Math.round(entries.reduce((s, e) => s + (e.calories as number), 0)),
        protein: Math.round(entries.reduce((s, e) => s + (e.protein as number), 0) * 10) / 10,
        carbohydrates: Math.round(entries.reduce((s, e) => s + (e.carbohydrates as number), 0) * 10) / 10,
        fat: Math.round(entries.reduce((s, e) => s + (e.fat as number), 0) * 10) / 10,
        sugar: Math.round(entries.reduce((s, e) => s + (e.sugar as number), 0) * 10) / 10,
        sodium: Math.round(entries.reduce((s, e) => s + (e.sodium as number), 0)),
        fiber: Math.round(entries.reduce((s, e) => s + (e.fiber as number), 0) * 10) / 10,
      };
      return { date, entries, totals };
    });

  return { days, headers };
}

function parseCSVRow(line: string): string[] {
  // Drop any trailing \r before parsing (defense-in-depth against CRLF).
  const clean = line.replace(/\r$/, "");
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Return YYYY-MM-DD for "now" in a given IANA timezone.
function todayInTz(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) { /* fall through */ }
  return new Date().toISOString().slice(0, 10);
}

// Add `n` days to a YYYY-MM-DD date string (no TZ math involved).
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Async mutex to serialize global cachedGwt* mutations within an isolate.
let gwtChain: Promise<unknown> = Promise.resolve();
function withGwtLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = gwtChain.then(fn, fn);
  gwtChain = run.catch(() => {});
  return run;
}

// Retry a transient-failing async op with exponential backoff.
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 400,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i === attempts - 1) break;
      await sleep(baseMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractGwtResponseMessage(raw: string): string | null {
  const matches = [...raw.matchAll(/"([^"]+)"/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const value = matches[i][1];
    if (
      value &&
      !value.startsWith("com.") &&
      !value.startsWith("java.") &&
      !/^[A-F0-9]{32}$/i.test(value)
    ) {
      return value;
    }
  }
  return null;
}

// Most recent Monday on/before given date
function mondayOf(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Push macro targets to Cronometer for a given date.
// Reverse-engineered GWT-RPC payload (updateDailyTargetTemplate).
// Source: cphoskins/cronometer-mcp.
async function updateDailyTargets(
  cookieJar: Map<string, string>,
  userId: string,
  day: Date,
  targets: { calories: number; protein: number; carbs: number; fat: number },
  templateName = "Coach Targets",
): Promise<void> {
  const sesnonce = cookieJar.get("sesnonce") || "";
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(v));
  const payload =
    `7|0|12|${GWT_MODULE_BASE}|${cachedGwtHeader}|` +
    `com.cronometer.shared.rpc.CronometerService|` +
    `updateDailyTargetTemplate|java.lang.String/2004016611|` +
    `I|com.cronometer.shared.targets.models.MacroTargetTemplate/3691130822|` +
    `${sesnonce}|` +
    `java.lang.Boolean/476441737|` +
    `java.lang.Double/858496421|` +
    `com.cronometer.shared.entries.models.Day/782579793|` +
    `${templateName}|` +
    `1|2|3|4|3|5|6|7|8|${userId}|` +
    `7|9|0|10|${fmt(targets.carbs)}|0|11|${day.getUTCDate()}|${day.getUTCMonth() + 1}|${day.getUTCFullYear()}|` +
    `10|${fmt(targets.calories)}|10|${fmt(targets.fat)}|0|1|0|0|0|12|10|${fmt(targets.protein)}|0|`;

  const resp = await fetch(GWT_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": GWT_CONTENT_TYPE,
      "X-GWT-Module-Base": GWT_MODULE_BASE,
      "X-GWT-Permutation": cachedGwtPermutation,
      "User-Agent": "Mozilla/5.0",
      Cookie: cookieString(cookieJar),
    },
    body: payload,
  });
  extractCookies(resp, cookieJar);
  const text = await resp.text();
  if (!text.includes("Success") && !text.startsWith("//OK")) {
    throw new Error(`updateDailyTargetTemplate failed: ${text.substring(0, 250)}`);
  }
}

// ===== Helpers for recurring macro target schedules =====
// These let us push targets that persist across all future days, not just today.

async function gwtPost(cookieJar: Map<string, string>, payload: string): Promise<string> {
  const resp = await fetch(GWT_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": GWT_CONTENT_TYPE,
      "X-GWT-Module-Base": GWT_MODULE_BASE,
      "X-GWT-Permutation": cachedGwtPermutation,
      "User-Agent": "Mozilla/5.0",
      Cookie: cookieString(cookieJar),
    },
    body: payload,
  });
  extractCookies(resp, cookieJar);
  return await resp.text();
}

// Extract the string table from a `//OK[...,["a","b",...],0,7]` GWT response.
function extractGwtStringTable(raw: string): string[] {
  const closing = ",0,7]";
  const stClose = raw.length - closing.length - 1;
  let depth = 1, pos = stClose - 1, inStr = false;
  while (pos >= 0 && depth > 0) {
    const ch = raw[pos];
    if (ch === '"' && (pos === 0 || raw[pos - 1] !== "\\")) {
      inStr = !inStr;
    } else if (!inStr) {
      if (ch === "]") depth += 1;
      else if (ch === "[") depth -= 1;
    }
    pos -= 1;
  }
  const stOpen = pos + 1;
  try {
    return JSON.parse(raw.substring(stOpen, stClose + 1));
  } catch {
    return [];
  }
}

// Tokenize data section (everything between `//OK[` and the string table).
function tokenizeGwtData(raw: string): Array<number | string | null> {
  const closing = ",0,7]";
  const stClose = raw.length - closing.length - 1;
  let depth = 1, pos = stClose - 1, inStr = false;
  while (pos >= 0 && depth > 0) {
    const ch = raw[pos];
    if (ch === '"' && (pos === 0 || raw[pos - 1] !== "\\")) {
      inStr = !inStr;
    } else if (!inStr) {
      if (ch === "]") depth += 1;
      else if (ch === "[") depth -= 1;
    }
    pos -= 1;
  }
  const stOpen = pos + 1;
  const dataSection = raw.substring(5, stOpen).replace(/,$/, "");
  if (!dataSection) return [];
  const tokens: Array<number | string | null> = [];
  for (const partRaw of dataSection.split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    if (part.startsWith('"') && part.endsWith('"')) {
      tokens.push(part.slice(1, -1));
      continue;
    }
    try {
      tokens.push(part.includes(".") ? parseFloat(part) : parseInt(part, 10));
    } catch {
      tokens.push(null);
    }
  }
  return tokens;
}

// Fetch saved macro target templates -> [{ template_id, template_name }]
async function getMacroTargetTemplates(
  cookieJar: Map<string, string>,
  userId: string,
): Promise<Array<{ template_id: number; template_name: string; protein_g: number; fat_g: number; calories: number; carbs_g: number }>> {
  const sesnonce = cookieJar.get("sesnonce") || "";
  const payload =
    `7|0|7|${GWT_MODULE_BASE}|${cachedGwtHeader}|` +
    `com.cronometer.shared.rpc.CronometerService|` +
    `getMacroTargetTemplates|java.lang.String/2004016611|` +
    `I|${sesnonce}|` +
    `1|2|3|4|2|5|6|7|${userId}|`;
  const raw = await gwtPost(cookieJar, payload);
  if (!raw.startsWith("//OK[")) return [];

  const stringTable = extractGwtStringTable(raw);
  const tokens = tokenizeGwtData(raw);
  if (!stringTable.length || !tokens.length) return [];

  // Find type-ref index for MacroTargetTemplate in string table
  let templateTypeIdx: number | null = null;
  for (let i = 0; i < stringTable.length; i++) {
    if (stringTable[i].includes("MacroTargetTemplate/")) {
      templateTypeIdx = i + 1;
      break;
    }
  }
  if (templateTypeIdx == null) return [];

  // Block size = first occurrence index + 1
  let firstPos: number | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === templateTypeIdx) { firstPos = i; break; }
  }
  if (firstPos == null) return [];
  const blockSize = firstPos + 1;

  // String-table index -> name map (skip class refs)
  const nameMap = new Map<number, string>();
  for (let i = 0; i < stringTable.length; i++) {
    const entry = stringTable[i];
    if (
      !entry.startsWith("com.") &&
      !entry.startsWith("java.") &&
      !entry.startsWith("[")
    ) {
      nameMap.set(i + 1, entry);
      nameMap.set(-(i + 1), entry);
    }
  }

  const results: Array<{ template_id: number; template_name: string; protein_g: number; fat_g: number; calories: number; carbs_g: number }> = [];
  let blockIdx = 0;
  while (true) {
    const start = blockIdx * blockSize;
    const end = start + blockSize;
    if (end > tokens.length) break;
    const block = tokens.slice(start, end);

    const floats = block.filter((t): t is number => typeof t === "number" && !Number.isInteger(t));

    let name = "";
    for (const t of block) {
      if (typeof t === "number" && Number.isInteger(t) && nameMap.has(t)) {
        name = nameMap.get(t)!;
      }
    }
    let templateId = 0;
    for (const t of block) {
      if (typeof t === "number" && Number.isInteger(t) && t > stringTable.length) {
        templateId = t;
        break;
      }
    }
    if (templateId > 0 && floats.length >= 4) {
      results.push({
        template_id: templateId,
        template_name: name,
        protein_g: floats[0],
        fat_g: floats[1],
        calories: floats[2],
        carbs_g: floats[3],
      });
    }
    blockIdx += 1;
  }
  return results;
}

// Create a new saved macro target template. Returns server-assigned template_id, or 0 on failure.
async function saveMacroTargetTemplate(
  cookieJar: Map<string, string>,
  userId: string,
  templateName: string,
  targets: { calories: number; protein: number; carbs: number; fat: number },
): Promise<number> {
  const beforeTemplates = await getMacroTargetTemplates(cookieJar, userId);
  const sesnonce = cookieJar.get("sesnonce") || "";
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(v));
  const carbsStr = fmt(targets.carbs);
  const fatStr = fmt(targets.fat);
  const calStr = fmt(targets.calories);
  const proStr = fmt(targets.protein);

  // GWT encodes back-references when fat == carbs (Double object reuse).
  let dataSection: string;
  if (targets.fat === targets.carbs) {
    dataSection =
      `8|${userId}|` +
      `7|9|0|10|${carbsStr}|-3|0|10|${calStr}|-3|-3|0|` +
      `11|0|12|0|13|10|${proStr}|-6|`;
  } else {
    dataSection =
      `8|${userId}|` +
      `7|9|0|10|${carbsStr}|10|${fatStr}|0|10|${calStr}|` +
      `10|${fatStr}|10|${fatStr}|0|` +
      `11|0|12|0|13|10|${proStr}|10|${calStr}|`;
  }

  const header =
    `7|0|13|${GWT_MODULE_BASE}|${cachedGwtHeader}|` +
    `com.cronometer.shared.rpc.CronometerService|` +
    `saveMacroTargetTemplate|java.lang.String/2004016611|` +
    `I|com.cronometer.shared.targets.models.MacroTargetTemplate/3691130822|` +
    `${sesnonce}|` +
    `java.lang.Boolean/476441737|` +
    `java.lang.Double/858496421|` +
    `java.lang.Integer/3438268394|` +
    `Rigorous|` +
    `${templateName}|` +
    `1|2|3|4|3|5|6|7|`;

  const raw = await gwtPost(cookieJar, header + dataSection);
  if (!raw.includes("//OK")) {
    throw new Error(`saveMacroTargetTemplate failed: ${raw.substring(0, 250)}`);
  }
  const responseMessage = extractGwtResponseMessage(raw);
  if (responseMessage?.toLowerCase().includes("you must be gold to create templates")) {
    throw new Error("requires_gold_recurring_targets");
  }
  // Cronometer sometimes acknowledges the save before the new template is
  // visible in getMacroTargetTemplates, so poll briefly before giving up.
  const beforeIds = new Set(beforeTemplates.map((t) => t.template_id));
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(350 * attempt);
    const templates = await getMacroTargetTemplates(cookieJar, userId);

    let newest = 0;
    for (const t of templates) {
      if (t.template_name === templateName && t.template_id > newest) {
        newest = t.template_id;
      }
    }
    if (newest) return newest;

    for (const t of templates) {
      if (!beforeIds.has(t.template_id)) {
        return t.template_id;
      }
    }
  }

  throw new Error(`Could not resolve new template id for '${templateName}' after polling`);
}

// Assign a template to a day of the week. dayOfWeekIso: 0=Mon ... 6=Sun.
async function saveMacroSchedule(
  cookieJar: Map<string, string>,
  userId: string,
  dayOfWeekIso: number,
  templateId: number,
): Promise<void> {
  const sesnonce = cookieJar.get("sesnonce") || "";
  const payload =
    `7|0|9|${GWT_MODULE_BASE}|${cachedGwtHeader}|` +
    `com.cronometer.shared.rpc.CronometerService|` +
    `saveMacroSchedule|java.lang.String/2004016611|` +
    `I|com.cronometer.shared.targets.DayOfWeek/913617675|` +
    `${sesnonce}|` +
    `com.cronometer.shared.targets.DayOfWeek$DayOfWeekEnum/3974900421|` +
    `1|2|3|4|4|5|6|7|6|8|${userId}|7|9|${dayOfWeekIso}|${templateId}|`;
  const raw = await gwtPost(cookieJar, payload);
  if (!raw.includes("//OK")) {
    throw new Error(`saveMacroSchedule failed: ${raw.substring(0, 250)}`);
  }
}

async function deleteMacroTargetTemplate(
  cookieJar: Map<string, string>,
  userId: string,
  templateId: number,
): Promise<void> {
  const sesnonce = cookieJar.get("sesnonce") || "";
  const payload =
    `7|0|7|${GWT_MODULE_BASE}|${cachedGwtHeader}|` +
    `com.cronometer.shared.rpc.CronometerService|` +
    `deleteMacroTargetTemplate|java.lang.String/2004016611|` +
    `I|${sesnonce}|` +
    `1|2|3|4|3|5|6|6|7|${userId}|${templateId}|`;
  await gwtPost(cookieJar, payload); // best effort
}

// Replace the client's recurring macro schedule with a fresh "Coach Targets" template,
// applied to all 7 days of the week (so future days inherit it indefinitely).
// Also cleans up any previous "Coach Targets *" templates.
const COACH_TEMPLATE_PREFIX = "Coach Targets";
async function applyRecurringCoachTargets(
  cookieJar: Map<string, string>,
  userId: string,
  targets: { calories: number; protein: number; carbs: number; fat: number },
): Promise<void> {
  const existing = await getMacroTargetTemplates(cookieJar, userId);
  const oldIds = existing
    .filter((t) => t.template_name.startsWith(COACH_TEMPLATE_PREFIX))
    .map((t) => t.template_id);

  // Use a timestamp suffix so the new template has a unique name (avoids
  // server collapsing duplicates and lets us identify the new id reliably).
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").substring(0, 14);
  const newName = `${COACH_TEMPLATE_PREFIX} ${stamp}`;
  const newId = await saveMacroTargetTemplate(cookieJar, userId, newName, targets);
  if (!newId) throw new Error("Could not resolve new template id");

  // Assign the new template to every day of the week (ISO: 0=Mon..6=Sun).
  for (let dow = 0; dow < 7; dow++) {
    await saveMacroSchedule(cookieJar, userId, dow, newId);
  }

  // Clean up previous Coach Targets templates.
  for (const id of oldIds) {
    try { await deleteMacroTargetTemplate(cookieJar, userId, id); } catch { /* ignore */ }
  }
}

// Cache JWKS for JWT verification
let cachedJwks: any = null;
async function getJwks() {
  if (cachedJwks) return cachedJwks;
  const jwksEnv = Deno.env.get("SUPABASE_JWKS");
  if (jwksEnv) {
    try { cachedJwks = JSON.parse(jwksEnv); return cachedJwks; } catch { /* fallthrough */ }
  }
  const url = `${Deno.env.get("SUPABASE_URL")}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(url);
  cachedJwks = await res.json();
  return cachedJwks;
}

async function authedClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Unauthorized" as const, status: 401 as const };
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verify JWT signature locally via JWKS (no session lookup required)
  try {
    const jose = await import("https://deno.land/x/jose@v5.9.6/index.ts");
    const jwks = await getJwks();
    const keystore = jose.createLocalJWKSet(jwks);
    const { payload } = await jose.jwtVerify(token, keystore);
    const userId = payload.sub as string;
    if (!userId) {
      console.error("[cronometer] JWT missing sub");
      return { error: "Unauthorized" as const, status: 401 as const };
    }
    return { supabase, userId };
  } catch (e) {
    console.error("[cronometer] JWT verify failed:", (e as Error).message);
    return { error: "Unauthorized" as const, status: 401 as const };
  }
}

async function isServiceRoleRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) return true;
  const cronSecret = Deno.env.get("CRON_SECRET");
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronSecret && cronHeader && cronHeader === cronSecret) return true;
  // Also accept the DB-managed internal cron token (used by pg_cron jobs).
  if (cronHeader && serviceRoleKey) {
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
      const { data } = await admin
        .from("internal_secrets")
        .select("value")
        .eq("name", "cron_token")
        .maybeSingle();
      if (data?.value && data.value === cronHeader) return true;
    } catch (_) { /* fall through */ }
  }
  return false;
}

async function reapplyTodayTargetsForClient(
  admin: any,
  clientId: string,
) {
  const { data: session, error: sessionError } = await admin
    .from("cronometer_sessions")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (sessionError) {
    return { ok: false as const, error: sessionError.message };
  }

  if (!session) {
    return { ok: false as const, error: "no_session" };
  }

  if (!session.target_sync_enabled) {
    return { ok: false as const, error: "sync_disabled" };
  }

  const { data: latestPush, error: pushError } = await admin
    .from("cronometer_target_pushes")
    .select("calories, protein_g, carbs_g, fat_g, pushed_at")
    .eq("client_id", clientId)
    .eq("success", true)
    .order("pushed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pushError) {
    return { ok: false as const, error: pushError.message };
  }

  if (!latestPush) {
    return { ok: false as const, error: "no_saved_targets" };
  }

  await refreshGwtValues(true);
  const cookieJar = new Map<string, string>(
    Object.entries(session.cookies as Record<string, string>),
  );

  try {
    await updateDailyTargets(cookieJar, session.user_id_external, new Date(), {
      calories: Number(latestPush.calories) || 0,
      protein: Number(latestPush.protein_g) || 0,
      carbs: Number(latestPush.carbs_g) || 0,
      fat: Number(latestPush.fat_g) || 0,
    });

    await admin
      .from("cronometer_sessions")
      .update({
        cookies: Object.fromEntries(cookieJar),
        gwt_permutation: cachedGwtPermutation,
        gwt_header: cachedGwtHeader,
        last_error: null,
      })
      .eq("client_id", clientId);

    return {
      ok: true as const,
      pushedAt: latestPush.pushed_at,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("cronometer_sessions")
      .update({ last_error: msg })
      .eq("client_id", clientId);

    return { ok: false as const, error: msg };
  }
}

// Decide whether an export error indicates a truly expired session vs. a

// transient network/upstream error we should not log the user out for.
function classifyExportError(err: unknown): { expired: boolean; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  // Explicit signals from Cronometer that the session is no longer valid.
  if (/\b(401|403)\b/.test(msg)) return { expired: true, message: msg };
  if (/login|signin|sign\s*in|anti-?csrf|not authenticated|unauthor/i.test(msg)) {
    return { expired: true, message: msg };
  }
  return { expired: false, message: msg };
}

// Core sync routine, reusable by the authed `sync` action and the cron-driven
// `admin_sync_all` action. Uses a per-isolate GWT mutex to avoid races on the
// global cachedGwt* values when multiple sessions sync concurrently.
async function runSyncForSession(
  db: any,
  session: any,
): Promise<
  | { ok: true; days_synced: number; days_scanned: number; up_to_date: boolean; from: string; to: string; skipped?: boolean }
  | { ok: false; expired: boolean; message: string }
> {
  const clientId = session.client_id as string;

  // Per-client throttle: skip if we synced within the last 45s (debounce + race guard).
  if (session.last_synced_at) {
    const ageMs = Date.now() - new Date(session.last_synced_at).getTime();
    if (ageMs >= 0 && ageMs < 45_000) {
      return {
        ok: true,
        days_synced: 0,
        days_scanned: 0,
        up_to_date: true,
        from: "",
        to: "",
        skipped: true,
      };
    }
  }

  const tz: string = session.tz || "Europe/Amsterdam";
  const todayIso = todayInTz(tz);

  const { data: latest } = await db
    .from("cronometer_nutrition_logs")
    .select("log_date")
    .eq("client_id", clientId)
    .order("log_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const LOOKBACK_DAYS = 7;
  let startIso = addDaysIso(todayIso, -LOOKBACK_DAYS);
  if (!latest?.log_date) {
    // First sync: extend back to the Monday before the lookback window.
    const back = addDaysIso(todayIso, -LOOKBACK_DAYS);
    const [yy, mm, dd] = back.split("-").map(Number);
    const dt = new Date(Date.UTC(yy, mm - 1, dd));
    const dow = dt.getUTCDay(); // 0=Sun..6=Sat
    const diff = dow === 0 ? -6 : 1 - dow;
    startIso = addDaysIso(back, diff);
  }

  const cookieJar = new Map<string, string>(
    Object.entries(session.cookies as Record<string, string>),
  );

  let csv: string;
  try {
    csv = await withGwtLock(async () => {
      await refreshGwtValues();
      return await withRetry(
        () => exportServings(cookieJar, session.user_id_external, startIso, todayIso),
        2,
        500,
      );
    });
  } catch (e) {
    const { expired, message } = classifyExportError(e);
    await db
      .from("cronometer_sessions")
      .update({ last_error: message })
      .eq("client_id", clientId);
    return { ok: false, expired, message };
  }

  const parsed = parseServingsCSV(csv);
  const dayMap = new Map(parsed.days.map((d: any) => [d.date, d]));

  const rows: any[] = [];
  let cur = startIso;
  while (cur <= todayIso) {
    const day: any = dayMap.get(cur);
    rows.push({
      client_id: clientId,
      log_date: cur,
      calories: day?.totals.calories ?? 0,
      protein_g: day?.totals.protein ?? 0,
      carbs_g: day?.totals.carbohydrates ?? 0,
      fat_g: day?.totals.fat ?? 0,
      fiber_g: day?.totals.fiber ?? 0,
      sugar_g: day?.totals.sugar ?? 0,
      sodium_mg: day?.totals.sodium ?? 0,
      entries: day?.entries ?? [],
      source: "cronometer",
      synced_at: new Date().toISOString(),
    });
    cur = addDaysIso(cur, 1);
  }

  if (rows.length > 0) {
    const { error: insErr } = await db
      .from("cronometer_nutrition_logs")
      .upsert(rows, { onConflict: "client_id,log_date" });
    if (insErr) return { ok: false, expired: false, message: insErr.message };
  }

  // Persist any refreshed cookies along with the sync timestamp.
  await db
    .from("cronometer_sessions")
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      cookies: Object.fromEntries(cookieJar),
      gwt_permutation: cachedGwtPermutation,
      gwt_header: cachedGwtHeader,
    })
    .eq("client_id", clientId);

  const daysWithData = rows.filter((r) => Number(r.calories) > 0).length;
  return {
    ok: true,
    days_synced: daysWithData,
    days_scanned: rows.length,
    up_to_date: daysWithData === 0,
    from: startIso,
    to: todayIso,
  };
}

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ==== connect_and_save: login + persist session in DB ====
    if (action === "connect_and_save") {
      const auth = await authedClient(req);
      if ("error" in auth) return json({ error: auth.error }, auth.status);

      const { username, password, totpCode } = body;
      if (!username || !password) {
        return json({ error: "Username and password are required" }, 400);
      }

      await refreshGwtValues(true);
      const cookieJar = new Map<string, string>();
      await login(username, password, cookieJar, totpCode);
      const userId = await gwtAuthenticate(cookieJar);
      const cookies = Object.fromEntries(cookieJar);

      const { error: upsertErr } = await auth.supabase
        .from("cronometer_sessions")
        .upsert({
          client_id: auth.userId,
          cronometer_username: username,
          cookies,
          user_id_external: userId,
          gwt_permutation: cachedGwtPermutation,
          gwt_header: cachedGwtHeader,
          connected_at: new Date().toISOString(),
          last_error: null,
        }, { onConflict: "client_id" });

      if (upsertErr) {
        return json({ error: `Failed to save session: ${upsertErr.message}` }, 500);
      }

      return json({ success: true });
    }

    // ==== sync: fetch missing days from last log -> today (user-initiated) ====
    if (action === "sync") {
      const auth = await authedClient(req);
      if ("error" in auth) return json({ error: auth.error }, auth.status);

      const { data: session, error: sessErr } = await auth.supabase
        .from("cronometer_sessions")
        .select("*")
        .eq("client_id", auth.userId)
        .maybeSingle();

      if (sessErr) return json({ error: sessErr.message }, 500);
      if (!session) return json({ error: "no_session", message: "Connect Cronometer first" }, 400);

      // User-initiated: force a sync regardless of the throttle window.
      const forced = { ...session, last_synced_at: null };
      const result = await runSyncForSession(auth.supabase, forced);
      if (!result.ok) {
        return json(
          { error: result.expired ? "session_expired" : "sync_failed", message: result.message },
          result.expired ? 401 : 502,
        );
      }
      return json({
        success: true,
        days_synced: result.days_synced,
        days_scanned: result.days_scanned,
        up_to_date: result.up_to_date,
        from: result.from,
        to: result.to,
      });
    }

    // ==== admin_sync_all: cron-driven, service-role-only background sync ====
    if (action === "admin_sync_all") {
      if (!(await isServiceRoleRequest(req))) {
        return json({ error: "Unauthorized" }, 401);
      }
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: sessions, error: sErr } = await admin
        .from("cronometer_sessions")
        .select("*");
      if (sErr) return json({ error: sErr.message }, 500);

      const results: Array<Record<string, unknown>> = [];
      let synced = 0, skipped = 0, expired = 0, failed = 0;
      for (const sess of sessions ?? []) {
        const r = await runSyncForSession(admin, sess);
        if (r.ok) {
          if (r.skipped) skipped++;
          else synced++;
          results.push({ client_id: sess.client_id, ok: true, skipped: !!r.skipped, days_synced: r.days_synced });
        } else {
          if (r.expired) expired++; else failed++;
          results.push({ client_id: sess.client_id, ok: false, expired: r.expired, message: r.message });
        }
      }
      return json({
        success: true,
        total: (sessions ?? []).length,
        synced, skipped, expired, failed,
        results,
      });
    }


    if (action === "reapply_today_targets") {
      if (!(await isServiceRoleRequest(req))) {
        return json({ error: "Unauthorized" }, 401);
      }

      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: sessions, error: sessionsError } = await admin
        .from("cronometer_sessions")
        .select("client_id")
        .eq("target_sync_enabled", true);

      if (sessionsError) {
        return json({ error: sessionsError.message }, 500);
      }

      const results: Array<{ client_id: string; ok: boolean; error?: string }> = [];
      for (const session of sessions ?? []) {
        const result = await reapplyTodayTargetsForClient(admin, session.client_id);
        results.push({
          client_id: session.client_id,
          ok: result.ok,
          error: result.ok ? undefined : result.error,
        });
      }

      return json({
        success: true,
        scanned: (sessions ?? []).length,
        updated: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
    }

    // ==== Legacy actions (unchanged) ====
    const { username, password, totpCode, start, end, cookies, user_id, gwt_permutation, gwt_header } = body;

    if (action === "connect") {
      if (!username || !password) {
        return json({ error: "Username and password are required" }, 400);
      }
      await refreshGwtValues();
      const cookieJar = new Map<string, string>();
      await login(username, password, cookieJar, totpCode);
      const userId = await gwtAuthenticate(cookieJar);
      const cookiesOut = Object.fromEntries(cookieJar);
      return json({
        success: true,
        user_id: userId,
        cookies: cookiesOut,
        gwt_permutation: cachedGwtPermutation,
        gwt_header: cachedGwtHeader,
      });
    }

    if (action === "export") {
      if (!cookies || !user_id) {
        return json({ error: "Missing session data. Please sign in again." }, 400);
      }
      if (gwt_permutation) cachedGwtPermutation = gwt_permutation;
      if (gwt_header) cachedGwtHeader = gwt_header;
      const cookieJar = new Map<string, string>(Object.entries(cookies));
      const endDate = end || new Date().toISOString().split("T")[0];
      const startDate = start || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return d.toISOString().split("T")[0];
      })();
      const csv = await exportServings(cookieJar, user_id, startDate, endDate);
      const parsed = parseServingsCSV(csv);
      return json({ success: true, ...parsed });
    }

    if (action === "login_and_export") {
      if (!username || !password) {
        return json({ error: "Username and password are required" }, 400);
      }
      await refreshGwtValues();
      const cookieJar = new Map<string, string>();
      await login(username, password, cookieJar, totpCode);
      const userId = await gwtAuthenticate(cookieJar);
      const endDate = end || new Date().toISOString().split("T")[0];
      const startDate = start || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return d.toISOString().split("T")[0];
      })();
      const csv = await exportServings(cookieJar, userId, startDate, endDate);
      const parsed = parseServingsCSV(csv);
      return json({ success: true, ...parsed });
    }

    // ==== push_targets: send macro targets to client's Cronometer ====
    if (action === "push_targets") {
      const auth = await authedClient(req);
      if ("error" in auth) return json({ error: auth.error }, auth.status);

      const { client_id, calories, protein_g, carbs_g, fat_g } = body;
      if (!client_id) return json({ error: "client_id required" }, 400);
      const c = Number(calories), p = Number(protein_g), cb = Number(carbs_g), f = Number(fat_g);
      if (![c, p, cb, f].every((v) => Number.isFinite(v) && v >= 0 && v < 20000)) {
        return json({ error: "Invalid macro values" }, 400);
      }

      // Authorization: caller must be the client themselves OR a coach of the client.
      let isCoach = false;
      if (auth.userId !== client_id) {
        const { data: coachCheck } = await auth.supabase
          .rpc("is_coach_of", { _coach_id: auth.userId, _client_id: client_id });
        isCoach = !!coachCheck;
        if (!isCoach) return json({ error: "Not authorized for this client" }, 403);
      }

      // Use service-role client so we can read the client's session even when caller is coach.
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: session } = await admin
        .from("cronometer_sessions")
        .select("*")
        .eq("client_id", client_id)
        .maybeSingle();

      const logRow: any = {
        client_id,
        coach_id: isCoach ? auth.userId : null,
        calories: c, protein_g: p, carbs_g: cb, fat_g: f,
        success: false,
      };

      if (!session) {
        logRow.error = "no_session";
        await admin.from("cronometer_target_pushes").insert(logRow);
        return json({ error: "no_session", message: "Client has not connected Cronometer" }, 400);
      }
      await refreshGwtValues(true);
      const cookieJar = new Map<string, string>(
        Object.entries(session.cookies as Record<string, string>),
      );

      try {
        const targets = { calories: c, protein: p, carbs: cb, fat: f };
        // 1. Update today's daily target so the change shows up immediately.
        await updateDailyTargets(cookieJar, session.user_id_external, new Date(), targets);
        // 2. Best-effort: replace the recurring weekly macro schedule so every
        //    future day inherits these targets. The reverse-engineered GWT
        //    template API is brittle; if it fails we fall back to writing the
        //    next 90 daily targets one-by-one so the client still sees the new
        //    macros for the foreseeable future.
        let recurringWarning: string | null = null;
        let recurringCode: string | null = null;
        let fallbackDays = 0;
        try {
          await applyRecurringCoachTargets(cookieJar, session.user_id_external, targets);
        } catch (re) {
          const rawMessage = re instanceof Error ? re.message : String(re);
          if (rawMessage === "requires_gold_recurring_targets") {
            recurringCode = "requires_gold";
            recurringWarning = "Cronometer requires Gold on the client account to update recurring macro targets for future days. Today's targets were updated, but future days keep their existing schedule.";
          } else {
            recurringCode = "recurring_failed";
            recurringWarning = rawMessage;
            console.warn("applyRecurringCoachTargets failed, falling back to per-day writes:", recurringWarning);
            const FALLBACK_DAYS = 90;
            const base = new Date();
            for (let i = 1; i <= FALLBACK_DAYS; i++) {
              const d = new Date(base);
              d.setUTCDate(base.getUTCDate() + i);
              try {
                await updateDailyTargets(cookieJar, session.user_id_external, d, targets);
                fallbackDays++;
              } catch (de) {
                console.warn(`per-day fallback failed at +${i}d:`, de instanceof Error ? de.message : de);
                break;
              }
            }
          }
        }
        // Persist any refreshed cookies/nonce
        await admin
          .from("cronometer_sessions")
          .update({
            cookies: Object.fromEntries(cookieJar),
            gwt_permutation: cachedGwtPermutation,
            gwt_header: cachedGwtHeader,
            target_sync_enabled: true,
            last_error: recurringWarning,
          })
          .eq("client_id", client_id);

        logRow.success = true;
        if (recurringWarning) {
          logRow.error = `recurring_warning(${recurringCode ?? "unknown"}): ${recurringWarning}; fallback_days=${fallbackDays}`;
        }
        await admin.from("cronometer_target_pushes").insert(logRow);
        return json({ success: true, recurring_warning: recurringWarning, recurring_code: recurringCode, fallback_days: fallbackDays });

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logRow.error = msg;
        await admin.from("cronometer_target_pushes").insert(logRow);
        await admin.from("cronometer_sessions")
          .update({ last_error: msg })
          .eq("client_id", client_id);
        return json({ error: "push_failed", message: msg }, 502);
      }
    }

    return json({ error: "Invalid action. Use: connect_and_save, sync, push_targets, connect, export, or login_and_export" }, 400);
  } catch (e) {
    console.error("Cronometer error:", e);
    if (e instanceof CronometerUserError) {
      return json({ error: e.code, message: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
