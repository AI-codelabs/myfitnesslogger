import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { parseDecimal } from "@/lib/parseDecimal";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, Plus, Trash2, Check, Dumbbell, ChevronRight, ListChecks, Video, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Lang } from "@/lib/onboardingSchema";
import { formatSetsRepsForDisplay } from "@/lib/setsReps";

interface PlanExercise {
  id: string;
  sets_reps: string | null;
  notes: string | null;
  order_index: number;
  exercise: {
    name: string;
    muscle_group: string | null;
    video_url: string | null;
    exercise_type: string | null;
  } | null;
}


interface SetRow {
  id?: string;
  set_number: number;
  reps: string;
  weight_kg: string;
  duration_seconds: string;
  distance_m: string;
  speed_kmh: string;
  incline_pct: string;
  intensity: string;
  notes: string;
  saved?: boolean;
}

// Extract a rep target like "8-10" or "10" from a free-form plan string
// such as "4x 8-10" or "3x10". Used as the placeholder hint on the reps input.
function extractRepRange(s: string): string | null {
  const m = s.match(/(\d+\s*-\s*\d+)|(\d+)\s*x\s*(\d+)|(\d+)\s*reps?/i);
  if (!m) return null;
  if (m[1]) return m[1].replace(/\s+/g, "");
  if (m[3]) return m[3];
  if (m[4]) return m[4];
  return null;
}

// Parse a plan string like "8x 10x" or "12x 12x 12x" into per-set rep targets.
// Each "Nx" token = one set with N reps. Falls back to "3x10" (3 sets of 10) style.
function extractSetTargets(s: string | null | undefined): number[] {
  if (!s) return [];
  // Prefer token style: sequences of "Nx" separated by spaces/commas
  const tokens = s.match(/\d+\s*x/gi);
  if (tokens && tokens.length > 1) {
    return tokens
      .map((t) => parseInt(t))
      .filter((n) => !isNaN(n) && n > 0 && n < 1000);
  }
  // Fallback: "3x10" or "4x 8-10" → N sets, reps from second number
  const m = s.match(/(\d+)\s*x\s*(\d+)/i);
  if (m) {
    const sets = parseInt(m[1]);
    const reps = parseInt(m[2]);
    if (!isNaN(sets) && sets >= 1 && sets <= 20) {
      return Array.from({ length: sets }, () => (isNaN(reps) ? 0 : reps));
    }
  }
  // "3 sets"
  const m2 = s.match(/(\d+)\s*sets?/i);
  if (m2) {
    const n = parseInt(m2[1]);
    if (!isNaN(n) && n >= 1 && n <= 20) return Array.from({ length: n }, () => 0);
  }
  // Single "Nx" token
  if (tokens && tokens.length === 1) {
    const n = parseInt(tokens[0]);
    if (!isNaN(n)) return [n];
  }
  return [];
}






const LogWorkout = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lang] = useState<Lang>(
    () => (localStorage.getItem("onbLang") as Lang) || "nl"
  );
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planName, setPlanName] = useState("");
  const [dayName, setDayName] = useState<string | null>(null);
  const [exercises, setExercises] = useState<PlanExercise[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetRow[]>>({});
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      let sid = sessionId;
      let session: any = null;

      if (sid) {
        const { data } = await supabase
          .from("workout_sessions")
          .select("id, plan_id, day_id, scheduled_date, completed_at")
          .eq("id", sid)
          .maybeSingle();
        session = data;
      } else {
        const planId = params.get("plan");
        const dayIdRaw = params.get("day");
        const dayId = dayIdRaw && dayIdRaw.length > 0 ? dayIdRaw : null;
        const date = params.get("date");
        if (!planId) {
          toast({ title: tx("Geen schema", "No plan"), variant: "destructive" });
          navigate("/training");
          return;
        }

        // Try to resume an existing session for the same plan/date.
        // We intentionally do NOT filter by day_id: if the coach reorders
        // plan days after the client logged a workout, the day_id assigned
        // to that calendar date can change. We still want to reopen the
        // session the client already started/completed for that date,
        // instead of creating a new empty placeholder and making the
        // previous completion look lost.
        let existingQuery = supabase
          .from("workout_sessions")
          .select("id, plan_id, day_id, scheduled_date, completed_at")
          .eq("client_id", user.id)
          .eq("plan_id", planId);
        if (date) existingQuery = existingQuery.eq("scheduled_date", date);
        else existingQuery = existingQuery.is("scheduled_date", null);

        const { data: existing } = await existingQuery
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          // Reopen as-is. Preserve completed_at so the client can see the
          // workout is already marked complete; they can add more sets and
          // re-finish if they want, but we never silently un-complete it.
          session = existing;
          sid = existing.id;
          navigate(`/training/log/${sid}`, { replace: true });
        } else {
          const { data, error } = await supabase
            .from("workout_sessions")
            .insert({
              client_id: user.id,
              plan_id: planId,
              day_id: dayId,
              scheduled_date: date,
            })
            .select("id, plan_id, day_id, scheduled_date, completed_at")
            .single();
          if (error || !data) {
            toast({ title: tx("Kon sessie niet starten", "Could not start session"), variant: "destructive" });
            navigate("/training");
            return;
          }
          session = data;
          sid = data.id;
          navigate(`/training/log/${sid}`, { replace: true });
        }
      }


      if (!session) {
        navigate("/training");
        return;
      }
      setCompletedAt(session.completed_at);

      const [{ data: plan }, dayRes] = await Promise.all([
        supabase.from("workout_plans").select("name").eq("id", session.plan_id).maybeSingle(),
        session.day_id
          ? supabase.from("workout_plan_days").select("name").eq("id", session.day_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      setPlanName(plan?.name ?? "");
      setDayName(dayRes?.data?.name ?? null);

      let ex: PlanExercise[] = [];
      if (session.day_id) {
        const { data } = await supabase
          .from("workout_plan_exercises")
          .select("id, order_index, sets_reps, notes, exercise:exercises(name, muscle_group, video_url, exercise_type)")
          .eq("day_id", session.day_id)
          .order("order_index");
        ex = (data ?? []) as any;
      }
      setExercises(ex);

      const { data: logs } = await supabase
        .from("workout_set_logs")
        .select("id, plan_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_m, intensity, notes, speed_kmh, incline_pct" as any)
        .eq("session_id", sid!)
        .order("set_number");
      const emptyRow = (n: number): SetRow => ({
        set_number: n,
        reps: "",
        weight_kg: "",
        duration_seconds: "",
        distance_m: "",
        speed_kmh: "",
        incline_pct: "",
        intensity: "",
        notes: "",
      });
      const grouped: Record<string, SetRow[]> = {};
      for (const e of ex) {
        const mine = (logs ?? []).filter((l: any) => l.plan_exercise_id === e.id);
        if (mine.length) {
          grouped[e.id] = mine.map((l: any) => ({
            id: l.id,
            set_number: l.set_number,
            reps: l.reps?.toString() ?? "",
            weight_kg: l.weight_kg?.toString() ?? "",
            duration_seconds: l.duration_seconds?.toString() ?? "",
            distance_m: l.distance_m?.toString() ?? "",
            speed_kmh: l.speed_kmh?.toString() ?? "",
            incline_pct: l.incline_pct?.toString() ?? "",
            intensity: l.intensity ?? "",
            notes: l.notes ?? "",
            saved: true,
          }));
        } else {
          const targets = extractSetTargets(e.sets_reps);
          const rows = targets.length ? targets : [0];
          grouped[e.id] = rows.map((reps, i) => ({
            ...emptyRow(i + 1),
            reps: reps > 0 ? String(reps) : "",
          }));
        }
      }


      setSetsByExercise(grouped);
      setLoading(false);
    })();
  }, [user?.id, sessionId]);

  const activeExercise = activeIdx !== null ? exercises[activeIdx] : null;
  const activeSets = activeExercise ? setsByExercise[activeExercise.id] ?? [] : [];

  const isExerciseLogged = (exId: string) => {
    const rows = setsByExercise[exId] ?? [];
    // Only count rows that were actually saved by the user — prefilled target
    // reps (no id, saved === undefined) should NOT mark an exercise as logged.
    return rows.some((r) => !!r.id);
  };

  const completedCount = useMemo(
    () => exercises.filter((e) => isExerciseLogged(e.id)).length,
    [exercises, setsByExercise]
  );

  const updateSet = (idx: number, patch: Partial<SetRow>) => {
    if (!activeExercise) return;
    setSetsByExercise((prev) => {
      const arr = [...(prev[activeExercise.id] ?? [])];
      arr[idx] = { ...arr[idx], ...patch, saved: false };
      return { ...prev, [activeExercise.id]: arr };
    });
  };

  const addSet = () => {
    if (!activeExercise) return;
    setSetsByExercise((prev) => {
      const arr = prev[activeExercise.id] ?? [];
      return {
        ...prev,
        [activeExercise.id]: [
          ...arr,
          {
            set_number: arr.length + 1,
            reps: "",
            weight_kg: "",
            duration_seconds: "",
            distance_m: "",
            speed_kmh: "",
            incline_pct: "",
            intensity: "",
            notes: "",
          },
        ],
      };
    });
  };


  const removeSet = async (idx: number) => {
    if (!activeExercise) return;
    const row = (setsByExercise[activeExercise.id] ?? [])[idx];
    if (row?.id) {
      await supabase.from("workout_set_logs").delete().eq("id", row.id);
    }
    setSetsByExercise((prev) => {
      const arr = (prev[activeExercise.id] ?? []).filter((_, i) => i !== idx);
      return {
        ...prev,
        [activeExercise.id]: arr.map((s, i) => ({ ...s, set_number: i + 1 })),
      };
    });
  };

  const persistRows = async (planExerciseId: string, rows: SetRow[]) => {
    if (!sessionId) return rows;
    const updated: SetRow[] = [];
    for (const row of rows) {
      const hasContent =
        (row.reps && row.reps !== "") ||
        (row.weight_kg && row.weight_kg !== "") ||
        (row.duration_seconds && row.duration_seconds !== "") ||
        (row.distance_m && row.distance_m !== "") ||
        (row.speed_kmh && row.speed_kmh !== "") ||
        (row.incline_pct && row.incline_pct !== "") ||
        (row.intensity && row.intensity !== "") ||
        (row.notes && row.notes !== "");

      // Skip empty, never-saved rows
      if (!row.id && !hasContent) {
        updated.push(row);
        continue;
      }

      // Skip prefilled rows the user never touched.
      // Prefilled rows have `saved` undefined; user edits set `saved: false`;
      // rows loaded from DB have `saved: true`. Only persist new rows when
      // the user actually edited them.
      if (!row.id && row.saved !== false) {
        updated.push(row);
        continue;
      }

      const payload: any = {
        session_id: sessionId,
        plan_exercise_id: planExerciseId,
        set_number: row.set_number,
        reps: row.reps ? parseInt(row.reps) : null,
        weight_kg: parseDecimal(row.weight_kg),
        duration_seconds: row.duration_seconds ? parseInt(row.duration_seconds) : null,
        distance_m: row.distance_m ? parseInt(row.distance_m) : null,
        speed_kmh: parseDecimal(row.speed_kmh),
        incline_pct: parseDecimal(row.incline_pct),
        intensity: row.intensity || null,
        notes: row.notes || null,
      };

      if (row.id) {
        await supabase.from("workout_set_logs").update(payload).eq("id", row.id);
        updated.push({ ...row, saved: true });
      } else {
        const { data } = await supabase
          .from("workout_set_logs")
          .insert(payload)
          .select("id")
          .single();
        updated.push({ ...row, id: data?.id ?? row.id, saved: true });
      }
    }
    return updated;
  };

  const saveActive = async () => {
    if (!activeExercise || !sessionId) return;
    setSaving(true);
    const rows = setsByExercise[activeExercise.id] ?? [];
    const updated = await persistRows(activeExercise.id, rows);
    setSetsByExercise((prev) => ({ ...prev, [activeExercise.id]: updated }));
    setSaving(false);
    toast({ title: tx("Opgeslagen", "Saved") });
  };

  const saveAll = async () => {
    if (!sessionId) return;
    const next: Record<string, SetRow[]> = { ...setsByExercise };
    for (const ex of exercises) {
      const rows = setsByExercise[ex.id] ?? [];
      next[ex.id] = await persistRows(ex.id, rows);
    }
    setSetsByExercise(next);
  };

  const finishWorkout = async () => {
    if (!sessionId) return;
    setSaving(true);
    await saveAll();
    const { error } = await supabase
      .from("workout_sessions")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", sessionId);
    setSaving(false);
    if (!error) {
      toast({ title: tx("Workout voltooid! 💪", "Workout completed! 💪") });
      navigate("/training");
    } else {
      toast({
        title: tx("Kon workout niet voltooien", "Could not finish workout"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const backToOverview = async () => {
    await saveActive();
    setActiveIdx(null);
  };

  const progress = useMemo(() => {
    const total = exercises.length || 1;
    return Math.round((completedCount / total) * 100);
  }, [completedCount, exercises.length]);

  const FINISH_THRESHOLD = 0.8;
  const requiredCount = Math.ceil(exercises.length * FINISH_THRESHOLD);
  const canFinish = exercises.length > 0 && completedCount >= requiredCount;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/training" className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            {tx("Terug", "Back")}
          </Link>
        </Button>
        {completedAt && (
          <div className="flex items-center gap-1.5 bg-success/10 text-success px-3 py-1.5 rounded-full text-xs font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {tx("Voltooid", "Completed")}
          </div>
        )}
      </div>

      <Card className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-primary" />
          <h1 className="text-lg sm:text-xl font-semibold">{planName}</h1>
        </div>
        {dayName && (
          <p className="text-sm text-muted-foreground">{dayName}</p>
        )}
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>
              {completedCount} / {exercises.length || 0} {tx("voltooid", "completed")}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </Card>

      {exercises.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {tx("Geen oefeningen voor deze dag.", "No exercises for this day.")}
        </Card>
      ) : activeExercise ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={backToOverview}
            className="-ml-2 gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            {tx("Terug naar overzicht", "Back to overview")}
          </Button>

          <Card className="p-4 sm:p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-semibold">
                  {activeExercise.exercise?.name ?? "—"}
                </h2>
                {activeExercise.exercise?.muscle_group && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {activeExercise.exercise.muscle_group}
                  </Badge>
                )}
              </div>
              {activeExercise.sets_reps && (
                <p className="text-xs text-muted-foreground mt-1">
                  {tx("Doel", "Target")}: {formatSetsRepsForDisplay(activeExercise.sets_reps)}
                </p>
              )}
              {activeExercise.notes && (
                <p className="text-xs text-muted-foreground italic mt-1">
                  {activeExercise.notes}
                </p>
              )}
              {activeExercise.exercise?.video_url && (
                <a
                  href={activeExercise.exercise.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="group mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground shadow-md shadow-secondary/30 transition-all hover:bg-secondary/90 hover:shadow-lg hover:shadow-secondary/40 active:scale-[0.98] sm:w-auto sm:py-2.5"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:scale-110">
                    <Video className="h-4 w-4" fill="currentColor" />
                  </span>
                  <span>{tx("Bekijk demonstratie video", "Watch demo video")}</span>
                </a>
              )}
            </div>


            {activeExercise.exercise?.exercise_type === "cardio" ? (
              <div className="space-y-3">
                {activeSets.map((s, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {tx("Sessie", "Session")} {s.set_number}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSet(i)}
                        className="h-7 w-7 text-muted-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {tx("Duur (min)", "Duration (min)")}
                        </label>
                        <Input
                          inputMode="numeric"
                          placeholder="0"
                          value={
                            s.duration_seconds
                              ? String(Math.round(parseInt(s.duration_seconds) / 60))
                              : ""
                          }
                          onChange={(e) =>
                            updateSet(i, {
                              duration_seconds: e.target.value
                                ? String(parseInt(e.target.value) * 60)
                                : "",
                            })
                          }
                          className="h-10 text-center"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {tx("Snelheid (km/u)", "Speed (km/h)")}
                        </label>
                        <Input
                          inputMode="decimal"
                          placeholder="0"
                          value={s.speed_kmh}
                          onChange={(e) => updateSet(i, { speed_kmh: e.target.value })}
                          className="h-10 text-center"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {tx("Helling (%)", "Incline (%)")}
                        </label>
                        <Input
                          inputMode="decimal"
                          placeholder="0"
                          value={s.incline_pct}
                          onChange={(e) => updateSet(i, { incline_pct: e.target.value })}
                          className="h-10 text-center"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSet}
                  className="w-full gap-1"
                >
                  <Plus className="h-4 w-4" />
                  {tx("Sessie toevoegen", "Add session")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[2rem_1fr_1fr_auto] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                  <span>{tx("Set", "Set")}</span>
                  <span>{tx("Herh.", "Reps")}</span>
                  <span>{tx("Kg", "Kg")}</span>
                  <span></span>
                </div>
                {activeSets.map((s, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[2rem_1fr_1fr_auto] gap-2 items-center"
                  >
                    <span className="text-sm font-semibold text-muted-foreground text-center">
                      {s.set_number}
                    </span>
                    <Input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder={
                        activeExercise.sets_reps
                          ? extractRepRange(activeExercise.sets_reps) ?? "0"
                          : "0"
                      }
                      value={s.reps}
                      onChange={(e) => updateSet(i, { reps: e.target.value })}
                      className="h-10 text-center"
                    />
                    <Input
                      inputMode="decimal"
                      placeholder="0"
                      value={s.weight_kg}
                      onChange={(e) => updateSet(i, { weight_kg: e.target.value })}
                      className="h-10 text-center"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSet(i)}
                      aria-label={tx("Verwijder set", "Remove set")}
                      className="h-9 w-9 text-muted-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSet}
                  className="w-full gap-1"
                >
                  <Plus className="h-4 w-4" />
                  {tx("Set toevoegen", "Add set")}
                </Button>
              </div>
            )}


            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                {tx("Notitie", "Note")}
              </label>
              <Textarea
                placeholder={tx("Hoe ging het?", "How did it go?")}
                value={activeSets[0]?.notes ?? ""}
                onChange={(e) =>
                  activeSets[0] && updateSet(0, { notes: e.target.value })
                }
                rows={2}
              />
            </div>

            <Button
              onClick={async () => {
                await saveActive();
                setActiveIdx(null);
              }}
              disabled={saving}
              className="w-full h-11"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  {tx("Opslaan & terug", "Save & back")}
                </>
              )}
            </Button>
          </Card>
        </>
      ) : (
        <>
          <Card className="p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-2 px-1 pb-1">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {tx("Kies een oefening", "Pick an exercise")}
              </span>
            </div>
            {exercises.map((ex, idx) => {
              const done = isExerciseLogged(ex.id);
              const setCount = (setsByExercise[ex.id] ?? []).filter(
                (r) => r.id || r.reps || r.weight_kg
              ).length;
              return (
                <button
                  key={ex.id}
                  onClick={() => setActiveIdx(idx)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
                >
                  <div
                    className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      done
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-semibold tabular-nums">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {ex.exercise?.name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {ex.sets_reps ? formatSetsRepsForDisplay(ex.sets_reps) : tx("Geen doel", "No target")}
                      {done && setCount > 0 && (
                        <> · {setCount} {tx("sets gelogd", "sets logged")}</>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </Card>

          <Button
            onClick={finishWorkout}
            disabled={saving || !canFinish}
            className="w-full h-12"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : canFinish ? (
              tx("Workout voltooien", "Finish workout")
            ) : (
              tx(
                `Nog ${Math.max(0, requiredCount - completedCount)} oefening(en) nodig`,
                `${Math.max(0, requiredCount - completedCount)} more exercise(s) needed`
              )
            )}
          </Button>
          {exercises.length > 0 && !canFinish && (
            <p className="text-[11px] text-center text-muted-foreground">
              {tx(
                `Je voortgang wordt automatisch opgeslagen. Voltooi minstens 80% (${requiredCount}/${exercises.length}) om af te ronden.`,
                `Your progress is saved automatically. Complete at least 80% (${requiredCount}/${exercises.length}) to finish.`
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default LogWorkout;
