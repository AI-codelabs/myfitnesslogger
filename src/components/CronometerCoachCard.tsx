import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Send, Trash2, Plug, AlertCircle, Target, CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import type { Lang } from "@/lib/onboardingSchema";
import {
  getCronometerLink,
  inviteCronometerClient,
  removeCronometerClient,
  refreshCronometerStatus,
  syncCronometerClient,
  type CronometerClientLink,
} from "@/lib/cronometerPro";
import {
  getCronometerWebStatus,
  disconnectCronometerWeb,
  pushCronometerTargets,
  type CronoWebStatus,
} from "@/lib/cronometerTargetsWeb";
import { CronometerTargetSyncDialog } from "./CronometerTargetSyncDialog";

interface Props {
  coachId: string;
  clientId: string;
  clientEmail: string | null | undefined;
  clientName?: string | null;
  lang: Lang;
}

const t = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

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
  const [busy, setBusy] = useState<null | "invite" | "sync" | "refresh" | "remove" | "push" | "disconnect_web">(null);
  const [webStatus, setWebStatus] = useState<CronoWebStatus | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

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

  const handlePushTargets = async (force = false) => {
    setBusy("push");
    const res = await pushCronometerTargets(clientId, force);
    setBusy(null);
    if (res.error) return toast.error(res.error);
    if ((res.data as any)?.skipped === "unchanged") {
      toast.info(t(lang, "Doelen zijn al gesynchroniseerd", "Targets are already in sync"));
    } else {
      toast.success(t(lang, "Doelen naar Cronometer verzonden", "Targets pushed to Cronometer"));
    }
    load();
  };

  const handleDisconnectWeb = async () => {
    if (!window.confirm(t(lang, "Doel-sync loskoppelen?", "Disconnect target sync?"))) return;
    setBusy("disconnect_web");
    const res = await disconnectCronometerWeb(clientId);
    setBusy(null);
    if (res.error) return toast.error(res.error);
    toast.success(t(lang, "Losgekoppeld", "Disconnected"));
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
    </Card>
  );
}
