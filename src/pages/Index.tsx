import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Loader2, Dumbbell, Apple, ArrowRight } from "lucide-react";
import { ActionRequiredBlock } from "@/components/coach-dashboard/ActionRequiredBlock";
import { RiskAttentionBlock } from "@/components/coach-dashboard/RiskAttentionBlock";
import { RecentActivityBlock } from "@/components/coach-dashboard/RecentActivityBlock";
import { OverviewStatsBlock } from "@/components/coach-dashboard/OverviewStatsBlock";
import { EndingSoonBlock } from "@/components/coach-dashboard/EndingSoonBlock";
import { DashboardNotifications } from "@/components/DashboardNotifications";
import { useCoachDashboardData } from "@/lib/coachDashboard";
import { ClientStartMessageCard } from "@/components/ClientStartMessageCard";
import { WeeklyCheckinCard } from "@/components/WeeklyCheckinCard";
import { ProgressionSummary } from "@/components/ProgressionSummary";
import { CronometerConnectDialog } from "@/components/CronometerConnectDialog";
import { hasCronometerSession } from "@/lib/cronometer";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
  const { role, loading, user, onboardingComplete } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("onbLang") as Lang) || "nl",
  );
  const [showCronometerDialog, setShowCronometerDialog] = useState(false);
  const tx = (b: { nl: string; en: string }) => b[lang];

  // Auto-prompt clients to connect Cronometer once after onboarding
  useEffect(() => {
    if (role !== "user" || !user?.id || !onboardingComplete) return;
    const dismissedKey = `cron_prompt_dismissed_${user.id}`;
    if (localStorage.getItem(dismissedKey)) return;
    let cancelled = false;
    hasCronometerSession(user.id).then((has) => {
      if (cancelled) return;
      if (!has) setShowCronometerDialog(true);
    });
    return () => { cancelled = true; };
  }, [role, user?.id, onboardingComplete]);

  const handleDialogChange = (open: boolean) => {
    setShowCronometerDialog(open);
    if (!open && user?.id) {
      localStorage.setItem(`cron_prompt_dismissed_${user.id}`, "1");
    }
  };


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

  // Client dashboard with quick-action cards
  return (
    <AppLayout>
      <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-5xl mx-auto w-full">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {tx(copy.dashboard)}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{tx(copy.clientSubtitle)}</p>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        <WeeklyCheckinCard lang={lang} />
        <ClientStartMessageCard lang={lang} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Card
            className="p-6 flex items-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors group"
            onClick={() => navigate("/training")}
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Dumbbell className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{tx(copy.training)}</p>
              <p className="text-sm text-muted-foreground">{tx(copy.trainingDesc)}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </Card>

          <Card
            className="p-6 flex items-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors group"
            onClick={() => navigate("/nutrition")}
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Apple className="h-6 w-6 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{tx(copy.nutrition)}</p>
              <p className="text-sm text-muted-foreground">{tx(copy.nutritionDesc)}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-500 transition-colors shrink-0" />
          </Card>
        </div>

        <ProgressionSummary lang={lang} />
      </div>
      <CronometerConnectDialog
        open={showCronometerDialog}
        onOpenChange={handleDialogChange}
        lang={lang}
      />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActionRequiredBlock data={data} loading={loading} />
          <RiskAttentionBlock data={data} loading={loading} />
          <RecentActivityBlock data={data} loading={loading} />
          <OverviewStatsBlock data={data} loading={loading} />
          <div className="lg:col-span-2">
            <EndingSoonBlock data={data} loading={loading} />
          </div>
        </div>

        <DashboardNotifications />
      </div>
    </AppLayout>
  );
}

export default Index;
