import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { ExerciseDialog } from "@/components/ExerciseDialog";

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dayId: string;
  dayName: string;
  existingExerciseIds: string[];
  nextOrderIndex: number;
  onAdded: () => void;
}

export function AddExerciseToDayDialog({
  open,
  onOpenChange,
  dayId,
  dayName,
  existingExerciseIds,
  nextOrderIndex,
  onAdded,
}: Props) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setFilter("");
    setLoading(true);
    supabase
      .from("exercises")
      .select("id,name,muscle_group,equipment")
      .order("muscle_group")
      .order("name")
      .then(({ data }) => {
        setExercises(data ?? []);
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return exercises.filter(
      (e) =>
        !existingExerciseIds.includes(e.id) &&
        (e.name.toLowerCase().includes(q) ||
          (e.muscle_group ?? "").toLowerCase().includes(q) ||
          (e.equipment ?? "").toLowerCase().includes(q)),
    );
  }, [exercises, filter, existingExerciseIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) return;
    setSaving(true);
    const rows = Array.from(selected).map((exerciseId, idx) => ({
      day_id: dayId,
      exercise_id: exerciseId,
      order_index: nextOrderIndex + idx,
      sets_reps: null,
      notes: null,
    }));
    const { error } = await supabase.from("workout_plan_exercises").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} added to ${dayName}`);
    onOpenChange(false);
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add exercises to {dayName}</DialogTitle>
          <DialogDescription>Pick one or more exercises from your library.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search exercises…"
            className="pl-8"
          />
        </div>

        <ScrollArea className="flex-1 -mx-1 px-1">
          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {filtered.map((ex) => (
                <label
                  key={ex.id}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(ex.id)}
                    onCheckedChange={() => toggle(ex.id)}
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
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No matching exercises.
                </p>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || selected.size === 0} className="gap-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
