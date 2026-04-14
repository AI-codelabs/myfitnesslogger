import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Step 1: Get anti-CSRF token from login page
async function getAntiCsrf(cookieJar: Map<string, string>): Promise<string> {
  const resp = await fetch(CRONOMETER_LOGIN_PAGE, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });

  // Capture cookies
  for (const cookie of resp.headers.getSetCookie?.() || []) {
    const [kv] = cookie.split(";");
    const [k, v] = kv.split("=");
    if (k && v) cookieJar.set(k.trim(), v.trim());
  }

  const html = await resp.text();
  const match = html.match(/name="anticsrf"\s+value="([^"]+)"/);
  if (!match) throw new Error("Could not find anti-CSRF token");
  return match[1];
}

function cookieString(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function captureCookies(resp: Response, jar: Map<string, string>) {
  for (const cookie of resp.headers.getSetCookie?.() || []) {
    const [kv] = cookie.split(";");
    const [k, v] = kv.split("=");
    if (k && v) jar.set(k.trim(), v.trim());
  }
}

// Step 2: Login
async function login(username: string, password: string, cookieJar: Map<string, string>) {
  const csrf = await getAntiCsrf(cookieJar);

  const body = new URLSearchParams({ anticsrf: csrf, username, password });
  const resp = await fetch(CRONOMETER_LOGIN_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      Cookie: cookieString(cookieJar),
    },
    body: body.toString(),
    redirect: "manual",
  });

  captureCookies(resp, cookieJar);

  const text = await resp.text();
  let result: { success?: boolean; error?: string };
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Login response was not JSON: ${text.substring(0, 200)}`);
  }

  if (result.error) throw new Error(result.error);
  if (!result.success) throw new Error("Login failed");
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

  captureCookies(resp, cookieJar);
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

  captureCookies(resp, cookieJar);
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, username, password, start, end } = await req.json();

    if (action === "connect") {
      if (!username || !password) {
        return json({ error: "Username and password are required" }, 400);
      }

      await refreshGwtValues();

      const cookieJar = new Map<string, string>();
      await login(username, password, cookieJar);
      const userId = await gwtAuthenticate(cookieJar);

      // Serialize cookies for client storage
      const cookies = Object.fromEntries(cookieJar);

      return json({
        success: true,
        user_id: userId,
        cookies,
        gwt_permutation: cachedGwtPermutation,
        gwt_header: cachedGwtHeader,
      });
    }

    if (action === "export") {
      const { cookies, user_id, gwt_permutation, gwt_header } = await req.json();
      if (!cookies || !user_id) {
        return json({ error: "Missing session data" }, 400);
      }

      // Use provided GWT values or cached
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

    // Combined: login + export in one call (simplest flow)
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

    return json({ error: "Invalid action. Use: connect, export, or login_and_export" }, 400);
  } catch (e) {
    console.error("Cronometer error:", e);
    return json({ error: e.message || "Unknown error" }, 500);
  }
});
