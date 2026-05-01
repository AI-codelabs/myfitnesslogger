// Sends weekly check-in reminder emails via each coach's connected Gmail.
//
// Modes:
//   ?mode=sunday  → emails ALL active clients ("your check-in is ready")
//   ?mode=monday  → emails only clients who have NOT submitted yet for this week
//
// Triggered by pg_cron. Deployed with verify_jwt = false so cron can hit it
// without a user session — protected by a shared CRON_SECRET.
//
// To edit the email subject / body, scroll down to TEMPLATES at the bottom.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") || "").toLowerCase();
    if (mode !== "sunday" && mode !== "monday") {
      return json({ error: "mode must be 'sunday' or 'monday'" }, 400);
    }

    // Optional shared-secret protection (cron sets this header)
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (cronSecret) {
      const provided = req.headers.get("x-cron-secret");
      if (provided !== cronSecret) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. All coaches that have a Gmail connection
    const { data: connections, error: connErr } = await admin
      .from("coach_email_connections")
      .select("coach_id, email, access_token, refresh_token, token_expires_at");
    if (connErr) throw connErr;

    if (!connections || connections.length === 0) {
      return json({ ok: true, sent: 0, note: "No coach Gmail connections" });
    }

    const weekStart = isoWeekStart(new Date()); // Monday of current ISO week

    let totalSent = 0;
    const errors: Array<{ coach_id: string; client_id?: string; error: string }> = [];

    for (const conn of connections) {
      try {
        // 2. Active clients for this coach
        const { data: invites, error: invErr } = await admin
          .from("invitations")
          .select("accepted_user_id")
          .eq("coach_id", conn.coach_id)
          .in("status", ["onboarding", "active", "accepted"])
          .not("accepted_user_id", "is", null);
        if (invErr) throw invErr;

        const clientIds = Array.from(
          new Set((invites ?? []).map((i: any) => i.accepted_user_id).filter(Boolean)),
        ) as string[];
        if (clientIds.length === 0) continue;

        // 3. Filter to those WITHOUT a check-in for this week (Monday only)
        let targetIds = clientIds;
        if (mode === "monday") {
          const { data: doneRows, error: doneErr } = await admin
            .from("weekly_checkins")
            .select("client_id")
            .eq("week_start", weekStart)
            .in("client_id", clientIds);
          if (doneErr) throw doneErr;
          const done = new Set((doneRows ?? []).map((r: any) => r.client_id));
          targetIds = clientIds.filter((id) => !done.has(id));
        }

        if (targetIds.length === 0) continue;

        // 4. Resolve email + display name for each client
        const { data: profiles } = await admin
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", targetIds);
        const nameByUser = new Map<string, string>(
          (profiles ?? []).map((p: any) => [p.user_id, p.display_name]),
        );

        // Need email addresses — read from auth.users via admin API
        const emails: Array<{ id: string; email: string; name: string | null }> = [];
        for (const id of targetIds) {
          const { data: u } = await admin.auth.admin.getUserById(id);
          if (u?.user?.email) {
            emails.push({
              id,
              email: u.user.email,
              name: nameByUser.get(id) ?? null,
            });
          }
        }
        if (emails.length === 0) continue;

        // 5. Refresh access token for this coach if needed
        const accessToken = await ensureAccessToken(admin, conn, clientId, clientSecret);
        if (!accessToken) {
          errors.push({ coach_id: conn.coach_id, error: "token refresh failed" });
          continue;
        }

        const fromName = conn.email; // we don't store coach display name here

        // 6. Send each email
        for (const recipient of emails) {
          try {
            const tpl = TEMPLATES[mode](recipient.name);
            const message = [
              `From: ${fromName} <${conn.email}>`,
              `To: ${recipient.email}`,
              `Subject: ${tpl.subject}`,
              `MIME-Version: 1.0`,
              `Content-Type: text/html; charset=UTF-8`,
              ``,
              tpl.html,
            ].join("\r\n");

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
            if (!sendRes.ok) {
              const errBody = await sendRes.text();
              errors.push({
                coach_id: conn.coach_id,
                client_id: recipient.id,
                error: `gmail ${sendRes.status}: ${errBody.slice(0, 200)}`,
              });
              continue;
            }
            totalSent++;
          } catch (e) {
            errors.push({
              coach_id: conn.coach_id,
              client_id: recipient.id,
              error: (e as Error).message,
            });
          }
        }
      } catch (e) {
        errors.push({ coach_id: conn.coach_id, error: (e as Error).message });
      }
    }

    return json({ ok: true, mode, week_start: weekStart, sent: totalSent, errors });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ---------- helpers ----------

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

function isoWeekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Sun=0 → 7
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
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

// =====================================================================
// TEMPLATES — edit subject + body here. NL copy. Greeting falls back
// to "Hi" when we don't have a display name.
// =====================================================================

type TemplateFn = (name: string | null) => { subject: string; html: string };

const TEMPLATES: Record<"sunday" | "monday", TemplateFn> = {
  sunday: (name) => {
    const greeting = name ? `Hi ${escapeHtml(name)}` : "Hi";
    return {
      subject: "Je weekly check-in staat klaar 📋",
      html: `
<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:560px;margin:0 auto;padding:24px;">
  <p>${greeting},</p>
  <p>Je <strong>weekly check-in</strong> staat klaar. Neem 5 minuten de tijd om je gewicht, training en gevoel van afgelopen week door te geven — zo kunnen we samen kijken wat goed ging en waar we kunnen bijsturen.</p>
  <p style="margin:28px 0;">
    <a href="https://myfitnesslogger.lovable.app/weekly-checkin"
       style="display:inline-block;padding:12px 22px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
      Vul je check-in in
    </a>
  </p>
  <p style="font-size:13px;color:#666;">Het kost je echt maar een paar minuten 💪</p>
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
  <p>Kleine herinnering — je hebt je <strong>weekly check-in</strong> van afgelopen week nog niet ingevuld. Het kost je maar een paar minuten en het helpt me enorm om je optimaal te begeleiden.</p>
  <p style="margin:28px 0;">
    <a href="https://myfitnesslogger.lovable.app/weekly-checkin"
       style="display:inline-block;padding:12px 22px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
      Vul je check-in nu in
    </a>
  </p>
  <p style="font-size:13px;color:#666;">Bedankt! 🙌</p>
</body></html>`.trim(),
    };
  },
};
