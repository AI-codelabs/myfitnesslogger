import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  frequency_per_week: number | null;
  category: string | null;
  is_template: boolean;
}
interface Day {
  id: string;
  name: string;
  day_index: number;
}
interface PlanExercise {
  id: string;
  day_id: string;
  order_index: number;
  sets_reps: string | null;
  exercise: { name: string; is_pro: boolean; muscle_group: string | null };
}

export default function WorkoutPlan() {
  const { planId } = useParams();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [items, setItems] = useState<PlanExercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) return;
    (async () => {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from("workout_plans").select("*").eq("id", planId).maybeSingle(),
        supabase.from("workout_plan_days").select("*").eq("plan_id", planId).order("day_index"),
      ]);
      setPlan(p as Plan | null);
      setDays((d ?? []) as Day[]);
      const dayIds = (d ?? []).map((x: any) => x.id);
      if (dayIds.length) {
        const { data: ex } = await supabase
          .from("workout_plan_exercises")
          .select("id, day_id, order_index, sets_reps, exercise:exercises(name, is_pro, muscle_group)")
          .in("day_id", dayIds)
          .order("order_index");
        setItems((ex ?? []) as any);
      }
      setLoading(false);
    })();
  }, [planId]);

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  if (!plan) return <div className="p-8">Plan not found.</div>;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Link to="/workouts">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Workouts
        </Button>
      </Link>

      <header>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-semibold tracking-tight">{plan.name}</h1>
          {plan.is_template && <Badge variant="secondary">Template</Badge>}
          {plan.frequency_per_week && <Badge variant="outline">{plan.frequency_per_week}x / week</Badge>}
        </div>
        {plan.description && <p className="text-muted-foreground mt-2">{plan.description}</p>}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {days.map((d) => {
          const dayItems = items.filter((i) => i.day_id === d.id);
          return (
            <Card key={d.id}>
              <CardHeader className="border-b">
                <CardTitle className="text-base">{d.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {dayItems.map((it) => (
                    <li key={it.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          <span className="truncate">{it.exercise?.name}</span>
                          {it.exercise?.is_pro && (
                            <Badge className="bg-secondary text-secondary-foreground text-[10px] py-0 px-1.5">
                              PRO
                            </Badge>
                          )}
                        </div>
                        {it.exercise?.muscle_group && (
                          <p className="text-xs text-muted-foreground capitalize">
                            {it.exercise.muscle_group}
                          </p>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {it.sets_reps}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
