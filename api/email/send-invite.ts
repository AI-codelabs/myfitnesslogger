// Sends an invite email via the coach's connected Gmail account using Gmail API.
import { z } from "zod";
import { HttpError, serviceEndpoint } from "../_lib/fn.js";
import {
  ensureAccessToken,
  escapeHtml,
  loadConnection,
  sendGmail,
} from "../_lib/gmail.js";

const schema = z.object({
  recipientEmail: z.string().min(1),
  inviteLink: z.string().min(1),
  inviteToken: z.string().min(1),
  coachName: z.string().optional().nullable(),
});

type InviteRow = { coach_id: string; email: string | null };

export default serviceEndpoint({ auth: "user" }, async ({ req, sql }) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new HttpError(
      400,
      "Missing recipientEmail, inviteLink or inviteToken",
    );
  }
  const { recipientEmail, inviteLink, inviteToken, coachName } = parsed.data;

  const inviteRes = await sql.query<InviteRow>(
    `SELECT coach_id, email FROM public.invitations WHERE token = $1 LIMIT 1`,
    [inviteToken],
  );
  const invite = inviteRes.rows[0];
  if (!invite) {
    throw new HttpError(404, "Invitation not found");
  }

  if ((invite.email || "").toLowerCase() !== recipientEmail.toLowerCase()) {
    throw new HttpError(400, "Invitation email mismatch");
  }

  const conn = await loadConnection(sql, invite.coach_id);
  if (!conn) {
    throw new HttpError(400, "Gmail not connected");
  }

  const accessToken = await ensureAccessToken(sql, conn);
  if (!accessToken) {
    throw new HttpError(500, "Failed to refresh Google token");
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

  let messageId: string;
  try {
    messageId = await sendGmail({
      accessToken,
      fromName,
      fromEmail: conn.email,
      to: recipientEmail,
      subject,
      html: htmlBody,
    });
  } catch (e) {
    throw new HttpError(500, (e as Error).message || "Send failed");
  }

  return { success: true, messageId };
});
