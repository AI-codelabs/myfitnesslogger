import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardBlock, DashboardEmpty } from "./DashboardBlock";
import { detectAllRisks, type DashboardData, type RiskType } from "@/lib/coachDashboard";
import { clientFullName } from "@/lib/clientName";


interface Props {
  data: DashboardData | null;
  loading: boolean;
}

const RISK_LABEL: Record<RiskType, string> = {
  negative_tone: "Negatieve toon",
  low_motivation: "Lage motivatie",
  poor_compliance: "Compliance",
  goal_mismatch: "Doel-conflict",
  missed_streak: "Gemist",
};

const RISK_TONE: Record<RiskType, string> = {
  negative_tone: "bg-destructive/10 text-destructive border-destructive/30",
  low_motivation: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  poor_compliance: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  goal_mismatch: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
  missed_streak: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
};

export function RiskAttentionBlock({ data, loading }: Props) {
  const risks = data ? detectAllRisks(data) : [];
  const visible = risks.slice(0, 6);
  const more = risks.length - visible.length;

  return (
    <DashboardBlock
      title="Client Risk & Attention"
      subtitle={
        risks.length > 0
          ? `${risks.length} client${risks.length === 1 ? "" : "en"} aandacht nodig`
          : "Iedereen lijkt op koers"
      }
      icon={<AlertTriangle className="h-[18px] w-[18px]" />}
      iconBg="bg-destructive/10"
      iconColor="text-destructive"
      loading={loading}
    >
      {risks.length === 0 ? (
        <DashboardEmpty text="Geen interventiemomenten gevonden 👍" />
      ) : (
        <ul className="divide-y">
          {visible.map(({ client, risks: rr, topSeverity }) => (
            <li key={client.user_id}>
              <Link
                to={`/clients/${client.user_id}?tab=checkins`}
                className={`flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-muted/40 transition-colors group border-l-4 ${
                  topSeverity === 3
                    ? "border-destructive"
                    : "border-amber-500"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {clientFullName(client)}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {rr.slice(0, 3).map((r, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-5 font-medium ${RISK_TONE[r.type]}`}
                      >
                        {RISK_LABEL[r.type]}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                    {rr[0].reason}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
              </Link>
            </li>
          ))}
          {more > 0 && (
            <li className="px-4 sm:px-5 py-2 text-center">
              <span className="text-xs text-muted-foreground">
                +{more} meer
              </span>
            </li>
          )}
        </ul>
      )}
    </DashboardBlock>
  );
}
