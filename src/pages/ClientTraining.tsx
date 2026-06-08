import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Dumbbell,
  Loader2,
  CheckCircle2,
  ArrowRightLeft,
  Copy as CopyIcon,
} from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";
import {
  AssignmentLike,
  ComputedOccurrence,
  OverrideLike,
  computeScheduledOccurrences,
  formatDateKey,
} from "@/lib/workoutSchedule";
import { WorkoutInstanceActions } from "@/components/WorkoutInstanceActions";

type Assignment = AssignmentLike;

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

  const isOccurrenceCompleted = (planId: string, dayId: string | undefined, date: string) => {
    const key = `${planId}:${dayId || '_'}:${date}`;
    return completedSessions.has(key);
  };

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planDays, setPlanDays] = useState<Record<string, DayWithExercises[]>>({});
  const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
  const [completedSessions, setCompletedSessions] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<OverrideLike[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const [{ data: a }, { data: ovs }] = await Promise.all([
        supabase
          .from("client_workout_assignments")
          .select("id, plan_id, is_active, start_date, weeks, days")
          .eq("client_id", user.id),
        supabase
          .from("workout_schedule_overrides")
          .select(
            "id, client_id, assignment_id, plan_id, action, original_date, scheduled_date, occurrence_index, source_override_id",
          )
          .eq("client_id", user.id),
      ]);

      const assigns = (a ?? []) as Assignment[];
      setAssignments(assigns);
      setOverrides((ovs as OverrideLike[]) ?? []);

      const planIds = Array.from(
        new Set([
          ...assigns.map((x) => x.plan_id),
          ...((ovs ?? []).map((o: any) => o.plan_id) as string[]),
        ]),
      );
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

      // Load completed workout sessions for this client
      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("plan_id, day_id, scheduled_date, completed_at")
        .eq("client_id", user.id)
        .not("completed_at", "is", null);
      const completed = new Set<string>();
      for (const s of sessions ?? []) {
        const key = `${s.plan_id}:${s.day_id || '_'}:${s.scheduled_date || '_'}`;
        completed.add(key);
      }
      setCompletedSessions(completed);

      setLoading(false);
    })();
  }, [user?.id, refreshTick]);

  // Build map: dateKey -> ComputedOccurrence[] (planned + overrides)
  const planned = useMemo(() => {
    const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "";
    return computeScheduledOccurrences(assignments, overrides, planName);
  }, [assignments, overrides, plans]);

  const today = startOfDay(new Date());
  const dateKey = formatDateKey(currentDate);
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
  const goPrevWeek = () => setCurrentDate((d) => addDays(d, -7));
  const goNextWeek = () => setCurrentDate((d) => addDays(d, 7));

  // Week strip: Monday-start week containing currentDate
  const weekStart = useMemo(() => {
    const offset = (currentDate.getDay() + 6) % 7; // 0 = Mon
    return addDays(currentDate, -offset);
  }, [currentDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekdayShort = lang === "nl"
    ? ["ma", "di", "wo", "do", "vr", "za", "zo"]
    : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const weekRangeLabel = `${weekStart.toLocaleDateString(
    lang === "nl" ? "nl-NL" : "en-US",
    { day: "numeric", month: "short" }
  )} – ${addDays(weekStart, 6).toLocaleDateString(
    lang === "nl" ? "nl-NL" : "en-US",
    { day: "numeric", month: "short" }
  )}`;

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          {tx("Training", "Training")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tx(
            "Bekijk wat je vandaag op de planning hebt staan.",
            "See what's scheduled for you today."
          )}
        </p>
      </div>

      <Card className="p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrevWeek}
            aria-label={tx("Vorige week", "Previous week")}
            className="shrink-0"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {tx("Week", "Week")}
            </p>
            <p className="text-sm font-medium capitalize truncate">{weekRangeLabel}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={goNextWeek}
            aria-label={tx("Volgende week", "Next week")}
            className="shrink-0"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((d, i) => {
            const k = d.toISOString().slice(0, 10);
            const hasPlan = planned.has(k);
            const isSelected = sameDay(d, currentDate);
            const isToday = sameDay(d, today);
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCurrentDate(d)}
                className={cn(
                  "flex flex-col items-center justify-between py-2 rounded-lg border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : hasPlan
                    ? "bg-primary/10 border-primary/40 hover:bg-primary/20"
                    : "bg-card border-border hover:bg-accent",
                  isToday && !isSelected && "ring-1 ring-primary/60"
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wider leading-none",
                    isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {weekdayShort[i]}
                </span>
                <span className="text-sm font-semibold leading-none mt-1.5 tabular-nums">
                  {d.getDate()}
                </span>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full mt-1.5",
                    hasPlan
                      ? isSelected
                        ? "bg-primary-foreground"
                        : "bg-primary"
                      : "bg-transparent"
                  )}
                />
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-3 sm:p-5 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={goPrev}
              aria-label={tx("Vorige dag", "Previous day")}
              className="shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {sameDay(currentDate, today)
                  ? tx("Vandaag", "Today")
                  : tx("Geplande dag", "Scheduled day")}
              </p>
              <h2 className="text-sm sm:text-base font-semibold capitalize truncate">
                {dateLabel}
              </h2>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={goNext}
              aria-label={tx("Volgende dag", "Next day")}
              className="shrink-0"
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
              const exCount = dayForToday?.exercises.length ?? 0;
              const muscleGroups = Array.from(
                new Set(
                  (dayForToday?.exercises ?? [])
                    .map((e) => e.exercise?.muscle_group)
                    .filter(Boolean) as string[]
                )
              );
              const isCompleted = isOccurrenceCompleted(occ.planId, dayForToday?.id, dateKey);
              return (
                <div
                  key={occ.assignmentId}
                  className={cn(
                    "rounded-2xl border bg-card overflow-hidden shadow-sm",
                    isCompleted && "border-l-success border-l-4"
                  )}
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                        isCompleted ? "bg-success/10" : "bg-primary/10"
                      )}>
                        <Dumbbell className={cn("h-5 w-5", isCompleted ? "text-success" : "text-primary")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-base leading-tight truncate">
                            {dayForToday?.name || occ.planName || tx("Training", "Workout")}
                          </h4>
                          {isCompleted && (
                            <Badge className="bg-success text-success-foreground gap-1 text-[10px]">
                              <CheckCircle2 className="h-3 w-3" />
                              {tx("Voltooid", "Completed")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {occ.planName}
                        </p>
                      </div>
                    </div>

                    {dayForToday && exCount > 0 && (
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-semibold tabular-nums">
                            {exCount}
                          </span>
                          <span className="text-muted-foreground">
                            {tx("oefeningen", "exercises")}
                          </span>
                        </div>
                        {muscleGroups.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {muscleGroups.slice(0, 3).map((m) => (
                              <Badge
                                key={m}
                                variant="secondary"
                                className="text-[10px] capitalize font-normal"
                              >
                                {m}
                              </Badge>
                            ))}
                            {muscleGroups.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{muscleGroups.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!dayForToday || exCount === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {tx(
                          "Geen oefeningen voor deze dag.",
                          "No exercises for this day."
                        )}
                      </p>
                    ) : null}
                  </div>

                  {dayForToday && exCount > 0 ? (
                    <Button
                      variant="default"
                      asChild
                      className="w-full rounded-none h-12 gap-2"
                    >
                      <Link
                        to={`/training/log/new?plan=${occ.planId}&day=${dayForToday.id}&date=${dateKey}`}
                      >
                        <Dumbbell className="h-4 w-4" />
                        {tx("Log workout", "Log workout")}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled
                      className="w-full rounded-none h-12 gap-2"
                    >
                      <Dumbbell className="h-4 w-4" />
                      {tx("Schema nog niet ingevuld", "Plan not yet configured")}
                    </Button>
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
