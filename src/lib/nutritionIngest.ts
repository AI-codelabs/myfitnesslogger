import { supabase } from "@/integrations/supabase/client";

export interface NutritionIngestToken {
  id: string;
  label: string;
  source: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface NutritionIngestTokenIssue {
  token: string;
  endpoint: string;
  shortcut_name: string;
  token_record: NutritionIngestToken;
}

function functionMessage(error: unknown): string {
  const context = (error as { context?: { body?: unknown } } | null)?.context;
  const body = context?.body;
  if (body) {
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      if (parsed?.message) return parsed.message;
      if (parsed?.error) return parsed.error;
    } catch {
      // Fall through to generic message below.
    }
  }
  return (error as Error | null)?.message || "Request failed";
}

export async function issueNutritionIngestToken(label = "Apple Health Shortcut") {
  const { data, error } = await supabase.functions.invoke("nutrition-ingest", {
    body: { action: "issue_token", label },
  });
  if (error) return { success: false as const, error: functionMessage(error) };
  if ((data as any)?.error) return { success: false as const, error: (data as any).error as string };
  return { success: true as const, data: data as NutritionIngestTokenIssue };
}

export async function listNutritionIngestTokens() {
  const { data, error } = await supabase.functions.invoke("nutrition-ingest", {
    body: { action: "list_tokens" },
  });
  if (error) return { success: false as const, error: functionMessage(error), tokens: [] as NutritionIngestToken[] };
  if ((data as any)?.error) return { success: false as const, error: (data as any).error as string, tokens: [] as NutritionIngestToken[] };
  return {
    success: true as const,
    endpoint: (data as any)?.endpoint as string | undefined,
    tokens: (((data as any)?.tokens as NutritionIngestToken[] | undefined) ?? []),
  };
}

export async function revokeNutritionIngestToken(tokenId: string) {
  const { data, error } = await supabase.functions.invoke("nutrition-ingest", {
    body: { action: "revoke_token", token_id: tokenId },
  });
  if (error) return { success: false as const, error: functionMessage(error) };
  if ((data as any)?.error) return { success: false as const, error: (data as any).error as string };
  return { success: true as const };
}
