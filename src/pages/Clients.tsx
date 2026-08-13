import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserPlus, Users, Mail, Loader2, Trash2, LayoutGrid, List } from "lucide-react";
import { InviteClientDialog } from "@/components/InviteClientDialog";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { clientFullName } from "@/lib/clientName";
import { fetchLoggedLast7Batch } from "@/lib/nutritionCompliance";
import { db } from "@/lib/db";

interface Invitation {
  id: string;
  email: string;
  status: string;
  accepted_user_id: string | null;
  created_at: string;
  accepted_at: string | null;
  coaching_end_date: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
}


type ViewMode = "list" | "grid";

const statusStyles: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  onboarding: { label: "Onboarding", className: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" },
  active: { label: "Active", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" },
  accepted: { label: "Active", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground" },
};

const Clients = () => {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [lastActive, setLastActive] = useState<Record<string, string | null>>({});
  const [logged7, setLogged7] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem("coachDashView") as ViewMode) || "list",
  );

  const setViewPersist = (v: ViewMode) => {
    setView(v);
    localStorage.setItem("coachDashView", v);
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: invs }, { data: la }] = await Promise.all([
      db
        .from("invitations")
        .select("id, email, status, accepted_user_id, created_at, accepted_at, coaching_end_date")
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_clients_last_active", { _coach_id: user.id }),
    ]);
    const baseInvs = (invs ?? []) as Invitation[];
    const acceptedIds = baseInvs.map((i) => i.accepted_user_id).filter(Boolean) as string[];
    let profileMap: Record<string, { first_name: string | null; last_name: string | null; display_name: string | null }> = {};
    if (acceptedIds.length > 0) {
      const { data: profs } = await db
        .from("profiles")
        .select("user_id, first_name, last_name, display_name")
        .in("user_id", acceptedIds);
      (profs ?? []).forEach((p: any) => {
        profileMap[p.user_id] = {
          first_name: p.first_name,
          last_name: p.last_name,
          display_name: p.display_name,
        };
      });
    }
    const merged = baseInvs.map((inv) => ({
      ...inv,
      ...(inv.accepted_user_id ? profileMap[inv.accepted_user_id] : {}),
    }));
    setInvitations(merged);
    const map: Record<string, string | null> = {};
    (la ?? []).forEach((r: any) => {
      map[r.user_id] = r.last_sign_in_at;
    });
    setLastActive(map);
    const acceptedForLogs = merged
      .filter((i) => i.accepted_user_id && (i.status === "active" || i.status === "accepted"))
      .map((i) => i.accepted_user_id as string);
    if (acceptedForLogs.length) {
      fetchLoggedLast7Batch(acceptedForLogs).then(setLogged7);
    }
    setLoading(false);
  };


  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const active = invitations.filter((i) => i.status === "active" || i.status === "accepted");
  const onboarding = invitations.filter((i) => i.status === "onboarding");
  const pending = invitations.filter((i) => i.status === "pending");

  const subtitleFor = (inv: Invitation) => {
    const la = inv.accepted_user_id ? lastActive[inv.accepted_user_id] : null;
    if (inv.status === "active" || inv.status === "accepted") {
      return la
        ? `Last active ${formatDistanceToNow(new Date(la), { addSuffix: true })}`
        : "Active · not signed in yet";
    }
    if (inv.status === "onboarding") return "Signed up · awaiting onboarding";
    if (inv.status === "inactive") return "Inactive";
    return `Invited ${formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}`;
  };

  const deleteInviteDialog = (inv: Invitation, trigger: React.ReactNode) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete invitation?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the pending invite for {inv.email}. The link in the email will stop working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              const { error } = await db.from("invitations").delete().eq("id", inv.id);
              if (error) toast.error(error.message);
              else {
                toast.success("Invitation deleted");
                load();
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const isRenewalDue = (inv: Invitation) =>
    !!inv.coaching_end_date && new Date(inv.coaching_end_date) < new Date();

  const loggedBadge = (inv: Invitation) => {
    if (!inv.accepted_user_id) return null;
    if (inv.status !== "active" && inv.status !== "accepted") return null;
    const n = logged7[inv.accepted_user_id];
    if (n === undefined) return null;
    const cls =
      n >= 5
        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200"
        : n >= 3
        ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
        : "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200";
    return (
      <Badge className={`flex-shrink-0 border-0 ${cls}`} title="Days logged in Cronometer (last 7)">
        {n}/7 logged
      </Badge>
    );
  };

  const renderRow = (inv: Invitation) => {
    const style = statusStyles[inv.status] ?? statusStyles.pending;
    const clickable = !!inv.accepted_user_id && inv.status !== "pending";
    const renewal = isRenewalDue(inv);

    const content = (
      <Card className={`p-4 flex items-center gap-3 transition ${clickable ? "hover:bg-muted/40 cursor-pointer" : ""}`}>
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{inv.accepted_user_id ? clientFullName(inv) : inv.email}</p>
          <p className="text-xs text-muted-foreground truncate">
            {inv.accepted_user_id && clientFullName(inv) !== inv.email ? `${inv.email} · ` : ""}
            {subtitleFor(inv)}
          </p>
        </div>

        {renewal && (
          <Badge className="flex-shrink-0 border-0 bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">
            Renewal due
          </Badge>
        )}
        {loggedBadge(inv)}
        <Badge className={`flex-shrink-0 border-0 ${style.className}`}>{style.label}</Badge>
        {inv.status === "pending" &&
          deleteInviteDialog(
            inv,
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive flex-shrink-0"
              aria-label="Delete invitation"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>,
          )}
      </Card>
    );

    return clickable ? (
      <Link to={`/clients/${inv.accepted_user_id}`} key={inv.id} className="block">
        {content}
      </Link>
    ) : (
      <div key={inv.id}>{content}</div>
    );
  };

  const renderCard = (inv: Invitation) => {
    const style = statusStyles[inv.status] ?? statusStyles.pending;
    const clickable = !!inv.accepted_user_id && inv.status !== "pending";
    const renewal = isRenewalDue(inv);

    const content = (
      <Card className={`p-5 flex flex-col gap-3 h-full transition ${clickable ? "hover:bg-muted/40 cursor-pointer" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Mail className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-1.5">
            {renewal && (
              <Badge className="border-0 bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">
                Renewal due
              </Badge>
            )}
            {loggedBadge(inv)}
            <Badge className={`border-0 ${style.className}`}>{style.label}</Badge>
          </div>
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{inv.accepted_user_id ? clientFullName(inv) : inv.email}</p>
          {inv.accepted_user_id && clientFullName(inv) !== inv.email && (
            <p className="text-xs text-muted-foreground truncate">{inv.email}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{subtitleFor(inv)}</p>
        </div>

        {inv.status === "pending" && (
          <div className="mt-auto pt-2" onClick={(e) => e.preventDefault()}>
            {deleteInviteDialog(
              inv,
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive -ml-2"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>,
            )}
          </div>
        )}
      </Card>
    );

    return clickable ? (
      <Link to={`/clients/${inv.accepted_user_id}`} key={inv.id} className="block h-full">
        {content}
      </Link>
    ) : (
      <div key={inv.id} className="h-full">
        {content}
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {active.length} active · {onboarding.length} onboarding · {pending.length} pending
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border p-0.5" role="group" aria-label="View mode">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 px-2.5"
              onClick={() => setViewPersist("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 px-2.5"
              onClick={() => setViewPersist("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2 h-11">
            <UserPlus className="h-4 w-4" />
            Add client
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : invitations.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
          <h3 className="font-semibold mb-1">No clients yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Invite your first client to get started.
          </p>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add client
          </Button>
        </Card>
      ) : view === "list" ? (
        <div className="space-y-2">{invitations.map(renderRow)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {invitations.map(renderCard)}
        </div>
      )}

      <InviteClientDialog open={dialogOpen} onOpenChange={setDialogOpen} onInvited={load} />
    </div>
  );
};

export default Clients;
