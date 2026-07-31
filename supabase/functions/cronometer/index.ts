// Cronometer Pro API integration (edge function).
// Replaces the legacy scraper. All calls use the coach's Pro bearer token
// (CRONOMETER_PRO_TOKEN) plus a per-client cronometer_client_id in the body.
//
// Actions:
//   - invite_client       (coach) POST /api_v1/client_invite
//   - remove_client       (coach) POST /api_v1/client_remove
//   - refresh_status      (coach) POST /api_v1/client_status  → reconcile pending → active
//   - sync_client         (coach) fetch data_summary + diary_summary → upsert logs
//   - sync_all            (cron)  loop active clients, incremental sync
//   - get_targets         (coach) POST /api_v1/targets
//   - sync                (client) self-sync via Pro link
//   - web_connect/status/disconnect/push_targets
//                         (CLIENT or coach) — clients self-connect to push targets
//
// Auth model:
//   - web_* target-sync actions use requireAuth (any signed-in user). Clients connect themselves.
//   - Pro invite / diary sync actions use requireCoach.
//
// Legacy no-ops (kept so existing frontend calls don't error):
//   - connect_and_save    returns { error: "legacy_flow", ... }
//   - push_targets        routes to web_push_targets when connected

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  cronoLogin,
  pushTargets,
  targetsHash,
  encryptJson,
  decryptJson,
  loadCurrentTargets,
  type CookieJar,
  type NutritionTargets,
  type WebSessionRow,
} from "./webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CRONO_BASE = "https://cronometer.com/api_v1";
const PRO_TOKEN = Deno.env.get("CRONOMETER_PRO_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─────────────────────────── Cronometer REST client ───────────────────────────

class CronoApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Cronometer API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

let _logAdmin: SupabaseClient | null = null;
function getLogAdmin(): SupabaseClient {
  if (!_logAdmin) _logAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
  return _logAdmin;
}

type LogCtx = {
  action?: string;
  coach_id?: string | null;
  client_id?: string | null;
  cronometer_client_id?: number | null;
};

async function logApiCall(entry: {
  ctx: LogCtx;
  endpoint: string;
  request_body: unknown;
  response_status: number | null;
  response_text: string;
  error?: string | null;
  duration_ms: number;
}) {
  try {
    let response_body: unknown = null;
    if (entry.response_text) {
      try { response_body = JSON.parse(entry.response_text); } catch { /* keep as text */ }
    }
    await getLogAdmin().from("cronometer_api_logs").insert({
      action: entry.ctx.action ?? null,
      endpoint: entry.endpoint,
      request_body: entry.request_body ?? null,
      response_status: entry.response_status,
      response_body: response_body ?? null,
      response_text: response_body ? null : (entry.response_text || null),
      error: entry.error ?? null,
      duration_ms: entry.duration_ms,
      coach_id: entry.ctx.coach_id ?? null,
      client_id: entry.ctx.client_id ?? null,
      cronometer_client_id: entry.ctx.cronometer_client_id ?? null,
    });
  } catch (e) {
    console.warn("api log insert failed:", e);
  }
}

async function callCrono<T = any>(
  path: string,
  body: Record<string, unknown>,
  ctx: LogCtx = {},
): Promise<T> {
  if (!PRO_TOKEN) throw new Error("CRONOMETER_PRO_TOKEN not configured");
  const started = Date.now();
  let status: number | null = null;
  let text = "";
  let errMsg: string | null = null;
  try {
    const res = await fetch(`${CRONO_BASE}${path}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PRO_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });
    status = res.status;
    text = await res.text();
    if (!res.ok) { errMsg = `HTTP ${res.status}`; throw new CronoApiError(res.status, text); }
    if (!text) return {} as T;
    try { return JSON.parse(text) as T; }
    catch { return text as unknown as T; }
  } catch (e) {
    if (!errMsg) errMsg = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    logApiCall({
      ctx,
      endpoint: path,
      request_body: body,
      response_status: status,
      response_text: text,
      error: errMsg,
      duration_ms: Date.now() - started,
    });
  }
}

// ───────────────── Remote target verification (source of truth) ─────────────────
// The Pro API /targets endpoint returns the targets Cronometer ACTUALLY shows the
// client (coach-assigned targets win over the client's own preference values).
// We use it to verify a push instead of trusting our own "pushed hash".

export type RemoteTargets = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

function pickTarget(raw: Record<string, any>, ...names: string[]): number | null {
  for (const n of names) {
    const entry = raw?.[n];
    if (entry && typeof entry === "object") {
      const v = entry.min ?? entry.max;
      if (v !== undefined && v !== null) return Number(v);
    }
  }
  return null;
}

/** Read the live targets Cronometer shows this client, or null if unavailable. */
async function fetchRemoteTargets(
  admin: SupabaseClient,
  clientId: string,
  ctx: LogCtx = {},
): Promise<RemoteTargets | null> {
  try {
    const { data: link } = await admin
      .from("cronometer_clients")
      .select("cronometer_client_id")
      .eq("client_id", clientId)
      .not("cronometer_client_id", "is", null)
      .maybeSingle();
    const cronoId = (link as { cronometer_client_id: number | null } | null)?.cronometer_client_id;
    if (!cronoId) return null;
    const raw = await callCrono<Record<string, any>>("/targets", {
      client_id: cronoId,
      day: ymd(new Date()),
    }, { ...ctx, action: ctx.action ?? "verify_targets", client_id: clientId, cronometer_client_id: cronoId });
    if (!raw || typeof raw !== "object") return null;
    return {
      calories: pickTarget(raw, "Energy"),
      protein_g: pickTarget(raw, "Protein"),
      carbs_g: pickTarget(raw, "Net Carbs", "Carbs"),
      fat_g: pickTarget(raw, "Fat"),
    };
  } catch {
    return null;
  }
}

const near = (a: number | null, b: number, tol = 2) =>
  a !== null && Math.abs(a - b) <= tol;

function remoteMatches(remote: RemoteTargets | null, targets: NutritionTargets | null): boolean | null {
  if (!remote || !targets) return null;
  return (
    near(remote.calories, targets.calories, 5) &&
    near(remote.protein_g, targets.protein_g) &&
    near(remote.carbs_g, targets.carbs_g) &&
    near(remote.fat_g, targets.fat_g)
  );
}


// ─────────────────────────── Auth helpers ───────────────────────────

type AuthedCall = {
  userId: string;
  supabase: SupabaseClient;
  admin: SupabaseClient;
};

async function requireAuth(req: Request): Promise<AuthedCall | { error: string; status: number }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Unauthorized", status: 401 };
  }
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return { error: "Unauthorized", status: 401 };
  const userId = data.claims.sub as string;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  return { userId, supabase, admin };
}

async function requireCoach(req: Request): Promise<AuthedCall | { error: string; status: number }> {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth;
  const { data: isCoach } = await auth.admin.rpc("has_role", { _user_id: auth.userId, _role: "coach" });
  if (!isCoach) return { error: "Coach role required", status: 403 };
  return auth;
}

function requireCronSecret(req: Request): boolean {
  if (!CRON_SECRET) return false;
  return req.headers.get("x-cron-secret") === CRON_SECRET;
}

// ─────────────────────────── Sync helpers ───────────────────────────

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function numPick(sources: Record<string, unknown>[], ...keys: string[]): number {
  for (const src of sources) {
    const lower = Object.fromEntries(
      Object.entries(src).map(([k, v]) => [k.toLowerCase(), v]),
    );
    for (const key of keys) {
      const value = src[key] ?? lower[key.toLowerCase()];
      if (value !== undefined && value !== null && value !== "") return Number(value) || 0;
    }
  }
  return 0;
}

function macrosFromPayload(raw: Record<string, unknown> | null | undefined) {
  if (!raw || typeof raw !== "object") {
    return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  }
  return {
    calories: numPick([raw], "kcal", "calories", "energy", "energy_kcal"),
    protein_g: numPick([raw], "protein", "protein_g"),
    carbs_g: numPick([raw], "total_carbs", "carbs", "carbohydrates", "carbohydrates_g"),
    fat_g: numPick([raw], "fat", "fat_g"),
    fiber_g: numPick([raw], "fiber", "fiber_g"),
    sugar_g: numPick([raw], "sugars", "sugar", "sugar_g"),
    sodium_mg: numPick([raw], "sodium", "sodium_mg"),
    net_carbs_g: numPick([raw], "net_carbs", "net carbs"),
    alcohol_g: numPick([raw], "alcohol"),
    magnesium_mg: numPick([raw], "magnesium"),
    potassium_mg: numPick([raw], "potassium"),
  };
}

function isCronoMealGroups(v: unknown): v is Array<Record<string, unknown>> {
  if (!Array.isArray(v) || v.length === 0) return false;
  const first = v[0];
  return !!first && typeof first === "object" && Array.isArray((first as { foods?: unknown }).foods);
}

/** Build versioned meal/nutrient payload stored in cronometer_nutrition_logs.entries. */
function buildDiaryEntries(payload: any) {
  const foods = payload?.foods;
  let meals: any[] = [];
  if (isCronoMealGroups(foods)) {
    meals = foods.map((g) => ({
      name: String(g.name || "Other"),
      foods: (Array.isArray(g.foods) ? g.foods : []).map((f: any) => ({
        name: String(f?.name ?? "—"),
        serving: f?.serving != null ? String(f.serving) : undefined,
      })),
      macros: macrosFromPayload(
        (g.macros && typeof g.macros === "object" ? g.macros : {}) as Record<string, unknown>,
      ),
    }));
  } else {
    const flat = payload?.entries ?? payload?.servings ?? payload?.diary ?? [];
    if (Array.isArray(flat) && flat.length) {
      const map = new Map<string, any>();
      for (const e of flat) {
        const groupName = String(e?.group || e?.category || "Other").trim() || "Other";
        if (!map.has(groupName)) {
          map.set(groupName, {
            name: groupName,
            foods: [],
            macros: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
          });
        }
        const g = map.get(groupName)!;
        g.foods.push({
          name: String(e?.name ?? "—"),
          serving: e?.amount ?? e?.serving ?? undefined,
        });
        g.macros.calories += Number(e?.calories) || 0;
        g.macros.protein_g += Number(e?.protein) || 0;
        g.macros.carbs_g += Number(e?.carbohydrates ?? e?.carbs) || 0;
        g.macros.fat_g += Number(e?.fat) || 0;
      }
      meals = Array.from(map.values());
    }
  }

  const nutrientsRaw = payload?.nutrients && typeof payload.nutrients === "object" ? payload.nutrients : {};
  const nutrients: Record<string, number> = {};
  for (const [k, v] of Object.entries(nutrientsRaw)) {
    const n = Number(v);
    if (!Number.isNaN(n)) nutrients[k] = n;
  }

  const extras = macrosFromPayload(
    (payload?.macros ?? payload?.totals ?? payload?.summary ?? {}) as Record<string, unknown>,
  );

  return {
    version: 2 as const,
    completed: payload?.completed === true,
    food_grams: payload?.food_grams != null ? Number(payload.food_grams) || undefined : undefined,
    meals,
    nutrients: Object.keys(nutrients).length ? nutrients : undefined,
    extras,
  };
}

function normalizeDiary(day: string, payload: any) {
  // Cronometer's diary_summary returns day macros under `macros`, meal groups under
  // `foods[]` (each with nested foods + macros), and a full `nutrients` micronutrient map.
  const totals = (payload?.macros ?? payload?.totals ?? payload?.summary ?? payload ?? {}) as Record<string, unknown>;
  const nutrients = (payload?.nutrients ?? {}) as Record<string, unknown>;
  const macros = macrosFromPayload(totals);
  // Prefer day macros; fall back to nutrient map for sugar/sodium/fiber aliases.
  const fiber = macros.fiber_g || numPick([totals, nutrients], "fiber", "fiber_g", "Fiber");
  const sugar = macros.sugar_g || numPick([totals, nutrients], "sugars", "sugar", "sugar_g", "Sugars");
  const sodium = macros.sodium_mg || numPick([totals, nutrients], "sodium", "sodium_mg", "Sodium");

  return {
    log_date: day,
    calories: macros.calories,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    fiber_g: fiber,
    sugar_g: sugar,
    sodium_mg: sodium,
    entries: buildDiaryEntries(payload),
    source: "api",
    synced_at: new Date().toISOString(),
  };
}

async function syncOneClient(
  admin: SupabaseClient,
  row: { id: string; coach_id?: string | null; client_id: string; cronometer_client_id: number | null; last_synced_day: string | null },
  opts: { full?: boolean } = {},
): Promise<{ days_synced: number; from: string; to: string }> {
  if (!row.cronometer_client_id) throw new Error("Missing cronometer_client_id");
  const today = new Date();
  const start = opts.full
    ? new Date(today.getTime() - 90 * 86400_000)
    : row.last_synced_day
      ? new Date(new Date(row.last_synced_day).getTime() - 2 * 86400_000)
      : new Date(today.getTime() - 30 * 86400_000);
  const from = ymd(start);
  const to = ymd(today);

  // If a full backfill, wipe existing rows first (per approved plan).
  if (opts.full) {
    await admin.from("cronometer_nutrition_logs").delete().eq("client_id", row.client_id);
  }

  // 1. Ask which days the client actually logged.
  const summary = await callCrono<any>("/data_summary", {
    client_id: row.cronometer_client_id,
    start: from,
    end: to,
  }, { action: "sync_client", coach_id: row.coach_id ?? null, client_id: row.client_id, cronometer_client_id: row.cronometer_client_id });
  const days: string[] = Array.isArray(summary?.days)
    ? summary.days
    : Array.isArray(summary)
      ? summary
      : Array.isArray(summary?.dates)
        ? summary.dates
        : [];

  // 2. Fetch each day's diary, throttled to 3 in flight.
  const upserts: any[] = [];
  const CONCURRENCY = 3;
  for (let i = 0; i < days.length; i += CONCURRENCY) {
    const batch = days.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((day) =>
        callCrono("/diary_summary", { client_id: row.cronometer_client_id, day }, {
          action: "sync_client",
          coach_id: row.coach_id ?? null,
          client_id: row.client_id,
          cronometer_client_id: row.cronometer_client_id,
        })
          .then((p) => ({ day, payload: p }))
          .catch((e) => ({ day, error: e instanceof Error ? e.message : String(e) }))
      ),
    );
    for (const r of results) {
      if ("error" in r) {
        console.warn(`diary_summary failed for ${r.day}:`, r.error);
        continue;
      }
      const normalized = normalizeDiary(r.day, r.payload);
      upserts.push({ client_id: row.client_id, ...normalized });
    }
  }

  if (upserts.length > 0) {
    const { error: upErr } = await admin
      .from("cronometer_nutrition_logs")
      .upsert(upserts, { onConflict: "client_id,log_date" });
    if (upErr) throw upErr;
  }

  const latestDay = upserts.length ? upserts.map((u) => u.log_date).sort().at(-1) : row.last_synced_day;
  await admin
    .from("cronometer_clients")
    .update({
      last_synced_at: new Date().toISOString(),
      last_synced_day: latestDay,
      status: "active",
      last_error: null,
    })
    .eq("id", row.id);

  return { days_synced: upserts.length, from, to };
}

// ─────────────────────────── Handler ───────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action as string | undefined;

    // ───── Cron entry point ─────
    if (action === "sync_all") {
      if (!requireCronSecret(req)) return json({ error: "Forbidden" }, 403);
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: clients, error } = await admin
        .from("cronometer_clients")
        .select("id, client_id, cronometer_client_id, last_synced_day")
        .eq("status", "active")
        .not("cronometer_client_id", "is", null);
      if (error) return json({ error: error.message }, 500);
      const results: any[] = [];
      for (const c of clients ?? []) {
        try {
          const r = await syncOneClient(admin, c);
          results.push({ client_id: c.client_id, ...r });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await admin.from("cronometer_clients").update({ status: "error", last_error: msg }).eq("id", c.id);
          results.push({ client_id: c.client_id, error: msg });
        }
      }
      return json({ success: true, synced: results.length, results });
    }

    // ───── Hourly reconcile (cron) ─────
    // Refreshes upstream client status for all rows and syncs newly-active clients.
    if (action === "hourly_reconcile") {
      if (!requireCronSecret(req)) return json({ error: "Forbidden" }, 403);
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const resp = await callCrono<any>("/client_status", {}, { action: "hourly_reconcile" });
      const list: any[] = Array.isArray(resp) ? resp : (resp?.clients ?? []);
      const { data: myRows } = await admin
        .from("cronometer_clients")
        .select("id, coach_id, client_id, cronometer_client_id, email, status, last_synced_day");

      const byEmail = new Map<string, any>();
      const byId = new Map<number, any>();
      for (const r of list) {
        if (r.email) byEmail.set(String(r.email).toLowerCase(), r);
        const cid = r.client_id ?? r.id;
        if (cid) byId.set(Number(cid), r);
      }

      const summary: any[] = [];
      for (const local of myRows ?? []) {
        const match = (local.cronometer_client_id && byId.get(Number(local.cronometer_client_id)))
          || (local.email && byEmail.get(String(local.email).toLowerCase()));
        if (!match) {
          if (local.status === "active") {
            await admin.from("cronometer_clients").update({ status: "revoked" }).eq("id", local.id);
            summary.push({ client_id: local.client_id, action: "revoked" });
          }
          continue;
        }
        const upstreamStatus = String(match.status ?? "").toUpperCase();
        const nextStatus = upstreamStatus.includes("PENDING") ? "pending" : "active";
        const remoteId = match.client_id ?? match.id;
        const patch: Record<string, unknown> = { status: nextStatus, last_error: null };
        if (remoteId && !local.cronometer_client_id) patch.cronometer_client_id = Number(remoteId);
        if (nextStatus === "active" && local.status !== "active") {
          patch.connected_at = new Date().toISOString();
        }
        await admin.from("cronometer_clients").update(patch).eq("id", local.id);

        if (nextStatus === "active" && local.status === "pending") {
          try {
            await syncOneClient(admin, {
              id: local.id,
              client_id: local.client_id,
              cronometer_client_id: Number(remoteId ?? local.cronometer_client_id),
              last_synced_day: null,
            }, { full: true });
            summary.push({ client_id: local.client_id, action: "promoted_and_backfilled" });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await admin.from("cronometer_clients").update({ status: "error", last_error: msg }).eq("id", local.id);
            summary.push({ client_id: local.client_id, action: "promote_failed", error: msg });
          }
        } else if (nextStatus === "active") {
          try {
            const r = await syncOneClient(admin, {
              id: local.id,
              client_id: local.client_id,
              cronometer_client_id: Number(local.cronometer_client_id ?? remoteId),
              last_synced_day: local.last_synced_day ?? null,
            });
            summary.push({ client_id: local.client_id, action: "synced", ...r });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await admin.from("cronometer_clients").update({ status: "error", last_error: msg }).eq("id", local.id);
            summary.push({ client_id: local.client_id, action: "sync_failed", error: msg });
          }
        }
      }
      return json({ success: true, upstream_count: list.length, reconciled: summary.length, summary });
    }



    // ───── Client-invoked self sync (no coach role required) ─────
    if (action === "sync") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
      const selfId = claims.claims.sub as string;
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: link } = await admin
        .from("cronometer_clients")
        .select("id, client_id, cronometer_client_id, last_synced_day, status")
        .eq("client_id", selfId)
        .maybeSingle();
      if (!link) return json({ error: "no_session", message: "Cronometer not connected" }, 400);
      if (link.status !== "active") return json({ error: "no_session", message: "Cronometer link not active" }, 400);
      try {
        const r = await syncOneClient(admin, link);
        return json({ success: true, days_synced: r.days_synced, up_to_date: r.days_synced === 0, from: r.from, to: r.to });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ error: "sync_failed", message: msg }, 502);
      }
    }

    // ─────────────────────── CLIENT TARGET SYNC (any signed-in user) ───────────────────────
    // Clients MUST be able to connect here. Pro API has no write endpoint for targets,
    // so the client logs into Cronometer once; we store an encrypted session and push
    // macro targets. Do NOT gate these actions on coach role.
    const CLIENT_WEB_ACTIONS = new Set([
      "web_connect",
      "web_disconnect",
      "web_push_targets",
      "web_status",
      "push_targets",
      "admin_sync_all",
      "reapply_today_targets",
      "connect_and_save",
      "connect",
      "login_and_export",
      "export",
    ]);
    const isClientWebAction =
      CLIENT_WEB_ACTIONS.has(action ?? "") ||
      (typeof action === "string" && action.startsWith("web_"));

    if (isClientWebAction) {
      const auth = await requireAuth(req);
      if ("error" in auth) return json({ error: auth.error }, auth.status);
      const { userId, admin } = auth;

    // ─────────────────────── WEB TARGET SYNC (scraper) ───────────────────────
    // These actions push in-app targets into the client's Cronometer account
    // using a persisted web session. Reads still use the Pro API above.

    const webLog = (extraCtx: LogCtx) => async (entry: {
      endpoint: string;
      request_body: unknown;
      response_status: number | null;
      response_text: string;
      error?: string | null;
      duration_ms: number;
    }) => {
      await logApiCall({
        ctx: { action: extraCtx.action ?? "web", coach_id: extraCtx.coach_id ?? null, client_id: extraCtx.client_id ?? null },
        endpoint: `WEB ${entry.endpoint}`,
        request_body: entry.request_body,
        response_status: entry.response_status,
        response_text: entry.response_text,
        error: entry.error,
        duration_ms: entry.duration_ms,
      });
    };

    async function loadWebSession(clientId: string): Promise<WebSessionRow | null> {
      // Allow either the coach who owns the row OR the client themselves.
      const { data } = await admin
        .from("cronometer_web_sessions")
        .select("*")
        .eq("client_id", clientId)
        .or(`coach_id.eq.${userId},client_id.eq.${userId}`)
        .maybeSingle();
      return (data as WebSessionRow) ?? null;
    }

    async function resolveCoachForClient(clientId: string): Promise<string | null> {
      // Find the (most recent) active coach for a self-connecting client.
      const { data } = await admin
        .from("invitations")
        .select("coach_id")
        .eq("accepted_user_id", clientId)
        .in("status", ["onboarding", "active", "accepted", "inactive"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { coach_id: string } | null)?.coach_id ?? null;
    }


    async function saveSessionCookies(row: WebSessionRow, cookies: CookieJar, ua: string) {
      await admin.from("cronometer_web_sessions").update({
        session_cookies: await encryptJson(cookies),
        user_agent: ua,
        last_login_at: new Date().toISOString(),
        status: "active",
        last_error: null,
      }).eq("id", row.id);
    }

    async function markSessionError(row: WebSessionRow, status: string, err: string) {
      await admin.from("cronometer_web_sessions").update({
        status,
        last_error: err,
      }).eq("id", row.id);
    }

    async function doPush(row: WebSessionRow, targets: NutritionTargets): Promise<{ ok: boolean; error?: string }> {
      let cookies: CookieJar = {};
      let ua = row.user_agent ?? "";
      if (row.session_cookies) {
        try { cookies = await decryptJson<CookieJar>(row.session_cookies); } catch { cookies = {}; }
      }
      const log = webLog({ action: "web_push", coach_id: row.coach_id, client_id: row.client_id });

      const attempt = async () => pushTargets({ cookies, userAgent: ua || "", targets, log });

      let res = await attempt();
      if (!res.ok && res.error === "session_expired") {
        // Re-login using stored credentials (no TOTP available for automated push).
        const creds = await decryptJson<{ password: string; totp_secret?: string }>(row.credentials_ciphertext);
        const login = await cronoLogin({
          email: row.cronometer_email,
          password: creds.password,
          log,
        });
        if (!login.ok) {
          const needsTotp = login.needsTotp || login.error === "totp_required";
          await markSessionError(row, needsTotp ? "needs_reauth" : "error", login.error);
          return { ok: false, error: needsTotp ? "needs_reauth" : login.error };
        }
        cookies = login.cookies;
        ua = login.userAgent;
        await saveSessionCookies(row, cookies, ua);
        res = await attempt();
      }
      if (!res.ok) {
        await markSessionError(row, "error", res.error ?? "push_failed");
        return { ok: false, error: res.error };
      }
      await admin.from("cronometer_web_sessions").update({
        session_cookies: await encryptJson(res.cookies),
        last_push_at: new Date().toISOString(),
        last_pushed_hash: targetsHash(targets),
        last_pushed_targets: targets,
        status: "active",
        last_error: null,
      }).eq("id", row.id);
      return { ok: true };
    }

    // ── Coach-session push (no client password needed) ──
    // Uses the Pro coach's own Cronometer web session to write the managed
    // client's targets. The coach session row is stored with client_id = coach_id.
    const COACH_EMAIL = Deno.env.get("CRONO_COACH_EMAIL") ?? "";
    const COACH_PASSWORD = Deno.env.get("CRONO_COACH_PASSWORD") ?? "";

    async function findProLink(clientId: string): Promise<
      { coach_id: string; cronometer_client_id: number } | null
    > {
      const { data } = await admin
        .from("cronometer_clients")
        .select("coach_id, cronometer_client_id, status")
        .eq("client_id", clientId)
        .not("cronometer_client_id", "is", null)
        .order("invited_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = data as { coach_id: string; cronometer_client_id: number } | null;
      return row?.cronometer_client_id ? row : null;
    }

    async function loadCoachSessionRow(coachId: string): Promise<WebSessionRow | null> {
      const { data } = await admin
        .from("cronometer_web_sessions")
        .select("*")
        .eq("coach_id", coachId)
        .eq("client_id", coachId)
        .maybeSingle();
      return (data as WebSessionRow) ?? null;
    }

    async function ensureCoachSession(
      coachId: string,
      log: ReturnType<typeof webLog>,
    ): Promise<{ cookies: CookieJar; ua: string; rowId: string } | { error: string }> {
      if (!COACH_EMAIL || !COACH_PASSWORD) return { error: "coach_credentials_missing" };
      const row = await loadCoachSessionRow(coachId);
      if (row?.session_cookies) {
        try {
          const cookies = await decryptJson<CookieJar>(row.session_cookies);
          if (cookies["sesnonce"]) {
            return { cookies, ua: row.user_agent ?? "", rowId: row.id };
          }
        } catch { /* fall through to fresh login */ }
      }
      const login = await cronoLogin({ email: COACH_EMAIL, password: COACH_PASSWORD, log });
      if (!login.ok) return { error: login.error || "coach_login_failed" };
      const payload = {
        coach_id: coachId,
        client_id: coachId,
        cronometer_email: COACH_EMAIL,
        credentials_ciphertext: await encryptJson({ password: COACH_PASSWORD }),
        session_cookies: await encryptJson(login.cookies),
        user_agent: login.userAgent,
        status: "active",
        last_login_at: new Date().toISOString(),
        last_error: null,
      };
      const { data: saved } = await admin
        .from("cronometer_web_sessions")
        .upsert(payload, { onConflict: "coach_id,client_id" })
        .select("id")
        .single();
      return { cookies: login.cookies, ua: login.userAgent, rowId: (saved as any)?.id ?? "" };
    }

    async function coachPush(
      clientId: string,
      targets: NutritionTargets,
    ): Promise<{ ok: boolean; error?: string }> {
      const link = await findProLink(clientId);
      if (!link) return { ok: false, error: "not_linked" };
      const log = webLog({ action: "web_push_coach", coach_id: link.coach_id, client_id: clientId });

      let session = await ensureCoachSession(link.coach_id, log);
      if ("error" in session) return { ok: false, error: session.error };

      let res = await pushTargets({
        cookies: session.cookies,
        userAgent: session.ua,
        targets,
        targetUserId: link.cronometer_client_id,
        log,
      });
      if (!res.ok && res.error === "session_expired") {
        // Force a fresh coach login and retry once.
        if (session.rowId) {
          await admin.from("cronometer_web_sessions")
            .update({ session_cookies: null })
            .eq("id", session.rowId);
        }
        session = await ensureCoachSession(link.coach_id, log);
        if ("error" in session) return { ok: false, error: session.error };
        res = await pushTargets({
          cookies: session.cookies,
          userAgent: session.ua,
          targets,
          targetUserId: link.cronometer_client_id,
          log,
        });
      }
      if (session.rowId) {
        await admin.from("cronometer_web_sessions").update({
          session_cookies: await encryptJson(res.cookies),
          last_push_at: res.ok ? new Date().toISOString() : undefined,
          status: res.ok ? "active" : "error",
          last_error: res.ok ? null : (res.error ?? "push_failed"),
        }).eq("id", session.rowId);
      }
      await admin.from("cronometer_clients").update({
        last_error: res.ok ? null : (res.error ?? "push_failed"),
      }).eq("client_id", clientId).eq("coach_id", link.coach_id);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    }



    if (action === "web_connect") {
      const { client_id: bodyClientId, email, password, totpCode } = body;
      if (!email || !password) {
        return json({ error: "email and password required" }, 400);
      }
      // Two callers: (a) the client themselves (self-connect), (b) a coach on
      // behalf of the client (legacy fallback). Resolve client_id + coach_id
      // from the authenticated user.
      let client_id = bodyClientId as string | undefined;
      let coach_id: string | null = null;
      if (!client_id || client_id === userId) {
        // Self-connect
        client_id = userId;
        coach_id = await resolveCoachForClient(userId);
        if (!coach_id) return json({ error: "no_coach", message: "No active coach found for this account." }, 400);
      } else {
        // Coach-on-behalf-of
        const isCoach = (await admin.rpc("is_coach_of", { _coach_id: userId, _client_id: client_id })).data;
        if (!isCoach) return json({ error: "Not your client" }, 403);
        coach_id = userId;
      }
      const log = webLog({ action: "web_connect", coach_id, client_id });
      const login = await cronoLogin({ email, password, totpCode, log });
      if (!login.ok) {
        return json({
          error: login.error,
          needsTotp: login.needsTotp === true,
          message: login.error === "totp_required"
            ? "Two-factor code required."
            : login.error === "bad_credentials"
              ? "Incorrect email or password."
              : `Login failed (${login.error}).`,
        }, 400);
      }
      const encCookies = await encryptJson(login.cookies);
      const encCreds = await encryptJson({ password });
      const { data: upserted, error: upErr } = await admin
        .from("cronometer_web_sessions")
        .upsert({
          coach_id,
          client_id,
          cronometer_email: email,
          credentials_ciphertext: encCreds,
          session_cookies: encCookies,
          user_agent: login.userAgent,
          status: "active",
          last_login_at: new Date().toISOString(),
          last_error: null,
        }, { onConflict: "coach_id,client_id" })
        .select()
        .single();
      if (upErr) return json({ error: upErr.message }, 500);

      // Immediately push current targets so account is 1:1 from day one.
      const targets = await loadCurrentTargets(admin, client_id);
      if (targets) {
        const r = await doPush(upserted as WebSessionRow, targets);
        return json({ success: true, first_push: r });
      }
      return json({ success: true, first_push: { ok: false, error: "no_targets_yet" } });
    }

    if (action === "web_disconnect") {
      const { client_id: bodyClientId } = body;
      const client_id = (bodyClientId as string | undefined) ?? userId;
      // Service-role bypasses RLS — enforce caller is the client or their coach.
      if (client_id !== userId) {
        const isCoach = (await admin.rpc("is_coach_of", { _coach_id: userId, _client_id: client_id })).data;
        if (!isCoach) return json({ error: "Forbidden" }, 403);
        await admin
          .from("cronometer_web_sessions")
          .delete()
          .eq("client_id", client_id)
          .eq("coach_id", userId);
      } else {
        await admin
          .from("cronometer_web_sessions")
          .delete()
          .eq("client_id", client_id);
      }
      return json({ success: true });
    }


    if (action === "web_push_targets") {
      const { client_id: bodyClientId, force } = body;
      const client_id = (bodyClientId as string | undefined) ?? userId;

      const targets = await loadCurrentTargets(admin, client_id);
      if (!targets) return json({ error: "no_targets" }, 404);

      const row = await loadWebSession(client_id);
      const useClientSession = !!row && row.status === "active";

      if (!useClientSession) {
        // No usable client session → push with the Pro coach session.
        const link = await findProLink(client_id);
        if (!link) {
          return json({ error: row ? "needs_reauth" : "not_connected" }, row ? 409 : 404);
        }
        const cr = await coachPush(client_id, targets);
        if (!cr.ok) return json({ error: cr.error, message: cr.error }, 502);
        const remoteC = await fetchRemoteTargets(admin, client_id, { action: "web_push_targets" });
        return json({
          success: true,
          mode: "coach",
          verified: remoteMatches(remoteC, targets),
          remote_targets: remoteC,
          app_targets: targets,
        });
      }

      if (!force && row!.last_pushed_hash === targetsHash(targets)) {
        const remoteSame = await fetchRemoteTargets(admin, client_id, { action: "web_push_targets" });
        const okSame = remoteMatches(remoteSame, targets);
        if (okSame !== false) return json({ success: true, skipped: "unchanged", remote_targets: remoteSame });
        // Cronometer disagrees with what we think we pushed → force a real push.
      }
      let r = await doPush(row!, targets);
      if (!r.ok) {
        // Fall back to the coach session before surfacing an error.
        const fallback = await coachPush(client_id, targets);
        if (!fallback.ok) return json({ error: r.error, message: r.error }, 502);
        r = fallback;
      }
      // Verify against what Cronometer actually serves the client.
      const remote = await fetchRemoteTargets(admin, client_id, { action: "web_push_targets" });
      const verified = remoteMatches(remote, targets);
      if (verified === false) {
        await admin.from("cronometer_web_sessions")
          .update({ last_error: "remote_mismatch" })
          .eq("id", row!.id);
      }
      return json({ success: true, verified, remote_targets: remote, app_targets: targets });
    }

    if (action === "web_status") {
      const { client_id: bodyClientId } = body;
      const client_id = (bodyClientId as string | undefined) ?? userId;

      const row = await loadWebSession(client_id);
      const targets = await loadCurrentTargets(admin, client_id);
      const remote = await fetchRemoteTargets(admin, client_id, { action: "web_status" });
      const verified = remoteMatches(remote, targets);
      const proLink = await findProLink(client_id);
      const coachPushAvailable = !!proLink && !!COACH_EMAIL && !!COACH_PASSWORD;
      if (!row) {
        return json({
          success: true,
          connected: coachPushAvailable,
          mode: coachPushAvailable ? "coach" : undefined,
          status: coachPushAvailable ? "active" : undefined,
          coach_push: coachPushAvailable,
          in_sync: verified === true,
          remote_targets: remote,
          app_targets: targets,
          verified,
        });
      }

      const hashSync = !!targets && row.last_pushed_hash === targetsHash(targets);
      return json({
        success: true,
        connected: true,
        status: row.status === "needs_reauth" && coachPushAvailable ? "active" : row.status,
        mode: row.status === "active" ? "client" : (coachPushAvailable ? "coach" : "client"),
        coach_push: coachPushAvailable,
        email: row.cronometer_email,
        last_push_at: row.last_push_at,
        last_error: row.last_error,

        // Prefer Cronometer's own answer over our local bookkeeping.
        in_sync: verified === null ? hashSync : verified,
        verified,
        remote_targets: remote,
        app_targets: targets,
      });
    }


    // ─────────────────────── Legacy no-ops ───────────────────────

    if (action === "connect_and_save" || action === "connect" || action === "login_and_export" || action === "export") {
      return json({
        error: "legacy_flow",
        message: "Cronometer now uses the Pro invite flow. Ask your coach to (re)send the invite.",
      }, 410);
    }

    if (action === "push_targets" || action === "admin_sync_all" || action === "reapply_today_targets") {
      // Legacy alias — route to web_push_targets.
      const { client_id } = body;
      if (client_id) {
        const row = await loadWebSession(client_id);
        if (row && row.status === "active") {
          const t = await loadCurrentTargets(admin, client_id);
          if (t) {
            const r = await doPush(row, t);
            return json(r.ok ? { success: true } : { error: r.error }, r.ok ? 200 : 502);
          }
        }
      }
      return json({ error: "not_connected", message: "Target sync is not connected for this client." }, 200);
    }


      return json({
        error: "invalid_action",
        message: "Unhandled client web action",
      }, 400);
    }

    // ─────────────────────── COACH-ONLY (Pro invite / diary sync) ───────────────────────
    const auth = await requireCoach(req);
    if ("error" in auth) return json({ error: auth.error }, auth.status);
    const { userId, admin } = auth;

    if (action === "invite_client") {
      const { client_id, email, name } = body;
      if (!client_id || !email) return json({ error: "client_id and email required" }, 400);
      if (!(await admin.rpc("is_coach_of", { _coach_id: userId, _client_id: client_id })).data) {
        return json({ error: "Not your client" }, 403);
      }

      const ctx: LogCtx = { action: "invite_client", coach_id: userId, client_id };
      const inviteBody = { email, name: name ?? email };

      const tryInvite = () => callCrono<any>("/client_invite", inviteBody, ctx);

      let resp: any;
      try {
        resp = await tryInvite();
      } catch (e) {
        // Cronometer refuses because the pro account already has this email.
        // Auto-heal: look up the upstream client_id by email, remove it, retry once.
        const isAlreadyClient = e instanceof CronoApiError
          && e.status === 400
          && /already a client of this pro/i.test(e.body);
        if (!isAlreadyClient) throw e;

        console.warn(`invite_client: ${email} already exists upstream — removing and retrying`);
        try {
          const statusResp = await callCrono<any>("/client_status", {}, {
            ...ctx,
            action: "invite_client:lookup",
          });
          const list: any[] = Array.isArray(statusResp) ? statusResp : (statusResp?.clients ?? []);
          const match = list.find((r) =>
            String(r?.email ?? "").toLowerCase() === email.toLowerCase()
          );
          const upstreamId = match?.client_id ?? match?.id ?? null;
          if (upstreamId) {
            await callCrono("/client_remove", { client_id: Number(upstreamId) }, {
              ...ctx,
              action: "invite_client:cleanup",
              cronometer_client_id: Number(upstreamId),
            });
          } else {
            return json({
              error: "already_client",
              message:
                `Cronometer says ${email} is already linked to this Pro account, but it isn't visible in /client_status. Remove them manually in Cronometer, then retry.`,
            }, 409);
          }
        } catch (cleanupErr) {
          const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
          return json({
            error: "already_client_cleanup_failed",
            message: `Cronometer already has ${email}, and auto-cleanup failed: ${msg}`,
          }, 502);
        }

        // Also nuke any local rows for this email under this coach so we don't
        // trip a stale unique constraint.
        await admin
          .from("cronometer_clients")
          .delete()
          .eq("coach_id", userId)
          .eq("email", email);

        resp = await tryInvite();
      }

      const cronoId = resp?.client_id ?? resp?.id ?? null;
      const { data: row, error } = await admin
        .from("cronometer_clients")
        .upsert(
          {
            coach_id: userId,
            client_id,
            email,
            name: name ?? null,
            cronometer_client_id: cronoId,
            status: "pending",
            invited_at: new Date().toISOString(),
            last_error: null,
          },
          { onConflict: "coach_id,client_id" },
        )
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, client: row });
    }

    if (action === "remove_client") {
      const { client_id } = body;
      if (!client_id) return json({ error: "client_id required" }, 400);
      const { data: link } = await admin
        .from("cronometer_clients")
        .select("cronometer_client_id")
        .eq("coach_id", userId)
        .eq("client_id", client_id)
        .maybeSingle();
      if (link?.cronometer_client_id) {
        try {
          await callCrono("/client_remove", { client_id: link.cronometer_client_id });
        } catch (e) {
          console.warn("client_remove upstream failed:", e);
        }
      }
      await admin.from("cronometer_clients").delete().eq("coach_id", userId).eq("client_id", client_id);
      return json({ success: true });
    }

    if (action === "refresh_status") {
      const resp = await callCrono<any>("/client_status", {});
      const list: any[] = Array.isArray(resp) ? resp : (resp?.clients ?? []);
      const { data: myRows } = await admin
        .from("cronometer_clients")
        .select("id, cronometer_client_id, email, status, client_id")
        .eq("coach_id", userId);

      const byEmail = new Map<string, any>();
      const byId = new Map<number, any>();
      for (const r of list) {
        if (r.email) byEmail.set(String(r.email).toLowerCase(), r);
        const cid = r.client_id ?? r.id;
        if (cid) byId.set(Number(cid), r);
      }

      const updates: Promise<any>[] = [];
      for (const local of myRows ?? []) {
        const match = (local.cronometer_client_id && byId.get(Number(local.cronometer_client_id)))
          || byEmail.get(String(local.email).toLowerCase());
        if (!match) {
          if (local.status !== "pending") {
            updates.push(
              admin.from("cronometer_clients").update({ status: "revoked" }).eq("id", local.id) as any,
            );
          }
          continue;
        }
        const upstreamStatus = String(match.status ?? "").toUpperCase();
        const nextStatus = upstreamStatus.includes("PENDING") ? "pending" : "active";
        const patch: Record<string, unknown> = { status: nextStatus, last_error: null };
        const remoteId = match.client_id ?? match.id;
        if (remoteId && !local.cronometer_client_id) patch.cronometer_client_id = Number(remoteId);
        if (nextStatus === "active" && local.status !== "active") {
          patch.connected_at = new Date().toISOString();
        }
        updates.push(admin.from("cronometer_clients").update(patch).eq("id", local.id) as any);

        // Newly active → enqueue full backfill.
        if (nextStatus === "active" && local.status === "pending") {
          try {
            await syncOneClient(admin, {
              id: local.id,
              client_id: local.client_id,
              cronometer_client_id: Number(remoteId ?? local.cronometer_client_id),
              last_synced_day: null,
            }, { full: true });
          } catch (e) {
            console.warn("initial backfill failed:", e);
          }
        }
      }
      await Promise.all(updates);
      return json({ success: true, upstream_count: list.length });
    }

    if (action === "sync_client") {
      const { client_id, full } = body;
      if (!client_id) return json({ error: "client_id required" }, 400);
      const { data: link, error } = await admin
        .from("cronometer_clients")
        .select("id, client_id, cronometer_client_id, last_synced_day, status")
        .eq("coach_id", userId)
        .eq("client_id", client_id)
        .maybeSingle();
      if (error || !link) return json({ error: "not_linked" }, 404);
      if (link.status !== "active") return json({ error: "not_active", status: link.status }, 409);
      try {
        const r = await syncOneClient(admin, link, { full: !!full });
        return json({ success: true, ...r });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("cronometer_clients").update({ status: "error", last_error: msg }).eq("id", link.id);
        return json({ error: "sync_failed", message: msg }, 502);
      }
    }

    if (action === "get_targets") {
      const { client_id, day } = body;
      if (!client_id) return json({ error: "client_id required" }, 400);
      const { data: link } = await admin
        .from("cronometer_clients")
        .select("cronometer_client_id")
        .eq("coach_id", userId)
        .eq("client_id", client_id)
        .maybeSingle();
      if (!link?.cronometer_client_id) return json({ error: "not_linked" }, 404);
      const resp = await callCrono("/targets", {
        client_id: link.cronometer_client_id,
        day: day ?? ymd(new Date()),
      });
      return json({ success: true, targets: resp });
    }


    return json({
      error: "invalid_action",
      message: "Valid actions: invite_client, remove_client, refresh_status, sync_client, sync_all, get_targets, sync, web_connect, web_disconnect, web_push_targets, web_status",
    }, 400);
  } catch (e) {
    if (e instanceof CronoApiError) {
      const status = e.status === 401 ? 401 : e.status >= 500 ? 502 : 400;
      let cronoMessage = e.body.slice(0, 500);
      try {
        const parsed = JSON.parse(e.body);
        if (parsed?.error) cronoMessage = String(parsed.error);
      } catch { /* not JSON */ }
      return json({
        error: "cronometer_api",
        status: e.status,
        message: `Cronometer HTTP ${e.status}: ${cronoMessage}`,
      }, status);
    }
    console.error("cronometer function error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
