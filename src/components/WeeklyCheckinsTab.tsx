import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Loader2,
  ClipboardCheck,
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  Scale as ScaleIcon,
  Heart,
  Zap,
  Dumbbell,
  Utensils,
  Moon,
  Droplet,
} from "lucide-react";
import { formatHumanDate } from "@/lib/weeklyCheckin";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  clientId: string;
  lang: "nl" | "en";
}

type Checkin = {
  id: string;
  week_start: string;
  submitted_at: string;
  training_count: string | null;
  training_count_other: string | null;
  intensity_rpe: number | null;
  progression: number | null;
  nutrition_stars: number | null;
  nutrition_deviations: string | null;
  cravings: string | null;
  sleep_cycle: string | null;
  sleep_cycle_other: string | null;
  energy: number | null;
  soreness: number | null;
  weight_kg: number | null;
  measurements: string | null;
  body_fat_pct: number | null;
  feeling: number | null;
  structure_planning: string | null;
  progress_feeling: string | null;
  obstacles: string | null;
  supplements_consistency: number | null;
  hydration: number | null;
  other_notes: string | null;
};

type T = (nl: string, en: string) => string;

/* ---------- helpers ---------- */

function trainingCountValue(c: Checkin) {
  return c.training_count === "anders" ? c.training_count_other ?? "—" : c.training_count ?? "—";
}
function trainingCountNum(c: Checkin): number | null {
  const v = trainingCountValue(c);
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
function sleepValue(c: Checkin) {
  if (c.sleep_cycle === "anders") return c.sleep_cycle_other ?? "—";
  return c.sleep_cycle ?? "—";
}

/* ---------- atomic UI ---------- */

function Sparkline({
  values,
  positiveDown = false,
  neutral = false,
}: {
  values: Array<number | null>;
  positiveDown?: boolean;
  neutral?: boolean;
}) {
  const clean = values.map((v) => (v == null ? null : Number(v)));
  const nums = clean.filter((v): v is number => v != null);
  if (nums.length < 2) {
    return <div className="h-6 w-full" />;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const step = w / (clean.length - 1);
  const points = clean
    .map((v, i) => (v == null ? null : `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  const last = nums[nums.length - 1];
  const first = nums[0];
  const trendingUp = last > first;
  const stroke = neutral
    ? "hsl(var(--muted-foreground))"
    : last === first
      ? "hsl(var(--muted-foreground))"
      : (trendingUp && !positiveDown) || (!trendingUp && positiveDown)
        ? "hsl(var(--primary))"
        : "hsl(var(--destructive))";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-20" preserveAspectRatio="none">
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function Delta({
  current,
  previous,
  decimals = 1,
  suffix = "",
  positiveDown = false,
  neutral = false,
}: {
  current: number | null;
  previous: number | null;
  decimals?: number;
  suffix?: string;
  positiveDown?: boolean;
  neutral?: boolean;
}) {
  if (current == null || previous == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const diff = current - previous;
  if (Math.abs(diff) < (decimals === 0 ? 0.5 : 0.05)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> 0{suffix}
      </span>
    );
  }
  const isGood = positiveDown ? diff < 0 : diff > 0;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        neutral
          ? "text-muted-foreground"
          : isGood
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="h-3 w-3" />
      {diff > 0 ? "+" : ""}
      {diff.toFixed(decimals)}
      {suffix}
    </span>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  spark,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta: React.ReactNode;
  spark: React.ReactNode;
}) {
  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px] uppercase tracking-wide font-semibold">{label}</span>
        </div>
        {spark}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold tabular-nums">{value ?? "—"}</span>
          {unit && value != null && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        {delta}
      </div>
    </Card>
  );
}

function ScaleCell({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground text-xs">/{max}</span>
    </span>
  );
}

function StarsCell({ value }: { value: number | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}

/* ---------- main ---------- */

export function WeeklyCheckinsTab({ clientId, lang }: Props) {
  const t: T = (nl, en) => (lang === "nl" ? nl : en);
  const [items, setItems] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: checkins }, { data: onboarding }, { data: goal }] = await Promise.all([
        supabase
          .from("weekly_checkins")
          .select("*")
          .eq("client_id", clientId)
          .order("week_start", { ascending: false }),
        supabase
          .from("onboarding_responses")
          .select("primary_goal")
          .eq("user_id", clientId)
          .maybeSingle(),
        supabase
          .from("client_goals")
          .select("goal_type")
          .eq("client_id", clientId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      setItems((checkins ?? []) as Checkin[]);
      // Prefer the editable client_goals.goal_type over the legacy onboarding answer
      const gt = (goal as any)?.goal_type;
      setPrimaryGoal(gt ?? onboarding?.primary_goal ?? null);
      setLoading(false);
    })();
  }, [clientId]);

  // Goal-aware weight direction:
  //  - cut → losing weight is good (positiveDown = true)
  //  - bulk/muscle → gaining weight is good (positiveDown = false)
  //  - maintain / energy / combo / unknown → neutral (no good/bad coloring)
  const weightPositiveDown = primaryGoal === "cut";
  const weightNeutral = primaryGoal !== "cut" && primaryGoal !== "muscle" && primaryGoal !== "bulk";


  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const latest = items[0];
  const previous = items[1];

  // Oldest -> newest for sparklines, last 8 weeks
  const sparkSeries = useMemo(() => {
    const recent = items.slice(0, 8).slice().reverse();
    return {
      weight: recent.map((c) => c.weight_kg),
      feeling: recent.map((c) => c.feeling),
      energy: recent.map((c) => c.energy),
      nutrition: recent.map((c) => c.nutrition_stars),
      training: recent.map((c) => trainingCountNum(c)),
      rpe: recent.map((c) => c.intensity_rpe),
      soreness: recent.map((c) => c.soreness),
      hydration: recent.map((c) => c.hydration),
    };
  }, [items]);

  // Comparison table: recent 3 weeks by default, all weeks on demand (newest left)
  const tableWeeks = useMemo(
    () => (showAllWeeks ? items : items.slice(0, 3)),
    [items, showAllWeeks],
  );

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0 || !latest) {
    return (
      <Card className="p-8 text-center">
        <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
        <p className="font-medium">{t("Nog geen check-ins", "No check-ins yet")}</p>
        <p className="text-sm text-muted-foreground">
          {t(
            "Zodra deze client een check-in invult verschijnt die hier.",
            "Once this client submits a check-in, it will appear here.",
          )}
        </p>
      </Card>
    );
  }

  const tableRows: Array<{
    label: string;
    icon?: any;
    render: (c: Checkin) => React.ReactNode;
  }> = [
    {
      label: t("Gewicht", "Weight"),
      icon: ScaleIcon,
      render: (c) =>
        c.weight_kg != null ? (
          <span className="tabular-nums">{c.weight_kg} kg</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      label: t("Vetpercentage", "Body fat"),
      render: (c) =>
        c.body_fat_pct != null ? (
          <span className="tabular-nums">{c.body_fat_pct}%</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      label: t("Gevoel", "Feeling"),
      icon: Heart,
      render: (c) => <ScaleCell value={c.feeling} max={5} />,
    },
    { label: t("Energie", "Energy"), icon: Zap, render: (c) => <ScaleCell value={c.energy} max={5} /> },
    { label: t("Spierpijn", "Soreness"), render: (c) => <ScaleCell value={c.soreness} max={5} /> },
    {
      label: t("Trainingen", "Workouts"),
      icon: Dumbbell,
      render: (c) => <span className="tabular-nums">{trainingCountValue(c)}</span>,
    },
    { label: t("Intensiteit (RPE)", "Intensity (RPE)"), render: (c) => <ScaleCell value={c.intensity_rpe} max={5} /> },
    { label: t("Progressie", "Progression"), render: (c) => <ScaleCell value={c.progression} max={5} /> },
    {
      label: t("Voeding", "Nutrition"),
      icon: Utensils,
      render: (c) => <StarsCell value={c.nutrition_stars} />,
    },
    {
      label: t("Hydratatie", "Hydration"),
      icon: Droplet,
      render: (c) => <ScaleCell value={c.hydration} max={5} />,
    },
    {
      label: t("Supplementen", "Supplements"),
      render: (c) => <ScaleCell value={c.supplements_consistency} max={5} />,
    },
    { label: t("Slaap", "Sleep"), icon: Moon, render: (c) => <span>{sleepValue(c)}</span> },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            {t("Laatste check-in", "Latest check-in")}
          </p>
          <p className="text-lg font-semibold">
            {t("Week van ", "Week of ")}
            {formatHumanDate(latest.week_start, lang)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Ingevuld ", "Submitted ")}
          {formatHumanDate(latest.submitted_at, lang)}
          {previous && (
            <>
              {" · "}
              {t("vergeleken met week van ", "vs week of ")}
              {formatHumanDate(previous.week_start, lang)}
            </>
          )}
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        <KpiTile
          icon={ScaleIcon}
          label={t("Gewicht", "Weight")}
          value={latest.weight_kg}
          unit="kg"
          delta={
            <Delta
              current={latest.weight_kg}
              previous={previous?.weight_kg ?? null}
              decimals={1}
              suffix=" kg"
              positiveDown={weightPositiveDown}
              neutral={weightNeutral}
            />
          }
          spark={<Sparkline values={sparkSeries.weight} positiveDown={weightPositiveDown} neutral={weightNeutral} />}
        />
        <KpiTile
          icon={Heart}
          label={t("Gevoel", "Feeling")}
          value={latest.feeling}
          unit="/5"
          delta={<Delta current={latest.feeling} previous={previous?.feeling ?? null} decimals={0} />}
          spark={<Sparkline values={sparkSeries.feeling} />}
        />
        <KpiTile
          icon={Zap}
          label={t("Energie", "Energy")}
          value={latest.energy}
          unit="/5"
          delta={<Delta current={latest.energy} previous={previous?.energy ?? null} decimals={0} />}
          spark={<Sparkline values={sparkSeries.energy} />}
        />
        <KpiTile
          icon={Utensils}
          label={t("Voeding", "Nutrition")}
          value={<StarsCell value={latest.nutrition_stars} />}
          delta={
            <Delta current={latest.nutrition_stars} previous={previous?.nutrition_stars ?? null} decimals={0} suffix="★" />
          }
          spark={<Sparkline values={sparkSeries.nutrition} />}
        />
        <KpiTile
          icon={Dumbbell}
          label={t("Trainingen", "Workouts")}
          value={trainingCountValue(latest)}
          delta={<Delta current={trainingCountNum(latest)} previous={previous ? trainingCountNum(previous) : null} decimals={0} />}
          spark={<Sparkline values={sparkSeries.training} />}
        />
        <KpiTile
          icon={Zap}
          label={t("RPE", "RPE")}
          value={latest.intensity_rpe}
          unit="/5"
          delta={<Delta current={latest.intensity_rpe} previous={previous?.intensity_rpe ?? null} decimals={0} />}
          spark={<Sparkline values={sparkSeries.rpe} />}
        />
        <KpiTile
          icon={Droplet}
          label={t("Hydratatie", "Hydration")}
          value={latest.hydration}
          unit="/5"
          delta={<Delta current={latest.hydration} previous={previous?.hydration ?? null} decimals={0} />}
          spark={<Sparkline values={sparkSeries.hydration} />}
        />
        <KpiTile
          icon={Heart}
          label={t("Spierpijn", "Soreness")}
          value={latest.soreness}
          unit="/5"
          delta={<Delta current={latest.soreness} previous={previous?.soreness ?? null} decimals={0} positiveDown />}
          spark={<Sparkline values={sparkSeries.soreness} positiveDown />}
        />
      </div>

      {/* Qualitative answers latest week */}
      {(latest.progress_feeling ||
        latest.obstacles ||
        latest.structure_planning ||
        latest.nutrition_deviations ||
        latest.cravings ||
        latest.measurements ||
        latest.other_notes) && (
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-3">
            {t("Toelichting deze week", "Notes this week")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {[
              [t("Progressiegevoel", "Progress feeling"), latest.progress_feeling],
              [t("Belemmeringen", "Obstacles"), latest.obstacles],
              [t("Structuur / planning", "Structure / planning"), latest.structure_planning],
              [t("Voeding afwijkingen", "Nutrition deviations"), latest.nutrition_deviations],
              [t("Cravings / dips", "Cravings / dips"), latest.cravings],
              [t("Metingen", "Measurements"), latest.measurements],
              [t("Overige notities", "Other notes"), latest.other_notes],
            ]
              .filter(([, v]) => v)
              .map(([label, v]) => (
                <div key={label as string} className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                    {label}
                  </p>
                  <p className="text-sm leading-snug whitespace-pre-wrap">{v}</p>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Comparison table — recent weeks or all weeks */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            {showAllWeeks
              ? t("Vergelijking alle weken", "All weeks comparison")
              : t("Vergelijking laatste weken", "Recent weeks comparison")}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-[11px] text-muted-foreground">
              {tableWeeks.length} {t("weken", "weeks")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (items.length < 3) {
                  toast.info(
                    t(
                      "Niet genoeg check-ins om te vergelijken",
                      "Not enough check-ins to compare",
                    ),
                  );
                  return;
                }
                setShowAllWeeks((v) => !v);
              }}
            >
              {showAllWeeks
                ? t("Laatste 3 weken", "Last 3 weeks")
                : t(`Alle ${items.length} weken vergelijken`, `Compare all ${items.length} weeks`)}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/10">
                <th className="text-left font-medium text-xs text-muted-foreground px-3 py-2 sticky left-0 bg-muted/10">
                  {t("Metric", "Metric")}
                </th>
                {tableWeeks.map((c, i) => (
                  <th
                    key={c.id}
                    className={cn(
                      "text-left font-medium text-xs px-3 py-2 whitespace-nowrap",
                      i === 0 ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {i === 0 && (
                      <span className="block text-[10px] uppercase tracking-wide text-primary font-semibold">
                        {t("Nieuwste", "Latest")}
                      </span>
                    )}
                    {formatHumanDate(c.week_start, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={row.label} className={cn("border-b last:border-b-0", ri % 2 === 1 && "bg-muted/5")}>
                  <td className="px-3 py-2 sticky left-0 bg-card">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      {row.icon && <row.icon className="h-3 w-3" />}
                      {row.label}
                    </span>
                  </td>
                  {tableWeeks.map((c, i) => (
                    <td
                      key={c.id}
                      className={cn("px-3 py-2 whitespace-nowrap", i === 0 && "font-medium")}
                    >
                      {row.render(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Older weeks notes — collapsible */}
      {items.length > 1 && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              {t("Toelichtingen vorige weken", "Notes — previous weeks")}
            </p>
          </div>
          <Accordion type="single" collapsible>
            {items.slice(1).map((c) => {
              const notes = [
                [t("Progressiegevoel", "Progress feeling"), c.progress_feeling],
                [t("Belemmeringen", "Obstacles"), c.obstacles],
                [t("Structuur / planning", "Structure / planning"), c.structure_planning],
                [t("Voeding afwijkingen", "Nutrition deviations"), c.nutrition_deviations],
                [t("Cravings / dips", "Cravings / dips"), c.cravings],
                [t("Metingen", "Measurements"), c.measurements],
                [t("Overige notities", "Other notes"), c.other_notes],
              ].filter(([, v]) => v);
              return (
                <AccordionItem key={c.id} value={c.id} className="border-b last:border-b-0">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center justify-between flex-1 pr-3">
                      <span className="font-medium text-sm">
                        {t("Week van ", "Week of ")}
                        {formatHumanDate(c.week_start, lang)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {notes.length} {t("notities", "notes")}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4">
                    {notes.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        {t("Geen toelichting ingevuld.", "No notes provided.")}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 pb-2">
                        {notes.map(([label, v]) => (
                          <div key={label as string} className="space-y-0.5">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                              {label}
                            </p>
                            <p className="text-sm leading-snug whitespace-pre-wrap">{v}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Card>
      )}
    </div>
  );
}
