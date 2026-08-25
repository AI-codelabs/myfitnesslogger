import { Card } from "@/components/ui/card";
import { Flame, Apple } from "lucide-react";
import { Lang } from "@/lib/onboardingSchema";
import { cn } from "@/lib/utils";
import { buildHeatmap } from "@/lib/nutritionCompliance";
import { useClientHome } from "@/lib/clientHome";

const tx = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

export function ComplianceCard({ lang }: { lang: Lang }) {
  const { data, loading } = useClientHome();
  if (loading || !data) return null;

  const stats = data.compliance;
  // Hide entirely if the client has never logged — avoids empty noise pre-connection.
  if (stats.loggedLast30 === 0 && stats.currentStreak === 0) return null;

  const heat = buildHeatmap(stats.daysSet, 30);

  return (
    <section className="mb-6">
      <h3 className="text-lg font-bold mb-3">
        {tx(lang, "Voedings-consistentie", "Nutrition consistency")}
      </h3>
      <Card className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-11 h-11 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
            <Flame className="h-5 w-5 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight">
              {stats.currentStreak > 0
                ? tx(
                    lang,
                    `${stats.currentStreak} dagen streak 🔥`,
                    `${stats.currentStreak}-day streak 🔥`,
                  )
                : tx(lang, "Start je streak vandaag", "Start your streak today")}
            </p>
            <p className="text-sm text-muted-foreground">
              {tx(
                lang,
                `${stats.loggedLast7}/7 dagen gelogd deze week · ${stats.loggedLast30}/30 laatste maand`,
                `${stats.loggedLast7}/7 days logged this week · ${stats.loggedLast30}/30 last month`,
              )}
            </p>
          </div>
          <Apple className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px]">
          {heat.map((d) => (
            <div
              key={d.date}
              title={d.date}
              className={cn(
                "aspect-square rounded-[3px]",
                d.logged ? "bg-emerald-500" : "bg-muted",
              )}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {tx(lang, "Laatste 30 dagen", "Last 30 days")}
        </p>
      </Card>
    </section>
  );
}
