import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";

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
  entries?: NutritionEntry[] | null;
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

// Preferred meal-group ordering. Unknown groups appear after these in insertion order.
const MEAL_ORDER_NL = ["Ontbijt", "Lunch", "Diner", "Snacks"];
const MEAL_ORDER_EN = ["Breakfast", "Lunch", "Dinner", "Snacks"];

function translateGroup(name: string, lang: Lang): string {
  if (lang !== "nl") return name;
  const map: Record<string, string> = {
    Breakfast: "Ontbijt",
    Lunch: "Lunch",
    Dinner: "Diner",
    Snacks: "Snacks",
    Snack: "Snack",
  };
  return map[name] ?? name;
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

  const dateLabel = date
    ? date.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  // Group entries by meal
  const groups = new Map<string, NutritionEntry[]>();
  if (log?.entries?.length) {
    for (const e of log.entries) {
      const key = translateGroup(e.group?.trim() || t("Overig", "Other"), lang);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
  }
  const order = lang === "nl" ? MEAL_ORDER_NL : MEAL_ORDER_EN;
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 border-b">
          <DialogTitle className="capitalize text-lg">
            {t("Dagdetail voeding", "Nutrition day detail")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground capitalize">{dateLabel}</p>
        </DialogHeader>

        {!log ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("Geen voedingsdata voor deze dag.", "No nutrition data for this day.")}
          </div>
        ) : (
          <div className="px-5 sm:px-6 py-5 space-y-6">
            {/* Daily summary */}
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
            </section>

            {/* Meals */}
            <section className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {t("Maaltijden", "Meals")}
              </h3>
              {sortedGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "Geen voedingsmiddelen vastgelegd voor deze dag.",
                    "No foods logged for this day.",
                  )}
                </p>
              ) : (
                <div className="space-y-3">
                  {sortedGroups.map(([groupName, items]) => {
                    const groupTotals = items.reduce(
                      (acc, it) => ({
                        cal: acc.cal + (it.calories ?? 0),
                        p: acc.p + (it.protein ?? 0),
                        c: acc.c + (it.carbohydrates ?? 0),
                        f: acc.f + (it.fat ?? 0),
                      }),
                      { cal: 0, p: 0, c: 0, f: 0 },
                    );
                    return (
                      <div key={groupName} className="rounded-lg border overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/40">
                          <div className="flex items-center gap-2 min-w-0">
                            <h4 className="font-semibold text-sm">{groupName}</h4>
                            <Badge variant="secondary" className="text-[10px]">
                              {items.length}{" "}
                              {items.length === 1
                                ? t("item", "item")
                                : t("items", "items")}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                            {Math.round(groupTotals.cal)} kcal
                          </p>
                        </div>
                        <ul className="divide-y">
                          {items.map((it, i) => (
                            <li
                              key={i}
                              className="px-4 py-3 flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                  {it.name ?? "—"}
                                </p>
                                {it.amount && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {it.amount}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                                  <span>
                                    <span className="text-foreground font-medium">
                                      {fmtG(it.protein)}
                                    </span>{" "}
                                    {t("eiwit", "protein")}
                                  </span>
                                  <span>
                                    <span className="text-foreground font-medium">
                                      {fmtG(it.carbohydrates)}
                                    </span>{" "}
                                    {t("kh", "carbs")}
                                  </span>
                                  <span>
                                    <span className="text-foreground font-medium">
                                      {fmtG(it.fat)}
                                    </span>{" "}
                                    {t("vet", "fat")}
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
                                {Math.round(it.calories ?? 0)} kcal
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function fmtG(v?: number) {
  if (v == null || isNaN(v as number)) return "0g";
  return `${Math.round((v as number) * 10) / 10}g`;
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
          <span
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ background: color }}
          />
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
        <span className="text-foreground font-semibold">
          {Math.round(consumed)}
        </span>
        {hasTarget ? ` / ${Math.round(target as number)}` : ""} {unit}
      </p>
    </div>
  );
}
