import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatWeekStart, getWeekStart } from "./weeklyCheckin";

export type DashCheckin = {
  id: string;
  client_id: string;
  week_start: string;
  submitted_at: string;
  feeling: number | null;
  energy: number | null;
  progression: number | null;
  nutrition_stars: number | null;
  supplements_consistency: number | null;
  weight_kg: number | null;
  obstacles: string | null;
  progress_feeling: string | null;
  cravings: string | null;
  other_notes: string | null;
};

export type DashClient = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  invitation_status: string;
  accepted_at: string | null;
  primary_goal: string | null;
  onboarding_completed: boolean;
  coaching_start_date: string | null;
  coaching_end_date: string | null;
};

export type DashMessage = {
  client_id: string;
  published_at: string | null;
  generated_at: string | null;
};

export type DashReview = {
  client_id: string;
  week_start: string;
  published_at: string | null;
};

export type PendingInvite = {
  id: string;
  email: string;
  created_at: string;
};

export type DashboardData = {
  clients: DashClient[];
  checkins: DashCheckin[]; // last ~8 weeks across all clients
  messages: DashMessage[];
  reviews: DashReview[];
  pendingInvites: PendingInvite[];
  weekStart: string;
};

export function useCoachDashboardData(coachId: string | undefined) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!coachId) return;
    setLoading(true);
    const weekStart = formatWeekStart();

    const { data: invs } = await supabase
      .from("invitations")
      .select("id, email, status, accepted_user_id, accepted_at, created_at")
      .eq("coach_id", coachId);

    const accepted = (invs ?? []).filter(
      (i: any) =>
        i.accepted_user_id &&
        ["onboarding", "active", "accepted", "inactive"].includes(i.status),
    );
    const pendingInvites: PendingInvite[] = (invs ?? [])
      .filter((i: any) => i.status === "pending")
      .map((i: any) => ({ id: i.id, email: i.email, created_at: i.created_at }));

    const clientIds = accepted.map((i: any) => i.accepted_user_id);

    if (clientIds.length === 0) {
      setData({
        clients: [],
        checkins: [],
        messages: [],
        reviews: [],
        pendingInvites,
        weekStart,
      });
      setLoading(false);
      return;
    }

    // Lookback 8 weeks for risk + activity
    const lookback = new Date();
    lookback.setDate(lookback.getDate() - 7 * 8);
    const lookbackIso = lookback.toISOString().slice(0, 10);

    const [profilesRes, onboardingRes, checkinsRes, msgsRes, reviewsRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", clientIds),
        supabase
          .from("onboarding_responses")
          .select("user_id, completed_at, primary_goal")
          .in("user_id", clientIds),
        supabase
          .from("weekly_checkins")
          .select(
            "id, client_id, week_start, submitted_at, feeling, energy, progression, nutrition_stars, supplements_consistency, weight_kg, obstacles, progress_feeling, cravings, other_notes",
          )
          .in("client_id", clientIds)
          .gte("week_start", lookbackIso)
          .order("week_start", { ascending: false }),
        supabase
          .from("coach_messages")
          .select("client_id, published_at, generated_at")
          .eq("coach_id", coachId)
          .in("client_id", clientIds),
        supabase
          .from("weekly_review_drafts")
          .select("client_id, week_start, published_at")
          .eq("coach_id", coachId)
          .in("client_id", clientIds),
      ]);

    const profiles = (profilesRes.data ?? []) as any[];
    const onboarding = (onboardingRes.data ?? []) as any[];

    const clients: DashClient[] = accepted.map((inv: any) => {
      const p = profiles.find((x) => x.user_id === inv.accepted_user_id);
      const ob = onboarding.find((x) => x.user_id === inv.accepted_user_id);
      return {
        user_id: inv.accepted_user_id,
        display_name: p?.display_name ?? null,
        email: inv.email,
        invitation_status: inv.status,
        accepted_at: inv.accepted_at,
        primary_goal: ob?.primary_goal ?? null,
        onboarding_completed: !!ob?.completed_at,
      };
    });

    setData({
      clients,
      checkins: (checkinsRes.data ?? []) as DashCheckin[],
      messages: (msgsRes.data ?? []) as DashMessage[],
      reviews: (reviewsRes.data ?? []) as DashReview[],
      pendingInvites,
      weekStart,
    });
    setLoading(false);
  }, [coachId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}

/* ---------- Risk detection ---------- */

export type RiskType =
  | "negative_tone"
  | "low_motivation"
  | "poor_compliance"
  | "goal_mismatch"
  | "missed_streak";

export type Risk = {
  type: RiskType;
  reason: string;
  severity: 1 | 2 | 3; // 3 = highest
};

export type ClientRisk = {
  client: DashClient;
  risks: Risk[];
  topSeverity: number;
};

const NEGATIVE_KEYWORDS = [
  // NL
  "moeilijk", "zwaar", "opgeven", "gestopt", "stress", "demotivatie",
  "demotiveerd", "niet meer", "geen zin", "kan niet", "lastig", "balen",
  "frustrer", "uitgeput", "moe", "verdrietig", "down", "slecht",
  // EN
  "struggling", "gave up", "give up", "demotivated", "frustrated",
  "cant", "can't", "exhausted", "tired", "depressed", "sad", "stressed",
  "hard", "difficult", "quit", "burnt out", "burned out",
];

function scanNegative(...texts: Array<string | null | undefined>): string | null {
  for (const t of texts) {
    if (!t) continue;
    const lower = t.toLowerCase();
    for (const kw of NEGATIVE_KEYWORDS) {
      if (lower.includes(kw)) return kw;
    }
  }
  return null;
}

function isLossGoal(goal: string | null): boolean {
  if (!goal) return false;
  return /cut|lose|loss|afval|vet/i.test(goal);
}
function isGainGoal(goal: string | null): boolean {
  if (!goal) return false;
  return /muscle|gain|bulk|spier|massa/i.test(goal);
}

export function detectRisksForClient(
  client: DashClient,
  clientCheckins: DashCheckin[],
  weekStart: string,
): Risk[] {
  const risks: Risk[] = [];
  // Newest first by week_start
  const sorted = [...clientCheckins].sort((a, b) =>
    b.week_start.localeCompare(a.week_start),
  );
  const latest = sorted[0];
  const prev = sorted[1];

  if (latest) {
    // Negative tone
    const kw = scanNegative(
      latest.obstacles,
      latest.progress_feeling,
      latest.cravings,
      latest.other_notes,
    );
    if (kw) {
      risks.push({
        type: "negative_tone",
        reason: `Negatieve toon in check-in ("${kw}")`,
        severity: 3,
      });
    }

    // Low motivation / energy
    const lowItems: string[] = [];
    if (latest.feeling != null && latest.feeling <= 2) lowItems.push("gevoel");
    if (latest.energy != null && latest.energy <= 2) lowItems.push("energie");
    if (latest.progression != null && latest.progression <= 2)
      lowItems.push("progressie");
    if (lowItems.length > 0) {
      risks.push({
        type: "low_motivation",
        reason: `Lage score op ${lowItems.join(", ")}`,
        severity: 2,
      });
    }

    // Compliance
    const compItems: string[] = [];
    if (latest.nutrition_stars != null && latest.nutrition_stars <= 2)
      compItems.push("voeding");
    if (
      latest.supplements_consistency != null &&
      latest.supplements_consistency <= 2
    )
      compItems.push("supplementen");
    if (compItems.length > 0) {
      risks.push({
        type: "poor_compliance",
        reason: `Lage compliance: ${compItems.join(", ")}`,
        severity: 2,
      });
    }

    // Goal mismatch (weight direction vs goal)
    if (
      prev &&
      latest.weight_kg != null &&
      prev.weight_kg != null &&
      client.primary_goal
    ) {
      const delta = Number(latest.weight_kg) - Number(prev.weight_kg);
      if (Math.abs(delta) >= 0.4) {
        if (delta > 0 && isLossGoal(client.primary_goal)) {
          risks.push({
            type: "goal_mismatch",
            reason: `Gewicht ↑ ${delta.toFixed(1)} kg terwijl doel afvallen is`,
            severity: 2,
          });
        } else if (delta < 0 && isGainGoal(client.primary_goal)) {
          risks.push({
            type: "goal_mismatch",
            reason: `Gewicht ↓ ${Math.abs(delta).toFixed(1)} kg terwijl doel spiergroei is`,
            severity: 2,
          });
        }
      }
    }
  }

  // Missed streak: count consecutive recent weeks with no checkin
  const submittedWeeks = new Set(sorted.map((c) => c.week_start));
  let missed = 0;
  const cur = getWeekStart();
  // Start from previous week to count "missed" (current week may still be in progress)
  cur.setDate(cur.getDate() - 7);
  for (let i = 0; i < 4; i++) {
    const ws = cur.toISOString().slice(0, 10);
    if (!submittedWeeks.has(ws)) missed++;
    else break;
    cur.setDate(cur.getDate() - 7);
  }
  if (missed >= 2 && client.onboarding_completed) {
    risks.push({
      type: "missed_streak",
      reason: `${missed} weken geen check-in`,
      severity: missed >= 3 ? 3 : 2,
    });
  }

  return risks;
}

export function detectAllRisks(data: DashboardData): ClientRisk[] {
  const result: ClientRisk[] = [];
  for (const client of data.clients) {
    if (!client.onboarding_completed) continue;
    const cc = data.checkins.filter((c) => c.client_id === client.user_id);
    const risks = detectRisksForClient(client, cc, data.weekStart);
    if (risks.length > 0) {
      const topSeverity = Math.max(...risks.map((r) => r.severity));
      result.push({ client, risks, topSeverity });
    }
  }
  result.sort((a, b) => b.topSeverity - a.topSeverity);
  return result;
}
