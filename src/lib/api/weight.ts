// Weight logging data access. Routes to the Neon-backed API when the "weight"
// feature is cut over, otherwise to the legacy client. Call sites stay the same.

import { supabase } from "@/integrations/supabase/client";
import { apiGet, apiPost, usesNeon } from "@/lib/dataApi";

export type WeightLogRow = {
  id: string;
  logged_on: string;
  weight_kg: number;
  note: string | null;
};

export async function listWeightLogs(
  clientId: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<WeightLogRow[]> {
  if (usesNeon("weight")) {
    return apiGet<WeightLogRow[]>("weight/list", {
      clientId,
      from: opts.from,
      to: opts.to,
      limit: opts.limit ?? 200,
    });
  }

  let q = supabase
    .from("weight_logs")
    .select("id,logged_on,weight_kg,note")
    .eq("client_id", clientId)
    .order("logged_on", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.from) q = q.gte("logged_on", opts.from);
  if (opts.to) q = q.lte("logged_on", opts.to);

  const { data, error } = await q;
  if (error) throw error;
  return (data as WeightLogRow[]) ?? [];
}

export async function upsertWeightLog(input: {
  clientId: string;
  loggedOn: string;
  weightKg: number;
  note?: string | null;
}): Promise<void> {
  if (usesNeon("weight")) {
    await apiPost("weight/log", {
      loggedOn: input.loggedOn,
      weightKg: input.weightKg,
      note: input.note ?? null,
    });
    return;
  }

  const { error } = await supabase.from("weight_logs").upsert(
    {
      client_id: input.clientId,
      logged_on: input.loggedOn,
      weight_kg: input.weightKg,
      note: input.note ?? null,
    },
    { onConflict: "client_id,logged_on" },
  );
  if (error) throw error;
}

export async function deleteWeightLog(id: string): Promise<void> {
  if (usesNeon("weight")) {
    await apiPost("weight/delete", { id });
    return;
  }
  const { error } = await supabase.from("weight_logs").delete().eq("id", id);
  if (error) throw error;
}
