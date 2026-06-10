import { Link } from "react-router-dom";
import { Flame, ArrowRight, ClipboardCheck, UserPlus, Mail, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardBlock, DashboardEmpty } from "./DashboardBlock";
import type { DashboardData } from "@/lib/coachDashboard";
import { clientFullName } from "@/lib/clientName";


interface Props {
  data: DashboardData | null;
  loading: boolean;
}

type Item = {
  key: string;
  icon: typeof ClipboardCheck;
  label: string;
  detail: string;
  href: string;
  tone: "blue" | "amber" | "emerald" | "purple";
};

const toneClass: Record<Item["tone"], string> = {
  blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
  amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  purple: "text-purple-600 dark:text-purple-400 bg-purple-500/10",
};

export function ActionRequiredBlock({ data, loading }: Props) {
  const items: Item[] = [];

  if (data) {
    // 1. New check-ins this week awaiting review
    const reviewedSet = new Set(
      data.reviews
        .filter((r) => r.week_start === data.weekStart && r.published_at)
        .map((r) => r.client_id),
    );
    const newCheckins = data.checkins.filter(
      (c) => c.week_start === data.weekStart && !reviewedSet.has(c.client_id),
    );
    newCheckins.forEach((c) => {
      const cl = data.clients.find((x) => x.user_id === c.client_id);
      items.push({
        key: "ci-" + c.id,
        icon: ClipboardCheck,
        label: clientFullName(cl),
        detail: "Nieuwe check-in te beoordelen",
        href: `/clients/${c.client_id}?tab=checkins`,
        tone: "blue",
      });
    });

    // 2. Missed check-ins
    const submittedClients = new Set(
      data.checkins
        .filter((c) => c.week_start === data.weekStart)
        .map((c) => c.client_id),
    );
    data.clients
      .filter((c) => c.onboarding_completed && !submittedClients.has(c.user_id))
      .forEach((c) => {
        items.push({
          key: "miss-" + c.user_id,
          icon: AlertCircle,
          label: clientFullName(c),

          detail: "Check-in deze week nog niet ingevuld",
          href: `/clients/${c.user_id}?tab=checkins`,
          tone: "amber",
        });
      });

    // 3. Onboarding completed but no published start message
    const publishedMsgClients = new Set(
      data.messages.filter((m) => m.published_at).map((m) => m.client_id),
    );
    data.clients
      .filter(
        (c) => c.onboarding_completed && !publishedMsgClients.has(c.user_id),
      )
      .forEach((c) => {
        items.push({
          key: "ob-" + c.user_id,
          icon: UserPlus,
          label: clientFullName(c),
          detail: "Startbericht nog niet gepubliceerd",
          href: `/clients/${c.user_id}`,
          tone: "purple",
        });
      });

    // 4. Pending invites
    data.pendingInvites.forEach((inv) => {
      items.push({
        key: "inv-" + inv.id,
        icon: Mail,
        label: inv.email,
        detail: "Uitnodiging in afwachting",
        href: "/clients",
        tone: "emerald",
      });
    });
  }

  const visible = items.slice(0, 6);
  const more = items.length - visible.length;

  return (
    <DashboardBlock
      title="Action Required"
      subtitle={items.length > 0 ? `${items.length} taken` : "Alles up-to-date"}
      icon={<Flame className="h-[18px] w-[18px]" />}
      iconBg="bg-orange-500/10"
      iconColor="text-orange-500"
      loading={loading}
    >
      {items.length === 0 ? (
        <DashboardEmpty text="Geen openstaande acties 🎉" />
      ) : (
        <ul className="divide-y">
          {visible.map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.key}>
                <Link
                  to={it.href}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-muted/40 transition-colors group"
                >
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${toneClass[it.tone]}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {it.detail}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              </li>
            );
          })}
          {more > 0 && (
            <li className="px-4 sm:px-5 py-2 text-center">
              <Link
                to="/coach-tasks"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                +{more} meer · bekijk alle taken
              </Link>
            </li>
          )}
        </ul>
      )}
    </DashboardBlock>
  );
}
