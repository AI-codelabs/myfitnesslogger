import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { listWeightLogs } from "@/lib/api/weight";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
  Flame,
  Dumbbell,
  Heart,
  Camera,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ProgressPhotoTimeline,
  type PhotoRow,
} from "@/components/ProgressPhotoTimeline";
import { ProgressPhotoUploader } from "@/components/ProgressPhotoUploader";
import { DailyWeightLogger, type WeightLog } from "@/components/DailyWeightLogger";
import { StrengthProgressChart } from "@/components/StrengthProgressChart";
import { db } from "@/lib/db";

type CheckinRow = {
  id: string;
  week_start: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  energy: number | null;
  sleep_cycle: string | null;
  soreness: number | null;
  hydration: number | null;
  feeling: number | null;
  nutrition_stars: number | null;
  intensity_rpe: number | null;
  progression: number | null;
  supplements_consistency: number | null;
};

function StatCard({
  label,
  value,
  unit,
  delta,
  icon: Icon,
  color = "primary",
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number | null;
  icon: React.ComponentType<{ className?: string }>;
  color?: "primary" | "secondary" | "success";
}) {
  const colorMap = {
    primary: "from-primary/15 to-primary/5 text-primary",
    secondary: "from-secondary/20 to-secondary/5 text-secondary",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-600",
  };
  return (
    <Card className="p-3 sm:p-4 relative overflow-hidden">
      <div
        className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${colorMap[color]} blur-xl opacity-60`}
      />
      <div className="relative space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground font-medium truncate">
            {label}
          </p>
          <Icon className={`h-4 w-4 shrink-0 ${colorMap[color].split(" ").pop()}`} />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl sm:text-2xl font-bold tabular-nums">{value}</span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        {delta != null && (
          <div
            className={`flex items-center gap-1 text-[11px] sm:text-xs font-medium ${
              delta < 0
                ? "text-emerald-600"
                : delta > 0
                  ? "text-orange-500"
                  : "text-muted-foreground"
            }`}
          >
            {delta < 0 ? (
              <TrendingDown className="h-3 w-3 shrink-0" />
            ) : delta > 0 ? (
              <TrendingUp className="h-3 w-3 shrink-0" />
            ) : (
              <Minus className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)} {unit ?? ""}
              <span className="hidden sm:inline"> sinds start</span>
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  empty,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      {empty ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Nog geen data — vul je eerste check-in in.
        </div>
      ) : (
        <div className="h-48 sm:h-56 -mx-2">{children}</div>
      )}
    </Card>
  );
}

export default function Progression() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);

  const load = async () => {
    if (!user) return;
    const [c, p, w] = await Promise.all([
      db.from("weekly_checkins")
        .select(
          "id,week_start,weight_kg,body_fat_pct,energy,sleep_cycle,soreness,hydration,feeling,nutrition_stars,intensity_rpe,progression,supplements_consistency",
        )
        .eq("client_id", user.id)
        .order("week_start", { ascending: true }),
      supabase
        .from("progress_photos")
        .select("id,taken_on,front_path,side_path,back_path,weight_kg")
        .eq("client_id", user.id)
        .order("taken_on", { ascending: false }),
      listWeightLogs(user.id, { limit: 500 }).catch((e) => {
        console.error("[progression] weight logs failed", e);
        return [];
      }),
    ]);
    setCheckins((c.data as CheckinRow[]) ?? []);
    setPhotos((p.data as PhotoRow[]) ?? []);
    setWeightLogs(
      [...w].sort((a, b) => a.logged_on.localeCompare(b.logged_on)) as WeightLog[],
    );
    setLoading(false);
  };


  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const data = useMemo(
    () =>
      checkins.map((c) => ({
        ...c,
        label: new Date(c.week_start).toLocaleDateString("nl-NL", {
          day: "2-digit",
          month: "short",
        }),
      })),
    [checkins],
  );

  // Merge weekly check-in weights with daily weight logs (logs win on same date).
  const weightSeries = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const c of checkins) {
      if (c.weight_kg != null) byDate.set(c.week_start, c.weight_kg as number);
    }
    for (const w of weightLogs) {
      byDate.set(w.logged_on, Number(w.weight_kg));
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, weight_kg]) => ({
        weight_kg,
        label: new Date(date).toLocaleDateString("nl-NL", {
          day: "2-digit",
          month: "short",
        }),
      }));
  }, [checkins, weightLogs]);
  const fatSeries = data.filter((d) => d.body_fat_pct != null);

  const firstWeight = weightSeries[0]?.weight_kg ?? null;
  const lastWeight = weightSeries[weightSeries.length - 1]?.weight_kg ?? null;
  const weightDelta =
    firstWeight != null && lastWeight != null ? lastWeight - firstWeight : null;

  const firstFat = fatSeries[0]?.body_fat_pct ?? null;
  const lastFat = fatSeries[fatSeries.length - 1]?.body_fat_pct ?? null;
  const fatDelta = firstFat != null && lastFat != null ? lastFat - firstFat : null;

  const lastCheckin = data[data.length - 1];

  const wellbeingRadar = lastCheckin
    ? [
        { metric: "Energie", value: lastCheckin.energy ?? 0 },
        { metric: "Slaap", value: lastCheckin.feeling ?? 0 },
        { metric: "Hydratatie", value: lastCheckin.hydration ?? 0 },
        { metric: "Voeding", value: lastCheckin.nutrition_stars ?? 0 },
        { metric: "Progressie", value: lastCheckin.progression ?? 0 },
        { metric: "Spierpijn", value: 6 - (lastCheckin.soreness ?? 0) },
      ]
    : [];

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 py-4 sm:p-6 max-w-3xl">
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>

      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Jouw progressie
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Volg je reis. Elke week telt.
        </p>
      </div>

      {/* Hero stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Gewicht"
          value={lastWeight != null ? lastWeight.toFixed(1) : "—"}
          unit="kg"
          delta={weightDelta}
          icon={Flame}
          color="secondary"
        />
        <StatCard
          label="Vet %"
          value={lastFat != null ? lastFat.toFixed(1) : "—"}
          unit="%"
          delta={fatDelta}
          icon={TrendingDown}
          color="success"
        />
        <StatCard
          label="Check-ins"
          value={checkins.length}
          icon={Heart}
          color="primary"
        />
        <StatCard
          label="Foto sessies"
          value={photos.length}
          icon={Camera}
          color="primary"
        />
      </div>

      <Tabs defaultValue="body">
        <TabsList className="w-full grid grid-cols-4 h-auto">
          <TabsTrigger value="body" className="text-xs sm:text-sm">
            Lichaam
          </TabsTrigger>
          <TabsTrigger value="wellbeing" className="text-xs sm:text-sm">
            Welzijn
          </TabsTrigger>
          <TabsTrigger value="training" className="text-xs sm:text-sm">
            Training
          </TabsTrigger>
          <TabsTrigger value="photos" className="text-xs sm:text-sm">
            Foto's
          </TabsTrigger>
        </TabsList>

        {/* Body metrics */}
        <TabsContent value="body" className="mt-4 space-y-4">
          {user && (
            <DailyWeightLogger
              clientId={user.id}
              lang="nl"
              onChange={load}
            />
          )}
          <ChartCard
            title="Gewicht over tijd"
            subtitle="Wekelijkse check-ins + dagelijkse metingen"
            empty={weightSeries.length < 2}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weightSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="weightG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  domain={["dataMin - 1", "dataMax + 1"]}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="weight_kg"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2.5}
                  fill="url(#weightG)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Vetpercentage"
            subtitle="Wekelijkse meting in %"
            empty={fatSeries.length < 2}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fatSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fatG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  domain={["dataMin - 1", "dataMax + 1"]}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="body_fat_pct"
                  stroke="hsl(var(--success))"
                  strokeWidth={2.5}
                  fill="url(#fatG)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        {/* Wellbeing */}
        <TabsContent value="wellbeing" className="mt-4 space-y-4">
          <ChartCard
            title="Hoe voel je je deze week?"
            subtitle="Laatste check-in op 6 dimensies"
            empty={!lastCheckin}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={wellbeingRadar}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Radar
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Energie & spierpijn trend"
            subtitle="Schaal 1-5 per week"
            empty={data.length < 2}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  domain={[0, 5]}
                  width={24}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="energy"
                  name="Energie"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="soreness"
                  name="Spierpijn"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Voeding & hydratatie"
            subtitle="Wekelijkse score"
            empty={data.length < 2}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  domain={[0, 5]}
                  width={24}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="nutrition_stars"
                  name="Voeding"
                  stroke="hsl(var(--success))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="hydration"
                  name="Hydratatie"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        {/* Training */}
        <TabsContent value="training" className="mt-4 space-y-4">
          {user && <StrengthProgressChart clientId={user.id} lang="nl" />}
          <ChartCard
            title="Trainingsintensiteit (RPE)"
            subtitle="Hoe zwaar voelden je sessies?"
            empty={data.filter((d) => d.intensity_rpe != null).length < 2}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rpeG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  domain={[0, 5]}
                  width={24}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="intensity_rpe"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  fill="url(#rpeG)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Gevoel van progressie"
            subtitle="Score 1-5"
            empty={data.filter((d) => d.progression != null).length < 2}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  domain={[0, 5]}
                  width={24}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="progression"
                  stroke="hsl(var(--secondary))"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card
            className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate("/training")}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Bekijk je trainingen</p>
              <p className="text-xs text-muted-foreground">Sessies en logs</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Card>
        </TabsContent>

        {/* Photos */}
        <TabsContent value="photos" className="mt-4 space-y-4">
          {user && <ProgressPhotoUploader clientId={user.id} onUploaded={load} />}
          <ProgressPhotoTimeline photos={photos} lang="nl" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
