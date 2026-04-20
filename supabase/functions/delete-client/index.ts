// Deletes a client's auth account (and all their data via cascade) — coach only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { clientId } = await req.json();
    if (!clientId || typeof clientId !== "string") {
      return json({ error: "Missing clientId" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify the caller is a coach AND owns an invitation linking this client
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "coach")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const { data: invite } = await admin
      .from("invitations")
      .select("id")
      .eq("coach_id", user.id)
      .eq("accepted_user_id", clientId)
      .maybeSingle();
    if (!invite) return json({ error: "Not your client" }, 403);

    // Best-effort cleanup of related data (in case no FK cascade exists)
    await admin.from("onboarding_responses").delete().eq("user_id", clientId);
    await admin.from("notifications").delete().eq("user_id", clientId);
    await admin.from("mfp_sessions").delete().eq("user_id", clientId);
    await admin.from("profiles").delete().eq("user_id", clientId);
    await admin.from("user_roles").delete().eq("user_id", clientId);
    await admin.from("invitations").delete().eq("accepted_user_id", clientId);

    // Delete the auth user
    const { error: delErr } = await admin.auth.admin.deleteUser(clientId);
    if (delErr) {
      console.error("deleteUser failed", delErr);
      return json({ error: delErr.message }, 500);
    }

    return json({ success: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
