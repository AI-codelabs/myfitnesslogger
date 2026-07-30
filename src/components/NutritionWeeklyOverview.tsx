import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";
import {
  NutritionDayDetailDialog,
  type DayDetailLog,
} from "@/components/NutritionDayDetailDialog";

export interface DailyLog {
  log_date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  entries?: DayDetailLog["entries"];
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

type MacroKey = "calories" | "protein" | "carbs" | "fat";

const COLORS: Record<MacroKey, string> = {
  calories: "hsl(142 70% 45%)",
  protein: "hsl(210 80% 60%)",
  carbs: "hsl(0 75% 55%)",
  fat: "hsl(25 90% 55%)",
};

const MACRO_LABEL_NL: Record<MacroKey, string> = {
  calories: "Calorieën",
  protein: "Eiwit",
  carbs: "Koolhydraten",
  fat: "Vet",
};
const MACRO_LABEL_EN: Record<MacroKey, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
};

const MACRO_UNIT: Record<MacroKey, string> = {
  calories: "kcal",
  protein: "g",
  carbs: "g",
  fat: "g",
};

function pct(actual: number, target?: number | null) {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(150, (actual / target) * 100));
}

function dayAdherence(log: DailyLog, t: Targets): number | null {
  const parts: number[] = [];
  const push = (a: number, target?: number | null) => {
    if (!target || target <= 0) return;
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

interface TooltipState {
  dayKey: string;
  macro: MacroKey;
  consumed: number;
  target: number | null;
  /** Position relative to chart container */
  x: number;
  y: number;
}

export const NutritionWeeklyOverview = ({ lang, logs, targets }: Props) => {
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const [weekOffset, setWeekOffset] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [detailDate, setDetailDate] = useState<Date | null>(null);

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

  const macroLabel = (m: MacroKey) =>
    (lang === "nl" ? MACRO_LABEL_NL : MACRO_LABEL_EN)[m];

  // Build bar data with macro keys
  const macrosOf = (log?: DailyLog) => ({
    calories: { consumed: log?.calories ?? 0, target: targets.calories ?? null },
    protein: { consumed: log?.protein_g ?? 0, target: targets.protein_g ?? null },
    carbs: { consumed: log?.carbs_g ?? 0, target: targets.carbs_g ?? null },
    fat: { consumed: log?.fat_g ?? 0, target: targets.fat_g ?? null },
  });

  const showTooltip = (
    e: React.MouseEvent | React.TouchEvent,
    dayKey: string,
    macro: MacroKey,
    consumed: number,
    target: number | null,
  ) => {
    const chartEl = (e.currentTarget as HTMLElement).closest("[data-chart-root]") as HTMLElement | null;
    const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const root = chartEl?.getBoundingClientRect();
    if (!root) return;
    setTooltip({
      dayKey,
      macro,
      consumed,
      target,
      x: targetRect.left - root.left + targetRect.width / 2,
      y: targetRect.top - root.top,
    });
  };

  const openDay = (date: Date) => {
    setTooltip(null);
    setDetailDate(date);
  };

  const detailLog = useMemo(() => {
    if (!detailDate) return null;
    const y = detailDate.getFullYear();
    const m = String(detailDate.getMonth() + 1).padStart(2, "0");
    const d = String(detailDate.getDate()).padStart(2, "0");
    return logByDate.get(`${y}-${m}-${d}`) ?? null;
  }, [detailDate, logByDate]);

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

        {/* Chart container */}
        <div
          className="relative"
          data-chart-root
          onMouseLeave={() => setTooltip(null)}
        >
          <div className="relative h-44">
            <div
              className="absolute left-0 right-0 border-t border-dashed border-border"
              style={{ top: "33.33%" }}
            />
            <div
              className="absolute right-0 text-[10px] text-muted-foreground"
              style={{ top: "calc(33.33% - 14px)" }}
            >
              100%
            </div>
            <div className="absolute inset-0 grid grid-cols-7 gap-1 sm:gap-3">
              {days.map(({ date, key }) => {
                const log = logByDate.get(key);
                const m = macrosOf(log);
                const bars: { macro: MacroKey; h: number; consumed: number; target: number | null }[] = [
                  { macro: "calories", h: pct(m.calories.consumed, m.calories.target), consumed: m.calories.consumed, target: m.calories.target },
                  { macro: "protein", h: pct(m.protein.consumed, m.protein.target), consumed: m.protein.consumed, target: m.protein.target },
                  { macro: "carbs", h: pct(m.carbs.consumed, m.carbs.target), consumed: m.carbs.consumed, target: m.carbs.target },
                  { macro: "fat", h: pct(m.fat.consumed, m.fat.target), consumed: m.fat.consumed, target: m.fat.target },
                ];
                const isActiveDay = tooltip?.dayKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => log && openDay(date)}
                    disabled={!log}
                    aria-label={`${dayLabel(date, lang)} ${fmtDate(date, lang)}`}
                    className={cn(
                      "h-full flex items-end justify-center gap-[2px] sm:gap-[3px] rounded-sm",
                      "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      log && "hover:bg-accent/40 cursor-pointer",
                      isActiveDay && "bg-accent/60",
                    )}
                  >
                    {bars.map((b) => (
                      <span
                        key={b.macro}
                        role="button"
                        tabIndex={log ? 0 : -1}
                        aria-label={`${macroLabel(b.macro)} ${Math.round(b.consumed)} ${MACRO_UNIT[b.macro]}`}
                        onMouseEnter={(e) =>
                          log && showTooltip(e, key, b.macro, b.consumed, b.target)
                        }
                        onClick={(e) => {
                          if (!log) return;
                          e.stopPropagation();
                          // Tap on bar: show tooltip; if already shown for this bar, open detail
                          if (
                            tooltip?.dayKey === key &&
                            tooltip?.macro === b.macro
                          ) {
                            openDay(date);
                          } else {
                            showTooltip(e, key, b.macro, b.consumed, b.target);
                          }
                        }}
                        className={cn(
                          "block w-1.5 sm:w-2.5 rounded-sm transition-all",
                          log && "hover:opacity-80",
                        )}
                        style={{
                          height: `${(Math.min(150, b.h) / 150) * 100}%`,
                          minHeight: log && b.h > 0 ? 2 : 0,
                          background: COLORS[b.macro],
                          opacity: log ? 1 : 0.25,
                        }}
                      />
                    ))}
                  </button>
                );
              })}
            </div>

            {/* Floating tooltip */}
            {tooltip && (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
                style={{ left: tooltip.x, top: tooltip.y - 8 }}
              >
                <div className="bg-popover text-popover-foreground border rounded-md shadow-lg px-3 py-2 min-w-[150px] text-xs">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="font-semibold">
                      {macroLabel(tooltip.macro)}
                    </span>
                    {tooltip.target ? (
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          tooltip.consumed > tooltip.target && "text-destructive",
                        )}
                      >
                        {Math.round((tooltip.consumed / tooltip.target) * 100)}%
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold tabular-nums">
                    {Math.round(tooltip.consumed)} {MACRO_UNIT[tooltip.macro]}
                  </p>
                  {tooltip.target ? (
                    <div className="mt-1.5 space-y-0.5 text-muted-foreground tabular-nums">
                      <div className="flex justify-between gap-3">
                        <span>{t("Doel", "Target")}</span>
                        <span>
                          {Math.round(tooltip.target)} {MACRO_UNIT[tooltip.macro]}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span>{t("Verschil", "Difference")}</span>
                        <span
                          className={
                            tooltip.consumed > tooltip.target
                              ? "text-destructive"
                              : "text-emerald-600"
                          }
                        >
                          {tooltip.consumed - tooltip.target >= 0 ? "+" : ""}
                          {Math.round(tooltip.consumed - tooltip.target)}{" "}
                          {MACRO_UNIT[tooltip.macro]}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* Day labels row — also clickable to open day detail */}
          <div className="grid grid-cols-7 gap-1 sm:gap-3 mt-2">
            {days.map(({ date, key }) => {
              const now = new Date();
              const todayKey = `${now.getFullYear()}-${String(
                now.getMonth() + 1,
              ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
              const isToday = key === todayKey;
              const log = logByDate.get(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => log && openDay(date)}
                  disabled={!log}
                  className={cn(
                    "flex flex-col items-center min-w-0 rounded-md py-1 transition-colors",
                    log && "hover:bg-accent/50 cursor-pointer",
                    !log && "cursor-default",
                  )}
                >
                  <p
                    className={cn(
                      "text-[10px] sm:text-xs font-semibold truncate max-w-full capitalize",
                      isToday ? "text-primary" : "text-foreground",
                    )}
                  >
                    <span className="sm:hidden">{dayLabel(date, lang, true)}</span>
                    <span className="hidden sm:inline">{dayLabel(date, lang)}</span>
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground whitespace-nowrap">
                    {fmtDate(date, lang)}
                  </p>
                </button>
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
        <p className="text-[11px] text-muted-foreground mt-2">
          {t(
            "Tip: tik of klik op een dag om maaltijden en nutriënten te bekijken.",
            "Tip: tap or click a day to see meals and nutrients.",
          )}
        </p>
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

      <NutritionDayDetailDialog
        open={!!detailDate}
        onOpenChange={(o) => !o && setDetailDate(null)}
        lang={lang}
        date={detailDate}
        log={detailLog}
        targets={targets}
      />
    </div>
  );
};

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
    <span>{label}</span>
  </div>
);
