import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CRONOMETER_LOGIN_PAGE = "https://cronometer.com/login/";
const CRONOMETER_LOGIN_API = "https://cronometer.com/login";
const GWT_BASE_URL = "https://cronometer.com/cronometer/app";
const EXPORT_URL = "https://cronometer.com/export";

const GWT_CONTENT_TYPE = "text/x-gwt-rpc; charset=UTF-8";
const GWT_MODULE_BASE = "https://cronometer.com/cronometer/";

// These values change with Cronometer deploys. We try to scrape them dynamically,
// falling back to known values.
let cachedGwtPermutation = "7B121DC5483BF272B1BC1916DA9FA963";
let cachedGwtHeader = "2D6A926E3729946302DC68073CB0D550";
let gwtValuesLastFetched = 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Try to scrape the current GWT permutation & header from cronometer.com
async function refreshGwtValues() {
  if (Date.now() - gwtValuesLastFetched < 3600_000) return; // cache 1hr
  try {
    // Fetch the main page to find the .nocache.js URL
    const mainResp = await fetch("https://cronometer.com/cronometer/", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const mainHtml = await mainResp.text();

    // Find the nocache.js script
    const noCacheMatch = mainHtml.match(/src="([^"]*\.nocache\.js)"/);
    if (noCacheMatch) {
      const noCacheUrl = noCacheMatch[1].startsWith("http")
        ? noCacheMatch[1]
        : `https://cronometer.com/cronometer/${noCacheMatch[1]}`;
      const noCacheResp = await fetch(noCacheUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const noCacheJs = await noCacheResp.text();

      // Extract permutation hash - it's a 32-char hex string used in URL
      const permMatch = noCacheJs.match(/\b([A-F0-9]{32})\b/);
      if (permMatch) {
        cachedGwtPermutation = permMatch[1];
      }
    }

    // For the header value, we'd need to inspect the compiled JS which is complex.
    // The header value is embedded in the GWT-serialized payloads.
    // We'll try fetching the permutation JS file to find it.
    const permUrl = `https://cronometer.com/cronometer/${cachedGwtPermutation}.cache.js`;
    const permResp = await fetch(permUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (permResp.ok) {
      const permJs = await permResp.text();
      // The serialization policy hash appears as a string constant
      const headerMatch = permJs.match(/'([A-F0-9]{32})'/);
      if (headerMatch) {
        cachedGwtHeader = headerMatch[1];
      }
    }

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
async function login(username: string, password: string, cookieJar: Map<string, string>) {
  const csrf = await getAntiCsrf(cookieJar);

  console.log("Step 2: Posting login credentials...");
  const body = new URLSearchParams({ anticsrf: csrf, username, password });
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

  if (result.error) throw new Error(`Cronometer login error: ${result.error}`);
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
    throw new Error(`Export failed (${resp.status}): ${text.substring(0, 200)}`);
  }

  return await resp.text();
}

// Parse CSV into structured data
function parseServingsCSV(csv: string) {
  const lines = csv.trim().split("\n");
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
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
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

function isServiceRoleRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;
}

async function reapplyTodayTargetsForClient(
  admin: ReturnType<typeof createClient>,
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

  await refreshGwtValues();
  cachedGwtPermutation = session.gwt_permutation || cachedGwtPermutation;
  cachedGwtHeader = session.gwt_header || cachedGwtHeader;
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

      const { username, password } = body;
      if (!username || !password) {
        return json({ error: "Username and password are required" }, 400);
      }

      await refreshGwtValues();
      const cookieJar = new Map<string, string>();
      await login(username, password, cookieJar);
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

    // ==== sync: fetch missing days from last log -> today ====
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

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: latest } = await auth.supabase
        .from("cronometer_nutrition_logs")
        .select("log_date")
        .eq("client_id", auth.userId)
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      let startDate: Date;
      if (latest?.log_date) {
        startDate = addDays(new Date(latest.log_date + "T00:00:00Z"), 1);
        if (startDate > today) {
          return json({ success: true, days_synced: 0, up_to_date: true });
        }
      } else {
        startDate = mondayOf(today);
      }

      const cookieJar = new Map<string, string>(
        Object.entries(session.cookies as Record<string, string>),
      );
      cachedGwtPermutation = session.gwt_permutation;
      cachedGwtHeader = session.gwt_header;

      let csv: string;
      try {
        csv = await exportServings(
          cookieJar,
          session.user_id_external,
          isoDate(startDate),
          isoDate(today),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await auth.supabase
          .from("cronometer_sessions")
          .update({ last_error: msg })
          .eq("client_id", auth.userId);
        return json({ error: "session_expired", message: msg }, 401);
      }

      const parsed = parseServingsCSV(csv);

      const rows: any[] = [];
      const dayMap = new Map(parsed.days.map((d: any) => [d.date, d]));
      for (let cur = new Date(startDate); cur <= today; cur = addDays(cur, 1)) {
        const dateStr = isoDate(cur);
        const day: any = dayMap.get(dateStr);
        rows.push({
          client_id: auth.userId,
          log_date: dateStr,
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
      }

      if (rows.length > 0) {
        const { error: insErr } = await auth.supabase
          .from("cronometer_nutrition_logs")
          .upsert(rows, { onConflict: "client_id,log_date" });
        if (insErr) return json({ error: insErr.message }, 500);
      }

      await auth.supabase
        .from("cronometer_sessions")
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq("client_id", auth.userId);

      return json({
        success: true,
        days_synced: rows.length,
        from: isoDate(startDate),
        to: isoDate(today),
      });
    }

    if (action === "reapply_today_targets") {
      if (!isServiceRoleRequest(req)) {
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
    const { username, password, start, end, cookies, user_id, gwt_permutation, gwt_header } = body;

    if (action === "connect") {
      if (!username || !password) {
        return json({ error: "Username and password are required" }, 400);
      }
      await refreshGwtValues();
      const cookieJar = new Map<string, string>();
      await login(username, password, cookieJar);
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
      await login(username, password, cookieJar);
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
      await refreshGwtValues();
      cachedGwtPermutation = session.gwt_permutation || cachedGwtPermutation;
      cachedGwtHeader = session.gwt_header || cachedGwtHeader;
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
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
