import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";

export interface DailyLog {
  log_date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface Targets {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

interface Props {
  lang: Lang;
  logs: DailyLog[];
  targets: Targets;
}

// ISO week helpers (week starts Monday)
function startOfISOWeek(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  return date;
}

function isoWeekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function fmtDate(d: Date, lang: Lang) {
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
    day: "numeric",
    month: "short",
  });
}

function dayLabel(d: Date, lang: Lang, short = false) {
  return d.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
    weekday: short ? "short" : "long",
  });
}

const COLORS = {
  calories: "hsl(142 70% 45%)",   // green
  protein: "hsl(210 80% 60%)",    // blue
  carbs: "hsl(0 75% 55%)",        // red
  fat: "hsl(25 90% 55%)",         // orange
};

function pct(actual: number, target?: number | null) {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(150, (actual / target) * 100));
}

// Adherence per day: average closeness to target across available macros (capped at 100%)
function dayAdherence(log: DailyLog, t: Targets): number | null {
  const parts: number[] = [];
  const push = (a: number, target?: number | null) => {
    if (!target || target <= 0) return;
    // closeness: 1 - |a-target|/target, clamped 0..1
    const closeness = Math.max(0, 1 - Math.abs(a - target) / target);
    parts.push(closeness);
  };
  push(log.calories, t.calories);
  push(log.protein_g, t.protein_g);
  push(log.carbs_g, t.carbs_g);
  push(log.fat_g, t.fat_g);
  if (parts.length === 0) return null;
  return (parts.reduce((s, v) => s + v, 0) / parts.length) * 100;
}

export const NutritionWeeklyOverview = ({ lang, logs, targets }: Props) => {
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const s = startOfISOWeek(new Date());
    s.setDate(s.getDate() + weekOffset * 7);
    return s;
  }, [weekOffset]);

  const days = useMemo(() => {
    const arr: { date: Date; key: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      // Build key from LOCAL date components — using toISOString here would
      // shift the date by one day in any TZ east of UTC (e.g. NL summer time).
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      arr.push({ date: d, key: `${y}-${m}-${day}` });
    }
    return arr;
  }, [weekStart]);

  const logByDate = useMemo(() => {
    const m = new Map<string, DailyLog>();
    for (const l of logs) m.set(l.log_date, l);
    return m;
  }, [logs]);

  const weekLogs = days
    .map((d) => logByDate.get(d.key))
    .filter((x): x is DailyLog => !!x);

  const adherences = weekLogs
    .map((l) => dayAdherence(l, targets))
    .filter((v): v is number => v !== null);

  const avgScore =
    adherences.length > 0
      ? adherences.reduce((s, v) => s + v, 0) / adherences.length
      : null;

  const evaluation = (score: number) => {
    if (score >= 90) return t("Uitstekend", "Excellent");
    if (score >= 75) return t("Goed", "Good");
    if (score >= 60) return t("Voldoende", "Decent");
    if (score >= 40) return t("Matig", "Mediocre");
    if (score >= 20) return t("Onvoldoende", "Poor");
    return t("Moet beter", "Needs improvement");
  };

  const weekNum = isoWeekNumber(weekStart);
  const hasTargets = !!(targets.calories || targets.protein_g || targets.carbs_g || targets.fat_g);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {t("Overzicht voedingsstatistieken", "Nutrition overview")}
          </h3>
        </div>

        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label={t("Vorige week", "Previous week")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium">
            {t("Week", "Week")} {weekNum}
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={weekOffset >= 0}
            aria-label={t("Volgende week", "Next week")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Chart — y-axis goes up to 150%; 100% gridline at 2/3 height */}
        <div className="relative">
          <div className="relative h-40">
            {/* 100% gridline at 33.33% from top (i.e. 66.66% bar height) */}
            <div className="absolute left-0 right-0 border-t border-dashed border-border" style={{ top: "33.33%" }} />
            <div className="absolute right-0 text-[10px] text-muted-foreground" style={{ top: "calc(33.33% - 14px)" }}>
              100%
            </div>
            <div className="absolute inset-0 grid grid-cols-7 gap-1 sm:gap-3">
              {days.map(({ date, key }) => {
                const log = logByDate.get(key);
                const bars = [
                  { color: COLORS.calories, h: log ? pct(log.calories, targets.calories) : 0 },
                  { color: COLORS.protein, h: log ? pct(log.protein_g, targets.protein_g) : 0 },
                  { color: COLORS.carbs, h: log ? pct(log.carbs_g, targets.carbs_g) : 0 },
                  { color: COLORS.fat, h: log ? pct(log.fat_g, targets.fat_g) : 0 },
                ];
                return (
                  <div key={key} className="h-full flex items-end justify-center gap-[2px] sm:gap-[3px]">
                    {bars.map((b, i) => (
                      <div
                        key={i}
                        className="w-1 sm:w-2 rounded-sm transition-all"
                        style={{
                          // scale: 150% value = 100% of container height
                          height: `${(Math.min(150, b.h) / 150) * 100}%`,
                          background: b.color,
                          opacity: log ? 1 : 0.25,
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day labels row */}
          <div className="grid grid-cols-7 gap-1 sm:gap-3 mt-2">
            {days.map(({ date, key }) => {
              const isToday = key === new Date().toISOString().slice(0, 10);
              return (
                <div key={key} className="flex flex-col items-center min-w-0">
                  <p
                    className={`text-[10px] sm:text-xs font-semibold truncate max-w-full ${
                      isToday ? "text-primary" : "text-foreground"
                    } capitalize`}
                  >
                    <span className="sm:hidden">{dayLabel(date, lang, true)}</span>
                    <span className="hidden sm:inline">{dayLabel(date, lang)}</span>
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground whitespace-nowrap">
                    {fmtDate(date, lang)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-5 text-xs text-muted-foreground">
          <LegendDot color={COLORS.calories} label={t("Calorieën", "Calories")} />
          <LegendDot color={COLORS.protein} label={t("Eiwit", "Protein")} />
          <LegendDot color={COLORS.carbs} label={t("Koolhydraten", "Carbs")} />
          <LegendDot color={COLORS.fat} label={t("Vet", "Fat")} />
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        {!hasTargets ? (
          <div className="text-sm text-muted-foreground">
            {t(
              "Stel een voedingsschema met dagelijkse macro's in om je score te zien.",
              "Set up a nutrition plan with daily macros to see your score.",
            )}
          </div>
        ) : avgScore === null ? (
          <div className="text-sm text-muted-foreground">
            {t(
              "Nog geen gegevens deze week. Log je voeding om je score te zien.",
              "No data yet this week. Log your nutrition to see your score.",
            )}
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold">
              {t("Je score", "Your score")}: {avgScore.toFixed(1)}%
            </h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              {t(
                `In week ${weekNum} heb je ${avgScore.toFixed(
                  1,
                )} procent gescoord voor het volgen van je voedingsplan. Je score hangt ervan af of je je houdt aan het plan en over hoeveel dagen je je voeding hebt bijgehouden. Momenteel heb je je voeding ${adherences.length} dag(en) bijgehouden. Hoe dichter je wekelijkse gemiddelde percentage tot je doel komt, hoe hoger je scoort!`,
                `In week ${weekNum} you scored ${avgScore.toFixed(
                  1,
                )} percent on following your nutrition plan. Your score depends on how closely you stick to the plan and how many days you logged your nutrition. You've logged ${adherences.length} day(s) so far. The closer your weekly average gets to your target, the higher your score!`,
              )}
            </p>
            <p className="font-semibold mt-4">
              {t("Evaluatie", "Evaluation")}: {evaluation(avgScore)}
            </p>
          </>
        )}
      </Card>
    </div>
  );
};

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
    <span>{label}</span>
  </div>
);
