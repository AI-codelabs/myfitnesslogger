import { useState } from "react";
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
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "glutes",
  "core",
  "cardio",
  "full_body",
  "other",
];

const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
];

export function CreateExerciseDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<string>("chest");
  const [equipment, setEquipment] = useState<string>("barbell");
  const [notes, setNotes] = useState("");
  const [isPro, setIsPro] = useState(false);

  function reset() {
    setName("");
    setMuscleGroup("chest");
    setEquipment("barbell");
    setNotes("");
    setIsPro(false);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Exercise name is required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("exercises").insert({
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment,
        notes: notes.trim() || null,
        is_pro: isPro,
      });
      if (error) throw error;
      toast.success("Exercise added to library");
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add exercise");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" /> New exercise
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New exercise</DialogTitle>
          <DialogDescription>Add a new exercise to the global library.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ex-name">Name *</Label>
            <Input
              id="ex-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Incline dumbbell press"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Muscle group</Label>
              <Select value={muscleGroup} onValueChange={setMuscleGroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MUSCLE_GROUPS.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Equipment</Label>
              <Select value={equipment} onValueChange={setEquipment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EQUIPMENT.map((eq) => (
                    <SelectItem key={eq} value={eq} className="capitalize">
                      {eq}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-notes">Notes</Label>
            <Textarea
              id="ex-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional cues or instructions"
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isPro} onCheckedChange={(v) => setIsPro(!!v)} />
            <span className="text-sm">Mark as PRO exercise</span>
          </label>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add exercise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
