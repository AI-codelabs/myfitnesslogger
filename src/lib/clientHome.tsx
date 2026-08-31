import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, ApiError, usesNeon } from "@/lib/dataApi";
import { db } from "@/lib/db";
import { ensureAccessToken, setCachedAccessToken } from "@/lib/authToken";
import { getExpectedCheckinWeekStart } from "@/lib/weeklyCheckin";
import type { ClientGoal } from "@/lib/clientGoal";
import { complianceFromLogDates, type ComplianceStats } from "@/lib/nutritionCompliance";


function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type HomeCoachMsg = {
  voice_memo: string | null;
  client_positive: string[] | null;
  client_attention: string[] | null;
  client_actions: string[] | null;
  published_at: string | null;
  week_start?: string;
};

export type ClientHomeData = {
  profile: { first_name: string | null; display_name: string | null } | null;
  checkinSubmittedAt: string | null;
  todaySessions: { id: string; completed_at: string | null }[];
  weeklyMessage: HomeCoachMsg | null;
  startMessage: HomeCoachMsg | null;
  nutritionPlanDetails: Record<string, unknown> | null;
  nutritionToday: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  } | null;
  compliance: ComplianceStats;
  goal: ClientGoal | null;
  latestWeightKg: number | null;
  progressionCheckins: {
    week_start: string;
    weight_kg: number | null;
    body_fat_pct: number | null;
  }[];
  weekStart: string;
  today: string;
};

type BootstrapPayload = Omit<ClientHomeData, "compliance"> & {
  nutritionLogDates: string[];
};

/** Legacy (Lovable Cloud) bootstrap — same shape as the /api/home/client route. */
async function fetchLegacyBootstrap(
  uid: string,
  weekStart: string,
  today: string,
): Promise<BootstrapPayload> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString().slice(0, 10);

  const [
    profile,
    checkin,
    sessions,
    weekly,
    startMsg,
    plan,
    todayLog,
    logDates,
    goal,
    weight,
    progression,
  ] = await Promise.all([
    db.from("profiles").select("first_name, display_name").eq("user_id", uid).maybeSingle(),
    db
      .from("weekly_checkins")
      .select("submitted_at")
      .eq("client_id", uid)
      .eq("week_start", weekStart)
      .maybeSingle(),
    db.from("workout_sessions").select("id, completed_at").eq("client_id", uid).eq("scheduled_date", today),
    db
      .from("weekly_review_drafts")
      .select("voice_memo, client_positive, client_attention, client_actions, published_at, week_start")
      .eq("client_id", uid)
      .not("published_at", "is", null)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("coach_messages")
      .select("voice_memo, client_positive, client_attention, client_actions, published_at")
      .eq("client_id", uid)
      .not("published_at", "is", null)
      .limit(1)
      .maybeSingle(),
    db
      .from("nutrition_plans")
      .select("details")
      .eq("client_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("cronometer_nutrition_logs")
      .select("calories, protein_g, carbs_g, fat_g")
      .eq("client_id", uid)
      .eq("log_date", today)
      .maybeSingle(),
    db
      .from("cronometer_nutrition_logs")
      .select("log_date")
      .eq("client_id", uid)
      .gte("log_date", sinceIso),
    db
      .from("client_goals")
      .select("*")
      .eq("client_id", uid)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("weight_logs")
      .select("weight_kg")
      .eq("client_id", uid)
      .order("logged_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("weekly_checkins")
      .select("week_start, weight_kg, body_fat_pct")
      .eq("client_id", uid)
      .order("week_start", { ascending: true }),
  ]);

  return {
    profile: (profile.data as BootstrapPayload["profile"]) ?? null,
    checkinSubmittedAt: (checkin.data as { submitted_at: string | null } | null)?.submitted_at ?? null,
    todaySessions: (sessions.data ?? []) as BootstrapPayload["todaySessions"],
    weeklyMessage: (weekly.data as BootstrapPayload["weeklyMessage"]) ?? null,
    startMessage: (startMsg.data as BootstrapPayload["startMessage"]) ?? null,
    nutritionPlanDetails:
      ((plan.data as { details: Record<string, unknown> } | null)?.details as Record<string, unknown>) ?? null,
    nutritionToday: (todayLog.data as BootstrapPayload["nutritionToday"]) ?? null,
    nutritionLogDates: ((logDates.data ?? []) as { log_date: string }[]).map((r) => r.log_date),
    goal: (goal.data as ClientGoal | null) ?? null,
    latestWeightKg:
      (weight.data as { weight_kg: number } | null)?.weight_kg != null
        ? Number((weight.data as { weight_kg: number }).weight_kg)
        : null,
    progressionCheckins: (progression.data ?? []) as BootstrapPayload["progressionCheckins"],
    weekStart,
    today,
  };
}

const ClientHomeCtx = createContext<{ data: ClientHomeData | null; loading: boolean }>({
  data: null,
  loading: true,
});


export function ClientHomeProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: ReactNode;
}) {
  const [data, setData] = useState<ClientHomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const weekStart = getExpectedCheckinWeekStart();
    const today = todayKey();

    const load = async () => {
      await ensureAccessToken();
      try {
        const payload = await apiGet<BootstrapPayload>("home/client", { weekStart, today });
        if (cancelled) return;
        setData({
          ...payload,
          compliance: complianceFromLogDates(payload.nutritionLogDates ?? []),
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setCachedAccessToken(null);
          await ensureAccessToken();
          try {
            const payload = await apiGet<BootstrapPayload>("home/client", { weekStart, today });
            if (cancelled) return;
            setData({
              ...payload,
              compliance: complianceFromLogDates(payload.nutritionLogDates ?? []),
            });
            return;
          } catch (retryErr) {
            console.error("[home/client] bootstrap retry failed", retryErr);
          }
        } else {
          console.error("[home/client] bootstrap failed", err);
        }
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <ClientHomeCtx.Provider value={{ data, loading }}>{children}</ClientHomeCtx.Provider>
  );
}

export function useClientHome() {
  return useContext(ClientHomeCtx);
}
