// Sends a single test check-in reminder email to a chosen address,
// using the calling coach's connected Gmail and (if present) their saved template.
import { z } from "zod";
import { HttpError, serviceEndpoint } from "../_lib/fn.js";
import { ensureAccessToken, escapeHtml, loadConnection, sendGmail } from "../_lib/gmail.js";

const schema = z.object({
  mode: z.string(),
  recipientEmail: z.string(),
  recipientName: z.string().optional().nullable(),
});

type EmailTemplateRow = {
  subject: string | null;
  body: string | null;
  header_image_url: string | null;
};

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

export default serviceEndpoint({ auth: "user" }, async ({ req, sql, user }) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mode = String(body.mode ?? "").toLowerCase();
  const recipientEmail = String(body.recipientEmail ?? "").trim();
  const recipientName =
    typeof body.recipientName === "string" && body.recipientName.trim()
      ? body.recipientName.trim()
      : null;

  const parsed = schema.safeParse({ mode, recipientEmail, recipientName });
  if (!parsed.success) {
    throw new HttpError(400, "Invalid request body");
  }

  if (mode !== "sunday" && mode !== "monday") {
    throw new HttpError(400, "mode must be 'sunday' or 'monday'");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new HttpError(400, "Invalid recipient email");
  }

  const conn = await loadConnection(sql, user!.id);
  if (!conn) {
    throw new HttpError(400, "Connect your Gmail first.");
  }

  const accessToken = await ensureAccessToken(sql, conn);
  if (!accessToken) {
    throw new HttpError(400, "Gmail token refresh failed. Please reconnect Gmail.");
  }

  const tplRes = await sql.query<EmailTemplateRow>(
    `SELECT subject, body, header_image_url
       FROM public.email_templates
      WHERE coach_id = $1 AND template_key = $2
      LIMIT 1`,
    [conn.coach_id, mode],
  );
  const customTpl = tplRes.rows[0] ?? null;

  const tpl =
    customTpl && (customTpl.subject || customTpl.body)
      ? renderCustomTemplate(
          {
            subject: customTpl.subject ?? "",
            body: customTpl.body ?? "",
            header_image_url: customTpl.header_image_url,
          },
          recipientName,
        )
      : TEMPLATES[mode as "sunday" | "monday"](recipientName);

  const subjectPrefixed = `[TEST] ${tpl.subject}`;

  try {
    await sendGmail({
      accessToken,
      fromName: conn.email,
      fromEmail: conn.email,
      to: recipientEmail,
      subject: subjectPrefixed,
      html: tpl.html,
    });
  } catch (e) {
    throw new HttpError(500, (e as Error).message);
  }

  return { ok: true, sent_to: recipientEmail };
});
