// Apple Health / Shortcuts nutrition ingest endpoint. Ported from the legacy
// `nutrition-ingest` edge function. Authenticated either by a user JWT (token
// management actions) or by an `nst_` ingest token (the ingest action itself).
import crypto from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import {
  serviceEndpoint,
  json,
  requireUser,
  type SqlClient,
} from "../../_lib/fn.js";

type NutritionDayInput = {
  date?: string;
  log_date?: string;
  calories?: number | string | null;
  protein_g?: number | string | null;
  carbs_g?: number | string | null;
  fat_g?: number | string | null;
  fiber_g?: number | string | null;
  sugar_g?: number | string | null;
  sodium_mg?: number | string | null;
};

type TokenRecord = {
  id: string;
  label: string | null;
  source: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function randomToken(): string {
  const raw = crypto.randomBytes(32).toString("base64");
  return `nst_${raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function endpointUrl(req: VercelRequest): string {
  const base = process.env.PUBLIC_API_URL?.replace(/\/$/, "");
  return `${base ?? `https://${req.headers.host ?? ""}`}/api/nutrition/ingest`;
}

function coerceNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function assertRange(name: string, value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
}

function normalizeDay(input: NutritionDayInput) {
  const logDate = input.date || input.log_date;
  if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    throw new Error("Each day needs a date in YYYY-MM-DD format");
  }

  const today = new Date();
  const maxDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1),
  );
  const minDate = new Date(
    Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate()),
  );
  const parsedDate = new Date(`${logDate}T00:00:00Z`);
  if (parsedDate < minDate || parsedDate > maxDate) {
    throw new Error(`Date ${logDate} is outside the accepted sync window`);
  }

  const calories = coerceNumber(input.calories);
  const protein = coerceNumber(input.protein_g);
  const carbs = coerceNumber(input.carbs_g);
  const fat = coerceNumber(input.fat_g);
  const fiber = coerceNumber(input.fiber_g);
  const sugar = coerceNumber(input.sugar_g);
  const sodium = coerceNumber(input.sodium_mg);

  assertRange("calories", calories, 0, 20000);
  assertRange("protein_g", protein, 0, 2000);
  assertRange("carbs_g", carbs, 0, 3000);
  assertRange("fat_g", fat, 0, 2000);
  assertRange("fiber_g", fiber, 0, 1000);
  assertRange("sugar_g", sugar, 0, 2000);
  assertRange("sodium_mg", sodium, 0, 100000);

  return {
    log_date: logDate,
    calories: Math.round(calories),
    protein_g: round1(protein),
    carbs_g: round1(carbs),
    fat_g: round1(fat),
    fiber_g: round1(fiber),
    sugar_g: round1(sugar),
    sodium_mg: Math.round(sodium),
  };
}

function extractIngestToken(
  req: VercelRequest,
  body: Record<string, unknown>,
): string | null {
  const header = req.headers["x-ingest-token"];
  const explicit =
    (Array.isArray(header) ? header[0] : header) ||
    (typeof body.token === "string" ? body.token : "");
  if (explicit) return explicit.trim();

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.replace("Bearer ", "").trim();
  return token.startsWith("nst_") ? token : null;
}

async function authedUserId(req: VercelRequest): Promise<string | null> {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).startsWith("eyJ")) {
    return null;
  }
  try {
    const user = await requireUser(req);
    return user.id;
  } catch {
    return null;
  }
}

export default serviceEndpoint(
  { auth: "public", methods: ["POST"], raw: true },
  async ({ req, res, sql }) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "ingest";

    if (action === "issue_token") {
      const userId = await authedUserId(req);
      if (!userId) return json(res, { error: "Unauthorized" }, 401);

      const token = randomToken();
      const label =
        typeof body.label === "string" && body.label.trim()
          ? body.label.trim().slice(0, 80)
          : "Apple Health Shortcut";

      const { rows } = await sql.query<TokenRecord>(
        `INSERT INTO public.nutrition_ingest_tokens
           (client_id, token_hash, source, label)
         VALUES ($1, $2, 'apple_health_shortcut', $3)
         RETURNING id, label, source, created_at, last_used_at, revoked_at`,
        [userId, sha256Hex(token), label],
      );

      return json(res, {
        success: true,
        token,
        endpoint: endpointUrl(req),
        shortcut_name: "Coach Nutrition Sync",
        token_record: rows[0],
      });
    }

    if (action === "list_tokens") {
      const userId = await authedUserId(req);
      if (!userId) return json(res, { error: "Unauthorized" }, 401);

      const { rows } = await sql.query<TokenRecord>(
        `SELECT id, label, source, created_at, last_used_at, revoked_at
           FROM public.nutrition_ingest_tokens
          WHERE client_id = $1
          ORDER BY created_at DESC`,
        [userId],
      );
      return json(res, {
        success: true,
        tokens: rows,
        endpoint: endpointUrl(req),
      });
    }

    if (action === "revoke_token") {
      const userId = await authedUserId(req);
      if (!userId) return json(res, { error: "Unauthorized" }, 401);
      if (typeof body.token_id !== "string") {
        return json(res, { error: "token_id required" }, 400);
      }
      await sql.query(
        `UPDATE public.nutrition_ingest_tokens
            SET revoked_at = now()
          WHERE id = $1 AND client_id = $2`,
        [body.token_id, userId],
      );
      return json(res, { success: true });
    }

    if (action === "ingest") return ingest(req, res, sql, body);

    return json(res, { error: "Invalid action" }, 400);
  },
);

async function ingest(
  req: VercelRequest,
  res: Parameters<typeof json>[0],
  sql: SqlClient,
  body: Record<string, unknown>,
) {
  const ingestToken = extractIngestToken(req, body);
  if (!ingestToken) return json(res, { error: "Missing ingest token" }, 401);

  const { rows: tokenRows } = await sql.query<{
    id: string;
    client_id: string;
    label: string | null;
    source: string | null;
  }>(
    `SELECT id, client_id, label, source
       FROM public.nutrition_ingest_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL
      LIMIT 1`,
    [sha256Hex(ingestToken)],
  );
  const tokenRow = tokenRows[0];
  if (!tokenRow) {
    return json(res, { error: "Invalid or revoked ingest token" }, 401);
  }

  const inputDays: unknown[] = Array.isArray(body.days)
    ? body.days
    : body.day && typeof body.day === "object"
      ? [body.day]
      : body.date || body.log_date
        ? [body]
        : [];

  if (inputDays.length === 0) {
    return json(res, { error: "No nutrition days supplied" }, 400);
  }
  if (inputDays.length > 14) {
    return json(res, { error: "At most 14 days can be synced per request" }, 400);
  }

  let normalized: ReturnType<typeof normalizeDay>[];
  try {
    normalized = inputDays.map((day) => normalizeDay(day as NutritionDayInput));
  } catch (e) {
    return json(res, { error: e instanceof Error ? e.message : String(e) }, 400);
  }

  const now = new Date().toISOString();
  for (const [idx, day] of normalized.entries()) {
    await sql.query(
      `INSERT INTO public.cronometer_nutrition_logs
         (client_id, log_date, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
          entries, source, source_detail, raw_payload, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]'::jsonb,'apple_health_shortcut',$10,$11::jsonb,$12)
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
         source_detail = EXCLUDED.source_detail,
         raw_payload = EXCLUDED.raw_payload,
         synced_at = EXCLUDED.synced_at,
         updated_at = now()`,
      [
        tokenRow.client_id,
        day.log_date,
        day.calories,
        day.protein_g,
        day.carbs_g,
        day.fat_g,
        day.fiber_g,
        day.sugar_g,
        day.sodium_mg,
        tokenRow.label,
        JSON.stringify(inputDays[idx] ?? null),
        now,
      ],
    );
  }

  await sql.query(
    `UPDATE public.nutrition_ingest_tokens SET last_used_at = $1 WHERE id = $2`,
    [now, tokenRow.id],
  );

  const daysWithData = normalized.filter((r) => Number(r.calories) > 0).length;
  return json(res, {
    success: true,
    days_received: normalized.length,
    days_with_data: daysWithData,
    from: normalized[0]?.log_date,
    to: normalized[normalized.length - 1]?.log_date,
  });
}
