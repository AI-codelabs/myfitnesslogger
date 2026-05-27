// Sends an invite email via the coach's connected Gmail account using Gmail API
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

    const { recipientEmail, inviteLink, inviteToken, coachName } = await req.json();
    if (!recipientEmail || !inviteLink || !inviteToken) {
      return json({ error: "Missing recipientEmail, inviteLink or inviteToken" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: invite, error: inviteErr } = await admin
      .from("invitations")
      .select("coach_id, email")
      .eq("token", inviteToken)
      .maybeSingle();

    if (inviteErr || !invite) {
      return json({ error: "Invitation not found" }, 404);
    }

    if ((invite.email || "").toLowerCase() !== recipientEmail.toLowerCase()) {
      return json({ error: "Invitation email mismatch" }, 400);
    }

    const { data: conn, error: connErr } = await admin
      .from("coach_email_connections")
      .select("*")
      .eq("coach_id", invite.coach_id)
      .maybeSingle();

    if (connErr || !conn) {
      return json({ error: "Gmail not connected" }, 400);
    }

    // Refresh access token if expired or missing
    let accessToken = conn.access_token as string | null;
    const expired = !conn.token_expires_at || new Date(conn.token_expires_at).getTime() < Date.now() + 60_000;

    if (!accessToken || expired) {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: conn.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const refreshData = await refreshRes.json();
      if (!refreshRes.ok) {
        console.error("Refresh failed", refreshData);
        return json({ error: "Failed to refresh Google token" }, 500);
      }
      accessToken = refreshData.access_token;
      const newExpiresAt = new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString();
      await admin
        .from("coach_email_connections")
        .update({ access_token: accessToken, token_expires_at: newExpiresAt })
        .eq("coach_id", invite.coach_id);
    }

    const fromName = coachName || conn.email;
    const subject = `${fromName} invited you to join`;
    const htmlBody = `
<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222;">
  <p>Hi,</p>
  <p><strong>${escapeHtml(fromName)}</strong> has invited you to join their coaching platform.</p>
  <p>Click the link below to create your account:</p>
  <p><a href="${escapeHtml(inviteLink)}" style="display:inline-block;padding:12px 20px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;">Accept invite</a></p>
  <p style="font-size:12px;color:#666;">Or paste this URL: ${escapeHtml(inviteLink)}</p>
</body></html>`;

    // Build RFC 2822 message
    const message = [
      `From: ${fromName} <${conn.email}>`,
      `To: ${recipientEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
    ].join("\r\n");

    // Base64url encode
    const encoded = base64UrlEncode(message);

    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encoded }),
      },
    );

    const sendData = await sendRes.json();
    if (!sendRes.ok) {
      console.error("Gmail send failed", sendData);
      return json({ error: sendData.error?.message || "Send failed" }, 500);
    }

    return json({ success: true, messageId: sendData.id });
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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}

function base64UrlEncode(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
