// Daily job: create in-app notifications 7 / 3 / 1 days before a client's
// coaching_end_date, for both the coach and the client. Idempotent per day
// via a title/body/link uniqueness check so multiple runs on the same day
// don't produce duplicates.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const WINDOWS = [7, 3, 1] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const targets = WINDOWS.map((d) => {
    const t = new Date(today);
    t.setUTCDate(t.getUTCDate() + d);
    return { days: d, iso: t.toISOString().slice(0, 10) };
  });

  const { data: invs, error } = await supabase
    .from("invitations")
    .select("id, coach_id, accepted_user_id, email, coaching_end_date, status")
    .in("status", ["active", "onboarding", "accepted"])
    .not("coaching_end_date", "is", null)
    .in("coaching_end_date", targets.map((t) => t.iso));

  if (error) {
    console.error("[check-expirations] query failed", error);
    return json({ error: error.message }, 500);
  }

  let inserted = 0;
  for (const inv of invs ?? []) {
    const window = targets.find((t) => t.iso === inv.coaching_end_date)!;
    const daysLeft = window.days;

    // Look up client display name for the coach-facing message.
    let clientName = inv.email as string;
    if (inv.accepted_user_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", inv.accepted_user_id)
        .maybeSingle();
      if (p?.display_name) clientName = p.display_name;
    }

    const suffix = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
    const link = inv.accepted_user_id ? `/clients/${inv.accepted_user_id}` : "/clients";

    const recipients: Array<{ user_id: string; title: string; body: string; link: string }> = [];
    recipients.push({
      user_id: inv.coach_id,
      title: `Coaching ends in ${suffix}`,
      body: `${clientName}'s coaching period ends on ${inv.coaching_end_date}. Reach out to renew.`,
      link,
    });
    if (inv.accepted_user_id) {
      recipients.push({
        user_id: inv.accepted_user_id,
        title: `Your coaching ends in ${suffix}`,
        body: `Your coaching period ends on ${inv.coaching_end_date}. Talk to your coach to renew.`,
        link: "/account",
      });
    }

    for (const r of recipients) {
      // Dedupe: skip if an identical notification for this user + title already exists today.
      const startOfDay = new Date(today).toISOString();
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", r.user_id)
        .eq("type", "expiration_warning")
        .eq("title", r.title)
        .gte("created_at", startOfDay)
        .limit(1);
      if (existing && existing.length > 0) continue;

      const { error: insErr } = await supabase.from("notifications").insert({
        user_id: r.user_id,
        type: "expiration_warning",
        title: r.title,
        body: r.body,
        link: r.link,
      });
      if (insErr) console.error("[check-expirations] insert failed", insErr);
      else inserted++;
    }
  }

  return json({ ok: true, checked: invs?.length ?? 0, inserted });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
