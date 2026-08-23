import { useEffect, useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Send, Trash2, Plug, AlertCircle, Target, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { Lang } from "@/lib/onboardingSchema";
import {
  getCronometerLink,
  ensureCronometerInvite,
  inviteCronometerClient,
  removeCronometerClient,
  refreshCronometerStatus,
  syncCronometerClient,
  type CronometerClientLink,
} from "@/lib/cronometerPro";
import {
  getCronometerWebStatus,
  pushCronometerTargets,
  type CronoWebStatus,
} from "@/lib/cronometerTargetsWeb";

interface Props {
  coachId: string;
  clientId: string;
  clientEmail: string | null | undefined;
  clientName?: string | null;
  lang: Lang;
}

const t = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

const fmtTargets = (v: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }) =>
  `${v.calories ?? "—"} kcal · ${v.protein_g ?? "—"}P / ${v.carbs_g ?? "—"}C / ${v.fat_g ?? "—"}F`;

const statusColor = (s: CronometerClientLink["status"]) => {
  switch (s) {
    case "active": return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
    case "pending": return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    case "error": return "bg-destructive/10 text-destructive border-destructive/30";
    case "revoked": return "bg-muted text-muted-foreground";
  }
};

export function CronometerCoachCard({ coachId, clientId, clientEmail, clientName, lang }: Props) {
  const [link, setLink] = useState<CronometerClientLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "invite" | "sync" | "refresh" | "remove" | "push">(null);
  const [webStatus, setWebStatus] = useState<CronoWebStatus | null>(null);
  const autoInviteAttempted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [linkRow, statusRes] = await Promise.all([
      getCronometerLink(coachId, clientId),
      getCronometerWebStatus(clientId),
    ]);
    setLink(linkRow);
    setWebStatus(statusRes.data ?? { connected: false });
    setLoading(false);
  }, [coachId, clientId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading || link || !clientEmail || autoInviteAttempted.current) return;
    autoInviteAttempted.current = true;
    void ensureCronometerInvite({
      coachId,
      client_id: clientId,
      email: clientEmail,
      name: clientName ?? undefined,
    }).then((res) => {
      if (res.data?.invited) {
        toast.info(t(lang,
          "Cronometer-uitnodiging automatisch verstuurd",
          "Cronometer invite sent automatically",
        ));
        load();
      }
    });
  }, [loading, link, clientEmail, coachId, clientId, clientName, lang, load]);

  const handlePushTargets = async (force = false) => {
    setBusy("push");
    const res = await pushCronometerTargets(clientId, force);
    setBusy(null);
    if (res.error) return toast.error(res.error);
    if ((res.data as any)?.skipped === "unchanged") {
      toast.info(t(lang, "Doelen zijn al gesynchroniseerd", "Targets are already in sync"));
    } else if ((res.data as any)?.verified === false) {
      toast.error(t(lang,
        "Push verstuurd, maar Cronometer toont nog andere doelen (coach-doelen in Cronometer Pro overschrijven dit).",
        "Push sent, but Cronometer still shows different targets (coach targets in Cronometer Pro override it).",
      ));
    } else {
      toast.success(t(lang, "Doelen naar Cronometer verzonden", "Targets pushed to Cronometer"));
    }
    load();
  };




  const handleInvite = async () => {
    if (!clientEmail) {
      toast.error(t(lang, "Client heeft geen e-mailadres", "Client has no email address"));
      return;
    }
    setBusy("invite");
    const res = await inviteCronometerClient({
      client_id: clientId,
      email: clientEmail,
      name: clientName ?? undefined,
    });
    setBusy(null);
    if (res.error) return toast.error(res.error);
    toast.success(t(lang, "Uitnodiging verstuurd via Cronometer", "Invite sent via Cronometer"));
    load();
  };

  const handleSync = async () => {
    setBusy("sync");
    const res = await syncCronometerClient(clientId);
    setBusy(null);
    if (res.error) return toast.error(res.error);
    toast.success(
      t(lang,
        `Gesynchroniseerd: ${res.data?.days_synced ?? 0} dag(en)`,
        `Synced ${res.data?.days_synced ?? 0} day(s)`,
      ),
    );
    load();
  };

  const handleRefresh = async () => {
    setBusy("refresh");
    const res = await refreshCronometerStatus();
    setBusy(null);
    if (res.error) return toast.error(res.error);
    toast.success(t(lang, "Status bijgewerkt", "Status refreshed"));
    load();
  };

  const handleRemove = async () => {
    if (!window.confirm(t(lang, "Cronometer-koppeling verwijderen?", "Remove Cronometer link?"))) return;
    setBusy("remove");
    const res = await removeCronometerClient(clientId);
    setBusy(null);
    if (res.error) return toast.error(res.error);
    toast.success(t(lang, "Verwijderd", "Removed"));
    load();
  };

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t(lang, "Cronometer laden…", "Loading Cronometer…")}
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium flex items-center gap-2">
              Cronometer
              {link && (
                <Badge variant="outline" className={statusColor(link.status)}>
                  {link.status}
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {!link && t(lang,
                "Nodig deze client uit om hun Cronometer-account te koppelen.",
                "Invite this client to link their Cronometer account.",
              )}
              {link?.status === "pending" && t(lang,
                "Uitnodiging verstuurd. Wacht tot de client accepteert in Cronometer.",
                "Invite sent. Waiting for the client to accept in Cronometer.",
              )}
              {link?.status === "active" && (
                <>
                  {t(lang, "Laatst gesynchroniseerd", "Last synced")}:{" "}
                  {link.last_synced_at ? new Date(link.last_synced_at).toLocaleString() : "—"}
                </>
              )}
              {link?.status === "revoked" && t(lang,
                "Client heeft de koppeling ingetrokken.",
                "Client revoked the link.",
              )}
              {link?.status === "error" && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {link.last_error || "error"}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!link || link.status === "revoked" ? (
          <Button size="sm" onClick={handleInvite} disabled={busy === "invite"}>
            {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            {t(lang, "Uitnodigen", "Send invite")}
          </Button>
        ) : (
          <>
            {link.status === "pending" && (
              <Button size="sm" variant="outline" onClick={handleRefresh} disabled={busy === "refresh"}>
                {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {t(lang, "Status verversen", "Refresh status")}
              </Button>
            )}
            <Button size="sm" onClick={handleSync} disabled={busy === "sync"}>
              {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {t(lang, "Nu synchroniseren", "Sync now")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleInvite} disabled={busy === "invite"}>
              {t(lang, "Opnieuw uitnodigen", "Re-invite")}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleRemove} disabled={busy === "remove"}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t(lang, "Verwijderen", "Remove")}
            </Button>
          </>
        )}
      </div>

      {/* ─── Target sync (coach Pro session) ─── */}
      <div className="pt-3 border-t space-y-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">{t(lang, "Doel-sync naar Cronometer", "Target sync to Cronometer")}</p>
          {webStatus?.connected && webStatus.status === "active" && (
            <Badge
              variant="outline"
              className={
                webStatus.verified === false
                  ? "bg-destructive/10 text-destructive border-destructive/30"
                  : "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
              }
            >
              {webStatus.verified === false
                ? <><AlertCircle className="h-3 w-3 mr-1" />{t(lang, "Niet in sync", "Not in sync")}</>
                : webStatus.in_sync
                  ? <><CheckCircle2 className="h-3 w-3 mr-1" />{t(lang, "In sync", "In sync")}</>
                  : t(lang, "Verbonden", "Connected")}
            </Badge>
          )}
          {webStatus?.status === "error" && (
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
              <AlertCircle className="h-3 w-3 mr-1" />{t(lang, "Fout", "Error")}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {!webStatus?.connected && t(lang,
            "Nodig de client uit in Cronometer Pro; daarna pushen we de doelen automatisch vanuit het coach-account.",
            "Invite the client in Cronometer Pro; after that we push targets automatically from the coach account.",
          )}
          {webStatus?.connected && t(lang,
            "Doelen worden vanuit het Pro coach-account gepusht. De client hoeft niets te doen.",
            "Targets are pushed from the Pro coach account. The client doesn't need to do anything.",
          )}{" "}
          {webStatus?.connected && webStatus.last_push_at && (
            <>{t(lang, "Laatste push", "Last push")}: {new Date(webStatus.last_push_at).toLocaleString()}</>
          )}
          {webStatus?.last_error && (
            <span className="block text-destructive mt-1">{webStatus.last_error}</span>
          )}
        </p>

        {webStatus?.remote_targets && webStatus.app_targets && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
            <p className="font-medium">
              {t(lang, "Doelen vergelijken", "Target comparison")}
            </p>
            <p className="text-muted-foreground">
              {t(lang, "In de app", "In the app")}: {fmtTargets(webStatus.app_targets)}
            </p>
            <p className={webStatus.verified === false ? "text-destructive" : "text-muted-foreground"}>
              {t(lang, "In Cronometer", "In Cronometer")}: {fmtTargets(webStatus.remote_targets)}
            </p>
            {webStatus.verified === false && (
              <p className="text-destructive">
                {t(lang,
                  "Cronometer toont andere doelen. Deze client heeft coach-doelen die in Cronometer Pro zijn ingesteld; die overschrijven de gepushte waarden. Pas ze aan in Cronometer Pro (Clients → client → Targets) of verwijder de coach-doelen zodat de push wél doorkomt.",
                  "Cronometer is showing different targets. This client has coach-assigned targets set in Cronometer Pro, which override the pushed values. Update them in Cronometer Pro (Clients → client → Targets), or clear the coach targets so the pushed values take effect.",
                )}
              </p>
            )}
          </div>
        )}
        {(webStatus?.connected || webStatus?.coach_push) && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => handlePushTargets(true)} disabled={busy === "push"}>
              {busy === "push" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {t(lang, "Nu pushen", "Push now")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}


