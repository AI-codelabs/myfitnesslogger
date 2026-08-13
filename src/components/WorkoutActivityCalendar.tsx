import { db } from "@/lib/db";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Dumbbell, CheckCircle2 } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";
import {
  WorkoutDayDetailsDialog,
  LoggedSession,
} from "@/components/WorkoutDayDetailsDialog";
import {
  AssignmentLike,
  ComputedOccurrence,
  OverrideLike,
  computeScheduledOccurrences,
  formatDateKey,
} from "@/lib/workoutSchedule";

interface PlannedAssignment extends AssignmentLike {
  coach_id?: string;
}

interface PlanLite {
  id: string;
  name: string;
}

interface Props {
  assignments: PlannedAssignment[];
  plans: PlanLite[];
  lang: Lang;
  clientId: string;
}

const MONTHS_NL = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS_NL = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function WorkoutActivityCalendar({ assignments, plans, lang, clientId }: Props) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const today = startOfDay(new Date());
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [logged, setLogged] = useState<Map<string, LoggedSession[]>>(new Map());
  const [overrides, setOverrides] = useState<OverrideLike[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "";

  // Load workout sessions for this client and aggregate set counts
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data: sessions } = await db
        .from("workout_sessions")
        .select("id, plan_id, day_id, scheduled_date, started_at, completed_at")
        .eq("client_id", clientId);
      if (!sessions || sessions.length === 0) {
        setLogged(new Map());
        return;
      }
      const sessionIds = sessions.map((s) => s.id);
      const { data: setCounts } = await db
        .from("workout_set_logs")
        .select("session_id")
        .in("session_id", sessionIds);
      const counts = new Map<string, number>();
      for (const r of setCounts ?? []) {
        const sid = (r as any).session_id as string;
        counts.set(sid, (counts.get(sid) ?? 0) + 1);
      }
      const dayNameIds = Array.from(
        new Set(sessions.map((s) => s.day_id).filter(Boolean))
      ) as string[];
      let dayNames = new Map<string, string>();
      if (dayNameIds.length) {
        const { data: dn } = await db
          .from("workout_plan_days")
          .select("id, name")
          .in("id", dayNameIds);
        for (const d of dn ?? []) dayNames.set((d as any).id, (d as any).name);
      }
      const map = new Map<string, LoggedSession[]>();
      for (const s of sessions) {
        const setCount = counts.get(s.id) ?? 0;
        if (setCount === 0 && !s.completed_at) continue; // skip empty unfinished
        const dateStr =
          s.scheduled_date ??
          new Date(s.started_at).toISOString().slice(0, 10);
        const arr = map.get(dateStr) ?? [];
        arr.push({
          sessionId: s.id,
          planId: s.plan_id,
          planName: planName(s.plan_id),
          dayName: s.day_id ? dayNames.get(s.day_id) ?? null : null,
          startedAt: s.started_at,
          completedAt: s.completed_at,
          setCount,
        });
        map.set(dateStr, arr);
      }
      setLogged(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, plans, refreshTick]);

  // Load schedule overrides
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const { data } = await db
        .from("workout_schedule_overrides")
        .select(
          "id, client_id, assignment_id, plan_id, action, original_date, scheduled_date, occurrence_index, source_override_id",
        )
        .eq("client_id", clientId);
      setOverrides((data as OverrideLike[]) ?? []);
    })();
  }, [clientId, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  // Build map: dateKey -> ComputedOccurrence[]
  const planned = useMemo(
    () => computeScheduledOccurrences(assignments, overrides, planName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignments, overrides, plans],
  );

  // Build grid for current month (start on Monday)
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = addDays(firstOfMonth, -startOffset);
  const totalCells = Math.ceil((startOffset + lastOfMonth.getDate()) / 7) * 7;

  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) cells.push(addDays(gridStart, i));

  const weekdayLabels = lang === "nl" ? WEEKDAYS_NL : WEEKDAYS_EN;
  const monthLabel = (lang === "nl" ? MONTHS_NL : MONTHS_EN)[month];

  let plannedCount = 0;
  let loggedCount = 0;
  cells.forEach((d) => {
    if (d.getMonth() !== month) return;
    const k = formatDateKey(d);
    if (planned.has(k)) plannedCount++;
    if (logged.has(k)) loggedCount++;
  });

  const selectedKey = selectedDate ? formatDateKey(selectedDate) : null;
  const selectedOccurrences: ComputedOccurrence[] =
    selectedKey ? planned.get(selectedKey) ?? [] : [];
  const selectedLogged = selectedKey ? logged.get(selectedKey) ?? [] : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Dumbbell className="h-4 w-4" />
            {tx("Trainingskalender", "Activity calendar")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {plannedCount} {tx("gepland", "planned")} · {loggedCount}{" "}
            {tx("gelogd", "logged")} {tx("deze maand", "this month")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label={tx("Vorige maand", "Previous month")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium min-w-[140px] text-center">
            {monthLabel} {year}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label={tx("Volgende maand", "Next month")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            {tx("Vandaag", "Today")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground">
        {weekdayLabels.map((w) => (
          <div key={w} className="text-center py-1 font-medium uppercase tracking-wider">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          const inMonth = d.getMonth() === month;
          const isToday = sameDay(d, today);
          const key = formatDateKey(d);
          const dayPlans = planned.get(key);
          const dayLogged = logged.get(key);
          const hasPlan = !!dayPlans?.length;
          const hasLog = !!dayLogged?.length;
          const isCompleted = hasLog && dayLogged!.some((l) => l.completedAt);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedDate(d)}
              title={
                hasLog
                  ? dayLogged!.map((l) => l.planName).join(", ")
                  : hasPlan
                  ? dayPlans!.map((p) => p.planName).join(", ")
                  : ""
              }
              className={cn(
                "relative aspect-square rounded-md border p-1.5 text-xs flex flex-col text-left",
                "transition-colors hover:bg-accent hover:border-accent-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary/40",
                !inMonth && "opacity-40",
                isToday && "ring-2 ring-primary",
                hasLog
                  ? isCompleted
                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                    : "bg-primary/15 border-primary border-dashed hover:bg-primary/25"
                  : hasPlan
                  ? "bg-primary/10 border-primary/40 hover:bg-primary/20"
                  : "bg-card border-border"
              )}
            >
              <span
                className={cn(
                  "font-medium",
                  hasLog && isCompleted
                    ? "text-primary-foreground"
                    : (hasLog || hasPlan) && "text-primary"
                )}
              >
                {d.getDate()}
              </span>
              {(hasLog || hasPlan) && (
                <div className="mt-auto flex items-center gap-1">
                  {hasLog ? (
                    <CheckCircle2
                      className={cn(
                        "h-3 w-3",
                        isCompleted ? "text-primary-foreground" : "text-primary"
                      )}
                    />
                  ) : (
                    <Dumbbell className="h-3 w-3 text-primary" />
                  )}
                  {((hasLog ? dayLogged!.length : dayPlans!.length) > 1) && (
                    <span
                      className={cn(
                        "text-[10px] font-semibold",
                        hasLog && isCompleted
                          ? "text-primary-foreground"
                          : "text-primary"
                      )}
                    >
                      {hasLog ? dayLogged!.length : dayPlans!.length}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary/20 border border-primary/40" />
          {tx("Gepland", "Planned")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary/15 border border-dashed border-primary" />
          {tx("Bezig", "In progress")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary border-primary" />
          {tx("Voltooid", "Completed")}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-primary" />
          {tx("Vandaag", "Today")}
        </div>
      </div>

      <WorkoutDayDetailsDialog
        open={!!selectedDate}
        onOpenChange={(o) => !o && setSelectedDate(null)}
        date={selectedDate}
        occurrences={selectedOccurrences}
        loggedSessions={selectedLogged}
        clientId={clientId}
        lang={lang}
        onChanged={refresh}
      />
    </Card>
  );
}
