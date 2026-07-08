import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";
import { ActionRequiredBlock } from "@/components/coach-dashboard/ActionRequiredBlock";
import { RiskAttentionBlock } from "@/components/coach-dashboard/RiskAttentionBlock";
import { RecentActivityBlock } from "@/components/coach-dashboard/RecentActivityBlock";
import { OverviewStatsBlock } from "@/components/coach-dashboard/OverviewStatsBlock";
import { EndingSoonBlock } from "@/components/coach-dashboard/EndingSoonBlock";
import { DashboardNotifications } from "@/components/DashboardNotifications";
import { useCoachDashboardData } from "@/lib/coachDashboard";
import { ClientHomeView } from "@/components/client-home/ClientHomeView";
import { useState } from "react";
import { Lang } from "@/lib/onboardingSchema";

const copy = {
  dashboard: { nl: "Dashboard", en: "Dashboard" },
  coachSubtitle: {
    nl: "Statistieken en inzichten van je klanten.",
    en: "Stats and insights across your clients.",
  },
  clientSubtitle: {
    nl: "Snelle toegang tot je dagelijkse essentials.",
    en: "Quick access to your daily essentials.",
  },
  comingSoon: { nl: "Binnenkort beschikbaar", en: "Coming soon" },
  training: { nl: "Training", en: "Training" },
  trainingDesc: {
    nl: "Workouts loggen en je schema bekijken",
    en: "Log workouts and view your plan",
  },
  nutrition: { nl: "Voeding", en: "Nutrition" },
  nutritionDesc: { nl: "Maaltijden en macro's bijhouden", en: "Track meals and macros" },
  clientOverview: { nl: "Klantoverzicht", en: "Client overview" },
  clientOverviewDesc: {
    nl: "Actief, onboarding en in afwachting over tijd.",
    en: "Active, onboarding and pending counts over time.",
  },
  engagement: { nl: "Betrokkenheid", en: "Engagement" },
  engagementDesc: {
    nl: "Logins en activiteitstrends per week.",
    en: "Logins and activity trends per week.",
  },
  progress: { nl: "Voortgang", en: "Progress" },
  progressDesc: {
    nl: "Geaggregeerde voortgangsstatistieken van klanten.",
    en: "Aggregated client progress metrics.",
  },
};

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border h-8 p-0.5">
      {(["nl", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => {
            setLang(l);
            localStorage.setItem("onbLang", l);
          }}
          className={`h-full px-2.5 text-xs rounded-sm flex items-center ${
            lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const Index = () => {
  const { role, loading } = useAuth();
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("onbLang") as Lang) || "nl",
  );
  const tx = (b: { nl: string; en: string }) => b[lang];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (role === "coach") {
    return <CoachDashboard lang={lang} setLang={setLang} tx={tx} />;
  }

  // Client dashboard — new home experience
  return (
    <AppLayout>
      <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-3xl mx-auto w-full">
        <div className="mb-4 flex justify-end">
          <LangToggle lang={lang} setLang={setLang} />
        </div>
        <ClientHomeView lang={lang} />
      </div>
    </AppLayout>
  );
};

function CoachDashboard({
  lang,
  setLang,
  tx,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  tx: (b: { nl: string; en: string }) => string;
}) {
  const { user } = useAuth();
  const { data, loading } = useCoachDashboardData(user?.id);

  return (
    <AppLayout>
      <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-6xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {tx(copy.dashboard)}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tx(copy.coachSubtitle)}
            </p>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ActionRequiredBlock data={data} loading={loading} />
            <RiskAttentionBlock data={data} loading={loading} />
            <RecentActivityBlock data={data} loading={loading} />
            <OverviewStatsBlock data={data} loading={loading} />
          </div>

          <EndingSoonBlock data={data} loading={loading} />

          <DashboardNotifications />
        </div>
      </div>
    </AppLayout>
  );
}

export default Index;
