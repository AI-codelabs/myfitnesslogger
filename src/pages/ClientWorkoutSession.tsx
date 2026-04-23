import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronLeft,
  Loader2,
  Dumbbell,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Lang } from "@/lib/onboardingSchema";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SessionHeader {
  id: string;
  client_id: string;
  plan_id: string;
  day_id: string | null;
  scheduled_date: string | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
}

interface PlanExerciseRow {
  id: string;
  order_index: number;
  sets_reps: string | null;
  notes: string | null;
  exercise_id: string;
  exercise: { name: string; muscle_group: string | null } | null;
}

interface SetLog {
  id: string;
  plan_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  notes: string | null;
}

interface HistoryPoint {
  date: string;
  weight: number | null;
  reps: number | null;
  volume: number | null;
}

type Metric = "weight" | "reps" | "volume";

const ClientWorkoutSession = () => {
  const { clientId, sessionId } = useParams<{ clientId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lang] = useState<Lang>(
    () => (localStorage.getItem("onbLang") as Lang) || "nl"
  );
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState<SessionHeader | null>(null);
  const [planName, setPlanName] = useState("");
  const [dayName, setDayName] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [exercises, setExercises] = useState<PlanExerciseRow[]>([]);
  const [logsByExercise, setLogsByExercise] = useState<Record<string, SetLog[]>>({});
  const [historyByExerciseId, setHistoryByExerciseId] = useState<
    Record<string, HistoryPoint[]>
  >({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});
  const [openExId, setOpenExId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("weight");

  const loadAll = async (initial = false) => {
    if (!user?.id || !sessionId || !clientId) return;
    if (initial) setLoading(true);
    else setRefreshing(true);

    const { data: s } = await supabase
      .from("workout_sessions")
      .select(
        "id, client_id, plan_id, day_id, scheduled_date, started_at, completed_at, notes"
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (!s) {
      navigate(`/clients/${clientId}`);
      return;
    }
    setSession(s as any);

    const [{ data: plan }, dayRes, { data: profile }] = await Promise.all([
      supabase.from("workout_plans").select("name").eq("id", s.plan_id).maybeSingle(),
      s.day_id
        ? supabase
            .from("workout_plan_days")
            .select("name")
            .eq("id", s.day_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", clientId)
        .maybeSingle(),
    ]);
    setPlanName(plan?.name ?? "");
    setDayName(dayRes?.data?.name ?? null);
    setClientName(profile?.display_name ?? "");

    let ex: PlanExerciseRow[] = [];
    if (s.day_id) {
      const { data } = await supabase
        .from("workout_plan_exercises")
        .select(
          "id, order_index, sets_reps, notes, exercise_id, exercise:exercises(name, muscle_group)"
        )
        .eq("day_id", s.day_id)
        .order("order_index");
      ex = (data ?? []) as any;
    }
    setExercises(ex);

    const { data: logs } = await supabase
      .from("workout_set_logs")
      .select("id, plan_exercise_id, set_number, reps, weight_kg, notes")
      .eq("session_id", sessionId)
      .order("set_number");
    const byEx: Record<string, SetLog[]> = {};
    for (const l of (logs ?? []) as any[]) {
      const normalized: SetLog = {
        id: l.id,
        plan_exercise_id: l.plan_exercise_id,
        set_number: l.set_number,
        reps: l.reps == null ? null : Number(l.reps),
        weight_kg: l.weight_kg == null ? null : Number(l.weight_kg),
        notes: l.notes,
      };
      (byEx[normalized.plan_exercise_id] ||= []).push(normalized);
    }
    setLogsByExercise(byEx);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionId, clientId]);

  // Refetch when the tab/window regains focus, so the coach always sees the latest logs.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadAll(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionId, clientId]);

  // Load progress history for the given exercise across all client sessions
  const loadHistory = async (planExerciseId: string, exerciseId: string) => {
    if (historyByExerciseId[planExerciseId] || !clientId) return;
    setHistoryLoading((p) => ({ ...p, [planExerciseId]: true }));

    // Find all plan_exercises that point to the same underlying exercise (across plans)
    const { data: peers } = await supabase
      .from("workout_plan_exercises")
      .select("id")
      .eq("exercise_id", exerciseId);
    const peerIds = (peers ?? []).map((p: any) => p.id);
    if (peerIds.length === 0) {
      setHistoryByExerciseId((p) => ({ ...p, [planExerciseId]: [] }));
      setHistoryLoading((p) => ({ ...p, [planExerciseId]: false }));
      return;
    }

    // All sessions for this client
    const { data: sessions } = await supabase
      .from("workout_sessions")
      .select("id, scheduled_date, started_at")
      .eq("client_id", clientId);
    const sessIds = (sessions ?? []).map((s: any) => s.id);
    if (sessIds.length === 0) {
      setHistoryByExerciseId((p) => ({ ...p, [planExerciseId]: [] }));
      setHistoryLoading((p) => ({ ...p, [planExerciseId]: false }));
      return;
    }
    const sessDate = new Map<string, string>();
    for (const s of sessions ?? []) {
      sessDate.set(
        (s as any).id,
        (s as any).scheduled_date ??
          new Date((s as any).started_at).toISOString().slice(0, 10)
      );
    }

    const { data: allLogs } = await supabase
      .from("workout_set_logs")
      .select("session_id, plan_exercise_id, reps, weight_kg")
      .in("plan_exercise_id", peerIds)
      .in("session_id", sessIds);

    // Aggregate per session: max weight, max reps, total volume (sum reps*weight)
    const perSession = new Map<
      string,
      { date: string; maxWeight: number; maxReps: number; volume: number }
    >();
    for (const l of (allLogs ?? []) as any[]) {
      const date = sessDate.get(l.session_id);
      if (!date) continue;
      const w = Number(l.weight_kg ?? 0) || 0;
      const r = Number(l.reps ?? 0) || 0;
      const cur = perSession.get(l.session_id) ?? {
        date,
        maxWeight: 0,
        maxReps: 0,
        volume: 0,
      };
      cur.maxWeight = Math.max(cur.maxWeight, w);
      cur.maxReps = Math.max(cur.maxReps, r);
      cur.volume += w * r;
      perSession.set(l.session_id, cur);
    }
    const points: HistoryPoint[] = Array.from(perSession.values())
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((p) => ({
        date: p.date,
        weight: p.maxWeight || null,
        reps: p.maxReps || null,
        volume: p.volume || null,
      }));

    setHistoryByExerciseId((p) => ({ ...p, [planExerciseId]: points }));
    setHistoryLoading((p) => ({ ...p, [planExerciseId]: false }));
  };

  const handleToggle = (peId: string, exId: string) => {
    const next = openExId === peId ? null : peId;
    setOpenExId(next);
    if (next) loadHistory(peId, exId);
  };

  const completedCount = useMemo(
    () =>
      exercises.filter((e) => (logsByExercise[e.id] ?? []).length > 0).length,
    [exercises, logsByExercise]
  );

  const totalSets = useMemo(
    () =>
      Object.values(logsByExercise).reduce((acc, arr) => acc + arr.length, 0),
    [logsByExercise]
  );

  const sessionDateLabel = session
    ? new Date(
        session.scheduled_date ?? session.started_at
      ).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  const isCompleted = !!session.completed_at;

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={`/clients/${clientId}`} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            {tx("Terug naar client", "Back to client")}
          </Link>
        </Button>
        <Badge variant={isCompleted ? "default" : "secondary"} className="gap-1">
          {isCompleted ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              {tx("Voltooid", "Completed")}
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              {tx("Bezig", "In progress")}
            </>
          )}
        </Badge>
      </div>

      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-primary" />
          <h1 className="text-lg sm:text-xl font-semibold">{planName}</h1>
        </div>
        {dayName && (
          <p className="text-sm text-muted-foreground">{dayName}</p>
        )}
        <p className="text-xs text-muted-foreground capitalize">
          {sessionDateLabel}
          {clientName && ` · ${clientName}`}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {completedCount}
            </span>
            {" / "}
            {exercises.length} {tx("oefeningen", "exercises")}
          </span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {totalSets}
            </span>{" "}
            {tx("sets gelogd", "sets logged")}
          </span>
        </div>
        {session.notes && (
          <p className="text-xs italic text-muted-foreground pt-2 border-t mt-2">
            {session.notes}
          </p>
        )}
      </Card>

      {exercises.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {tx("Geen oefeningen voor deze dag.", "No exercises for this day.")}
        </Card>
      ) : (
        <div className="space-y-2">
          {exercises.map((ex) => {
            const logs = logsByExercise[ex.id] ?? [];
            const isOpen = openExId === ex.id;
            const logged = logs.length > 0;
            return (
              <Card key={ex.id} className="overflow-hidden">
                <Collapsible open={isOpen} onOpenChange={() => handleToggle(ex.id, ex.exercise_id)}>
                  <CollapsibleTrigger className="w-full p-4 flex items-center gap-3 text-left hover:bg-accent/50 transition-colors">
                    <div
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                        logged
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {logged ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Dumbbell className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {ex.exercise?.name ?? "—"}
                        </span>
                        {ex.exercise?.muscle_group && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {ex.exercise.muscle_group}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {logged
                          ? `${logs.length} ${tx("sets", "sets")}`
                          : ex.sets_reps ?? tx("Niet gelogd", "Not logged")}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                        isOpen && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t p-4 space-y-4">
                      <Tabs defaultValue="session">
                        <TabsList className="w-full grid grid-cols-2">
                          <TabsTrigger value="session">
                            {tx("Deze sessie", "This session")}
                          </TabsTrigger>
                          <TabsTrigger value="progress">
                            {tx("Voortgang", "Progress")}
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="session" className="pt-3">
                          {logs.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">
                              {tx("Geen sets gelogd.", "No sets logged.")}
                            </p>
                          ) : (
                            <div className="rounded-md border overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                                  <tr>
                                    <th className="text-left px-3 py-2 font-medium">
                                      {tx("Set", "Set")}
                                    </th>
                                    <th className="text-right px-3 py-2 font-medium">
                                      {tx("Herh.", "Reps")}
                                    </th>
                                    <th className="text-right px-3 py-2 font-medium">
                                      {tx("Kg", "Kg")}
                                    </th>
                                    <th className="text-right px-3 py-2 font-medium">
                                      {tx("Volume", "Volume")}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {logs.map((l) => (
                                    <tr key={l.id} className="border-t">
                                      <td className="px-3 py-2 font-semibold tabular-nums">
                                        {l.set_number}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {l.reps ?? "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right tabular-nums">
                                        {l.weight_kg ?? "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                                        {l.reps && l.weight_kg
                                          ? (l.reps * Number(l.weight_kg)).toFixed(0)
                                          : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="progress" className="pt-3 space-y-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <TrendingUp className="h-3.5 w-3.5" />
                              {tx("Over tijd", "Over time")}
                            </div>
                            <div className="flex items-center gap-1 rounded-md border p-0.5">
                              {(["weight", "reps", "volume"] as Metric[]).map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setMetric(m)}
                                  className={cn(
                                    "text-xs px-2.5 py-1 rounded transition-colors",
                                    metric === m
                                      ? "bg-primary text-primary-foreground"
                                      : "text-muted-foreground hover:bg-accent"
                                  )}
                                >
                                  {m === "weight"
                                    ? tx("Gewicht", "Weight")
                                    : m === "reps"
                                    ? tx("Herh.", "Reps")
                                    : tx("Volume", "Volume")}
                                </button>
                              ))}
                            </div>
                          </div>

                          {historyLoading[ex.id] ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : (historyByExerciseId[ex.id] ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground py-6 text-center">
                              {tx(
                                "Nog geen historische data.",
                                "No historical data yet."
                              )}
                            </p>
                          ) : (
                            <div className="h-[220px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                  data={historyByExerciseId[ex.id]}
                                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="hsl(var(--border))"
                                  />
                                  <XAxis
                                    dataKey="date"
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={11}
                                    tickFormatter={(v) =>
                                      new Date(v).toLocaleDateString(
                                        lang === "nl" ? "nl-NL" : "en-US",
                                        { day: "numeric", month: "short" }
                                      )
                                    }
                                  />
                                  <YAxis
                                    stroke="hsl(var(--muted-foreground))"
                                    fontSize={11}
                                    width={40}
                                  />
                                  <Tooltip
                                    contentStyle={{
                                      background: "hsl(var(--popover))",
                                      border: "1px solid hsl(var(--border))",
                                      borderRadius: 6,
                                      fontSize: 12,
                                    }}
                                    labelFormatter={(v) =>
                                      new Date(v as string).toLocaleDateString(
                                        lang === "nl" ? "nl-NL" : "en-US",
                                        {
                                          day: "numeric",
                                          month: "short",
                                          year: "numeric",
                                        }
                                      )
                                    }
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey={metric}
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: "hsl(var(--primary))" }}
                                    activeDot={{ r: 5 }}
                                    connectNulls
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClientWorkoutSession;
