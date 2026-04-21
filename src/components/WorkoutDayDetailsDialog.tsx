import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, Dumbbell } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";

export interface ScheduledOccurrence {
  assignmentId: string;
  planId: string;
  planName: string;
  /** 1-based: the Nth scheduled training day within this assignment */
  occurrenceIndex: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: Date | null;
  occurrences: ScheduledOccurrence[];
  lang: Lang;
}

interface DayWithExercises {
  id: string;
  name: string;
  day_index: number;
  exercises: {
    id: string;
    sets_reps: string | null;
    notes: string | null;
    exercise: { name: string; muscle_group: string | null } | null;
  }[];
}

export function WorkoutDayDetailsDialog({ open, onOpenChange, date, occurrences, lang }: Props) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const [loading, setLoading] = useState(false);
  const [planDays, setPlanDays] = useState<Record<string, DayWithExercises[]>>({});

  useEffect(() => {
    if (!open || occurrences.length === 0) return;
    const planIds = Array.from(new Set(occurrences.map((o) => o.planId)));
    (async () => {
      setLoading(true);
      const { data: days } = await supabase
        .from("workout_plan_days")
        .select("id, name, day_index, plan_id")
        .in("plan_id", planIds)
        .order("day_index");
      const dayIds = (days ?? []).map((d: any) => d.id);
      let exByDay: Record<string, any[]> = {};
      if (dayIds.length) {
        const { data: ex } = await supabase
          .from("workout_plan_exercises")
          .select("id, day_id, order_index, sets_reps, notes, exercise:exercises(name, muscle_group)")
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
          exercises: exByDay[d.id] ?? [],
        });
      }
      setPlanDays(grouped);
      setLoading(false);
    })();
  }, [open, occurrences]);

  const dateLabel = date
    ? date.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize">{dateLabel}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {tx("Geen training gepland.", "No workout scheduled.")}
          </p>
        ) : (
          <div className="space-y-5">
            {occurrences.map((occ) => {
              const days = planDays[occ.planId] ?? [];
              // Cycle through plan days based on occurrence number
              const dayForToday =
                days.length > 0 ? days[(occ.occurrenceIndex - 1) % days.length] : null;
              return (
                <div key={occ.assignmentId} className="rounded-md border p-4 space-y-3">
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
                      {tx("Geen oefeningen geconfigureerd.", "No exercises configured.")}
                    </p>
                  ) : dayForToday.exercises.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {tx("Geen oefeningen voor deze dag.", "No exercises for this day.")}
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
                                <Badge variant="outline" className="text-[10px] capitalize">
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
      </DialogContent>
    </Dialog>
  );
}
