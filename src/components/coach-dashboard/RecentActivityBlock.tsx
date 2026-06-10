import { Link } from "react-router-dom";
import { MessageSquare, ClipboardCheck, UserCheck, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { DashboardBlock, DashboardEmpty } from "./DashboardBlock";
import type { DashboardData } from "@/lib/coachDashboard";
import { clientFullName } from "@/lib/clientName";


interface Props {
  data: DashboardData | null;
  loading: boolean;
}

type Activity = {
  key: string;
  icon: typeof ClipboardCheck;
  iconColor: string;
  iconBg: string;
  label: string;
  description: string;
  at: string;
  href: string;
};

export function RecentActivityBlock({ data, loading }: Props) {
  const items: Activity[] = [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;

  if (data) {
    const nameOf = (cid: string) => {
      const c = data.clients.find((x) => x.user_id === cid);
      return clientFullName(c);
    };


    data.checkins.forEach((c) => {
      const t = new Date(c.submitted_at).getTime();
      if (t < sevenDaysAgo) return;
      items.push({
        key: "ci-" + c.id,
        icon: ClipboardCheck,
        iconColor: "text-blue-500",
        iconBg: "bg-blue-500/10",
        label: nameOf(c.client_id),
        description: "Diende een check-in in",
        at: c.submitted_at,
        href: `/clients/${c.client_id}?tab=checkins`,
      });
    });

    data.messages.forEach((m) => {
      if (!m.published_at) return;
      const t = new Date(m.published_at).getTime();
      if (t < sevenDaysAgo) return;
      items.push({
        key: "msg-" + m.client_id + m.published_at,
        icon: Sparkles,
        iconColor: "text-purple-500",
        iconBg: "bg-purple-500/10",
        label: nameOf(m.client_id),
        description: "Startbericht gepubliceerd",
        at: m.published_at,
        href: `/clients/${m.client_id}`,
      });
    });

    data.clients.forEach((c) => {
      if (!c.onboarding_completed || !c.accepted_at) return;
      const t = new Date(c.accepted_at).getTime();
      if (t < sevenDaysAgo) return;
      items.push({
        key: "ob-" + c.user_id,
        icon: UserCheck,
        iconColor: "text-emerald-500",
        iconBg: "bg-emerald-500/10",
        label: clientFullName(c),
        description: "Onboarding afgerond",
        at: c.accepted_at,
        href: `/clients/${c.user_id}`,
      });
    });

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }

  const visible = items.slice(0, 8);

  return (
    <DashboardBlock
      title="Recent Activity"
      subtitle="Laatste 7 dagen"
      icon={<MessageSquare className="h-[18px] w-[18px]" />}
      iconBg="bg-blue-500/10"
      iconColor="text-blue-500"
      loading={loading}
    >
      {visible.length === 0 ? (
        <DashboardEmpty text="Geen recente activiteit" />
      ) : (
        <ul className="divide-y">
          {visible.map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.key}>
                <Link
                  to={it.href}
                  className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${it.iconBg}`}
                  >
                    <Icon className={`h-4 w-4 ${it.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{it.label}</span>{" "}
                      <span className="text-muted-foreground">
                        {it.description.toLowerCase()}
                      </span>
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(it.at), { addSuffix: true })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardBlock>
  );
}
