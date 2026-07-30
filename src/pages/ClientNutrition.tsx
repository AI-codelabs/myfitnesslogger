import { useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Plug, Unplug } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { CronometerConnectDialog } from "@/components/CronometerConnectDialog";
import { CronometerTargetSyncDialog } from "@/components/CronometerTargetSyncDialog";
import { NutritionWeeklyOverview } from "@/components/NutritionWeeklyOverview";
import { ClientNutritionDocuments } from "@/components/ClientNutritionDocuments";
import type { DayDetailLog } from "@/components/NutritionDayDetailDialog";
import { hasCronometerSession, syncCronometer, disconnectCronometer } from "@/lib/cronometer";
import {
  getCronometerWebStatus,
  disconnectCronometerWeb,
  type CronoWebStatus,
} from "@/lib/cronometerTargetsWeb";
import { toast } from "sonner";





interface NutritionLog {
  id: string;
  log_date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g?: number;
  sodium_mg?: number;
  synced_at: string;
  entries: DayDetailLog["entries"];
}

interface NutritionPlanDetails {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

interface NutritionPlan {
  completed_at?: string | null;
  updated_at: string;
  gender?: string | null;
  age?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  details?: NutritionPlanDetails | null;
}

const ClientNutrition = () => {
  const { user } = useAuth();
  const [lang] = useState<Lang>(() => (localStorage.getItem("onbLang") as Lang) || "nl");
  const [loading, setLoading] = useState(true);
  const [nutrition, setNutrition] = useState<NutritionPlan | null>(null);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [targetSyncOpen, setTargetSyncOpen] = useState(false);
  const [targetSync, setTargetSync] = useState<CronoWebStatus | null>(null);
  const [targetBusy, setTargetBusy] = useState(false);

  const [disconnecting, setDisconnecting] = useState(false);

  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [planRes, sessionRes, logsRes] = await Promise.all([
      supabase.from("nutrition_plans").select("*").eq("client_id", user.id).maybeSingle(),
      supabase
        .from("cronometer_clients")
        .select("id")
        .eq("client_id", user.id)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("cronometer_nutrition_logs")
        .select("id, log_date, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, synced_at, entries")
        .eq("client_id", user.id)
        .order("log_date", { ascending: false })
        .limit(14),
    ]);
    setNutrition((planRes.data as NutritionPlan | null) ?? null);
    setConnected(!!sessionRes.data);
    setLogs((logsRes.data as NutritionLog[]) || []);
    // Target sync status (separate from the read-only Pro API link).
    const statusRes = await getCronometerWebStatus();
    setTargetSync(statusRes.data ?? { connected: false });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleDisconnectTargetSync = async () => {
    if (!window.confirm(t("Cronometer doel-sync loskoppelen?", "Disconnect Cronometer target sync?"))) return;
    setTargetBusy(true);
    const res = await disconnectCronometerWeb();
    setTargetBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success(t("Losgekoppeld", "Disconnected"));
    loadAll();
  };


  const handleSync = async () => {
    setSyncing(true);
    const res = await syncCronometer();
    setSyncing(false);
    if (res.sessionExpired) {
      toast.error(t("Cronometer-sessie verlopen. Log opnieuw in.", "Cronometer session expired. Please sign in again."));
      setConnectDialogOpen(true);
      return;
    }
    if (res.goldRequired) {
      toast.error(
        res.error ||
          t(
            "Cronometer geeft aan dat deze export Gold vereist voor dit account.",
            "Cronometer says this export requires Gold for this account.",
          ),
        { duration: 10000 },
      );
      return;
    }
    if (res.exportForbidden) {
      toast.error(
        res.error ||
          t(
            "Cronometer weigert de voedings-export voor dit account. Probeer Food & Recipe Entries te exporteren via het Cronometer webdashboard.",
            "Cronometer rejected nutrition export for this account. Try exporting Food & Recipe Entries from Cronometer's web dashboard.",
          ),
        { duration: 12000 },
      );
      return;
    }
    if (!res.success) {
      if (res.error === "no_session") {
        setConnectDialogOpen(true);
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

  const handleDisconnect = async () => {
    if (!user?.id) return;
    if (!window.confirm(t("Cronometer ontkoppelen?", "Disconnect Cronometer?"))) return;
    setDisconnecting(true);
    const res = await disconnectCronometer(user.id);
    setDisconnecting(false);
    if (!res.success) {
      toast.error(res.error || t("Ontkoppelen mislukt", "Disconnect failed"));
      return;
    }
    toast.success(t("Cronometer ontkoppeld", "Cronometer disconnected"));
    setConnected(false);
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
            "Bekijk je voedingsschema en synchroniseer je dagelijkse macro's.",
            "Review your nutrition plan and sync your daily macros.",
          )}
        </p>
      </div>


      {/* 1) Pro link — coach invite → we READ your diary macros */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${connected ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
              <Plug className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">
                {t("Cronometer dagboek (via coach)", "Cronometer diary (via coach)")}{" "}
                <span className={`ml-1 text-xs ${connected ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {connected ? t("verbonden", "connected") : t("niet verbonden", "not connected")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connected
                  ? t(
                      "Je coach leest je dagelijkse macro's. Klik op Log om te synchroniseren.",
                      "Your coach can read your daily macros. Click Log to sync.",
                    )
                  : t(
                      "Je coach stuurt een Cronometer-uitnodiging. Accepteer die in je e-mail — geen wachtwoord hier.",
                      "Your coach sends a Cronometer invite. Accept it in your email — no password needed here.",
                    )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {connected ? (
              <>
                <Button onClick={handleSync} disabled={syncing} className="flex-1 sm:flex-none">
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {t("Log", "Log")}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex-1 sm:flex-none"
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Unplug className="h-4 w-4 mr-2" />
                  )}
                  {t("Ontkoppelen", "Disconnect")}
                </Button>
              </>
            ) : (
              <Button onClick={() => setConnectDialogOpen(true)} className="flex-1 sm:flex-none">
                <Plug className="h-4 w-4 mr-2" />
                {t("Hoe verbind ik?", "How do I connect?")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* 2) Client web login — WE PUSH coach targets into Cronometer */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              targetSync?.connected && targetSync.status === "active"
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-muted text-muted-foreground"
            }`}>
              <Plug className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">
                {t("Cronometer doelen pushen", "Push Cronometer targets")}{" "}
                <span className={`ml-1 text-xs ${
                  targetSync?.connected && targetSync.status === "active"
                    ? "text-emerald-600"
                    : targetSync?.status === "needs_reauth"
                      ? "text-amber-600"
                      : "text-muted-foreground"
                }`}>
                  {!targetSync?.connected && t("niet verbonden", "not connected")}
                  {targetSync?.connected && targetSync.status === "active" && (targetSync.in_sync
                    ? t("in sync", "in sync")
                    : t("verbonden", "connected"))}
                  {targetSync?.status === "needs_reauth" && t("opnieuw inloggen", "re-authenticate")}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {!targetSync?.connected
                  ? t(
                      "Log hier zelf in met je Cronometer-account. Zo kunnen we je macro-doelen in Cronometer zetten (dit kan de coach-API niet).",
                      "Sign in here with your own Cronometer account so we can push your macro targets into Cronometer (the coach API cannot do this).",
                    )
                  : targetSync.last_push_at
                    ? <>{t("Laatst gepusht", "Last pushed")}: {new Date(targetSync.last_push_at).toLocaleString()}</>
                    : t("Nog geen push uitgevoerd.", "No push yet.")}
                {targetSync?.last_error && (
                  <span className="block text-destructive mt-1">{targetSync.last_error}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {targetSync?.connected && targetSync.status !== "needs_reauth" ? (
              <Button
                variant="outline"
                onClick={handleDisconnectTargetSync}
                disabled={targetBusy}
                className="flex-1 sm:flex-none"
              >
                {targetBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unplug className="h-4 w-4 mr-2" />}
                {t("Ontkoppelen", "Disconnect")}
              </Button>
            ) : (
              <Button onClick={() => setTargetSyncOpen(true)} className="flex-1 sm:flex-none">
                <Plug className="h-4 w-4 mr-2" />
                {targetSync?.status === "needs_reauth"
                  ? t("Opnieuw inloggen", "Re-authenticate")
                  : t("Inloggen bij Cronometer", "Sign in to Cronometer")}
              </Button>
            )}
          </div>
        </div>
      </Card>


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

      {user?.id && (
        <ClientNutritionDocuments clientId={user.id} canUpload={false} lang={lang} />
      )}


      <CronometerConnectDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        lang={lang}
        onConnected={() => loadAll()}
      />

      <CronometerTargetSyncDialog
        open={targetSyncOpen}
        onOpenChange={setTargetSyncOpen}
        lang={lang}
        onConnected={() => loadAll()}
      />




    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
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
              formatter={(val: unknown, name: unknown) => [`${val} g`, String(name)]}
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
              formatter={(value: unknown) => {
                const label = String(value);
                const item = data.find((d) => d.name === label);
                return (
                  <span className="text-xs text-foreground">
                    {label} ({item?.value} g)
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
