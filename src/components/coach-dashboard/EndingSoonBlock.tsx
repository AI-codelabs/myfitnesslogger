import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardBlock, DashboardEmpty } from "./DashboardBlock";
import type { DashboardData, DashClient } from "@/lib/coachDashboard";
import { Button } from "@/components/ui/button";
import { clientFullName } from "@/lib/clientName";


interface Props {
  data: DashboardData | null;
  loading: boolean;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function EndingSoonBlock({ data, loading }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const ending = useMemo<DashClient[]>(() => {
    if (!data) return [];
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    return data.clients
      .filter((c) => {
        if (!c.coaching_end_date) return false;
        if (c.invitation_status === "inactive") return false;
        const d = new Date(c.coaching_end_date);
        return d >= monthStart && d <= monthEnd;
      })
      .sort((a, b) =>
        (a.coaching_end_date ?? "").localeCompare(b.coaching_end_date ?? ""),
      );
  }, [data]);

  const monthLabel = new Date().toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });

  return (
    <DashboardBlock
      title="Aflopende coaching"
      subtitle={`Eindigen in ${monthLabel}`}
      icon={<CalendarClock className="h-[18px] w-[18px]" />}
      iconBg="bg-orange-500/10"
      iconColor="text-orange-500"
      loading={loading}
    >
      {ending.length === 0 ? (
        <DashboardEmpty text="Niemand eindigt deze maand." />
      ) : (
        <div className="p-4 sm:p-5 space-y-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:bg-muted/40 transition text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-md bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold text-lg shrink-0">
                {ending.length}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {ending.length === 1
                    ? "1 client eindigt deze maand"
                    : `${ending.length} clients eindigen deze maand`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Tik om {open ? "te verbergen" : "te tonen"}
                </p>
              </div>
            </div>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>

          {open && (
            <ul className="divide-y divide-border rounded-lg border">
              {ending.map((c) => {
                const days = c.coaching_end_date
                  ? daysUntil(c.coaching_end_date)
                  : null;
                const past = days != null && days < 0;
                const soon = days != null && days >= 0 && days <= 7;
                return (
                  <li key={c.user_id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/clients/${c.user_id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {clientFullName(c)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.coaching_end_date
                            ? new Date(c.coaching_end_date).toLocaleDateString(
                                "nl-NL",
                                { day: "2-digit", month: "short", year: "numeric" },
                              )
                            : "—"}
                          {days != null && (
                            <span
                              className={
                                past
                                  ? " text-destructive font-medium"
                                  : soon
                                    ? " text-orange-500 font-medium"
                                    : ""
                              }
                            >
                              {" · "}
                              {past
                                ? `${Math.abs(days)} dgn geleden`
                                : days === 0
                                  ? "vandaag"
                                  : `over ${days} dgn`}
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-8 shrink-0"
                        tabIndex={-1}
                      >
                        Bekijk
                      </Button>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </DashboardBlock>
  );
}
