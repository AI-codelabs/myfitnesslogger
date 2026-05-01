import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Lang } from "@/lib/onboardingSchema";

const DAYS: { value: string; nl: string; en: string }[] = [
  { value: "mon", nl: "ma", en: "mon" },
  { value: "tue", nl: "di", en: "tue" },
  { value: "wed", nl: "wo", en: "wed" },
  { value: "thu", nl: "do", en: "thu" },
  { value: "fri", nl: "vr", en: "fri" },
  { value: "sat", nl: "za", en: "sat" },
  { value: "sun", nl: "zo", en: "sun" },
];

export interface ScheduleData {
  start_date: string;
  weeks: number;
  days: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefillDays?: string[] | null;
  lang: Lang;
  busy?: boolean;
  onConfirm: (data: ScheduleData) => void;
}

export function ScheduleWorkoutDialog({ open, onOpenChange, prefillDays, lang, busy, onConfirm }: Props) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [weeks, setWeeks] = useState(10);
  const [days, setDays] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setStartDate(today);
      setWeeks(10);
      setDays(prefillDays && prefillDays.length > 0 ? prefillDays : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (v: string) =>
    setDays((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));

  const canSubmit = startDate && weeks > 0 && days.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tx("Workout inplannen", "Schedule workout")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-[140px,1fr] items-center gap-4">
            <Label htmlFor="start_date">{tx("Startdatum", "Start date")}</Label>
            <Input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="max-w-[220px]"
            />
          </div>

          <div className="grid grid-cols-[140px,1fr] items-center gap-4">
            <Label htmlFor="weeks">{tx("Aantal weken", "Number of weeks")}</Label>
            <Input
              id="weeks"
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Math.max(1, parseInt(e.target.value) || 1))}
              className="max-w-[120px]"
            />
          </div>

          <div className="grid grid-cols-[140px,1fr] items-start gap-4">
            <Label className="pt-2">{tx("Selecteer dagen", "Select days")}</Label>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((d) => (
                <label
                  key={d.value}
                  className="flex flex-col items-center gap-2 cursor-pointer select-none"
                >
                  <span className="text-xs text-muted-foreground">
                    {lang === "nl" ? d.nl : d.en}
                  </span>
                  <Checkbox
                    checked={days.includes(d.value)}
                    onCheckedChange={() => toggle(d.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tx("Annuleren", "Cancel")}
          </Button>
          <Button
            onClick={() => onConfirm({ start_date: startDate, weeks, days })}
            disabled={!canSubmit || busy}
          >
            {tx("Plan", "Schedule")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
