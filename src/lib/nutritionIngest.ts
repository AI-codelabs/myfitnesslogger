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

type NutritionFunctionResponse = {
  error?: string;
  endpoint?: string;
  tokens?: NutritionIngestToken[];
} & Partial<NutritionIngestTokenIssue>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function functionMessage(error: unknown): string {
  const context = (error as { context?: { body?: unknown } } | null)?.context;
  const body = context?.body;
  if (body) {
    try {
      const parsed = asRecord(typeof body === "string" ? JSON.parse(body) : body);
      if (typeof parsed?.message === "string") return parsed.message;
      if (typeof parsed?.error === "string") return parsed.error;
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
  const response = data as NutritionFunctionResponse | null;
  if (response?.error) return { success: false as const, error: response.error };
  return { success: true as const, data: response as NutritionIngestTokenIssue };
}

export async function listNutritionIngestTokens() {
  const { data, error } = await supabase.functions.invoke("nutrition-ingest", {
    body: { action: "list_tokens" },
  });
  if (error) return { success: false as const, error: functionMessage(error), tokens: [] as NutritionIngestToken[] };
  const response = data as NutritionFunctionResponse | null;
  if (response?.error) return { success: false as const, error: response.error, tokens: [] as NutritionIngestToken[] };
  return {
    success: true as const,
    endpoint: response?.endpoint,
    tokens: response?.tokens ?? [],
  };
}

export async function revokeNutritionIngestToken(tokenId: string) {
  const { data, error } = await supabase.functions.invoke("nutrition-ingest", {
    body: { action: "revoke_token", token_id: tokenId },
  });
  if (error) return { success: false as const, error: functionMessage(error) };
  const response = data as NutritionFunctionResponse | null;
  if (response?.error) return { success: false as const, error: response.error };
  return { success: true as const };
}
