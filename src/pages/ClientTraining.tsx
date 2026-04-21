import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface Assignment {
  id: string;
  plan_id: string;
  is_active: boolean;
  start_date: string | null;
  weeks: number | null;
  days: string[] | null;
}

interface Plan {
  id: string;
  name: string;
}

interface DayWithExercises {
  id: string;
  name: string;
  day_index: number;
  plan_id: string;
  exercises: {
    id: string;
    sets_reps: string | null;
    notes: string | null;
    exercise: { name: string; muscle_group: string | null } | null;
  }[];
}

interface ScheduledOccurrence {
  assignmentId: string;
  planId: string;
  planName: string;
  occurrenceIndex: number;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const ClientTraining = () => {
  const { user } = useAuth();
  const [lang] = useState<Lang>(
    () => (localStorage.getItem("onbLang") as Lang) || "nl"
  );
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planDays, setPlanDays] = useState<Record<string, DayWithExercises[]>>({});
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const { data: a } = await supabase
        .from("client_workout_assignments")
        .select("id, plan_id, is_active, start_date, weeks, days")
        .eq("client_id", user.id);

      const assigns = (a ?? []) as Assignment[];
      setAssignments(assigns);

      const planIds = Array.from(new Set(assigns.map((x) => x.plan_id)));
      if (planIds.length === 0) {
        setPlans([]);
        setPlanDays({});
        setLoading(false);
        return;
      }

      const [{ data: p }, { data: days }] = await Promise.all([
        supabase.from("workout_plans").select("id, name").in("id", planIds),
        supabase
          .from("workout_plan_days")
          .select("id, name, day_index, plan_id")
          .in("plan_id", planIds)
          .order("day_index"),
      ]);
      setPlans((p ?? []) as Plan[]);

      const dayIds = (days ?? []).map((d: any) => d.id);
      let exByDay: Record<string, any[]> = {};
      if (dayIds.length) {
        const { data: ex } = await supabase
          .from("workout_plan_exercises")
          .select(
            "id, day_id, order_index, sets_reps, notes, exercise:exercises(name, muscle_group)"
          )
          .in("day_id", dayIds)
          .order("order_index");
        for (const e of ex ?? []) {
          (exByDay[(e as any).day_id] ||= []).push(e);
        }
      }
      const grouped: Record<string, DayWithExercises[]> = {};
      for (const d of (days ?? []) as any[]) {
        (grouped[d.plan_id] ||= []).push({
          id: d.id,
          name: d.name,
          day_index: d.day_index,
          plan_id: d.plan_id,
          exercises: exByDay[d.id] ?? [],
        });
      }
      setPlanDays(grouped);
      setLoading(false);
    })();
  }, [user?.id]);

  // Build map: dateKey -> ScheduledOccurrence[]
  const planned = useMemo(() => {
    const map = new Map<string, ScheduledOccurrence[]>();
    const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "";
    for (const a of assignments) {
      if (
        !a.is_active ||
        !a.start_date ||
        !a.weeks ||
        !a.days ||
        a.days.length === 0
      )
        continue;
      const start = startOfDay(new Date(a.start_date));
      const totalDays = a.weeks * 7;
      let occurrence = 0;
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(start, i);
        const key = DAY_KEYS[d.getDay()];
        if (a.days.includes(key)) {
          occurrence++;
          const k = d.toISOString().slice(0, 10);
          const arr = map.get(k) ?? [];
          arr.push({
            assignmentId: a.id,
            planId: a.plan_id,
            planName: planName(a.plan_id),
            occurrenceIndex: occurrence,
          });
          map.set(k, arr);
        }
      }
    }
    return map;
  }, [assignments, plans]);

  const today = startOfDay(new Date());
  const dateKey = currentDate.toISOString().slice(0, 10);
  const occurrences = planned.get(dateKey) ?? [];

  const dateLabel = currentDate.toLocaleDateString(
    lang === "nl" ? "nl-NL" : "en-US",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );

  const goPrev = () => setCurrentDate((d) => addDays(d, -1));
  const goNext = () => setCurrentDate((d) => addDays(d, 1));
  const goToday = () => setCurrentDate(startOfDay(new Date()));

  return (
    <div className="container max-w-3xl py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {tx("Training", "Training")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tx(
            "Bekijk wat je vandaag op de planning hebt staan.",
            "See what's scheduled for you today."
          )}
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {sameDay(currentDate, today)
                ? tx("Vandaag", "Today")
                : tx("Geplande dag", "Scheduled day")}
            </p>
            <h2 className="text-lg font-semibold capitalize">{dateLabel}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={goPrev}
              aria-label={tx("Vorige dag", "Previous day")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToday}
              disabled={sameDay(currentDate, today)}
            >
              {tx("Vandaag", "Today")}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={goNext}
              aria-label={tx("Volgende dag", "Next day")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : occurrences.length === 0 ? (
          <div
            className={cn(
              "rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
            )}
          >
            {tx("Geen training gepland voor deze dag.", "No workout scheduled for this day.")}
          </div>
        ) : (
          <div className="space-y-4">
            {occurrences.map((occ) => {
              const days = planDays[occ.planId] ?? [];
              const dayForToday =
                days.length > 0
                  ? days[(occ.occurrenceIndex - 1) % days.length]
                  : null;
              return (
                <div
                  key={occ.assignmentId}
                  className="rounded-md border p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Dumbbell className="h-4 w-4 text-primary" />
                        <h4 className="font-semibold">{occ.planName}</h4>
                        {dayForToday && (
                          <Badge variant="secondary" className="text-[10px]">
                            {dayForToday.name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {tx("Training", "Workout")} #{occ.occurrenceIndex}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/workouts/${occ.planId}`} className="gap-1">
                        {tx("Bekijk schema", "View plan")}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>

                  {!dayForToday ? (
                    <p className="text-sm text-muted-foreground">
                      {tx(
                        "Geen oefeningen geconfigureerd.",
                        "No exercises configured."
                      )}
                    </p>
                  ) : dayForToday.exercises.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {tx(
                        "Geen oefeningen voor deze dag.",
                        "No exercises for this day."
                      )}
                    </p>
                  ) : (
                    <ol className="space-y-2">
                      {dayForToday.exercises.map((e, i) => (
                        <li
                          key={e.id}
                          className="flex items-start gap-3 rounded-md bg-muted/40 p-2.5"
                        >
                          <span className="text-xs font-semibold text-muted-foreground w-5 shrink-0 pt-0.5">
                            {i + 1}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">
                                {e.exercise?.name ?? "—"}
                              </span>
                              {e.exercise?.muscle_group && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] capitalize"
                                >
                                  {e.exercise.muscle_group}
                                </Badge>
                              )}
                            </div>
                            {e.sets_reps && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {e.sets_reps}
                              </p>
                            )}
                            {e.notes && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">
                                {e.notes}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ClientTraining;
