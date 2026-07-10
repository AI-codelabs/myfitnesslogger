import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChefHat, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MealPlanStructure,
  coerceStructure,
  optionTotals,
} from "@/lib/mealPlan";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  structure: unknown;
}

interface Selection {
  id: string;
  category_id: string;
  option_id: string;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Client-facing meal plan view with daily picker.
// For each meal category, the client picks one option for the day.
// Picks are persisted in client_meal_selections keyed by (client, plan, date, category).
export default function ClientMealPlanView() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const structure: MealPlanStructure = useMemo(
    () => coerceStructure(plan?.structure),
    [plan],
  );

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from("client_meal_plans")
        .select("*")
        .eq("client_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPlan((p as Plan) ?? null);
      if (p) {
        const { data: sels } = await supabase
          .from("client_meal_selections")
          .select("id, category_id, option_id")
          .eq("client_id", user.id)
          .eq("plan_id", p.id)
          .eq("entry_date", todayIso());
        setSelections((sels as Selection[]) ?? []);
      }
      setLoading(false);
    })();
  }, [user]);

  const picked = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of selections) map.set(s.category_id, s.option_id);
    return map;
  }, [selections]);

  const totals = useMemo(() => {
    let kcal = 0,
      p = 0,
      c = 0,
      f = 0;
    for (const cat of structure.categories) {
      const optId = picked.get(cat.id);
      const opt = cat.options.find((o) => o.id === optId);
      if (!opt) continue;
      const t = optionTotals(opt);
      kcal += t.kcal;
      p += t.protein_g;
      c += t.carbs_g;
      f += t.fat_g;
    }
    return { kcal, protein_g: p, carbs_g: c, fat_g: f };
  }, [structure, picked]);

  async function pick(catId: string, optId: string) {
    if (!user || !plan) return;
    setSavingKey(catId);
    // Upsert on unique key (client, plan, date, category)
    const { error, data } = await supabase
      .from("client_meal_selections")
      .upsert(
        {
          client_id: user.id,
          plan_id: plan.id,
          entry_date: todayIso(),
          category_id: catId,
          option_id: optId,
        },
        { onConflict: "client_id,plan_id,entry_date,category_id" },
      )
      .select("id, category_id, option_id")
      .single();
    setSavingKey(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSelections((prev) => {
      const others = prev.filter((s) => s.category_id !== catId);
      return data ? [...others, data as Selection] : others;
    });
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Link
          to="/"
          className="text-xs text-muted-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Home
        </Link>
        <Card className="p-10 text-center">
          <ChefHat className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No meal plan yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your coach hasn't assigned an editable meal plan. Check your nutrition
            documents in the meantime.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <Link
        to="/"
        className="text-xs text-muted-foreground flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Home
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{plan.name}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Target {plan.target_kcal} kcal · P{plan.protein_g} / C{plan.carbs_g} / F
          {plan.fat_g}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs text-muted-foreground">Today's picks</span>
          <span className="text-sm font-semibold tabular-nums">
            {Math.round(totals.kcal)} / {plan.target_kcal} kcal
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums">
          <div>P {totals.protein_g.toFixed(0)} / {plan.protein_g}g</div>
          <div>C {totals.carbs_g.toFixed(0)} / {plan.carbs_g}g</div>
          <div>F {totals.fat_g.toFixed(0)} / {plan.fat_g}g</div>
        </div>
      </Card>

      {structure.categories.map((cat) => {
        const selectedOptId = picked.get(cat.id);
        return (
          <Card key={cat.id} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{cat.name}</h3>
              {selectedOptId && (
                <Badge variant="secondary" className="text-[10px]">
                  Picked
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {cat.options.map((opt) => {
                const t = optionTotals(opt);
                const isPicked = selectedOptId === opt.id;
                const busy = savingKey === cat.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => pick(cat.id, opt.id)}
                    disabled={busy}
                    className={cn(
                      "w-full text-left rounded-md border p-3 transition-colors",
                      isPicked
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {isPicked && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-medium text-sm">{opt.name}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                        {Math.round(t.kcal)} kcal · P{t.protein_g.toFixed(0)}/C
                        {t.carbs_g.toFixed(0)}/F{t.fat_g.toFixed(0)}
                      </span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {opt.items.map((i) => (
                        <li
                          key={i.id}
                          className="flex justify-between gap-3 tabular-nums"
                        >
                          <span className="truncate">{i.product}</span>
                          <span className="shrink-0">
                            {Math.round(i.kcal)} kcal
                          </span>
                        </li>
                      ))}
                    </ul>
                    {opt.notes && (
                      <p className="mt-2 text-[11px] italic text-muted-foreground">
                        {opt.notes}
                      </p>
                    )}
                  </button>
                );
              })}
              {selectedOptId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("client_meal_selections")
                      .delete()
                      .eq("client_id", user!.id)
                      .eq("plan_id", plan.id)
                      .eq("entry_date", todayIso())
                      .eq("category_id", cat.id);
                    if (error) return toast.error(error.message);
                    setSelections((prev) =>
                      prev.filter((s) => s.category_id !== cat.id),
                    );
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Clear pick
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
