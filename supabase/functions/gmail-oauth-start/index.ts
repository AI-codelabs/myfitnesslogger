// Initiates Gmail OAuth: generates state, stores it, returns Google consent URL
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

    // Verify caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const returnTo: string = body.returnTo || "";

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    if (!clientId) return json({ error: "Google OAuth not configured" }, 500);

    // Store state with returnTo so callback can redirect back to the app
    const state = crypto.randomUUID();
    const admin = createClient(supabaseUrl, serviceKey);
    const { error: stateErr } = await admin.from("oauth_states").insert({
      state,
      coach_id: user.id,
    });
    if (stateErr) return json({ error: stateErr.message }, 500);

    // Build redirect_uri pointing at our callback function
    const redirectUri = `${supabaseUrl}/functions/v1/gmail-oauth-callback`;

    // Encode returnTo into state by storing it separately — use a simple approach:
    // pack as "<state>|<returnTo>" base64
    const packedState = btoa(JSON.stringify({ s: state, r: returnTo }));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
      access_type: "offline",
      prompt: "consent",
      state: packedState,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return json({ url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
