import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ProgressPhotoTimeline,
  type PhotoRow,
} from "@/components/ProgressPhotoTimeline";
import { StrengthProgressChart } from "@/components/StrengthProgressChart";

interface Props {
  clientId: string;
  lang: "nl" | "en";
}

type CheckinRow = {
  week_start: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  energy: number | null;
  soreness: number | null;
  hydration: number | null;
  nutrition_stars: number | null;
  intensity_rpe: number | null;
  progression: number | null;
};

function Stat({
  label,
  value,
  unit,
  delta,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: number | null;
}) {
  return (
    <Card className="p-3 sm:p-4 space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span className="text-xl sm:text-2xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {delta != null && (
        <div
          className={`flex items-center gap-1 text-xs font-medium ${
            delta < 0 ? "text-emerald-600" : delta > 0 ? "text-orange-500" : "text-muted-foreground"
          }`}
        >
          {delta < 0 ? (
            <TrendingDown className="h-3 w-3" />
          ) : delta > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <Minus className="h-3 w-3" />
          )}
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)} {unit ?? ""}
        </div>
      )}
    </Card>
  );
}

export function ClientProgressionTab({ clientId, lang }: Props) {
  const [loading, setLoading] = useState(true);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, p] = await Promise.all([
        supabase
          .from("weekly_checkins")
          .select(
            "week_start,weight_kg,body_fat_pct,energy,soreness,hydration,nutrition_stars,intensity_rpe,progression",
          )
          .eq("client_id", clientId)
          .order("week_start", { ascending: true }),
        supabase
          .from("progress_photos")
          .select("id,taken_on,front_path,side_path,back_path,weight_kg")
          .eq("client_id", clientId)
          .order("taken_on", { ascending: false }),
      ]);
      setCheckins((c.data as CheckinRow[]) ?? []);
      setPhotos((p.data as PhotoRow[]) ?? []);
      setLoading(false);
    })();
  }, [clientId]);

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

  const weightSeries = data.filter((d) => d.weight_kg != null);
  const fatSeries = data.filter((d) => d.body_fat_pct != null);

  const dW =
    weightSeries.length >= 2
      ? (weightSeries.at(-1)!.weight_kg as number) - (weightSeries[0].weight_kg as number)
      : null;
  const dF =
    fatSeries.length >= 2
      ? (fatSeries.at(-1)!.body_fat_pct as number) - (fatSeries[0].body_fat_pct as number)
      : null;

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label={lang === "nl" ? "Gewicht" : "Weight"}
          value={weightSeries.at(-1)?.weight_kg?.toFixed(1) ?? "—"}
          unit="kg"
          delta={dW}
        />
        <Stat
          label={lang === "nl" ? "Vet %" : "Body fat"}
          value={fatSeries.at(-1)?.body_fat_pct?.toFixed(1) ?? "—"}
          unit="%"
          delta={dF}
        />
        <Stat
          label={lang === "nl" ? "Gem. RPE" : "Avg RPE"}
          value={(() => {
            const rpes = checkins.map((c) => c.intensity_rpe).filter((v): v is number => v != null);
            if (rpes.length === 0) return "—";
            return (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1);
          })()}
          unit="/5"
        />
        <Stat
          label={lang === "nl" ? "Check-ins" : "Check-ins"}
          value={String(checkins.length)}
        />
      </div>


      <Card className="p-4 sm:p-5 space-y-3">
        <h3 className="font-semibold">{lang === "nl" ? "Gewicht over tijd" : "Weight over time"}</h3>
        {weightSeries.length < 2 ? (
          <p className="text-sm text-muted-foreground h-32 flex items-center justify-center">
            {lang === "nl" ? "Nog te weinig data" : "Not enough data yet"}
          </p>
        ) : (
          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weightSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="wG2" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#wG2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-5 space-y-3">
        <h3 className="font-semibold">
          {lang === "nl" ? "Welzijn trends" : "Wellbeing trends"}
        </h3>
        {data.length < 2 ? (
          <p className="text-sm text-muted-foreground h-32 flex items-center justify-center">
            {lang === "nl" ? "Nog te weinig data" : "Not enough data yet"}
          </p>
        ) : (
          <div className="h-56 -mx-2">
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
                <Line type="monotone" dataKey="energy" name="Energie" stroke="hsl(var(--secondary))" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="nutrition_stars" name="Voeding" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="intensity_rpe" name="RPE" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <StrengthProgressChart clientId={clientId} lang={lang} />

      <div>
        <h3 className="font-semibold mb-2">
          {lang === "nl" ? "Progressie foto's" : "Progress photos"}
        </h3>
        <ProgressPhotoTimeline photos={photos} lang={lang} />
      </div>
    </div>
  );
}
