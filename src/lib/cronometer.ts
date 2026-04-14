import { supabase } from "@/integrations/supabase/client";
import type { CronometerExportData } from "@/types/cronometer";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cronometer`;

async function callCronometer(body: Record<string, unknown>): Promise<CronometerExportData> {
  const resp = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return resp.json();
}

export async function loginAndExport(
  username: string,
  password: string,
  startDate?: string,
  endDate?: string
): Promise<CronometerExportData> {
  return callCronometer({
    action: "login_and_export",
    username,
    password,
    start: startDate,
    end: endDate,
  });
}
