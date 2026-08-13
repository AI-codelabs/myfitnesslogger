import { db } from "@/lib/db";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, Dumbbell } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Range = "4w" | "12w" | "all";

type SetLog = {
  reps: number | null;
  weight_kg: number | null;
  set_number: number | null;
  plan_exercise_id: string | null;
  session_id: string | null;
  created_at: string;
  workout_sessions: {
    client_id: string;
    scheduled_date: string | null;
    completed_at: string | null;
  } | null;
  workout_plan_exercises: {
    exercise_id: string;
    exercises: { id: string; name: string } | null;
  } | null;
};

type ExerciseOption = { id: string; name: string; count: number };

const RANGE_DAYS: Record<Range, number | null> = { "4w": 28, "12w": 84, all: null };

interface Props {
  clientId: string;
  lang?: "nl" | "en";
}

export function StrengthProgressChart({ clientId, lang = "nl" }: Props) {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("12w");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await db
        .from("workout_set_logs")
        .select(
          `reps, weight_kg, set_number, plan_exercise_id, session_id, created_at,
           workout_sessions!inner(client_id, scheduled_date, completed_at),
           workout_plan_exercises!inner(exercise_id, exercises(id, name))`,
        )
        .eq("workout_sessions.client_id", clientId)
        .not("weight_kg", "is", null)
        .not("reps", "is", null)
        .order("created_at", { ascending: true });
      setLogs(((data ?? []) as unknown) as SetLog[]);
      setLoading(false);
    })();
  }, [clientId]);

  const exercises: ExerciseOption[] = useMemo(() => {
    const map = new Map<string, ExerciseOption>();
    for (const l of logs) {
      const ex = l.workout_plan_exercises?.exercises;
      if (!ex) continue;
      const cur = map.get(ex.id) ?? { id: ex.id, name: ex.name, count: 0 };
      cur.count += 1;
      map.set(ex.id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [logs]);

  useEffect(() => {
    if (!exerciseId && exercises.length) setExerciseId(exercises[0].id);
  }, [exercises, exerciseId]);

  const chartData = useMemo(() => {
    if (!exerciseId) return [];
    const cutoff = RANGE_DAYS[range]
      ? Date.now() - RANGE_DAYS[range]! * 86_400_000
      : 0;
    // best e1RM per session
    const perSession = new Map<string, { date: string; e1rm: number; weight: number; reps: number }>();
    for (const l of logs) {
      if (l.workout_plan_exercises?.exercises?.id !== exerciseId) continue;
      const reps = Number(l.reps);
      const w = Number(l.weight_kg);
      if (!reps || !w) continue;
      const dateStr =
        l.workout_sessions?.completed_at ??
        l.workout_sessions?.scheduled_date ??
        l.created_at;
      const ts = new Date(dateStr).getTime();
      if (ts < cutoff) continue;
      const e1rm = w * (1 + reps / 30);
      const key = l.session_id ?? dateStr;
      const cur = perSession.get(key);
      if (!cur || e1rm > cur.e1rm) {
        perSession.set(key, { date: dateStr, e1rm, weight: w, reps });
      }
    }
    return Array.from(perSession.values())
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((r) => ({
        label: new Date(r.date).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
          day: "2-digit",
          month: "short",
        }),
        e1rm: Math.round(r.e1rm * 10) / 10,
        top: `${r.weight}kg × ${r.reps}`,
      }));
  }, [logs, exerciseId, range, lang]);

  const first = chartData[0]?.e1rm;
  const last = chartData[chartData.length - 1]?.e1rm;
  const delta = first != null && last != null ? last - first : null;

  const t = (nl: string, en: string) => (lang === "nl" ? nl : en);

  if (loading) {
    return (
      <Card className="p-4 sm:p-5 h-56 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (!exercises.length) {
    return (
      <Card className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">{t("Krachtprogressie", "Strength progression")}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "Nog geen sets gelogd met gewicht en reps.",
            "No sets logged with weight and reps yet.",
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">
              {t("Krachtprogressie", "Strength progression")}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "Geschatte 1RM (Epley) per sessie · top set",
              "Estimated 1RM (Epley) per session · top set",
            )}
          </p>
        </div>
        {delta != null && (
          <div
            className={`text-xs font-medium ${
              delta > 0 ? "text-emerald-600" : delta < 0 ? "text-orange-500" : "text-muted-foreground"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} kg
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={exerciseId ?? undefined} onValueChange={setExerciseId}>
          <SelectTrigger className="w-full sm:w-64 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {exercises.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} <span className="text-muted-foreground text-xs">· {e.count}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {(["4w", "12w", "all"] as Range[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              className="h-9 px-3"
              onClick={() => setRange(r)}
            >
              {r === "all" ? t("Alles", "All") : r}
            </Button>
          ))}
        </div>
      </div>

      {chartData.length < 2 ? (
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          {t("Nog te weinig data in deze periode", "Not enough data in this range")}
        </div>
      ) : (
        <div className="h-56 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
                domain={["dataMin - 2", "dataMax + 2"]}
                width={36}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number, _n, item) => [
                  `${value} kg`,
                  `e1RM (${(item as { payload: { top: string } }).payload.top})`,
                ]}
              />
              <Line
                type="monotone"
                dataKey="e1rm"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
