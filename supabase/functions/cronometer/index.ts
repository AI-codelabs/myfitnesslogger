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
//
// Legacy no-ops (kept so existing frontend calls don't error):
//   - connect_and_save    returns { error: "legacy_flow", ... }
//   - sync                maps to sync_client for the current authenticated user
//   - push_targets        returns { error: "sync_disabled" } — API has no write endpoint

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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

async function callCrono<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!PRO_TOKEN) throw new Error("CRONOMETER_PRO_TOKEN not configured");
  const res = await fetch(`${CRONO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PRO_TOKEN}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new CronoApiError(res.status, text);
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ─────────────────────────── Auth helpers ───────────────────────────

type AuthedCall = {
  userId: string;
  supabase: SupabaseClient;
  admin: SupabaseClient;
};

async function requireCoach(req: Request): Promise<AuthedCall | { error: string; status: number }> {
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
  const { data: isCoach } = await admin.rpc("has_role", { _user_id: userId, _role: "coach" });
  if (!isCoach) return { error: "Coach role required", status: 403 };
  return { userId, supabase, admin };
}

function requireCronSecret(req: Request): boolean {
  if (!CRON_SECRET) return false;
  return req.headers.get("x-cron-secret") === CRON_SECRET;
}

// ─────────────────────────── Sync helpers ───────────────────────────

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function normalizeDiary(day: string, payload: any) {
  // Cronometer's diary_summary returns totals + a list of servings/entries.
  // Field names are best-effort; we tolerate multiple shapes.
  const totals = payload?.totals ?? payload?.nutrients ?? payload ?? {};
  const num = (k: string, alt?: string) =>
    Number(totals[k] ?? (alt ? totals[alt] : 0) ?? 0) || 0;
  return {
    log_date: day,
    calories: num("calories", "energy_kcal"),
    protein_g: num("protein", "protein_g"),
    carbs_g: num("carbs", "carbohydrates"),
    fat_g: num("fat", "fat_g"),
    fiber_g: num("fiber", "fiber_g"),
    sugar_g: num("sugar", "sugar_g"),
    sodium_mg: num("sodium", "sodium_mg"),
    entries: payload?.entries ?? payload?.servings ?? [],
    source: "api",
    synced_at: new Date().toISOString(),
  };
}

async function syncOneClient(
  admin: SupabaseClient,
  row: { id: string; client_id: string; cronometer_client_id: number | null; last_synced_day: string | null },
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
  });
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
        callCrono("/diary_summary", { client_id: row.cronometer_client_id, day })
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

    // Everything below requires a signed-in coach.
    const auth = await requireCoach(req);
    if ("error" in auth) return json({ error: auth.error }, auth.status);
    const { userId, admin } = auth;

    if (action === "invite_client") {
      const { client_id, email, name } = body;
      if (!client_id || !email) return json({ error: "client_id and email required" }, 400);
      if (!(await admin.rpc("is_coach_of", { _coach_id: userId, _client_id: client_id })).data) {
        return json({ error: "Not your client" }, 403);
      }
      const resp = await callCrono<any>("/client_invite", { email, name: name ?? email });
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

    // ───── Legacy no-ops for existing frontend calls ─────
    if (action === "sync") {
      // Old client-invoked "sync my own data" button. Map to sync_client for self.
      const { data: link } = await admin
        .from("cronometer_clients")
        .select("id, client_id, cronometer_client_id, last_synced_day, status")
        .eq("client_id", userId)
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

    if (action === "connect_and_save" || action === "connect" || action === "login_and_export" || action === "export") {
      return json({
        error: "legacy_flow",
        message: "Cronometer now uses the Pro invite flow. Ask your coach to (re)send the invite.",
      }, 410);
    }

    if (action === "push_targets" || action === "admin_sync_all" || action === "reapply_today_targets") {
      // Cronometer API has no write endpoints. Targets now live in this app.
      return json({ error: "sync_disabled", message: "Targets are managed in-app; Cronometer API has no write endpoint." }, 200);
    }

    return json({
      error: "invalid_action",
      message: "Valid actions: invite_client, remove_client, refresh_status, sync_client, sync_all, get_targets, sync",
    }, 400);
  } catch (e) {
    if (e instanceof CronoApiError) {
      const status = e.status === 401 ? 401 : e.status >= 500 ? 502 : 400;
      return json({ error: "cronometer_api", status: e.status, message: e.body.slice(0, 500) }, status);
    }
    console.error("cronometer function error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
