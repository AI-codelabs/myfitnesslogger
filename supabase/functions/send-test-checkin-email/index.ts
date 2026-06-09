// Sends a single test check-in reminder email to a chosen address,
// using the calling coach's connected Gmail and (if present) their saved template.

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
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const mode = (body.mode || "").toLowerCase();
    const recipientEmail = (body.recipientEmail || "").trim();
    const recipientName = body.recipientName?.trim() || null;

    if (mode !== "sunday" && mode !== "monday") {
      return json({ error: "mode must be 'sunday' or 'monday'" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return json({ error: "Invalid recipient email" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: conn, error: connErr } = await admin
      .from("coach_email_connections")
      .select("coach_id, email, access_token, refresh_token, token_expires_at")
      .eq("coach_id", user.id)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!conn) return json({ error: "Connect your Gmail first." }, 400);

    const accessToken = await ensureAccessToken(admin, conn, clientId, clientSecret);
    if (!accessToken) {
      return json({ error: "Gmail token refresh failed. Please reconnect Gmail." }, 400);
    }

    const { data: customTpl } = await admin
      .from("email_templates")
      .select("subject, body, header_image_url")
      .eq("coach_id", conn.coach_id)
      .eq("template_key", mode)
      .maybeSingle();

    const tpl = customTpl && (customTpl.subject || customTpl.body)
      ? renderCustomTemplate(customTpl, recipientName)
      : TEMPLATES[mode as "sunday" | "monday"](recipientName);

    const subjectPrefixed = `[TEST] ${tpl.subject}`;
    const message = [
      `From: ${conn.email} <${conn.email}>`,
      `To: ${recipientEmail}`,
      `Subject: ${subjectPrefixed}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      tpl.html,
    ].join("\r\n");

    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: base64UrlEncode(message) }),
      },
    );
    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      return json({ error: `Gmail ${sendRes.status}: ${errBody.slice(0, 300)}` }, 500);
    }

    return json({ ok: true, sent_to: recipientEmail });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

async function ensureAccessToken(
  admin: any,
  conn: any,
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const expired =
    !conn.access_token ||
    !conn.token_expires_at ||
    new Date(conn.token_expires_at).getTime() < Date.now() + 60_000;
  if (!expired) return conn.access_token;

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
  const data = await refreshRes.json();
  if (!refreshRes.ok) {
    console.error("Refresh failed", data);
    return null;
  }
  const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  await admin
    .from("coach_email_connections")
    .update({ access_token: data.access_token, token_expires_at: newExpiresAt })
    .eq("coach_id", conn.coach_id);
  return data.access_token as string;
}

function base64UrlEncode(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CHECKIN_URL = "https://myfitnesslogger.lovable.app/check-in";

function renderCustomTemplate(
  tpl: { subject: string; body: string; header_image_url: string | null },
  name: string | null,
): { subject: string; html: string } {
  const safeName = name ? escapeHtml(name) : "";
  const replacePlaceholders = (s: string) =>
    (s ?? "")
      .replaceAll("{{name}}", safeName || "there")
      .replaceAll("{{checkin_url}}", CHECKIN_URL);

  const subject = replacePlaceholders(tpl.subject || "Weekly check-in");
  const bodyText = replacePlaceholders(tpl.body || "");
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p).replaceAll("\n", "<br/>")}</p>`)
    .join("");

  const headerImg = tpl.header_image_url
    ? `<div style="text-align:center;margin-bottom:20px;"><img src="${tpl.header_image_url}" alt="" style="max-width:100%;height:auto;border-radius:8px;" /></div>`
    : "";

  const cta = `<p style="margin:28px 0;"><a href="${CHECKIN_URL}" style="display:inline-block;padding:12px 22px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Vul je check-in in</a></p>`;

  const html = `
<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:560px;margin:0 auto;padding:24px;">
  ${headerImg}
  ${paragraphs}
  ${cta}
</body></html>`.trim();

  return { subject, html };
}

type TemplateFn = (name: string | null) => { subject: string; html: string };

const TEMPLATES: Record<"sunday" | "monday", TemplateFn> = {
  sunday: (name) => {
    const greeting = name ? `Hi ${escapeHtml(name)}` : "Hi";
    return {
      subject: "Je weekly check-in staat klaar 📋",
      html: `
<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:560px;margin:0 auto;padding:24px;">
  <p>${greeting},</p>
  <p>Je <strong>weekly check-in</strong> staat klaar. Neem 5 minuten de tijd om je gewicht, training en gevoel van afgelopen week door te geven.</p>
  <p style="margin:28px 0;">
    <a href="${CHECKIN_URL}" style="display:inline-block;padding:12px 22px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Vul je check-in in</a>
  </p>
</body></html>`.trim(),
    };
  },
  monday: (name) => {
    const greeting = name ? `Hi ${escapeHtml(name)}` : "Hi";
    return {
      subject: "Reminder: vergeet je weekly check-in niet ⏰",
      html: `
<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:560px;margin:0 auto;padding:24px;">
  <p>${greeting},</p>
  <p>Kleine herinnering — je hebt je <strong>weekly check-in</strong> van afgelopen week nog niet ingevuld.</p>
  <p style="margin:28px 0;">
    <a href="${CHECKIN_URL}" style="display:inline-block;padding:12px 22px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Vul je check-in nu in</a>
  </p>
</body></html>`.trim(),
    };
  },
};
