// Cronometer Pro API + coach-session target push, ported from
// supabase/functions/cronometer/index.ts to a Vercel serverless function
// backed by Neon Postgres. Action router, payload shapes, error codes and
// cronometer_api_logs logging are preserved as-is.
//
// Auth model (unchanged):
//   - web_* target-sync actions accept any signed-in user (coach pushes for a client).
//   - Pro invite / diary sync actions require the coach role.
//   - sync_all / hourly_reconcile require the cron secret.
//   - sync (self-sync) accepts the signed-in client.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  serviceEndpoint,
  json,
  HttpError,
  requireCoach,
  isCronAuthorized,
  type SqlClient,
} from "../../_lib/fn.js";
import type { AuthUser } from "../../_lib/auth.js";
import {
  cronoLogin,
  pushTargets,
  encryptJson,
  decryptJson,
  loadCurrentTargets,
  type CookieJar,
  type NutritionTargets,
  type WebSessionRow,
} from "./_lib/webPush.js";
import { CronoApiError, makeCallCrono, logApiCall, type LogCtx } from "./_lib/proClient.js";

const CORS_METHODS = ["POST"];

// ───────────────── Remote target verification (source of truth) ─────────────────

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
  const totals = (payload?.macros ?? payload?.totals ?? payload?.summary ?? payload ?? {}) as Record<string, unknown>;
  const nutrients = (payload?.nutrients ?? {}) as Record<string, unknown>;
  const macros = macrosFromPayload(totals);
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

type ClientRow = {
  id: string;
  coach_id?: string | null;
  client_id: string;
  cronometer_client_id: number | null;
  last_synced_day: string | null;
};

async function syncOneClient(
  sql: SqlClient,
  callCrono: ReturnType<typeof makeCallCrono>,
  row: ClientRow,
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

  if (opts.full) {
    await sql.query(`DELETE FROM public.cronometer_nutrition_logs WHERE client_id = $1`, [row.client_id]);
  }

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
    for (const u of upserts) {
      await sql.query(
        `INSERT INTO public.cronometer_nutrition_logs
           (client_id, log_date, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, entries, source, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (client_id, log_date) DO UPDATE SET
           calories = EXCLUDED.calories,
           protein_g = EXCLUDED.protein_g,
           carbs_g = EXCLUDED.carbs_g,
           fat_g = EXCLUDED.fat_g,
           fiber_g = EXCLUDED.fiber_g,
           sugar_g = EXCLUDED.sugar_g,
           sodium_mg = EXCLUDED.sodium_mg,
           entries = EXCLUDED.entries,
           source = EXCLUDED.source,
           synced_at = EXCLUDED.synced_at`,
        [
          u.client_id, u.log_date, u.calories, u.protein_g, u.carbs_g, u.fat_g,
          u.fiber_g, u.sugar_g, u.sodium_mg, JSON.stringify(u.entries), u.source, u.synced_at,
        ],
      );
    }
  }

  const latestDay = upserts.length ? upserts.map((u) => u.log_date).sort().at(-1) : row.last_synced_day;
  await sql.query(
    `UPDATE public.cronometer_clients
       SET last_synced_at = now(), last_synced_day = $2, status = 'active', last_error = NULL
     WHERE id = $1`,
    [row.id, latestDay ?? null],
  );

  return { days_synced: upserts.length, from, to };
}

/** Read the live targets Cronometer shows this client, or null if unavailable. */
async function fetchRemoteTargets(
  sql: SqlClient,
  callCrono: ReturnType<typeof makeCallCrono>,
  clientId: string,
  ctx: LogCtx = {},
): Promise<RemoteTargets | null> {
  try {
    const { rows } = await sql.query<{ cronometer_client_id: number | null }>(
      `SELECT cronometer_client_id FROM public.cronometer_clients
       WHERE client_id = $1 AND cronometer_client_id IS NOT NULL LIMIT 1`,
      [clientId],
    );
    const cronoId = rows[0]?.cronometer_client_id;
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

// ─────────────────────────── Handler ───────────────────────────

export default serviceEndpoint({ auth: "either", methods: CORS_METHODS }, async ({ req, res, sql, user }) => {
 try {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : undefined;
  const callCrono = makeCallCrono(sql);


  // ───── Cron entry point ─────
  if (action === "sync_all") {
    if (!(await isCronAuthorized(req, sql))) throw new HttpError(403, "Forbidden");
    const { rows: clients } = await sql.query<ClientRow>(
      `SELECT id, client_id, cronometer_client_id, last_synced_day
       FROM public.cronometer_clients
       WHERE status = 'active' AND cronometer_client_id IS NOT NULL`,
    );
    const results: any[] = [];
    for (const c of clients) {
      try {
        const r = await syncOneClient(sql, callCrono, c);
        results.push({ client_id: c.client_id, ...r });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await sql.query(`UPDATE public.cronometer_clients SET status='error', last_error=$2 WHERE id=$1`, [c.id, msg]);
        results.push({ client_id: c.client_id, error: msg });
      }
    }
    return { success: true, synced: results.length, results };
  }

  // ───── Hourly reconcile (cron) ─────
  if (action === "hourly_reconcile") {
    if (!(await isCronAuthorized(req, sql))) throw new HttpError(403, "Forbidden");
    const resp = await callCrono<any>("/client_status", {}, { action: "hourly_reconcile" });
    const list: any[] = Array.isArray(resp) ? resp : (resp?.clients ?? []);
    const { rows: myRows } = await sql.query<any>(
      `SELECT id, coach_id, client_id, cronometer_client_id, email, status, last_synced_day
       FROM public.cronometer_clients`,
    );

    const byEmail = new Map<string, any>();
    const byId = new Map<number, any>();
    for (const r of list) {
      if (r.email) byEmail.set(String(r.email).toLowerCase(), r);
      const cid = r.client_id ?? r.id;
      if (cid) byId.set(Number(cid), r);
    }

    const summary: any[] = [];
    for (const local of myRows) {
      const match = (local.cronometer_client_id && byId.get(Number(local.cronometer_client_id)))
        || (local.email && byEmail.get(String(local.email).toLowerCase()));
      if (!match) {
        if (local.status === "active") {
          await sql.query(`UPDATE public.cronometer_clients SET status='revoked' WHERE id=$1`, [local.id]);
          summary.push({ client_id: local.client_id, action: "revoked" });
        }
        continue;
      }
      const upstreamStatus = String(match.status ?? "").toUpperCase();
      const nextStatus = upstreamStatus.includes("PENDING") ? "pending" : "active";
      const remoteId = match.client_id ?? match.id;
      const cronometerClientId = remoteId && !local.cronometer_client_id ? Number(remoteId) : local.cronometer_client_id;
      const connectedAt = nextStatus === "active" && local.status !== "active" ? new Date().toISOString() : null;
      await sql.query(
        `UPDATE public.cronometer_clients
           SET status=$2, last_error=NULL, cronometer_client_id=$3,
               connected_at = COALESCE($4::timestamptz, connected_at)
         WHERE id=$1`,
        [local.id, nextStatus, cronometerClientId, connectedAt],
      );

      if (nextStatus === "active" && local.status === "pending") {
        try {
          await syncOneClient(sql, callCrono, {
            id: local.id,
            client_id: local.client_id,
            cronometer_client_id: Number(remoteId ?? local.cronometer_client_id),
            last_synced_day: null,
          }, { full: true });
          summary.push({ client_id: local.client_id, action: "promoted_and_backfilled" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await sql.query(`UPDATE public.cronometer_clients SET status='error', last_error=$2 WHERE id=$1`, [local.id, msg]);
          summary.push({ client_id: local.client_id, action: "promote_failed", error: msg });
        }
      } else if (nextStatus === "active") {
        try {
          const r = await syncOneClient(sql, callCrono, {
            id: local.id,
            client_id: local.client_id,
            cronometer_client_id: Number(local.cronometer_client_id ?? remoteId),
            last_synced_day: local.last_synced_day ?? null,
          });
          summary.push({ client_id: local.client_id, action: "synced", ...r });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await sql.query(`UPDATE public.cronometer_clients SET status='error', last_error=$2 WHERE id=$1`, [local.id, msg]);
          summary.push({ client_id: local.client_id, action: "sync_failed", error: msg });
        }
      }
    }
    return { success: true, upstream_count: list.length, reconciled: summary.length, summary };
  }

  // ───── Client-invoked self sync (no coach role required) ─────
  if (action === "sync") {
    if (!user) throw new HttpError(401, "Unauthorized");
    const { rows } = await sql.query<any>(
      `SELECT id, client_id, cronometer_client_id, last_synced_day, status
       FROM public.cronometer_clients WHERE client_id = $1 LIMIT 1`,
      [user.id],
    );
    const link = rows[0];
    if (!link) return json(res, { error: "no_session", message: "Cronometer not connected" }, 400);
    if (link.status !== "active") return json(res, { error: "no_session", message: "Cronometer link not active" }, 400);
    try {
      const r = await syncOneClient(sql, callCrono, link);
      return { success: true, days_synced: r.days_synced, up_to_date: r.days_synced === 0, from: r.from, to: r.to };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json(res, { error: "sync_failed", message: msg }, 502);
    }
  }

  // ─────────────────────── TARGET PUSH (coach session; any signed-in user) ───────────────────────
  const CLIENT_WEB_ACTIONS = new Set([
    "web_push_targets", "web_status",
    "push_targets", "admin_sync_all", "reapply_today_targets",
    "connect_and_save", "connect", "login_and_export", "export",
    "web_connect", "web_disconnect",
  ]);
  const isClientWebAction =
    CLIENT_WEB_ACTIONS.has(action ?? "") ||
    (typeof action === "string" && action.startsWith("web_"));

  if (isClientWebAction) {
    if (!user) throw new HttpError(401, "Unauthorized");
    const userId = user.id;

    const webLog = (extraCtx: LogCtx) => async (entry: {
      endpoint: string;
      request_body: unknown;
      response_status: number | null;
      response_text: string;
      error?: string | null;
      duration_ms: number;
    }) => {
      await logApiCall(sql, {
        ctx: { action: extraCtx.action ?? "web", coach_id: extraCtx.coach_id ?? null, client_id: extraCtx.client_id ?? null },
        endpoint: `WEB ${entry.endpoint}`,
        request_body: entry.request_body,
        response_status: entry.response_status,
        response_text: entry.response_text,
        error: entry.error,
        duration_ms: entry.duration_ms,
      });
    };

    const COACH_EMAIL = process.env.CRONO_COACH_EMAIL ?? "";
    const COACH_PASSWORD = process.env.CRONO_COACH_PASSWORD ?? "";

    async function findProLink(clientId: string): Promise<{ coach_id: string; cronometer_client_id: number } | null> {
      const { rows } = await sql.query<{ coach_id: string; cronometer_client_id: number }>(
        `SELECT coach_id, cronometer_client_id FROM public.cronometer_clients
         WHERE client_id = $1 AND cronometer_client_id IS NOT NULL
         ORDER BY invited_at DESC LIMIT 1`,
        [clientId],
      );
      return rows[0]?.cronometer_client_id ? rows[0] : null;
    }

    async function loadCoachSessionRow(coachId: string): Promise<WebSessionRow | null> {
      const { rows } = await sql.query<WebSessionRow>(
        `SELECT * FROM public.cronometer_web_sessions WHERE coach_id=$1 AND client_id=$1 LIMIT 1`,
        [coachId],
      );
      return rows[0] ?? null;
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
      const { rows: saved } = await sql.query<{ id: string }>(
        `INSERT INTO public.cronometer_web_sessions
           (coach_id, client_id, cronometer_email, credentials_ciphertext, session_cookies, user_agent, status, last_login_at, last_error)
         VALUES ($1,$1,$2,$3,$4,$5,'active', now(), NULL)
         ON CONFLICT (coach_id, client_id) DO UPDATE SET
           cronometer_email=EXCLUDED.cronometer_email,
           credentials_ciphertext=EXCLUDED.credentials_ciphertext,
           session_cookies=EXCLUDED.session_cookies,
           user_agent=EXCLUDED.user_agent,
           status='active', last_login_at=now(), last_error=NULL
         RETURNING id`,
        [coachId, COACH_EMAIL, await encryptJson({ password: COACH_PASSWORD }), await encryptJson(login.cookies), login.userAgent],
      );
      return { cookies: login.cookies, ua: login.userAgent, rowId: saved[0]?.id ?? "" };
    }

    async function coachPush(clientId: string, targets: NutritionTargets): Promise<{ ok: boolean; error?: string }> {
      const link = await findProLink(clientId);
      if (!link) return { ok: false, error: "not_linked" };
      const log = webLog({ action: "web_push_coach", coach_id: link.coach_id, client_id: clientId });

      let session = await ensureCoachSession(link.coach_id, log);
      if ("error" in session) return { ok: false, error: session.error };

      let resPush = await pushTargets({
        cookies: session.cookies, userAgent: session.ua, targets,
        targetUserId: link.cronometer_client_id, log,
      });
      if (!resPush.ok && resPush.error === "session_expired") {
        if (session.rowId) {
          await sql.query(`UPDATE public.cronometer_web_sessions SET session_cookies=NULL WHERE id=$1`, [session.rowId]);
        }
        session = await ensureCoachSession(link.coach_id, log);
        if ("error" in session) return { ok: false, error: session.error };
        resPush = await pushTargets({
          cookies: session.cookies, userAgent: session.ua, targets,
          targetUserId: link.cronometer_client_id, log,
        });
      }
      if (session.rowId) {
        await sql.query(
          `UPDATE public.cronometer_web_sessions
             SET session_cookies=$2, status=$3, last_error=$4,
                 last_push_at = CASE WHEN $3 = 'active' THEN now() ELSE last_push_at END
           WHERE id=$1`,
          [session.rowId, await encryptJson(resPush.cookies), resPush.ok ? "active" : "error", resPush.ok ? null : (resPush.error ?? "push_failed")],
        );
      }
      await sql.query(
        `UPDATE public.cronometer_clients SET last_error=$3 WHERE client_id=$1 AND coach_id=$2`,
        [clientId, link.coach_id, resPush.ok ? null : (resPush.error ?? "push_failed")],
      );
      return resPush.ok ? { ok: true } : { ok: false, error: resPush.error };
    }

    if (action === "web_connect" || action === "web_disconnect") {
      return json(res, {
        error: "client_web_login_removed",
        message: "Client Cronometer login is no longer supported. Your coach links accounts via Cronometer Pro.",
      }, 410);
    }

    if (action === "web_push_targets") {
      const client_id = (body.client_id as string | undefined) ?? userId;
      const force = body.force as boolean | undefined;

      const targets = await loadCurrentTargets(sql, client_id);
      if (!targets) return json(res, { error: "no_targets" }, 404);

      const link = await findProLink(client_id);
      if (!link) {
        return json(res, { error: "not_connected", message: "Client is not linked in Cronometer Pro yet." }, 404);
      }

      if (!force) {
        const remoteSame = await fetchRemoteTargets(sql, callCrono, client_id, { action: "web_push_targets" });
        if (remoteMatches(remoteSame, targets) === true) {
          return { success: true, skipped: "unchanged", remote_targets: remoteSame, app_targets: targets };
        }
      }

      const cr = await coachPush(client_id, targets);
      if (!cr.ok) return json(res, { error: cr.error, message: cr.error }, 502);
      const remote = await fetchRemoteTargets(sql, callCrono, client_id, { action: "web_push_targets" });
      return {
        success: true,
        mode: "coach",
        verified: remoteMatches(remote, targets),
        remote_targets: remote,
        app_targets: targets,
      };
    }

    if (action === "web_status") {
      const client_id = (body.client_id as string | undefined) ?? userId;

      const targets = await loadCurrentTargets(sql, client_id);
      const remote = await fetchRemoteTargets(sql, callCrono, client_id, { action: "web_status" });
      const verified = remoteMatches(remote, targets);
      const proLink = await findProLink(client_id);
      const coachPushAvailable = !!proLink && !!COACH_EMAIL && !!COACH_PASSWORD;

      let last_push_at: string | null = null;
      let last_error: string | null = null;
      if (proLink) {
        const { rows: linkRows } = await sql.query<{ last_error: string | null }>(
          `SELECT last_error FROM public.cronometer_clients WHERE coach_id=$1 AND client_id=$2 LIMIT 1`,
          [proLink.coach_id, client_id],
        );
        last_error = linkRows[0]?.last_error ?? null;
        const coachRow = await loadCoachSessionRow(proLink.coach_id);
        last_push_at = coachRow?.last_push_at ?? null;
      }

      return {
        success: true,
        connected: coachPushAvailable,
        mode: coachPushAvailable ? "coach" : undefined,
        status: coachPushAvailable ? "active" : undefined,
        coach_push: coachPushAvailable,
        last_push_at,
        last_error,
        in_sync: verified === true,
        verified,
        remote_targets: remote,
        app_targets: targets,
      };
    }

    // ─────────────────────── Legacy no-ops ───────────────────────
    if (action === "connect_and_save" || action === "connect" || action === "login_and_export" || action === "export") {
      return json(res, {
        error: "legacy_flow",
        message: "Cronometer now uses the Pro invite flow. Ask your coach to (re)send the invite.",
      }, 410);
    }

    if (action === "push_targets" || action === "admin_sync_all" || action === "reapply_today_targets") {
      const client_id = body.client_id as string | undefined;
      if (!client_id) {
        return json(res, { error: "not_connected", message: "Target sync requires a linked Cronometer Pro client." }, 404);
      }
      const targets = await loadCurrentTargets(sql, client_id);
      if (!targets) {
        return json(res, { error: "no_targets", message: "No nutrition targets found for this client." }, 404);
      }
      const cr = await coachPush(client_id, targets);
      return json(res, cr.ok ? { success: true } : { error: cr.error }, cr.ok ? 200 : 502);
    }

    return json(res, { error: "invalid_action", message: "Unhandled target-sync action" }, 400);
  }

  // ─────────────────────── COACH-ONLY (Pro invite / diary sync) ───────────────────────
  if (!user) throw new HttpError(401, "Unauthorized");
  await requireCoach(sql, user);
  const userId = user.id;

  if (action === "invite_client") {
    const client_id = body.client_id as string | undefined;
    const email = body.email as string | undefined;
    const name = body.name as string | undefined;
    if (!client_id || !email) return json(res, { error: "client_id and email required" }, 400);
    const { rows: coachCheck } = await sql.query<{ ok: boolean }>(`SELECT public.is_coach_of($1::uuid, $2::uuid) AS ok`, [userId, client_id]);
    if (!coachCheck[0]?.ok) return json(res, { error: "Not your client" }, 403);

    const ctx: LogCtx = { action: "invite_client", coach_id: userId, client_id };
    const inviteBody = { email, name: name ?? email };

    const tryInvite = () => callCrono<any>("/client_invite", inviteBody, ctx);

    let resp: any;
    try {
      resp = await tryInvite();
    } catch (e) {
      const isAlreadyClient = e instanceof CronoApiError && e.status === 400 && /already a client of this pro/i.test(e.body);
      if (!isAlreadyClient) throw e;

      console.warn(`invite_client: ${email} already exists upstream — removing and retrying`);
      try {
        const statusResp = await callCrono<any>("/client_status", {}, { ...ctx, action: "invite_client:lookup" });
        const list: any[] = Array.isArray(statusResp) ? statusResp : (statusResp?.clients ?? []);
        const match = list.find((r) => String(r?.email ?? "").toLowerCase() === email.toLowerCase());
        const upstreamId = match?.client_id ?? match?.id ?? null;
        if (upstreamId) {
          await callCrono("/client_remove", { client_id: Number(upstreamId) }, {
            ...ctx, action: "invite_client:cleanup", cronometer_client_id: Number(upstreamId),
          });
        } else {
          return json(res, {
            error: "already_client",
            message: `Cronometer says ${email} is already linked to this Pro account, but it isn't visible in /client_status. Remove them manually in Cronometer, then retry.`,
          }, 409);
        }
      } catch (cleanupErr) {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
        return json(res, {
          error: "already_client_cleanup_failed",
          message: `Cronometer already has ${email}, and auto-cleanup failed: ${msg}`,
        }, 502);
      }

      await sql.query(`DELETE FROM public.cronometer_clients WHERE coach_id=$1 AND email=$2`, [userId, email]);

      resp = await tryInvite();
    }

    const cronoId = resp?.client_id ?? resp?.id ?? null;
    const { rows: saved } = await sql.query<any>(
      `INSERT INTO public.cronometer_clients
         (coach_id, client_id, email, name, cronometer_client_id, status, invited_at, last_error)
       VALUES ($1,$2,$3,$4,$5,'pending', now(), NULL)
       ON CONFLICT (coach_id, client_id) DO UPDATE SET
         email=EXCLUDED.email, name=EXCLUDED.name, cronometer_client_id=EXCLUDED.cronometer_client_id,
         status='pending', invited_at=now(), last_error=NULL
       RETURNING *`,
      [userId, client_id, email, name ?? null, cronoId],
    );
    return { success: true, client: saved[0] };
  }

  if (action === "remove_client") {
    const client_id = body.client_id as string | undefined;
    if (!client_id) return json(res, { error: "client_id required" }, 400);
    const { rows: linkRows } = await sql.query<{ cronometer_client_id: number | null }>(
      `SELECT cronometer_client_id FROM public.cronometer_clients WHERE coach_id=$1 AND client_id=$2 LIMIT 1`,
      [userId, client_id],
    );
    const link = linkRows[0];
    if (link?.cronometer_client_id) {
      try {
        await callCrono("/client_remove", { client_id: link.cronometer_client_id });
      } catch (e) {
        console.warn("client_remove upstream failed:", e);
      }
    }
    await sql.query(`DELETE FROM public.cronometer_clients WHERE coach_id=$1 AND client_id=$2`, [userId, client_id]);
    return { success: true };
  }

  if (action === "refresh_status") {
    const resp = await callCrono<any>("/client_status", {});
    const list: any[] = Array.isArray(resp) ? resp : (resp?.clients ?? []);
    const { rows: myRows } = await sql.query<any>(
      `SELECT id, cronometer_client_id, email, status, client_id FROM public.cronometer_clients WHERE coach_id=$1`,
      [userId],
    );

    const byEmail = new Map<string, any>();
    const byId = new Map<number, any>();
    for (const r of list) {
      if (r.email) byEmail.set(String(r.email).toLowerCase(), r);
      const cid = r.client_id ?? r.id;
      if (cid) byId.set(Number(cid), r);
    }

    for (const local of myRows) {
      const match = (local.cronometer_client_id && byId.get(Number(local.cronometer_client_id)))
        || byEmail.get(String(local.email).toLowerCase());
      if (!match) {
        if (local.status !== "pending") {
          await sql.query(`UPDATE public.cronometer_clients SET status='revoked' WHERE id=$1`, [local.id]);
        }
        continue;
      }
      const upstreamStatus = String(match.status ?? "").toUpperCase();
      const nextStatus = upstreamStatus.includes("PENDING") ? "pending" : "active";
      const remoteId = match.client_id ?? match.id;
      const cronometerClientId = remoteId && !local.cronometer_client_id ? Number(remoteId) : local.cronometer_client_id;
      const connectedAt = nextStatus === "active" && local.status !== "active" ? new Date().toISOString() : null;
      await sql.query(
        `UPDATE public.cronometer_clients
           SET status=$2, last_error=NULL, cronometer_client_id=$3,
               connected_at = COALESCE($4::timestamptz, connected_at)
         WHERE id=$1`,
        [local.id, nextStatus, cronometerClientId, connectedAt],
      );

      if (nextStatus === "active" && local.status === "pending") {
        try {
          await syncOneClient(sql, callCrono, {
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
    return { success: true, upstream_count: list.length };
  }

  if (action === "sync_client") {
    const client_id = body.client_id as string | undefined;
    const full = body.full as boolean | undefined;
    if (!client_id) return json(res, { error: "client_id required" }, 400);
    const { rows } = await sql.query<any>(
      `SELECT id, client_id, cronometer_client_id, last_synced_day, status
       FROM public.cronometer_clients WHERE coach_id=$1 AND client_id=$2 LIMIT 1`,
      [userId, client_id],
    );
    const link = rows[0];
    if (!link) return json(res, { error: "not_linked" }, 404);
    if (link.status !== "active") return json(res, { error: "not_active", status: link.status }, 409);
    try {
      const r = await syncOneClient(sql, callCrono, link, { full: !!full });
      return { success: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sql.query(`UPDATE public.cronometer_clients SET status='error', last_error=$2 WHERE id=$1`, [link.id, msg]);
      return json(res, { error: "sync_failed", message: msg }, 502);
    }
  }

  if (action === "get_targets") {
    const client_id = body.client_id as string | undefined;
    const day = body.day as string | undefined;
    if (!client_id) return json(res, { error: "client_id required" }, 400);
    const { rows } = await sql.query<{ cronometer_client_id: number | null }>(
      `SELECT cronometer_client_id FROM public.cronometer_clients WHERE coach_id=$1 AND client_id=$2 LIMIT 1`,
      [userId, client_id],
    );
    if (!rows[0]?.cronometer_client_id) return json(res, { error: "not_linked" }, 404);
    const resp = await callCrono("/targets", { client_id: rows[0].cronometer_client_id, day: day ?? ymd(new Date()) });
    return { success: true, targets: resp };
  }

  return json(res, {
    error: "invalid_action",
    message: "Valid actions: invite_client, remove_client, refresh_status, sync_client, sync_all, get_targets, sync, web_push_targets, web_status",
  }, 400);
 } catch (e) {
  // Preserve the original edge function's Cronometer error mapping.
  if (e instanceof CronoApiError) {
    const status = e.status === 401 ? 401 : e.status >= 500 ? 502 : 400;
    let cronoMessage = e.body.slice(0, 500);
    try {
      const parsed = JSON.parse(e.body);
      if (parsed?.error) cronoMessage = String(parsed.error);
    } catch { /* not JSON */ }
    return json(res, {
      error: "cronometer_api",
      status: e.status,
      message: `Cronometer HTTP ${e.status}: ${cronoMessage}`,
    }, status);
  }
  throw e;
 }
});

