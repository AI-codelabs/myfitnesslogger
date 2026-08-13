// Daily job: create in-app notifications 7 / 3 / 1 days before a client's
// coaching_end_date, for both the coach and the client. Idempotent per day via
// a same-day title check so repeated runs don't produce duplicates.
import { serviceEndpoint } from "../_lib/fn.js";

const WINDOWS = [7, 3, 1] as const;

type Invitation = {
  id: string;
  coach_id: string;
  accepted_user_id: string | null;
  email: string;
  coaching_end_date: string;
};

export default serviceEndpoint(
  { auth: "cron", methods: ["POST", "GET"] },
  async ({ sql }) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const targets = WINDOWS.map((days) => {
      const t = new Date(today);
      t.setUTCDate(t.getUTCDate() + days);
      return { days, iso: t.toISOString().slice(0, 10) };
    });

    const { rows: invitations } = await sql.query<Invitation>(
      `SELECT id, coach_id, accepted_user_id, email, coaching_end_date::text
         FROM public.invitations
        WHERE status IN ('active', 'onboarding', 'accepted')
          AND coaching_end_date IS NOT NULL
          AND coaching_end_date::text = ANY($1::text[])`,
      [targets.map((t) => t.iso)],
    );

    let inserted = 0;

    for (const inv of invitations) {
      const daysLeft = targets.find((t) => t.iso === inv.coaching_end_date)!.days;

      let clientName = inv.email;
      if (inv.accepted_user_id) {
        const p = await sql.query<{ display_name: string | null }>(
          `SELECT display_name FROM public.profiles WHERE user_id = $1 LIMIT 1`,
          [inv.accepted_user_id],
        );
        if (p.rows[0]?.display_name) clientName = p.rows[0].display_name;
      }

      const suffix = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
      const link = inv.accepted_user_id
        ? `/clients/${inv.accepted_user_id}`
        : "/clients";

      const recipients = [
        {
          user_id: inv.coach_id,
          title: `Coaching ends in ${suffix}`,
          body: `${clientName}'s coaching period ends on ${inv.coaching_end_date}. Reach out to renew.`,
          link,
        },
      ];
      if (inv.accepted_user_id) {
        recipients.push({
          user_id: inv.accepted_user_id,
          title: `Your coaching ends in ${suffix}`,
          body: `Your coaching period ends on ${inv.coaching_end_date}. Talk to your coach to renew.`,
          link: "/account",
        });
      }

      for (const r of recipients) {
        const existing = await sql.query<{ id: string }>(
          `SELECT id FROM public.notifications
            WHERE user_id = $1 AND type = 'expiration_warning' AND title = $2
              AND created_at >= $3::timestamptz
            LIMIT 1`,
          [r.user_id, r.title, today.toISOString()],
        );
        if (existing.rows.length > 0) continue;

        await sql.query(
          `INSERT INTO public.notifications (user_id, type, title, body, link)
           VALUES ($1, 'expiration_warning', $2, $3, $4)`,
          [r.user_id, r.title, r.body, r.link],
        );
        inserted++;
      }
    }

    return { ok: true, checked: invitations.length, inserted };
  },
);
