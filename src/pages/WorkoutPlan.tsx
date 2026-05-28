import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Trash2, Video, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AddExerciseToDayDialog } from "@/components/AddExerciseToDayDialog";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  frequency_per_week: number | null;
  category: string | null;
  is_template: boolean;
  coach_id: string | null;
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
  notes: string | null;
  exercise_id: string;
  exercise: { name: string; is_pro: boolean; muscle_group: string | null; video_url: string | null } | null;
}

const CATEGORIES = ["full_body", "upper_lower", "push_pull_legs", "bro_split", "other"];

export default function WorkoutPlan() {
  const { planId } = useParams();
  const { user, role } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [items, setItems] = useState<PlanExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [addToDayId, setAddToDayId] = useState<string | null>(null);

  const canEdit = !!plan && role === "coach" && plan.coach_id === user?.id && !plan.is_template;

  async function load() {
    if (!planId) return;
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
        .select(
          "id, day_id, order_index, sets_reps, notes, exercise_id, exercise:exercises(name, is_pro, muscle_group, video_url)",
        )
        .in("day_id", dayIds)
        .order("order_index");
      setItems((ex ?? []) as any);
    } else {
      setItems([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // ----- Plan-level edits -----
  async function updatePlan(patch: Partial<Plan>) {
    if (!plan) return;
    const next = { ...plan, ...patch };
    setPlan(next);
    const { error } = await supabase.from("workout_plans").update(patch).eq("id", plan.id);
    if (error) {
      toast.error(error.message);
      load();
    }
  }

  // ----- Day-level edits -----
  async function addDay() {
    if (!plan) return;
    const nextIdx = days.length;
    const { data, error } = await supabase
      .from("workout_plan_days")
      .insert({ plan_id: plan.id, name: `Day ${nextIdx + 1}`, day_index: nextIdx })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setDays([...days, data as Day]);
  }

  async function renameDay(dayId: string, name: string) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, name } : d)));
    const { error } = await supabase.from("workout_plan_days").update({ name }).eq("id", dayId);
    if (error) toast.error(error.message);
  }

  async function removeDay(dayId: string) {
    const { error } = await supabase.from("workout_plan_days").delete().eq("id", dayId);
    if (error) return toast.error(error.message);
    load();
  }

  // ----- Exercise-level edits -----
  async function updateExercise(id: string, patch: Partial<PlanExercise>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const { error } = await supabase
      .from("workout_plan_exercises")
      .update({
        sets_reps: patch.sets_reps ?? undefined,
        notes: patch.notes ?? undefined,
      })
      .eq("id", id);
    if (error) toast.error(error.message);
  }

  async function removeExercise(id: string) {
    const { error } = await supabase.from("workout_plan_exercises").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function moveExercise(it: PlanExercise, direction: -1 | 1) {
    const siblings = items.filter((x) => x.day_id === it.day_id).sort((a, b) => a.order_index - b.order_index);
    const idx = siblings.findIndex((s) => s.id === it.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    // swap order_index
    const a = it.order_index;
    const b = other.order_index;
    setItems((prev) =>
      prev.map((x) =>
        x.id === it.id ? { ...x, order_index: b } : x.id === other.id ? { ...x, order_index: a } : x,
      ),
    );
    await Promise.all([
      supabase.from("workout_plan_exercises").update({ order_index: b }).eq("id", it.id),
      supabase.from("workout_plan_exercises").update({ order_index: a }).eq("id", other.id),
    ]);
  }

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  if (!plan) return <div className="p-8">Plan not found.</div>;

  const addingToDay = addToDayId ? days.find((d) => d.id === addToDayId) : null;
  const existingIdsForDay = addToDayId ? items.filter((i) => i.day_id === addToDayId).map((i) => i.exercise_id) : [];
  const nextOrderIndex = addToDayId
    ? (items.filter((i) => i.day_id === addToDayId).reduce((m, i) => Math.max(m, i.order_index), -1) + 1)
    : 0;

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-6xl mx-auto">
      <Link to="/workouts">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Workouts
        </Button>
      </Link>

      {/* Header / plan info */}
      <Card className="p-5 space-y-3">
        {canEdit ? (
          <div className="space-y-3">
            <Input
              value={plan.name}
              onChange={(e) => setPlan({ ...plan, name: e.target.value })}
              onBlur={(e) => updatePlan({ name: e.target.value })}
              className="text-xl font-semibold h-11"
            />
            <Textarea
              value={plan.description ?? ""}
              onChange={(e) => setPlan({ ...plan, description: e.target.value })}
              onBlur={(e) => updatePlan({ description: e.target.value || null })}
              placeholder="Description (optional)"
              rows={2}
            />
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Category</label>
                <Select
                  value={plan.category ?? "other"}
                  onValueChange={(v) => updatePlan({ category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Frequency / week</label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={plan.frequency_per_week ?? ""}
                  onChange={(e) =>
                    setPlan({ ...plan, frequency_per_week: e.target.value ? Number(e.target.value) : null })
                  }
                  onBlur={(e) =>
                    updatePlan({ frequency_per_week: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-semibold tracking-tight">{plan.name}</h1>
              {plan.is_template && <Badge variant="secondary">Template</Badge>}
              {plan.frequency_per_week && (
                <Badge variant="outline">{plan.frequency_per_week}x / week</Badge>
              )}
            </div>
            {plan.description && <p className="text-muted-foreground mt-1">{plan.description}</p>}
          </>
        )}
      </Card>

      {/* Days grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {days.map((d) => {
          const dayItems = items
            .filter((i) => i.day_id === d.id)
            .sort((a, b) => a.order_index - b.order_index);
          return (
            <Card key={d.id} className="overflow-hidden flex flex-col">
              <CardHeader className="bg-muted/40 border-b py-3">
                <div className="flex items-center justify-between gap-2">
                  {canEdit ? (
                    <Input
                      value={d.name}
                      onChange={(e) =>
                        setDays((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)),
                        )
                      }
                      onBlur={(e) => renameDay(d.id, e.target.value.trim() || "Day")}
                      className="h-8 font-semibold"
                    />
                  ) : (
                    <CardTitle className="text-base">{d.name}</CardTitle>
                  )}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {dayItems.length} {dayItems.length === 1 ? "exercise" : "exercises"}
                    </Badge>
                    {canEdit && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            aria-label="Delete day"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this day?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove "{d.name}" and all its exercises from the plan.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeDay(d.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                <ol className="divide-y flex-1">
                  {dayItems.map((it, idx) => (
                    <li key={it.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium leading-snug break-words">
                                {it.exercise?.name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {it.exercise?.muscle_group && (
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {it.exercise.muscle_group}
                                  </span>
                                )}
                                {it.exercise?.is_pro && (
                                  <Badge className="bg-secondary text-secondary-foreground text-[10px] py-0 px-1.5 h-4">
                                    PRO
                                  </Badge>
                                )}
                                {it.exercise?.video_url && (
                                  <a
                                    href={it.exercise.video_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                                  >
                                    <Video className="h-3 w-3" />
                                    Video
                                  </a>
                                )}
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground"
                                  onClick={() => moveExercise(it, -1)}
                                  disabled={idx === 0}
                                  aria-label="Move up"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground"
                                  onClick={() => moveExercise(it, 1)}
                                  disabled={idx === dayItems.length - 1}
                                  aria-label="Move down"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeExercise(it.id)}
                                  aria-label="Remove exercise"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {canEdit ? (
                            <div className="space-y-1.5">
                              <Input
                                value={it.sets_reps ?? ""}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((x) =>
                                      x.id === it.id ? { ...x, sets_reps: e.target.value } : x,
                                    ),
                                  )
                                }
                                onBlur={(e) =>
                                  updateExercise(it.id, { sets_reps: e.target.value || null })
                                }
                                placeholder="Sets/reps (e.g. 4x 8-10)"
                                className="h-7 text-xs"
                              />
                              <Input
                                value={it.notes ?? ""}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((x) =>
                                      x.id === it.id ? { ...x, notes: e.target.value } : x,
                                    ),
                                  )
                                }
                                onBlur={(e) =>
                                  updateExercise(it.id, { notes: e.target.value || null })
                                }
                                placeholder="Notes (optional)"
                                className="h-7 text-xs"
                              />
                            </div>
                          ) : (
                            <>
                              {it.sets_reps && (
                                <div className="text-sm font-medium text-foreground/80 tabular-nums">
                                  {it.sets_reps}
                                </div>
                              )}
                              {it.notes && (
                                <div className="text-xs text-muted-foreground italic">
                                  {it.notes}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                  {dayItems.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No exercises yet.
                    </li>
                  )}
                </ol>
                {canEdit && (
                  <div className="border-t p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => setAddToDayId(d.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Add exercise
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={addDay} className="gap-2">
            <Plus className="h-4 w-4" /> Add day
          </Button>
        </div>
      )}

      {addingToDay && (
        <AddExerciseToDayDialog
          open={!!addToDayId}
          onOpenChange={(o) => !o && setAddToDayId(null)}
          dayId={addingToDay.id}
          dayName={addingToDay.name}
          existingExerciseIds={existingIdsForDay}
          nextOrderIndex={nextOrderIndex}
          onAdded={() => {
            setAddToDayId(null);
            load();
          }}
        />
      )}
    </div>
  );
}
