import type { VercelRequest, VercelResponse } from "@vercel/node";
import health from "./_routes/health.js";
import dbReport from "./_routes/admin/db-report.js";
import generateCoachMessage from "./_routes/ai/generate-coach-message.js";
import generateWeeklyReview from "./_routes/ai/generate-weekly-review.js";
import checkinsList from "./_routes/checkins/list.js";
import checkinsSubmit from "./_routes/checkins/submit.js";
import clientsDelete from "./_routes/clients/delete.js";
import checkExpirations from "./_routes/cron/check-expirations.js";
import cronometerPull from "./_routes/cron/cronometer-pull.js";
import cronometer from "./_routes/cronometer/index.js";
import sendCheckinReminders from "./_routes/email/send-checkin-reminders.js";
import sendInvite from "./_routes/email/send-invite.js";
import sendTestCheckin from "./_routes/email/send-test-checkin.js";
import oauthCallback from "./_routes/gmail/oauth-callback.js";
import oauthStart from "./_routes/gmail/oauth-start.js";
import nutritionIngest from "./_routes/nutrition/ingest.js";
import pgQuery from "./_routes/pg/query.js";
import pgRpc from "./_routes/pg/rpc.js";
import uploadUrl from "./_routes/storage/upload-url.js";
import weightDelete from "./_routes/weight/delete.js";
import weightList from "./_routes/weight/list.js";
import weightLog from "./_routes/weight/log.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  health,
  "admin/db-report": dbReport,
  "ai/generate-coach-message": generateCoachMessage,
  "ai/generate-weekly-review": generateWeeklyReview,
  "checkins/list": checkinsList,
  "checkins/submit": checkinsSubmit,
  "clients/delete": clientsDelete,
  "cron/check-expirations": checkExpirations,
  "cron/cronometer-pull": cronometerPull,
  cronometer,
  "email/send-checkin-reminders": sendCheckinReminders,
  "email/send-invite": sendInvite,
  "email/send-test-checkin": sendTestCheckin,
  "gmail/oauth-callback": oauthCallback,
  "gmail/oauth-start": oauthStart,
  "nutrition/ingest": nutritionIngest,
  "pg/query": pgQuery,
  "pg/rpc": pgRpc,
  "storage/upload-url": uploadUrl,
  "weight/delete": weightDelete,
  "weight/list": weightList,
  "weight/log": weightLog,
};

function routeKey(req: VercelRequest): string {
  const raw = req.query.path;
  if (Array.isArray(raw)) return raw.join("/");
  if (typeof raw === "string" && raw) return raw;
  const url = req.url ?? "";
  const noQuery = url.split("?")[0] ?? "";
  return noQuery.replace(/^\/api\/?/, "").replace(/\/$/, "");
}

/** Single Hobby-plan function that serves every `/api/*` route. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = routeKey(req);
  const fn = routes[key];
  if (!fn) {
    return res.status(404).json({ error: "not_found", path: key });
  }
  return fn(req, res);
}
