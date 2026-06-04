import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Label } from "@/components/ui/label";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { duplicateWorkoutPlan } from "@/lib/duplicateWorkoutPlan";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourcePlanId: string | null;
  sourcePlanName: string;
  onDuplicated?: (newPlanId: string) => void;
}

export function DuplicatePlanDialog({
  open,
  onOpenChange,
  sourcePlanId,
  sourcePlanName,
  onDuplicated,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName(`${sourcePlanName} (copy)`);
  }, [open, sourcePlanName]);

  const submit = async () => {
    if (!user || !sourcePlanId) return;
    if (!name.trim()) {
      toast.error("Geef een naam op");
      return;
    }
    setSaving(true);
    try {
      const newId = await duplicateWorkoutPlan({
        sourcePlanId,
        coachId: user.id,
        newName: name.trim(),
      });
      toast.success("Schema gedupliceerd");
      onOpenChange(false);
      onDuplicated?.(newId);
      navigate(`/workouts/${newId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" /> Schema dupliceren
          </DialogTitle>
          <DialogDescription>
            Hoe wil je deze duplicaat noemen? Bijvoorbeeld met de naam van de
            client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="dup-name">Naam</Label>
          <Input
            id="dup-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="bv. Push/Pull - Jan"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) submit();
            }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuleren
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Dupliceren & bewerken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
