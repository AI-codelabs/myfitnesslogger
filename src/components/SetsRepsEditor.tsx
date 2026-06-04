import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_REST,
  parseSetsReps,
  serializeSetsReps,
  type SetSpec,
} from "@/lib/setsReps";
import { useEffect, useState } from "react";

type Props = {
  value: string | null;
  onChange: (next: string | null) => void; // fired on every edit (local state)
  onCommit: (next: string | null) => void; // fired on blur / structural change
};

export const SetsRepsEditor = ({ value, onChange, onCommit }: Props) => {
  // Local mirror so typing feels instant; sync from prop when it changes externally.
  const [sets, setSets] = useState<SetSpec[]>(() => {
    const parsed = parseSetsReps(value);
    return parsed.length ? parsed : [{ reps: "", rest: DEFAULT_REST }];
  });

  useEffect(() => {
    const parsed = parseSetsReps(value);
    const next = parsed.length ? parsed : [{ reps: "", rest: DEFAULT_REST }];
    // Avoid clobbering local edits if serialized form already matches
    if (serializeSetsReps(next) !== serializeSetsReps(sets)) {
      setSets(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (next: SetSpec[], commit: boolean) => {
    setSets(next);
    const str = next.length ? serializeSetsReps(next) : null;
    onChange(str);
    if (commit) onCommit(str);
  };

  const updateRow = (i: number, patch: Partial<SetSpec>) => {
    const next = sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    emit(next, false);
  };

  const commitRow = (i: number) => {
    const str = sets.length ? serializeSetsReps(sets) : null;
    onCommit(str);
  };

  const addRow = () => {
    const last = sets[sets.length - 1];
    const next = [
      ...sets,
      { reps: last?.reps ?? "", rest: last?.rest ?? DEFAULT_REST },
    ];
    emit(next, true);
  };

  const removeRow = (i: number) => {
    const next = sets.filter((_, idx) => idx !== i);
    emit(next, true);
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 px-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Set · Reps</span>
        <span>Rust (s)</span>
        <span className="sr-only">Actions</span>
      </div>
      {sets.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
          <Input
            value={s.reps}
            onChange={(e) => updateRow(i, { reps: e.target.value })}
            onBlur={() => commitRow(i)}
            placeholder={`Set ${i + 1} (bv. 6-8)`}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={Number.isFinite(s.rest) ? s.rest : DEFAULT_REST}
            onChange={(e) =>
              updateRow(i, {
                rest: e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0),
              })
            }
            onBlur={() => commitRow(i)}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => removeRow(i)}
            disabled={sets.length <= 1}
            aria-label={`Remove set ${i + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-primary hover:text-primary"
        onClick={addRow}
      >
        <Plus className="h-3.5 w-3.5" />
        Set toevoegen
      </Button>
    </div>
  );
};
