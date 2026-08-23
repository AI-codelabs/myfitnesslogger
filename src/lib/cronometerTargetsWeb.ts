import { invokeFn } from "@/lib/api/fn";

export interface CronoWebStatus {
  connected: boolean;
  status?: "active" | "error" | "disabled";
  /** Always "coach" — targets are pushed from the Pro coach account. */
  mode?: "coach";
  coach_push?: boolean;
  last_push_at?: string | null;
  last_error?: string | null;
  in_sync?: boolean;
  /** Verified against Cronometer's own /targets endpoint (null = unknown). */
  verified?: boolean | null;
  remote_targets?: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null;
  app_targets?: { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null;
}

async function parseInvokeError(error: unknown): Promise<{ error?: string } | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const text = await context.text();
      const parsed = text ? JSON.parse(text) : null;
      if (!parsed) return null;
      return { error: parsed.message || parsed.error };
    } catch {
      return null;
    }
  }
  const body = (context as { body?: unknown } | null)?.body;
  if (!body) return null;
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    return { error: (parsed as any)?.message || (parsed as any)?.error };
  } catch {
    return null;
  }
}

async function invoke<T = any>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await invokeFn("cronometer", { body });
  if (error) {
    const parsed = await parseInvokeError(error);
    if (parsed?.error) return parsed;
    return { error: error.message };
  }
  if ((data as any)?.error) {
    return { error: (data as any).message || (data as any).error };
  }
  return { data: data as T };
}

export const getCronometerWebStatus = (client_id?: string) =>
  invoke<CronoWebStatus>({ action: "web_status", ...(client_id ? { client_id } : {}) });

export const pushCronometerTargets = (client_id?: string, force = false) =>
  invoke({ action: "web_push_targets", force, ...(client_id ? { client_id } : {}) });
