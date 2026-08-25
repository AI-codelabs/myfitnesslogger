import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Flame } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";
import { useClientHome } from "@/lib/clientHome";

const tx = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

interface Targets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}
interface Consumed {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

function MacroRow({
  label,
  eaten,
  target,
  colorClass,
  unit = "g",
}: {
  label: string;
  eaten: number;
  target: number;
  colorClass: string;
  unit?: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((eaten / target) * 100)) : 0;
  const left = Math.max(0, Math.round(target - eaten));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold tabular-nums">
          {Math.round(eaten)} / {Math.round(target)}{unit}
          <span className="text-muted-foreground font-normal ml-1.5">
            · {left}{unit}
          </span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function NutritionTodayCard({ lang }: { lang: Lang }) {
  const { data, loading } = useClientHome();
  if (loading || !data) return null;

  const d = (data.nutritionPlanDetails as any) ?? null;
  if (!d || !d.calories) return null;

  const targets: Targets = {
    calories: Number(d.calories) || 0,
    protein_g: Number(d.protein_g) || 0,
    carbs_g: Number(d.carbs_g) || 0,
    fat_g: Number(d.fat_g) || 0,
  };
  const log = data.nutritionToday;
  const consumed: Consumed = {
    calories: Number(log?.calories) || 0,
    protein_g: Number(log?.protein_g) || 0,
    carbs_g: Number(log?.carbs_g) || 0,
    fat_g: Number(log?.fat_g) || 0,
  };

  const kcalLeft = Math.max(0, Math.round(targets.calories - consumed.calories));
  const kcalPct =
    targets.calories > 0
      ? Math.min(100, Math.round((consumed.calories / targets.calories) * 100))
      : 0;
  const over = consumed.calories > targets.calories;

  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-bold">
          {tx(lang, "Voeding vandaag", "Nutrition today")}
        </h3>
        <div className="flex items-center gap-3">
          <Link
            to="/meal-plan"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            {tx(lang, "Maaltijdplan", "Meal plan")}
            <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            to="/nutrition"
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {tx(lang, "Details", "Details")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center shrink-0">
            <Flame className="h-6 w-6 text-orange-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                {over ? `+${Math.round(consumed.calories - targets.calories)}` : kcalLeft}
              </span>
              <span className="text-sm text-muted-foreground">
                {over
                  ? tx(lang, "kcal over doel", "kcal over target")
                  : tx(lang, "kcal over", "kcal left")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {Math.round(consumed.calories)} / {Math.round(targets.calories)} kcal
            </p>
          </div>
        </div>

        <Progress value={kcalPct} className="h-2 mb-4" />

        <div className="space-y-3">
          <MacroRow
            label={tx(lang, "Eiwit", "Protein")}
            eaten={consumed.protein_g}
            target={targets.protein_g}
            colorClass="bg-blue-500"
          />
          <MacroRow
            label={tx(lang, "Koolhydraten", "Carbs")}
            eaten={consumed.carbs_g}
            target={targets.carbs_g}
            colorClass="bg-amber-500"
          />
          <MacroRow
            label={tx(lang, "Vet", "Fat")}
            eaten={consumed.fat_g}
            target={targets.fat_g}
            colorClass="bg-rose-500"
          />
        </div>

        {consumed.calories === 0 && (
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
            {tx(
              lang,
              "Nog niets gelogd voor vandaag in Cronometer.",
              "Nothing logged yet today in Cronometer.",
            )}
          </p>
        )}
      </Card>
    </section>
  );
}
