import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listDerivedClientPlans, syncPlanContent, type DerivedClientPlan } from "@/lib/planPropagation";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  planId: string | null;
  planName: string;
};

export function PushTemplateUpdatesDialog({ open, onOpenChange, planId, planName }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DerivedClientPlan[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    if (!open || !planId) return;
    setLoading(true);
    listDerivedClientPlans(planId)
      .then((r) => {
        setRows(r);
        setSelected({});
      })
      .catch((e: any) => toast.error(e?.message ?? "Could not load clients"))
      .finally(() => setLoading(false));
  }, [open, planId]);

  const copies = rows.filter((r) => !r.live);
  const live = rows.filter((r) => r.live);
  const chosen = copies.filter((r) => selected[r.assignmentId]);

  const push = async () => {
    if (!planId || chosen.length === 0) return;
    setPushing(true);
    let ok = 0;
    for (const row of chosen) {
      try {
        await syncPlanContent(planId, row.planId);
        ok++;
      } catch (e: any) {
        toast.error(`${row.clientName}: ${e?.message ?? "sync failed"}`);
      }
    }
    setPushing(false);
    if (ok > 0) toast.success(`Updates pushed to ${ok} client${ok === 1 ? "" : "s"}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Push updates to clients?</DialogTitle>
          <DialogDescription>
            These clients use “{planName}”. Select who should receive the updated version of this
            plan. Their personal copy will be overwritten with the current template content.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No clients are using this plan yet, so there is nothing to push.
          </p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {copies.length > 0 && (
              <div className="space-y-2">
                {copies.map((r) => (
                  <label
                    key={r.assignmentId}
                    className="flex items-center gap-3 rounded-md border p-3 cursor-pointer"
                  >
                    <Checkbox
                      checked={!!selected[r.assignmentId]}
                      onCheckedChange={(v) =>
                        setSelected((s) => ({ ...s, [r.assignmentId]: !!v }))
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.clientName}</p>
                      {r.planName && (
                        <p className="text-xs text-muted-foreground truncate">{r.planName}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {live.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Already up to date
                </p>
                {live.map((r) => (
                  <div key={r.assignmentId} className="flex items-center gap-2 text-sm">
                    <span className="truncate">{r.clientName}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      live link
                    </Badge>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground pt-1">
                  These clients are linked directly to this plan and already see the changes.
                </p>
              </div>
            )}

            {copies.length > 0 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setSelected(Object.fromEntries(copies.map((r) => [r.assignmentId, true])))
                  }
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelected({})}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pushing}>
            Don't push
          </Button>
          <Button onClick={push} disabled={pushing || chosen.length === 0}>
            {pushing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Push to {chosen.length} client{chosen.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
