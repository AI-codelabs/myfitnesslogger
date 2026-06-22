import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

let cachedJwks: unknown = null;
async function getJwks() {
  if (cachedJwks) return cachedJwks;
  const jwksEnv = Deno.env.get("SUPABASE_JWKS");
  if (jwksEnv) {
    try {
      cachedJwks = JSON.parse(jwksEnv);
      return cachedJwks;
    } catch {
      // Fall back to fetching below.
    }
  }
  const url = `${Deno.env.get("SUPABASE_URL")}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(url);
  cachedJwks = await res.json();
  return cachedJwks;
}

async function authedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  if (!token.startsWith("eyJ")) return null;

  try {
    const jose = await import("https://deno.land/x/jose@v5.9.6/index.ts");
    const jwks = await getJwks();
    const keystore = jose.createLocalJWKSet(jwks as { keys: JsonWebKey[] });
    const { payload } = await jose.jwtVerify(token, keystore);
    return (payload.sub as string) || null;
  } catch (e) {
    console.error("[nutrition-ingest] JWT verify failed:", (e as Error).message);
    return null;
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = String.fromCharCode(...bytes);
  return `nst_${btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function endpointUrl(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/nutrition-ingest`;
}

function coerceNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

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
  const maxDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  const minDate = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate()));
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

function extractIngestToken(req: Request, body: Record<string, unknown>): string | null {
  const explicit = req.headers.get("x-ingest-token") || (typeof body.token === "string" ? body.token : "");
  if (explicit) return explicit.trim();

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  return token.startsWith("nst_") ? token : null;
}

async function issueToken(req: Request, body: Record<string, unknown>) {
  const userId = await authedUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const label = typeof body.label === "string" && body.label.trim()
    ? body.label.trim().slice(0, 80)
    : "Apple Health Shortcut";

  const db = adminClient();
  const { data, error } = await db
    .from("nutrition_ingest_tokens")
    .insert({
      client_id: userId,
      token_hash: tokenHash,
      source: "apple_health_shortcut",
      label,
    })
    .select("id, label, source, created_at, last_used_at, revoked_at")
    .single();

  if (error) return json({ error: error.message }, 500);

  return json({
    success: true,
    token,
    endpoint: endpointUrl(),
    shortcut_name: "Coach Nutrition Sync",
    token_record: data,
  });
}

async function listTokens(req: Request) {
  const userId = await authedUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const db = adminClient();
  const { data, error } = await db
    .from("nutrition_ingest_tokens")
    .select("id, label, source, created_at, last_used_at, revoked_at")
    .eq("client_id", userId)
    .order("created_at", { ascending: false });

  if (error) return json({ error: error.message }, 500);
  return json({ success: true, tokens: data ?? [], endpoint: endpointUrl() });
}

async function revokeToken(req: Request, body: Record<string, unknown>) {
  const userId = await authedUserId(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);
  if (typeof body.token_id !== "string") return json({ error: "token_id required" }, 400);

  const db = adminClient();
  const { error } = await db
    .from("nutrition_ingest_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", body.token_id)
    .eq("client_id", userId);

  if (error) return json({ error: error.message }, 500);
  return json({ success: true });
}

async function ingest(req: Request, body: Record<string, unknown>) {
  const ingestToken = extractIngestToken(req, body);
  if (!ingestToken) return json({ error: "Missing ingest token" }, 401);

  const tokenHash = await sha256Hex(ingestToken);
  const db = adminClient();
  const { data: tokenRow, error: tokenError } = await db
    .from("nutrition_ingest_tokens")
    .select("id, client_id, label, source")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (tokenError) return json({ error: tokenError.message }, 500);
  if (!tokenRow) return json({ error: "Invalid or revoked ingest token" }, 401);

  const inputDays = Array.isArray(body.days)
    ? body.days
    : body.day && typeof body.day === "object"
      ? [body.day]
      : body.date || body.log_date
        ? [body]
        : [];

  if (inputDays.length === 0) return json({ error: "No nutrition days supplied" }, 400);
  if (inputDays.length > 14) return json({ error: "At most 14 days can be synced per request" }, 400);

  let normalized;
  try {
    normalized = inputDays.map((day) => normalizeDay(day as NutritionDayInput));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }

  const now = new Date().toISOString();
  const rows = normalized.map((day, idx) => ({
    client_id: tokenRow.client_id,
    ...day,
    entries: [],
    source: "apple_health_shortcut",
    source_detail: tokenRow.label,
    raw_payload: inputDays[idx] ?? null,
    synced_at: now,
  }));

  const { error: upsertError } = await db
    .from("cronometer_nutrition_logs")
    .upsert(rows, { onConflict: "client_id,log_date" });

  if (upsertError) return json({ error: upsertError.message }, 500);

  await db
    .from("nutrition_ingest_tokens")
    .update({ last_used_at: now })
    .eq("id", tokenRow.id);

  const daysWithData = rows.filter((r) => Number(r.calories) > 0).length;
  return json({
    success: true,
    days_received: rows.length,
    days_with_data: daysWithData,
    from: rows[0]?.log_date,
    to: rows[rows.length - 1]?.log_date,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const action = typeof body.action === "string" ? body.action : "ingest";
    if (action === "issue_token") return await issueToken(req, body);
    if (action === "list_tokens") return await listTokens(req);
    if (action === "revoke_token") return await revokeToken(req, body);
    if (action === "ingest") return await ingest(req, body);
    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    console.error("[nutrition-ingest] error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
