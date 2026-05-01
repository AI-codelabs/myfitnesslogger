import { BarChart3, Users, UserPlus, Hourglass, CheckCircle2 } from "lucide-react";
import { DashboardBlock } from "./DashboardBlock";
import type { DashboardData } from "@/lib/coachDashboard";

interface Props {
  data: DashboardData | null;
  loading: boolean;
}

export function OverviewStatsBlock({ data, loading }: Props) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;

  let active = 0;
  let newThisWeek = 0;
  let onboarding = 0;
  let completionPct: number | null = null;

  if (data) {
    const activeClients = data.clients.filter(
      (c) => c.onboarding_completed && c.invitation_status !== "inactive",
    );
    active = activeClients.length;
    onboarding = data.clients.filter((c) => !c.onboarding_completed).length +
      data.pendingInvites.length;
    newThisWeek = data.clients.filter(
      (c) => c.accepted_at && new Date(c.accepted_at).getTime() >= sevenDaysAgo,
    ).length;

    if (active > 0) {
      const submitted = new Set(
        data.checkins
          .filter((c) => c.week_start === data.weekStart)
          .map((c) => c.client_id),
      );
      const submittedCount = activeClients.filter((c) =>
        submitted.has(c.user_id),
      ).length;
      completionPct = Math.round((submittedCount / active) * 100);
    }
  }

  const tiles = [
    {
      label: "Actieve clients",
      value: active,
      icon: Users,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Nieuw deze week",
      value: newThisWeek,
      icon: UserPlus,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "In onboarding",
      value: onboarding,
      icon: Hourglass,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Check-in rate",
      value: completionPct == null ? "—" : `${completionPct}%`,
      icon: CheckCircle2,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <DashboardBlock
      title="Overview"
      subtitle="Je business in één oogopslag"
      icon={<BarChart3 className="h-4.5 w-4.5" />}
      iconBg="bg-purple-500/10"
      iconColor="text-purple-500"
      loading={loading}
    >
      <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="rounded-lg border bg-card p-3 flex flex-col gap-2"
            >
              <div
                className={`w-8 h-8 rounded-md flex items-center justify-center ${t.bg}`}
              >
                <Icon className={`h-4 w-4 ${t.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{t.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardBlock>
  );
}
