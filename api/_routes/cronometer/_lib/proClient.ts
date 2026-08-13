// Cronometer Pro REST client (ported from supabase/functions/cronometer/index.ts).
import type { SqlClient } from "../../../_lib/db.js";

const CRONO_BASE = "https://cronometer.com/api_v1";

export class CronoApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Cronometer API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export type LogCtx = {
  action?: string;
  coach_id?: string | null;
  client_id?: string | null;
  cronometer_client_id?: number | null;
};

export async function logApiCall(
  sql: SqlClient,
  entry: {
    ctx: LogCtx;
    endpoint: string;
    request_body: unknown;
    response_status: number | null;
    response_text: string;
    error?: string | null;
    duration_ms: number;
  },
) {
  try {
    let response_body: unknown = null;
    if (entry.response_text) {
      try {
        response_body = JSON.parse(entry.response_text);
      } catch {
        /* keep as text */
      }
    }
    await sql.query(
      `INSERT INTO public.cronometer_api_logs
        (action, endpoint, request_body, response_status, response_body, response_text, error, duration_ms, coach_id, client_id, cronometer_client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        entry.ctx.action ?? null,
        entry.endpoint,
        entry.request_body != null ? JSON.stringify(entry.request_body) : null,
        entry.response_status,
        response_body != null ? JSON.stringify(response_body) : null,
        response_body ? null : (entry.response_text || null),
        entry.error ?? null,
        entry.duration_ms,
        entry.ctx.coach_id ?? null,
        entry.ctx.client_id ?? null,
        entry.ctx.cronometer_client_id ?? null,
      ],
    );
  } catch (e) {
    console.warn("api log insert failed:", e);
  }
}

export function makeCallCrono(sql: SqlClient) {
  const PRO_TOKEN = process.env.CRONOMETER_PRO_TOKEN;
  return async function callCrono<T = unknown>(
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
      if (!res.ok) {
        errMsg = `HTTP ${res.status}`;
        throw new CronoApiError(res.status, text);
      }
      if (!text) return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } catch (e) {
      if (!errMsg) errMsg = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      await logApiCall(sql, {
        ctx,
        endpoint: path,
        request_body: body,
        response_status: status,
        response_text: text,
        error: errMsg,
        duration_ms: Date.now() - started,
      });
    }
  };
}
