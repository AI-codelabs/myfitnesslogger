import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Plug, AlertTriangle } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { CronometerConnectDialog } from "@/components/CronometerConnectDialog";
import { NutritionWeeklyOverview } from "@/components/NutritionWeeklyOverview";
import { hasCronometerSession, syncCronometer } from "@/lib/cronometer";
import { toast } from "sonner";



interface NutritionLog {
  id: string;
  log_date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  synced_at: string;
}

const ClientNutrition = () => {
  const { user } = useAuth();
  const [lang] = useState<Lang>(() => (localStorage.getItem("onbLang") as Lang) || "nl");
  const [loading, setLoading] = useState(true);
  const [nutrition, setNutrition] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reauth, setReauth] = useState(false);
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);

  const [syncTargets, setSyncTargets] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [planRes, sessionRes, logsRes] = await Promise.all([
      supabase.from("nutrition_plans").select("*").eq("client_id", user.id).maybeSingle(),
      supabase
        .from("cronometer_sessions")
        .select("id, target_sync_enabled")
        .eq("client_id", user.id)
        .maybeSingle(),
      supabase
        .from("cronometer_nutrition_logs")
        .select("id, log_date, calories, protein_g, carbs_g, fat_g, fiber_g, synced_at")
        .eq("client_id", user.id)
        .order("log_date", { ascending: false })
        .limit(14),
    ]);
    setNutrition(planRes.data);
    setConnected(!!sessionRes.data);
    setSyncTargets(!!(sessionRes.data as any)?.target_sync_enabled);
    setLogs((logsRes.data as NutritionLog[]) || []);
    setLoading(false);
  }, [user?.id]);

  const toggleSyncTargets = async (next: boolean) => {
    if (!user?.id) return;
    setSyncTargets(next);
    const { error } = await supabase
      .from("cronometer_sessions")
      .update({ target_sync_enabled: next })
      .eq("client_id", user.id);
    if (error) {
      setSyncTargets(!next);
      toast.error(error.message);
    } else {
      toast.success(
        next
          ? t("Coach mag macro-doelen synchroniseren", "Coach can sync macro targets")
          : t("Synchronisatie uitgeschakeld", "Sync disabled"),
      );
    }
  };

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSync = async () => {
    setSyncing(true);
    const res = await syncCronometer();
    setSyncing(false);
    if (res.sessionExpired) {
      setReauth(true);
      return;
    }
    if (!res.success) {
      if (res.error === "no_session") {
        setConnectOpen(true);
      } else {
        toast.error(res.error || t("Synchroniseren mislukt", "Sync failed"));
      }
      return;
    }
    if (res.upToDate) {
      toast.success(t("Al up-to-date!", "Already up to date!"));
    } else {
      toast.success(
        t(
          `Gesynchroniseerd: ${res.daysSynced} dag(en)`,
          `Synced ${res.daysSynced} day(s)`,
        ),
      );
    }
    await loadAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("Voeding", "Nutrition")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Het voedingsschema dat je coach voor je heeft samengesteld.",
            "The nutrition plan your coach has set up for you.",
          )}
        </p>
      </div>

      {/* Cronometer connection card */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${connected ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
              <Plug className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">
                {t("Cronometer", "Cronometer")}{" "}
                <span className={`ml-1 text-xs ${connected ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {connected ? t("verbonden", "connected") : t("niet verbonden", "not connected")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connected
                  ? t(
                      "Klik op Log om nieuwe dagen te synchroniseren.",
                      "Click Log to sync new days.",
                    )
                  : t(
                      "Verbind om je voedingsdata bij te houden.",
                      "Connect to track your nutrition data.",
                    )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {connected ? (
              <Button onClick={handleSync} disabled={syncing} className="flex-1 sm:flex-none">
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t("Log", "Log")}
              </Button>
            ) : (
              <Button onClick={() => setConnectOpen(true)} className="flex-1 sm:flex-none">
                <Plug className="h-4 w-4 mr-2" />
                {t("Verbinden", "Connect")}
              </Button>
            )}
          </div>
        </div>

      {/* Weekly overview */}
      <NutritionWeeklyOverview
        lang={lang}
        logs={logs}
        targets={{
          calories: nutrition?.details?.calories ?? null,
          protein_g: nutrition?.details?.protein_g ?? null,
          carbs_g: nutrition?.details?.carbs_g ?? null,
          fat_g: nutrition?.details?.fat_g ?? null,
        }}
      />

      {!nutrition || !nutrition.completed_at ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {t(
            "Je coach heeft nog geen voedingsschema voor je opgesteld.",
            "Your coach hasn't set up a nutrition plan for you yet.",
          )}
        </Card>
      ) : (
        <Card className="p-5 space-y-3">
          <div>
            <h3 className="font-semibold">{t("Voedingsschema", "Nutrition plan")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("Laatst bijgewerkt", "Last updated")}:{" "}
              {new Date(nutrition.updated_at).toLocaleDateString()}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label={t("Geslacht", "Gender")} value={nutrition.gender} />
            <Stat label={t("Leeftijd", "Age")} value={nutrition.age} />
            <Stat
              label={t("Lengte", "Height")}
              value={nutrition.height_cm ? `${nutrition.height_cm} cm` : null}
            />
            <Stat
              label={t("Gewicht", "Weight")}
              value={nutrition.weight_kg ? `${nutrition.weight_kg} kg` : null}
            />
          </div>

          {nutrition.details?.calories ? (
            <>
              <div className="h-px bg-border my-1" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("Dagelijkse macro's", "Daily macros")}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label={t("Calorieën", "Calories")} value={`${nutrition.details.calories} kcal`} />
                <Stat label={t("Eiwit", "Protein")} value={`${nutrition.details.protein_g} g`} />
                <Stat label={t("Koolhydraten", "Carbs")} value={`${nutrition.details.carbs_g} g`} />
                <Stat label={t("Vet", "Fat")} value={`${nutrition.details.fat_g} g`} />
              </div>
              <MacroPie
                lang={lang}
                protein={nutrition.details.protein_g}
                carbs={nutrition.details.carbs_g}
                fat={nutrition.details.fat_g}
              />
            </>
          ) : null}
        </Card>
      )}

      <CronometerConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        lang={lang}
        onConnected={() => loadAll()}
      />
      <CronometerConnectDialog
        open={reauth}
        onOpenChange={setReauth}
        lang={lang}
        onConnected={() => {
          loadAll();
          // auto-resync after re-auth
          handleSync();
        }}
      />
      {reauth && (
        <div className="hidden">
          {/* Re-auth prompt is the dialog above; show toast for context */}
          <AlertTriangle />
        </div>
      )}
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: any }) => (
  <div className="rounded-md border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium mt-0.5">{value || "—"}</p>
  </div>
);

const MacroPie = ({
  lang,
  protein,
  carbs,
  fat,
}: {
  lang: Lang;
  protein: number;
  carbs: number;
  fat: number;
}) => {
  const data = [
    { name: lang === "nl" ? "Koolhydraten" : "Carbs", value: Number(carbs) || 0, color: "hsl(0 75% 55%)" },
    { name: lang === "nl" ? "Eiwitten" : "Protein", value: Number(protein) || 0, color: "hsl(210 80% 60%)" },
    { name: lang === "nl" ? "Vetten" : "Fat", value: Number(fat) || 0, color: "hsl(25 85% 60%)" },
  ];
  if (data.every((d) => d.value === 0)) return null;
  return (
    <div className="mt-2 rounded-md border p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
        {lang === "nl" ? "Verdeling" : "Distribution"}
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2} stroke="hsl(var(--background))">
              {data.map((d) => (<Cell key={d.name} fill={d.color} />))}
            </Pie>
            <Tooltip
              formatter={(val: any, name: any) => [`${val} g`, name]}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              formatter={(value: any) => {
                const item = data.find((d) => d.name === value);
                return (
                  <span className="text-xs text-foreground">
                    {value} ({item?.value} g)
                  </span>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ClientNutrition;
