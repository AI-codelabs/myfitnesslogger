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
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Trash2, Video, Loader2, Pencil, Check, Copy, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { AddExerciseToDayDialog } from "@/components/AddExerciseToDayDialog";
import { DuplicatePlanDialog } from "@/components/DuplicatePlanDialog";
import { SetsRepsEditor } from "@/components/SetsRepsEditor";
import { formatWorkoutPlanMutationError } from "@/lib/workoutPlanErrors";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

type DayTypeKey =
  | "lower"
  | "upper"
  | "push"
  | "pull"
  | "legs"
  | "full"
  | "core"
  | "cardio"
  | "rest"
  | "other";

const DAY_TYPE_THEME: Record<
  DayTypeKey,
  { label: string; header: string; ring: string; dot: string; chip: string }
> = {
  lower: {
    label: "Lower",
    header: "bg-blue-500/10 border-b-blue-500/30",
    ring: "border-l-4 border-l-blue-500",
    dot: "bg-blue-500",
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  upper: {
    label: "Upper",
    header: "bg-orange-500/10 border-b-orange-500/30",
    ring: "border-l-4 border-l-orange-500",
    dot: "bg-orange-500",
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  },
  push: {
    label: "Push",
    header: "bg-rose-500/10 border-b-rose-500/30",
    ring: "border-l-4 border-l-rose-500",
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  pull: {
    label: "Pull",
    header: "bg-violet-500/10 border-b-violet-500/30",
    ring: "border-l-4 border-l-violet-500",
    dot: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  },
  legs: {
    label: "Legs",
    header: "bg-emerald-500/10 border-b-emerald-500/30",
    ring: "border-l-4 border-l-emerald-500",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  full: {
    label: "Full body",
    header: "bg-amber-500/10 border-b-amber-500/30",
    ring: "border-l-4 border-l-amber-500",
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  core: {
    label: "Core",
    header: "bg-teal-500/10 border-b-teal-500/30",
    ring: "border-l-4 border-l-teal-500",
    dot: "bg-teal-500",
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  },
  cardio: {
    label: "Cardio",
    header: "bg-pink-500/10 border-b-pink-500/30",
    ring: "border-l-4 border-l-pink-500",
    dot: "bg-pink-500",
    chip: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
  },
  rest: {
    label: "Rest",
    header: "bg-muted border-b",
    ring: "border-l-4 border-l-muted-foreground/30",
    dot: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground border-border",
  },
  other: {
    label: "Mixed",
    header: "bg-muted/40 border-b",
    ring: "border-l-4 border-l-border",
    dot: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground border-border",
  },
};

function detectDayType(dayName: string, muscleGroups: string[]): DayTypeKey {
  const n = dayName.toLowerCase();
  if (/(rust|rest|off)/.test(n)) return "rest";
  if (/(full\s*body|full|ganzk|total)/.test(n)) return "full";
  if (/(push|duw)/.test(n)) return "push";
  if (/(pull|trek)/.test(n)) return "pull";
  if (/(leg|been|quad|hamstring|glute|kuit|calf)/.test(n)) return "legs";
  if (/(lower|onder|benen)/.test(n)) return "lower";
  if (/(upper|boven)/.test(n)) return "upper";
  if (/(core|buik|abs)/.test(n)) return "core";
  if (/(cardio|hiit|condit)/.test(n)) return "cardio";

  // Fallback: infer from exercise muscle groups
  const groups = muscleGroups.map((g) => (g || "").toLowerCase());
  const lowerSet = ["quads", "hamstrings", "glutes", "calves", "legs"];
  const upperSet = ["chest", "back", "shoulders", "biceps", "triceps", "lats", "traps"];
  const pushSet = ["chest", "shoulders", "triceps"];
  const pullSet = ["back", "biceps", "lats"];
  const lowerHits = groups.filter((g) => lowerSet.includes(g)).length;
  const upperHits = groups.filter((g) => upperSet.includes(g)).length;
  if (lowerHits && !upperHits) return "lower";
  if (upperHits && !lowerHits) {
    const pushHits = groups.filter((g) => pushSet.includes(g)).length;
    const pullHits = groups.filter((g) => pullSet.includes(g)).length;
    if (pushHits && !pullHits) return "push";
    if (pullHits && !pushHits) return "pull";
    return "upper";
  }
  if (lowerHits && upperHits) return "full";
  return "other";
}

function SortableDayWrapper({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (handle: {
    attributes: React.HTMLAttributes<HTMLElement>;
    listeners: React.HTMLAttributes<HTMLElement> | undefined;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({
        attributes: attributes as React.HTMLAttributes<HTMLElement>,
        listeners: listeners as React.HTMLAttributes<HTMLElement> | undefined,
        isDragging,
      })}
    </div>
  );
}

export default function WorkoutPlan() {
  const { planId } = useParams();
  const { user, role } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [items, setItems] = useState<PlanExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [addToDayId, setAddToDayId] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);

  const isOwnPlan = !!plan && role === "coach" && plan.coach_id === user?.id;
  const isSharedTemplate = !!plan && role === "coach" && plan.is_template && plan.coach_id !== user?.id;
  const canDuplicatePlan = !!plan && role === "coach";
  const canEditPlan = isOwnPlan;
  const [editMode, setEditMode] = useState(false);
  const canEdit = canEditPlan && editMode;
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDayDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = days.findIndex((d) => d.id === active.id);
    const newIdx = days.findIndex((d) => d.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(days, oldIdx, newIdx);
    persistDayOrder(reordered);
  }

  async function load() {
    if (!planId) return;
    const [{ data: p }, { data: d }] = await Promise.all([
      supabase.from("workout_plans").select("*").eq("id", planId).maybeSingle(),
      supabase.from("workout_plan_days").select("*").eq("plan_id", planId).order("day_index"),
    ]);
    const loadedDays = (d ?? []) as Day[];
    setPlan(p as Plan | null);
    setDays(loadedDays);
    const dayIds = loadedDays.map((x) => x.id);
    if (dayIds.length) {
      const { data: ex } = await supabase
        .from("workout_plan_exercises")
        .select(
          "id, day_id, order_index, sets_reps, notes, exercise_id, exercise:exercises(name, is_pro, muscle_group, video_url)",
        )
        .in("day_id", dayIds)
        .order("order_index");
      setItems((ex ?? []) as unknown as PlanExercise[]);
    } else {
      setItems([]);
    }
    // load all distinct categories so coaches can reuse custom ones
    const { data: allCats } = await supabase.from("workout_plans").select("category");
    const extras = Array.from(
      new Set(
        (allCats ?? [])
          .map((r) => (r.category || "").trim())
          .filter((c: string) => c && !CATEGORIES.includes(c)),
      ),
    ) as string[];
    setExtraCategories(extras);
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
      toast.error(formatWorkoutPlanMutationError(error), { duration: 8000 });
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
    if (error) return toast.error(formatWorkoutPlanMutationError(error), { duration: 8000 });
    setDays([...days, data as Day]);
  }

  async function renameDay(dayId: string, name: string) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, name } : d)));
    const { error } = await supabase.from("workout_plan_days").update({ name }).eq("id", dayId);
    if (error) toast.error(formatWorkoutPlanMutationError(error), { duration: 8000 });
  }

  async function removeDay(dayId: string) {
    const { error } = await supabase.from("workout_plan_days").delete().eq("id", dayId);
    if (error) return toast.error(formatWorkoutPlanMutationError(error), { duration: 8000 });
    load();
  }

  async function persistDayOrder(ordered: Day[]) {
    // Optimistically update day_index, then persist via two-phase update to
    // avoid violating any unique (plan_id, day_index) constraint.
    const withIdx = ordered.map((d, i) => ({ ...d, day_index: i }));
    setDays(withIdx);
    if (!plan) return;
    // Phase 1: shift to high indexes (offset by 1000) to avoid collisions.
    await Promise.all(
      withIdx.map((d, i) =>
        supabase
          .from("workout_plan_days")
          .update({ day_index: 1000 + i })
          .eq("id", d.id),
      ),
    );
    // Phase 2: assign final indexes.
    const results = await Promise.all(
      withIdx.map((d, i) =>
        supabase.from("workout_plan_days").update({ day_index: i }).eq("id", d.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error(formatWorkoutPlanMutationError(failed.error), { duration: 8000 });
      load();
    }
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
    if (error) toast.error(formatWorkoutPlanMutationError(error), { duration: 8000 });
  }

  async function removeExercise(id: string) {
    const { error } = await supabase.from("workout_plan_exercises").delete().eq("id", id);
    if (error) return toast.error(formatWorkoutPlanMutationError(error), { duration: 8000 });
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
    const results = await Promise.all([
      supabase.from("workout_plan_exercises").update({ order_index: b }).eq("id", it.id),
      supabase.from("workout_plan_exercises").update({ order_index: a }).eq("id", other.id),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error(formatWorkoutPlanMutationError(failed.error), { duration: 8000 });
      load();
    }
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
      <div className="flex items-center justify-between gap-2">
        <Link to="/workouts">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Workouts
          </Button>
        </Link>
        {canDuplicatePlan && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setDupOpen(true)}
            >
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
            {canEditPlan && (
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setEditMode((v) => !v)}
              >
                {editMode ? (
                  <>
                    <Check className="h-4 w-4" /> Done
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4" /> Edit
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

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
                  onValueChange={(v) => {
                    if (v === "__new__") return;
                    updatePlan({ category: v });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c !== "other").map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c.replace("_", " ")}
                      </SelectItem>
                    ))}
                    {extraCategories.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c.replace("_", " ")}
                      </SelectItem>
                    ))}
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="New category name…"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      const c = newCategory.trim().toLowerCase().replace(/\s+/g, "_");
                      if (!c) return;
                      if (!extraCategories.includes(c) && !CATEGORIES.includes(c)) {
                        setExtraCategories((prev) => [...prev, c]);
                      }
                      updatePlan({ category: c });
                      setNewCategory("");
                    }}
                  >
                    Add
                  </Button>
                </div>
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

      {isSharedTemplate && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This is a shared workout template, so it cannot be edited directly.
          Duplicate it first to create your own copy, then make changes there.
        </Card>
      )}

      {/* Days grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDayDragEnd}
      >
        <SortableContext items={days.map((d) => d.id)} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {days.map((d) => {
          const dayItems = items
            .filter((i) => i.day_id === d.id)
            .sort((a, b) => a.order_index - b.order_index);
          const muscles = dayItems.map((i) => i.exercise?.muscle_group ?? "");
          const type = detectDayType(d.name, muscles);
          const theme = DAY_TYPE_THEME[type];
          const uniqueMuscles = Array.from(
            new Set(muscles.filter(Boolean).map((m) => m.toLowerCase())),
          );
          return (
            <SortableDayWrapper key={d.id} id={d.id} disabled={!canEdit}>
              {({ attributes, listeners }) => (
            <Card
              className={`overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow ${theme.ring}`}
            >
              <CardHeader className={`py-3 ${theme.header}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {canEdit && (
                      <button
                        type="button"
                        {...attributes}
                        {...listeners}
                        className="shrink-0 -ml-1 p-1 rounded text-muted-foreground hover:bg-background/60 cursor-grab active:cursor-grabbing touch-none"
                        aria-label="Drag to reorder day"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    )}
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${theme.dot}`} />
                    {canEdit ? (
                      <Input
                        value={d.name}
                        onChange={(e) =>
                          setDays((prev) =>
                            prev.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        onBlur={(e) => renameDay(d.id, e.target.value.trim() || "Day")}
                        className="h-8 font-semibold bg-background/60"
                      />
                    ) : (
                      <CardTitle className="text-base truncate">{d.name}</CardTitle>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${theme.chip}`}
                    >
                      {theme.label}
                    </span>
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
                <div className="flex items-center gap-2 mt-1 pl-4 text-[11px] text-muted-foreground">
                  <span>
                    {dayItems.length} {dayItems.length === 1 ? "exercise" : "exercises"}
                  </span>
                  {uniqueMuscles.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="truncate capitalize">
                        {uniqueMuscles.slice(0, 4).join(", ")}
                        {uniqueMuscles.length > 4 ? "…" : ""}
                      </span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                <ol className="divide-y flex-1">
                  {dayItems.map((it, idx) => (
                    <li key={it.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${theme.dot}`}
                        >
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
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground shadow-sm transition-colors hover:bg-secondary/90"
                                  >
                                    <Video className="h-3 w-3" fill="currentColor" />
                                    Watch video
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
                              <SetsRepsEditor
                                value={it.sets_reps}
                                onChange={(next) =>
                                  setItems((prev) =>
                                    prev.map((x) =>
                                      x.id === it.id ? { ...x, sets_reps: next } : x,
                                    ),
                                  )
                                }
                                onCommit={(next) =>
                                  updateExercise(it.id, { sets_reps: next })
                                }
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
              )}
            </SortableDayWrapper>
          );
        })}
      </div>
        </SortableContext>
      </DndContext>

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

      <DuplicatePlanDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        sourcePlanId={plan?.id ?? null}
        sourcePlanName={plan?.name ?? ""}
      />
    </div>
  );
}
