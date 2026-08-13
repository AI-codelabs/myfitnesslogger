import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Copy, MoreVertical, Move, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Lang } from "@/lib/onboardingSchema";
import { ComputedOccurrence, formatDateKey } from "@/lib/workoutSchedule";
import { db } from "@/lib/db";

type Action = "move" | "copy" | "delete";
type Scope = "single" | "future";

interface Props {
  occurrence: ComputedOccurrence;
  clientId: string;
  lang: Lang;
  /** Called after any successful action so the parent can refresh. */
  onChanged: () => void;
  /** Optional override for the trigger button appearance. */
  triggerClassName?: string;
  align?: "start" | "center" | "end";
}

export function WorkoutInstanceActions({
  occurrence,
  clientId,
  lang,
  onChanged,
  triggerClassName,
  align = "end",
}: Props) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);

  const openAction = (a: Action) => {
    setMenuOpen(false);
    // Defer so the sheet/menu can finish closing on mobile before the dialog mounts
    setTimeout(() => setAction(a), 0);
  };

  const items = (
    <>
      <ActionRow
        icon={<Move className="h-4 w-4" />}
        label={tx("Verplaats workout", "Move workout")}
        onClick={() => openAction("move")}
      />
      <ActionRow
        icon={<Copy className="h-4 w-4" />}
        label={tx("Kopieer workout", "Copy workout")}
        onClick={() => openAction("copy")}
      />
      <ActionRow
        icon={<Trash2 className="h-4 w-4" />}
        label={tx("Verwijder workout", "Delete workout")}
        onClick={() => openAction("delete")}
        destructive
      />
    </>
  );

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={tx("Workout opties", "Workout options")}
      className={cn("h-9 w-9", triggerClassName)}
      onClick={(e) => e.stopPropagation()}
    >
      <MoreVertical className="h-4 w-4" />
    </Button>
  );

  return (
    <>
      {isMobile ? (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <SheetHeader className="text-left mb-2">
              <SheetTitle className="text-base">
                {occurrence.planName || tx("Workout", "Workout")}
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1">{items}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align={align} className="w-56">
            <DropdownMenuItem onSelect={() => openAction("move")}>
              <Move className="h-4 w-4" /> {tx("Verplaats workout", "Move workout")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openAction("copy")}>
              <Copy className="h-4 w-4" /> {tx("Kopieer workout", "Copy workout")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => openAction("delete")}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> {tx("Verwijder workout", "Delete workout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {action === "move" && (
        <DatePickerActionDialog
          title={tx("Verplaats workout", "Move workout")}
          confirmLabel={tx("Verplaats", "Move")}
          lang={lang}
          occurrence={occurrence}
          onClose={() => setAction(null)}
          onConfirm={async (date) => {
            await applyMove(clientId, occurrence, date);
            toast.success(tx("Workout verplaatst.", "Workout moved successfully."));
            onChanged();
          }}
        />
      )}
      {action === "copy" && (
        <DatePickerActionDialog
          title={tx("Kopieer workout", "Copy workout")}
          confirmLabel={tx("Kopieer", "Copy")}
          lang={lang}
          occurrence={occurrence}
          onClose={() => setAction(null)}
          onConfirm={async (date) => {
            await applyCopy(clientId, occurrence, date);
            toast.success(tx("Workout gekopieerd.", "Workout copied successfully."));
            onChanged();
          }}
        />
      )}
      {action === "delete" && (
        <DeleteActionDialog
          lang={lang}
          occurrence={occurrence}
          onClose={() => setAction(null)}
          onConfirm={async (scope) => {
            await applyDelete(clientId, occurrence, scope);
            toast.success(tx("Workout verwijderd.", "Workout deleted."));
            onChanged();
          }}
        />
      )}
    </>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full text-left px-3 py-3 rounded-lg hover:bg-accent transition-colors",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

interface DateDialogProps {
  title: string;
  confirmLabel: string;
  lang: Lang;
  occurrence: ComputedOccurrence;
  onClose: () => void;
  onConfirm: (date: string) => Promise<void>;
}

function DatePickerActionDialog({
  title,
  confirmLabel,
  lang,
  occurrence,
  onClose,
  onConfirm,
}: DateDialogProps) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const [date, setDate] = useState<Date | undefined>(() => new Date(occurrence.scheduledDate));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!date) return;
    setBusy(true);
    try {
      await onConfirm(formatDateKey(date));
      onClose();
    } catch (e: any) {
      toast.error(e?.message || tx("Actie mislukt", "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {tx("Kies een nieuwe datum.", "Choose a new date.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {date ? format(date, "PPP") : tx("Geen datum", "No date")}
          </div>
          <div className="rounded-md border">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tx("Annuleren", "Cancel")}
          </Button>
          <Button onClick={submit} disabled={!date || busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteDialogProps {
  lang: Lang;
  occurrence: ComputedOccurrence;
  onClose: () => void;
  onConfirm: (scope: Scope) => Promise<void>;
}

function DeleteActionDialog({ lang, occurrence, onClose, onConfirm }: DeleteDialogProps) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const [scope, setScope] = useState<Scope>("single");
  const [busy, setBusy] = useState(false);
  const showScope =
    occurrence.isRecurring && occurrence.origin !== "copied" && !!occurrence.assignmentId;

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(scope);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || tx("Verwijderen mislukt", "Failed to delete"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tx("Workout verwijderen", "Delete workout")}</DialogTitle>
          <DialogDescription>
            {tx(
              "Deze ingeplande training wordt uit je kalender verwijderd. Je workout-template blijft bestaan.",
              "This scheduled workout will be removed from your calendar. The workout template is preserved.",
            )}
          </DialogDescription>
        </DialogHeader>

        {showScope && (
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="gap-2">
            <Label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent">
              <RadioGroupItem value="single" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">
                  {tx("Alleen deze workout", "Only this workout")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {tx(
                    "Andere ingeplande trainingen blijven staan.",
                    "Other scheduled workouts stay in place.",
                  )}
                </span>
              </span>
            </Label>
            <Label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent">
              <RadioGroupItem value="future" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">
                  {tx("Deze en toekomstige", "This and future workouts")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {tx(
                    "Alle herhalingen vanaf deze datum worden geannuleerd.",
                    "All recurring occurrences from this date will be cancelled.",
                  )}
                </span>
              </span>
            </Label>
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tx("Annuleren", "Cancel")}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {tx("Verwijder", "Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Mutations ----------------

async function clearExistingInstanceOverrides(
  clientId: string,
  assignmentId: string,
  occurrenceIndex: number,
) {
  await db
    .from("workout_schedule_overrides")
    .delete()
    .eq("client_id", clientId)
    .eq("assignment_id", assignmentId)
    .eq("occurrence_index", occurrenceIndex)
    .in("action", ["move", "delete"]);
}

async function applyMove(
  clientId: string,
  occ: ComputedOccurrence,
  newDate: string,
) {
  // Copied instance: just update the existing copy override's date.
  if (occ.origin === "copied" && occ.overrideId) {
    const { error } = await db
      .from("workout_schedule_overrides")
      .update({ scheduled_date: newDate })
      .eq("id", occ.overrideId);
    if (error) throw error;
    return;
  }
  if (!occ.assignmentId || occ.occurrenceIndex == null) {
    throw new Error("Cannot move this workout instance.");
  }
  await clearExistingInstanceOverrides(clientId, occ.assignmentId, occ.occurrenceIndex);
  const { error } = await db.from("workout_schedule_overrides").insert({
    client_id: clientId,
    assignment_id: occ.assignmentId,
    plan_id: occ.planId,
    action: "move",
    original_date: occ.originalDate,
    scheduled_date: newDate,
    occurrence_index: occ.occurrenceIndex,
  });
  if (error) throw error;
}

async function applyCopy(
  clientId: string,
  occ: ComputedOccurrence,
  newDate: string,
) {
  const { error } = await db.from("workout_schedule_overrides").insert({
    client_id: clientId,
    assignment_id: occ.assignmentId,
    plan_id: occ.planId,
    action: "copy",
    original_date: occ.scheduledDate,
    scheduled_date: newDate,
    occurrence_index: occ.occurrenceIndex,
    source_override_id: occ.overrideId,
  });
  if (error) throw error;
}

async function applyDelete(
  clientId: string,
  occ: ComputedOccurrence,
  scope: Scope,
) {
  if (occ.origin === "copied" && occ.overrideId) {
    const { error } = await db
      .from("workout_schedule_overrides")
      .delete()
      .eq("id", occ.overrideId);
    if (error) throw error;
    return;
  }
  if (!occ.assignmentId || occ.occurrenceIndex == null) {
    throw new Error("Cannot delete this workout instance.");
  }

  if (scope === "future") {
    // Delete future instances by inserting "delete" overrides from this
    // occurrence onward. Also clear any prior move/delete for this instance.
    const { data: assignment } = await db
      .from("client_workout_assignments")
      .select("days, weeks, start_date")
      .eq("id", occ.assignmentId)
      .single();
    if (!assignment?.start_date || !assignment.weeks || !assignment.days?.length) {
      throw new Error("Assignment metadata unavailable.");
    }
    const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const start = new Date(assignment.start_date);
    start.setHours(0, 0, 0, 0);
    const totalDays = assignment.weeks * 7;
    let occurrence = 0;
    const toInsert: any[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dk = DAY_KEYS[d.getDay()];
      if (!assignment.days.includes(dk)) continue;
      occurrence++;
      if (occurrence < occ.occurrenceIndex) continue;
      toInsert.push({
        client_id: clientId,
        assignment_id: occ.assignmentId,
        plan_id: occ.planId,
        action: "delete",
        original_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        occurrence_index: occurrence,
      });
    }
    // Clear any prior move/delete overrides for those occurrences.
    await db
      .from("workout_schedule_overrides")
      .delete()
      .eq("client_id", clientId)
      .eq("assignment_id", occ.assignmentId)
      .gte("occurrence_index", occ.occurrenceIndex)
      .in("action", ["move", "delete"]);
    if (toInsert.length) {
      const { error } = await db.from("workout_schedule_overrides").insert(toInsert);
      if (error) throw error;
    }
    return;
  }

  await clearExistingInstanceOverrides(clientId, occ.assignmentId, occ.occurrenceIndex);
  const { error } = await db.from("workout_schedule_overrides").insert({
    client_id: clientId,
    assignment_id: occ.assignmentId,
    plan_id: occ.planId,
    action: "delete",
    original_date: occ.originalDate,
    occurrence_index: occ.occurrenceIndex,
  });
  if (error) throw error;
}
