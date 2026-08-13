// Sends weekly check-in reminder emails via each coach's connected Gmail.
//
// Modes:
//   ?mode=sunday  → emails ALL active clients for the just-finished week
//   ?mode=monday  → emails only clients who have NOT submitted yet for that same week
//
// Triggered by cron. Protected by a shared CRON_SECRET (see isCronAuthorized).
//
// To edit the email subject / body, scroll down to TEMPLATES at the bottom.
import { HttpError, serviceEndpoint } from "../../_lib/fn.js";
import { ensureAccessToken, escapeHtml, sendGmail, userEmail, type CoachConnection } from "../../_lib/gmail.js";

type EmailTemplateRow = {
  subject: string | null;
  body: string | null;
  header_image_url: string | null;
};

function isoWeekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Sun=0 → 7
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}

function expectedCheckinWeekStart(d: Date): string {
  const isoWeekStartValue = isoWeekStart(d);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
  }).format(d);
  const nlDay = weekday === "Sun" ? 0 : 1;

  if (nlDay === 0) return isoWeekStartValue;

  const date = new Date(`${isoWeekStartValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

// =====================================================================
// TEMPLATES — edit subject + body here. NL copy. Greeting falls back
// to "Hi" when we don't have a display name.
// =====================================================================

const APP_URL = (process.env.PUBLIC_APP_URL ?? "https://my-fitness-logger.vercel.app").replace(/\/$/, "");
const CHECKIN_URL = `${APP_URL}/check-in`;

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
  // Convert plain-text body (with placeholders) into HTML paragraphs
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
  <p>Je <strong>weekly check-in</strong> staat klaar. Neem 5 minuten de tijd om je gewicht, training en gevoel van afgelopen week door te geven — zo kunnen we samen kijken wat goed ging en waar we kunnen bijsturen.</p>
  <p style="margin:28px 0;">
    <a href="${APP_URL}/weekly-checkin"
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
    <a href="${APP_URL}/weekly-checkin"
       style="display:inline-block;padding:12px 22px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
      Vul je check-in nu in
    </a>
  </p>
  <p style="font-size:13px;color:#666;">Bedankt! 🙌</p>
</body></html>`.trim(),
    };
  },
};

export default serviceEndpoint({ auth: "cron", methods: ["POST", "GET"] }, async ({ req, sql }) => {
  const modeParam = req.query.mode;
  const mode = (Array.isArray(modeParam) ? modeParam[0] : modeParam ?? "").toLowerCase();
  if (mode !== "sunday" && mode !== "monday") {
    throw new HttpError(400, "mode must be 'sunday' or 'monday'");
  }

  const connsRes = await sql.query<CoachConnection>(
    `SELECT coach_id, email, access_token, refresh_token, token_expires_at::text
       FROM public.coach_email_connections`,
  );
  const connections = connsRes.rows;

  if (!connections || connections.length === 0) {
    return { ok: true, sent: 0, note: "No coach Gmail connections" };
  }

  const weekStart = expectedCheckinWeekStart(new Date());

  let totalSent = 0;
  const errors: Array<{ coach_id: string; client_id?: string; error: string }> = [];

  for (const conn of connections) {
    try {
      const invitesRes = await sql.query<{ accepted_user_id: string }>(
        `SELECT accepted_user_id FROM public.invitations
          WHERE coach_id = $1
            AND status IN ('onboarding', 'active', 'accepted')
            AND accepted_user_id IS NOT NULL`,
        [conn.coach_id],
      );
      const clientIds = Array.from(
        new Set(
          invitesRes.rows.map((i) => i.accepted_user_id).filter(Boolean),
        ),
      );
      if (clientIds.length === 0) continue;

      let targetIds = clientIds;
      if (mode === "monday") {
        const doneRes = await sql.query<{ client_id: string }>(
          `SELECT client_id FROM public.weekly_checkins
            WHERE week_start = $1 AND client_id = ANY($2::uuid[])`,
          [weekStart, clientIds],
        );
        const done = new Set(doneRes.rows.map((r) => r.client_id));
        targetIds = clientIds.filter((id) => !done.has(id));
      }

      if (targetIds.length === 0) continue;

      const profilesRes = await sql.query<{ user_id: string; display_name: string | null }>(
        `SELECT user_id, display_name FROM public.profiles WHERE user_id = ANY($1::uuid[])`,
        [targetIds],
      );
      const nameByUser = new Map<string, string | null>(
        profilesRes.rows.map((p) => [p.user_id, p.display_name]),
      );

      const emails: Array<{ id: string; email: string; name: string | null }> = [];
      for (const id of targetIds) {
        const email = await userEmail(sql, id);
        if (email) {
          emails.push({ id, email, name: nameByUser.get(id) ?? null });
        }
      }
      if (emails.length === 0) continue;

      const accessToken = await ensureAccessToken(sql, conn);
      if (!accessToken) {
        errors.push({ coach_id: conn.coach_id, error: "token refresh failed" });
        continue;
      }

      const fromName = conn.email; // we don't store coach display name here

      const tplRes = await sql.query<EmailTemplateRow>(
        `SELECT subject, body, header_image_url
           FROM public.email_templates
          WHERE coach_id = $1 AND template_key = $2
          LIMIT 1`,
        [conn.coach_id, mode],
      );
      const customTpl = tplRes.rows[0] ?? null;

      for (const recipient of emails) {
        try {
          const tpl =
            customTpl && (customTpl.subject || customTpl.body)
              ? renderCustomTemplate(
                  {
                    subject: customTpl.subject ?? "",
                    body: customTpl.body ?? "",
                    header_image_url: customTpl.header_image_url,
                  },
                  recipient.name,
                )
              : TEMPLATES[mode](recipient.name);

          await sendGmail({
            accessToken,
            fromName,
            fromEmail: conn.email,
            to: recipient.email,
            subject: tpl.subject,
            html: tpl.html,
          });
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

  return { ok: true, mode, week_start: weekStart, sent: totalSent, errors };
});
