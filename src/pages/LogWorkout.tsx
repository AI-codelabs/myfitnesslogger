import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Loader2, Plus, Trash2, Check, Dumbbell, ChevronRight, ListChecks } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Lang } from "@/lib/onboardingSchema";

interface PlanExercise {
  id: string;
  sets_reps: string | null;
  notes: string | null;
  order_index: number;
  exercise: { name: string; muscle_group: string | null } | null;
}

interface SetRow {
  id?: string;
  set_number: number;
  reps: string;
  weight_kg: string;
  notes: string;
  saved?: boolean;
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
          .select("id, order_index, sets_reps, notes, exercise:exercises(name, muscle_group)")
          .eq("day_id", session.day_id)
          .order("order_index");
        ex = (data ?? []) as any;
      }
      setExercises(ex);

      const { data: logs } = await supabase
        .from("workout_set_logs")
        .select("id, plan_exercise_id, set_number, reps, weight_kg, notes")
        .eq("session_id", sid!)
        .order("set_number");
      const grouped: Record<string, SetRow[]> = {};
      for (const e of ex) {
        const mine = (logs ?? []).filter((l: any) => l.plan_exercise_id === e.id);
        if (mine.length) {
          grouped[e.id] = mine.map((l: any) => ({
            id: l.id,
            set_number: l.set_number,
            reps: l.reps?.toString() ?? "",
            weight_kg: l.weight_kg?.toString() ?? "",
            notes: l.notes ?? "",
            saved: true,
          }));
        } else {
          grouped[e.id] = [{ set_number: 1, reps: "", weight_kg: "", notes: "" }];
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
    return rows.some((r) => r.id || (r.reps && r.reps !== "") || (r.weight_kg && r.weight_kg !== ""));
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
          { set_number: arr.length + 1, reps: "", weight_kg: "", notes: "" },
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

  const saveActive = async () => {
    if (!activeExercise || !sessionId) return;
    setSaving(true);
    const rows = setsByExercise[activeExercise.id] ?? [];
    for (const row of rows) {
      const payload = {
        session_id: sessionId,
        plan_exercise_id: activeExercise.id,
        set_number: row.set_number,
        reps: row.reps ? parseInt(row.reps) : null,
        weight_kg: row.weight_kg ? parseFloat(row.weight_kg) : null,
        notes: row.notes || null,
      };
      if (row.id) {
        await supabase.from("workout_set_logs").update(payload).eq("id", row.id);
      } else {
        const { data } = await supabase
          .from("workout_set_logs")
          .insert(payload)
          .select("id")
          .single();
        if (data) row.id = data.id;
      }
      row.saved = true;
    }
    setSetsByExercise((prev) => ({ ...prev, [activeExercise.id]: [...rows] }));
    setSaving(false);
    toast({ title: tx("Opgeslagen", "Saved") });
  };

  const finishWorkout = async () => {
    if (!sessionId) return;
    await saveActive();
    const { error } = await supabase
      .from("workout_sessions")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (!error) {
      toast({ title: tx("Workout voltooid! 💪", "Workout completed! 💪") });
      navigate("/training");
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
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" />
            {tx("Voltooid", "Completed")}
          </Badge>
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
              {tx("Oefening", "Exercise")} {activeIdx + 1} / {exercises.length || 0}
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

      {!activeExercise ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {tx("Geen oefeningen voor deze dag.", "No exercises for this day.")}
        </Card>
      ) : (
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
                {tx("Doel", "Target")}: {activeExercise.sets_reps}
              </p>
            )}
            {activeExercise.notes && (
              <p className="text-xs text-muted-foreground italic mt-1">
                {activeExercise.notes}
              </p>
            )}
          </div>

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
                  placeholder="0"
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
            variant="secondary"
            size="sm"
            onClick={saveActive}
            disabled={saving}
            className="w-full"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              tx("Opslaan", "Save")
            )}
          </Button>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={activeIdx === 0 || saving}
          className="flex-1"
        >
          {tx("Vorige", "Previous")}
        </Button>
        {activeIdx < exercises.length - 1 ? (
          <Button onClick={goNext} disabled={saving} className="flex-1">
            {tx("Volgende", "Next")}
          </Button>
        ) : (
          <Button onClick={finishWorkout} disabled={saving} className="flex-1">
            {tx("Voltooi", "Finish")}
          </Button>
        )}
      </div>
    </div>
  );
};

export default LogWorkout;
