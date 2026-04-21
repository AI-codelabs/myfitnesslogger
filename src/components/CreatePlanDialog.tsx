import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
}

interface DayDraft {
  name: string;
  exercises: { exercise_id: string; sets_reps: string; notes: string }[];
}

const CATEGORIES = [
  "full_body",
  "upper_lower",
  "push_pull_legs",
  "bro_split",
  "other",
];

export function CreatePlanDialog({ onCreated }: { onCreated?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [frequency, setFrequency] = useState<string>("3");

  // Step 2
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filter, setFilter] = useState("");
  const [days, setDays] = useState<DayDraft[]>([{ name: "Day 1", exercises: [] }]);
  const [activeDayIdx, setActiveDayIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("exercises")
      .select("id,name,muscle_group,equipment")
      .order("muscle_group")
      .order("name")
      .then(({ data }) => setExercises(data ?? []));
  }, [open]);

  function reset() {
    setStep(1);
    setName("");
    setDescription("");
    setCategory("other");
    setFrequency("3");
    setDays([{ name: "Day 1", exercises: [] }]);
    setActiveDayIdx(0);
    setFilter("");
  }

  function toggleExercise(exId: string) {
    setDays((prev) => {
      const next = [...prev];
      const day = { ...next[activeDayIdx] };
      const existing = day.exercises.find((e) => e.exercise_id === exId);
      if (existing) {
        day.exercises = day.exercises.filter((e) => e.exercise_id !== exId);
      } else {
        day.exercises = [...day.exercises, { exercise_id: exId, sets_reps: "", notes: "" }];
      }
      next[activeDayIdx] = day;
      return next;
    });
  }

  function updateExerciseField(exId: string, field: "sets_reps" | "notes", value: string) {
    setDays((prev) => {
      const next = [...prev];
      const day = { ...next[activeDayIdx] };
      day.exercises = day.exercises.map((e) =>
        e.exercise_id === exId ? { ...e, [field]: value } : e,
      );
      next[activeDayIdx] = day;
      return next;
    });
  }

  function addDay() {
    setDays((prev) => [...prev, { name: `Day ${prev.length + 1}`, exercises: [] }]);
    setActiveDayIdx(days.length);
  }

  function removeDay(idx: number) {
    if (days.length === 1) return;
    setDays((prev) => prev.filter((_, i) => i !== idx));
    setActiveDayIdx(Math.max(0, activeDayIdx - (idx <= activeDayIdx ? 1 : 0)));
  }

  function renameDay(idx: number, value: string) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, name: value } : d)));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Plan name is required");
      setStep(1);
      return;
    }
    const totalEx = days.reduce((s, d) => s + d.exercises.length, 0);
    if (totalEx === 0) {
      toast.error("Add at least one exercise");
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const { data: plan, error: planErr } = await supabase
        .from("workout_plans")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          category,
          frequency_per_week: Number(frequency) || null,
          is_template: false,
          coach_id: uid,
        })
        .select()
        .single();
      if (planErr) throw planErr;

      for (let i = 0; i < days.length; i++) {
        const d = days[i];
        const { data: dayRow, error: dayErr } = await supabase
          .from("workout_plan_days")
          .insert({ plan_id: plan.id, name: d.name, day_index: i })
          .select()
          .single();
        if (dayErr) throw dayErr;

        if (d.exercises.length > 0) {
          const rows = d.exercises.map((e, idx) => ({
            day_id: dayRow.id,
            exercise_id: e.exercise_id,
            order_index: idx,
            sets_reps: e.sets_reps || null,
            notes: e.notes || null,
          }));
          const { error: exErr } = await supabase.from("workout_plan_exercises").insert(rows);
          if (exErr) throw exErr;
        }
      }

      toast.success("Workout plan created");
      setOpen(false);
      reset();
      onCreated?.();
      navigate(`/workouts/${plan.id}`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create plan");
    } finally {
      setSaving(false);
    }
  }

  const filteredEx = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(filter.toLowerCase()) ||
      (e.muscle_group ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      (e.equipment ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  const activeDay = days[activeDayIdx];
  const selectedIds = new Set(activeDay?.exercises.map((e) => e.exercise_id) ?? []);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "New workout plan" : `Build days · ${name}`}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Set general information about the plan."
              : "Add training days and pick exercises from the library."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Name *</Label>
              <Input
                id="plan-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Upper / Lower 4-day"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-desc">Description</Label>
              <Textarea
                id="plan-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this plan"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-freq">Frequency / week</Label>
                <Input
                  id="plan-freq"
                  type="number"
                  min={1}
                  max={7}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
            {/* Days sidebar */}
            <div className="col-span-3 border rounded-md p-2 flex flex-col min-h-0">
              <div className="text-xs font-semibold text-muted-foreground px-2 py-1">DAYS</div>
              <ScrollArea className="flex-1">
                <div className="space-y-1">
                  {days.map((d, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm cursor-pointer ${
                        i === activeDayIdx ? "bg-accent" : "hover:bg-accent/50"
                      }`}
                      onClick={() => setActiveDayIdx(i)}
                    >
                      <span className="flex-1 truncate">
                        {d.name}{" "}
                        <span className="text-xs text-muted-foreground">({d.exercises.length})</span>
                      </span>
                      {days.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeDay(i);
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={addDay}>
                <Plus className="h-3 w-3" /> Add day
              </Button>
            </div>

            {/* Library */}
            <div className="col-span-5 border rounded-md p-2 flex flex-col min-h-0">
              <div className="space-y-2 pb-2">
                <Input
                  value={activeDay?.name ?? ""}
                  onChange={(e) => renameDay(activeDayIdx, e.target.value)}
                  placeholder="Day name"
                  className="h-8"
                />
                <Input
                  placeholder="Search exercises…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-8"
                />
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-1">
                  {filteredEx.map((ex) => (
                    <label
                      key={ex.id}
                      className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.has(ex.id)}
                        onCheckedChange={() => toggleExercise(ex.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{ex.name}</div>
                        <div className="flex gap-1 mt-0.5">
                          {ex.muscle_group && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {ex.muscle_group}
                            </Badge>
                          )}
                          {ex.equipment && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {ex.equipment}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                  {filteredEx.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No exercises match.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Selected for this day */}
            <div className="col-span-4 border rounded-md p-2 flex flex-col min-h-0">
              <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
                {activeDay?.name?.toUpperCase()} · {activeDay?.exercises.length ?? 0} exercises
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {activeDay?.exercises.map((e) => {
                    const ex = exercises.find((x) => x.id === e.exercise_id);
                    return (
                      <div key={e.exercise_id} className="border rounded-md p-2 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium">{ex?.name}</div>
                          <button
                            onClick={() => toggleExercise(e.exercise_id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <Input
                          placeholder="Sets/reps (e.g. 4x 8-10)"
                          value={e.sets_reps}
                          onChange={(ev) =>
                            updateExerciseField(e.exercise_id, "sets_reps", ev.target.value)
                          }
                          className="h-7 text-xs"
                        />
                        <Input
                          placeholder="Notes (optional)"
                          value={e.notes}
                          onChange={(ev) =>
                            updateExerciseField(e.exercise_id, "notes", ev.target.value)
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                    );
                  })}
                  {(!activeDay || activeDay.exercises.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Pick exercises from the library.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {step === 2 ? (
            <Button variant="outline" onClick={() => setStep(1)} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <Button
              onClick={() => {
                if (!name.trim()) {
                  toast.error("Plan name is required");
                  return;
                }
                setStep(2);
              }}
              className="gap-1"
            >
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create plan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
