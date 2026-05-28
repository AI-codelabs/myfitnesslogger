import { useEffect, useState } from "react";
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
  "chest", "back", "shoulders", "biceps", "triceps",
  "legs", "glutes", "core", "cardio", "full_body", "other",
];

const EQUIPMENT = [
  "barbell", "dumbbell", "machine", "cable", "bodyweight",
  "kettlebell", "band", "other",
];

export interface ExerciseRecord {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  is_pro: boolean;
  notes?: string | null;
  video_url?: string | null;
  exercise_type?: string | null;
}


interface Props {
  exercise?: ExerciseRecord | null;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  trigger?: React.ReactNode;
  onSaved?: () => void;
}

export function ExerciseDialog({ exercise, open: controlledOpen, onOpenChange, trigger, onSaved }: Props) {
  const isEdit = !!exercise;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => {
    onOpenChange ? onOpenChange(o) : setInternalOpen(o);
  };

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<string>("chest");
  const [customMuscle, setCustomMuscle] = useState<string>("");
  const [equipment, setEquipment] = useState<string>("barbell");
  const [exerciseType, setExerciseType] = useState<string>("strength");
  const [notes, setNotes] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    if (open) {
      setName(exercise?.name ?? "");
      const mg = exercise?.muscle_group ?? "chest";
      const isKnown = MUSCLE_GROUPS.includes(mg);
      setMuscleGroup(isKnown ? mg : "__custom__");
      setCustomMuscle(isKnown ? "" : mg);
      setEquipment(exercise?.equipment ?? "barbell");
      setExerciseType(exercise?.exercise_type ?? "strength");
      setNotes(exercise?.notes ?? "");
      setVideoUrl(exercise?.video_url ?? "");
      setIsPro(exercise?.is_pro ?? false);
    }
  }, [open, exercise]);


  async function handleSave() {
    if (!name.trim()) {
      toast.error("Exercise name is required");
      return;
    }
    if (videoUrl && !/^https?:\/\//i.test(videoUrl.trim())) {
      toast.error("Video link must start with http(s)://");
      return;
    }
    setSaving(true);
    try {
      const resolvedMuscle =
        muscleGroup === "__custom__" ? customMuscle.trim().toLowerCase() : muscleGroup;
      if (!resolvedMuscle) {
        toast.error("Muscle group is required");
        setSaving(false);
        return;
      }
      const payload = {
        name: name.trim(),
        muscle_group: resolvedMuscle,
        equipment,
        exercise_type: exerciseType,
        notes: notes.trim() || null,
        video_url: videoUrl.trim() || null,
        is_pro: isPro,
      };

      if (isEdit && exercise) {
        const { error } = await supabase.from("exercises").update(payload).eq("id", exercise.id);
        if (error) throw error;
        toast.success("Exercise updated");
      } else {
        const { error } = await supabase.from("exercises").insert(payload);
        if (error) throw error;
        toast.success("Exercise added to library");
      }
      setOpen(false);
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save exercise");
    } finally {
      setSaving(false);
    }
  }

  const triggerNode = trigger ?? (
    <Button variant="outline" className="gap-2">
      <Plus className="h-4 w-4" /> New exercise
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && <DialogTrigger asChild>{triggerNode}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit exercise" : "New exercise"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the exercise details." : "Add a new exercise to the global library."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ex-name">Name *</Label>
            <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Incline dumbbell press" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Muscle group</Label>
              <Select value={muscleGroup} onValueChange={setMuscleGroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MUSCLE_GROUPS.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>
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
                    <SelectItem key={eq} value={eq} className="capitalize">{eq}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-video">Video link</Label>
            <Input
              id="ex-video"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/…"
            />
            <p className="text-xs text-muted-foreground">Optional — link to a video that demonstrates this exercise.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-notes">Notes</Label>
            <Textarea id="ex-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional cues or instructions" rows={3} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={isPro} onCheckedChange={(v) => setIsPro(!!v)} />
            <span className="text-sm">Mark as PRO exercise</span>
          </label>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add exercise"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateExerciseDialog({ onCreated }: { onCreated?: () => void }) {
  return <ExerciseDialog onSaved={onCreated} />;
}
