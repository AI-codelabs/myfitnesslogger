import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet } from "@/lib/dataApi";
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
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    const weekStart = getExpectedCheckinWeekStart();
    const today = todayKey();
    void apiGet<BootstrapPayload>("home/client", { weekStart, today })
      .then((payload) => {
        if (cancelled) return;
        setData({
          ...payload,
          compliance: complianceFromLogDates(payload.nutritionLogDates ?? []),
        });
      })
      .catch((err) => {
        console.error("[home/client] bootstrap failed", err);
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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
