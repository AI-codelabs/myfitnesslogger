// Handles Google's redirect: exchanges code for tokens, stores connection, redirects back
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const packedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Decode state
  let stateValue = "";
  let returnTo = "";
  try {
    const decoded = JSON.parse(atob(packedState || ""));
    stateValue = decoded.s;
    returnTo = decoded.r || "";
  } catch {
    return htmlRedirect(returnTo, "invalid_state");
  }

  if (error) return htmlRedirect(returnTo, error);
  if (!code || !stateValue) return htmlRedirect(returnTo, "missing_code");

  // Validate & consume state
  const { data: stateRow, error: stateErr } = await admin
    .from("oauth_states")
    .select("coach_id, created_at")
    .eq("state", stateValue)
    .maybeSingle();

  if (stateErr || !stateRow) return htmlRedirect(returnTo, "invalid_state");

  // Expire after 10 min
  const ageMs = Date.now() - new Date(stateRow.created_at).getTime();
  if (ageMs > 10 * 60 * 1000) {
    await admin.from("oauth_states").delete().eq("state", stateValue);
    return htmlRedirect(returnTo, "state_expired");
  }

  await admin.from("oauth_states").delete().eq("state", stateValue);

  const redirectUri = `${supabaseUrl}/functions/v1/gmail-oauth-callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.refresh_token) {
    console.error("Token exchange failed", tokenData);
    return htmlRedirect(returnTo, "token_exchange_failed");
  }

  // Fetch user email
  const userInfoRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
  );
  const userInfo = await userInfoRes.json();
  if (!userInfoRes.ok || !userInfo.email) {
    return htmlRedirect(returnTo, "userinfo_failed");
  }

  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

  // Upsert connection
  const { error: upsertErr } = await admin
    .from("coach_email_connections")
    .upsert({
      coach_id: stateRow.coach_id,
      email: userInfo.email,
      refresh_token: tokenData.refresh_token,
      access_token: tokenData.access_token,
      token_expires_at: expiresAt,
      scope: tokenData.scope,
    }, { onConflict: "coach_id" });

  if (upsertErr) {
    console.error("Upsert failed", upsertErr);
    return htmlRedirect(returnTo, "save_failed");
  }

  return htmlRedirect(returnTo, null);
});

function htmlRedirect(returnTo: string, errorCode: string | null) {
  const safe = returnTo && /^https?:\/\//.test(returnTo) ? returnTo : "/";
  const target = errorCode
    ? `${safe}${safe.includes("?") ? "&" : "?"}gmail_error=${encodeURIComponent(errorCode)}`
    : `${safe}${safe.includes("?") ? "&" : "?"}gmail_connected=1`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting…</title>
<meta http-equiv="refresh" content="0;url=${target}">
</head><body style="font-family:system-ui;padding:40px;text-align:center;">
<p>Redirecting back to your app…</p>
<p><a href="${target}">Click here if you're not redirected automatically</a></p>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
