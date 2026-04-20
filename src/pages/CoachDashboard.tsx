import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserPlus, Users, Mail, Loader2, Trash2 } from "lucide-react";
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

interface Invitation {
  id: string;
  email: string;
  status: string;
  accepted_user_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

const statusStyles: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  onboarding: { label: "Onboarding", className: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" },
  active: { label: "Active", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" },
  accepted: { label: "Active", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" },
};

const CoachDashboard = () => {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("invitations")
      .select("id, email, status, accepted_user_id, created_at, accepted_at")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });
    setInvitations(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const active = invitations.filter((i) => i.status === "active" || i.status === "accepted");
  const onboarding = invitations.filter((i) => i.status === "onboarding");
  const pending = invitations.filter((i) => i.status === "pending");

  const renderRow = (inv: Invitation) => {
    const style = statusStyles[inv.status] ?? statusStyles.pending;
    const clickable = !!inv.accepted_user_id && (inv.status === "onboarding" || inv.status === "active" || inv.status === "accepted");
    const subtitle =
      inv.status === "active" || inv.status === "accepted"
        ? `Joined ${inv.accepted_at ? formatDistanceToNow(new Date(inv.accepted_at), { addSuffix: true }) : ""}`
        : inv.status === "onboarding"
          ? `Signed up · awaiting onboarding`
          : `Invited ${formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}`;

    const content = (
      <Card className={`p-4 flex items-center gap-3 transition ${clickable ? "hover:bg-muted/40 cursor-pointer" : ""}`}>
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{inv.email}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge className={`flex-shrink-0 border-0 ${style.className}`}>{style.label}</Badge>
        {inv.status === "pending" && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive flex-shrink-0"
                aria-label="Delete invitation"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
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
                    const { error } = await supabase
                      .from("invitations")
                      .delete()
                      .eq("id", inv.id);
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

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-5xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {active.length} active · {onboarding.length} onboarding · {pending.length} pending
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 h-11">
          <UserPlus className="h-4 w-4" />
          Add client
        </Button>
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
      ) : (
        <div className="space-y-2">{invitations.map(renderRow)}</div>
      )}

      <InviteClientDialog open={dialogOpen} onOpenChange={setDialogOpen} onInvited={load} />
    </div>
  );
};

export default CoachDashboard;

