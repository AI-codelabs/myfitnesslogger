import { invokeFn } from "@/lib/api/fn";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";

export type CronoStatus = "pending" | "active" | "revoked" | "error";

export interface CronometerClientLink {
  id: string;
  coach_id: string;
  client_id: string;
  cronometer_client_id: number | null;
  email: string;
  name: string | null;
  status: CronoStatus;
  last_error: string | null;
  invited_at: string;
  connected_at: string | null;
  last_synced_at: string | null;
  last_synced_day: string | null;
}

async function invoke<T = any>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await invokeFn("cronometer", { body });
  if (error) {
    const ctx = (error as any).context;
    try {
      const parsed = typeof ctx?.body === "string" ? JSON.parse(ctx.body) : ctx?.body;
      return { error: parsed?.message || parsed?.error || error.message };
    } catch {
      return { error: error.message };
    }
  }
  if ((data as any)?.error) {
    return { error: (data as any).message || (data as any).error };
  }
  return { data: data as T };
}

/** Fetch the Cronometer link row for a coach's client (if any). */
export async function getCronometerLink(
  coachId: string,
  clientId: string,
): Promise<CronometerClientLink | null> {
  const { data } = await db
    .from("cronometer_clients")
    .select("*")
    .eq("coach_id", coachId)
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as CronometerClientLink) ?? null;
}

export function inviteCronometerClient(args: { client_id: string; email: string; name?: string }) {
  return invoke({ action: "invite_client", ...args });
}

/** Send a Pro invite only when the client has no pending/active link yet. */
export async function ensureCronometerInvite(args: {
  coachId: string;
  client_id: string;
  email: string;
  name?: string;
}): Promise<{ data?: { invited: boolean; skipped?: boolean }; error?: string }> {
  const existing = await getCronometerLink(args.coachId, args.client_id);
  if (existing && (existing.status === "pending" || existing.status === "active")) {
    return { data: { invited: false, skipped: true } };
  }
  const res = await inviteCronometerClient({
    client_id: args.client_id,
    email: args.email,
    name: args.name,
  });
  if (res.error) return res;
  return { data: { invited: true } };
}

export function removeCronometerClient(client_id: string) {
  return invoke({ action: "remove_client", client_id });
}

export function refreshCronometerStatus() {
  return invoke({ action: "refresh_status" });
}

export function syncCronometerClient(client_id: string, full = false) {
  return invoke<{ days_synced: number; from: string; to: string }>({
    action: "sync_client",
    client_id,
    full,
  });
}

export function getCronometerTargets(client_id: string, day?: string) {
  return invoke({ action: "get_targets", client_id, day });
}
