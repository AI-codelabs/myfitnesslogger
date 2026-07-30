import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";
import {
  DiaryEntriesRaw,
  NUTRIENT_GROUPS,
  formatNutrientValue,
  parseMealsFromEntries,
  round1,
  sortMeals,
  translateMealName,
  type MealGroup,
  type MealMacros,
} from "@/lib/nutritionDiary";

/** @deprecated Prefer structured diary entries; kept for callers that still type flat rows. */
export interface NutritionEntry {
  name?: string;
  amount?: string;
  group?: string;
  category?: string;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
}

export interface DayDetailLog {
  log_date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  entries?: DiaryEntriesRaw | NutritionEntry[] | null;
}

interface Targets {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lang: Lang;
  date: Date | null;
  log: DayDetailLog | null;
  targets: Targets;
}

const NUTRIENT_COLORS = {
  calories: "hsl(142 70% 45%)",
  protein: "hsl(210 80% 60%)",
  carbs: "hsl(0 75% 55%)",
  fat: "hsl(25 90% 55%)",
};

export function NutritionDayDetailDialog({
  open,
  onOpenChange,
  lang,
  date,
  log,
  targets,
}: Props) {
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const [showAllNutrients, setShowAllNutrients] = useState(false);
  const [openMeal, setOpenMeal] = useState<string | null>(null);

  const dateLabel = date
    ? date.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  const parsed = useMemo(
    () => parseMealsFromEntries((log?.entries as DiaryEntriesRaw) ?? null),
    [log?.entries],
  );

  const meals = useMemo(
    () => sortMeals(parsed.meals, lang === "nl" ? "nl" : "en"),
    [parsed.meals, lang],
  );

  const nutrients = parsed.nutrients ?? {};
  const hasNutrients = Object.keys(nutrients).length > 0;

  // Secondary day stats: prefer DB columns, then meal totals / nutrient map.
  const secondary = useMemo(() => {
    const mealSum = (key: keyof MealMacros) =>
      meals.reduce((s, m) => s + (Number(m.macros[key]) || 0), 0);
    const fromNutrient = (...keys: string[]) => {
      for (const k of keys) {
        if (nutrients[k] != null) return Number(nutrients[k]) || 0;
      }
      return 0;
    };
    return {
      fiber: Number(log?.fiber_g) || mealSum("fiber_g") || fromNutrient("Fiber"),
      sugar: Number(log?.sugar_g) || mealSum("sugar_g") || fromNutrient("Sugars"),
      sodium: Number(log?.sodium_mg) || mealSum("sodium_mg") || fromNutrient("Sodium"),
      netCarbs: mealSum("net_carbs_g") || fromNutrient("Net Carbs"),
      potassium: mealSum("potassium_mg") || fromNutrient("Potassium"),
      magnesium: mealSum("magnesium_mg") || fromNutrient("Magnesium"),
    };
  }, [log, meals, nutrients]);

  // Default-expand first meal when dialog opens with data
  const firstMealKey = meals[0] ? translateMealName(meals[0].name, lang === "nl" ? "nl" : "en") : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setShowAllNutrients(false);
          setOpenMeal(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 border-b sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="capitalize text-lg">
                {t("Dagdetail voeding", "Nutrition day detail")}
              </DialogTitle>
              <p className="text-sm text-muted-foreground capitalize">{dateLabel}</p>
            </div>
            {parsed.completed && (
              <Badge variant="outline" className="shrink-0 bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t("Compleet", "Complete")}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {!log ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("Geen voedingsdata voor deze dag.", "No nutrition data for this day.")}
          </div>
        ) : (
          <div className="px-5 sm:px-6 py-5 space-y-7">
            {/* Daily macros vs targets */}
            <section className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {t("Dagoverzicht", "Daily summary")}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MacroProgress
                  label={t("Calorieën", "Calories")}
                  consumed={log.calories}
                  target={targets.calories}
                  unit="kcal"
                  color={NUTRIENT_COLORS.calories}
                />
                <MacroProgress
                  label={t("Eiwit", "Protein")}
                  consumed={log.protein_g}
                  target={targets.protein_g}
                  unit="g"
                  color={NUTRIENT_COLORS.protein}
                />
                <MacroProgress
                  label={t("Koolhydraten", "Carbs")}
                  consumed={log.carbs_g}
                  target={targets.carbs_g}
                  unit="g"
                  color={NUTRIENT_COLORS.carbs}
                />
                <MacroProgress
                  label={t("Vet", "Fat")}
                  consumed={log.fat_g}
                  target={targets.fat_g}
                  unit="g"
                  color={NUTRIENT_COLORS.fat}
                />
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                <StatChip label={t("Vezels", "Fiber")} value={`${round1(secondary.fiber)}g`} />
                <StatChip label={t("Suiker", "Sugar")} value={`${round1(secondary.sugar)}g`} />
                <StatChip label={t("Natrium", "Sodium")} value={`${Math.round(secondary.sodium)}mg`} />
                {secondary.netCarbs > 0 && (
                  <StatChip label={t("Netto KH", "Net carbs")} value={`${round1(secondary.netCarbs)}g`} />
                )}
                {secondary.potassium > 0 && (
                  <StatChip label={t("Kalium", "Potassium")} value={`${Math.round(secondary.potassium)}mg`} />
                )}
                {secondary.magnesium > 0 && (
                  <StatChip label={t("Magnesium", "Magnesium")} value={`${Math.round(secondary.magnesium)}mg`} />
                )}
              </div>
            </section>

            {/* Meals */}
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t("Maaltijden", "Meals")}
                </h3>
                {meals.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {meals.length} {t("maaltijd(en)", "meal(s)")} ·{" "}
                    {meals.reduce((s, m) => s + m.foods.length, 0)} {t("items", "items")}
                  </p>
                )}
              </div>

              {meals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Geen voedingsmiddelen vastgelegd voor deze dag. Synchroniseer opnieuw om maaltijddetails op te halen.",
                    "No foods logged for this day. Sync again to pull meal details.",
                  )}
                </p>
              ) : (
                <div className="space-y-2">
                  {meals.map((meal) => {
                    const label = translateMealName(meal.name, lang === "nl" ? "nl" : "en");
                    const expanded =
                      openMeal === label ||
                      (openMeal === null && label === firstMealKey);
                    return (
                      <MealBlock
                        key={label}
                        meal={meal}
                        label={label}
                        expanded={expanded}
                        lang={lang}
                        onToggle={() =>
                          setOpenMeal((cur) => {
                            const isOpen =
                              cur === label || (cur === null && label === firstMealKey);
                            // Collapse current → use sentinel; open another → that label
                            if (isOpen) return "";
                            return label;
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>

            {/* Micronutrients */}
            {hasNutrients && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {t("Micronutriënten", "Micronutrients")}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowAllNutrients((v) => !v)}
                  >
                    {showAllNutrients
                      ? t("Minder tonen", "Show less")
                      : t("Alles tonen", "Show all")}
                    {showAllNutrients ? (
                      <ChevronUp className="h-3.5 w-3.5 ml-1" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    )}
                  </Button>
                </div>

                <div className="space-y-4">
                  {NUTRIENT_GROUPS.map((group) => {
                    const rows = group.keys
                      .map((key) => ({ key, value: nutrients[key] }))
                      .filter((r) => r.value != null && Number(r.value) !== 0);
                    if (rows.length === 0) return null;
                    const visible = showAllNutrients ? rows : rows.slice(0, 6);
                    return (
                      <div key={group.id}>
                        <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                          {lang === "nl" ? group.nl : group.en}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
                          {visible.map(({ key, value }) => (
                            <div
                              key={key}
                              className="flex items-baseline justify-between gap-2 text-xs border-b border-border/40 pb-1"
                            >
                              <span className="text-muted-foreground truncate">{key}</span>
                              <span className="font-medium tabular-nums whitespace-nowrap">
                                {formatNutrientValue(key, Number(value))}
                              </span>
                            </div>
                          ))}
                        </div>
                        {!showAllNutrients && rows.length > 6 && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            +{rows.length - 6} {t("meer", "more")}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Any leftover nutrients not in curated groups */}
                  {showAllNutrients && (() => {
                    const known = new Set(NUTRIENT_GROUPS.flatMap((g) => g.keys));
                    const rest = Object.entries(nutrients)
                      .filter(([k, v]) => !known.has(k) && Number(v) !== 0)
                      .sort(([a], [b]) => a.localeCompare(b));
                    if (!rest.length) return null;
                    return (
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                          {t("Overig", "Other")}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5">
                          {rest.map(([key, value]) => (
                            <div
                              key={key}
                              className="flex items-baseline justify-between gap-2 text-xs border-b border-border/40 pb-1"
                            >
                              <span className="text-muted-foreground truncate">{key}</span>
                              <span className="font-medium tabular-nums whitespace-nowrap">
                                {formatNutrientValue(key, Number(value))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MealBlock({
  meal,
  label,
  expanded,
  lang,
  onToggle,
}: {
  meal: MealGroup;
  label: string;
  expanded: boolean;
  lang: Lang;
  onToggle: () => void;
}) {
  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const m = meal.macros;

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 flex items-center gap-2">
          <h4 className="font-semibold text-sm">{label}</h4>
          <Badge variant="secondary" className="text-[10px]">
            {meal.foods.length}{" "}
            {meal.foods.length === 1 ? t("item", "item") : t("items", "items")}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-sm font-semibold tabular-nums">
            {Math.round(m.calories)} kcal
          </p>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t">
          {/* Meal macros */}
          <div className="px-4 py-2.5 bg-muted/20 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
            <span>
              <span className="text-foreground font-medium">{round1(m.protein_g)}g</span>{" "}
              {t("eiwit", "protein")}
            </span>
            <span>
              <span className="text-foreground font-medium">{round1(m.carbs_g)}g</span>{" "}
              {t("kh", "carbs")}
            </span>
            <span>
              <span className="text-foreground font-medium">{round1(m.fat_g)}g</span>{" "}
              {t("vet", "fat")}
            </span>
            {(m.fiber_g ?? 0) > 0 && (
              <span>
                <span className="text-foreground font-medium">{round1(m.fiber_g!)}g</span>{" "}
                {t("vezels", "fiber")}
              </span>
            )}
            {(m.sugar_g ?? 0) > 0 && (
              <span>
                <span className="text-foreground font-medium">{round1(m.sugar_g!)}g</span>{" "}
                {t("suiker", "sugar")}
              </span>
            )}
            {(m.sodium_mg ?? 0) > 0 && (
              <span>
                <span className="text-foreground font-medium">{Math.round(m.sodium_mg!)}mg</span>{" "}
                {t("natrium", "sodium")}
              </span>
            )}
            {(m.net_carbs_g ?? 0) > 0 && (
              <span>
                <span className="text-foreground font-medium">{round1(m.net_carbs_g!)}g</span>{" "}
                {t("netto kh", "net carbs")}
              </span>
            )}
          </div>

          <ul className="divide-y">
            {meal.foods.length === 0 ? (
              <li className="px-4 py-3 text-xs text-muted-foreground">
                {t("Geen items in deze maaltijd.", "No items in this meal.")}
              </li>
            ) : (
              meal.foods.map((food, i) => (
                <li key={i} className="px-4 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{food.name}</p>
                    {food.serving && (
                      <p className="text-xs text-muted-foreground mt-0.5">{food.serving}</p>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5 text-center">
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className="text-xs font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function MacroProgress({
  label,
  consumed,
  target,
  unit,
  color,
}: {
  label: string;
  consumed: number;
  target?: number | null;
  unit: string;
  color: string;
}) {
  const hasTarget = !!target && target > 0;
  const pct = hasTarget ? Math.round((consumed / (target as number)) * 100) : 0;
  const over = hasTarget && consumed > (target as number);
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
          <p className="text-sm font-medium truncate">{label}</p>
        </div>
        {hasTarget && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              over ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {pct}%
          </span>
        )}
      </div>
      <Progress value={Math.min(100, pct)} className="h-1.5" />
      <p className="text-xs text-muted-foreground tabular-nums">
        <span className="text-foreground font-semibold">{Math.round(consumed)}</span>
        {hasTarget ? ` / ${Math.round(target as number)}` : ""} {unit}
      </p>
    </div>
  );
}
