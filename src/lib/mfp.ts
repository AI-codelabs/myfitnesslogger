import { supabase } from "@/integrations/supabase/client";

export async function saveMfpSession(userId: string, cookies: string, mfpUsername?: string) {
  const { error } = await supabase
    .from("mfp_sessions")
    .upsert({
      user_id: userId,
      cookies,
      mfp_username: mfpUsername || null,
    }, { onConflict: "user_id" });
  return { error };
}

export async function getMfpSession(userId: string) {
  const { data, error } = await supabase
    .from("mfp_sessions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return { data, error };
}

export async function deleteMfpSession(userId: string) {
  const { error } = await supabase
    .from("mfp_sessions")
    .delete()
    .eq("user_id", userId);
  return { error };
}

export async function loginToMfp(email: string, password: string) {
  const res = await fetch("/api/mfp/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function fetchFoodLog(cookies: string, date?: string) {
  const res = await fetch("/api/mfp/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cookies, date }),
  });
  return res.json();
}
