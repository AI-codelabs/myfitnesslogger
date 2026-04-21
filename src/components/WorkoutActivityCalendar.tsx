import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";
import {
  WorkoutDayDetailsDialog,
  ScheduledOccurrence,
} from "@/components/WorkoutDayDetailsDialog";

interface PlannedAssignment {
  id: string;
  plan_id: string;
  is_active: boolean;
  start_date: string | null;
  weeks: number | null;
  days: string[] | null;
}

interface PlanLite {
  id: string;
  name: string;
}

interface Props {
  assignments: PlannedAssignment[];
  plans: PlanLite[];
  lang: Lang;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

export function WorkoutActivityCalendar({ assignments, plans, lang }: Props) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const today = startOfDay(new Date());
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "";

  // Build map: dateKey -> ScheduledOccurrence[] (with occurrence index per assignment)
  const planned = useMemo(() => {
    const map = new Map<string, ScheduledOccurrence[]>();
    for (const a of assignments) {
      if (!a.is_active || !a.start_date || !a.weeks || !a.days || a.days.length === 0) continue;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, plans]);

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
  cells.forEach((d) => {
    if (d.getMonth() === month && planned.has(d.toISOString().slice(0, 10))) plannedCount++;
  });

  const selectedKey = selectedDate ? selectedDate.toISOString().slice(0, 10) : null;
  const selectedOccurrences = selectedKey ? planned.get(selectedKey) ?? [] : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Dumbbell className="h-4 w-4" />
            {tx("Trainingskalender", "Activity calendar")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {plannedCount} {tx("geplande trainingen deze maand", "planned workouts this month")}
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
          const key = d.toISOString().slice(0, 10);
          const dayPlans = planned.get(key);
          const hasPlan = !!dayPlans?.length;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedDate(d)}
              title={hasPlan ? dayPlans!.map((p) => p.planName).join(", ") : ""}
              className={cn(
                "relative aspect-square rounded-md border p-1.5 text-xs flex flex-col text-left",
                "transition-colors hover:bg-accent hover:border-accent-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary/40",
                !inMonth && "opacity-40",
                isToday && "ring-2 ring-primary",
                hasPlan
                  ? "bg-primary/10 border-primary/40 hover:bg-primary/20"
                  : "bg-card border-border"
              )}
            >
              <span className={cn("font-medium", hasPlan && "text-primary")}>{d.getDate()}</span>
              {hasPlan && (
                <div className="mt-auto flex items-center gap-1">
                  <Dumbbell className="h-3 w-3 text-primary" />
                  {dayPlans!.length > 1 && (
                    <span className="text-[10px] text-primary font-semibold">
                      {dayPlans!.length}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary/20 border border-primary/40" />
          {tx("Geplande training", "Planned workout")}
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
        lang={lang}
      />
    </Card>
  );
}
